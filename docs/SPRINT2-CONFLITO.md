# Sprint 2 — Motor da regra de conflito (briefing para o agente)

Você é o **Agente C**. O maestro (outra sessão) cuida da tela; **você faz só o motor puro e os testes**. Leia antes: `docs/ARQUITETURA-V2.md`, `js/core.js`, `js/capacity.js`, `js/commands.js` (função `overlapsOf`), `tests/core.test.js`.

## Regras já decididas pelo dono do projeto
- O bloco reserva **todo o seu período**: foco + pausas curtas + pausa longa (como `core.blockSpan`/`planBlock` já calculam). **Mantém-se: sem pausa depois do último pomodoro** — o bloco termina quando o último foco termina.
- Ao criar, mover ou mudar a duração de um bloco, **qualquer** interseção do período total do novo bloco com outro bloco (incluindo as pausas dos dois) é conflito.
- **Horários colados não conflitam**: um bloco pode começar exatamente quando outro termina (intervalo semiaberto `[início, fim)`).
- Bloco em conflito = **proposta pendente** (`block.pending = true`): não é confirmado, não entra na carga/limite nem nos totais (só depois de confirmado) e **o bloco existente nunca é alterado**.
- Mensagens (texto exato, em português):
  - Conflito numa **pausa** do bloco existente:
    `Opa! Essa pausa já tem dono. ☕` / `Das {de} às {até}, você tem uma {pausa curta|pausa longa} do bloco {nome}.` / `Não é possível agendar outro bloco nesse período. Descanso também faz parte do planejamento — você é estudante, não uma máquina! 😂` / `O que deseja fazer?`
  - Conflito num **foco** do bloco existente: `Esse horário já está reservado.` / `Das {de} às {até}, você tem um período de estudo reservado do bloco {nome}.` / `Não é possível agendar outro bloco nesse período.` / `O que deseja fazer?`
  - Botão 1: `MOVER PARA DEPOIS DE {nome}`. Botão 2: `ESCOLHER OUTRO HORÁRIO`.
- "Mover para depois": o novo bloco começa **exatamente quando o bloco existente termina por completo**. Antes de permitir, verificar que **todo o período do novo bloco (com pausas)** cabe nesse ponto (sem outro conflito e sem passar da meia-noite); se não couber, a opção vem **desabilitada com o motivo**.
- Se houver conflito com **mais de um** bloco, o pop-up trata o **primeiro** (o que começa antes) e, depois de resolvido, reavalia.

## Entrega: `js/conflict.js` (UMD, puro, sem DOM/storage) + `tests/conflict.test.js`
Padrão de módulo igual a `js/capacity.js` (`module.exports` em Node, `window.Conflict` no navegador). Tempos em minutos desde 00:00 do dia do bloco.
```js
blockSegments(block) -> [{ type:'focus'|'short'|'long', n, startMin, endMin }]   // linha do tempo do bloco, sem pausa depois do último foco
blockInterval(block) -> { startMin, endMin }                                    // = [início, início + duração total)
checkConflict(state, draft, { ignoreId }) -> {
  ok: boolean,
  conflicts: [ { blockId, title, overlap:{ startMin, endMin },                 // trecho da interseção
                 theirPart: { type, startMin, endMin },                         // parte do bloco EXISTENTE que cobre o início da interseção
                 kind: 'pause'|'focus' } ]                                      // ordenado pelo início da interseção; ignora blocos pending
}
conflictMessage(conflict, existingBlock) -> { title, lines:[...], pauseLabel?, from:'HH:MM', to:'HH:MM' }   // textos exatos acima
moveAfter(state, draft, existingBlockId) -> { ok:true, start:'HH:MM' } | { ok:false, code:'OTHER_CONFLICT'|'PAST_MIDNIGHT', reason:'…em português…' }
isConfirmable(state, block) -> boolean                                         // false se houver conflito (ou se não for válido)
findLegacyConflicts(state) -> [ { a:blockId, b:blockId, date } ]               // pares já sobrepostos em dados antigos (para a tela só marcar; NUNCA apagar nem mover)
```
- Considere só blocos do **mesmo dia**; ignore o próprio bloco (`ignoreId`) e blocos `pending`.
- `draft` é um bloco (mesmos campos de `core`), com `date`, `start`, `estimated`, `config`.
- Não altere `core.js`, `capacity.js`, `commands.js`, `scheduler.js`, `app.js`, `index.html`, `css/`. Se precisar de algo nesses arquivos, **escreva em `docs/revisoes/sprint2-pedidos.md`** o que e por quê (o maestro aplica).

## Testes obrigatórios (`node --test tests/*.test.js` deve continuar 100% verde)
1. Sobreposição no foco e na pausa curta/longa do bloco existente (mensagem e horários certos, `kind` correto).
2. **Pausa × pausa** também conflita. Novo bloco contendo, por inteiro, uma pausa do existente conflita.
3. **Horários colados não conflitam** (novo começa no minuto em que o outro termina; e o inverso).
4. Mudança de duração (mais pomodoros) que invade o próximo bloco; mover para cima de outro.
5. Vários conflitos: ordem por início; `moveAfter` rejeita quando o fim do existente + duração do novo bate noutro bloco (`OTHER_CONFLICT`) e quando passa de 24:00 (`PAST_MIDNIGHT`).
6. `moveAfter` correto com bloco existente que tem pausa longa no meio (duração total certa).
7. Blocos `pending` são ignorados por `checkConflict`; `isConfirmable`.
8. `findLegacyConflicts` com dados antigos sobrepostos; não muta o estado (teste de snapshot).
9. Exemplo numérico: bloco A 08:00, 3 pomodoros de 50 min com pausas de 10 (termina 10:50); B 10:00 com 1 pomodoro de 50 → conflito no foco do A; `moveAfter` → 10:50. B às 08:55 → cai na pausa curta 08:50–09:00 do A → `kind:'pause'`, mensagem com "pausa curta" e "08:55"/"09:00" (o trecho sobreposto é 08:55–09:00; a pausa inteira é 08:50–09:00 e é isso que a mensagem mostra em "Das … às …").

## Fluxo
`git pull --rebase origin claude/clever-meitner-98dao2` → trabalhar só em `js/conflict.js` e `tests/conflict.test.js` (e o pedido, se houver) → `node --test tests/*.test.js` → commit pequeno (terminar com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`) → `git pull --rebase` → `git push origin HEAD:claude/clever-meitner-98dao2` (sem force). Não abra nem imprima o arquivo `.env`. No final, diga em 5 linhas: o que entregou, resultado dos testes, decisões que tomou e dúvidas.
