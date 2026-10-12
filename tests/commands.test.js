const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const K = require('../js/commands.js');

const cfg = { focusMin: 50, shortMin: 10, longEvery: 4, longMin: 30 };
const NOW = new Date(2026, 9, 12, 8, 0).getTime(); // segunda 12/10/2026 08:00
const blk = (o) => ({ id: 'x', subject: 'Direito', title: 'Cap. 1', date: '2026-10-14', start: '14:00', estimated: 2, config: cfg,
  pdf: '', pages: '', studied: '', questions: null, hits: null, notes: '', completed: false, sessions: [], ...o });
const mkState = (blocks, extra = {}) => ({ settings: { config: cfg }, blocks, ...extra });
const redes = () => blk({ id: 'r1', subject: 'Redes', title: 'Camadas OSI' });
const move = (ref, to) => ({ type: 'move_block', ref, to });

test('resolveRef - por id, matéria/dia da semana/horário e sem critério', () => {
  const st = mkState([redes(), blk({ id: 'd1', subject: 'Direito', date: '2026-10-15', start: '09:00' })]);
  assert.equal(K.resolveRef(st, { id: 'r1' }).status, 'one');
  assert.equal(K.resolveRef(st, { id: 'nao' }).status, 'none');
  assert.equal(K.resolveRef(st, { subject: 'redes', weekday: 'quarta', start: '14h' }).matches[0].id, 'r1');
  assert.equal(K.resolveRef(st, { subject: 'Redes', weekday: 3 }).status, 'one');
  assert.equal(K.resolveRef(st, { subject: 'Português' }).status, 'none');
  assert.equal(K.resolveRef(st, {}).status, 'none');
});
test('resolveRef - ambíguo quando há mais de um; horário dentro do bloco também identifica', () => {
  const st = mkState([redes(), blk({ id: 'r2', subject: 'Redes', title: 'TCP', date: '2026-10-16', start: '09:00' })]);
  const r = K.resolveRef(st, { subject: 'Redes' });
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.matches.map((b) => b.id), ['r1', 'r2']);
  assert.equal(K.resolveRef(st, { subject: 'Redes', weekday: 3, start: '15:00' }).matches[0].id, 'r1'); // 14:00–15:50 cobre 15:00
});

test('07 - exemplo: mover Redes de quarta 14h para quinta 9h (sem conflito) aplica direto', () => {
  const st = mkState([redes()]);
  const p = K.plan(st, [move({ subject: 'Redes', weekday: 'quarta', start: '14:00' }, { date: '2026-10-15', start: '09:00' })], NOW);
  assert.equal(p.status, 'ready');
  assert.equal(p.changes.length, 1);
  assert.deepEqual([p.changes[0].after.date, p.changes[0].after.start], ['2026-10-15', '09:00']);
  assert.equal(st.blocks[0].date, '2026-10-14', 'plan não altera o estado');
  const r = K.applyChanges(st, p.changes, { source: 'chat', summary: 'Mover Redes', nowMs: NOW });
  assert.equal(r.failed.length, 0);
  assert.equal(r.state.blocks[0].start, '09:00');
  assert.equal(r.state.blocks[0].originWeek, undefined, 'campos não solicitados não são inventados');
  assert.equal(r.state.changeLog.length, 1);
});
test('07 - destino ocupado: alternativas com horários livres e nada é modificado', () => {
  const st = mkState([redes(), blk({ id: 'd1', title: 'Cap. 3', date: '2026-10-15', start: '09:00' })]);
  const p = K.plan(st, [move({ id: 'r1' }, { date: '2026-10-15', start: '09:00' })], NOW);
  assert.equal(p.status, 'needs_clarification');
  assert.deepEqual(p.changes, []);
  assert.ok(p.conflicts.length === 1);
  assert.ok(p.alternatives.length >= 1);
  for (const a of p.alternatives) { // cada alternativa, aplicada, não conflita
    const q = K.plan(st, a.commands, NOW);
    assert.equal(q.status, 'ready', a.text);
    assert.equal(K.applyChanges(st, q.changes, { nowMs: NOW }).failed.length, 0);
  }
  assert.equal(st.blocks.find((b) => b.id === 'r1').date, '2026-10-14');
});
test('07 - bloco ambíguo => pergunta antes de modificar', () => {
  const st = mkState([redes(), blk({ id: 'r2', subject: 'Redes', title: 'TCP', date: '2026-10-16', start: '09:00' })]);
  const p = K.plan(st, [move({ subject: 'Redes' }, { date: '2026-10-15', start: '09:00' })], NOW);
  assert.equal(p.status, 'needs_clarification');
  assert.equal(p.changes.length, 0);
  assert.equal(p.questions[0].options.length, 2);
  assert.deepEqual(st.blocks.map((b) => b.date), ['2026-10-14', '2026-10-16']);
});
test('07 - bloco inexistente => pergunta', () => {
  const p = K.plan(mkState([redes()]), [move({ subject: 'Física' }, { date: '2026-10-15', start: '09:00' })], NOW);
  assert.equal(p.status, 'needs_clarification');
});
test('07 - mover para a mesma posição não faz nada', () => {
  const p = K.plan(mkState([redes()]), [move({ id: 'r1' }, { date: '2026-10-14', start: '14:00' })], NOW);
  assert.equal(p.status, 'ready');
  assert.equal(p.changes.length, 0);
  assert.equal(p.results[0].type, 'noop');
});

test('07 - vários blocos numa mensagem exigem confirmação e se enxergam (sem dois no mesmo horário)', () => {
  const st = mkState([redes()]);
  const mk = (title, date, start) => ({ type: 'create_block', block: { subject: 'Civil', title, date, start, estimated: 2 } });
  const p = K.plan(st, [mk('A', '2026-10-13', '08:00'), mk('B', '2026-10-13', '10:00')], NOW);
  assert.equal(p.status, 'needs_confirmation');
  assert.equal(p.changes.length, 2);
  const q = K.plan(st, [mk('A', '2026-10-13', '08:00'), mk('B', '2026-10-13', '09:00')], NOW); // B sobrepõe A (08:00–09:50)
  assert.equal(q.status, 'needs_clarification');
});
test('07 - criar: falta de campos pergunta só o que falta', () => {
  const p = K.plan(mkState([]), [{ type: 'create_block', block: { subject: 'Civil', title: 'A', date: '2026-10-13' } }], NOW);
  assert.equal(p.status, 'needs_clarification');
  assert.deepEqual(p.questions[0].missing, ['horário de início', 'quantidade de pomodoros']);
});
test('12 - idempotência: o mesmo pedido não duplica bloco (nem no plan, nem no applyChanges)', () => {
  const cmd = { type: 'create_block', block: { subject: 'Civil', title: 'A', date: '2026-10-13', start: '08:00', estimated: 2 } };
  const st = mkState([]);
  const p = K.plan(st, [cmd], NOW);
  const r = K.applyChanges(st, p.changes, { nowMs: NOW });
  assert.equal(r.state.blocks.length, 1);
  assert.equal(r.state.blocks[0].source, 'chat');
  assert.equal(r.state.blocks[0].originWeek, '2026-10-12');
  const again = K.plan(r.state, [cmd], NOW + 1);
  assert.equal(again.changes.length, 0);
  assert.equal(again.results[0].type, 'noop');
  const forced = K.applyChanges(r.state, p.changes, { nowMs: NOW + 2 }); // reaplicar a mesma proposta
  assert.equal(forced.state.blocks.length, 1);
  assert.equal(forced.failed[0].code, 'DUPLICADO');
  assert.equal(forced.changeSet, null);
});

test('12 - desfazer o último conjunto restaura mover/criar/excluir', () => {
  const st0 = mkState([redes(), blk({ id: 'd1', title: 'Excluir', date: '2026-10-13', start: '08:00' })]);
  const p = K.plan(st0, [move({ id: 'r1' }, { date: '2026-10-15', start: '09:00' }), { type: 'delete_block', ref: { id: 'd1' } },
    { type: 'create_block', block: { subject: 'Civil', title: 'Novo', date: '2026-10-16', start: '08:00', estimated: 1 } }], NOW);
  assert.equal(p.status, 'needs_confirmation');
  const a = K.applyChanges(st0, p.changes, { source: 'chat', summary: 'três mudanças', nowMs: NOW });
  assert.equal(a.applied.length, 3);
  assert.deepEqual(a.state.blocks.map((b) => b.title).sort(), ['Camadas OSI', 'Novo']);
  const u = K.undoLast(a.state);
  assert.equal(u.undone.id, a.changeSet.id);
  assert.equal(u.failed.length, 0);
  assert.deepEqual(u.state.blocks.map((b) => [b.id, b.date, b.start]).sort(), [['d1', '2026-10-13', '08:00'], ['r1', '2026-10-14', '14:00']]);
  assert.equal(K.undoLast(u.state).undone, null, 'só desfaz uma vez');
});
test('12 - desfazer não apaga estudo registrado nem sobrescreve edição posterior', () => {
  const st = mkState([redes()]);
  const a = K.applyChanges(st, K.plan(st, [{ type: 'create_block', block: { subject: 'Civil', title: 'A', date: '2026-10-13', start: '08:00', estimated: 1 } },
    move({ id: 'r1' }, { date: '2026-10-15', start: '09:00' })], NOW).changes, { nowMs: NOW });
  const s2 = JSON.parse(JSON.stringify(a.state));
  s2.blocks.find((b) => b.title === 'A').sessions.push({ id: 's' });
  s2.blocks.find((b) => b.id === 'r1').start = '10:00'; // editado no calendário depois
  const u = K.undoLast(s2);
  assert.equal(u.failed.length, 2);
  assert.equal(u.state.blocks.length, 2);
  assert.equal(u.state.blocks.find((b) => b.id === 'r1').start, '10:00');
});

test('12 - falha parcial é reportada em failed e só o aplicado entra no histórico', () => {
  const st = mkState([redes()]);
  const p = K.plan(st, [move({ id: 'r1' }, { date: '2026-10-15', start: '09:00' }),
    { type: 'create_block', block: { subject: 'Civil', title: 'A', date: '2026-10-13', start: '08:00', estimated: 1 } }], NOW);
  // o usuário ocupa 08:00 de terça no calendário antes de confirmar
  const atual = mkState([redes(), blk({ id: 'z', subject: 'Outra', title: 'Z', date: '2026-10-13', start: '08:00' })]);
  const r = K.applyChanges(atual, p.changes, { source: 'chat', summary: 'x', nowMs: NOW });
  assert.equal(r.applied.length, 1);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].code, 'CONFLITO');
  assert.equal(r.changeSet.ops.length, 1);
  assert.equal(r.state.blocks.find((b) => b.id === 'r1').start, '09:00');
});
test('12 - atualização sobre bloco alterado depois da proposta é recusada (DESATUALIZADO)', () => {
  const st = mkState([redes()]);
  const p = K.plan(st, [move({ id: 'r1' }, { date: '2026-10-15', start: '09:00' })], NOW);
  const mudou = mkState([blk({ id: 'r1', subject: 'Redes', title: 'Camadas OSI', start: '16:00' })]);
  const r = K.applyChanges(mudou, p.changes, { nowMs: NOW });
  assert.equal(r.failed[0].code, 'DESATUALIZADO');
  assert.equal(r.state.blocks[0].start, '16:00');
});
test('12 - applyChanges não altera o estado recebido', () => {
  const st = mkState([redes()]);
  const snap = JSON.stringify(st);
  K.applyChanges(st, K.plan(st, [move({ id: 'r1' }, { date: '2026-10-15', start: '09:00' })], NOW).changes, { nowMs: NOW });
  assert.equal(JSON.stringify(st), snap);
});

test('12 - mais 1 pomodoro: aplica; se invade o próximo bloco, oferece horários', () => {
  const st = mkState([redes(), blk({ id: 'n', title: 'Seguinte', start: '16:00' })]);
  const livre = K.plan(mkState([redes()]), [{ type: 'add_pomodoro', ref: { id: 'r1' } }], NOW);
  assert.equal(livre.status, 'ready');
  assert.equal(livre.changes[0].after.estimated, 3);
  const bate = K.plan(st, [{ type: 'add_pomodoro', ref: { id: 'r1' }, count: 1 }], NOW); // 14:00–17:10 invade 16:00
  assert.equal(bate.status, 'needs_clarification');
  assert.ok(bate.alternatives.length);
});
test('12 - concluir/reabrir são idempotentes', () => {
  const st = mkState([redes()]);
  const a = K.applyChanges(st, K.plan(st, [{ type: 'complete_block', ref: { id: 'r1' } }], NOW).changes, { nowMs: NOW });
  assert.equal(a.state.blocks[0].completed, true);
  assert.equal(K.plan(a.state, [{ type: 'complete_block', ref: { id: 'r1' } }], NOW).changes.length, 0);
});
test('12 - excluir sempre pede confirmação', () => {
  const p = K.plan(mkState([redes()]), [{ type: 'delete_block', ref: { id: 'r1' } }], NOW);
  assert.equal(p.status, 'needs_confirmation');
});
test('12 - revisão ligada ao bloco; não duplica; pergunta quando falta data', () => {
  const st = mkState([redes()]);
  const sem = K.plan(st, [{ type: 'add_review', ref: { id: 'r1' } }], NOW);
  assert.equal(sem.status, 'needs_clarification');
  assert.ok(sem.questions[0].options.length > 0);
  const cmd = { type: 'add_review', ref: { id: 'r1' }, date: '2026-10-21', start: '09:00' };
  const p = K.plan(st, [cmd], NOW);
  assert.equal(p.status, 'ready');
  const b = p.changes[0].after;
  assert.deepEqual([b.kind, b.reviewOf, b.estimated], ['revisao', 'r1', 1]);
  const a = K.applyChanges(st, p.changes, { nowMs: NOW });
  assert.equal(K.plan(a.state, [cmd], NOW).changes.length, 0);
});

test('12 - consultas são calculadas pelos módulos', () => {
  const st = mkState([redes()]);
  const s = K.plan(st, [{ type: 'query_schedule', range: { from: '2026-10-12', to: '2026-10-18' } }], NOW);
  assert.equal(s.status, 'ready');
  assert.equal(s.results[0].totalStudyMin, 100); // 2 × 50
  const f = K.plan(st, [{ type: 'query_free_time', date: '2026-10-14', minMin: 60 }], NOW);
  const dia = f.results[0].days[0];
  assert.deepEqual(dia.intervals.map((i) => [i.from, i.to]), [['08:00', '12:00'], ['15:50', '22:00']]);
  const c = K.plan(st, [{ type: 'query_capacity', week: '2026-10-14' }], NOW);
  assert.equal(c.results[0].capacity.plannedNetMin, 100);
});
test('09 - passar do limite semanal exige confirmação e mostra o excesso', () => {
  const st = mkState([redes()], { settings: { config: cfg, weeklyLimitMin: 120 } });
  const p = K.plan(st, [{ type: 'create_block', block: { subject: 'Civil', title: 'A', date: '2026-10-15', start: '09:00', estimated: 2 } }], NOW);
  assert.equal(p.status, 'needs_confirmation');
  assert.ok(p.warnings.some((w) => w.code === 'LIMITE_EXCEDIDO'));
  assert.ok(p.capacityEffect.after['2026-10-12'].excessMin > 0);
});
test('09 - set_limit só com comando explícito, pede confirmação e desfaz', () => {
  const st = mkState([redes()], { settings: { config: cfg, weeklyLimitMin: 2400 } });
  const p = K.plan(st, [{ type: 'set_limit', limitMin: 1800 }], NOW);
  assert.equal(p.status, 'needs_confirmation');
  const a = K.applyChanges(st, p.changes, { nowMs: NOW });
  assert.equal(a.state.settings.weeklyLimitMin, 1800);
  assert.equal(K.undoLast(a.state).state.settings.weeklyLimitMin, 2400);
  const w = K.applyChanges(st, K.plan(st, [{ type: 'set_limit', week: '2026-10-14', limitMin: 600 }], NOW).changes, { nowMs: NOW });
  assert.equal(w.state.weekOverrides['2026-10-12'].limitMin, 600);
  assert.equal(w.state.settings.weeklyLimitMin, 2400, 'exceção da semana não altera o padrão');
});
test('12 - reorganizar período perdido: move pendentes, preserva fixos e concluídos', () => {
  const st = mkState([
    blk({ id: 'a', title: 'A', date: '2026-10-13', start: '08:00', priority: 'alta' }),
    blk({ id: 'f', title: 'Fixo', date: '2026-10-13', start: '10:00', fixed: true }),
    blk({ id: 'c', title: 'Feito', date: '2026-10-13', start: '09:00', completed: true, estimated: 1 }),
  ]);
  const p = K.plan(st, [{ type: 'reorganize', scope: 'pending', reason: 'lost_period', from: '2026-10-13 08:00', to: '2026-10-13 12:00' }], NOW);
  assert.equal(p.status, 'needs_confirmation');
  assert.deepEqual(p.changes.map((c) => c.id), ['a']);
  assert.ok(p.warnings.some((w) => w.code === 'BLOCO_FIXO_NO_PERIODO'));
  const novo = p.changes[0].after;
  assert.ok(novo.date + novo.start >= '2026-10-13' + '12:00');
  const a = K.applyChanges(st, p.changes, { nowMs: NOW });
  assert.equal(a.failed.length, 0);
});
test('plan - comando desconhecido gera aviso e não altera nada', () => {
  const p = K.plan(mkState([redes()]), [{ type: 'explodir' }], NOW);
  assert.equal(p.changes.length, 0);
  assert.equal(p.warnings[0].code, 'COMANDO_DESCONHECIDO');
});
test('undo_last no plan: indica o que seria desfeito (ou avisa que não há)', () => {
  const st = mkState([redes()]);
  assert.equal(K.plan(st, [{ type: 'undo_last' }], NOW).undo, false);
  const a = K.applyChanges(st, K.plan(st, [move({ id: 'r1' }, { date: '2026-10-15', start: '09:00' })], NOW).changes, { source: 'chat', summary: 'Mover', nowMs: NOW });
  const p = K.plan(a.state, [{ type: 'undo_last' }], NOW);
  assert.equal(p.undo, true);
  assert.equal(p.results[0].type, 'undo');
});

test('chat - contexto enviado ao modelo é enxuto e traz números já calculados', () => {
  const Chat = require('../js/chat.js');
  const st = mkState([redes(), blk({ id: 'longe', date: '2027-03-01' })]);
  const ctx = Chat.buildContext(st, NOW);
  assert.equal(ctx.agora.date, '2026-10-12');
  assert.equal(ctx.agora.weekday, 1);
  assert.deepEqual(ctx.blocos.map((b) => b.id), ['r1'], 'só a janela relevante');
  assert.equal(ctx.blocos[0].end, '15:50');
  assert.equal(ctx.capacidadeSemanaAtual.plannedNetMin, 100);
  assert.ok(!JSON.stringify(ctx).includes('sessions'), 'sem sessões/segmentos');
});
test('chat - relatório só descreve o que foi aplicado e o que falhou', () => {
  const Chat = require('../js/chat.js');
  const t = Chat.reportText({ applied: [{ summary: 'Mover A' }], failed: [{ change: { summary: 'Criar B' }, reason: 'ocupado' }] });
  assert.match(t, /Feito[\s\S]*Mover A[\s\S]*Não foi possível aplicar[\s\S]*Criar B — ocupado/);
  assert.match(Chat.reportText({ applied: [], failed: [{ change: { summary: 'X' }, reason: 'r' }] }), /^Nada foi alterado/);
});
