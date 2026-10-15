const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../js/conflict.js');
const Cap = require('../js/capacity.js');

const cfg = { focusMin: 50, shortMin: 10, longEvery: 2, longMin: 30 };
const D = '2026-10-15';
const mk = (id, start, estimated, o = {}) => ({ id, title: 'Bloco ' + id, subject: 'X', date: D, start, estimated, config: cfg, sessions: [], ...o });
const st = (...blocks) => Cap.normalizeState({ blocks });

// A: 08:00, 3 pomodoros de 50, pausa curta 10 (após o 1º), pausa LONGA 30 (após o 2º) => 08:00–10:50+? calcula abaixo
const A = mk('A', '08:00', 3);   // foco 08:00-08:50, curta 08:50-09:00, foco 09:00-09:50, longa 09:50-10:20, foco 10:20-11:10

test('segmentos: foco/pausas na ordem, sem pausa depois do último foco', () => {
  const s = K.blockSegments(A);
  assert.deepEqual(s.map((g) => [g.type, g.startMin, g.endMin]), [['focus', 480, 530], ['short', 530, 540], ['focus', 540, 590], ['long', 590, 620], ['focus', 620, 670]]);
  assert.deepEqual(K.blockInterval(A), { startMin: 480, endMin: 670 });
});
test('conflito no FOCO do bloco existente', () => {
  const r = K.checkConflict(st(A), mk('N', '08:30', 1));
  assert.equal(r.ok, false); assert.equal(r.conflicts[0].kind, 'focus'); assert.equal(r.conflicts[0].overlap.startMin, 510);
});
test('conflito na PAUSA CURTA e na PAUSA LONGA (mensagem com tipo e horário da pausa inteira)', () => {
  const curta = K.checkConflict(st(A), mk('N', '08:55', 1));            // começa dentro da curta 08:50–09:00 e invade o foco
  assert.equal(curta.conflicts[0].kind, 'pause'); assert.equal(curta.conflicts[0].theirPart.type, 'short');
  const m = K.conflictMessage(curta.conflicts[0], A);
  assert.equal(m.title, 'Opa! Essa pausa já tem dono. ☕'); assert.equal(m.pauseLabel, 'pausa curta');
  assert.equal(m.lines[0], 'Das 08:50 às 09:00, você tem uma pausa curta do bloco Bloco A.');
  assert.match(m.lines[1], /você é estudante, não uma máquina! 😂/); assert.equal(m.lines[2], 'O que deseja fazer?');
  const longa = K.checkConflict(st(A), mk('N', '09:55', 1));
  assert.equal(longa.conflicts[0].theirPart.type, 'long');
  assert.match(K.conflictMessage(longa.conflicts[0], A).lines[0], /pausa longa do bloco/);
});
test('mensagem no foco: adaptada para "período de estudo reservado"', () => {
  const c = K.checkConflict(st(A), mk('N', '08:10', 1)).conflicts[0];
  const m = K.conflictMessage(c, A);
  assert.equal(m.title, 'Esse horário já está reservado.');
  assert.equal(m.lines[0], 'Das 08:00 às 08:50, você tem um período de estudo reservado do bloco Bloco A.');
});
test('pausa × pausa também conflita; bloco novo que contém uma pausa inteira também', () => {
  const B = mk('B', '08:50', 1, { config: { ...cfg, focusMin: 5 } });              // 08:50–08:55 dentro da pausa curta de A
  assert.equal(K.checkConflict(st(A), B).ok, false);
  const N = mk('N', '08:45', 2, { config: { ...cfg, focusMin: 4, shortMin: 20 } });  // novo: foco 08:45-08:49, pausa 08:49-09:09 (sobrepõe a pausa de A e o foco seguinte)
  assert.equal(K.checkConflict(st(A), N).ok, false);
});
test('HORÁRIOS COLADOS não conflitam (nos dois sentidos)', () => {
  assert.equal(K.checkConflict(st(A), mk('N', '11:10', 1)).ok, true);                // começa quando A termina
  assert.equal(K.checkConflict(st(A), mk('N', '07:10', 1)).ok, true);                // termina quando A começa
  assert.equal(K.checkConflict(st(A), mk('N', '07:11', 1)).ok, false);               // 1 minuto de sobreposição
});
test('duração maior que invade o próximo; outro dia nunca conflita; ignoreId e pending', () => {
  const next = mk('B', '09:00', 1);
  assert.equal(K.checkConflict(st(next), mk('N', '08:00', 1)).ok, true);             // 08:00–08:50
  assert.equal(K.checkConflict(st(next), mk('N', '08:00', 2)).ok, false);            // com 2 pomodoros passa de 09:00
  assert.equal(K.checkConflict(st(A), mk('N', '08:30', 1, { date: '2026-10-16' })).ok, true);
  assert.equal(K.checkConflict(st(A), A).ok, true);                                  // ele mesmo
  assert.equal(K.checkConflict(st(mk('P', '08:00', 1, { pending: true })), mk('N', '08:10', 1)).ok, true); // pendente é ignorado
});
test('vários conflitos: ordenados pelo início da interseção', () => {
  const r = K.checkConflict(st(mk('B', '10:00', 1), mk('A2', '08:00', 1)), mk('N', '08:30', 4, { config: { ...cfg, focusMin: 60, shortMin: 0 + 10 } }));
  assert.ok(r.conflicts.length >= 2); assert.ok(r.conflicts[0].overlap.startMin <= r.conflicts[1].overlap.startMin);
});
test('moveAfter: começa exatamente quando o existente termina por completo', () => {
  const r = K.moveAfter(st(A), mk('N', '08:30', 1), 'A');
  assert.deepEqual(r, { ok: true, start: '11:10', date: D });
});
test('moveAfter: rejeita quando bate em outro bloco ou passa da meia-noite', () => {
  const blocker = mk('B', '11:30', 1);
  const r = K.moveAfter(st(A, blocker), mk('N', '08:30', 1), 'A');                    // 11:10–12:00 bate em B (11:30)
  assert.equal(r.ok, false); assert.equal(r.code, 'OTHER_CONFLICT'); assert.match(r.reason, /bateria em "Bloco B"/);
  const late = mk('L', '21:00', 3);                                                   // termina 23:50
  const m = K.moveAfter(st(late), mk('N', '20:00', 1), 'L');
  assert.equal(m.ok, false); assert.equal(m.code, 'PAST_MIDNIGHT');
});
test('isConfirmable: só sem conflito e válido', () => {
  assert.equal(K.isConfirmable(st(A), mk('N', '11:10', 1)), true);
  assert.equal(K.isConfirmable(st(A), mk('N', '08:30', 1)), false);
  assert.equal(K.isConfirmable(st(A), mk('N', '23:30', 3)), false);                    // passa da meia-noite
});
test('exemplo do dono: A 08:00 (3x50 com pausas) e B às 10:00 => conflito no foco; mover => depois de A', () => {
  const A2 = mk('A', '08:00', 3, { config: { focusMin: 50, shortMin: 10, longEvery: 4, longMin: 30 } }); // 08:00–10:50
  const B = mk('B', '10:00', 1);
  const c = K.checkConflict(st(A2), B).conflicts[0];
  assert.equal(c.kind, 'focus');
  assert.equal(K.moveAfter(st(A2), B, 'A').start, '10:50');
  const curta = K.checkConflict(st(A2), mk('B', '08:55', 1)).conflicts[0];
  assert.equal(curta.kind, 'pause'); assert.equal(K.conflictMessage(curta, A2).from, '08:50');
});
test('findLegacyConflicts: marca pares sobrepostos sem mutar o estado', () => {
  const s = st(mk('A', '08:00', 1), mk('B', '08:30', 1), mk('C', '09:00', 1));
  const snap = JSON.stringify(s);
  const r = K.findLegacyConflicts(s);
  assert.deepEqual(r, [{ a: 'A', b: 'B', date: D }, { a: 'B', b: 'C', date: D }]); // B (08:30–09:20) invade A e C
  assert.equal(JSON.stringify(s), snap);
});

test('pendente não ocupa horário nem entra na capacidade (só depois de confirmado)', () => {
  const pend = mk('P', '08:00', 2, { pending: true });
  const s = st(pend);
  assert.equal(Cap.freeIntervals({ ...s, settings: { ...s.settings, availability: { days: { 4: [{ from: '08:00', to: '12:00' }] }, unavailable: [] } } }, D).length, 1);
  assert.equal(Cap.capacityFor(s, '2026-10-12', new Date(2026, 9, 15, 7).getTime()).plannedNetMin, 0);
  const conf = { ...pend, pending: false };
  assert.ok(Cap.capacityFor(st(conf), '2026-10-12', new Date(2026, 9, 15, 7).getTime()).plannedNetMin > 0);
});
