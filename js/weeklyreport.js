/* Relatório semanal com diagnóstico (E11 / requisito 11). Módulo puro: lê o estado e devolve o relatório;
 * NUNCA altera o calendário (as sugestões são só propostas, com comandos que o usuário pode confirmar depois).
 * Regras de análise do requisito:
 *  - sem questões registradas ≠ 0% (taxa fica null e a matéria vai para `lowData`);
 *  - mais tempo estudado ≠ dificuldade (dificuldade vem só do resultado nas questões);
 *  - tempo cumprido ≠ concluído ≠ aprendido (contados separadamente);
 *  - taxa = Σ acertos ÷ Σ questões COM resultado preenchido (nunca a média das taxas);
 *  - poucos dados são sinalizados (LOW_DATA_QUESTIONS) em vez de classificar força/fraqueza;
 *  - a semana ORIGINAL (originWeek) é preservada: reagendar não esconde o que não foi feito. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./capacity.js'));
  else root.WeeklyReport = factory(root.Core, root.Capacity);
})(typeof self !== 'undefined' ? self : this, function (Core, Cap) {
  /** Abaixo disto (questões com resultado numa matéria) não se classifica força nem fraqueza. */
  const LOW_DATA_QUESTIONS = 10;
  /** Taxa (%) a partir da qual a matéria é apontada como ponto forte / abaixo da qual é ponto fraco. */
  const STRONG_RATE = 75;
  const WEAK_RATE = 60;
  /** Desvio recorrente de estimativa: realizado > estimado × fator em pelo menos N blocos concluídos da matéria. */
  const OVERRUN_FACTOR = 1.2;
  const OVERRUN_MIN_BLOCKS = 3;
  const PRIORITY_RANK = { alta: 0, media: 1, baixa: 2 };

  const r2 = (x) => Math.round(x * 100) / 100;
  const summary = (b) => ({ id: b.id, subject: b.subject, title: b.title, date: b.date, start: b.start, kind: b.kind });
  const fmt = (min) => Core.fmtDur(Math.round(min) * Core.MIN);
  const pct = (x) => `${x.toFixed(1).replace('.', ',')}%`;
  const rank = (p) => (PRIORITY_RANK[p] === undefined ? 3 : PRIORITY_RANK[p]);

  /** Acumula resultados (questões/acertos) respeitando "vazio ≠ zero". */
  function newAcc() { return { questions: 0, withResult: 0, hits: 0, pending: 0, evidence: [] }; }
  function feedAcc(acc, b) {
    const a = Core.accuracy(b);
    if (a.kind === 'value') { acc.questions += b.questions; acc.withResult += b.questions; acc.hits += b.hits; acc.evidence.push(b.id); }
    else if (a.kind === 'pending') { acc.questions += b.questions; acc.pending += 1; acc.evidence.push(b.id); }
  }
  const rateOf = (acc) => (acc.withResult > 0 ? (acc.hits * 100) / acc.withResult : null);

  /**
   * buildWeeklyReport(state, weekMonday, nowMs) -> relatório da semana (ver docs/ARQUITETURA-V2.md §4.5).
   * Blocos considerados "da semana": os PLANEJADOS originalmente nela (originWeek); resultados e tempo vêm dos blocos
   * agendados na semana ou estudados nela (sessões iniciadas na semana).
   */
  function buildWeeklyReport(state, weekMonday, nowMs) {
    const s = Cap.normalizeState(state);
    const now = new Date(nowMs);
    const dates = Cap.weekDates(weekMonday), weekEnd = dates[6];
    const inWeek = (d) => dates.includes(d);
    const startedIn = (sess) => Cap.weekKey(Core.isoDate(new Date(sess.startedAt))) === weekMonday;

    const origin = s.blocks.filter((b) => b.originWeek === weekMonday);
    const scheduled = s.blocks.filter((b) => inWeek(b.date));
    const studied = s.blocks.filter((b) => (b.sessions || []).some(startedIn));
    const active = [...new Map([...scheduled, ...studied].map((b) => [b.id, b])).values()];

    /* ---------- execução ---------- */
    const notDone = origin.filter((b) => !b.completed);
    const rescheduledOut = origin.filter((b) => !inWeek(b.date))
      .map((b) => ({ ...summary(b), originWeek: b.originWeek, newDate: b.date, completed: !!b.completed }));
    const rescheduledIn = scheduled.filter((b) => b.originWeek !== weekMonday)
      .map((b) => ({ ...summary(b), originWeek: b.originWeek, completed: !!b.completed }));
    let focusMs = 0, extraMs = 0;
    for (const b of s.blocks) for (const sess of b.sessions || []) if (startedIn(sess)) { focusMs += sess.totals.focusMs; extraMs += sess.totals.extraMs; }
    const acc = newAcc();
    for (const b of active) feedAcc(acc, b);
    const execution = {
      planned: origin.length,
      done: origin.length - notDone.length,
      late: notDone.filter((b) => inWeek(b.date) && Core.blockStatus(b, now) === 'atrasado').length,
      onTrack: notDone.filter((b) => inWeek(b.date) && Core.blockStatus(b, now) === 'em_dia').length,
      partial: notDone.filter((b) => Cap.realizedMin(b, weekMonday) > 0).length,
      timeMetNotCompleted: notDone.filter((b) => Cap.realizedMin(b) >= Cap.netStudyMin(b)).length,
      completedFromOtherWeeks: rescheduledIn.filter((b) => b.completed).length,
      rescheduledOut, rescheduledIn,
      plannedMin: r2(origin.reduce((t, b) => t + Cap.netStudyMin(b), 0)),
      studiedMin: r2((focusMs + extraMs) / Core.MIN),
      extraMin: r2(extraMs / Core.MIN),
      questions: acc.questions, questionsWithResult: acc.withResult, pendingResults: acc.pending,
      hits: acc.hits, errors: acc.withResult - acc.hits, rate: rateOf(acc),
    };

    /* ---------- forças e fraquezas (só pelo resultado nas questões) ---------- */
    const bySubject = new Map();
    for (const b of active) {
      if (!bySubject.has(b.subject)) bySubject.set(b.subject, newAcc());
      feedAcc(bySubject.get(b.subject), b);
    }
    const strengths = [], weaknesses = [], lowData = [], ranking = [];
    for (const [subject, a] of [...bySubject.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
      const rate = rateOf(a);
      if (a.withResult === 0) {
        lowData.push({ subject, code: 'SEM_QUESTOES', rate: null, questions: 0, pendingResults: a.pending, evidence: a.evidence,
          text: `${subject}: sem questões com resultado registrado; isso não é 0% de acerto.` });
      } else if (a.withResult < LOW_DATA_QUESTIONS) {
        lowData.push({ subject, code: 'POUCOS_DADOS', rate, questions: a.withResult, hits: a.hits, evidence: a.evidence,
          text: `${subject}: apenas ${a.withResult} questão(ões) com resultado (mínimo ${LOW_DATA_QUESTIONS}); ${pct(rate)} ainda não sustenta uma conclusão.` });
      } else {
        const entry = { subject, rate, questions: a.withResult, hits: a.hits, evidence: a.evidence,
          reason: `${a.hits} acertos em ${a.withResult} questões com resultado (${pct(rate)}).` };
        ranking.push(entry);
        if (rate >= STRONG_RATE) strengths.push(entry);
        else if (rate < WEAK_RATE) weaknesses.push(entry);
      }
    }
    ranking.sort((x, y) => y.rate - x.rate || x.subject.localeCompare(y.subject));
    strengths.sort((x, y) => y.rate - x.rate); weaknesses.sort((x, y) => x.rate - y.rate);
    const registeredDifficulties = active.filter((b) => b.notes && String(b.notes).trim())
      .map((b) => ({ blockId: b.id, subject: b.subject, title: b.title, text: String(b.notes).trim() }));

    /* ---------- desvio recorrente estimado × realizado (informativo; NÃO indica dificuldade) ---------- */
    const bias = new Map();
    for (const b of active.filter((x) => x.completed && Cap.realizedMin(x, weekMonday) > 0 && Cap.netStudyMin(x) > 0)) {
      if (!bias.has(b.subject)) bias.set(b.subject, { planned: 0, real: 0, n: 0 });
      const e = bias.get(b.subject);
      e.planned += Cap.netStudyMin(b); e.real += Cap.realizedMin(b, weekMonday); e.n += 1;
    }
    const estimationBias = [...bias.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([subject, e]) => ({
      subject, n: e.n, avgPlannedMin: r2(e.planned / e.n), avgRealMin: r2(e.real / e.n),
      recurrentOverrun: e.n >= OVERRUN_MIN_BLOCKS && e.real > e.planned * OVERRUN_FACTOR,
      note: 'Diferença entre estimado e realizado; não indica, por si só, dificuldade na matéria.',
    }));

    const cautions = [
      'Sem questões registradas não é 0% de acerto.',
      'Estudar mais tempo não significa ter mais dificuldade.',
      'Tempo cumprido não é o mesmo que bloco concluído, nem que conteúdo aprendido.',
      `Taxa = soma dos acertos ÷ soma das questões com resultado. Menos de ${LOW_DATA_QUESTIONS} questões por matéria é sinalizado como poucos dados.`,
    ];

    return {
      week: weekMonday, generatedAt: nowMs, execution, strengths, weaknesses, lowData, ranking,
      registeredDifficulties, estimationBias, cautions, nextWeek: buildNextWeek(s, weekMonday, weekEnd, nowMs, now, active),
    };
  }

  /** Próxima semana: o que já está marcado, capacidade, sugestões (só proposta) e o que não cabe. */
  function buildNextWeek(s, weekMonday, weekEnd, nowMs, now, active) {
    const nextMon = Core.isoDate(Core.addDays(Core.parseDate(weekMonday), 7));
    const nextDates = Cap.weekDates(nextMon);
    const capacity = Cap.capacityFor(s, nextMon, nowMs);
    const scheduled = s.blocks.filter((b) => nextDates.includes(b.date)).map(summary);
    const focus = s.settings.config.focusMin;

    // A) pendências atrasadas que ainda não têm novo horário.
    const pending = s.blocks.filter((b) => !b.completed && b.date <= weekEnd && Core.blockStatus(b, now) === 'atrasado' && Cap.remainingMin(b) > 0)
      .sort((a, b) => rank(a.priority) - rank(b.priority) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const cands = pending.map((b) => {
      const rem = Cap.remainingMin(b), poms = Math.max(1, Math.ceil(rem / b.config.focusMin));
      const partial = Cap.realizedMin(b) > 0;
      return {
        type: partial ? 'continuacao' : 'reagendamento', blockId: b.id, netMin: poms * b.config.focusMin, agendaMin: Core.planBlock(poms, b.config).totalMin,
        text: `${partial ? 'Continuar' : 'Reagendar'} "${b.title}" (${b.subject}): restam ${fmt(rem)} de estudo.`,
        reason: partial ? 'Bloco atrasado com estudo parcial.' : 'Bloco atrasado sem estudo registrado.',
        commands: [{ type: 'propose_schedule', request: { items: [{ subject: b.subject, title: b.title, blocks: 1, pomodoros: poms,
          priority: b.priority, deadline: b.deadline, material: b.material || undefined, kind: b.kind, reviewOf: b.reviewOf }], preserveExisting: true } }],
      };
    });

    // B) revisões para blocos de estudo concluídos na semana, sem revisão já programada (não duplica).
    const hasReview = (id) => s.blocks.some((r) => r.kind === 'revisao' && r.reviewOf === id && !r.completed);
    const reviewable = active.filter((b) => b.completed && b.kind === 'estudo' && inRange(b.date, weekMonday, weekEnd) && !hasReview(b.id))
      .map((b) => ({ b, rate: rateOf(feedOne(b)) }))
      .sort((x, y) => (x.rate === null) - (y.rate === null) || (x.rate ?? 0) - (y.rate ?? 0) || x.b.date.localeCompare(y.b.date) || x.b.id.localeCompare(y.b.id));
    for (const { b, rate } of reviewable) {
      cands.push({
        type: 'revisao', blockId: b.id, netMin: focus, agendaMin: Core.planBlock(1, s.settings.config).totalMin,
        text: `Revisar "${b.title}" (${b.subject}) com 1 pomodoro.`,
        reason: rate !== null && rate < WEAK_RATE ? `Acerto de ${pct(rate)} neste bloco.` : 'Bloco concluído ainda sem revisão programada.',
        commands: [{ type: 'add_review', ref: { id: b.id } }],
      });
    }

    // Encaixe: capacidade (saldo líquido) e maior horário livre contínuo, em ordem de prioridade.
    let balance = capacity.balanceMin === null || capacity.balanceMin === undefined ? Infinity : Math.max(0, capacity.balanceMin);
    const suggestions = [], doesNotFit = [];
    for (const c of cands) {
      const base = { type: c.type, blockId: c.blockId, text: c.text };
      if (c.netMin > balance) doesNotFit.push({ ...base, code: 'LIMIT', reason: `Não cabe no limite da semana seguinte: exige ${fmt(c.netMin)} e o saldo é ${fmt(balance === Infinity ? 0 : balance)}.` });
      else if (c.agendaMin > capacity.maxFreeSlotMin) doesNotFit.push({ ...base, code: 'NO_SLOT', reason: `Nenhum horário livre contínuo de ${fmt(c.agendaMin)} na semana seguinte.` });
      else {
        balance -= c.netMin;
        suggestions.push({ type: c.type, blockId: c.blockId, text: c.text, reason: c.reason,
          impact: { netMin: c.netMin, agendaMin: c.agendaMin, balanceAfterMin: balance === Infinity ? null : balance }, commands: c.commands });
      }
    }
    return { week: nextMon, scheduled, capacity, suggestions, doesNotFit, note: 'Somente proposta: o calendário não foi alterado.' };
  }
  const inRange = (d, from, to) => d >= from && d <= to;
  const feedOne = (b) => { const a = newAcc(); feedAcc(a, b); return a; };

  /** Segunda-feira da semana cujo fechamento já passou e que ainda não tem relatório; senão null. */
  function shouldGenerate(state, nowMs) {
    const s = Cap.normalizeState(state), cl = s.settings.closing;
    const cur = Cap.weekKey(Core.isoDate(new Date(nowMs)));
    const closeAt = (monday) => Core.atMinutes(Core.isoDate(Core.addDays(Core.parseDate(monday), cl.day - 1)), Core.toMin(cl.time)).getTime();
    const target = nowMs >= closeAt(cur) ? cur : Core.isoDate(Core.addDays(Core.parseDate(cur), -7));
    return s.reports[target] ? null : target;
  }

  return { LOW_DATA_QUESTIONS, STRONG_RATE, WEAK_RATE, OVERRUN_FACTOR, OVERRUN_MIN_BLOCKS, buildWeeklyReport, shouldGenerate };
});
