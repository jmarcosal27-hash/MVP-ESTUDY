const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

const M = C.MIN;
const cfg50 = { focusMin: 50, shortMin: 10, longEvery: 4, longMin: 30 };
const mkBlock = (o = {}) => ({ id: 'b1', subject: 'Direito', title: 'Cap. 1', date: '2026-10-12', start: '08:00',
  estimated: 3, config: cfg50, completed: false, questions: null, hits: null, sessions: [], ...o });

test('04 - exemplo: 3 pomodoros de 50min + 2 pausas de 10min = 170min', () => {
  const p = C.planBlock(3, cfg50);
  assert.deepEqual([p.studyMin, p.restMin, p.totalMin], [150, 20, 170]);
  assert.equal(C.fromMin(C.blockSpan(mkBlock()).endMin), '10:50');
});
test('04 - pausa longa substitui a curta e não há pausa após o último', () => {
  assert.deepEqual(C.breaksFor(5, cfg50), ['short', 'short', 'short', 'long']);
  assert.deepEqual(C.breaksFor(4, cfg50), ['short', 'short', 'short']);
  assert.deepEqual(C.breaksFor(1, cfg50), []);
});
test('04 - bloco que passa da meia-noite é rejeitado', () => {
  assert.ok(C.validateBlockPlan(mkBlock({ start: '23:00' })).length > 0);
  assert.equal(C.validateBlockPlan(mkBlock()).length, 0);
});

test('05 - situação: em dia, atrasado, concluído e reabertura', () => {
  const b = mkBlock(); // termina 10:50
  assert.equal(C.blockStatus(b, new Date(2026, 9, 12, 10, 49)), 'em_dia');
  assert.equal(C.blockStatus(b, new Date(2026, 9, 12, 10, 51)), 'atrasado');
  assert.equal(C.blockStatus({ ...b, completed: true }, new Date(2026, 9, 13)), 'concluido');
  assert.equal(C.blockStatus({ ...b, completed: false }, new Date(2026, 9, 13)), 'atrasado');
  assert.equal(C.blockStatus({ ...b, date: '2026-10-20' }, new Date(2026, 9, 13)), 'em_dia');
});

test('06 - validações e indicadores de desempenho', () => {
  assert.equal(C.validateResult('10', '7').errors.length, 0);
  assert.ok(C.validateResult('10', '11').errors.length);
  assert.ok(C.validateResult('-1', '').errors.length);
  assert.ok(C.validateResult('1.5', '').errors.length);
  assert.ok(C.validateResult('', '3').errors.length);
  assert.deepEqual(C.validateResult('', ''), { errors: [], questions: null, hits: null });
  assert.equal(C.validateResult('5', '0').hits, 0); // zero != não preenchido
  assert.equal(C.accuracy(mkBlock()).label, 'Sem questões registradas');
  assert.equal(C.accuracy(mkBlock({ questions: 10 })).label, 'Resultado pendente');
  const a = C.accuracy(mkBlock({ questions: 10, hits: 0 }));
  assert.equal(a.kind, 'value'); assert.equal(a.rate, 0); assert.equal(a.errors, 10);
  assert.equal(C.accuracy(mkBlock({ questions: 8, hits: 6 })).errors, 2);
});

test('02/03 - exemplo: 50min de foco + 12min extras = 62min, 1 pomodoro completo', () => {
  const t0 = 1_000_000;
  const s = C.startSession('b1', cfg50, t0);
  assert.equal(C.advance(s, t0 + 49 * M), false);
  assert.equal(C.advance(s, t0 + 62 * M), true);
  assert.equal(s.phase, 'extra'); assert.equal(s.alert, 'focus_end'); assert.equal(s.state, 'running');
  const rec = C.finishSession(s, t0 + 62 * M);
  assert.equal(rec.totals.focusMs, 50 * M);
  assert.equal(rec.totals.extraMs, 12 * M);
  assert.equal(rec.totals.studyMs, 62 * M);
  assert.equal(rec.completedPomodoros, 1); assert.equal(rec.partialCycles, 0);
});
test('03 - contagem correta mesmo se o tick só ocorrer depois (aba em segundo plano)', () => {
  const s = C.startSession('b1', cfg50, 0);
  C.advance(s, 70 * M); // só avaliou aos 70min
  assert.equal(C.liveTotals(s, 70 * M).extraMs, 20 * M);
});
test('03 - pausar e retomar no tempo extra continua de onde parou; pausa não é estudo', () => {
  const s = C.startSession('b1', cfg50, 0);
  C.advance(s, 55 * M);
  C.pause(s, 55 * M);               // 5min extras
  C.resume(s, 65 * M);              // 10min de interrupção
  const rec = C.finishSession(s, 70 * M); // +5min extras
  assert.equal(rec.totals.extraMs, 10 * M);
  assert.equal(rec.totals.interruptMs, 10 * M);
  assert.equal(rec.totals.studyMs, 60 * M);
});
test('03 - encerrar antes do pomodoro é ciclo parcial e o tempo é salvo', () => {
  const s = C.startSession('b1', cfg50, 0);
  const rec = C.finishSession(s, 20 * M);
  assert.equal(rec.totals.focusMs, 20 * M);
  assert.equal(rec.completedPomodoros, 0); assert.equal(rec.partialCycles, 1);
});
test('02 - pausa curta/longa, fim da pausa aguarda ação e não conta como estudo', () => {
  const small = { focusMin: 1, shortMin: 1, longEvery: 2, longMin: 3 };
  const s = C.startSession('b1', small, 0);
  C.startBreak(s, 1 * M + 20_000);   // 1º pomodoro + 20s extra
  assert.equal(s.phase, 'short');
  C.advance(s, 3 * M);               // pausa de 1min acabou aos 2m20s
  assert.equal(s.state, 'awaiting'); assert.equal(s.alert, 'break_end');
  C.startFocus(s, 10 * M);           // ficou 7min ocioso: nada contado
  assert.equal(s.phase, 'focus'); assert.equal(s.pomo, 2);
  C.advance(s, 11 * M);              // 2º pomodoro completo
  C.startBreak(s, 11 * M);
  assert.equal(s.phase, 'long');     // 2 pomodoros => pausa longa
  const rec = C.finishSession(s, 12 * M);
  assert.equal(rec.totals.focusMs, 2 * M);
  assert.equal(rec.totals.extraMs, 20_000);
  assert.equal(rec.totals.restMs, 1 * M + 1 * M);
  assert.equal(rec.completedPomodoros, 2);
});
test('02 - pausar durante o descanso não consome a pausa', () => {
  const small = { focusMin: 1, shortMin: 2, longEvery: 4, longMin: 3 };
  const s = C.startSession('b1', small, 0);
  C.startBreak(s, 1 * M);
  C.pause(s, 2 * M);                 // 1min de descanso
  C.resume(s, 10 * M);
  C.advance(s, 10 * M + 30_000);
  assert.equal(s.state, 'running');  // ainda falta 30s
  C.advance(s, 11 * M);
  assert.equal(s.state, 'awaiting');
});
test('02 - alteração de configuração não muda sessões já registradas', () => {
  const s = C.startSession('b1', cfg50, 0);
  const rec = C.finishSession(s, 10 * M);
  const copy = JSON.stringify(rec);
  cfg50.focusMin; // config da sessão é cópia
  assert.notEqual(s.cfg, cfg50);
  assert.equal(JSON.stringify(rec), copy);
});

test('04 - tempo extra invadindo o próximo bloco gera conflito; sobreposição planejada também', () => {
  const a = mkBlock({ id: 'a', start: '08:00', estimated: 1, config: cfg50,
    sessions: [{ endedAt: new Date(2026, 9, 12, 9, 10).getTime() }] }); // previsto até 08:50, real até 09:10
  const b = mkBlock({ id: 'b', title: 'B', start: '09:00', estimated: 1 });
  const c = mkBlock({ id: 'c', title: 'C', start: '10:00', estimated: 1 });
  const r = C.findConflicts([a, b, c], null, 0);
  assert.ok(r.a && r.b && !r.c);
  const d = mkBlock({ id: 'd', title: 'D', start: '10:30', estimated: 1 });
  assert.ok(C.findConflicts([c, d], null, 0).c);
});

test('06 - taxa geral = soma acertos / soma questões (não média das taxas)', () => {
  const blocks = [
    mkBlock({ id: '1', questions: 10, hits: 10 }),             // 100%
    mkBlock({ id: '2', questions: 90, hits: 45 }),             // 50%
    mkBlock({ id: '3', questions: 20 }),                       // pendente
    mkBlock({ id: '4' }),                                      // sem questões
  ];
  const r = C.consolidate(blocks, {}, new Date(2026, 9, 12, 7));
  assert.equal(r.total.hits, 55); assert.equal(r.total.questionsWithResult, 100);
  assert.equal(r.total.rate, 55); // média simples seria 75
  assert.equal(r.total.errors, 45); assert.equal(r.total.pendingResults, 1);
  assert.equal(r.total.questions, 120);
});
test('06 - filtros por matéria e período; contagem por situação e tempo extra', () => {
  const sess = { totals: { focusMs: 50 * M, extraMs: 12 * M, restMs: 0, interruptMs: 0, studyMs: 62 * M }, completedPomodoros: 1, partialCycles: 0 };
  const blocks = [
    mkBlock({ id: '1', subject: 'Direito', date: '2026-10-05', estimated: 1, sessions: [sess], completed: true }),
    mkBlock({ id: '2', subject: 'Matemática', date: '2026-10-12' }),
    mkBlock({ id: '3', subject: 'Direito', date: '2026-10-30' }),
  ];
  const now = new Date(2026, 9, 12, 12);
  const r = C.consolidate(blocks, { subject: 'Direito', from: '2026-10-01', to: '2026-10-15' }, now);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.total.totals.extraMs, 12 * M); assert.equal(r.total.totals.studyMs, 62 * M);
  assert.equal(r.total.status.concluido, 1); assert.equal(r.total.overrun, 1);
  const all = C.consolidate(blocks, {}, now);
  assert.deepEqual(all.total.status, { concluido: 1, atrasado: 1, em_dia: 1 });
  assert.equal(C.consolidate(blocks, { groupBy: 'week' }, now).rows.length, 3);
});
