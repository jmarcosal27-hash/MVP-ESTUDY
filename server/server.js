/* Servidor local do MVP-ESTUDY: serve o app e expõe POST /api/chat (proxy da Anthropic).
 * Node puro, sem dependências. A chave fica SÓ em process.env.ANTHROPIC_API_KEY (lida do .env) e nunca é
 * escrita em log nem devolvida ao navegador. Uso: node server/server.js  (porta via PORT, padrão 3000). */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { askClaude, ChatError, DEFAULT_MODEL } = require('./llm.js');

const ROOT = path.resolve(__dirname, '..');
const MAX_BODY = 1024 * 1024; // 1 MB
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
// só o app é público: nunca .env, server/, tests/, docs/ nem .git
const PUBLIC = [/^\/(index|estudy)\.html$/, /^\/js\/[\w.-]+\.js$/, /^\/css\/[\w.-]+\.css$/];

/** Lê o .env (CHAVE=valor) sem sobrescrever variáveis já definidas no ambiente. */
function loadEnv(file, env = process.env) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (env[m[1]] === undefined) env[m[1]] = v;
  }
}

const sendJson = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new ChatError(413, 'Mensagem grande demais.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Aceita só requisições destinadas a localhost (evita DNS rebinding e uso por páginas de outros sites). */
const hostOk = (req) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host || '');
const originOk = (req) => { const o = req.headers.origin; if (!o) return true; try { return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(new URL(o).hostname); } catch (e) { return false; } };

/**
 * Cria o servidor. `options.env` (padrão process.env) e `options.fetchImpl` permitem testar com a API simulada.
 */
function createServer(options = {}) {
  const env = options.env || process.env, fetchImpl = options.fetchImpl, root = options.root || ROOT;

  async function handleChat(req, res) {
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return sendJson(res, 415, { error: 'Envie JSON (content-type: application/json).' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) {
      if (e instanceof ChatError) return sendJson(res, e.status, { error: e.message });
      return sendJson(res, 400, { error: 'JSON inválido.' });
    }
    try {
      const out = await askClaude({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        messages: body && body.messages, context: body && body.context, fetchImpl });
      sendJson(res, 200, out);
    } catch (e) {
      const status = e instanceof ChatError ? e.status : 500;
      if (!(e instanceof ChatError)) console.error('Erro inesperado no chat:', e && e.name); // nunca loga mensagem/corpo
      sendJson(res, status, { error: e instanceof ChatError ? e.message : 'Erro interno no servidor do chat.' });
    }
  }

  function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? '/index.html' : pathname;
    if (!PUBLIC.some((re) => re.test(rel))) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado.'); }
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado.'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  }

  return http.createServer((req, res) => {
    if (!hostOk(req) || !originOk(req)) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Acesso negado.'); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { res.writeHead(400); return res.end(); }
    if (req.method === 'POST' && pathname === '/api/chat') return handleChat(req, res);
    if (req.method === 'GET' && pathname === '/api/status') return sendJson(res, 200, { chat: !!env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL || DEFAULT_MODEL });
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
    res.writeHead(405, { allow: 'GET, HEAD, POST' }); res.end();
  });
}

if (require.main === module) {
  loadEnv(path.join(ROOT, '.env'));
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `A porta ${port} já está em uso. Feche o outro servidor ou defina PORT no .env.` : `Erro no servidor: ${e.message}`); process.exit(1); });
  server.listen(port, '127.0.0.1', () => {
    console.log(`MVP-ESTUDY rodando em http://localhost:${port}`);
    console.log(process.env.ANTHROPIC_API_KEY ? `Chat ativo (modelo: ${process.env.ANTHROPIC_MODEL || DEFAULT_MODEL}).`
      : 'Chat desativado: defina ANTHROPIC_API_KEY no arquivo .env. O restante do app funciona normalmente.');
  });
}

module.exports = { createServer, loadEnv };
