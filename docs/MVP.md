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
- **Realizado é atribuído ao dia do bloco** (não ao dia em que a sessão ocorreu) nos totais do calendário e relatórios.
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
