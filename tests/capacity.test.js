const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const K = require('../js/capacity.js');
const M = C.MIN;

const cfg = { focusMin: 50, shortMin: 10, longEvery: 4, longMin: 30 };
const MON = '2026-10-12'; // segunda
const mkB = (o = {}) => ({ id: 'b' + Math.random().toString(36).slice(2, 6), subject: 'Redes', title: 'T', date: '2026-10-14', start: '08:00', estimated: 3, config: cfg, sessions: [], ...o });
const sess = (studyMin, startedAt) => ({ startedAt, totals: { focusMs: studyMin * M, extraMs: 0, restMs: 0, interruptMs: 0, studyMs: studyMin * M } });
const st = (blocks, extra = {}) => K.normalizeState({ settings: { weeklyLimitMin: 2400 }, blocks, ...extra });
const NOW = new Date(2026, 9, 12, 7, 0).getTime(); // segunda 07:00

test('09 - exemplo: 3x50 com 2 pausas de 10 = 2h30 de carga e 2h50 de agenda', () => {
  const b = K.normalizeBlock(mkB());
  assert.equal(K.netStudyMin(b), 150); assert.equal(K.agendaMin(b), 170);
});
test('09 - saldo = limite - planejado; excesso e avisos', () => {
  const c = K.capacityFor(st([mkB()]), MON, NOW);
  assert.equal(c.plannedNetMin, 150); assert.equal(c.balanceMin, 2250); assert.equal(c.excessMin, 0);
  const over = K.capacityFor(st([mkB()], { settings: { weeklyLimitMin: 120 } }), MON, NOW);
  assert.equal(over.excessMin, 30); assert.ok(over.warnings.includes('EXCESS'));
  const eq = K.capacityFor(st([mkB()], { settings: { weeklyLimitMin: 150 } }), MON, NOW);
  assert.ok(eq.warnings.includes('LIMIT_REACHED')); assert.ok(!eq.warnings.includes('EXCESS'));
});
test('10 - exemplo: limite 40h, 12h estudadas, 20h previstas => projeção 32h, margem 8h', () => {
  const done = mkB({ completed: true, estimated: 12, config: { ...cfg, focusMin: 60 }, sessions: [sess(720, new Date(2026, 9, 13, 9).getTime())] });
  const pend = mkB({ estimated: 20, config: { ...cfg, focusMin: 60 }, date: '2026-10-16' });
  const c = K.capacityFor(st([done, pend]), MON, new Date(2026, 9, 14, 12).getTime());
  assert.equal(c.realizedMin, 720); assert.equal(c.remainingMin, 1200);
  assert.equal(c.projectionMin, 1920); assert.equal(c.marginMin, 480); assert.equal(c.projectedExcessMin, 0);
});
test('10 - concluído não soma o previsto de novo; extra conta uma vez; horas estudadas não são liberadas', () => {
  const b = mkB({ completed: true, sessions: [sess(162, new Date(2026, 9, 14, 9).getTime())] }); // previsto 150, estudou 162 (com extra)
  const c = K.capacityFor(st([b]), MON, new Date(2026, 9, 15).getTime());
  assert.equal(c.plannedNetMin, 162); assert.equal(c.realizedMin, 162); assert.equal(c.remainingMin, 0); assert.equal(c.projectionMin, 162);
});
test('10 - restante ajustável e transferência: só o restante pesa no destino; realizado fica na semana de origem', () => {
  const b = mkB({ date: '2026-10-20', sessions: [sess(100, new Date(2026, 9, 14, 9).getTime())] }); // movido p/ semana de 19/10
  const dest = K.capacityFor(st([b]), '2026-10-19', NOW), orig = K.capacityFor(st([b]), MON, NOW);
  assert.equal(dest.plannedNetMin, 50); assert.equal(dest.remainingMin, 50); assert.equal(dest.realizedMin, 0);
  assert.equal(orig.realizedMin, 100); assert.equal(orig.plannedNetMin, 0);
  const adj = mkB({ date: '2026-10-20', remainingMin: 20 });
  assert.equal(K.capacityFor(st([adj]), '2026-10-19', NOW).remainingMin, 20);
});
test('10 - cronômetro em andamento entra no realizado', () => {
  const b = mkB({ id: 'x' });
  const start = new Date(2026, 9, 14, 9).getTime();
  const session = C.startSession('x', cfg, start);
  const c = K.capacityFor(st([b], { session }), MON, start + 20 * M);
  assert.equal(Math.round(c.realizedMin), 20);
});
test('09 - exceção de semana não altera a rotina padrão', () => {
  const s = st([], { weekOverrides: { [MON]: { limitMin: 600, days: { 3: [{ from: '08:00', to: '12:00' }] } } } });
  assert.equal(K.effectiveWeek(s, MON).limitMin, 600);
  assert.equal(K.effectiveWeek(s, '2026-10-19').limitMin, 2400);
  assert.equal(s.settings.weeklyLimitMin, 2400);
  assert.deepEqual(K.effectiveWeek(s, MON).days[3], [{ from: '08:00', to: '12:00' }]);
  assert.equal(K.effectiveWeek(s, '2026-10-19').days[3].length, 2);
});
test('08 - horários livres: disponibilidade - indisponíveis - blocos (estudo+pausas)', () => {
  const s = st([mkB({ start: '08:00', estimated: 1 })], { settings: { weeklyLimitMin: 2400, availability: { days: { 3: [{ from: '08:00', to: '12:00' }] }, unavailable: [{ day: 3, from: '11:00', to: '12:00' }] } } });
  // 1 pomodoro de 50min sem pausa: ocupa 08:00-08:50
  assert.deepEqual(K.freeIntervals(s, '2026-10-14'), [{ startMin: 530, endMin: 660 }]);
  assert.deepEqual(K.freeIntervals(s, '2026-10-14', [s.blocks[0].id]), [{ startMin: 480, endMin: 660 }]);
  assert.deepEqual(K.freeIntervals(s, '2026-10-18'), []); // domingo sem disponibilidade
});
test('09 - wouldFit: excesso mostrado antes de adicionar e alternativas oferecidas', () => {
  const s = st([mkB({ priority: 'baixa', title: 'Baixa' })], { settings: { weeklyLimitMin: 200 } });
  const r = K.wouldFit(s, { estimated: 2, config: cfg, date: '2026-10-15', start: '08:00' }, MON, NOW);
  assert.equal(r.fitsCapacity, false); assert.equal(r.excessMin, 50);
  const types = r.options.map((o) => o.type);
  assert.ok(types.includes('transfer') && types.includes('replace') && types.includes('reduce'));
  assert.equal(r.options.find((o) => o.type === 'reduce').pomodoros, 1);
  assert.equal(K.wouldFit(s, { estimated: 1, config: cfg, date: '2026-10-15', start: '08:00' }, MON, NOW).fits, true);
});
test('09 - saldo sem horário livre e bloco atrasado sem espaço', () => {
  const noSlots = st([], { settings: { weeklyLimitMin: 2400, availability: { days: {}, unavailable: [] } } });
  assert.ok(K.capacityFor(noSlots, MON, NOW).warnings.includes('BALANCE_WITHOUT_SLOTS'));
  const late = mkB({ date: '2026-10-12', start: '08:00' }); // já passou e nada foi estudado
  const c = K.capacityFor({ ...noSlots, blocks: [K.normalizeBlock(late)] }, MON, new Date(2026, 9, 13, 20).getTime());
  assert.ok(c.warnings.includes('PROJECTION_NO_SLOTS'));
});
test('normalizeState: blocos antigos ganham defaults', () => {
  const s = K.normalizeState({ settings: { config: cfg }, blocks: [{ id: '1', subject: 'A', title: 'B', date: '2026-10-14', start: '08:00', estimated: 1, config: cfg }] });
  assert.equal(s.blocks[0].kind, 'estudo'); assert.equal(s.blocks[0].originWeek, MON); assert.equal(s.settings.weeklyLimitMin, K.DEFAULT_LIMIT_MIN);
});
