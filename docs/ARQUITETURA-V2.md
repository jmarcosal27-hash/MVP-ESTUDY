# Arquitetura V2 — contrato entre módulos (maestro)

Objetivo: entregar ao sócio o **MVP final** com os requisitos 01–12. Três pessoas/agentes trabalham em paralelo; **cada um só edita os arquivos que são seus** (tabela abaixo). Mudança neste contrato = falar com o maestro.

## 1. Regras gerais
- Módulos **puros** (sem DOM/storage), padrão UMD igual a `js/core.js` (`module.exports` em Node, `window.X` no navegador), testados com `node --test tests/<modulo>.test.js` (runner nativo, **sem dependências npm**).
- Português nos textos ao usuário e nos comentários; identificadores em inglês como em `core.js`.
- Unidades: **planejamento em minutos**, **sessões em ms**. Datas `'YYYY-MM-DD'` locais, horas `'HH:MM'`. Dia da semana **ISO: 1=segunda … 7=domingo**. **Semana = chave da segunda-feira** (`weekKey('2026-10-14') === '2026-10-12'`).
- Cálculos de tempo, conflito, capacidade e desempenho vêm **só** dos módulos (`core.js`, `capacity.js`…), **nunca do LLM**. O LLM só converte texto em comandos.
- Nada é "anunciado como feito" antes de `applyChanges` salvar. Nenhuma regra de negócio duplicada na UI.
- Chave da API: **apenas** `process.env.ANTHROPIC_API_KEY` no servidor local. Nunca em código, commit, log nem navegador.

## 2. Donos dos arquivos
| Arquivo | Dono | Conteúdo |
|---|---|---|
| `js/core.js`, `js/app.js`, `index.html`, `css/`, `estudy.html`, `docs/MVP.md` | **Maestro** | MVP atual + integração de UI |
| `js/capacity.js`, `tests/capacity.test.js` | **Maestro** | E09/E10 + disponibilidade (entrega primeiro) |
| `js/scheduler.js`, `tests/scheduler.test.js` | **Agente 1** | E08 gerador de cronograma |
| `js/weeklyreport.js`, `tests/weeklyreport.test.js` | **Agente 1** (fase 2) | E11 |
| `js/commands.js`, `tests/commands.test.js` | **Agente 2** | comandos, resolução de bloco, proposta, `applyChanges`, desfazer |
| `server/server.js`, `server/llm.js`, `iniciar.bat`, `.env.example`, `tests/server.test.js` | **Agente 2** | servidor local + proxy Anthropic |
| `js/chat.js`, `css/chat.css` | **Agente 2** | painel do chat (só DOM próprio; o maestro o monta em `index.html`) |

Fluxo git: `git pull --rebase origin claude/clever-meitner-98dao2` → trabalhar → commit pequeno → `git push origin HEAD:claude/clever-meitner-98dao2`. Sem force. Conflito: manter os dois lados e avisar o maestro.

## 3. Modelo de dados (estende o `state` atual)
```js
state = {
  settings: {
    config: { focusMin, shortMin, longEvery, longMin },       // pomodoro padrão (existe)
    weeklyLimitMin: 2400,                                      // limite semanal LÍQUIDO (estudo) em minutos; null = sem limite
    availability: {                                            // rotina padrão
      days: { "1": [{from:"08:00",to:"12:00"},{from:"14:00",to:"18:00"}], "2": [...], ... },  // dias sem chave = indisponível
      unavailable: [ {day:3, from:"12:00", to:"14:00", label:"Almoço"},        // recorrente por dia da semana
                     {date:"2026-10-15", from:"09:00", to:"10:00", label:"Consulta"} ]  // pontual
    },
    closing: { day: 7, time: "21:00" },                        // fechamento do relatório semanal
  },
  weekOverrides: {                                             // exceção por semana; NÃO altera settings
    "2026-10-12": { limitMin?: 1800, days?: { "3": [{from:"08:00",to:"12:00"}] }, unavailable?: [ ... ] }
  },
  blocks: [ Block ],
  session: null | Session,                                     // cronômetro (existe)
  changeLog: [ ChangeSet ],                                    // pilha p/ desfazer (só source 'chat')
  reports: { "2026-10-12": WeeklyReport },                     // relatórios gerados
  chat: { messages: [ {role, text, at} ] },
}
Block = {
  // existentes: id, subject, title, date, start, estimated, config, pdf, pages, studied, questions, hits, notes, completed, sessions[]
  kind: 'estudo' | 'revisao',          // default 'estudo'
  reviewOf: blockId | null,            // revisão ligada ao bloco de origem
  priority: 'alta' | 'media' | 'baixa' | null,
  deadline: 'YYYY-MM-DD' | null,
  fixed: boolean,                      // horário obrigatório (scheduler/chat nunca movem sem pedido explícito)
  material: string,                    // PDF/link (mesmo que `pdf`; scheduler preenche `pdf`)
  originWeek: 'YYYY-MM-DD',            // semana (segunda) do 1º agendamento; NUNCA muda ao reagendar
  remainingMin: null | int,            // ajuste manual do tempo líquido restante; null = calcular
  source: 'manual' | 'chat' | 'scheduler',
}
ChangeSet = { id, at, source:'chat', summary, ops:[ {op:'create'|'update'|'delete', id, before:Block|null, after:Block|null} ], undone:false }
```
Blocos antigos sem os campos novos devem funcionar (defaults acima). `capacity.js` exporta `normalizeBlock(b)` e `normalizeState(s)` que preenchem defaults.

## 4. API dos módulos

### 4.1 `capacity.js` (maestro — publicado primeiro)
```js
weekKey(dateStr) -> 'YYYY-MM-DD' (segunda)
normalizeBlock(b), normalizeState(s)
effectiveWeek(state, weekMonday) -> { limitMin|null, days:{1..7:[{from,to}]}, unavailable:[{day|date,from,to}] }  // aplica weekOverrides sem alterar settings
netStudyMin(block)        // estimated * config.focusMin  (carga: só estudo)
agendaMin(block)          // planBlock(...).totalMin       (agenda: estudo + pausas)
realizedMin(block, weekMonday?)  // estudo realizado (foco+extra) em minutos; com weekMonday, só sessões iniciadas naquela semana
remainingMin(block)       // concluído => 0; senão remainingMin manual ?? max(0, netStudyMin - realizedMin total)
capacityFor(state, weekMonday, nowMs) -> {
  limitMin, plannedNetMin, balanceMin, excessMin,             // E09: saldo = limite - planejado
  realizedMin, remainingMin, projectionMin, marginMin, projectedExcessMin,   // E10
  freeAgendaMin,                                              // tempo livre na disponibilidade após os blocos da semana
  warnings: [ 'LIMIT_REACHED' | 'EXCESS' | 'BALANCE_WITHOUT_SLOTS' | 'PROJECTION_OVER_LIMIT' | 'PROJECTION_NO_SLOTS' ]
}
freeIntervals(state, dateStr, ignoreBlockIds?) -> [{startMin,endMin}]   // dentro da disponibilidade, fora de indisponíveis e de blocos (ocupação = estudo+pausas)
wouldFit(state, draft, weekMonday) -> { fitsCapacity, fitsAgenda, excessMin, options:[ {type:'reduce'|'transfer'|'replace', text, ...} ] }
```
Regras: bloco concluído **não** soma o planejado; estudo já realizado **não** é liberado; extra conta **uma vez**; pausas/interrupções fora; na semana de destino de uma transferência conta **só o restante**, e o realizado fica na semana em que a **sessão iniciou** (`session.startedAt`), não na do bloco. Limite nunca é alterado automaticamente.

### 4.2 `scheduler.js` (Agente 1) — E08
```js
proposeSchedule(state, request, weekMonday, nowMs) -> {
  placements: [ {tempId, subject, title, date, start, estimated, config, kind, priority, deadline, material, reason} ],
  unplaced:   [ {item, reason, code:'NO_SLOT'|'LIMIT'|'DEADLINE'|'UNAVAILABLE'|...} ],   // nada some em silêncio
  capacity: { before, after },                                  // capacityFor antes/depois da proposta
  warnings: [ ... ]
}
// request = { items:[ {subject, title, blocks:N, pomodoros:P, material?, deadline?, priority?, fixedDate?, fixedStart?, notes?} ],
//             weekOverrides?: {...}, preserveExisting: true }
```
Regras: determinístico; só usa `capacity.freeIntervals`/`effectiveWeek`; **preserva** blocos e revisões existentes; sem sobreposição; considera foco + pausas (agenda) e carga líquida (limite); **nunca ultrapassa o limite em silêncio** nem encurta atividade; ordena por prazo, prioridade e horário obrigatório; o que não couber vai em `unplaced` com motivo. Não grava nada (a aplicação é por `commands.applyChanges` após confirmação).

### 4.3 `commands.js` (Agente 2) — E07/E12
```js
// Comandos estruturados (o LLM só produz isto):
//  {type:'create_block', block:{subject,title,date,start,estimated,...}}
//  {type:'update_block', ref, changes}   {type:'move_block', ref, to:{date,start}}
//  {type:'delete_block', ref}            {type:'add_pomodoro', ref, count}
//  {type:'complete_block'|'reopen_block', ref}
//  {type:'add_review', ref, date?, start?}
//  {type:'query_schedule', range} {type:'query_free_time', date|range, minMin?} {type:'query_capacity', week}
//  {type:'propose_schedule', request}   {type:'reorganize', scope:'pending'|..., reason:'lost_period', from, to}
//  {type:'set_limit', week?, limitMin}  {type:'undo_last'}
// ref = {id?} | {subject?, title?, date?, start?, weekday?}
resolveRef(state, ref) -> {status:'one'|'none'|'ambiguous', matches:[Block]}
plan(state, commands, nowMs) -> {
  status: 'ready' | 'needs_clarification' | 'needs_confirmation',
  questions: [ {id, text, options?:[...]} ],           // só o que falta/está ambíguo
  changes: [ {op, id, before, after, summary} ],        // diff proposto
  results: [ ... ],                                      // respostas de consultas (calculadas, nunca pelo LLM)
  conflicts: [ ... ], capacityEffect: {before, after}, warnings: [...],
  alternatives: [ {text, commands} ]                    // ex.: destino ocupado => horários livres
}
applyChanges(state, changes, {source:'chat', summary}) -> {state, changeSet, applied:[...], failed:[ {change, reason} ]}   // grava o ChangeSet; sem duplicar blocos
undoLast(state) -> {state, undone: ChangeSet|null}
```
Regras: pedido direto e inequívoco sem conflito/estouro de limite ⇒ `status:'ready'` (executa e relata); ambiguidade, vários blocos, destino ocupado, estouro do limite, ou adiar/substituir sem prioridade ⇒ `needs_clarification`/`needs_confirmation`. Idempotência: o mesmo pedido não cria bloco duplicado (mesma matéria+título+data+início). `set_limit` só com pedido explícito do usuário.

### 4.4 `server/` (Agente 2)
`node server/server.js` serve a pasta do app e expõe `POST /api/chat` com `{messages, context}` onde `context` é o snapshot **enxuto** do estado (blocos da janela relevante, configurações, capacidade — já calculados pelos módulos). O servidor chama a API Messages da Anthropic com *tool use* (uma ferramenta por tipo de comando) e devolve `{reply, commands, usage}`. Modelo via `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`). Sem chave ⇒ erro claro em português e o app continua funcionando sem o chat. `iniciar.bat` (Windows) verifica `node -v`, lê `.env` e abre o navegador. `.env` no `.gitignore`; `.env.example` sem segredo. Teste do servidor com a API **simulada** (nunca chamar a API real em teste).

### 4.5 `weeklyreport.js` (Agente 1, fase 2) — E11
```js
buildWeeklyReport(state, weekMonday, nowMs) -> { week, generatedAt, execution:{planned,done,late,partial,rescheduledOut[],rescheduledIn[],plannedMin,studiedMin,extraMin,questions,hits,errors,rate},
  strengths:[ {subject, topic?, rate, questions, evidence:[blockIds]} ], weaknesses:[...], lowData:[ ... ],
  estimationBias:[ {subject, avgPlannedMin, avgRealMin, n} ], nextWeek:{ scheduled:[...], capacity, suggestions:[ {text, reason, impact, commands} ], doesNotFit:[...] } }
shouldGenerate(state, nowMs) -> weekMonday|null    // passou do fechamento e ainda não há relatório
```
Regras do requisito 11 (sem questões ≠ 0%; mais tempo ≠ dificuldade; taxa = Σacertos/Σquestões com resultado; justificativa ligada aos registros; usar `originWeek`; **não altera o calendário**).

## 5. Integração (maestro, no fim)
Painéis em `app.js`: Disponibilidade/Limite (Configurações), indicadores de capacidade no topo do calendário, tela "Gerar cronograma" (revisar/ajustar/confirmar), chat, relatório semanal, desfazer. Ordem de entrega: capacity → scheduler/commands(+server) → weeklyreport → integração → `estudy.html` final + roteiro do sócio atualizado.
