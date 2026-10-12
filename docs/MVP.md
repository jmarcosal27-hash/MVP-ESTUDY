# Estudy — Planejamento ágil do MVP

## 1. Visão e hipótese

**Para** estudantes que organizam seus estudos em blocos (matéria + PDF + questões),
**o Estudy é** uma plataforma de planejamento e acompanhamento
**que** une calendário semanal, pomodoro com tempo extra e registro de desempenho,
**diferente de** agendas genéricas e cronômetros avulsos, porque o tempo *planejado* (em pomodoros) é
comparado com o tempo *realizado* e com o *resultado nas questões*.

**Hipótese a validar com o MVP:** se o estudante planeja em pomodoros e vê plano × realizado × acertos em um só lugar,
ele passa a replanejar blocos atrasados e a identificar as matérias que exigem mais atenção.

**Métricas de aprendizado:** blocos criados/semana, % de blocos com sessão de cronômetro, % de blocos com questões
registradas, retorno à plataforma na semana seguinte.

## 2. Estratégia de corte do MVP

Os 6 requisitos são tratados como **épicos** (E01–E06). Cada um foi fatiado em histórias verticais (valor ponta a ponta).
Tudo o que a regra de negócio descreve entra no MVP, porque as regras de contabilização são o coração do produto;
o que fica de fora é **infraestrutura e conforto**, não regra de negócio.

| Dentro do MVP | Fora do MVP (próximos incrementos) |
|---|---|
| Aplicação web de página única, uso individual, dados no navegador (`localStorage`) | Contas de usuário, login, sincronização entre dispositivos |
| Os 6 requisitos completos (calendário, pomodoro, tempo extra, planejamento, situação, desempenho/relatórios) | Gráficos, exportação (CSV/PDF), importação de PDF/anexo real |
| Arrastar e soltar com mouse; formulário para reagendar em qualquer dispositivo | Arrastar por toque, redimensionar bloco, repetição/recorrência de blocos |
| Alerta sonoro (Web Audio) + banner visual + notificação do navegador | Som personalizável, push no celular |
| Um fuso/horário local; blocos não cruzam a meia-noite | Fusos, blocos multi-dia |

## 3. Backlog priorizado (MoSCoW) e critérios de aceite

Convenção: **Dado/Quando/Então** resumido. A coluna *Verificação* aponta o teste automatizado (`T`, em `tests/core.test.js`)
ou o roteiro manual/E2E (`M`, seção 6).

### Épico E04 + E05 — Planejamento por pomodoros e situação do bloco (Must, Sprint 1)
| ID | História | Critérios de aceite principais | Verificação |
|---|---|---|---|
| US-04.1 | Estimar pomodoros e ver duração | 3 pomodoros de 50 min + 2 pausas de 10 min ⇒ 170 min (150 estudo + 20 descanso); término = início + duração; pausa longa no lugar da curta a cada N; **sem pausa após o último**; recalcula ao editar | T |
| US-05.1 | Ver situação do bloco | Verde/concluído, vermelho/atrasado (término previsto passou), azul/em dia; **texto além da cor**; recalcula ao reagendar/reabrir; vira "atrasado" sozinho com o passar da hora | T + M |
| US-05.2 | Concluir manualmente | Completar pomodoros ou encerrar sessão **não** conclui; só o botão "Marcar como concluído"; pode reabrir | M |

### Épico E01 — Calendário semanal (Must, Sprint 1)
| ID | História | Critérios de aceite principais | Verificação |
|---|---|---|---|
| US-01.1 | Ver a semana | Dias × horários; bloco posicionado pelo início e com altura = duração total; dia atual destacado e linha da hora atual; navegar semanas e botão "Hoje" | M |
| US-01.2 | Criar/consultar/editar/excluir bloco | Clicar em horário vazio abre o cadastro com dia/hora preenchidos; só os dados de planejamento são obrigatórios | M |
| US-01.3 | Mover/reagendar | Arrastar para outro dia/horário (passos de 15 min) ou editar no formulário; situação recalculada | M |
| US-01.4 | Sinalizar conflitos | Sobreposição planejada destacada com ⚠; **tempo extra que invade o próximo bloco** também é sinalizado; nenhum bloco é deslocado automaticamente | T |
| US-01.5 | Totais de tempo | Por dia e por semana: planejado (estudo e descanso) × realizado (estudo, tempo extra, descanso, interrupções) | M |

### Épico E02 — Cronômetro pomodoro (Must, Sprint 2)
| ID | História | Critérios de aceite principais | Verificação |
|---|---|---|---|
| US-02.1 | Configurar pomodoro | Padrão (foco, pausa curta, qtd. até a longa, pausa longa) e ajuste por bloco; alterar a configuração **não** altera sessões/blocos já feitos (cada sessão guarda uma cópia) | T |
| US-02.2 | Controlar a sessão | Iniciar foco, pausar, retomar, iniciar pausa curta/longa correta, encerrar e salvar; **só uma sessão ativa** (outra é bloqueada com aviso) | T + M |
| US-02.3 | Contagem confiável | Tempo derivado de timestamps: correto com aba em segundo plano; **sessão sobrevive a F5**; tempo pausado não é estudo | T + M |
| US-02.4 | Alertas | Som + banner ao zerar foco e ao fim da pausa; título da aba mostra o relógio | M |
| US-02.5 | Fim da pausa exige ação | Após a pausa o estado é "aguardando"; **nada é contado** até clicar em "Iniciar foco" | T |
| US-02.6 | Registros separados | Estudo (foco + extra), descanso e interrupções registrados separadamente por sessão | T |

### Épico E03 — Tempo extra automático (Must, Sprint 2)
| ID | História | Critérios de aceite principais | Verificação |
|---|---|---|---|
| US-03.1 | Extra ao zerar o foco | Ao zerar: alerta e **tempo extra crescente** (+mm:ss) sem confirmação; não inicia descanso sozinho; mantém até pausar, iniciar pausa ou encerrar; retoma de onde parou | T |
| US-03.2 | Contabilização | 50 min de foco + 12 extras = **62 min estudados**, 1 pomodoro completo; extra não vira novo pomodoro; vinculado ao bloco e ao pomodoro; vale só para foco | T |
| US-03.3 | Ciclo parcial | Encerrar antes de completar salva o tempo e marca ciclo parcial | T |

### Épico E06 — Cadastro, desempenho e relatórios (Must, Sprint 3; relatórios Sprint 4)
| ID | História | Critérios de aceite principais | Verificação |
|---|---|---|---|
| US-06.1 | Cadastro enxuto | Obrigatórios: matéria, título, dia, início, estimativa. PDF, páginas, questões e resultados depois | M |
| US-06.2 | Registrar execução | Conteúdo estudado, questões, acertos, observações; **erros = questões − acertos** e **taxa = acertos ÷ questões × 100** calculados | T |
| US-06.3 | Validações | Só inteiros ≥ 0; acertos ≤ questões; vazio ≠ zero; "Sem questões registradas" e "Resultado pendente" em vez de 0% | T |
| US-06.4 | Relatório consolidado | Filtros por matéria e período; agrupamento por matéria ou semana; planejado × estudado, extra separado e somado ao total; questões/acertos/erros; concluídos/atrasados/em dia; blocos acima do previsto; lista dos blocos de cada resultado | T + M |
| US-06.5 | Regra de consolidação | Taxa geral = Σ acertos ÷ Σ questões **com resultado preenchido** (não a média das taxas) | T |
| US-06.6 | Pontos de atenção | Matéria com menor taxa, blocos acima do previsto, atrasados e observações pendentes | M |

### Débito/ideias (Could / Won't agora)
Gráficos de evolução · exportar CSV · duplicar/recorrência de bloco · arrastar por toque · login e sincronização · metas semanais.

## 4. Planejamento de sprints (2 semanas cada)

| Sprint | Meta | Histórias | Incremento demonstrável |
|---|---|---|---|
| 1 — *Planejar* | Estudante monta a semana | US-04.1, US-05.1, US-05.2, US-01.1 → 01.5 | Calendário com blocos coloridos, drag & drop, conflitos e totais planejados |
| 2 — *Estudar* | Estudante estuda e o tempo é registrado com fidelidade | US-02.1 → 02.6, US-03.1 → 03.3 | Cronômetro com extra, pausas, alertas, persistência e uma sessão por vez |
| 3 — *Registrar* | Estudante registra resultados | US-06.1 → 06.3 | Bloco com PDF, questões, acertos, erros e taxa validados |
| 4 — *Analisar* | Estudante decide o que reforçar | US-06.4 → 06.6 + estabilização | Relatórios filtráveis, pontos de atenção, dados de exemplo para demonstração |

*Revisão de cada sprint:* demo com estudantes reais; *retrospectiva:* ajustar o backlog com base nas métricas de aprendizado.

## 5. Definição de Pronto (DoD)
- Critérios de aceite da história atendidos e demonstrados.
- Regras de cálculo com teste automatizado (`node --test tests/core.test.js`).
- Sem erros no console; funciona offline (sem dependências externas).
- Texto em português; situação nunca comunicada apenas por cor.
- Dados persistem após recarregar a página.

## 6. Roteiro de verificação manual (E2E)
1. **Configurações → Carregar dados de exemplo**: aparecem blocos verdes/azuis/vermelhos na semana atual.
2. Clicar em horário vazio → criar bloco com 3 pomodoros → ver prévia de duração/término antes de salvar.
3. Arrastar o bloco para outro dia/horário; criar outro por cima → ⚠ Conflito.
4. Abrir bloco → **Iniciar cronômetro** → o bloco mostra "● Em andamento". Tentar iniciar outro bloco → aviso.
5. Deixar o foco zerar → som + banner + **TEMPO EXTRA +mm:ss**; pausar/retomar; recarregar a página (F5): a sessão continua.
6. **Iniciar pausa** → ao terminar: "aguardando você"; nada é contado até **Iniciar foco**.
7. **Encerrar** → bloco mostra foco + extra = total, pomodoros completos e parciais; o bloco **não** fica concluído sozinho.
8. Registrar questões/acertos (testar acertos > questões, negativos, decimais) → erros e taxa calculados.
9. **Relatórios**: filtrar por matéria/período, agrupar por semana, abrir blocos de cada linha.

## 7. Decisões de produto e premissas
- **Persistência local:** `localStorage` (um navegador, um estudante). Validar valor antes de investir em backend.
- **Configuração por bloco é uma cópia** da padrão no momento da criação: alterar o padrão não muda blocos existentes.
- **Realizado é atribuído ao dia em que a sessão INICIOU** (revisado na V2: o estudo permanece na semana em que ocorreu mesmo se o bloco for transferido, requisito 10); relatórios por período continuam agrupando por bloco.
- **Pausa manual durante foco/extra** conta como *interrupção*; pausar durante o descanso apenas congela o descanso.
- **Pausa longa:** a cada N pomodoros *concluídos* na sessão (não conta ciclos parciais). Cada sessão inicia uma nova sequência.
- **Bloco deve caber no dia** (termina até 24:00); precisão de 15 min no arrastar.
- Tempo extra só existe em foco; tempo após o fim da pausa, antes de retomar, **não é registrado**.

## 8. Riscos
| Risco | Mitigação |
|---|---|
| Navegador bloqueia áudio sem interação prévia | Áudio é liberado no primeiro clique; banner visual e notificação sempre disparam |
| Dados locais perdidos ao limpar o navegador | Próximo incremento: exportar/importar e depois conta com sincronização |
| Abas duplicadas alterando a mesma sessão | Evento `storage` sincroniza abas; sessão única por vez |

---

# Incremento 2 — Chat, cronograma e capacidade semanal (E07–E12)

*Origem: requisitos incrementais do usuário (sócio testador). Dependem do MVP atual (E01–E06).*

## 9. Princípio de arquitetura (regra geral do requisito 12)
**O chat interpreta e explica; os cálculos são determinísticos.** O modelo de linguagem só converte a mensagem em *comandos estruturados*
(criar, editar, mover, consultar, propor cronograma). Quem calcula tempo, conflitos, capacidade e desempenho é o `core.js`,
sobre os mesmos registros usados pelo calendário. Assim chat e calendário nunca divergem, nada é duplicado
e toda alteração passa por uma única porta (`applyChanges`), que também grava o histórico para **desfazer**.

Fluxo: mensagem → comandos (JSON) → validação/ambiguidade → *proposta* (diff) → confirmação → `applyChanges` → salvar → só então anunciar o resultado.
Pedido direto e inequívoco executa na hora; ambíguo ou com vários blocos pede escolha/confirmação antes.

## 10. Épicos e histórias

### E09 — Limite semanal e capacidade (Must, Sprint 5)
| ID | História | Critérios de aceite principais |
|---|---|---|
| US-09.1 | Definir limite | Horas líquidas de estudo; padrão salvo + exceção por semana; **não é meta de preenchimento** |
| US-09.2 | Indicadores no planejamento | Limite, estudo líquido planejado, **saldo = limite − planejado**, excesso quando houver |
| US-09.3 | Carga × agenda | Carga = só estudo; agenda = estudo + pausas. 3×50 min + 2×10 min ⇒ **2h30 de carga, 2h50 de agenda**. Bloco só cabe se couber na capacidade **e** na agenda |
| US-09.4 | Ao atingir o limite | Aviso; mostra o excesso **antes** de adicionar; oferece reduzir/substituir/transferir; ultrapassar só com decisão explícita; **nunca altera o limite sozinho** |
| US-09.5 | Saldo sem horário | Avisa quando há saldo de estudo mas faltam horários livres |

### E10 — Capacidade durante a semana (Must, Sprint 5)
| ID | História | Critérios de aceite principais |
|---|---|---|
| US-10.1 | Indicadores | Realizado (foco + extra), restante previsto, **projeção = realizado + restante**, **margem = limite − projeção** (negativa ⇒ "excesso projetado"). Ex.: 40h, 12h feitas, 20h previstas ⇒ 32h, margem 8h |
| US-10.2 | Contabilização | Bloco concluído não soma o planejado de novo; horas estudadas não são "liberadas"; extra entra uma única vez; pausas e interrupções fora |
| US-10.3 | Restante ajustável | Estimativa restante editável em bloco parcial; consumir o previsto **não** conclui o conteúdo |
| US-10.4 | Transferir pendência | Na semana de destino conta só o **restante**; o tempo já estudado permanece na semana de origem |
| US-10.5 | Alerta de reorganização | Sinaliza projeção acima do limite ou que não cabe nos horários restantes |

### E08 — Cronograma semanal gerado (Must, Sprint 6)
| ID | História | Critérios de aceite principais |
|---|---|---|
| US-08.1 | Disponibilidade reutilizável | Dias, faixas de horário, indisponibilidades, limite semanal e pomodoro padrão; salvos; **exceção por semana sem alterar a rotina padrão** |
| US-08.2 | Entrada dos blocos | Matéria/assunto, qtd. de blocos, pomodoros por bloco, material, prazo/prioridade/horário obrigatório |
| US-08.3 | Distribuição | Respeita blocos e revisões existentes, prazos e prioridades; foco + pausas; **sem sobreposição; sem estourar o limite em silêncio** |
| US-08.4 | O que não coube | Lista os blocos que não couberam **com o motivo**; nunca omite nem encurta atividade sem avisar |
| US-08.5 | Revisar e confirmar | Proposta editável (ajustes por chat ou manual); **só grava no calendário após confirmação** |

### E07 — Chat integrado ao calendário (Must, Sprint 7)
| ID | História | Critérios de aceite principais |
|---|---|---|
| US-07.1 | Criar/editar/consultar/reagendar | Interpreta o pedido, preenche os campos, aceita **vários blocos numa mensagem**, pergunta **só o que falta** |
| US-07.2 | Contexto | Usa blocos, resultados e configurações existentes |
| US-07.3 | Mover com verificação | "Mova Redes de quarta 14h para quinta 9h": identifica o bloco, checa o destino, move sem conflito; se ocupado, **apresenta opções** |
| US-07.4 | Ambiguidade | Bloco ou alteração ambíguos ⇒ pergunta **antes** de modificar |
| US-07.5 | Integração | Bloco do chat aparece no calendário; mudança no calendário é vista pelo chat; tempos/resultados idênticos; **sem duplicar** |
| US-07.6 | Relato | Informa o que foi alterado e as pendências |

### E12 — Ajustes do cronograma pelo chat (Should→Must, Sprint 7)
| ID | História | Critérios de aceite principais |
|---|---|---|
| US-12.1 | Pedidos de reorganização | "Perdi a manhã", "tenho 1h livre amanhã, o que cabe?", "preciso de mais 1 pomodoro", "adicione revisão na semana que vem", "mostre o que tenho e o tempo disponível" |
| US-12.2 | Regras da proposta | Considera horários restantes e capacidade; preserva concluídos e resultados; respeita fixos, revisões e prazos; **não duplica revisões**; mostra o que move e o que fica, e o efeito na carga/horários; pergunta a escolha quando não há prioridade |
| US-12.3 | Vários blocos | Proposta antes de aplicar; pedido direto e inequívoco executa e informa |
| US-12.4 | Confiabilidade | **Desfazer** o último conjunto do chat; não anuncia antes de salvar; informa o que foi e o que não foi aplicado |

### E11 — Relatório semanal com diagnóstico (Should, Sprint 8)
| ID | História | Critérios de aceite principais |
|---|---|---|
| US-11.1 | Geração | Automática no dia/hora de fechamento configurados; disponível na plataforma **e no chat**; atualizável se registros forem corrigidos |
| US-11.2 | Execução | Planejados/concluídos/atrasados/parciais/reagendados; planejado × estudado; extra; questões, acertos, erros, taxa. **Guarda a semana original** para o reagendamento não esconder o que não foi feito |
| US-11.3 | Forças e fraquezas | Melhor/pior desempenho por matéria e assunto **com o nº de questões que sustenta**; dificuldades registradas; desvio recorrente estimado × realizado; **avisa quando há poucos dados** |
| US-11.4 | Regras de análise | Sem questões ≠ 0%; mais tempo ≠ dificuldade; tempo cumprido ≠ concluído ≠ aprendido; taxa = Σacertos ÷ Σquestões com resultado; justificativa ligada aos registros |
| US-11.5 | Próxima semana | Blocos/revisões já programados, capacidade comprometida, sugestões (revisão, continuação, reagendamento) com razão e impacto, e o que não cabe. **É só proposta; não altera o calendário** |

## 11. Sprints do incremento 2
| Sprint | Meta | Conteúdo |
|---|---|---|
| 5 — *Capacidade* | Semana com limite e projeção (lógica pura + telas) | E09 + E10; novo modelo de dados (limite, exceção semanal, restante, semana original) |
| 6 — *Distribuir* | Motor de cronograma determinístico | E08 (sem chat: formulário + revisão de proposta) |
| 7 — *Conversar* | Chat sobre o motor | E07 + E12; camada `applyChanges` com histórico/desfazer |
| 8 — *Diagnosticar* | Relatório semanal e próxima semana | E11 |

Racional da ordem: o chat só é confiável sobre cálculos já testados; por isso capacidade e distribuição vêm antes e funcionam **sem** chat.

## 12. Decisões tomadas (usuário)
1. **Chat:** API da Anthropic (chave do usuário). A chave **nunca** vai no código nem no repositório: fica em variável de ambiente de um pequeno servidor/proxy local que recebe a mensagem, chama a API e devolve os comandos estruturados.
2. **Relatório automático:** gerado quando o app é aberto após o horário de fechamento (sem servidor sempre ligado); migrar para execução agendada em servidor quando houver backend hospedado.
3. **Revisão = tipo de bloco**, com vínculo ao bloco de origem (evita duplicar revisões e reaproveita calendário, capacidade e relatórios).
4. **Prioridade:** alta / média / baixa.
5. **Semana:** segunda a domingo, fuso local.

## 13. Análise de concorrentes (pré-requisito, antes de iniciar o Incremento 2)
Alvos: **Estudei, Rotinizze, TickTick, Focus Keeper, Notion Calendar, Todoist e Microsoft To Do.**
Para cada um, registrar em `docs/concorrentes/<nome>.md`: funcionalidades (calendário, blocos, pomodoro/tempo extra, questões e acertos,
relatórios, metas/limite, revisões, chat/IA, offline, preço) e design (densidade, cor de status, navegação, onboarding, mobile, tema escuro,
esforço para criar um bloco). Consolidar em matriz comparativa e extrair *o que adotar / evitar / diferenciar*.
