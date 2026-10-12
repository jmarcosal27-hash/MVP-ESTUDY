/* Comandos do chat (requisitos 07 e 12): resolução de bloco, proposta (diff), aplicação única e desfazer.
 * Módulo puro (sem DOM/storage), testável em Node. O LLM só produz comandos; tempos, conflitos e capacidade
 * vêm de core.js/capacity.js. Nada é "anunciado como feito" aqui: quem aplica é applyChanges, e só depois de
 * salvar o chat pode relatar o resultado. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let sched = null;
    try { sched = require('./scheduler.js'); } catch (e) { /* scheduler ainda não publicado: propose_schedule avisa */ }
    module.exports = factory(require('./core.js'), require('./capacity.js'), () => sched);
  } else root.Commands = factory(root.Core, root.Capacity, () => root.Scheduler || null);
})(typeof self !== 'undefined' ? self : this, function (C, Cap, getScheduler) {
  const DAY_ABBR = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const WEEKDAY_NAMES = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo: 7 };
  const UPDATABLE = ['subject', 'title', 'date', 'start', 'estimated', 'config', 'kind', 'priority', 'deadline', 'fixed',
    'material', 'pdf', 'pages', 'notes', 'studied', 'remainingMin'];
  const TIME_KEYS = ['date', 'start', 'estimated', 'config'];

  /* ---------- utilitários ---------- */
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function deq(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deq(a[k], b[k]));
  }
  /** '14h', '14:00', '9', '09:30' => 'HH:MM'; inválido => null. */
  function normTime(v) {
    if (v == null) return null;
    const m = String(v).trim().toLowerCase().match(/^(\d{1,2})(?:\s*[:h]\s*(\d{2})?)?$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2] || 0);
    return h > 23 || mi > 59 ? null : `${C.pad(h)}:${C.pad(mi)}`;
  }
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function parseWeekday(v) {
    if (Number.isInteger(v) && v >= 1 && v <= 7) return v;
    const n = norm(v).replace(/-feira$/, '');
    return WEEKDAY_NAMES[n] || null;
  }
  const fmtDay = (date) => { const d = C.parseDate(date); return `${DAY_ABBR[Cap.isoWeekday(date) - 1]} ${C.pad(d.getDate())}/${C.pad(d.getMonth() + 1)}`; };
  const fmtWhen = (date, start) => `${fmtDay(date)} ${start}`;
  const spanOf = (b) => { const s = C.toMin(b.start); return [s, s + Cap.agendaMin(b)]; };
  const byWhen = (a, b) => (a.date + a.start < b.date + b.start ? -1 : a.date + a.start > b.date + b.start ? 1 : 0);
  const nowMsOf = (n) => (typeof n === 'number' ? n : Date.now());

  /* ---------- resolução de bloco ---------- */
  /** ref = {id} | {subject?, title?, date?, start?, weekday?}. Nunca escolhe sozinho entre vários. */
  function resolveRef(state, ref) {
    const blocks = (state && state.blocks) || [];
    if (!ref || typeof ref !== 'object') return { status: 'none', matches: [] };
    if (ref.id) {
      const b = blocks.find((x) => x.id === ref.id);
      return b ? { status: 'one', matches: [b] } : { status: 'none', matches: [] };
    }
    const wd = ref.weekday != null && ref.weekday !== '' ? parseWeekday(ref.weekday) : null;
    const start = ref.start ? normTime(ref.start) : null;
    const crit = [ref.subject, ref.title, ref.date, ref.start, ref.weekday].filter((v) => v != null && v !== '');
    if (!crit.length || (ref.weekday != null && ref.weekday !== '' && !wd) || (ref.start && !start)) return { status: 'none', matches: [] };
    const has = (hay, needle) => { const h = norm(hay), n = norm(needle); return h.includes(n) || n.includes(h); };
    const base = blocks.filter((b) => (!ref.subject || has(b.subject, ref.subject)) && (!ref.title || has(b.title, ref.title))
      && (!ref.date || b.date === ref.date) && (!wd || Cap.isoWeekday(b.date) === wd));
    let matches = start ? base.filter((b) => b.start === start) : base;
    if (start && !matches.length) { // sem início exato: aceita o bloco que cobre esse horário
      const st = C.toMin(start);
      matches = base.filter((b) => { const [a, e] = spanOf(Cap.normalizeBlock(b)); return a <= st && st < e; });
    }
    matches = matches.slice().sort(byWhen);
    return { status: matches.length === 1 ? 'one' : matches.length ? 'ambiguous' : 'none', matches };
  }
  const describe = (b) => `${b.subject} — ${b.title} (${fmtWhen(b.date, b.start)})`;

  /* ---------- horários livres e conflitos (sempre sobre o estado de trabalho) ---------- */
  const vstate = (ctx) => ({ ...ctx.state, blocks: ctx.work });
  function overlapsOf(ctx, draft, ignoreId) {
    const [a, e] = spanOf(draft);
    return ctx.work.filter((b) => b.id !== ignoreId && b.date === draft.date && (() => { const [s, f] = spanOf(b); return a < f && s < e; })());
  }
  const inAvailability = (ctx, draft, ignoreId) => {
    const [a, e] = spanOf(draft);
    return Cap.freeIntervals(vstate(ctx), draft.date, ignoreId ? [ignoreId] : []).some((iv) => iv.startMin <= a && iv.endMin >= e);
  };
  /** Horários livres onde o rascunho cabe, do mais próximo da preferência ao mais distante. */
  function slotsFor(ctx, draft, { prefDate, prefStart, days = 3, max = 3, ignoreId, afterMs = 0, untilDate = null }) {
    const need = Cap.agendaMin(draft), pref = C.toMin(prefStart || '00:00'), out = [];
    for (let k = 0; k <= days; k++) {
      const date = C.isoDate(C.addDays(C.parseDate(prefDate), k));
      if (untilDate && date > untilDate) break;
      for (const iv of Cap.freeIntervals(vstate(ctx), date, ignoreId ? [ignoreId] : [])) {
        const cands = new Set([iv.startMin]);
        if (k === 0) cands.add(Math.max(iv.startMin, pref));
        for (const st of cands) {
          const startMs = C.atMinutes(date, st).getTime();
          if (st + need <= iv.endMin && startMs >= afterMs) out.push({ date, start: C.fromMin(st), k, dist: Math.abs(st - pref) });
        }
      }
    }
    out.sort((x, y) => x.k - y.k || x.dist - y.dist || (x.start < y.start ? -1 : 1));
    const seen = new Set();
    return out.filter((s) => { const key = s.date + s.start; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, max);
  }

  /* ---------- contexto da proposta ---------- */
  function makeCtx(state, nowMs) {
    return { state, nowMs, work: (state.blocks || []).map((b) => Cap.normalizeBlock(clone(b))), seq: 0,
      changes: [], questions: [], results: [], conflicts: [], warnings: [], alternatives: [], confirm: false, mutating: 0, undoRequested: false };
  }
  const genId = (ctx) => `c${ctx.nowMs.toString(36)}${(++ctx.seq).toString(36)}`;
  const warn = (ctx, code, text) => { ctx.warnings.push({ code, text }); };
  const ask = (ctx, q) => { ctx.questions.push(q); };
  const note = (ctx, type, text, extra = {}) => { ctx.results.push({ type, text, ...extra }); };

  /** Registra a mudança no diff e já a reflete no estado de trabalho (para os próximos comandos). */
  function commit(ctx, change) {
    const w = ctx.work, i = w.findIndex((b) => b.id === change.id);
    const prev = ctx.changes.findIndex((c) => c.id === change.id && c.op !== 'setting');
    if (change.op === 'create') w.push(clone(change.after));
    else if (change.op === 'update' && i >= 0) w[i] = clone(change.after);
    else if (change.op === 'delete' && i >= 0) w.splice(i, 1);
    if (prev >= 0 && change.op !== 'setting') { // vários comandos sobre o mesmo bloco viram uma só mudança
      const p = ctx.changes[prev];
      if (p.op === 'create' && change.op === 'delete') { ctx.changes.splice(prev, 1); return; }
      p.after = change.op === 'delete' ? null : change.after;
      if (change.op === 'delete') p.op = 'delete';
      p.summary += `; ${change.summary}`;
      if (p.op === 'update' && deq(p.before, p.after)) ctx.changes.splice(prev, 1);
      return;
    }
    ctx.changes.push(change);
  }

  function resolveOne(ctx, i, ref, what) {
    const r = resolveRef(vstate(ctx), ref);
    if (r.status === 'one') return r.matches[0];
    if (r.status === 'none') ask(ctx, { id: `ref_none_${i}`, text: `Não encontrei o bloco${what ? ' ' + what : ''}. Qual é a matéria, o dia e o horário dele?` });
    else ask(ctx, { id: `ref_ambiguous_${i}`, text: `Mais de um bloco combina com o pedido. Qual deles?`,
      options: r.matches.map((b) => ({ label: describe(b), ref: { id: b.id } })) });
    return null;
  }

  /** Reagenda/edita um bloco: valida, checa conflito e disponibilidade e registra a mudança. */
  function modify(ctx, i, block, patch, verb) {
    const keys = Object.keys(patch).filter((k) => !deq(patch[k], block[k]));
    if (!keys.length) { note(ctx, 'noop', `"${block.title}" já está assim; nada a alterar.`, { id: block.id }); return; }
    const after = Cap.normalizeBlock({ ...block, ...patch });
    const timeChanged = keys.some((k) => TIME_KEYS.includes(k));
    const errs = C.validateBlockPlan(after).filter((m) => !/matéria|assunto/i.test(m) || keys.includes('subject') || keys.includes('title'));
    if (errs.length) { ask(ctx, { id: `invalid_${i}`, text: `Não consigo aplicar em "${block.title}": ${errs.join(' ')}` }); return; }
    if (timeChanged) {
      const clash = overlapsOf(ctx, after, block.id);
      if (clash.length) {
        const text = `${fmtWhen(after.date, after.start)} está ocupado por ${clash.map((b) => `"${b.title}"`).join(', ')}.`;
        ctx.conflicts.push({ blockId: block.id, with: clash.map((b) => b.id), text });
        const slots = slotsFor(ctx, after, { prefDate: after.date, prefStart: after.start, ignoreId: block.id, afterMs: ctx.nowMs });
        const alts = slots.map((s) => ({ text: `Mover para ${fmtWhen(s.date, s.start)}`,
          commands: [{ type: 'move_block', ref: { id: block.id }, to: { date: s.date, start: s.start } }] }));
        ctx.alternatives.push(...alts);
        ask(ctx, { id: `dest_busy_${i}`, text: `${text} ${alts.length ? 'Escolha um destes horários livres:' : 'Não achei horário livre próximo; diga outro horário.'}`,
          options: alts.map((a) => ({ label: a.text, commands: a.commands })) });
        return;
      }
      if (!inAvailability(ctx, after, block.id)) warn(ctx, 'FORA_DA_DISPONIBILIDADE', `${fmtWhen(after.date, after.start)} está fora da sua disponibilidade (ou numa indisponibilidade).`);
    }
    if (block.fixed && timeChanged) { warn(ctx, 'BLOCO_FIXO', `"${block.title}" tem horário obrigatório.`); ctx.confirm = true; }
    if (block.completed && timeChanged) { warn(ctx, 'BLOCO_CONCLUIDO', `"${block.title}" já está concluído.`); ctx.confirm = true; }
    const summary = `${verb}: ${describe(block)}${timeChanged ? ` → ${fmtWhen(after.date, after.start)}` : ''}${timeChanged && after.estimated !== block.estimated ? ` (${after.estimated} pomodoro(s))` : ''}`;
    commit(ctx, { op: 'update', id: block.id, before: clone(block), after, summary });
    ctx.mutating++;
  }

  /* ---------- manipuladores de comando ---------- */
  function cmdCreate(ctx, i, cmd) {
    const raw = cmd.block || {};
    const cfg = { ...C.DEFAULT_CONFIG, ...((ctx.state.settings && ctx.state.settings.config) || {}), ...(raw.config || {}) };
    const start = raw.start ? normTime(raw.start) : null;
    const missing = [];
    if (!raw.subject || !String(raw.subject).trim()) missing.push('matéria');
    if (!raw.title || !String(raw.title).trim()) missing.push('assunto');
    if (!isDate(raw.date)) missing.push('dia');
    if (!start) missing.push('horário de início');
    if (!Number.isInteger(raw.estimated) || raw.estimated < 1) missing.push('quantidade de pomodoros');
    if (missing.length) { ask(ctx, { id: `missing_${i}`, missing, text: `Para criar o bloco, falta informar: ${missing.join(', ')}.` }); return; }
    const draft = Cap.normalizeBlock({ ...raw, subject: String(raw.subject).trim(), title: String(raw.title).trim(), start, config: cfg,
      id: raw.id || genId(ctx), completed: false, sessions: [], source: 'chat', originWeek: Cap.weekKey(raw.date) });
    const errs = C.validateBlockPlan(draft);
    if (errs.length) { ask(ctx, { id: `invalid_${i}`, text: `Não consigo criar o bloco: ${errs.join(' ')}` }); return; }
    const dup = ctx.work.find((b) => norm(b.subject) === norm(draft.subject) && norm(b.title) === norm(draft.title) && b.date === draft.date && b.start === draft.start);
    if (dup) { note(ctx, 'noop', `"${dup.title}" já existe em ${fmtWhen(dup.date, dup.start)}; não criei de novo.`, { id: dup.id }); return; }
    const clash = overlapsOf(ctx, draft, null);
    if (clash.length) {
      ctx.conflicts.push({ blockId: draft.id, with: clash.map((b) => b.id), text: `${fmtWhen(draft.date, draft.start)} está ocupado por ${clash.map((b) => `"${b.title}"`).join(', ')}.` });
      const alts = slotsFor(ctx, draft, { prefDate: draft.date, prefStart: draft.start, afterMs: ctx.nowMs })
        .map((s) => ({ text: `Criar em ${fmtWhen(s.date, s.start)}`, commands: [{ type: 'create_block', block: { ...raw, date: s.date, start: s.start } }] }));
      ctx.alternatives.push(...alts);
      ask(ctx, { id: `dest_busy_${i}`, text: `${fmtWhen(draft.date, draft.start)} está ocupado por ${clash.map((b) => `"${b.title}"`).join(', ')}. ${alts.length ? 'Escolha um horário livre:' : 'Diga outro horário.'}`,
        options: alts.map((a) => ({ label: a.text, commands: a.commands })) });
      return;
    }
    if (!inAvailability(ctx, draft, null)) warn(ctx, 'FORA_DA_DISPONIBILIDADE', `${fmtWhen(draft.date, draft.start)} está fora da sua disponibilidade.`);
    const fit = Cap.wouldFit(vstate(ctx), draft, Cap.weekKey(draft.date), ctx.nowMs);
    if (!fit.fitsCapacity) {
      warn(ctx, 'LIMITE_EXCEDIDO', `Criar "${draft.title}" ultrapassa o limite semanal em ${C.fmtDur(fit.excessMin * C.MIN)}.`);
      ctx.alternatives.push(...fit.options.map((o) => ({ text: o.text, commands: [], option: o })));
      ctx.confirm = true;
    }
    commit(ctx, { op: 'create', id: draft.id, before: null, after: draft, summary: `Criar: ${describe(draft)}, ${draft.estimated} pomodoro(s)` });
    ctx.mutating++;
  }

  function cmdUpdate(ctx, i, cmd) {
    const b = resolveOne(ctx, i, cmd.ref); if (!b) return;
    const ch = cmd.changes || {}, patch = {};
    for (const k of Object.keys(ch)) {
      if (!UPDATABLE.includes(k)) { warn(ctx, 'CAMPO_IGNORADO', `O campo "${k}" não pode ser alterado pelo chat.`); continue; }
      patch[k] = k === 'config' ? { ...b.config, ...ch[k] } : k === 'start' ? (normTime(ch[k]) || ch[k]) : ch[k];
    }
    modify(ctx, i, b, patch, 'Editar');
  }

  function cmdMove(ctx, i, cmd) {
    const b = resolveOne(ctx, i, cmd.ref); if (!b) return;
    const to = cmd.to || {}, start = to.start ? normTime(to.start) : b.start;
    if ((to.date && !isDate(to.date)) || !start) { ask(ctx, { id: `invalid_${i}`, text: 'Não entendi o novo dia ou horário. Informe, por exemplo, quinta às 9h.' }); return; }
    if (!to.date && !to.start) { ask(ctx, { id: `move_where_${i}`, text: `Para quando devo mover "${b.title}"?` }); return; }
    modify(ctx, i, b, { date: to.date || b.date, start }, 'Mover');
  }

  function cmdDelete(ctx, i, cmd) {
    const b = resolveOne(ctx, i, cmd.ref); if (!b) return;
    const studied = C.sessionsTotals(b.sessions).studyMs;
    if (studied > 0) warn(ctx, 'EXCLUI_ESTUDO_REGISTRADO', `"${b.title}" tem ${C.fmtDur(studied)} de estudo registrado, que será apagado junto.`);
    ctx.confirm = true; // excluir sempre pede confirmação
    commit(ctx, { op: 'delete', id: b.id, before: clone(b), after: null, summary: `Excluir: ${describe(b)}` });
    ctx.mutating++;
  }

  function cmdAddPomodoro(ctx, i, cmd) {
    const b = resolveOne(ctx, i, cmd.ref); if (!b) return;
    const n = cmd.count == null ? 1 : cmd.count;
    if (!Number.isInteger(n) || n < 1) { ask(ctx, { id: `count_${i}`, text: 'Quantos pomodoros devo acrescentar?' }); return; }
    modify(ctx, i, b, { estimated: b.estimated + n }, `Acrescentar ${n} pomodoro(s)`);
  }

  function cmdComplete(ctx, i, cmd, done) {
    const b = resolveOne(ctx, i, cmd.ref); if (!b) return;
    if (!!b.completed === done) { note(ctx, 'noop', `"${b.title}" já está ${done ? 'concluído' : 'em aberto'}.`, { id: b.id }); return; }
    commit(ctx, { op: 'update', id: b.id, before: clone(b), after: { ...b, completed: done },
      summary: `${done ? 'Concluir' : 'Reabrir'}: ${describe(b)}` });
    ctx.mutating++;
  }

  function cmdAddReview(ctx, i, cmd) {
    const o = resolveOne(ctx, i, cmd.ref); if (!o) return;
    const existing = ctx.work.find((b) => b.kind === 'revisao' && b.reviewOf === o.id && !b.completed);
    if (existing) { note(ctx, 'noop', `Já existe uma revisão de "${o.title}" em ${fmtWhen(existing.date, existing.start)}; não dupliquei.`, { id: existing.id }); return; }
    const estimated = Math.max(1, Math.ceil(o.estimated / 2));
    const draftOf = (date, start) => Cap.normalizeBlock({ id: genId(ctx), subject: o.subject, title: `Revisão: ${o.title}`, date, start, estimated,
      config: o.config, kind: 'revisao', reviewOf: o.id, priority: o.priority, deadline: null, completed: false, sessions: [], source: 'chat', originWeek: Cap.weekKey(date) });
    const date = cmd.date, start = cmd.start ? normTime(cmd.start) : null;
    if (!date || !start) {
      const from = date || C.isoDate(C.addDays(C.parseDate(o.date > C.isoDate(new Date(ctx.nowMs)) ? o.date : C.isoDate(new Date(ctx.nowMs))), 1));
      const slots = slotsFor(ctx, draftOf(from, '08:00'), { prefDate: from, prefStart: start || '08:00', days: 7, max: 3, afterMs: ctx.nowMs });
      ask(ctx, { id: `review_when_${i}`, text: `Quando quer revisar "${o.title}"?${slots.length ? ' Horários livres:' : ''}`,
        options: slots.map((s) => ({ label: fmtWhen(s.date, s.start), commands: [{ type: 'add_review', ref: { id: o.id }, date: s.date, start: s.start }] })) });
      return;
    }
    const draft = draftOf(date, start);
    const errs = C.validateBlockPlan(draft);
    if (errs.length) { ask(ctx, { id: `invalid_${i}`, text: `Não consigo criar a revisão: ${errs.join(' ')}` }); return; }
    const clash = overlapsOf(ctx, draft, null);
    if (clash.length) {
      const alts = slotsFor(ctx, draft, { prefDate: date, prefStart: start, afterMs: ctx.nowMs })
        .map((s) => ({ text: `Revisar em ${fmtWhen(s.date, s.start)}`, commands: [{ type: 'add_review', ref: { id: o.id }, date: s.date, start: s.start }] }));
      ctx.alternatives.push(...alts);
      ctx.conflicts.push({ blockId: draft.id, with: clash.map((b) => b.id), text: `${fmtWhen(date, start)} está ocupado.` });
      ask(ctx, { id: `dest_busy_${i}`, text: `${fmtWhen(date, start)} está ocupado. Escolha um horário livre:`, options: alts.map((a) => ({ label: a.text, commands: a.commands })) });
      return;
    }
    commit(ctx, { op: 'create', id: draft.id, before: null, after: draft, summary: `Criar revisão: ${describe(draft)}` });
    ctx.mutating++;
  }

  /* consultas: tudo calculado aqui, nunca pelo LLM */
  const blockView = (b) => { const [s, e] = spanOf(b); return { id: b.id, subject: b.subject, title: b.title, kind: b.kind, start: b.start, end: C.fromMin(e),
    studyMin: Cap.netStudyMin(b), agendaMin: Cap.agendaMin(b), completed: !!b.completed }; };
  function rangeOf(ctx, r, fallbackDays) {
    const today = C.isoDate(new Date(ctx.nowMs));
    r = r || {};
    const from = isDate(r.from) ? r.from : isDate(r.date) ? r.date : today;
    const to = isDate(r.to) ? r.to : isDate(r.from) || isDate(r.date) ? from : C.isoDate(C.addDays(C.parseDate(from), fallbackDays));
    const dates = []; for (let d = from; d <= to && dates.length < 62; d = C.isoDate(C.addDays(C.parseDate(d), 1))) dates.push(d);
    return { from, to, dates };
  }
  function cmdQuerySchedule(ctx, i, cmd) {
    const { from, to, dates } = rangeOf(ctx, cmd.range, 6);
    const days = dates.map((date) => { const bl = ctx.work.filter((b) => b.date === date).sort(byWhen).map(blockView);
      return { date, label: fmtDay(date), blocks: bl, studyMin: bl.reduce((s, b) => s + b.studyMin, 0) }; });
    const total = days.reduce((s, d) => s + d.studyMin, 0);
    note(ctx, 'schedule', `${days.reduce((s, d) => s + d.blocks.length, 0)} bloco(s) entre ${fmtDay(from)} e ${fmtDay(to)}, ${C.fmtDur(total * C.MIN)} de estudo.`, { from, to, days, totalStudyMin: total });
  }
  function cmdQueryFree(ctx, i, cmd) {
    const { from, to, dates } = rangeOf(ctx, cmd.range || { date: cmd.date, from: cmd.from, to: cmd.to }, 0);
    const minMin = Number.isInteger(cmd.minMin) ? cmd.minMin : 0, today = C.isoDate(new Date(ctx.nowMs));
    const nowD = new Date(ctx.nowMs), nowMin = nowD.getHours() * 60 + nowD.getMinutes();
    const days = dates.filter((d) => d >= today).map((date) => ({ date, label: fmtDay(date),
      intervals: Cap.freeIntervals(vstate(ctx), date).map((iv) => ({ s: date === today ? Math.max(iv.startMin, nowMin) : iv.startMin, e: iv.endMin }))
        .filter((iv) => iv.e - iv.s >= Math.max(1, minMin)).map((iv) => ({ from: C.fromMin(iv.s), to: C.fromMin(iv.e), min: iv.e - iv.s })) }));
    const total = days.reduce((s, d) => s + d.intervals.reduce((t, iv) => t + iv.min, 0), 0);
    note(ctx, 'free_time', `${C.fmtDur(total * C.MIN)} livres entre ${fmtDay(from)} e ${fmtDay(to)}${minMin ? ` (faixas de ${C.fmtDur(minMin * C.MIN)} ou mais)` : ''}.`, { from, to, minMin, days, totalMin: total });
  }
  function cmdQueryCapacity(ctx, i, cmd) {
    const date = isDate(cmd.week) ? cmd.week : C.isoDate(new Date(ctx.nowMs)), week = Cap.weekKey(date);
    const cap = Cap.capacityFor(vstate(ctx), week, ctx.nowMs);
    const lim = cap.limitMin == null ? 'sem limite' : `limite ${C.fmtDur(cap.limitMin * C.MIN)}`;
    note(ctx, 'capacity', `Semana de ${fmtDay(week)}: ${lim}, planejado ${C.fmtDur(cap.plannedNetMin * C.MIN)}${cap.balanceMin == null ? '' : `, saldo ${C.fmtDur(Math.abs(cap.balanceMin) * C.MIN)}${cap.balanceMin < 0 ? ' (excesso)' : ''}`}.`, { week, capacity: cap });
  }

  function cmdPropose(ctx, i, cmd) {
    const S = getScheduler();
    if (!S || !S.proposeSchedule) { warn(ctx, 'SCHEDULER_INDISPONIVEL', 'O gerador de cronograma ainda não está disponível.'); return; }
    const req = cmd.request || {}, week = Cap.weekKey(isDate(req.week) ? req.week : C.isoDate(new Date(ctx.nowMs)));
    const r = S.proposeSchedule(vstate(ctx), { preserveExisting: true, ...req }, week, ctx.nowMs);
    for (const p of r.placements || []) {
      const blk = Cap.normalizeBlock({ id: genId(ctx), subject: p.subject, title: p.title, date: p.date, start: p.start, estimated: p.estimated,
        config: p.config, kind: p.kind || 'estudo', priority: p.priority || null, deadline: p.deadline || null, material: p.material || '', pdf: p.material || '',
        completed: false, sessions: [], source: 'chat', originWeek: Cap.weekKey(p.date) });
      commit(ctx, { op: 'create', id: blk.id, before: null, after: blk, summary: `Criar: ${describe(blk)}, ${blk.estimated} pomodoro(s)${p.reason ? ` — ${p.reason}` : ''}` });
      ctx.mutating++;
    }
    for (const u of r.unplaced || []) warn(ctx, `NAO_COUBE_${u.code || 'X'}`, `Não coube: ${(u.item && (u.item.title || u.item.subject)) || 'item'} — ${u.reason}`);
    for (const w of r.warnings || []) warn(ctx, typeof w === 'string' ? w : w.code || 'AVISO', typeof w === 'string' ? w : w.text || w.code);
    note(ctx, 'schedule_proposal', `${(r.placements || []).length} bloco(s) encaixado(s), ${(r.unplaced || []).length} não couberam.`, { unplaced: r.unplaced || [], capacity: r.capacity || null });
    ctx.confirm = true; // cronograma gerado sempre passa por revisão
  }

  /** 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM' ou {date, start|time} => {date, min}. */
  function parsePoint(v, defMin) {
    if (!v) return null;
    let date, time;
    if (typeof v === 'string') [date, time] = v.trim().split(/[ T]/);
    else { date = v.date; time = v.start || v.time; }
    if (!isDate(date)) return null;
    const t = time ? normTime(time) : null;
    return { date, min: t ? C.toMin(t) : defMin };
  }
  function cmdReorganize(ctx, i, cmd) {
    const from = parsePoint(cmd.from, 0), to = parsePoint(cmd.to, 1440);
    if (!from || !to) { ask(ctx, { id: `period_${i}`, text: 'Qual período você perdeu? Informe o dia e as horas (de/até).' }); return; }
    const a = C.atMinutes(from.date, from.min).getTime(), z = C.atMinutes(to.date, to.min).getTime();
    const hit = ctx.work.filter((b) => { if (b.completed || b.fixed) return false; const [s, e] = spanOf(b);
      return C.atMinutes(b.date, s).getTime() < z && C.atMinutes(b.date, e).getTime() > a; });
    const rank = { alta: 0, media: 1, baixa: 2 };
    hit.sort((x, y) => (rank[x.priority] ?? 3) - (rank[y.priority] ?? 3) || (x.deadline || '9') .localeCompare(y.deadline || '9') || byWhen(x, y));
    const skippedFixed = ctx.work.filter((b) => b.fixed && !b.completed && (() => { const [s, e] = spanOf(b); return C.atMinutes(b.date, s).getTime() < z && C.atMinutes(b.date, e).getTime() > a; })());
    const moved = [], unplaced = [];
    // libera todos os afetados antes de procurar horários, para um não bloquear o outro
    const after = Math.max(z, ctx.nowMs), afterDate = C.isoDate(new Date(after));
    for (const b of hit) {
      const draft = Cap.normalizeBlock({ ...b });
      const slot = slotsFor(ctx, draft, { prefDate: afterDate, prefStart: C.fromMin(new Date(after).getHours() * 60 + new Date(after).getMinutes()),
        days: 14, max: 1, ignoreId: b.id, afterMs: after, untilDate: b.deadline || null })[0];
      if (!slot) { unplaced.push(b); continue; }
      commit(ctx, { op: 'update', id: b.id, before: clone(b), after: { ...b, date: slot.date, start: slot.start },
        summary: `Reagendar: ${describe(b)} → ${fmtWhen(slot.date, slot.start)}` });
      moved.push({ id: b.id, from: fmtWhen(b.date, b.start), to: fmtWhen(slot.date, slot.start) });
    }
    ctx.mutating += moved.length;
    for (const b of unplaced) warn(ctx, 'NAO_COUBE', `"${b.title}" não coube em nenhum horário livre${b.deadline ? ` antes do prazo (${b.deadline})` : ' nos próximos 14 dias'}; continua no lugar original.`);
    for (const b of skippedFixed) warn(ctx, 'BLOCO_FIXO_NO_PERIODO', `"${b.title}" tem horário obrigatório e não foi movido.`);
    if (unplaced.length && hit.some((b) => !b.priority)) {
      ask(ctx, { id: `reorg_priority_${i}`, text: 'Não há horários para todos os blocos afetados e faltam prioridades. Qual deles deve ser reagendado primeiro?',
        options: hit.map((b) => ({ label: describe(b), commands: [{ type: 'update_block', ref: { id: b.id }, changes: { priority: 'alta' } }, cmd] })) });
    }
    note(ctx, 'reorganize', `${moved.length} bloco(s) reagendado(s), ${unplaced.length} sem horário, ${hit.length ? '' : 'nenhum bloco no período'}`.trim(),
      { moved, unplaced: unplaced.map((b) => b.id), preserved: skippedFixed.map((b) => b.id) });
    ctx.confirm = true;
  }

  function cmdSetLimit(ctx, i, cmd) {
    const v = cmd.limitMin;
    if (!(v === null || (Number.isInteger(v) && v >= 0))) { ask(ctx, { id: `limit_${i}`, text: 'Qual limite semanal devo usar (em horas de estudo líquido)?' }); return; }
    const week = isDate(cmd.week) ? Cap.weekKey(cmd.week) : null, st = ctx.state;
    const before = week ? ((st.weekOverrides || {})[week] || {}).limitMin : (st.settings || {}).weeklyLimitMin;
    const label = v === null ? 'sem limite' : C.fmtDur(v * C.MIN);
    ctx.changes.push({ op: 'setting', id: `limit:${week || 'padrao'}`, target: week ? { scope: 'week', week } : { scope: 'default' },
      before: before === undefined ? null : before, after: v, summary: week ? `Limite da semana de ${fmtDay(week)}: ${label}` : `Limite semanal padrão: ${label}` });
    ctx.confirm = true; ctx.mutating++;
  }

  function cmdUndo(ctx) {
    const last = lastUndoable(ctx.state);
    ctx.undoRequested = true;
    if (!last) warn(ctx, 'NADA_PARA_DESFAZER', 'Não há alteração do chat para desfazer.');
    else note(ctx, 'undo', `Desfazer: ${last.summary}`, { changeSetId: last.id });
  }

  /* ---------- plan ---------- */
  function plan(state, commands, nowMs) {
    nowMs = nowMsOf(nowMs);
    const ctx = makeCtx(state, nowMs), before = {};
    const weeksOf = (blocks) => new Set(blocks.map((b) => Cap.weekKey(b.date)));
    (Array.isArray(commands) ? commands : []).forEach((cmd, i) => {
      if (!cmd || typeof cmd !== 'object') return;
      switch (cmd.type) {
        case 'create_block': return cmdCreate(ctx, i, cmd);
        case 'update_block': return cmdUpdate(ctx, i, cmd);
        case 'move_block': return cmdMove(ctx, i, cmd);
        case 'delete_block': return cmdDelete(ctx, i, cmd);
        case 'add_pomodoro': return cmdAddPomodoro(ctx, i, cmd);
        case 'complete_block': return cmdComplete(ctx, i, cmd, true);
        case 'reopen_block': return cmdComplete(ctx, i, cmd, false);
        case 'add_review': return cmdAddReview(ctx, i, cmd);
        case 'query_schedule': return cmdQuerySchedule(ctx, i, cmd);
        case 'query_free_time': return cmdQueryFree(ctx, i, cmd);
        case 'query_capacity': return cmdQueryCapacity(ctx, i, cmd);
        case 'propose_schedule': return cmdPropose(ctx, i, cmd);
        case 'reorganize': return cmdReorganize(ctx, i, cmd);
        case 'set_limit': return cmdSetLimit(ctx, i, cmd);
        case 'undo_last': return cmdUndo(ctx);
        default: warn(ctx, 'COMANDO_DESCONHECIDO', `Comando não reconhecido: ${cmd.type}`);
      }
    });

    // efeito na capacidade das semanas tocadas (antes x depois), calculado pelos módulos
    const touched = new Set();
    for (const c of ctx.changes) if (c.op !== 'setting') [c.before, c.after].filter(Boolean).forEach((b) => touched.add(Cap.weekKey(b.date)));
    const capB = {}, capA = {};
    const stAfter = applyLimits(vstate(ctx), ctx.changes);
    for (const w of touched) {
      capB[w] = Cap.capacityFor(state, w, nowMs); capA[w] = Cap.capacityFor(stAfter, w, nowMs);
      if (capA[w].excessMin > capB[w].excessMin && !ctx.warnings.some((x) => x.code === 'LIMITE_EXCEDIDO')) {
        warn(ctx, 'LIMITE_EXCEDIDO', `A semana de ${fmtDay(w)} ficaria ${C.fmtDur(capA[w].excessMin * C.MIN)} acima do limite.`);
        ctx.confirm = true;
      }
      for (const code of capA[w].warnings) if (!capB[w].warnings.includes(code) && code !== 'LIMIT_REACHED' && code !== 'EXCESS') warn(ctx, code, `Semana de ${fmtDay(w)}: ${code}.`);
    }

    let status;
    if (ctx.questions.length) status = 'needs_clarification';
    else if (!ctx.changes.length) status = 'ready';
    else status = ctx.confirm || ctx.mutating > 1 || ctx.changes.length > 1 ? 'needs_confirmation' : 'ready';
    return { status, questions: ctx.questions, changes: status === 'needs_clarification' ? [] : ctx.changes, results: ctx.results,
      conflicts: ctx.conflicts, capacityEffect: { weeks: [...touched], before: capB, after: capA }, warnings: ctx.warnings,
      alternatives: ctx.alternatives, undo: ctx.undoRequested && !ctx.warnings.some((w) => w.code === 'NADA_PARA_DESFAZER') };
  }
  /** Reflete mudanças de limite no estado usado só para calcular o efeito na capacidade. */
  function applyLimits(vs, changes) {
    const out = { ...vs, settings: { ...(vs.settings || {}) }, weekOverrides: { ...(vs.weekOverrides || {}) } };
    for (const c of changes) if (c.op === 'setting') setSetting(out, c.target, c.after);
    return out;
  }
  function setSetting(s, target, value) {
    if (target.scope === 'week') {
      s.weekOverrides[target.week] = { ...(s.weekOverrides[target.week] || {}), limitMin: value };
    } else s.settings.weeklyLimitMin = value;
  }

  /* ---------- applyChanges ---------- */
  const changedKeys = (b, a) => Object.keys(a).filter((k) => !deq(a[k], b[k]));
  /**
   * Única porta de escrita. Reavalia cada mudança contra o estado ATUAL (o calendário pode ter mudado desde a proposta)
   * e devolve o que foi aplicado e o que falhou, com o motivo. Não altera `state` recebido.
   */
  function applyChanges(state, changes, opts = {}) {
    const s = clone(state), applied = [], failed = [];
    s.blocks = s.blocks || []; s.changeLog = s.changeLog || []; s.weekOverrides = s.weekOverrides || {}; s.settings = s.settings || {};
    const at = opts.nowMs || Date.now();
    const fail = (change, code, reason) => failed.push({ change, code, reason });
    const clashWith = (blk) => { const [a, e] = spanOf(Cap.normalizeBlock(blk));
      return s.blocks.filter((b) => b.id !== blk.id && b.date === blk.date && (() => { const [x, y] = spanOf(Cap.normalizeBlock(b)); return a < y && x < e; })()); };
    for (const ch of changes || []) {
      if (!ch || !ch.op) { fail(ch, 'INVALIDO', 'Mudança inválida.'); continue; }
      const idx = s.blocks.findIndex((b) => b.id === ch.id);
      if (ch.op === 'create') {
        const a = ch.after;
        if (idx >= 0) { fail(ch, 'DUPLICADO', 'Este bloco já foi criado.'); continue; }
        if (s.blocks.some((b) => norm(b.subject) === norm(a.subject) && norm(b.title) === norm(a.title) && b.date === a.date && b.start === a.start)) {
          fail(ch, 'DUPLICADO', `Já existe "${a.title}" em ${fmtWhen(a.date, a.start)}.`); continue; }
        const errs = C.validateBlockPlan(a);
        if (errs.length) { fail(ch, 'INVALIDO', errs.join(' ')); continue; }
        const clash = clashWith(a);
        if (clash.length) { fail(ch, 'CONFLITO', `${fmtWhen(a.date, a.start)} agora está ocupado por "${clash[0].title}".`); continue; }
        s.blocks.push(clone(a)); applied.push(ch);
      } else if (ch.op === 'update') {
        if (idx < 0) { fail(ch, 'NAO_ENCONTRADO', 'O bloco não existe mais.'); continue; }
        const cur = Cap.normalizeBlock(s.blocks[idx]), keys = changedKeys(ch.before, ch.after);
        if (keys.some((k) => !deq(cur[k], ch.before[k]))) { fail(ch, 'DESATUALIZADO', `"${cur.title}" foi alterado depois da proposta.`); continue; }
        const next = { ...s.blocks[idx] }; keys.forEach((k) => { next[k] = clone(ch.after[k]); });
        if (keys.some((k) => TIME_KEYS.includes(k))) {
          const errs = C.validateBlockPlan(Cap.normalizeBlock(next));
          if (errs.length) { fail(ch, 'INVALIDO', errs.join(' ')); continue; }
          const clash = clashWith(next);
          if (clash.length) { fail(ch, 'CONFLITO', `${fmtWhen(next.date, next.start)} agora está ocupado por "${clash[0].title}".`); continue; }
        }
        s.blocks[idx] = next; applied.push(ch);
      } else if (ch.op === 'delete') {
        if (idx < 0) { fail(ch, 'NAO_ENCONTRADO', 'O bloco não existe mais.'); continue; }
        s.blocks.splice(idx, 1); applied.push(ch);
      } else if (ch.op === 'setting') {
        const cur = ch.target.scope === 'week' ? (s.weekOverrides[ch.target.week] || {}).limitMin : s.settings.weeklyLimitMin;
        if ((cur === undefined ? null : cur) !== ch.before) { fail(ch, 'DESATUALIZADO', 'O limite foi alterado depois da proposta.'); continue; }
        setSetting(s, ch.target, ch.after); applied.push(ch);
      } else fail(ch, 'INVALIDO', `Operação desconhecida: ${ch.op}`);
    }
    let changeSet = null;
    if (applied.length) {
      changeSet = { id: `cs${at.toString(36)}${s.changeLog.length}`, at, source: opts.source || 'chat', summary: opts.summary || applied.map((c) => c.summary).join('; '),
        ops: clone(applied), undone: false };
      s.changeLog.push(changeSet);
    }
    return { state: s, changeSet, applied, failed };
  }

  /* ---------- desfazer ---------- */
  function lastUndoable(state) {
    const log = (state && state.changeLog) || [];
    for (let i = log.length - 1; i >= 0; i--) if (!log[i].undone && log[i].source === 'chat') return log[i];
    return null;
  }
  /** Desfaz o último conjunto do chat, na ordem inversa. Não apaga estudo registrado depois da criação. */
  function undoLast(state) {
    const s = clone(state), set = lastUndoable(s);
    if (!set) return { state: s, undone: null, reverted: [], failed: [] };
    const reverted = [], failed = [];
    for (const op of set.ops.slice().reverse()) {
      const i = s.blocks.findIndex((b) => b.id === op.id);
      if (op.op === 'create') {
        if (i < 0) { failed.push({ op, reason: 'O bloco criado já não existe.' }); continue; }
        if ((s.blocks[i].sessions || []).length) { failed.push({ op, reason: `"${s.blocks[i].title}" já tem estudo registrado; não foi removido.` }); continue; }
        s.blocks.splice(i, 1); reverted.push(op);
      } else if (op.op === 'update') {
        if (i < 0) { failed.push({ op, reason: 'O bloco já não existe.' }); continue; }
        const cur = Cap.normalizeBlock(s.blocks[i]), keys = changedKeys(op.before, op.after);
        if (keys.some((k) => !deq(cur[k], op.after[k]))) { failed.push({ op, reason: `"${cur.title}" foi alterado depois; não revertido.` }); continue; }
        keys.forEach((k) => { s.blocks[i][k] = clone(op.before[k]); }); reverted.push(op);
      } else if (op.op === 'delete') {
        if (i >= 0) { failed.push({ op, reason: 'Já existe um bloco com este identificador.' }); continue; }
        s.blocks.push(clone(op.before)); reverted.push(op);
      } else if (op.op === 'setting') {
        s.weekOverrides = s.weekOverrides || {}; s.settings = s.settings || {};
        setSetting(s, op.target, op.before); reverted.push(op);
      }
    }
    const logged = s.changeLog.find((c) => c.id === set.id);
    logged.undone = true; logged.undoneAt = Date.now();
    return { state: s, undone: logged, reverted, failed };
  }

  return { resolveRef, plan, applyChanges, undoLast, lastUndoable, normTime };
});
