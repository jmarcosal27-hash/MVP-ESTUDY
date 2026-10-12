const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const W = require('../js/weeklyreport.js');

const WEEK = '2026-10-12', NEXT = '2026-10-19';
const NOW = new Date(2026, 9, 18, 22, 0).getTime();            // domingo 22:00 (após o fechamento padrão 21:00)
const startedAt = (d, h = 9) => new Date(2026, 9, d, h, 0).getTime();
const cfg = { focusMin: 50, shortMin: 10, longEvery: 4, longMin: 30 };
const MIN = C.MIN;
const sess = (d, studyMin, extraMin = 0) => ({ id: `s${d}`, startedAt: startedAt(d),
  totals: { focusMs: (studyMin - extraMin) * MIN, extraMs: extraMin * MIN, restMs: 0, interruptMs: 0, studyMs: studyMin * MIN } });
let seq = 0;
const blk = (o = {}) => ({ id: `b${++seq}`, subject: 'Direito', title: `Bloco ${seq}`, date: '2026-10-13', start: '08:00', estimated: 3,
  config: cfg, kind: 'estudo', originWeek: WEEK, completed: false, questions: null, hits: null, sessions: [], ...o });
const mk = (blocks, o = {}) => ({ settings: { config: cfg, weeklyLimitMin: 4800, ...(o.settings || {}) }, weekOverrides: {}, reports: o.reports || {}, blocks });
const rep = (blocks, o) => W.buildWeeklyReport(mk(blocks, o), WEEK, NOW);

test('11 - taxa geral = Σacertos ÷ Σquestões com resultado (não a média das taxas)', () => {
  const r = rep([blk({ completed: true, questions: 10, hits: 9 }), blk({ completed: true, questions: 100, hits: 50 })]);
  assert.equal(r.execution.questionsWithResult, 110);
  assert.equal(r.execution.hits, 59);
  assert.equal(r.execution.errors, 51);
  assert.ok(Math.abs(r.execution.rate - (59 * 100) / 110) < 1e-9);
});

test('11 - sem questões registradas não vira 0%; resultado pendente fica fora da taxa', () => {
  const r = rep([blk({ subject: 'Redes', completed: true }), blk({ subject: 'Penal', completed: true, questions: 20, hits: null })]);
  assert.equal(r.execution.rate, null);
  assert.equal(r.execution.pendingResults, 1);
  assert.equal(r.weaknesses.length, 0);
  const redes = r.lowData.find((x) => x.subject === 'Redes');
  assert.equal(redes.code, 'SEM_QUESTOES');
  assert.equal(redes.rate, null);
  assert.match(redes.text, /não é 0%/);
});

test('11 - poucos dados (< limiar exportado) sinaliza em vez de classificar; com dados suficientes classifica', () => {
  assert.equal(W.LOW_DATA_QUESTIONS, 10);
  const few = rep([blk({ subject: 'Redes', completed: true, questions: W.LOW_DATA_QUESTIONS - 1, hits: 1 })]);
  assert.equal(few.weaknesses.length, 0);
  assert.equal(few.lowData[0].code, 'POUCOS_DADOS');
  assert.equal(few.lowData[0].questions, W.LOW_DATA_QUESTIONS - 1);
  const enough = rep([blk({ subject: 'Redes', completed: true, questions: 20, hits: 6 }), blk({ subject: 'Civil', completed: true, questions: 20, hits: 18 })]);
  assert.deepEqual(enough.weaknesses.map((x) => x.subject), ['Redes']);
  assert.deepEqual(enough.strengths.map((x) => x.subject), ['Civil']);
  assert.equal(enough.weaknesses[0].questions, 20);       // nº de questões que sustenta
  assert.equal(enough.weaknesses[0].evidence.length, 1);  // justificativa ligada aos registros
  assert.deepEqual(enough.ranking.map((x) => x.subject), ['Civil', 'Redes']);
});

test('11 - mais tempo de estudo não é dificuldade: classificação ignora o tempo', () => {
  const longTime = blk({ subject: 'Civil', completed: true, questions: 20, hits: 19, sessions: [sess(13, 600)] });
  const shortTime = blk({ subject: 'Redes', completed: true, questions: 20, hits: 5, sessions: [sess(14, 10)] });
  const r = rep([longTime, shortTime]);
  assert.deepEqual(r.strengths.map((x) => x.subject), ['Civil']);
  assert.deepEqual(r.weaknesses.map((x) => x.subject), ['Redes']);
});

test('11 - tempo cumprido ≠ concluído: contados separadamente', () => {
  const r = rep([blk({ sessions: [sess(13, 150)] })]); // 3×50 = 150 estudados, mas não marcado como concluído
  assert.equal(r.execution.done, 0);
  assert.equal(r.execution.timeMetNotCompleted, 1);
  assert.equal(r.execution.studiedMin, 150);
  assert.ok(r.cautions.some((c) => /concluído/.test(c)));
});

test('11 - execução: planejados, concluídos, atrasados, parciais, extra e tempo por data de início da sessão', () => {
  const done = blk({ completed: true, sessions: [sess(13, 162, 12)] });
  const late = blk({ date: '2026-10-14' });                                   // sem estudo, passou
  const partial = blk({ date: '2026-10-15', sessions: [sess(15, 50)] });      // parcial e atrasado
  const prevWeekSession = blk({ originWeek: '2026-10-05', date: '2026-10-06', completed: true,
    sessions: [{ ...sess(6, 999), startedAt: new Date(2026, 9, 6, 9).getTime() }] }); // sessão de OUTRA semana: não conta
  const r = rep([done, late, partial, prevWeekSession]);
  const e = r.execution;
  assert.equal(e.planned, 3);
  assert.equal(e.done, 1);
  assert.equal(e.late, 2);
  assert.equal(e.partial, 1);
  assert.equal(e.plannedMin, 450);
  assert.equal(e.studiedMin, 162 + 50);
  assert.equal(e.extraMin, 12);
});

test('11 - reagendamento não esconde o que não foi feito (originWeek)', () => {
  const moved = blk({ date: '2026-10-21', title: 'Adiado' });                                   // planejado nesta semana, agora na próxima
  const incoming = blk({ originWeek: '2026-10-05', date: '2026-10-14', title: 'Veio de antes' }); // chegou de outra semana
  const r = rep([moved, incoming]);
  assert.equal(r.execution.planned, 1);
  assert.equal(r.execution.done, 0);
  assert.deepEqual(r.execution.rescheduledOut.map((x) => [x.title, x.newDate, x.originWeek]), [['Adiado', '2026-10-21', WEEK]]);
  assert.deepEqual(r.execution.rescheduledIn.map((x) => [x.title, x.originWeek]), [['Veio de antes', '2026-10-05']]);
});

test('11 - desvio estimado × realizado é informativo e só vale com amostra mínima', () => {
  const mkDone = (i) => blk({ subject: 'Civil', completed: true, sessions: [sess(13, 200)] }); // previsto 150, realizado 200
  const few = rep([mkDone(1), mkDone(2)]);
  assert.equal(few.estimationBias[0].recurrentOverrun, false);
  const many = rep([mkDone(1), mkDone(2), mkDone(3)]);
  assert.equal(many.estimationBias[0].recurrentOverrun, true);
  assert.equal(many.estimationBias[0].avgPlannedMin, 150);
  assert.equal(many.estimationBias[0].avgRealMin, 200);
  assert.match(many.estimationBias[0].note, /não indica/);
  assert.equal(many.weaknesses.length, 0); // desvio não vira fraqueza
});

test('11 - não altera o estado nem o calendário e é determinístico', () => {
  const state = mk([blk({ completed: true, questions: 10, hits: 5 }), blk({ date: '2026-10-14' })]);
  const snap = JSON.stringify(state);
  const a = W.buildWeeklyReport(state, WEEK, NOW);
  assert.equal(JSON.stringify(state), snap);
  assert.deepEqual(a, W.buildWeeklyReport(JSON.parse(snap), WEEK, NOW));
});

test('11 - próxima semana: sugere continuar atrasados e revisar concluídos, sem duplicar revisões', () => {
  const late = blk({ title: 'Atrasado', date: '2026-10-14', priority: 'alta', sessions: [sess(14, 50)] });
  const done = blk({ title: 'Concluído', completed: true, questions: 10, hits: 3 });
  const reviewed = blk({ title: 'Já revisado', completed: true });
  const review = blk({ kind: 'revisao', reviewOf: reviewed.id, originWeek: NEXT, date: '2026-10-20', estimated: 1, title: 'Rev' });
  const r = rep([late, done, reviewed, review]);
  const nw = r.nextWeek;
  assert.equal(nw.week, NEXT);
  assert.ok(nw.scheduled.some((b) => b.id === review.id));
  const types = nw.suggestions.map((x) => [x.type, x.blockId]);
  assert.deepEqual(types, [['continuacao', late.id], ['revisao', done.id]]);
  assert.equal(nw.suggestions[0].commands[0].type, 'propose_schedule');
  assert.equal(nw.suggestions[0].commands[0].request.items[0].pomodoros, 2);   // restam 100 min = 2 pomodoros
  assert.equal(nw.suggestions[1].commands[0].type, 'add_review');
  assert.match(nw.suggestions[1].reason, /30,0%/);
  assert.ok(!nw.suggestions.some((x) => x.blockId === reviewed.id), 'não duplica revisão já programada');
  assert.ok(nw.capacity && nw.note);
});

test('11 - próxima semana: o que não cabe no saldo vai para doesNotFit com motivo', () => {
  const late = blk({ title: 'Atrasado', date: '2026-10-14' }); // restam 150 min
  const r = rep([late], { settings: { weeklyLimitMin: 100 } });
  assert.equal(r.nextWeek.suggestions.length, 0);
  assert.equal(r.nextWeek.doesNotFit[0].code, 'LIMIT');
  assert.match(r.nextWeek.doesNotFit[0].reason, /limite/);
});

test('11 - shouldGenerate: só após o fechamento e se ainda não há relatório', () => {
  const st = mk([]);
  const sun2059 = new Date(2026, 9, 18, 20, 59).getTime(), sun2101 = new Date(2026, 9, 18, 21, 1).getTime();
  assert.equal(W.shouldGenerate(st, sun2101), WEEK);                                // passou do fechamento
  assert.equal(W.shouldGenerate(st, sun2059), '2026-10-05');                        // antes: ainda é a semana anterior que falta
  assert.equal(W.shouldGenerate(mk([], { reports: { [WEEK]: {} } }), sun2101), null); // já existe
  const mon = new Date(2026, 9, 19, 8, 0).getTime();                                // segunda seguinte: gera a semana que acabou
  assert.equal(W.shouldGenerate(st, mon), WEEK);
  const custom = mk([], { settings: { closing: { day: 5, time: '18:00' } } });      // sexta 18:00
  assert.equal(W.shouldGenerate(custom, new Date(2026, 9, 16, 17, 0).getTime()), '2026-10-05');
  assert.equal(W.shouldGenerate(custom, new Date(2026, 9, 16, 18, 30).getTime()), WEEK);
});
