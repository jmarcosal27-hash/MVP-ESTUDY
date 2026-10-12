# Roteiro de teste do Estudy (MVP final, requisitos 01–12) — para o sócio testador

**Objetivo:** usar o app como um estudante de verdade e dizer o que atrapalha, o que falta e o que sobra.
Cada anotação sua vira item do backlog. Não precisa saber programar: siga os passos e marque ✅ / ❌.

## 0. Preparação (5 min)
1. Abra o arquivo `estudy.html` no **Chrome** (duplo clique). Use sempre o **mesmo navegador**: os dados ficam nele.
2. **Não limpe os dados do navegador** durante o teste, ou você perde tudo.
3. Deixe o som do computador ligado.
4. Para testar rápido, em **⚙ Pomodoro padrão** use **Foco 1 min, Pausa curta 1 min, Pausa longa 2 min, longa a cada 2**. Volte para valores reais na Parte 4.
5. Tenha à mão um caderno ou o Bloco de Notas para anotar. Ao final, preencha a tabela da seção 6.

> Limites conhecidos (não precisa reportar): arrastar bloco só funciona com mouse (no celular use Editar); sem login; os dados ficam só neste navegador; o **chat** só funciona abrindo pelo `iniciar.bat` (servidor local com a chave da Anthropic). Sem isso o resto do app funciona normalmente.

---

## Parte 1 — Planejar a semana (calendário)
| # | Faça | Esperado | ✅/❌ |
|---|---|---|---|
| 1.1 | Clique em um horário vazio de amanhã | Abre o cadastro com dia e hora preenchidos |  |
| 1.2 | Crie "Redes · Camada de enlace" com **3 pomodoros**, foco 50, pausa curta 10 (abra "Pomodoro deste bloco") | Prévia: estudo **2h30**, descanso **20min**, reservado **2h50**, término = início + 2h50 |  |
| 1.3 | Salve. Veja o bloco no calendário | Altura e horário de término corretos; texto **"Em dia"**, cor azul |  |
| 1.4 | Arraste o bloco para outro dia e horário | Muda de lugar; horário em passos de 15 min |  |
| 1.5 | Crie outro bloco sobrepondo o primeiro | Ambos com **⚠ Conflito** e contorno laranja; passe o mouse para ver o motivo |  |
| 1.6 | Edite o bloco e aumente para 4 pomodoros | Duração e término recalculam; **a 4ª pausa não existe** (sem pausa após o último) |  |
| 1.7 | Tente salvar um bloco às 23:00 com 3 pomodoros | Recusa, avisando que passa da meia-noite |  |
| 1.8 | Navegue para a semana seguinte e volte com **Hoje** | Dia atual destacado e linha da hora atual |  |
| 1.9 | Veja o topo e o cabeçalho de cada dia | Totais planejados (estudo + descanso) por dia e na semana |  |

**Pergunta:** foi fácil montar a semana? Faltou algo (copiar bloco, repetir toda semana, cor por matéria, visão mensal)?

## Parte 2 — Estudar com o cronômetro
Use um bloco de **1 min de foco**.
| # | Faça | Esperado | ✅/❌ |
|---|---|---|---|
| 2.1 | Abra o bloco → **Iniciar cronômetro** | Painel no canto: "Foco", contagem regressiva; no calendário o bloco mostra **"● Em andamento"** |  |
| 2.2 | Tente iniciar outro bloco | Aviso: já existe um cronômetro ativo |  |
| 2.3 | Pause por ~20 s e retome | Contagem continua de onde parou |  |
| 2.4 | Deixe o foco **zerar**, com a aba aberta | **Som** + faixa laranja de aviso + fase **"Tempo extra"** com contador **+mm:ss** crescente. **Não** pede confirmação e **não** inicia o descanso |  |
| 2.5 | Pause e retome no tempo extra | O tempo extra continua de onde parou |  |
| 2.6 | **Aperte F5** com o cronômetro rodando | A sessão continua; nenhum tempo perdido |  |
| 2.7 | Troque de aba por 1–2 min e volte | A contagem está correta |  |
| 2.8 | Clique em **Iniciar pausa curta** | Fase "Pausa curta"; o tempo extra acumulado é preservado |  |
| 2.9 | Deixe a pausa terminar | Som + aviso; fica **"aguardando você"**; **nada** é contado até clicar em **Iniciar foco** |  |
| 2.10 | Inicie o 2º foco e **encerre antes de zerar** | Pede confirmação mostrando o tempo; salva como **ciclo parcial** |  |
| 2.11 | Abra o bloco | Mostra foco regular + extra = total estudado, pomodoros completos e parciais, descanso, interrupções |  |
| 2.12 | O bloco ficou concluído sozinho? | **Não deve**: só conclui no botão **Marcar como concluído** |  |

**Conferência de conta:** foco de 1 min + 12 s de extra deve aparecer como **1 min de foco + extra = ~1 min estudado**, 1 pomodoro completo.
**Perguntas:** o alerta sonoro é audível? O painel do cronômetro atrapalha a tela? Faltou algum botão (adicionar 5 min, pular pausa, estudar sem limite)?

## Parte 3 — Resultados (questões e acertos)
| # | Faça | Esperado | ✅/❌ |
|---|---|---|---|
| 3.1 | No bloco, preencha **10** questões e deixe acertos vazio | Mostra **"Resultado pendente"** (não 0%) |  |
| 3.2 | Preencha acertos **0** | Mostra 10 erros e **0,0%** (zero é diferente de vazio) |  |
| 3.3 | Acertos **11** | Erro: acertos não podem superar questões |  |
| 3.4 | Digite **-1**, **1,5** ou texto | Erro: só inteiros não negativos |  |
| 3.5 | Deixe questões vazias | Mostra **"Sem questões registradas"** |  |
| 3.6 | Acertos **7** de 10 → salve | 3 erros, **70,0%** |  |
| 3.7 | **Marcar como concluído** → bloco verde "Concluído"; depois **Reabrir** | Volta a azul ou vermelho conforme o horário |  |
| 3.8 | Deixe um bloco passar do horário de término sem concluir | Fica vermelho "Atrasado" |  |

## Parte 4 — Relatórios
Crie ao menos 3 matérias com blocos e resultados (⚙ → **Carregar dados de exemplo** ajuda).
| # | Faça | Esperado | ✅/❌ |
|---|---|---|---|
| 4.1 | Abra **Relatórios** | Tabela por matéria: planejado, estudado, foco, **extra separado**, descanso, questões, acertos, erros, taxa |  |
| 4.2 | Filtre por matéria e por período | Números mudam coerentemente |  |
| 4.3 | Agrupe por **Semana** | Uma linha por semana |  |
| 4.4 | Confira a **taxa geral** à mão | = soma dos acertos ÷ soma das questões **com resultado** (não a média das taxas) |  |
| 4.5 | Abra "Blocos do resultado" e clique em um bloco | Lista os blocos que compõem cada linha |  |
| 4.6 | Leia "Pontos de atenção" | Faz sentido? Ajuda a decidir o que estudar? |  |

**Perguntas:** que número você olharia primeiro toda semana? Qual está faltando (gráfico, evolução, comparação semana a semana)?

## Parte 5 — Uso real (3 a 5 dias)
Use o app **no lugar** da sua agenda de estudos, com valores reais de pomodoro (ex.: 50/10, longa 30 a cada 4).
Ao fim de cada dia, anote em 1 linha: *o que você tentou fazer e não conseguiu / achou chato*.
Teste também: fechar o navegador no meio de uma sessão e reabrir; estudar 2 sessões no mesmo bloco; estudar além do horário do bloco seguinte (deve aparecer ⚠).

## Parte 6 — Limite semanal e capacidade
Use ⚙ **Pomodoro padrão** para definir o limite (ex.: 20 h) e as faixas de estudo por dia (ex.: 08:00-12:00, 14:00-22:00; domingo vazio). Peça ao dono do projeto a pasta de teste e abra pelo `iniciar.bat`, ou use o `estudy.html`.
| # | Faça | Esperado | ✅/❌ |
|---|---|---|---|
| 6.1 | Defina limite de **4 h** e crie um bloco de **3 pomodoros de 50 min** (pausa 10) | Painel no topo: carga **2h 30min** (só estudo), saldo **1h 30min**; o bloco ocupa **2h 50min** na agenda |  |
| 6.2 | Crie um 2º bloco igual na mesma semana | Antes de salvar, avisa que ultrapassa o limite em **1h** e mostra alternativas (reduzir, semana seguinte, substituir). **Só grava se você aceitar**; o limite não muda sozinho |  |
| 6.3 | Aceite ultrapassar | Cartão "Excesso de planejamento" e "Excesso projetado" em vermelho |  |
| 6.4 | Botão **⚙ Semana** → limite 10 h só para esta semana | Esta semana usa 10 h; a **próxima semana continua com o padrão**; Configurações não mudou |  |
| 6.5 | Estude (cronômetro) parte de um bloco e veja o painel | "Estudado na semana" sobe (inclui tempo extra, uma vez); "Restante previsto" diminui; **Projeção = estudado + restante**; **Margem = limite − projeção** |  |
| 6.6 | Edite o bloco e ajuste "Restante previsto (min)" | A projeção muda de acordo; concluir o bloco zera o restante |  |
| 6.7 | Marque como "Indisponível" um horário (ex.: `3 12:00-14:00 Almoço`) e tente criar bloco nele | Aviso de que está fora da disponibilidade |  |
| 6.8 | No bloco, clique **＋ Agendar revisão** | Abre um bloco do tipo Revisão ligado ao original, uma semana depois |  |

## Parte 7 — Gerar cronograma
Botão **🗓 Gerar cronograma** (com a semana desejada aberta).
| # | Faça | Esperado | ✅/❌ |
|---|---|---|---|
| 7.1 | Item 1: "Constitucional", 2 blocos de 3 pomodoros. Item 2: "Redes", 3 blocos de 2 pomodoros. Gere | Proposta de **5 blocos**, sem sobreposição, dentro da disponibilidade, espalhando as matérias; cada linha explica **por quê** |  |
| 7.2 | Mude o dia/hora de uma linha e confirme | Grava com os seus ajustes; reverifica conflitos |  |
| 7.3 | Antes de confirmar, **nada** aparece no calendário | Correto: só grava ao clicar em "Confirmar e gravar" |  |
| 7.4 | Peça mais do que cabe no limite (ex.: 30 blocos) | Os que **não couberam** aparecem com o motivo (limite, sem horário, prazo…); nada some nem é encurtado em silêncio |  |
| 7.5 | Informe prazo curto ou um dia/hora obrigatório (🔒) | Prazo apertado tem prioridade; o horário obrigatório é respeitado |  |
| 7.6 | Já tendo blocos/revisões na semana, gere de novo | Os existentes **não são movidos nem duplicados** |  |

## Parte 8 — Chat (Assistente)
Exige abrir pelo `iniciar.bat`. Botão **💬 Assistente**.
| # | Escreva | Esperado | ✅/❌ |
|---|---|---|---|
| 8.1 | "Crie um bloco de Redes amanhã às 9h com 3 pomodoros" | Pergunta só o que faltar; mostra proposta e **só altera após confirmar** (pedido direto e sem conflito pode executar na hora e informar) |  |
| 8.2 | "Mova o bloco de Redes de quarta às 14h para quinta às 9h" | Move se estiver livre; se **ocupado**, oferece horários livres; se houver 2 blocos "Redes", **pergunta qual** antes de mexer |  |
| 8.3 | Vários blocos numa mensagem: "Crie Português seg 8h 2 pomodoros e Direito ter 10h 3 pomodoros" | Cria os dois, sem duplicar, e informa o que foi feito |  |
| 8.4 | "Tenho 1 hora livre amanhã, o que cabe?" | Resposta baseada nos horários reais (confira com o calendário) |  |
| 8.5 | "Perdi a manhã de hoje, reorganize os pendentes" | Mostra **quais mudam e quais ficam** e o efeito na carga; só aplica depois de confirmar |  |
| 8.6 | "Preciso de mais um pomodoro neste assunto" / "Adicione uma revisão na próxima semana" | Faz o ajuste (ou propõe), sem duplicar revisão existente |  |
| 8.7 | "Mostre o que tenho programado e quanto tempo ainda tenho" | Números **iguais** aos do painel de capacidade |  |
| 8.8 | Mude um bloco **no calendário** e pergunte sobre ele no chat | O chat enxerga a mudança |  |
| 8.9 | Clique em **Desfazer última alteração do chat** | Volta ao estado anterior; informa o que foi desfeito |  |
| 8.10 | Peça algo que estoure o limite | Mostra o excesso e alternativas antes de aplicar |  |

## Parte 9 — Relatório semanal
Aba **Relatório semanal**. O relatório da semana fechada é gerado ao abrir o app depois do fechamento (padrão: domingo 21:00; mude em Configurações). Para testar sem esperar, escolha a semana no seletor e clique **Atualizar relatório**.
| # | Faça | Esperado | ✅/❌ |
|---|---|---|---|
| 9.1 | Abra um relatório de semana com blocos e resultados | Planejados/concluídos/atrasados/parciais, planejado × estudado, **extra separado**, questões, acertos, erros, taxa |  |
| 9.2 | Matéria com poucas questões | Aparece em **"Poucos dados"** (não vira força nem fraqueza) |  |
| 9.3 | Matéria sem questões | **Nunca** aparece como 0%; fica "sem questões com resultado" |  |
| 9.4 | Matéria com mais tempo, mas sem erros | O relatório **não** conclui "dificuldade" só por tempo |  |
| 9.5 | Reagende um bloco para a semana seguinte | O relatório da semana original **ainda mostra** que ele não foi feito |  |
| 9.6 | Corrija um resultado e clique em Atualizar | Os números se recalculam |  |
| 9.7 | "Preparando a semana seguinte" | Mostra o que já está programado, a capacidade comprometida e sugestões **com motivo e impacto**; o que não cabe é listado |  |
| 9.8 | Clique em "Aplicar esta sugestão…" | Pede confirmação mostrando as mudanças; **sem confirmar, nada muda** |  |
| 9.9 | O chat avisou que o relatório está pronto? | Sim, mensagem no chat (se o assistente estiver aberto) |  |


## 11. Formulário de feedback
Preencha uma linha por item. Gravidade: **A** = impede de usar · **B** = atrapalha · **C** = incômodo/ideia.
| # | Tela/Parte | O que aconteceu ou o que faltou | Esperava | Gravidade (A/B/C) | Frequência (sempre/às vezes) |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

## 12. Perguntas finais (responda em 1–2 frases)
1. Você trocaria sua agenda atual por este app? O que falta para isso?
2. Qual recurso você mais usou? Qual nunca usou?
3. O que mais te irritou?
4. Dos recursos novos (chat, cronograma gerado, limite/capacidade semanal, relatório semanal), qual **mais ajudou** e qual **mais atrapalhou**?
5. Comparando com Estudei / Focus Keeper / TickTick: o que eles fazem melhor que este app?

*Envie as anotações ao dono do projeto; o maestro transforma em backlog priorizado em `docs/MVP.md`.*
