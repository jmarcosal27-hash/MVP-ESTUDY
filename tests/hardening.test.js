/* Regressão dos achados da revisão de segurança/bugs (docs/revisoes/seguranca-e-bugs.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');
const K = require('../js/capacity.js');
const X = require('../js/commands.js');
const W = require('../js/weeklyreport.js');

const cfg = { focusMin: 50, shortMin: 10, longEvery: 4, longMin: 30 };
const NOW = new Date(2026, 9, 12, 7, 0).getTime();
const mk = (o = {}) => ({ id: 'b' + Math.random().toString(36).slice(2, 7), subject: 'Redes', title: 'Camadas', date: '2026-10-14', start: '09:00', estimated: 2, config: cfg, sessions: [], ...o });
const st = (blocks = [], extra = {}) => K.normalizeState({ settings: { config: cfg, weeklyLimitMin: 1200 }, blocks, ...extra });
const run = (state, cmds) => { const p = X.plan(state, cmds, NOW); const r = X.applyChanges(state, p.changes, { source: 'chat', nowMs: NOW }); return { p, r }; };

test('A1 - create_block ignora id e campos arbitrários vindos do modelo', () => {
  const { p, r } = run(st(), [{ type: 'create_block', block: { subject: 'Mat', title: 'T', date: '2026-10-15', start: '09:00', estimated: 1,
    id: 'x" onmouseover="alert(2)', deadline: '"><img src=x onerror=alert(1)>', questions: '<b>q', evil: 'x' } }]);
  assert.equal(r.applied.length, 1);
  const b = r.state.blocks[0];
  assert.match(b.id, /^[\w.-]+$/); assert.notEqual(b.id, 'x" onmouseover="alert(2)');
  assert.equal(b.deadline, null); assert.equal(b.questions, null);
});
test('A1/M2 - update_block valida tipo e formato de cada campo', () => {
  const b = mk({ id: 'u1' });
  for (const [k, v] of [['remainingMin', '"><svg onload=alert(3)>'], ['remainingMin', -500], ['remainingMin', 'abc'], ['start', '12:75'], ['date', '2026-02-31'], ['deadline', '"><x>'], ['estimated', 'dois'], ['priority', 'urgente']]) {
    const { p, r } = run(st([b]), [{ type: 'update_block', ref: { id: 'u1' }, changes: { [k]: v } }]);
    assert.equal(r.applied.length, 0, `${k}=${v} não pode ser aplicado`);
    assert.ok(p.warnings.some((w) => w.code === 'VALOR_INVALIDO'), `${k} deve avisar`);
  }
  const ok = run(st([b]), [{ type: 'update_block', ref: { id: 'u1' }, changes: { remainingMin: 30, priority: 'alta' } }]);
  assert.equal(ok.r.state.blocks[0].remainingMin, 30);
});
test('M2 - datas e horas impossíveis são rejeitadas no cadastro', () => {
  assert.ok(C.validateBlockPlan(K.normalizeBlock(mk({ date: '2026-02-31' }))).length);
  assert.ok(C.validateBlockPlan(K.normalizeBlock(mk({ start: '12:75' }))).length);
  assert.equal(C.validateBlockPlan(K.normalizeBlock(mk())).length, 0);
  const { r } = run(st(), [{ type: 'create_block', block: { subject: 'A', title: 'B', date: '2026-02-31', start: '09:00', estimated: 1 } }]);
  assert.equal(r.applied.length, 0);
});
test('M1 - dados antigos/corrompidos não derrubam: config padrão, quarentena e sessão inválida descartada', () => {
  const s = K.normalizeState({ blocks: [{ id: 'old', subject: 'M', title: 'A', date: '2026-10-12', start: '09:00', estimated: 2 }, null, {}, { id: 'x', date: 'lixo' }],
    session: { blockId: 'old' } });
  assert.equal(s.blocks.length, 1); assert.equal(s.blocks[0].config.focusMin, C.DEFAULT_CONFIG.focusMin);
  assert.equal(s.quarantine.length, 3); assert.equal(s.session, null);
  assert.doesNotThrow(() => K.capacityFor(s, '2026-10-12', NOW));
  assert.doesNotThrow(() => K.normalizeState(null));
  assert.doesNotThrow(() => K.normalizeState({ blocks: 'x', settings: 5, chat: 3, reports: [], changeLog: {} }));
});
test('M3 - desfazer o limite de uma semana restaura o padrão (não remove o limite)', () => {
  const s0 = st([], {});
  const { r } = run(s0, [{ type: 'set_limit', week: '2026-10-12', limitMin: 600 }]);
  assert.equal(r.state.weekOverrides['2026-10-12'].limitMin, 600);
  const u = X.undoLast(r.state);
  assert.equal(K.effectiveWeek(u.state, '2026-10-12').limitMin, 1200);
  assert.equal(u.state.weekOverrides['2026-10-12'], undefined);
});
test('M4 - desfazer parcial mantém o conjunto desfazível e avisa', () => {
  const { r } = run(st(), [{ type: 'create_block', block: { subject: 'A', title: 'B', date: '2026-10-15', start: '09:00', estimated: 1 } }]);
  const s = JSON.parse(JSON.stringify(r.state));
  s.blocks[0].sessions.push({ startedAt: NOW, totals: { studyMs: 60000, focusMs: 60000, extraMs: 0, restMs: 0, interruptMs: 0 } });
  const u = X.undoLast(s);
  assert.equal(u.failed.length, 1); assert.ok(!u.undone.undone);
  assert.ok(X.lastUndoable(u.state), 'continua desfazível');
});
test('M5 - excluir bloco com cronômetro ativo é barrado', () => {
  const b = mk({ id: 'run' });
  const session = C.startSession('run', cfg, NOW);
  const p = X.plan(st([b], { session }), [{ type: 'delete_block', ref: { id: 'run' } }], NOW);
  assert.equal(p.changes.length, 0); assert.ok(p.warnings.some((w) => w.code === 'CRONOMETRO_ATIVO'));
});
test('F11 - título exato tem preferência sobre título parcial', () => {
  const s = st([mk({ id: 'a', title: 'Crase' }), mk({ id: 'r', title: 'Revisão: Crase', date: '2026-10-21' })]);
  const r = X.resolveRef(s, { title: 'Crase' });
  assert.equal(r.status, 'one'); assert.equal(r.matches[0].id, 'a');
});
test('B3 - relatório não sugere de novo bloco atrasado que já tem continuação futura', () => {
  const late = mk({ id: 'l', title: 'Crase', date: '2026-10-13', sessions: [{ startedAt: new Date(2026, 9, 13, 9).getTime(), totals: { studyMs: 60 * 60000, focusMs: 60 * 60000, extraMs: 0, restMs: 0, interruptMs: 0 } }] });
  const next = mk({ id: 'n', title: 'Crase', date: '2026-10-20' });
  const rep = W.buildWeeklyReport(st([late, next]), '2026-10-12', new Date(2026, 9, 19, 22).getTime());
  assert.ok(!rep.nextWeek.suggestions.some((x) => x.blockId === 'l'));
});
test('F9 - texto de capacidade diz "excesso", não "saldo (excesso)"', () => {
  const s = st([mk({ estimated: 10 })], { settings: { config: cfg, weeklyLimitMin: 120 } });
  const p = X.plan(s, [{ type: 'query_capacity', week: '2026-10-12' }], NOW);
  const txt = JSON.stringify(p.results);
  assert.ok(/excesso de/.test(txt) && !/saldo[^"]*\(excesso\)/.test(txt));
});

/* ---- servidor (API sempre simulada) ---- */
const http = require('node:http');
const { createServer } = require('../server/server.js');
const listen = (srv) => new Promise((res) => srv.listen(0, '127.0.0.1', () => res(srv.address().port)));
const post = (port, body, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: '/api/chat', method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
    let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d }));
  });
  req.on('error', reject); req.end(body);
});
const fakeApi = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'oi' }] }) });
test('B1 - corpo grande demais recebe 413 legível (não ECONNRESET)', async () => {
  const srv = createServer({ env: { ANTHROPIC_API_KEY: 'chave-falsa-de-teste' }, fetchImpl: fakeApi });
  const port = await listen(srv);
  const r = await post(port, JSON.stringify({ messages: [{ role: 'user', text: 'x'.repeat(1.2 * 1024 * 1024) }] }));
  srv.close(); assert.equal(r.status, 413); assert.match(r.body, /grande demais/);
});
test('B2 - contexto enorme é recusado antes de ir à API; Origin de outra porta é negado', async () => {
  let calls = 0;
  const srv = createServer({ env: { ANTHROPIC_API_KEY: 'chave-falsa-de-teste' }, fetchImpl: async () => { calls++; return fakeApi(); } });
  const port = await listen(srv);
  const big = await post(port, JSON.stringify({ messages: [{ role: 'user', text: 'oi' }], context: { lixo: 'x'.repeat(200 * 1024) } }));
  assert.equal(big.status, 413); assert.equal(calls, 0);
  const ok = await post(port, JSON.stringify({ messages: [{ role: 'user', text: 'oi' }], context: {} }), { origin: `http://localhost:${port}`, host: `localhost:${port}` });
  assert.equal(ok.status, 200);
  const other = await post(port, JSON.stringify({ messages: [{ role: 'user', text: 'oi' }] }), { origin: 'http://localhost:9999', host: `localhost:${port}` });
  srv.close(); assert.equal(other.status, 403);
});
