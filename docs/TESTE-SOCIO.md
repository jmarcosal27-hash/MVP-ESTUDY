# Roteiro de teste do Estudy — para o sócio testador

**Objetivo:** usar o app como um estudante de verdade e dizer o que atrapalha, o que falta e o que sobra.
Cada anotação sua vira item do backlog. Não precisa saber programar: siga os passos e marque ✅ / ❌.

## 0. Preparação (5 min)
1. Abra o arquivo `estudy.html` no **Chrome** (duplo clique). Use sempre o **mesmo navegador**: os dados ficam nele.
2. **Não limpe os dados do navegador** durante o teste, ou você perde tudo.
3. Deixe o som do computador ligado.
4. Para testar rápido, em **⚙ Pomodoro padrão** use **Foco 1 min, Pausa curta 1 min, Pausa longa 2 min, longa a cada 2**. Volte para valores reais na Parte 4.
5. Tenha à mão um caderno ou o Bloco de Notas para anotar. Ao final, preencha a tabela da seção 6.

> Limites conhecidos (não precisa reportar): arrastar bloco só funciona com mouse (no celular use Editar); ainda **não existe chat**, geração automática de cronograma nem limite semanal; sem login.

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

## 6. Formulário de feedback
Preencha uma linha por item. Gravidade: **A** = impede de usar · **B** = atrapalha · **C** = incômodo/ideia.
| # | Tela/Parte | O que aconteceu ou o que faltou | Esperava | Gravidade (A/B/C) | Frequência (sempre/às vezes) |
|---|---|---|---|---|---|
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

## 7. Perguntas finais (responda em 1–2 frases)
1. Você trocaria sua agenda atual por este app? O que falta para isso?
2. Qual recurso você mais usou? Qual nunca usou?
3. O que mais te irritou?
4. Dos itens que **ainda não existem** (chat para criar/alterar blocos, cronograma gerado, limite semanal de horas, relatório semanal com diagnóstico), qual você mais quer **primeiro**?
5. Comparando com Estudei / Focus Keeper / TickTick: o que eles fazem melhor que este app?

*Envie as anotações ao dono do projeto; o maestro transforma em backlog priorizado em `docs/MVP.md`.*
