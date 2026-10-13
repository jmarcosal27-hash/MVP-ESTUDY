# QA em navegador — Agente B

Teste de ponta a ponta no navegador (somente leitura de código; nenhum arquivo do projeto foi alterado).

## 1. Ambiente

| Item | Valor |
|---|---|
| Código | `claude/clever-meitner-98dao2` @ `e0187f7` (clone novo em `D:\Projetos\MVP-ESTUDY-B`; `.env` não foi aberto — o clone nem o contém) |
| Navegador | Chromium 1248 via Playwright 1.64.0 (headless), Windows 11, Node v24.18 |
| Servidor | `node server\server.js` com `ANTHROPIC_API_KEY=chave-falsa-de-teste`, porta 3201. **A API real nunca foi chamada**: `POST /api/chat` foi interceptado com `page.route` |
| Relógio | `page.clock` fixado em seg 12/10/2026 10:00 (-03:00); `runFor`/`fastForward` para pomodoro de 1 min, tempo extra, semana |
| Viewports | 1280×900 (padrão), 1280×800, 768×1024, 390×800; `prefers-color-scheme` claro e escuro |
| Testes unitários | `node --test tests/*.test.js` → 92 passam, 0 falham |
| Scripts/prints | fora do repo, em `D:\Projetos\qa-scratch-B` (`a.js`…`f.js`, `shots\`) |

Limitação: o navegador é headless, então não ouvi o som. Verifiquei que o `AudioContext` cria os 3 osciladores do alerta (ver F4), mas não a audibilidade.

## 2. Roteiro (docs/TESTE-SOCIO.md)

**Resultado: 67 ✅ / 1 ❌** em 68 itens. Mais 1 ❌ extra encontrado fora do roteiro nos relatórios (F5).

| Item | Resultado | Observação |
|---|---|---|
| 1.1 | ✅ | Clique em amanhã 09:00 abre o cadastro com 2026-10-13 / 09:00 |
| 1.2 | ✅ | Prévia: estudo 2h30, descanso 20min, reservado 2h50, término 11:50 |
| 1.3 | ✅ | "Em dia", azul, altura 145px (= 170 min × 52px/h) |
| 1.4 | ✅ | Arrastar muda dia/hora; hora em passos de 15 min (caiu 08:45) |
| 1.5 | ✅ | Dois blocos com ⚠ Conflito e contorno; dica "Sobrepõe …" |
| 1.6 | ✅ | 4 pomodoros: estudo 3h20, descanso 30min (3 pausas), reservado 3h50 |
| 1.7 | ✅ | "O bloco ultrapassa a meia-noite…" e o diálogo continua aberto |
| 1.8 | ✅ | Semana seguinte e Hoje; dia atual destacado + linha da hora |
| 1.9 | ✅ | Totais por dia e na semana |
| 2.1 | ✅ | Painel "Foco", contagem regressiva; bloco com "● Em andamento" |
| 2.2 | ✅ | Alert "Já existe um cronômetro ativo…" |
| 2.3 | ✅ | Pausa de 20 s congela; retoma de onde parou (o relógio mostra ceil, então 1 s depois ainda marca o mesmo número) |
| 2.4 | ✅ | Banner laranja, fase Tempo extra "+00:05→+00:17", zero confirmações, não inicia descanso (som: ver F4) |
| 2.5 | ✅ | Pausar/retomar no extra preserva o contador |
| 2.6 | ✅ | F5: mesma sessão (`session.id` igual), fase e contador seguem |
| 2.7 | ✅ | Salto de 90 s + `visibilitychange`: +00:23 → +01:53 |
| 2.8 | ✅ | Pausa curta preserva o extra acumulado |
| 2.9 | ✅ | "Pausa encerrada — aguardando você"; 40 s depois nada contou |
| 2.10 | ✅ | Confirmação com o tempo; ciclo parcial gravado |
| 2.11 | ✅ | "foco regular 1min + extra 2min = 3min · Pomodoros completos 1 de 2 · parciais 1" |
| 2.12 | ✅ | `completed` continua false |
| Conta | ✅ | 1 min de foco + 12 s de extra → 1 pomodoro completo, foco 60000 ms, extra 12335 ms |
| 3.1–3.6 | ✅ | "Resultado pendente"; 0 acertos = 10 erros 0,0%; 11 > 10 recusado; -1 / 1,5 / abc recusados; "Sem questões registradas"; 7/10 = 3 erros 70,0% |
| 3.7 | ✅ | Concluir deixa verde; reabrir volta |
| 3.8 | ✅ | Bloco passado vira "Atrasado" |
| 4.1 | ✅ | 4 linhas (3 matérias + total) com as colunas pedidas, extra separado |
| 4.2 | ✅ | Filtros de matéria e período corretos (mas ver F2: Limpar) |
| 4.3 | ✅ | Agrupar por semana → 1 linha |
| 4.4 | ✅ | 75,0% = 45/60 (as 15 questões sem resultado ficam de fora) |
| 4.5 | ✅ | "Blocos do resultado" lista e o link abre o bloco |
| 4.6 | ✅ | "Menor taxa de acerto: Matemática (40,0%)" |
| 6.1 | ✅ | Carga 2h30 (só estudo), saldo 1h30 |
| 6.2 | ✅ | Aviso de excesso de 1h com 3 alternativas; recusar não grava |
| 6.3 | ✅ | Aceitar: cartões "Excesso" vermelhos; limite continua 240 |
| 6.4 | ✅ | Exceção de 10 h só nesta semana; a seguinte fica em 4 h; Configurações intacto |
| 6.5 | ✅ | "Estudado na semana" sobe; Projeção = estudado + restante; Margem = limite − projeção (ver F10: atualiza só 1×/min) |
| 6.6 | ✅ | Restante = 90 → projeção sobe; concluir zera o restante do bloco |
| 6.7 | ✅ | "⚠ Este horário está fora da disponibilidade ou ocupado." |
| 6.8 | ✅ | Revisão (`kind=revisao`) 1 semana depois, título "Revisão: …" |
| 7.1 | ✅ | 5 blocos, sem sobreposição, dentro das faixas, com "por quê" |
| 7.2 | ✅ | Ajuste de dia/hora respeitado ao gravar |
| 7.3 | ✅ | Nada no calendário antes de confirmar (0 blocos) |
| 7.4 | ✅ | 30 blocos: 5 couberam, "Não couberam (25)" com motivo por bloco |
| 7.5 | ✅ | Horário obrigatório respeitado (sex 16 19:00); prazo curto entra primeiro |
| 7.6 | ✅ | Gerar de novo: existentes intactos, sem duplicar |
| 8.1 | ✅ | Pedido direto sem conflito executa e informa; falta de horário → pergunta, sem alterar |
| 8.2 | ✅ | Destino ocupado → 3 horários livres; livre → move; 2 "Redes" → pergunta qual |
| 8.3 | ✅ | Cria os 2 sem duplicar (com proposta, pois um passa do fim da faixa) |
| 8.4 | ✅ | "9h livres … 08:00–09:00 · 14:00–22:00" coerente com a agenda |
| 8.5 | ✅ | Proposta mostra o que muda e o efeito na carga; nada muda antes de confirmar |
| 8.6 | ✅ | +1 pomodoro; 2ª revisão não duplica (ver F11) |
| 8.7 | ✅ | Carga do chat = carga do painel (7h30) (ver F9: texto "saldo … (excesso)") |
| 8.8 | ✅ | O contexto enviado ao servidor já traz o título editado no calendário |
| 8.9 | ✅ | "Desfeito: Criar revisão: …" |
| 8.10 | ✅ | Proposta com "ultrapassa o limite em 8h 10min" e alternativas, sem aplicar |
| 9.1 | ✅ | Planejados/concluídos/atrasados, tempos, extra, questões/acertos/erros/taxa |
| 9.2 | ✅ | Mat (3 questões) vai a "Poucos dados" |
| 9.3 | ✅ | Port: "sem questões com resultado… isso não é 0%" |
| 9.4 | ✅ | Mais tempo sem erros não vira fraqueza ("Nada a registrar") |
| 9.5 | ✅ | "Reagendados para outra semana: Redes — Camadas" |
| 9.6 | ✅ | Corrigir acertos e Atualizar: 18 → 20 |
| 9.7 | ✅ | Programado, capacidade, 5 sugestões com "Por quê" e "Impacto" |
| 9.8 | ❌ | **F1** — nenhuma sugestão consegue ser aplicada |
| 9.9 | ✅ | Aba "Relatório semanal ●" e mensagem no chat |

Extras do chat: erro 500 do servidor aparece como mensagem legível; resposta vazia → "Não entendi o pedido"; o histórico persiste após F5; HTML na resposta/matéria **não** executa (sem XSS no chat, calendário, diálogo e relatórios).

## 3. Testes transversais

| Teste | Resultado | Observação |
|---|---|---|
| (a) 390×800 e 768×1024: rolagem horizontal da página | ✅ | `scrollWidth == innerWidth`; o calendário rola dentro do próprio contêiner (min-width 900px) |
| (a) botões do topo cobertos | ✅ | Nenhum coberto |
| (a) diálogos (bloco, cronograma, configurações) | ✅ | Cabem na tela; Salvar/Fechar alcançáveis |
| (a) relatórios/semanal | ✅ | Tabelas rolam em `.table-wrap`, sem estourar a página |
| (a) cronômetro + gaveta do chat | ❌ | **F8**: sobrepõem 8px em todos os tamanhos (nenhum botão fica coberto) |
| (b) tema escuro | ❌ | Fundo certo, mas contraste abaixo de 4,5:1 (**F7**). O tema claro também tem itens abaixo |
| (c) localStorage vazio | ✅ | |
| (c) JSON inválido / `{}` / `null` / `blocks=null` / blocos com campos de tipo errado / reports e chat corrompidos | ✅ | App abre limpo (JSON inválido só é sobrescrito no primeiro salvamento, sem aviso — ideia I8) |
| (c) bloco antigo sem `config` | ❌ | **F3**: página em branco |
| (c) `session` incompleta / sem `segments` | ❌ | `TypeError: segments is not iterable`, página em branco (cenário artificial, veja F3) |
| (c) sessão completa apontando para bloco inexistente | ✅ | Sessão é descartada |
| (d) bloco criado na aba 1 → aba 2 | ✅ | Evento `storage` atualiza |
| (d) cronômetro entre abas | ✅ | Visível na outra aba; iniciar outro é barrado; pausar numa aba reflete na outra |
| (d) foco zera com 2 abas | ✅ | Mesma fase e `alertSeq=1`; banner aparece só numa aba (a que cruzou primeiro) |
| (d) editar com diálogo aberto + mudança na outra aba | ❌ | **F6**: edição perdida em silêncio |
| (e) rótulos e nomes de botões | ✅ | Todos têm rótulo |
| (e) foco visível | ✅ | Outline padrão do navegador |
| (e) Esc fecha diálogos; `lang=pt-BR`, `main`, `nav`, um `h1` | ✅ | |
| (e) blocos do calendário por teclado | ❌ | **F5** |
| (e) cronômetro/abas para leitor de tela | ❌ | **F12** |
| (f) erros no console | ✅ | Nenhum em fluxo normal. Os únicos: um 500 que eu mesmo simulei, e os `pageerror` dos casos F3 |

## 4. Falhas (por gravidade)

Legenda: A impede de usar · B atrapalha · C incômodo.

### A — impede de usar

**F3 · Bloco sem `config` (dado antigo) deixa o app em branco, sem recuperação.** *(A condicional: só com dados gravados por versão anterior ou incompletos.)*
- Passos: `localStorage['estudy.mvp.v1'] = '{"blocks":[{"id":"x1","subject":"Mat","title":"Antigo","date":"2026-10-12","start":"09:00","estimated":2}]}'` e recarregar.
- Esperado: o bloco aparece com o pomodoro padrão. Obtido: calendário vazio (sem grade); no console `TypeError: Cannot read properties of undefined (reading 'focusMin')` em `capacity.js:61` (`netStudyMin`) ← `remainingMin` (74) ← `capacityFor` (114). O estado quebrado continua no storage, então só limpar os dados do site resolve.
- Suspeito: `js/capacity.js` `normalizeBlock` (linha ~17) não preenche `config` (nem o padrão do `settings`), e `normalizeState` não valida `session`. O mesmo vale para `session` sem `segments`/`cycles` (`segments is not iterable`; origem não rastreada).

### B — atrapalha

**F1 · 9.8 — "Aplicar esta sugestão…" nunca funciona nas sugestões de revisão.**
- Passos: ter uma semana fechada com blocos concluídos; abrir **Relatório semanal**; clicar em qualquer "Aplicar esta sugestão…" (testei as 5).
- Esperado: confirmação com as alterações. Obtido: alert "Não consegui aplicar automaticamente: • Quando quer revisar "Direitos"? Horários livres:" (lista vazia) e nada muda.
- Causa: a sugestão carrega `[{type:'add_review', ref:{id}}]` sem data/hora, então `Commands.plan` devolve `needs_clarification` **com `options`** (confirmei em Node: 3 horários livres). `applySuggestion` mostra só `q.text` e descarta `q.options`.
- Arquivos: `js/app.js:615-625` (`applySuggestion`), `js/weeklyreport.js` (comandos das sugestões). Correção natural: oferecer as opções como botões (como o chat faz) ou já gerar a sugestão com data/hora.

**F2 · "Limpar" nos Relatórios não limpa a matéria.**
- Passos: Relatórios → matéria "Matemática" → **Limpar**.
- Esperado: "Todas" e tabela completa. Obtido: continua "Matemática" (1 linha). O período e o agrupamento limpam.
- Causa: `renderReports` recria as `<option>` com o atributo `selected` na opção atual; `form.reset()` volta ao padrão do HTML, que agora é essa opção. Arquivos: `js/app.js:563-564` e `:703`. Use `sel.value = …` em vez do atributo, ou zere `sel.value=''` antes do `render`.

**F4 · Depois de F5 o alerta sonoro fica mudo até o primeiro clique.**
- Passos: iniciar cronômetro, apertar F5, **não clicar em nada**, deixar o foco/pausa terminar.
- Esperado: som (2.4 / 2.9). Obtido: banner aparece, mas 0 osciladores criados (sem clique prévio o `AudioContext` não existe e `beep()` sai em `if (!audio) return`). Com clique antes, toca (3 osciladores).
- Arquivo: `js/app.js:32-48` (`unlockAudio`/`beep`). Como o navegador só libera áudio após gesto, o ideal é avisar ("clique para ativar o som") quando houver sessão restaurada.

**F6 · Edição perdida com duas abas (diálogo aberto + mudança em outra aba).**
- Passos: aba 1 abre o diálogo do bloco A e digita um novo título; na aba 2 cria outro bloco; na aba 1 clica **Salvar**.
- Esperado: a edição é gravada. Obtido: o diálogo fecha como se tivesse salvo, mas o título não muda (o bloco da aba 2 foi preservado).
- Causa: o evento `storage` troca `state` por `load()` (`js/app.js:704`), mas o diálogo mantém o `b` antigo; `commit` faz `Object.assign(b, data)` em um objeto que já não está no `state` (`js/app.js:356-360`).

**F5 · Blocos do calendário não são acessíveis por teclado.**
- Os blocos são `<div>` sem `tabindex`/`role`; Tab passa pelas abas e botões do topo e nunca chega a um bloco. Só dá para abrir um bloco com mouse/toque (ou pelo link nos Relatórios). Clicar em horário vazio também depende do mouse. Arquivo: `js/app.js:186` (`blockHtml`).

### C — incômodo

- **F7 · Contraste abaixo de 4,5:1.** Escuro: aba ativa e botões `.primary` (branco sobre `#748ffc`) 2,97:1; "● Em andamento" 3,84:1; `.meta` dos blocos 4,39:1. Claro: chip "Concluído" 3,81:1, "Em dia" 4,07:1, `.muted` 4,38:1, `.meta` 3,84–4,14:1. Arquivo: `css/styles.css` (`--accent` no escuro, `.chip`, `.muted`).
- **F8 · Cronômetro e chat se sobrepõem em 8px** (todos os tamanhos): o timer tem 266px de altura e começa 278px acima do fim da tela; a gaveta termina 270px acima (`body.has-timer .chat-drawer { bottom: 270px }`). Nenhum botão fica coberto, mas o rodapé do chat encosta no timer. Em telas baixas (altura < ~600px) a gaveta ficaria quase sem área útil (não medi).
- **F9 · Texto do chat para limite estourado:** "limite 6h, planejado 7h 30min, saldo 1h 30min (excesso)". Diz "saldo" para um excesso. Fonte: `cmdQueryCapacity` em `js/commands.js:313-318`.
- **F10 · Painel de capacidade e "Resumo da semana" só atualizam a cada minuto cheio** (o cronômetro atualiza a cada 0,5 s). Medido: com 40 s de sessão o timer mostra "1min" e o painel "0min" até os 60 s (`tick` só chama `render()` na troca de minuto, `js/app.js:681-682`).
- **F11 · Referência por título parcial fica ambígua** depois que existe a revisão: pedir "outra revisão" de `{title:'Crase'}` pergunta "Mais de um bloco combina" (bate com "Crase" e "Revisão: Crase"). Não duplica, mas pergunta à toa; preferir o `id` do contexto ou casar título exato primeiro (`resolveRef`, `js/commands.js:~48`).
- **F12 · Leitor de tela:** `#timer` sem `role`/`aria-live` (a contagem e a troca de fase não são anunciadas; só o banner tem `role=alert`); as abas (`[data-view]`) sem `aria-selected`/`aria-pressed`.
- **F13 · Blocos em conflito se cobrem:** os dois têm a largura toda, então o de baixo só é clicável na parte que sobra (no teste, clicar no centro do bloco coberto falhou e clicar no topo funcionou).

## 5. Ideias de melhoria (não são falhas)

- **I1.** Em "Aplicar esta sugestão…", mostrar os horários livres como botões e aplicar com um clique.
- **I2.** Blocos em conflito lado a lado (duas colunas) em vez de sobrepostos.
- **I3.** Tornar a grade navegável por teclado (setas) e blocos como `<button>`; criar bloco por atalho.
- **I4.** Aviso "ative o som" quando a página abre com sessão em andamento; testar Notification mesmo com aba em segundo plano.
- **I5.** Atualizar o painel de capacidade a cada segundo (ou a cada 10 s) enquanto houver cronômetro.
- **I6.** Exportar/importar backup em JSON (os dados só existem neste navegador) e "versão de esquema" no storage para migrar dados antigos (F3).
- **I7.** Copiar bloco / repetir toda semana / cor por matéria (perguntas do roteiro 1).
- **I8.** Se o JSON do storage estiver inválido, guardar uma cópia (`estudy.mvp.v1.corrupt`) e avisar, em vez de começar vazio e sobrescrever no próximo salvamento.
- **I9.** Mostrar quando outra aba alterou os dados enquanto um diálogo está aberto (ou recarregar o bloco ao salvar).
