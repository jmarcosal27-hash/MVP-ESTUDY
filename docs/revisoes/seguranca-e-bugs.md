# Revisão de segurança e bugs (Agente A)

Escopo: somente leitura. Branch `claude/clever-meitner-98dao2`. `node --test tests/*.test.js`: **92/92 passam**.
Reproduções em scripts fora do repositório (`D:\Projetos\qa-scratch-A\repro1.js` e `repro2.js`, servidor com API simulada e chave **falsa**).
O arquivo `.env` **não foi aberto** em nenhum momento.

## Resumo

| Gravidade | Qtde |
|---|---|
| CRÍTICO | 0 |
| ALTO | 1 |
| MÉDIO | 5 |
| BAIXO | 4 |

Os 3 piores:
1. **ALTO** — O chat grava campos sem validação (`id`, `deadline`, `remainingMin`, `questions`, `hits`) que o `app.js` injeta sem `esc()` em `innerHTML`. Isso abre um caminho de XSS armazenado via prompt injection, sem confirmação do usuário.
2. **MÉDIO** — `load()` cai em estado vazio diante de qualquer dado corrompido, e o próximo `save()` apaga os dados reais. Blocos sem `config` também derrubam o render.
3. **MÉDIO** — Valores sem tipo/formato (`remainingMin` texto ou negativo, `2026-02-31`, `12:75`) corrompem a capacidade ou criam blocos invisíveis.

Legenda: **[confirmado]** = reproduzido por script; **[não confirmado]** = hipótese pelo código.

---

## ALTO

### A1. XSS armazenado via comandos do chat (prompt injection → HTML sem escape) — [confirmado na gravação; execução no navegador não testada]
- **Onde:** `js/commands.js:174-210` (`cmdCreate` espalha `...raw` do modelo), `:14-15` e `:212-220` (`UPDATABLE` inclui `remainingMin`, `notes`, `studied`, `pdf`…), `:143-171` (`modify` não valida tipos). Saídas sem escape em `js/app.js:186` (`data-id="${b.id}"`, renderizado no calendário), `:264` (`value="${v.deadline}"`), `:266` (`value="${v.remainingMin}"`), `:279-280` (`v.questions`, `v.hits`), `:591` (`data-open-block="${b.id}"`).
- **Reprodução:** `create_block` com `{subject, title, date, start, estimated, id: 'x" onmouseover="alert(2)', deadline: '"><img src=x onerror=alert(1)>', questions: '<b>q'}` → `plan().status === 'ready'` → `applyChanges` aplica (1 aplicado, 0 falhas), sem tela de confirmação. `update_block` com `changes: {remainingMin: '"><svg onload=alert(3)>'}` também é aplicado direto.
- **Como o modelo é induzido:** o `context` enviado ao modelo contém `subject`/`title` dos blocos; texto malicioso colado nesses campos (ou numa mensagem) pode induzir a chamada da ferramenta. Pedidos de um único bloco (criar, editar, mover sem conflito, concluir, reabrir, +pomodoro) executam sem confirmação (`commands.js:443`).
- **Impacto:** JS no origin do app: lê/apaga o `localStorage` (todos os estudos) e pode chamar `/api/chat` para gastar a chave. O JS não lê a chave, que fica só no servidor.
- **Correção sugerida:**
  - Em `cmdCreate`, montar o bloco só com campos conhecidos e validados, sem `...raw`:
    ```js
    const pick = { subject, title, date, start, estimated, config: cfg,
      kind: raw.kind === 'revisao' ? 'revisao' : 'estudo',
      priority: ['alta','media','baixa'].includes(raw.priority) ? raw.priority : null,
      deadline: isDate(raw.deadline) ? raw.deadline : null, fixed: raw.fixed === true,
      material: String(raw.material || '').slice(0, 300), notes: String(raw.notes || '').slice(0, 1000) };
    // id sempre gerado por genId(ctx); nunca aceitar raw.id
    ```
  - Em `modify`/`cmdUpdate`, validar cada chave de `UPDATABLE` por tipo (`remainingMin` inteiro ≥ 0 ou null; `deadline` data; `priority` enum; strings com limite de tamanho).
  - Defesa em profundidade: aplicar `esc()` em **todo** valor interpolado em `innerHTML` (`b.id`, `v.deadline`, `v.remainingMin`, `v.questions`, `v.hits`, `v.date`, `v.start`, `cl.time`) e/ou validar o estado em `normalizeState`.

---

## MÉDIO

### M1. Dados corrompidos ou antigos apagam o planejador ou travam o app — [confirmado a falha; cenário real de dado ruim não confirmado]
- **Onde:** `js/app.js:16-24` (`load`), `js/capacity.js:17-20` e `:61` (`normalizeBlock` não preenche `config`).
- **Reprodução:** `Capacity.normalizeState({blocks:[{}]})` lança `TypeError` e `{blocks:[null]}` também. `load()` engole o erro e devolve `fresh()`; a primeira ação que chama `save()` regrava o `localStorage` vazio e **perde tudo**. Um bloco sem `config` passa pelo `normalizeState`, mas `capacityFor` lança `Cannot read properties of undefined (reading 'focusMin')`, e o calendário não renderiza.
- **Correção sugerida:**
  - Em `load()`, antes de cair em `fresh()`, guardar o JSON bruto: `localStorage.setItem(KEY + '.corrompido', raw)`. Não regravar `KEY` até o usuário confirmar.
  - Em `normalizeBlock`, preencher `config: { ...C.DEFAULT_CONFIG, ...(b.config||{}) }` e descartar blocos sem `date`/`start` válidos (movendo-os para uma lista de quarentena).

### M2. Valores sem tipo ou formato corrompem capacidade e criam blocos invisíveis — [confirmado]
- **Onde:** `js/commands.js:14-15`, `:143-171`, `:174-210`; `js/core.js:66-76` (`validateBlockPlan` só testa o regex `\d{4}-\d{2}-\d{2}` e `\d{2}:\d{2}`).
- **Reproduções:**
  - `update_block {remainingMin: "abc"}` ou `"…"` → `plannedNetMin` vira string concatenada (`"00\"><svg…"`), e `balanceMin`/`excessMin` viram `null`/`NaN`.
  - `remainingMin: -500` → `plannedNetMin = -500`, ou seja, o limite semanal passa a ter "folga" falsa.
  - `create_block date:"2026-02-31"` → aplicado sem erro. `weekKey` rola para 02/03, mas o calendário, a capacidade e `freeIntervals` comparam a string e **nunca mostram nem contam** o bloco. É um bloco fantasma.
  - `update_block start:"12:75"` → gravado como `12:75` (fim calculado `14:10`).
- **Correção sugerida:** em `core.js`, validar de verdade:
  ```js
  const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseDate(s)) === s;
  const okTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  ```
  e usar `normTime` também no ramo `update` (hoje `normTime(x) || x` mantém o valor bruto). Em `UPDATABLE`, rejeitar tipo errado em vez de gravar.

### M3. Desfazer `set_limit` de uma semana remove o limite em vez de restaurar o padrão — [confirmado]
- **Onde:** `js/commands.js:385-388` (`before` vira `null` quando não havia exceção) e `:541-544` (`undo` chama `setSetting(..., null)`); `js/capacity.js:54` (`ov.limitMin !== undefined ? ov.limitMin : padrão`).
- **Reprodução:** padrão 1200 min; `set_limit {week:'2026-10-12', limitMin:600}` e depois `undoLast` → `weekOverrides = {"2026-10-12":{"limitMin":null}}`, limite efetivo **`null` (sem limite)**, e não 1200.
- **Impacto:** o "desfazer" retira a proteção do limite sem o usuário pedir, contra a regra "nunca altera o limite sozinho" (US-09.4).
- **Correção sugerida:** distinguir "sem exceção" de "exceção null". No `before`, guardar `undefined` como marcador (`{absent:true}`) e, no undo, `delete s.weekOverrides[w].limitMin` (e a chave inteira se ficar vazia).

### M4. Desfazer parcialmente falho marca o conjunto como desfeito e impede nova tentativa — [confirmado]
- **Onde:** `js/commands.js:546-548`.
- **Reprodução:** criar bloco pelo chat, registrar uma sessão nele, `undoLast` → `failed.length = 1` (bloco com estudo não é removido) e mesmo assim `logged.undone = true`; `lastUndoable` passa a retornar `null`. A mensagem diz "Desfeito: Criar…" mas o bloco continua lá.
- **Correção sugerida:** marcar `undone` só se `failed.length === 0`. Se for parcial, manter as `ops` não revertidas (`set.ops = failed.map(f => f.op)`) e dizer "desfeito parcialmente".

### M5. `delete_block` pelo chat com cronômetro ativo descarta o tempo estudado — [confirmado a lógica; fluxo de UI deduzido do código]
- **Onde:** `js/commands.js:230-237` (só avisa sobre `sessions` já salvas) e `js/app.js:428-429` (`renderTimer` zera `state.session` se o bloco não existe).
- **Reprodução:** bloco com `startSession` ativa; `plan([delete_block])` → nenhum aviso; `applyChanges` → `blocks=0` e `session.blockId` órfão. No próximo render a sessão é descartada sem gravar o tempo. O "desfazer" restaura o bloco, mas não a sessão.
- **Correção sugerida:** em `cmdDelete`, `if (ctx.state.session && ctx.state.session.blockId === b.id) { warn(...); ctx.confirm = true; }`, ou bloquear a exclusão com a mensagem "encerre o cronômetro antes".

---

## BAIXO

### B1. Resposta 413 nunca chega ao cliente — [confirmado]
`server/server.js:39`: `reject(...)` seguido de `req.destroy()` fecha o socket antes de a resposta ser escrita. Cliente recebe `ECONNRESET`, e `chat.js` mostra "Não consegui falar com o servidor local". **Correção:** não destruir o request; responder 413 com `connection: close` e `req.resume()`/descartar o restante.

### B2. `context` sem limite próprio, sem timeout para a Anthropic, Origin aceita qualquer porta de localhost — [confirmado o primeiro item]
- Um corpo de 900 KB (`context` inflado) é repassado inteiro à API (931 866 bytes), o que gera custo. `server/llm.js:108` usa `fetch` sem `AbortSignal.timeout(...)`, então uma API lenta pendura a requisição. Limitar `JSON.stringify(context).length` (ex.: 60 KB) e usar `AbortSignal.timeout(30000)`.
- `server/server.js:49` aceita `Origin: http://localhost:9999` (qualquer app local em outra porta). Sugestão: comparar com `http://localhost:${PORT}` / `127.0.0.1:${PORT}`.

### B3. Sugestão do relatório semanal continua aparecendo depois de aplicada — [confirmado]
`js/weeklyreport.js:145-147`: o bloco atrasado original permanece "pendente" mesmo após o reagendamento. Reproduzido: aplicar a sugestão "Reagendar Crase" cria o bloco novo, e a rodada seguinte sugere a mesma coisa. Na repetição, `applyChanges` barra por `DUPLICADO` (mesmo horário). Se o horário mudar (outro bloco ocupar o slot), o bloco é duplicado. **Correção:** ignorar na lista de pendentes os blocos que já têm filho com o mesmo `subject`+`title` em data futura, ou marcar o original como `rescheduledTo`.

### B4. Arrastar no calendário não valida conflito, capacidade nem bloco concluído — [não confirmado em UI]
`js/app.js:217-227` grava `b.date/b.start` direto (o chat checa conflito e limite). Além disso, `blockById` pode ser `undefined` se o bloco sumir por `storage` entre `dragstart` e `drop` (TypeError). Inconsistência entre as duas portas de escrita; aviso visual de "Conflito" já existe.

---

## Verificado e OK
- **Chave:** `.env` está no `.gitignore` (`git check-ignore .env` → ignorado; também `.env.*`, exceto `.env.example`). `git log --all -- .env` vazio. `git grep sk-ant` só acha `tests/server.test.js:10`, um valor de teste fictício; nenhum outro arquivo.
- **Vazamento da chave:** com chave falsa, ela não aparece na resposta de sucesso, nem nas respostas de erro 401/exceção (502 genérico), nem em log (`console.error` só registra `e.name`). Ela só vai no header `x-api-key`.
- **Arquivos estáticos / traversal:** `/.env`, `/server/*`, `/docs/*`, `/.git/config`, `/js/../server/server.js`, `%2e%2e`, `..%2f`, `%5c`, `%00` → 404. Só `index.html`, `estudy.html`, `/js/*.js`, `/css/*.css` respondem 200.
- **Host/Origin:** `Host: evil.com` e `localhost.evil.com` → 403 (bloqueia DNS rebinding); `Origin: evil.com` → 403; `content-type` ≠ JSON → 415; servidor escuta só em `127.0.0.1`. Sem cabeçalhos CORS permissivos.
- **SSRF:** não há URL controlada pelo cliente; a API tem URL fixa.
- **XSS no chat:** `chat.js` usa só `textContent`/`createTextNode`; texto do modelo, das propostas e dos resultados não passa por `innerHTML`.
- **`app.js`:** `esc()` cobre matéria, assunto, PDF, páginas, observações, relatórios, listas e atributos `title`. Os pontos sem `esc()` estão em A1.
- **Confirmações:** `delete_block`, `set_limit`, `reorganize`, `propose_schedule`, vários comandos juntos, bloco fixo ou concluído e estouro de limite passam por `needs_confirmation`.
- **`applyChanges`:** reavalia no estado atual (`DESATUALIZADO`, `CONFLITO`, `DUPLICADO`, `NAO_ENCONTRADO`) e não grava `state` recebido.
- **Lógica de capacidade:** carga × agenda (3×50+2×10 → 2h30/2h50), projeção, margem, concluído sem somar de novo, extra uma vez, transferência (restante no destino, estudado na origem) e rótulos de semana/virada de mês-ano (via `mondayOf` local) estão coerentes com os requisitos 09–10 e 11.
- **`estudy.html`** é idêntico ao que `tools/build-estudy.js` gera (diferença só de fim de linha CRLF).

## Não verificado / limites
- A execução real do XSS (A1) no navegador não foi testada; só a gravação dos valores e o HTML gerado, por leitura de código.
- Horário de verão: o Node do Windows ignorou `TZ`, então não consegui simular. `atMinutes` usa `setMinutes`, que é consistente no fuso `America/Sao_Paulo` (sem DST desde 2019). Em fusos com DST, pode haver deslocamento de 1 h no dia da troca. Hipótese, **não confirmada**.
- Não chamei a API real da Anthropic (nunca) e não li o `.env`.
