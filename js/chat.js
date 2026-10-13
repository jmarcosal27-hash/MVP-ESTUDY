/* Painel de chat (requisitos 07 e 12). Uso: window.Chat.mount(el, { getState, setState, now }).
 * O chat NÃO calcula nada: manda a mensagem + um resumo enxuto do estado ao servidor local (/api/chat), recebe
 * comandos, gera a proposta com Commands.plan e só grava via Commands.applyChanges. Só anuncia o que foi salvo.
 * Todo texto dinâmico entra com textContent (nunca innerHTML). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./capacity.js'), require('./commands.js'));
  else root.Chat = factory(root.Core, root.Capacity, root.Commands);
})(typeof self !== 'undefined' ? self : this, function (C, Cap, K) {
  const HISTORY_DAYS_BACK = 3, HISTORY_DAYS_AHEAD = 28, MAX_BLOCKS = 150, MAX_LOG = 100;

  /* ---------- contexto enviado ao modelo (já calculado pelos módulos) ---------- */
  function buildContext(state, nowMs) {
    const d = new Date(nowMs), today = C.isoDate(d), week = Cap.weekKey(today);
    const from = C.isoDate(C.addDays(d, -HISTORY_DAYS_BACK)), to = C.isoDate(C.addDays(d, HISTORY_DAYS_AHEAD));
    const s = Cap.normalizeState(state);
    const blocos = s.blocks.filter((b) => b.date >= from && b.date <= to).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1))
      .slice(0, MAX_BLOCKS).map((b) => ({ id: b.id, subject: b.subject, title: b.title, date: b.date, start: b.start,
        end: C.fromMin(C.blockSpan(b).endMin), estimated: b.estimated, studyMin: Cap.netStudyMin(b), kind: b.kind, priority: b.priority,
        deadline: b.deadline, fixed: b.fixed, status: C.blockStatus(b, d), reviewOf: b.reviewOf || undefined }));
    const cap = Cap.capacityFor(s, week, nowMs), eff = Cap.effectiveWeek(s, week);
    return {
      agora: { date: today, time: C.fromMin(d.getHours() * 60 + d.getMinutes()), weekday: Cap.isoWeekday(today), semana: week },
      pomodoroPadrao: s.settings.config, limiteSemanalMin: s.settings.weeklyLimitMin,
      disponibilidadeSemanaAtual: { dias: eff.days, indisponivel: eff.unavailable },
      capacidadeSemanaAtual: { limitMin: cap.limitMin, plannedNetMin: cap.plannedNetMin, balanceMin: cap.balanceMin, excessMin: cap.excessMin,
        realizedMin: cap.realizedMin, projectionMin: cap.projectionMin, marginMin: cap.marginMin, freeAgendaMin: cap.freeAgendaMin },
      blocos,
    };
  }

  /* ---------- texto dos relatórios (puro) ---------- */
  function reportText(res, summary) {
    const lines = [];
    if (res.applied.length) lines.push(`Feito (${res.applied.length} alteração(ões) salva(s)):`, ...res.applied.map((c) => `• ${c.summary}`));
    if (res.failed.length) lines.push(res.applied.length ? 'Não foi possível aplicar:' : 'Nada foi alterado. Não foi possível aplicar:', ...res.failed.map((f) => `• ${(f.change && f.change.summary) || 'Alteração'} — ${f.reason}`));
    if (!res.applied.length && !res.failed.length) lines.push('Nada a alterar.');
    return lines.join('\n');
  }

  /* ---------- DOM ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  function mount(el, api) {
    const nowMs = () => { const n = api.now ? api.now() : Date.now(); return n instanceof Date ? n.getTime() : n; };
    let msgs = ((api.getState().chat || {}).messages || []).slice(-MAX_LOG);
    let busy = false, enabled = true;

    const list = h('div', { class: 'chat-list', role: 'log', 'aria-live': 'polite' });
    const banner = h('div', { class: 'chat-banner', hidden: '' });
    const input = h('textarea', { class: 'chat-input', rows: '2', placeholder: 'Ex.: Mova o bloco de Redes de quarta 14h para quinta 9h', 'aria-label': 'Mensagem' });
    const sendBtn = h('button', { class: 'primary', type: 'submit' }, 'Enviar');
    const undoBtn = h('button', { type: 'button', class: 'chat-undo', onclick: () => doUndo() }, 'Desfazer última alteração do chat');
    const form = h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); submit(); } }, input, sendBtn);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    el.classList.add('chat');
    el.replaceChildren(h('div', { class: 'chat-head' }, h('b', {}, 'Assistente de estudos'), undoBtn), banner, list, form);

    const refreshUndo = () => { undoBtn.disabled = busy || !K.lastUndoable(api.getState()); };
    const scroll = () => { list.scrollTop = list.scrollHeight; };
    const bubble = (role, text) => { const b = h('div', { class: `chat-msg chat-${role}` }, ...String(text).split('\n').flatMap((l, i) => (i ? [h('br'), l] : [l]))); list.append(b); scroll(); return b; };
    const addCard = (card) => { list.append(card); scroll(); return card; };
    const log = (role, text) => { msgs.push({ role, text, at: nowMs() }); if (msgs.length > MAX_LOG) msgs = msgs.slice(-MAX_LOG); };
    const setBusy = (v) => { busy = v; sendBtn.disabled = v || !enabled; input.disabled = !enabled; refreshUndo(); };
    msgs.forEach((m) => bubble(m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant', m.text));
    if (!msgs.length) bubble('assistant', 'Oi! Posso criar, mover, consultar e reorganizar seus blocos de estudo. Antes de mudar algo que não seja óbvio, mostro a proposta para você confirmar.');

    // chat desativado (sem chave / aberto sem o servidor): o restante do app segue funcionando
    const disable = (msg) => { enabled = false; banner.textContent = msg; banner.hidden = false; setBusy(false); };
    if (typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
      fetch((api.endpoint || '') + '/api/status').then((r) => r.json()).then((s) => { if (!s.chat) disable('Chat desativado: falta a chave da Anthropic. Defina ANTHROPIC_API_KEY no arquivo .env e reinicie com o iniciar.bat.'); }).catch(() => disable('Chat indisponível: abra o app pelo iniciar.bat (servidor local).'));
    } else disable('Chat indisponível: abra o app pelo iniciar.bat (servidor local).');
    refreshUndo();

    /* ---- gravação: única porta é Commands.applyChanges; só anuncia depois de salvar ---- */
    function persist(state) { return { ...state, chat: { messages: msgs.slice(-MAX_LOG) } }; }
    function commitResult(res, report) {
      if (!res.applied.length) { log('system', report); bubble('system', report); return false; }
      log('system', report);
      try { api.setState(persist(res.state)); } catch (e) {
        msgs.pop();
        const m = 'Não consegui salvar as alterações; nada foi alterado.';
        log('system', m); bubble('system', m); return false;
      }
      bubble('system', report); refreshUndo(); return true;
    }
    function applyNow(changes, summary) {
      const res = K.applyChanges(api.getState(), changes, { source: 'chat', summary, nowMs: nowMs() });
      commitResult(res, reportText(res));
    }
    function doUndo() {
      if (busy) return;
      const res = K.undoLast(api.getState());
      if (!res.undone) { const m = 'Não há alteração do chat para desfazer.'; log('system', m); bubble('system', m); return; }
      const lines = [`${res.failed.length ? 'Desfeito parcialmente' : 'Desfeito'}: ${res.undone.summary}`, ...res.failed.map((f) => `• Não revertido: ${f.reason}`)];
      const text = lines.join('\n');
      log('system', text);
      try { api.setState(persist(res.state)); } catch (e) { msgs.pop(); const m = 'Não consegui salvar; nada foi desfeito.'; log('system', m); bubble('system', m); return; }
      bubble('system', text); refreshUndo();
    }

    /* ---- cartões ---- */
    const kv = (cls, items) => (items.length ? h('ul', { class: cls }, items.map((t) => h('li', {}, t))) : null);
    function resultView(r) {
      if (r.type === 'schedule') return h('div', { class: 'chat-result' }, h('div', {}, r.text),
        r.days.filter((d) => d.blocks.length).map((d) => h('div', { class: 'chat-day' }, h('b', {}, d.label), ' ', d.blocks.map((b) => `${b.start}–${b.end} ${b.subject}: ${b.title}${b.completed ? ' ✓' : ''}`).join(' · '))));
      if (r.type === 'free_time') return h('div', { class: 'chat-result' }, h('div', {}, r.text),
        r.days.filter((d) => d.intervals.length).map((d) => h('div', { class: 'chat-day' }, h('b', {}, d.label), ' ', d.intervals.map((i) => `${i.from}–${i.to}`).join(' · '))));
      return h('div', { class: 'chat-result' }, r.text);
    }
    function capacityLines(plan) {
      const e = plan.capacityEffect || {}, out = [];
      for (const w of e.weeks || []) {
        const b = e.before[w], a = e.after[w], f = (m) => C.fmtDur(m * C.MIN);
        out.push(`Semana de ${w.slice(8)}/${w.slice(5, 7)}: estudo planejado ${f(b.plannedNetMin)} → ${f(a.plannedNetMin)}${a.limitMin == null ? '' : ` (limite ${f(a.limitMin)}, saldo ${a.balanceMin < 0 ? '−' : ''}${f(Math.abs(a.balanceMin))})`}`);
      }
      return out;
    }
    function planBody(plan) {
      return [
        kv('chat-changes', plan.changes.map((c) => c.summary)),
        kv('chat-warn', plan.warnings.map((w) => w.text)),
        kv('chat-conf', plan.conflicts.map((c) => c.text)),
        kv('chat-cap', capacityLines(plan)),
        plan.results.filter((r) => r.type !== 'noop' && r.type !== 'undo').map(resultView),
        kv('chat-info', plan.results.filter((r) => r.type === 'noop').map((r) => r.text)),
      ];
    }
    function proposalCard(plan, commands) {
      const card = h('div', { class: 'chat-card' });
      const close = () => card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      card.append(h('div', { class: 'chat-card-title' }, 'Proposta — nada foi alterado ainda'), ...planBody(plan).flat(Infinity).filter(Boolean),
        h('div', { class: 'chat-actions' },
          h('button', { class: 'primary', type: 'button', onclick: () => { close(); card.classList.add('done'); confirmPlan(commands); } }, 'Confirmar'),
          h('button', { type: 'button', onclick: () => { close(); card.classList.add('done'); const m = 'Proposta cancelada. Nada foi alterado.'; log('system', m); bubble('system', m); } }, 'Cancelar')));
      return card;
    }
    function questionCard(plan) {
      const card = h('div', { class: 'chat-card chat-ask' }, h('div', { class: 'chat-card-title' }, 'Preciso confirmar antes de alterar (nada foi alterado)'));
      for (const q of plan.questions) {
        card.append(h('p', {}, q.text));
        if (q.options && q.options.length) card.append(h('div', { class: 'chat-actions' }, q.options.map((o) => h('button', { type: 'button', onclick: () => {
          card.querySelectorAll('button').forEach((b) => { b.disabled = true; }); card.classList.add('done');
          if (o.commands) runCommands(o.commands); else sendText(`Me refiro a: ${o.label}`);
        } }, o.label))));
      }
      return card;
    }

    /* ---- fluxo ---- */
    // Ao confirmar, replaneja sobre o estado ATUAL (o calendário pode ter mudado desde a proposta).
    function confirmPlan(commands) {
      const plan = K.plan(api.getState(), commands, nowMs());
      if (plan.status === 'needs_clarification') { addCard(questionCard(plan)); return; }
      if (plan.undo && !plan.changes.length) { doUndo(); return; }
      applyNow(plan.changes, plan.changes.map((c) => c.summary).join('; '));
    }
    function handlePlan(plan, commands) {
      if (plan.status === 'needs_clarification') { addCard(questionCard(plan)); return; }
      if (plan.undo && !plan.changes.length) { doUndo(); return; }
      if (plan.status === 'needs_confirmation') { addCard(proposalCard(plan, commands)); return; }
      if (plan.changes.length) { applyNow(plan.changes, plan.changes.map((c) => c.summary).join('; ')); return; }
      const body = planBody(plan);
      if (body.some(Boolean)) addCard(h('div', { class: 'chat-card' }, body));
      else if (!plan.warnings.length) bubble('system', 'Nada a alterar.');
    }
    function runCommands(commands) {
      try { handlePlan(K.plan(api.getState(), commands, nowMs()), commands); }
      catch (e) { const m = 'Não consegui montar a proposta para esse pedido. Nada foi alterado.'; log('system', m); bubble('system', m); }
    }

    async function sendText(text) {
      if (busy || !enabled || !text.trim()) return;
      log('user', text.trim()); bubble('user', text.trim());
      setBusy(true);
      const wait = bubble('system', 'Pensando…');
      try {
        const history = msgs.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-20).map((m) => ({ role: m.role, text: m.text }));
        const res = await fetch((api.endpoint || '') + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: history, context: buildContext(api.getState(), nowMs()) }) });
        const data = await res.json().catch(() => ({}));
        wait.remove();
        if (!res.ok) { const m = data.error || 'O assistente não respondeu. Tente de novo.'; log('system', m); bubble('system', m); return; }
        if (data.reply) { log('assistant', data.reply); bubble('assistant', data.reply); }
        if (data.commands && data.commands.length) runCommands(data.commands);
        else if (!data.reply) bubble('assistant', 'Não entendi o pedido. Pode reformular?');
      } catch (e) {
        wait.remove();
        const m = 'Não consegui falar com o servidor local. Abra o app pelo iniciar.bat.'; log('system', m); bubble('system', m);
      } finally { setBusy(false); }
    }
    function submit() { const t = input.value; if (!t.trim() || busy || !enabled) return; input.value = ''; sendText(t); }

    return { refresh: refreshUndo, send: sendText };
  }

  return { mount, buildContext, reportText };
});
