const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer, loadEnv } = require('../server/server.js');
const { parseResponse, cleanMessages, TOOLS } = require('../server/llm.js');

const KEY = 'sk-ant-TESTE-nao-vazar-123';
/** API simulada: guarda as chamadas e devolve uma resposta com texto + tool_use. Nunca chamamos a API real. */
function mockApi(status = 200, payload) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status < 400, status, json: async () => payload || { content: [{ type: 'text', text: 'Movo o bloco.' },
      { type: 'tool_use', id: 't1', name: 'move_block', input: { ref: { subject: 'Redes' }, to: { date: '2026-10-15', start: '09:00' } } }],
      usage: { input_tokens: 10, output_tokens: 5 } } };
  };
  return { fetchImpl, calls };
}
async function withServer(opts, fn) {
  const server = createServer(opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://localhost:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}
const post = (base, body, headers = {}) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body) });
const chatBody = { messages: [{ role: 'user', text: 'Mova o bloco de Redes de quarta 14h para quinta 9h' }], context: { hoje: '2026-10-12' } };

test('sem chave => erro claro em português e o servidor continua servindo o app', async () => {
  await withServer({ env: {}, fetchImpl: () => { throw new Error('não deve chamar a API'); } }, async (base) => {
    const r = await post(base, chatBody);
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /ANTHROPIC_API_KEY/);
    assert.equal((await (await fetch(`${base}/api/status`)).json()).chat, false);
    assert.equal((await fetch(`${base}/`)).status, 200);
  });
});
test('com chave: chama a API simulada (uma ferramenta por comando) e devolve {reply, commands, usage}', async () => {
  const api = mockApi();
  await withServer({ env: { ANTHROPIC_API_KEY: KEY }, fetchImpl: api.fetchImpl }, async (base) => {
    const r = await post(base, chatBody);
    const out = await r.json();
    assert.equal(r.status, 200);
    assert.equal(out.reply, 'Movo o bloco.');
    assert.deepEqual(out.commands, [{ type: 'move_block', ref: { subject: 'Redes' }, to: { date: '2026-10-15', start: '09:00' } }]);
    assert.deepEqual(out.usage, { inputTokens: 10, outputTokens: 5 });
    const c = api.calls[0];
    assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(c.init.headers['x-api-key'], KEY);
    assert.equal(c.body.model, 'claude-sonnet-5-5');
    assert.equal(c.body.tools.length, TOOLS.length);
    assert.match(c.body.system, /2026-10-12/, 'o contexto calculado entra no prompt');
    assert.equal(c.body.messages[0].role, 'user');
  });
});
test('modelo vem de ANTHROPIC_MODEL', async () => {
  const api = mockApi();
  await withServer({ env: { ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: 'claude-opus-5-5' }, fetchImpl: api.fetchImpl }, async (base) => {
    await post(base, chatBody);
    assert.equal(api.calls[0].body.model, 'claude-opus-5-5');
  });
});
test('a chave nunca aparece em respostas (sucesso e erro) nem no log', async () => {
  const logs = [], orig = { log: console.log, error: console.error };
  console.log = console.error = (...a) => logs.push(a.join(' '));
  try {
    for (const status of [200, 401, 429, 500]) {
      const api = mockApi(status);
      await withServer({ env: { ANTHROPIC_API_KEY: KEY }, fetchImpl: api.fetchImpl }, async (base) => {
        const r = await post(base, chatBody);
        assert.ok(!(await r.text()).includes(KEY), `status ${status}`);
      });
    }
    await withServer({ env: { ANTHROPIC_API_KEY: KEY }, fetchImpl: async () => { throw new Error(`falha com ${KEY}`); } }, async (base) => {
      const r = await post(base, chatBody);
      assert.equal(r.status, 502);
      assert.ok(!(await r.text()).includes(KEY));
    });
  } finally { Object.assign(console, orig); }
  assert.ok(!logs.join('\n').includes(KEY));
});
test('erros da API viram mensagens em português', async () => {
  const cases = [[401, 502, /recusou a chave/], [429, 429, /Tente de novo/], [404, 502, /Modelo/], [500, 502, /erro \(500\)/]];
  for (const [up, status, re] of cases) {
    await withServer({ env: { ANTHROPIC_API_KEY: KEY }, fetchImpl: mockApi(up).fetchImpl }, async (base) => {
      const r = await post(base, chatBody);
      assert.equal(r.status, status);
      assert.match((await r.json()).error, re);
    });
  }
});
test('entrada inválida: JSON ruim, sem mensagem, content-type errado, corpo grande', async () => {
  const api = mockApi();
  await withServer({ env: { ANTHROPIC_API_KEY: KEY }, fetchImpl: api.fetchImpl }, async (base) => {
    assert.equal((await post(base, '{ruim')).status, 400);
    assert.equal((await post(base, { messages: [] })).status, 400);
    assert.equal((await fetch(`${base}/api/chat`, { method: 'POST', body: 'oi' })).status, 415);
    assert.equal(api.calls.length, 0);
  });
});
test('arquivos privados não são servidos (.env, server/, docs/, ../)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudo-'));
  fs.mkdirSync(path.join(dir, 'js')); fs.mkdirSync(path.join(dir, 'server'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>ok</h1>'); fs.writeFileSync(path.join(dir, 'js', 'a.js'), 'x');
  fs.writeFileSync(path.join(dir, '.env'), `ANTHROPIC_API_KEY=${KEY}`); fs.writeFileSync(path.join(dir, 'server', 'server.js'), 'segredo');
  await withServer({ env: {}, root: dir }, async (base) => {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/js/a.js`)).status, 200);
    for (const p of ['/.env', '/server/server.js', '/js/../.env', '/%2e%2e/.env', '/js/%2e%2e/.env', '/docs/MVP.md']) {
      const r = await fetch(`${base}${p}`);
      assert.ok(r.status === 404 || r.status === 403, p);
      assert.ok(!(await r.text()).includes(KEY), p);
    }
  });
  fs.rmSync(dir, { recursive: true, force: true });
});
test('Host/Origin de fora de localhost são recusados (DNS rebinding / outros sites)', async () => {
  await withServer({ env: { ANTHROPIC_API_KEY: KEY }, fetchImpl: mockApi().fetchImpl }, async (base) => {
    const r = await post(base, chatBody, { origin: 'https://site-malicioso.com' });
    assert.equal(r.status, 403);
    const status = await new Promise((resolve) => {
      const req = http.request(base + '/api/status', { headers: { host: 'evil.example.com' } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.end();
    });
    assert.equal(status, 403);
  });
});
test('cleanMessages: alterna papéis, começa e termina em user', () => {
  const out = cleanMessages([{ role: 'assistant', text: 'oi' }, { role: 'user', text: 'a' }, { role: 'user', text: 'b' },
    { role: 'assistant', text: 'c' }, { role: 'system', text: 'x' }, { role: 'user', text: '' }]);
  assert.deepEqual(out, [{ role: 'user', content: 'a\nb' }]);
});
test('parseResponse: junta texto e converte tool_use em comandos', () => {
  const r = parseResponse({ content: [{ type: 'text', text: 'a' }, { type: 'tool_use', name: 'undo_last', input: {} }] });
  assert.deepEqual(r, { reply: 'a', commands: [{ type: 'undo_last' }], usage: { inputTokens: 0, outputTokens: 0 } });
});
test('ferramentas: uma por tipo de comando do contrato', () => {
  const esperado = ['create_block', 'update_block', 'move_block', 'delete_block', 'add_pomodoro', 'complete_block', 'reopen_block', 'add_review',
    'query_schedule', 'query_free_time', 'query_capacity', 'propose_schedule', 'reorganize', 'set_limit', 'undo_last'];
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), esperado.sort());
});
test('loadEnv: lê CHAVE=valor, ignora comentários e não sobrescreve o ambiente', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env');
  fs.writeFileSync(f, '# c\nANTHROPIC_API_KEY="abc"\nANTHROPIC_MODEL=m1\nPORT=\n');
  const env = { ANTHROPIC_MODEL: 'do-ambiente' };
  loadEnv(f, env);
  assert.deepEqual(env, { ANTHROPIC_MODEL: 'do-ambiente', ANTHROPIC_API_KEY: 'abc', PORT: '' });
});
