# Concorrente: Estudei

> Método: apenas material público (loja de apps e agregadores). **Nenhuma funcionalidade foi testada dentro do app**, portanto nada aqui está marcado `[verificado no app]`.
> Fontes: [App Store](https://apps.apple.com/us/app/estudei/id6740289500) · [mwm.ai (avaliações e métricas)](https://mwm.ai/apps/estudei/6740289500). O site `app.estudei.com.br` não expôs conteúdo sem login.

## 1. Visão geral e público-alvo
- Planejador de estudos para concursos, vestibular, universidade e residência médica. [fonte pública: https://apps.apple.com/us/app/estudei/id6740289500]
- Desenvolvedor: Seedy Soluções Tecnológicas em Educação LTDA. App nativo iOS recente (lançado em 06/04/2025; versão 1.9.8). [fonte pública: https://mwm.ai/apps/estudei/6740289500]
- Tração: ~50 mil downloads, nota 4,8–4,9 (os dois números aparecem inconsistentes na fonte). [fonte pública: https://mwm.ai/apps/estudei/6740289500]

## 2. Calendário semanal e blocos
- "Quadro de horários semanal" (versão 1.1.x) e sincronização com o calendário do dispositivo (1.5.1). [fonte pública: App Store, histórico de versões]
- Criar/mover/arrastar, conflitos, cores de status: [não confirmado]

## 3. Pomodoro/cronômetro
- Pomodoro existe desde a versão 1.7.0; também há "registro de horas" e ajustes no "acompanhamento de tempo". [fonte pública: App Store]
- Configuração, pausa longa, tempo extra, sessão única, alerta sonoro: [não confirmado]

## 4. Questões, acertos e erros
- Avaliadores citam as questões como apoio à constância, e há estatísticas de simulados com total de questões respondidas. [fonte pública: https://mwm.ai/apps/estudei/6740289500]
- "Caderno de erros" citado por usuário. [fonte pública: https://mwm.ai/apps/estudei/6740289500]
- Crítica de usuário: planos, simulados, questões e revisões "um pouco defeituosos". [fonte pública: https://mwm.ai/apps/estudei/6740289500]
- Taxa de acerto e validações: [não confirmado]

## 4b. Prioridade do testador: registro de estudos, relatórios e dados
O que se sabe publicamente (telas e fluxos passo a passo **não** puderam ser descritos: [não confirmado], exigem uso do app com conta):
- **Campos do registro de estudo** (conjunto citado na loja): horas, páginas lidas, aulas assistidas; tópicos podem ser cadastrados direto pelo registro (v1.9.8). [fonte pública: App Store]
- Limitação relatada: não registrar mais de um tópico de uma matéria numa só sessão sem criar dois registros. [fonte pública: https://mwm.ai/apps/estudei/6740289500]
- **Organização dos dados:** por disciplina e por tópico (edital verticalizado com controle do estudado; mapa de facilidades e dificuldades). [fonte pública: App Store]
- **Métricas citadas:** constância, progresso por disciplina, questões respondidas em simulados, ranking, conquistas. [fonte pública: App Store; mwm.ai]
- Filtros de relatório, formatos de gráfico, exportação, campos de questões/acertos no registro: [não confirmado].
- Referências similares encontradas (não são o Estudei): Gran Gerenciador de Estudos registra método, questões, acertos, páginas, assunto e ponto de parada, com estatística por dia/semana/mês. [fonte pública: https://apps.apple.com/us/app/-/id1535120105]
- Design visual (layout, cores, ícones) e capturas de tela: [não confirmado] — não obtidas. Sabe-se só que há modo claro e escuro. [fonte pública: App Store]

## 5. Relatórios e estatísticas
- Indicadores de constância e progresso por disciplina; registro de horas, páginas lidas e aulas assistidas; mapa de facilidades e dificuldades por tópico. [fonte pública: App Store]
- Ranking de estudos (1.7.5) e conquistas/medalhas (1.9.0). [fonte pública: App Store]
- Planejado × estudado: [não confirmado]

## 6. Meta/limite semanal e capacidade
- [não confirmado] (nenhuma menção a limite semanal em horas ou a capacidade).

## 7. Revisões espaçadas
- "Agendamento estratégico de revisões". [fonte pública: App Store]
- Usuário cita intervalos de 24 h, 7 dias e 21 dias. [fonte pública: https://mwm.ai/apps/estudei/6740289500] (relato de usuário, não documentação oficial)
- Edital verticalizado com controle do que foi estudado. [fonte pública: App Store]

## 8. Chat/IA e geração de cronograma
- Gera cronograma automaticamente, "ajustado ao ritmo". [fonte pública: App Store]
- Chat/IA conversacional: [não confirmado]. Algoritmo da geração (restrições, o que não coube): [não confirmado].

## 9. Offline, sincronização, plataformas, preço
- iPhone/iPad (iOS 16.4+) e visionOS. Há indício de app Android (`com.seedy.estudei`), sem dados. [fonte pública: App Store; mwm.ai]
- Grátis com compras no app; assinatura anual listada a US$ 39,99; teste grátis de 7 dias (1.6.0). [fonte pública: App Store]
- Offline: [não confirmado].
- Queixas recorrentes: layout em tablet, pedido de login insistente, suporte. Pedidos: registrar vários tópicos de uma matéria na mesma sessão, categorizar planos semanais, widgets. [fonte pública: https://mwm.ai/apps/estudei/6740289500]

## 10. Pontos fortes e fracos
**Fortes:** foco no concurseiro (edital verticalizado, caderno de erros, revisões), gamificação, boa avaliação.
**Fracos (relatados):** módulo de planos/simulados/revisões imaturo; problemas em tablet; exige conta; sem confirmação de plano × realizado nem de limite semanal.

## 11. Adotar, evitar, diferenciar (requisitos de `docs/MVP.md`)
- **Adotar:** revisões em intervalos fixos como tipo de bloco ligado à origem (E08/E12, decisão 3 do §12); registrar vários assuntos numa mesma sessão (pedido dos usuários, E06); lista de tópicos/edital como cadastro opcional.
- **Evitar:** login obrigatório e insistente (o MVP é local, sem conta); gamificação/ranking como prioridade.
- **Diferenciar:** tempo extra automático contado separado (E02/E03); plano × realizado × acertos em um relatório (E06/E11); limite semanal com saldo e projeção (E09/E10), sem equivalente confirmado; cronograma que **lista o que não coube e o porquê** (E08); chat que só propõe e confirma (E07/E12).
