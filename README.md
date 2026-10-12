# Estudy (MVP)

Plataforma para organizar estudos em blocos: **calendário semanal**, **pomodoro configurável com tempo extra automático**,
planejamento por pomodoros, situação dos blocos e **registro de desempenho com relatórios**.

Planejamento ágil (visão, backlog, critérios de aceite, sprints): [`docs/MVP.md`](docs/MVP.md).

## Executar
Aplicação estática, sem dependências nem build. Abra `index.html` no navegador ou sirva a pasta:

```bash
python3 -m http.server 8000   # http://localhost:8000
```

Em **⚙ Pomodoro padrão → Carregar dados de exemplo** há uma semana pronta para demonstração.
Os dados ficam no `localStorage` do navegador.

## Testes
As regras de negócio (`js/core.js`) são testadas com o runner nativo do Node (≥ 18):

```bash
node --test tests/core.test.js
```

## Estrutura
- `js/core.js` – regras puras: planejamento, situação, desempenho, máquina de estados do cronômetro, conflitos, consolidação.
- `js/app.js` – interface (calendário, diálogo do bloco, cronômetro, relatórios, persistência).
- `css/styles.css`, `index.html` – layout (claro/escuro automático).
