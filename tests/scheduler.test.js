const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const Cap = require('../js/capacity.js');
const S = require('../js/scheduler.js');

const MONDAY = '2026-10-12';
const NOW = new Date(2026, 9, 12, 7, 0).getTime(); // segunda 07:00
const cfg50 = { focusMin: 50, shortMin: 10, longEvery: 4, longMin: 30 };
const day = [{ from: '08:00', to: '12:00' }, { from: '14:00', to: '18:00' }];
const mkState = (o = {}) => ({
  settings: { config: cfg50, weeklyLimitMin: 4800,
    availability: { days: { 1: day, 2: day, 3: day, 4: day, 5: day }, unavailable: [{ day: 3, from: '12:00', to: '14:00', label: 'Almoço' }] },
    ...(o.settings || {}) },
  weekOverrides: o.weekOverrides || {},
  blocks: o.blocks || [],
});
const mkBlock = (o) => ({ id: 'b1', subject: 'Penal', title: 'Existente', date: MONDAY, start: '08:00', estimated: 3, config: cfg50, kind: 'estudo', ...o });
const item = (o) => ({ subject: 'Constitucional', blocks: 1, pomodoros: 3, ...o });
const run = (state, items, extra = {}, now = NOW) => S.proposeSchedule(state, { items, preserveExisting: true, ...extra }, MONDAY, now);
const net = (p) => p.estimated * p.config.focusMin;
const span = (b) => C.blockSpan({ start: b.start, estimated: b.estimated, config: b.config });

function assertNoOverlap(blocks) {
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    if (a.date !== b.date) continue;
    const x = span(a), y = span(b);
    assert.ok(x.endMin <= y.startMin || y.endMin <= x.startMin, `sobreposição: ${a.title} x ${b.title} em ${a.date}`);
  }
}

test('08 - exemplo do requisito: 2x Constitucional (3 pom) + 3x Redes (2 pom), quarta só de manhã, revisão preservada', () => {
  const review = mkBlock({ id: 'r1', title: 'Revisão Penal', kind: 'revisao', reviewOf: 'b0', date: '2026-10-13', start: '08:00', estimated: 2 });
  const state = mkState({ blocks: [review] });
  const snapshot = JSON.stringify(state);
  const r = run(state, [item({ blocks: 2, pomodoros: 3 }), item({ subject: 'Redes', blocks: 3, pomodoros: 2 })],
    { weekOverrides: { days: { 3: [{ from: '08:00', to: '12:00' }] } } });
  assert.equal(r.placements.length, 5);
  assert.equal(r.unplaced.length, 0);
  assert.equal(JSON.stringify(state), snapshot, 'o estado original não pode ser alterado');
  assertNoOverlap([review, ...r.placements]);
  for (const p of r.placements.filter((x) => x.date === '2026-10-14')) {
    assert.ok(span(p).startMin >= C.toMin('08:00') && span(p).endMin <= C.toMin('12:00'), 'quarta: só de manhã');
  }
  assert.equal(r.placements.filter((p) => p.subject === 'Redes').every((p) => p.estimated === 2), true);
});

test('08 - sem sobreposição entre propostas, mesmo com muitos blocos', () => {
  const state = mkState({ blocks: [mkBlock()] });
  const r = run(state, [item({ blocks: 4 }), item({ subject: 'Redes', blocks: 4, pomodoros: 2 })]);
  assertNoOverlap([...state.blocks, ...r.placements]);
});

test('08 - respeita o limite semanal líquido, conta o que já existe e nunca encurta bloco', () => {
  const state = mkState({ settings: { weeklyLimitMin: 500 }, blocks: [mkBlock()] }); // existente: 150 líquidos
  const r = run(state, [item({ blocks: 4, pomodoros: 3 })]);                              // saldo 350 => cabem 2 (300)
  assert.equal(r.placements.length, 2);
  assert.equal(r.unplaced.length, 2);
  assert.ok(r.unplaced.every((u) => u.code === 'LIMIT' && /limite semanal/i.test(u.reason)));
  assert.ok(r.placements.every((p) => p.estimated === 3));
  assert.equal(r.placements.reduce((s, p) => s + net(p), 0) + 150 <= 500, true);
  assert.equal(r.capacity.after.plannedNetMin, 450);
  assert.ok(r.warnings.some((w) => w.code === 'UNPLACED'));
});

test('08 - o que não coube vai em unplaced com código e motivo em português', () => {
  const tiny = mkState({ settings: { availability: { days: { 1: [{ from: '08:00', to: '09:00' }] }, unavailable: [] } } });
  const a = run(tiny, [item({ pomodoros: 3 })]);
  assert.equal(a.placements.length, 0);
  assert.equal(a.unplaced[0].code, 'NO_SLOT');
  assert.match(a.unplaced[0].reason, /horário livre/);
  const none = mkState({ settings: { availability: { days: {}, unavailable: [] } } });
  const b = run(none, [item()]);
  assert.equal(b.unplaced[0].code, 'UNAVAILABLE');
});

test('08 - prazo vence prioridade quando o prazo aperta (dentro da semana)', () => {
  const state = mkState({ settings: { weeklyLimitMin: 150 } }); // cabe um único bloco de 3 pomodoros
  const r = run(state, [
    item({ subject: 'Constitucional', priority: 'alta' }),
    item({ subject: 'Redes', priority: 'baixa', deadline: '2026-10-14' }),
  ]);
  assert.equal(r.placements.length, 1);
  assert.equal(r.placements[0].subject, 'Redes');
  assert.ok(r.placements[0].date <= '2026-10-14');
  assert.equal(r.unplaced[0].item.subject, 'Constitucional');
  assert.equal(r.unplaced[0].code, 'LIMIT');
});

test('08 - com prazo folgado (semana seguinte), a prioridade manda', () => {
  const state = mkState({ settings: { weeklyLimitMin: 150 } });
  const r = run(state, [
    item({ subject: 'Redes', priority: 'baixa', deadline: '2026-10-20' }),
    item({ subject: 'Constitucional', priority: 'alta' }),
  ]);
  assert.equal(r.placements[0].subject, 'Constitucional');
  assert.equal(r.unplaced[0].item.subject, 'Redes');
});

test('08 - prazo impossível: há horário, mas só depois do prazo => DEADLINE', () => {
  const state = mkState({ settings: { availability: { days: { 5: day }, unavailable: [] } } });
  const r = run(state, [item({ deadline: '2026-10-14' })]);
  assert.equal(r.placements.length, 0);
  assert.equal(r.unplaced[0].code, 'DEADLINE');
  assert.match(r.unplaced[0].reason, /prazo/);
});

test('08 - horário obrigatório é respeitado e não é tomado por outros blocos', () => {
  const state = mkState();
  const r = run(state, [
    item({ subject: 'Redes', blocks: 6, pomodoros: 2, priority: 'alta' }),
    item({ subject: 'Fixo', pomodoros: 2, fixedDate: '2026-10-14', fixedStart: '10:00' }),
  ]);
  const fixo = r.placements.find((p) => p.subject === 'Fixo');
  assert.equal(fixo.date, '2026-10-14');
  assert.equal(fixo.start, '10:00');
  assert.equal(fixo.fixed, true);
  assertNoOverlap(r.placements);
});

test('08 - horário obrigatório indisponível (almoço) ou acima do limite não é forçado', () => {
  const conflito = run(mkState(), [item({ pomodoros: 2, fixedDate: '2026-10-14', fixedStart: '12:30' })]);
  assert.equal(conflito.placements.length, 0);
  assert.equal(conflito.unplaced[0].code, 'FIXED_CONFLICT');
  const limite = run(mkState({ settings: { weeklyLimitMin: 60 } }), [item({ pomodoros: 2, fixedDate: '2026-10-14', fixedStart: '10:00' })]);
  assert.equal(limite.unplaced[0].code, 'LIMIT');
});

test('08 - determinismo: mesma entrada => mesma saída', () => {
  const state = mkState({ blocks: [mkBlock()] });
  const items = [item({ blocks: 3, priority: 'media' }), item({ subject: 'Redes', blocks: 3, pomodoros: 2, priority: 'media' })];
  const a = run(state, items), b = run(JSON.parse(JSON.stringify(state)), JSON.parse(JSON.stringify(items)));
  assert.deepEqual(a, b);
});

test('08 - exceção da semana (limite e dias) não altera as configurações padrão', () => {
  const state = mkState();
  const before = JSON.stringify(state);
  const req = { items: [item({ blocks: 4 })], weekOverrides: { limitMin: 150 }, preserveExisting: true };
  const reqBefore = JSON.stringify(req);
  const r = S.proposeSchedule(state, req, MONDAY, NOW);
  assert.equal(r.placements.length, 1);
  assert.equal(r.unplaced.length, 3);
  assert.equal(JSON.stringify(state), before, 'settings e weekOverrides intactos');
  assert.equal(JSON.stringify(req), reqBefore);
  // exceção já gravada no estado também é respeitada (quarta indisponível, o resto normal)
  const st2 = mkState({ weekOverrides: { [MONDAY]: { days: { 3: [] } } } });
  const r2 = run(st2, [item({ blocks: 5 })]);
  assert.ok(r2.placements.every((p) => p.date !== '2026-10-14'));
});

test('08 - nada é proposto no passado e o dia de hoje só após o horário atual', () => {
  const wed15 = new Date(2026, 9, 14, 15, 0).getTime();
  const r = run(mkState(), [item({ blocks: 3, pomodoros: 2 })], {}, wed15);
  assert.ok(r.placements.length > 0);
  for (const p of r.placements) {
    assert.ok(p.date >= '2026-10-14');
    if (p.date === '2026-10-14') assert.ok(C.toMin(p.start) >= 15 * 60);
  }
});

test('08 - espalha blocos da mesma matéria em dias diferentes e alinha início a 15 min', () => {
  const r = run(mkState(), [item({ blocks: 2, pomodoros: 2 })]);
  assert.notEqual(r.placements[0].date, r.placements[1].date);
  assert.ok(r.placements.every((p) => C.toMin(p.start) % S.STEP === 0));
});

test('08 - capacidade antes/depois vem do capacity.js e item inválido não some em silêncio', () => {
  const state = mkState();
  const r = run(state, [item({ blocks: 2 }), { subject: '', blocks: 1, pomodoros: 2 }]);
  assert.equal(r.capacity.before.plannedNetMin, 0);
  assert.equal(r.capacity.after.plannedNetMin, r.placements.reduce((s, p) => s + net(p), 0));
  assert.equal(r.capacity.after.balanceMin, Cap.effectiveWeek(state, MONDAY).limitMin - r.capacity.after.plannedNetMin);
  assert.ok(r.unplaced.some((u) => u.code === 'INVALID'));
  assert.ok(r.placements.every((p) => p.tempId && p.reason && p.kind === 'estudo'));
});

test('08 - sem limite definido: avisa em vez de limitar', () => {
  const r = run(mkState({ settings: { weeklyLimitMin: null } }), [item({ blocks: 2 })]);
  assert.equal(r.placements.length, 2);
  assert.ok(r.warnings.some((w) => w.code === 'LIMIT_NOT_SET'));
});
