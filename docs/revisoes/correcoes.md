# Correções aplicadas após as revisões (maestro)

Base: `seguranca-e-bugs.md` (Agente A) e `qa-navegador.md` (Agente B). Testes: 104 unitários (`node --test tests/*.test.js`, inclui `tests/hardening.test.js`) + fluxos de navegador.

| Achado | Correção | Onde |
|---|---|---|
| A1 XSS via chat (campos sem validação) | `create_block` só aceita campos conhecidos e **gera o id**; `update_block` valida tipo/formato de cada campo; blocos são saneados em `normalizeBlock`; `esc()` nos atributos restantes | `commands.js`, `capacity.js`, `app.js` |
| M1 / F3 dado antigo ou corrompido | `normalizeBlock` preenche `config`; blocos/sessão inválidos vão para `quarantine` (não somem nem quebram); JSON ilegível gera cópia `estudy.mvp.v1.corrompido` e aviso | `capacity.js`, `app.js` |
| M2 datas/horas/valores impossíveis | `okDate`/`okTime` reais (rejeita 2026-02-31 e 12:75); `remainingMin` só inteiro ≥ 0 | `core.js`, `commands.js` |
| M3 desfazer limite da semana | restaura o padrão (remove a exceção) em vez de deixar "sem limite" | `commands.js` |
| M4 desfazer parcial | só marca como desfeito se tudo voltou; o restante continua desfazível; mensagem "desfeito parcialmente" | `commands.js`, `chat.js` |
| M5 excluir com cronômetro ativo | barrado com orientação para encerrar antes | `commands.js` |
| B1 / B2 servidor | 413 legível; limite de contexto (120 KB); timeout de 30 s na API; Origin só da mesma porta | `server/` |
| B3 sugestão repetida | relatório ignora atrasado que já tem continuação futura | `weeklyreport.js` |
| B4 arrastar | confirma conflito, bloco concluído/fixo e estouro de limite; trata bloco sumido | `app.js` |
| F1 aplicar sugestão | horários livres como botões, depois confirmação | `app.js` |
| F2 Limpar relatórios | volta para "Todas" | `app.js` |
| F4 som após F5 | aviso "clique para ativar o som" | `app.js` |
| F5/F12 acessibilidade | blocos por teclado (Tab/Enter), `aria-label`, `aria-pressed`, fase do cronômetro com `role=status` | `app.js` |
| F6 duas abas | salvar edita o bloco do estado **atual**; avisa se foi excluído | `app.js` |
| F7 contraste | cores novas (≥ 4,5:1 nos pares medidos) claro e escuro | `styles.css`, `chat.css` |
| F8 timer × chat | gaveta sobe 292 px com cronômetro | `styles.css` |
| F9 texto de limite | "excesso de X" em vez de "saldo (excesso)" | `commands.js` |
| F10 painel atrasado | com cronômetro, atualiza a cada 10 s | `app.js` |
| F11 referência por título | título exato vence o parcial | `commands.js` |
| F13 conflitos sobrepostos | blocos em conflito ficam lado a lado | `app.js` |

Não corrigido (ideias, registradas em `qa-navegador.md` §5): backup/exportação JSON, copiar/repetir bloco, cor por matéria, horário de verão (hipótese não confirmada; sem DST no Brasil).
