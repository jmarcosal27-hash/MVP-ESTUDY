/* Capacidade semanal, disponibilidade e horários livres (requisitos 09 e 10). Módulo puro, testável em Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.Capacity = factory(root.Core);
})(typeof self !== 'undefined' ? self : this, function (C) {
  const MIN = C.MIN;

  /* ---------- defaults e normalização ---------- */
  const DEFAULT_AVAILABILITY = () => ({
    days: { 1: [{ from: '08:00', to: '12:00' }, { from: '14:00', to: '22:00' }], 2: [{ from: '08:00', to: '12:00' }, { from: '14:00', to: '22:00' }],
      3: [{ from: '08:00', to: '12:00' }, { from: '14:00', to: '22:00' }], 4: [{ from: '08:00', to: '12:00' }, { from: '14:00', to: '22:00' }],
      5: [{ from: '08:00', to: '12:00' }, { from: '14:00', to: '22:00' }], 6: [{ from: '08:00', to: '12:00' }] },
    unavailable: [],
  });
  const DEFAULT_LIMIT_MIN = 1200; // 20h líquidas por semana (editável)

  /* ---------- saneamento: nada vindo do storage ou do chat é confiável ---------- */
  const cleanInt = (v) => {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };
  const cleanStr = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const posInt = (v, def) => (Number.isInteger(v) && v >= 1 && v <= 1440 ? v : def);
  function cleanConfig(c, base) {
    const d = { ...C.DEFAULT_CONFIG, ...(base || {}) }, o = c && typeof c === 'object' ? c : {};
    return { focusMin: posInt(o.focusMin, d.focusMin), shortMin: posInt(o.shortMin, d.shortMin), longEvery: posInt(o.longEvery, d.longEvery), longMin: posInt(o.longMin, d.longMin) };
  }
  /** Devolve uma cópia saneada do bloco (tipos e enums válidos). Não valida data/hora: isso é feito por normalizeState/validateBlockPlan. */
  function normalizeBlock(b, defaultConfig) {
    b = b && typeof b === 'object' ? b : {};
    const date = typeof b.date === 'string' ? b.date : '';
    return {
      ...b,
      pending: b.pending === true,
      id: String(b.id === undefined || b.id === null ? 'bloco' : b.id).replace(/[^\w.-]/g, '_').slice(0, 64) || 'bloco',
      subject: cleanStr(b.subject, 200), title: cleanStr(b.title, 200), date, start: typeof b.start === 'string' ? b.start : '',
      estimated: b.estimated, config: cleanConfig(b.config, defaultConfig),
      kind: b.kind === 'revisao' ? 'revisao' : 'estudo', reviewOf: typeof b.reviewOf === 'string' ? b.reviewOf.slice(0, 64) : null,
      priority: ['alta', 'media', 'baixa'].includes(b.priority) ? b.priority : null,
      deadline: C.okDate(b.deadline) ? b.deadline : null, fixed: b.fixed === true,
      material: cleanStr(b.material, 300), pdf: cleanStr(b.pdf, 300), pages: cleanStr(b.pages, 200), studied: cleanStr(b.studied, 1000), notes: cleanStr(b.notes, 2000),
      originWeek: C.okDate(b.originWeek) ? b.originWeek : (C.okDate(date) ? weekKey(date) : null),
      remainingMin: cleanInt(b.remainingMin), source: ['manual', 'chat', 'scheduler'].includes(b.source) ? b.source : 'manual',
      questions: cleanInt(b.questions), hits: cleanInt(b.hits), completed: b.completed === true,
      sessions: Array.isArray(b.sessions) ? b.sessions.filter((x) => x && typeof x === 'object' && x.totals && typeof x.totals === 'object') : [],
    };
  }
  const validBlock = (b) => C.okDate(b.date) && C.okTime(b.start) && Number.isInteger(b.estimated) && b.estimated >= 1;
  /** Uma sessão de cronômetro só é aceita se tiver a estrutura que o core.js espera. */
  function validSession(x) {
    return !!x && typeof x === 'object' && typeof x.blockId === 'string' && Array.isArray(x.segments) && Array.isArray(x.cycles) && x.cfg && typeof x.cfg === 'object'
      && ['focus', 'extra', 'short', 'long'].includes(x.phase) && ['running', 'paused', 'awaiting'].includes(x.state) && Number.isFinite(x.startedAt)
      && Number.isFinite(x.phaseMs) && Number.isInteger(x.pomo);
  }
  function normalizeState(s) {
    s = s && typeof s === 'object' ? s : {};
    const st = s.settings && typeof s.settings === 'object' ? s.settings : {};
    const config = cleanConfig(st.config);
    const blocks = [], quarantine = Array.isArray(s.quarantine) ? s.quarantine.slice() : [];
    for (const raw of Array.isArray(s.blocks) ? s.blocks : []) {
      const nb = normalizeBlock(raw, config);
      if (raw && typeof raw === 'object' && validBlock(nb)) blocks.push(nb); else quarantine.push(raw); // inválido não é exibido nem apagado
    }
    return {
      ...s,
      settings: {
        ...st, config,
        weeklyLimitMin: st.weeklyLimitMin === undefined ? DEFAULT_LIMIT_MIN : (st.weeklyLimitMin === null ? null : (cleanInt(st.weeklyLimitMin) ?? DEFAULT_LIMIT_MIN)),
        availability: st.availability && typeof st.availability === 'object' && st.availability.days ? { days: st.availability.days, unavailable: Array.isArray(st.availability.unavailable) ? st.availability.unavailable : [] } : DEFAULT_AVAILABILITY(),
        closing: st.closing && typeof st.closing === 'object' ? st.closing : { day: 7, time: '21:00' },
      },
      weekOverrides: s.weekOverrides && typeof s.weekOverrides === 'object' ? s.weekOverrides : {},
      blocks, quarantine: quarantine.slice(-200),
      changeLog: Array.isArray(s.changeLog) ? s.changeLog : [],
      reports: s.reports && typeof s.reports === 'object' ? s.reports : {},
      chat: s.chat && typeof s.chat === 'object' && Array.isArray(s.chat.messages) ? s.chat : { messages: [] },
      session: validSession(s.session) ? s.session : null,
    };
  }

  /* ---------- semana e disponibilidade ---------- */
  const weekKey = (dateStr) => C.isoDate(C.mondayOf(C.parseDate(dateStr)));
  const isoWeekday = (dateStr) => ((C.parseDate(dateStr).getDay() + 6) % 7) + 1; // 1=segunda … 7=domingo
  const weekDates = (monday) => [...Array(7)].map((_, i) => C.isoDate(C.addDays(C.parseDate(monday), i)));

  /** Rotina padrão + exceção da semana, sem alterar `settings`. */
  function effectiveWeek(state, weekMonday) {
    const s = normalizeState(state);
    const ov = s.weekOverrides[weekMonday] || {};
    const dates = weekDates(weekMonday);
    const base = s.settings.availability;
    return {
      limitMin: ov.limitMin !== undefined ? ov.limitMin : s.settings.weeklyLimitMin,
      days: { ...base.days, ...(ov.days || {}) },
      unavailable: [...(base.unavailable || []).filter((u) => u.day || dates.includes(u.date)), ...(ov.unavailable || [])],
    };
  }

  /* ---------- tempos de um bloco ---------- */
  const netStudyMin = (b) => b.estimated * b.config.focusMin;           // carga: só estudo
  const agendaMin = (b) => C.planBlock(b.estimated, b.config).totalMin; // agenda: estudo + pausas
  const weekOfMs = (ms) => weekKey(C.isoDate(new Date(ms)));

  /** Estudo realizado (foco + extra, uma única vez) em minutos; com `weekMonday`, só sessões iniciadas naquela semana. */
  function realizedMin(block, weekMonday) {
    return (block.sessions || []).filter((s) => !weekMonday || weekOfMs(s.startedAt) === weekMonday)
      .reduce((a, s) => a + s.totals.studyMs / MIN, 0);
  }
  /** Tempo líquido restante: concluído = 0; ajuste manual tem prioridade; senão previsto − já estudado. */
  function remainingMin(block, extraRealizedMin = 0) {
    if (block.completed) return 0;
    if (block.remainingMin !== null && block.remainingMin !== undefined) return block.remainingMin;
    return Math.max(0, netStudyMin(block) - realizedMin(block) - extraRealizedMin);
  }

  /* ---------- horários livres ---------- */
  const rng = (r) => [C.toMin(r.from), C.toMin(r.to)];
  function subtract(intervals, [s, e]) {
    const out = [];
    for (const [a, b] of intervals) {
      if (e <= a || s >= b) { out.push([a, b]); continue; }
      if (s > a) out.push([a, s]);
      if (e < b) out.push([e, b]);
    }
    return out;
  }
  /** Intervalos livres do dia: disponibilidade − indisponíveis − blocos (ocupação = estudo + pausas). */
  function freeIntervals(state, dateStr, ignoreBlockIds = []) {
    const s = normalizeState(state), eff = effectiveWeek(s, weekKey(dateStr)), wd = isoWeekday(dateStr);
    let iv = (eff.days[wd] || []).map(rng).sort((x, y) => x[0] - y[0]);
    for (const u of eff.unavailable) if ((u.day === wd) || u.date === dateStr) iv = subtract(iv, rng(u));
    for (const b of s.blocks) {
      if (b.pending || b.date !== dateStr || ignoreBlockIds.includes(b.id)) continue; // bloco pendente (proposta em conflito) não ocupa horário
      const st = C.toMin(b.start);
      iv = subtract(iv, [st, st + agendaMin(b)]);
    }
    return iv.filter(([a, b]) => b > a).map(([startMin, endMin]) => ({ startMin, endMin }));
  }

  /* ---------- capacidade da semana (E09 + E10) ---------- */
  function capacityFor(state, weekMonday, nowMs) {
    const s = normalizeState(state), eff = effectiveWeek(s, weekMonday), limit = eff.limitMin;
    const dates = weekDates(weekMonday), now = new Date(nowMs);
    const inWeek = s.blocks.filter((b) => !b.pending && dates.includes(b.date)); // pendente só conta depois de confirmado
    const live = s.session && s.session.startedAt ? C.liveTotals(s.session, nowMs).studyMs / MIN : 0;
    const liveBlock = s.session ? s.session.blockId : null;
    const liveWeek = s.session ? weekOfMs(s.session.startedAt) : null;

    // E09: carga planejada da semana (blocos agendados nela). Concluído não soma o previsto de novo.
    let plannedNet = 0, remainingPending = 0, needsNewSlot = 0;
    for (const b of inWeek) {
      const real = realizedMin(b, weekMonday) + (liveBlock === b.id && liveWeek === weekMonday ? live : 0);
      const rem = remainingMin(b, liveBlock === b.id ? live : 0);
      plannedNet += b.completed ? real : real + rem;
      if (!b.completed) {
        remainingPending += rem;
        const end = C.atMinutes(b.date, C.toMin(b.start) + agendaMin(b)).getTime();
        if (end < nowMs && rem > 0) needsNewSlot += rem; // já passou do horário: precisa de novo horário
      }
    }
    // E10: estudo realizado na semana (por data da sessão), incluindo cronômetro em andamento.
    let realized = 0;
    for (const b of s.blocks) realized += realizedMin(b, weekMonday);
    if (liveWeek === weekMonday) realized += live;
    const projection = realized + remainingPending;

    // horários livres ainda utilizáveis (descarta o que já passou)
    const today = C.isoDate(now), nowMin = now.getHours() * 60 + now.getMinutes();
    let freeAgenda = 0, maxFree = 0;
    for (const d of dates) {
      if (d < today) continue;
      for (const iv of freeIntervals(s, d)) {
        const a = d === today ? Math.max(iv.startMin, nowMin) : iv.startMin;
        if (iv.endMin > a) { freeAgenda += iv.endMin - a; maxFree = Math.max(maxFree, iv.endMin - a); }
      }
    }

    const hasLimit = limit !== null && limit !== undefined;
    const balance = hasLimit ? limit - plannedNet : null, margin = hasLimit ? limit - projection : null;
    const warnings = [];
    if (hasLimit) {
      if (plannedNet > limit) warnings.push('EXCESS'); else if (plannedNet === limit) warnings.push('LIMIT_REACHED');
      if (projection > limit) warnings.push('PROJECTION_OVER_LIMIT');
      if (balance > 0 && maxFree < s.settings.config.focusMin) warnings.push('BALANCE_WITHOUT_SLOTS');
    }
    if (needsNewSlot > freeAgenda) warnings.push('PROJECTION_NO_SLOTS');
    return {
      week: weekMonday, limitMin: hasLimit ? limit : null,
      plannedNetMin: plannedNet, balanceMin: balance, excessMin: hasLimit ? Math.max(0, plannedNet - limit) : 0,
      realizedMin: realized, remainingMin: remainingPending, projectionMin: projection,
      marginMin: margin, projectedExcessMin: hasLimit ? Math.max(0, projection - limit) : 0,
      freeAgendaMin: freeAgenda, maxFreeSlotMin: maxFree, needsNewSlotMin: needsNewSlot, warnings,
    };
  }

  /**
   * Cabe um novo bloco? `draft` = {estimated, config, date, start?, id?, remainingMin?}.
   * Capacidade (carga líquida) e agenda (horário livre) são verificadas separadamente; nunca altera nada.
   */
  function wouldFit(state, draft, weekMonday, nowMs = Date.now()) {
    const s = normalizeState(state), cfg = capacityFor(s, weekMonday, nowMs);
    const d = normalizeBlock({ config: s.settings.config, ...draft });
    const net = d.remainingMin !== null && d.remainingMin !== undefined ? d.remainingMin : netStudyMin(d), need = agendaMin(d);
    const fitsCapacity = cfg.limitMin === null || cfg.plannedNetMin + net <= cfg.limitMin;
    const excessMin = cfg.limitMin === null ? 0 : Math.max(0, cfg.plannedNetMin + net - cfg.limitMin);
    let fitsAgenda;
    if (d.start) {
      const st = C.toMin(d.start);
      fitsAgenda = freeIntervals(s, d.date, d.id ? [d.id] : []).some((iv) => iv.startMin <= st && iv.endMin >= st + need);
    } else {
      fitsAgenda = weekDates(weekMonday).some((dt) => freeIntervals(s, dt).some((iv) => iv.endMin - iv.startMin >= need));
    }
    const options = [];
    if (!fitsCapacity) {
      const fit = Math.floor(Math.max(0, cfg.balanceMin) / d.config.focusMin);
      if (fit >= 1 && fit < d.estimated) options.push({ type: 'reduce', pomodoros: fit, text: `Reduzir para ${fit} pomodoro(s) para caber no saldo de ${C.fmtDur(cfg.balanceMin * MIN)}.` });
      options.push({ type: 'transfer', week: C.isoDate(C.addDays(C.parseDate(weekMonday), 7)), text: 'Agendar na semana seguinte.' });
      const candidates = s.blocks.filter((b) => weekKey(b.date) === weekMonday && !b.completed && !b.fixed && b.priority !== 'alta' && remainingMin(b) >= excessMin)
        .sort((a, b) => ({ baixa: 0, media: 1, null: 2 }[a.priority] ?? 2) - ({ baixa: 0, media: 1, null: 2 }[b.priority] ?? 2));
      if (candidates.length) options.push({ type: 'replace', blockIds: candidates.slice(0, 3).map((b) => b.id), text: `Substituir um bloco pendente de menor prioridade: ${candidates.slice(0, 3).map((b) => `"${b.title}"`).join(', ')}.` });
    }
    return { fitsCapacity, fitsAgenda, fits: fitsCapacity && fitsAgenda, excessMin, balanceMin: cfg.balanceMin, options };
  }

  return { DEFAULT_LIMIT_MIN, DEFAULT_AVAILABILITY, normalizeBlock, normalizeState, validBlock, validSession, weekKey, isoWeekday, weekDates, effectiveWeek,
    netStudyMin, agendaMin, realizedMin, remainingMin, freeIntervals, capacityFor, wouldFit };
});
