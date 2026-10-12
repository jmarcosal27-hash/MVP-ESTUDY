/* Gerador de cronograma semanal (E08 / requisito 08). Módulo puro e determinístico: não grava nada,
 * só PROPÕE posições. A aplicação no calendário é feita depois, por commands.applyChanges, após confirmação.
 * Depende de core.js (planBlock, datas) e de capacity.js (effectiveWeek, freeIntervals, capacityFor). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let cap = null;
    try { cap = require('./capacity.js'); } catch (e) {
      // Só ignora a ausência do capacity.js; qualquer outro erro (ex.: sintaxe) deve aparecer.
      if (!(e && e.code === 'MODULE_NOT_FOUND' && /capacity/.test(e.message))) throw e;
    }
    module.exports = factory(require('./core.js'), cap);
  } else root.Scheduler = factory(root.Core, root.Capacity || null);
})(typeof self !== 'undefined' ? self : this, function (Core, DefaultCap) {
  /** Passo de alinhamento do início dos blocos (igual à precisão do arrastar no calendário). */
  const STEP = 15;
  const PRIORITY_RANK = { alta: 0, media: 1, baixa: 2 };
  const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  const WARNING_TEXT = {
    LIMIT_REACHED: 'O limite semanal foi atingido.',
    EXCESS: 'O planejamento da semana excede o limite semanal.',
    BALANCE_WITHOUT_SLOTS: 'Há saldo de estudo no limite, mas faltam horários livres.',
    PROJECTION_OVER_LIMIT: 'A projeção da semana ultrapassa o limite.',
    PROJECTION_NO_SLOTS: 'A projeção não cabe nos horários restantes.',
  };

  const fmt = (min) => Core.fmtDur(min * Core.MIN);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ceilStep = (min) => Math.ceil(min / STEP) * STEP;
  const isoDow = (dateStr) => ((Core.parseDate(dateStr).getDay() + 6) % 7) + 1;
  const dayName = (dateStr) => DAY_NAMES[isoDow(dateStr) - 1];

  /** Remove [s, e) de uma lista de intervalos {startMin, endMin}. */
  function subtract(intervals, s, e) {
    const out = [];
    for (const iv of intervals) {
      if (e <= iv.startMin || s >= iv.endMin) { out.push(iv); continue; }
      if (s > iv.startMin) out.push({ startMin: iv.startMin, endMin: s });
      if (e < iv.endMin) out.push({ startMin: e, endMin: iv.endMin });
    }
    return out;
  }

  /**
   * Aplica a exceção de semana do pedido SOBRE UMA CÓPIA do estado (nunca altera settings nem o original).
   * Aceita `request.weekOverrides` como mapa { 'YYYY-MM-DD': override } ou como o próprio override da semana.
   */
  function withRequestOverride(state, weekMonday, reqOverrides) {
    const s = clone(state);
    if (!reqOverrides) return s;
    const ov = reqOverrides[weekMonday]
      || (('limitMin' in reqOverrides || 'days' in reqOverrides || 'unavailable' in reqOverrides) ? reqOverrides : null);
    if (!ov) return s;
    s.weekOverrides = s.weekOverrides || {};
    const cur = s.weekOverrides[weekMonday] || {};
    const merged = { ...cur };
    if (ov.limitMin !== undefined) merged.limitMin = ov.limitMin;
    if (ov.days) merged.days = { ...(cur.days || {}), ...ov.days };
    if (ov.unavailable) merged.unavailable = [...(cur.unavailable || []), ...ov.unavailable];
    s.weekOverrides[weekMonday] = merged;
    return s;
  }

  /** Expande cada item do pedido em unidades (um bloco cada). Item inválido vira `unplaced` (nada some em silêncio). */
  function expandUnits(items, cfg, weekEnd) {
    const units = [], invalid = [];
    items.forEach((it, itemIndex) => {
      const blocks = it.blocks === undefined ? 1 : it.blocks;
      const problems = [];
      if (!it.subject || !String(it.subject).trim()) problems.push('informe a matéria');
      if (!Number.isInteger(blocks) || blocks < 1) problems.push('a quantidade de blocos deve ser um inteiro maior que zero');
      if (!Number.isInteger(it.pomodoros) || it.pomodoros < 1) problems.push('os pomodoros por bloco devem ser um inteiro maior que zero');
      if (it.fixedStart && !it.fixedDate) problems.push('o horário obrigatório precisa de um dia');
      if (problems.length) {
        invalid.push({ item: { ...it, itemIndex }, code: 'INVALID', reason: `Item ignorado por dados inválidos: ${problems.join('; ')}.` });
        return;
      }
      const plan = Core.planBlock(it.pomodoros, cfg);
      for (let u = 1; u <= blocks; u++) {
        const base = (it.title && it.title.trim()) || it.subject;
        units.push({
          item: it, itemIndex, unitIndex: u, of: blocks,
          subject: it.subject, title: blocks > 1 ? `${base} (${u}/${blocks})` : base,
          pomodoros: it.pomodoros, netMin: plan.studyMin, agendaMin: plan.totalMin,
          material: it.material || '', deadline: it.deadline || null,
          priority: PRIORITY_RANK[it.priority] !== undefined ? it.priority : null,
          fixedDate: it.fixedDate || null, fixedStart: it.fixedStart || null,
          kind: it.kind === 'revisao' ? 'revisao' : 'estudo', reviewOf: it.reviewOf || null,
          tight: !!it.deadline && it.deadline <= weekEnd,
        });
      }
    });
    return { units, invalid };
  }

  const prioRank = (u) => (u.priority === null ? 3 : PRIORITY_RANK[u.priority]);
  const group = (u) => (u.fixedDate ? 0 : u.tight ? 1 : 2);
  /** Ordem de atendimento: obrigatórios; depois prazo que aperta (nesta semana); depois prioridade/prazo. Empate: ordem do pedido. */
  function compareUnits(a, b) {
    const ga = group(a), gb = group(b);
    if (ga !== gb) return ga - gb;
    let c = 0;
    if (ga === 0) c = (a.fixedDate + (a.fixedStart || '99:99')).localeCompare(b.fixedDate + (b.fixedStart || '99:99'));
    else if (ga === 1) c = a.deadline.localeCompare(b.deadline) || prioRank(a) - prioRank(b);
    else c = prioRank(a) - prioRank(b) || (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
    return c || a.itemIndex - b.itemIndex || a.unitIndex - b.unitIndex;
  }

  /**
   * proposeSchedule(state, request, weekMonday, nowMs[, deps]) -> { placements, unplaced, capacity:{before,after}, warnings }
   * `deps` (opcional) substitui o capacity.js — usado nos testes.
   */
  function proposeSchedule(state, request, weekMonday, nowMs, deps) {
    const Cap = deps || DefaultCap;
    if (!Cap) throw new Error('scheduler: capacity.js não encontrado (necessário para disponibilidade e limite).');
    request = request || {};
    const warnings = [];
    if (request.preserveExisting === false) {
      warnings.push({ code: 'PRESERVE_FORCED', text: 'Blocos e revisões existentes são sempre preservados; a opção de não preservar foi ignorada.' });
    }

    const base = Cap.normalizeState ? Cap.normalizeState(withRequestOverride(state, weekMonday, request.weekOverrides))
      : withRequestOverride(state, weekMonday, request.weekOverrides);
    const cfg = (base.settings && base.settings.config) || Core.DEFAULT_CONFIG;
    const dates = [];
    for (let i = 0; i < 7; i++) dates.push(Core.isoDate(Core.addDays(Core.parseDate(weekMonday), i)));
    const weekEnd = dates[6];

    const before = Cap.capacityFor(base, weekMonday, nowMs);
    const eff = Cap.effectiveWeek(base, weekMonday);
    const limitMin = eff.limitMin === undefined ? null : eff.limitMin;
    let remaining = limitMin === null ? Infinity : Math.max(0, before.balanceMin !== undefined && before.balanceMin !== null ? before.balanceMin : limitMin - before.plannedNetMin);
    if (limitMin === null) warnings.push({ code: 'LIMIT_NOT_SET', text: 'Não há limite semanal definido; nada limita a carga proposta.' });

    // Hoje e passado: nada é proposto antes de agora.
    const now = new Date(nowMs);
    const today = Core.isoDate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const free = {};
    let totalFree = 0;
    for (const d of dates) {
      if (d < today) { free[d] = []; continue; }
      let ivs = (Cap.freeIntervals(base, d) || []).map((iv) => ({ startMin: iv.startMin, endMin: iv.endMin }));
      if (d === today) ivs = subtract(ivs, 0, ceilStep(nowMin));
      free[d] = ivs;
      totalFree += ivs.reduce((s, iv) => s + (iv.endMin - iv.startMin), 0);
    }

    const { units, invalid } = expandUnits(request.items || [], cfg, weekEnd);
    units.sort(compareUnits);

    const placements = [], unplaced = [...invalid];
    const spread = {}; // contagem de blocos da matéria por dia, para espalhar a matéria na semana

    /** Primeiro encaixe (início alinhado a STEP) em `date` para `agendaMin`; null se não couber. */
    const fitIn = (date, agendaMin) => {
      for (const iv of free[date]) {
        const start = ceilStep(iv.startMin);
        if (start + agendaMin <= iv.endMin) return start;
      }
      return null;
    };
    const orderedDates = (u, filter) => {
      const list = dates.filter(filter);
      if (u.tight) return list; // prazo apertado: o mais cedo possível
      const cnt = (d) => (spread[u.subject] && spread[u.subject][d]) || 0;
      return list.map((d, i) => ({ d, i })).sort((a, b) => cnt(a.d) - cnt(b.d) || a.i - b.i).map((x) => x.d);
    };
    const unplace = (u, code, reason) => unplaced.push({
      item: { subject: u.subject, title: u.title, pomodoros: u.pomodoros, blockIndex: u.unitIndex, blocks: u.of,
        deadline: u.deadline, priority: u.priority, fixedDate: u.fixedDate, fixedStart: u.fixedStart, itemIndex: u.itemIndex },
      code, reason,
    });

    for (const u of units) {
      // 1) Limite semanal LÍQUIDO: nunca ultrapassa em silêncio nem encurta o bloco.
      if (u.netMin > remaining) {
        unplace(u, 'LIMIT', `Não coube no limite semanal: o bloco exige ${fmt(u.netMin)} líquidos de estudo e restam ${fmt(remaining)} de ${fmt(limitMin)}.`);
        continue;
      }
      let slot = null;
      if (u.fixedDate) {
        // 2a) Horário obrigatório: só o dia/horário pedido.
        if (!dates.includes(u.fixedDate)) { unplace(u, 'OUT_OF_WEEK', `O dia obrigatório ${u.fixedDate} não pertence à semana de ${weekMonday}.`); continue; }
        if (u.fixedDate < today) { unplace(u, 'PAST', `O dia obrigatório (${dayName(u.fixedDate)}, ${u.fixedDate}) já passou.`); continue; }
        if (u.deadline && u.fixedDate > u.deadline) { unplace(u, 'DEADLINE', `O dia obrigatório (${u.fixedDate}) é posterior ao prazo (${u.deadline}).`); continue; }
        if (u.fixedStart) {
          const s = Core.toMin(u.fixedStart);
          if (free[u.fixedDate].some((iv) => iv.startMin <= s && s + u.agendaMin <= iv.endMin)) slot = { date: u.fixedDate, start: s };
          else unplace(u, 'FIXED_CONFLICT', `O horário obrigatório de ${dayName(u.fixedDate)} (${u.fixedStart}–${Core.fromMin(s + u.agendaMin)}) não está livre: fora da disponibilidade, indisponível ou ocupado.`);
        } else {
          const s = fitIn(u.fixedDate, u.agendaMin);
          if (s !== null) slot = { date: u.fixedDate, start: s };
          else unplace(u, 'FIXED_CONFLICT', `Não há horário livre de ${fmt(u.agendaMin)} em ${dayName(u.fixedDate)} (${u.fixedDate}), o dia obrigatório.`);
        }
        if (!slot) continue;
      } else {
        // 2b) Livre: procura sem prazo (para diferenciar o motivo) e depois com prazo.
        const search = (filter) => {
          for (const d of orderedDates(u, filter)) { const s = fitIn(d, u.agendaMin); if (s !== null) return { date: d, start: s }; }
          return null;
        };
        const any = search(() => true);
        if (!any) {
          if (totalFree === 0) unplace(u, 'UNAVAILABLE', 'Não há nenhum horário disponível nesta semana (disponibilidade vazia, tudo indisponível ou semana já passada).');
          else unplace(u, 'NO_SLOT', `Nenhum horário livre contínuo de ${fmt(u.agendaMin)} (estudo e pausas) coube na semana.`);
          continue;
        }
        slot = u.deadline ? search((d) => d <= u.deadline) : any;
        if (!slot) { unplace(u, 'DEADLINE', `Há horário livre, mas só depois do prazo (${u.deadline}); o bloco não foi encurtado nem adiado em silêncio.`); continue; }
      }

      free[slot.date] = subtract(free[slot.date], slot.start, slot.start + u.agendaMin);
      remaining -= u.netMin;
      (spread[u.subject] = spread[u.subject] || {})[slot.date] = ((spread[u.subject] || {})[slot.date] || 0) + 1;
      const why = u.fixedDate ? 'Horário obrigatório respeitado' : u.tight ? 'Prazo apertado: primeiro horário livre' : 'Horário livre escolhido espalhando a matéria na semana';
      placements.push({
        tempId: `tmp-${u.itemIndex + 1}-${u.unitIndex}`, subject: u.subject, title: u.title,
        date: slot.date, start: Core.fromMin(slot.start), estimated: u.pomodoros, config: { ...cfg },
        kind: u.kind, reviewOf: u.reviewOf, priority: u.priority, deadline: u.deadline, material: u.material,
        fixed: !!u.fixedDate && !!u.fixedStart,
        reason: `${why}: ${dayName(slot.date)} ${Core.fromMin(slot.start)}–${Core.fromMin(slot.start + u.agendaMin)} (agenda ${fmt(u.agendaMin)}, estudo líquido ${fmt(u.netMin)}).`,
      });
    }
    placements.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.tempId.localeCompare(b.tempId));

    // Capacidade depois da proposta, calculada pelo mesmo módulo (sobre uma cópia).
    const after = clone(base);
    after.blocks = [...(after.blocks || []), ...placements.map((p) => ({
      id: p.tempId, subject: p.subject, title: p.title, date: p.date, start: p.start, estimated: p.estimated,
      config: p.config, kind: p.kind, reviewOf: p.reviewOf, priority: p.priority, deadline: p.deadline, fixed: p.fixed,
      material: p.material, pdf: p.material, originWeek: weekMonday, remainingMin: null, source: 'scheduler',
      completed: false, questions: null, hits: null, sessions: [],
    }))];
    const afterCap = Cap.capacityFor(after, weekMonday, nowMs);
    for (const w of afterCap.warnings || []) warnings.push({ code: w, text: WARNING_TEXT[w] || w });
    if (unplaced.length) warnings.push({ code: 'UNPLACED', text: `${unplaced.length} bloco(s) não couberam; veja os motivos. Nada foi omitido ou encurtado.` });

    return { placements, unplaced, capacity: { before, after: afterCap }, warnings };
  }

  return { STEP, proposeSchedule, compareUnits };
});
