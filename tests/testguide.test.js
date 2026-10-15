const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/testguide.js');

test('roteiro: ids únicos e todos os itens têm o que fazer e o esperado', () => {
  const ids = T.PARTS.flatMap((p) => p.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const p of T.PARTS) for (const i of p.items) { assert.ok(i.what && i.expect, i.id); assert.ok(i.id.startsWith(p.id + '.')); }
});
test('resumo conta ok, problema e não testados', () => {
  const st = T.emptyState(); st.items['1.1'] = { r: 'ok' }; st.items['1.2'] = { r: 'fail' };
  const s = T.summarize(st);
  assert.equal(s.ok, 1); assert.equal(s.fail, 1); assert.equal(s.pending, s.total - 2);
});
test('relatório de feedback: formato WhatsApp (sem tabela/markdown pesado), traz problemas, notas e gravidade', () => {
  const st = T.emptyState();
  st.items['2.4'] = { r: 'fail', note: 'o som ficou baixo', sev: 'B' };
  st.items['1.1'] = { r: 'ok', note: 'bem rápido' };
  st.notes.push({ where: 'Cadastro', text: 'faltou copiar bloco', sev: 'C' });
  const t = T.buildReport(st, { version: 'sprint 1', when: '15/10/2026' });
  assert.match(t, /^\*FEEDBACK DO TESTE - ESTUDY\*/);
  assert.match(t, /Versão testada: sprint 1/);
  assert.match(t, /❌ 2\.4/); assert.match(t, /o que aconteceu: o som ficou baixo/i); assert.match(t, /Gravidade: B/);
  assert.match(t, /✅ 1\.1 - bem rápido/); assert.match(t, /\[Cadastro\] faltou copiar bloco \(Gravidade C\)/);
  assert.ok(!/\|---|^#/m.test(t));
});
