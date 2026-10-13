/* Ponte com a API Messages da Anthropic (tool use). Sem dependências: usa o fetch nativo do Node 18+.
 * O modelo só INTERPRETA o pedido e o converte em comandos estruturados (uma ferramenta por tipo de comando).
 * Tempos, conflitos e capacidade vêm de commands.js/capacity.js e já chegam calculados em `context`. */
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_MESSAGES = 20;
const MAX_TEXT = 4000;

const REF = {
  type: 'object',
  description: 'Como identificar o bloco. Use {id} quando o contexto trouxer o id; senão matéria/assunto/data/horário/dia da semana.',
  properties: {
    id: { type: 'string' }, subject: { type: 'string', description: 'Matéria' }, title: { type: 'string', description: 'Assunto' },
    date: { type: 'string', description: 'YYYY-MM-DD' }, start: { type: 'string', description: 'HH:MM' },
    weekday: { type: 'integer', minimum: 1, maximum: 7, description: '1=segunda … 7=domingo' },
  },
};
const WHEN = { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, start: { type: 'string', description: 'HH:MM' } } };
const RANGE = { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } } };
const CONFIG = { type: 'object', description: 'Pomodoro do bloco; omita para usar o padrão', properties: {
  focusMin: { type: 'integer' }, shortMin: { type: 'integer' }, longEvery: { type: 'integer' }, longMin: { type: 'integer' } } };
const FIELDS = {
  subject: { type: 'string' }, title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, start: { type: 'string', description: 'HH:MM' },
  estimated: { type: 'integer', minimum: 1, description: 'Quantidade de pomodoros' }, config: CONFIG,
  priority: { type: ['string', 'null'], enum: ['alta', 'media', 'baixa', null] }, deadline: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
  fixed: { type: 'boolean', description: 'Horário obrigatório' }, material: { type: 'string' }, notes: { type: 'string' },
};

const tool = (name, description, properties, required = []) => ({ name, description, input_schema: { type: 'object', properties, required } });

/** Uma ferramenta por tipo de comando de §4.3. O nome da ferramenta é o `type` do comando. */
const TOOLS = [
  tool('create_block', 'Cria um bloco de estudo. Chame uma vez por bloco. Só inclua campos que o usuário informou.',
    { block: { type: 'object', properties: { ...FIELDS, kind: { type: 'string', enum: ['estudo', 'revisao'] } } } }, ['block']),
  tool('update_block', 'Edita campos de um bloco existente (exceto mover de horário simples: prefira move_block).', { ref: REF, changes: { type: 'object', properties: FIELDS } }, ['ref', 'changes']),
  tool('move_block', 'Move um bloco para outro dia e/ou horário.', { ref: REF, to: WHEN }, ['ref', 'to']),
  tool('delete_block', 'Exclui um bloco.', { ref: REF }, ['ref']),
  tool('add_pomodoro', 'Acrescenta pomodoros a um bloco.', { ref: REF, count: { type: 'integer', minimum: 1 } }, ['ref']),
  tool('complete_block', 'Marca um bloco como concluído.', { ref: REF }, ['ref']),
  tool('reopen_block', 'Reabre um bloco concluído.', { ref: REF }, ['ref']),
  tool('add_review', 'Cria uma revisão ligada a um bloco. Informe data/horário só se o usuário disse.', { ref: REF, date: { type: 'string' }, start: { type: 'string' } }, ['ref']),
  tool('query_schedule', 'Consulta o que está agendado em um período ("mostre o que tenho").', { range: RANGE }),
  tool('query_free_time', 'Consulta horários livres em um dia ou período ("tenho 1h livre amanhã, o que cabe?").',
    { date: { type: 'string' }, range: RANGE, minMin: { type: 'integer', description: 'Duração mínima em minutos' } }),
  tool('query_capacity', 'Consulta limite, saldo e projeção de uma semana.', { week: { type: 'string', description: 'Qualquer data da semana, YYYY-MM-DD' } }),
  tool('propose_schedule', 'Pede ao gerador determinístico uma proposta de cronograma para itens de estudo.', { request: { type: 'object', properties: {
    items: { type: 'array', items: { type: 'object', properties: { subject: { type: 'string' }, title: { type: 'string' }, blocks: { type: 'integer' },
      pomodoros: { type: 'integer' }, material: { type: 'string' }, deadline: { type: 'string' }, priority: { type: 'string', enum: ['alta', 'media', 'baixa'] },
      fixedDate: { type: 'string' }, fixedStart: { type: 'string' }, notes: { type: 'string' } } } },
    week: { type: 'string', description: 'Qualquer data da semana' } } } }, ['request']),
  tool('reorganize', 'Reorganiza blocos pendentes após um período perdido ("perdi a manhã").',
    { scope: { type: 'string', enum: ['pending'] }, reason: { type: 'string', enum: ['lost_period'] },
      from: { type: 'string', description: 'YYYY-MM-DD HH:MM' }, to: { type: 'string', description: 'YYYY-MM-DD HH:MM' } }, ['reason', 'from', 'to']),
  tool('set_limit', 'Altera o limite semanal de estudo líquido. SOMENTE se o usuário pedir explicitamente.',
    { week: { type: 'string', description: 'Data da semana; omita para o padrão' }, limitMin: { type: ['integer', 'null'], description: 'Minutos de estudo líquido; null = sem limite' } }, ['limitMin']),
  tool('undo_last', 'Desfaz o último conjunto de alterações feito pelo chat.', {}),
];

const SYSTEM = `Você é o assistente de planejamento de estudos do MVP-ESTUDY. Responda sempre em português do Brasil, de forma curta e direta.
Seu papel é INTERPRETAR o pedido e chamar as ferramentas. Regras:
- Nunca calcule horários, durações, conflitos, saldo ou capacidade. Quem calcula é o sistema; use apenas os números que vierem no contexto.
- Nunca diga que algo foi feito: você apenas propõe comandos. O sistema aplica, salva e informa o resultado.
- Use o contexto (hoje, blocos, configurações) para resolver datas relativas ("amanhã", "quinta") e identificar blocos; prefira {id} quando o bloco estiver no contexto.
- Vários blocos na mesma mensagem: uma chamada de ferramenta por bloco.
- Se faltar informação essencial, pergunte só o que falta, em texto, sem chamar ferramenta. Não invente matéria, assunto, dia ou horário.
- Não altere o limite semanal (set_limit) a menos que o usuário peça explicitamente.
- Dia da semana ISO: 1=segunda … 7=domingo. Datas YYYY-MM-DD, horas HH:MM.`;

const buildSystem = (context) => `${SYSTEM}\n\nContexto atual (já calculado pelo sistema; JSON):\n${JSON.stringify(context || {})}`;

/** Normaliza o histórico: só user/assistant com texto, alternando, começando e terminando em user. */
function cleanMessages(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages.slice(-MAX_MESSAGES) : []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const text = String(m.text != null ? m.text : m.content != null ? m.content : '').slice(0, MAX_TEXT).trim();
    if (!text) continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += `\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

class ChatError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Converte a resposta da API em {reply, commands, usage}. */
function parseResponse(data) {
  const blocks = Array.isArray(data && data.content) ? data.content : [];
  const reply = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const commands = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ type: b.name, ...(b.input || {}) }));
  const u = (data && data.usage) || {};
  return { reply, commands, usage: { inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0 } };
}

/** Chama a API. `fetchImpl` permite simular a API nos testes (nunca chamamos a real em teste). A chave só vai no cabeçalho. */
const REQUEST_TIMEOUT_MS = 30000;
async function askClaude({ apiKey, model, messages, context, fetchImpl }) {
  if (!apiKey) throw new ChatError(503, 'O chat está desativado: falta a chave da Anthropic. Defina ANTHROPIC_API_KEY no arquivo .env e reinicie o servidor.');
  const msgs = cleanMessages(messages);
  if (!msgs.length) throw new ChatError(400, 'Escreva uma mensagem para o assistente.');
  const doFetch = fetchImpl || fetch;
  let res;
  try {
    res = await doFetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
      body: JSON.stringify({ model: model || DEFAULT_MODEL, max_tokens: 2048, system: buildSystem(context), tools: TOOLS, messages: msgs }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), // API lenta não pendura o servidor
    });
  } catch (e) {
    if (e && e.name === 'TimeoutError') throw new ChatError(504, 'A API da Anthropic demorou demais para responder. Tente de novo.');
    throw new ChatError(502, 'Não consegui falar com a API da Anthropic. Verifique sua conexão com a internet.');
  }
  if (!res.ok) {
    const status = res.status;
    if (status === 401 || status === 403) throw new ChatError(502, 'A Anthropic recusou a chave (ANTHROPIC_API_KEY). Confira o valor no arquivo .env.');
    if (status === 404) throw new ChatError(502, `Modelo não encontrado. Confira ANTHROPIC_MODEL (atual: ${model || DEFAULT_MODEL}).`);
    if (status === 429) throw new ChatError(429, 'Muitas requisições ou limite de uso atingido na Anthropic. Tente de novo em instantes.');
    throw new ChatError(502, `A API da Anthropic respondeu com erro (${status}). Tente de novo em instantes.`);
  }
  let data;
  try { data = await res.json(); } catch (e) { throw new ChatError(502, 'Resposta inesperada da API da Anthropic.'); }
  return parseResponse(data);
}

module.exports = { askClaude, parseResponse, cleanMessages, buildSystem, TOOLS, ChatError, DEFAULT_MODEL, API_URL };
