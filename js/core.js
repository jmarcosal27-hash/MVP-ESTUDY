/* Regras de negócio do MVP-ESTUDY (sem acesso a DOM ou storage, para ser testável em Node). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN = 60000;
  const DEFAULT_CONFIG = { focusMin: 25, shortMin: 5, longEvery: 4, longMin: 15 };

  /* ---------- datas e horas ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  /** Data real no formato YYYY-MM-DD (rejeita 2026-02-31) e hora real HH:MM (rejeita 12:75). */
  const okDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseDate(s)) === s;
  const okTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  function mondayOf(d) {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
    return r;
  }
  /** Data/hora local a partir de 'YYYY-MM-DD' + minutos desde 00:00 (aceita 1440 = meia-noite seguinte). */
  const atMinutes = (dateStr, min) => { const d = parseDate(dateStr); d.setMinutes(min); return d; };

  function fmtDur(ms) {
    const totalMin = Math.round(ms / MIN);
    if (totalMin < 60) return `${totalMin}min`;
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return m ? `${h}h ${pad(m)}min` : `${h}h`;
  }
  function fmtClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  /* ---------- configuração do pomodoro ---------- */
  function validateConfig(c) {
    const errors = [];
    const chk = (v, label) => { if (!Number.isInteger(v) || v < 1) errors.push(`${label}: informe um número inteiro maior que zero.`); };
    chk(c.focusMin, 'Duração do pomodoro');
    chk(c.shortMin, 'Pausa curta');
    chk(c.longEvery, 'Pomodoros até a pausa longa');
    chk(c.longMin, 'Pausa longa');
    return errors;
  }

  /* ---------- planejamento por pomodoros ---------- */
  /** Pausa após o pomodoro i (1-based): longa a cada `longEvery`, curta nos demais; nenhuma após o último. */
  function breaksFor(estimated, cfg) {
    const out = [];
    for (let i = 1; i < estimated; i++) out.push(i % cfg.longEvery === 0 ? 'long' : 'short');
    return out;
  }
  function planBlock(estimated, cfg) {
    const breaks = breaksFor(estimated, cfg);
    const studyMin = estimated * cfg.focusMin;
    const restMin = breaks.reduce((s, b) => s + (b === 'long' ? cfg.longMin : cfg.shortMin), 0);
    return { studyMin, restMin, totalMin: studyMin + restMin, breaks };
  }
  function blockSpan(block) {
    const p = planBlock(block.estimated, block.config);
    const startMin = toMin(block.start);
    return { ...p, startMin, endMin: startMin + p.totalMin };
  }
  /** Horário de início + duração total; avisa quando passa da meia-noite. */
  function validateBlockPlan(b) {
    const errors = [];
    if (!b.subject || !b.subject.trim()) errors.push('Informe a matéria.');
    if (!b.title || !b.title.trim()) errors.push('Informe o assunto ou título.');
    if (!okDate(b.date)) errors.push('Informe um dia válido para o estudo.');
    if (!okTime(b.start)) errors.push('Informe um horário de início válido (HH:MM).');
    if (!Number.isInteger(b.estimated) || b.estimated < 1) errors.push('A estimativa deve ser um número inteiro de pomodoros (mínimo 1).');
    errors.push(...validateConfig(b.config));
    if (!errors.length && blockSpan(b).endMin > 1440) errors.push('O bloco ultrapassa a meia-noite; ajuste o horário ou a quantidade de pomodoros.');
    return errors;
  }

  /* ---------- situação do bloco ---------- */
  function blockStatus(block, now) {
    if (block.completed) return 'concluido';
    const end = atMinutes(block.date, blockSpan(block).endMin);
    return now.getTime() > end.getTime() ? 'atrasado' : 'em_dia';
  }
  const STATUS_LABEL = { concluido: 'Concluído', atrasado: 'Atrasado', em_dia: 'Em dia' };

  /* ---------- resultados (questões e acertos) ---------- */
  /** Converte entrada de formulário: vazio => null (não preenchido); 0 é um valor válido. */
  function parseCount(raw) {
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { value: null };
    if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 ? { value: raw } : { error: true };
    return /^\d+$/.test(raw.trim()) ? { value: Number(raw.trim()) } : { error: true };
  }
  function validateResult(rawQuestions, rawHits) {
    const errors = [];
    const q = parseCount(rawQuestions), h = parseCount(rawHits);
    if (q.error) errors.push('Questões respondidas: use apenas números inteiros não negativos.');
    if (h.error) errors.push('Acertos: use apenas números inteiros não negativos.');
    if (!errors.length) {
      if (h.value !== null && q.value === null) errors.push('Informe as questões respondidas antes dos acertos.');
      else if (h.value !== null && h.value > q.value) errors.push('Os acertos não podem superar as questões respondidas.');
    }
    return { errors, questions: q.value ?? null, hits: h.value ?? null };
  }
  function accuracy(block) {
    const q = block.questions, h = block.hits;
    if (q === null || q === undefined || q === 0) return { kind: 'none', label: 'Sem questões registradas' };
    if (h === null || h === undefined) return { kind: 'pending', label: 'Resultado pendente' };
    const rate = (h * 100) / q;
    return { kind: 'value', rate, errors: q - h, label: `${rate.toFixed(1).replace('.', ',')}%` };
  }

  /* ---------- totais de tempo realizado ---------- */
  const zeroTotals = () => ({ focusMs: 0, extraMs: 0, restMs: 0, interruptMs: 0, studyMs: 0 });
  function totalsOfSegments(segments) {
    const t = zeroTotals();
    for (const s of segments) {
      if (s.type === 'focus') t.focusMs += s.ms;
      else if (s.type === 'extra') t.extraMs += s.ms;
      else if (s.type === 'rest') t.restMs += s.ms;
      else if (s.type === 'interruption') t.interruptMs += s.ms;
    }
    t.studyMs = t.focusMs + t.extraMs;
    return t;
  }
  function addTotals(a, b) {
    return { focusMs: a.focusMs + b.focusMs, extraMs: a.extraMs + b.extraMs, restMs: a.restMs + b.restMs,
      interruptMs: a.interruptMs + b.interruptMs, studyMs: a.studyMs + b.studyMs };
  }
  function sessionsTotals(sessions) {
    return (sessions || []).reduce((acc, s) => addTotals(acc, s.totals), zeroTotals());
  }
  function sessionsPomodoros(sessions) {
    let complete = 0, partial = 0;
    for (const s of sessions || []) { complete += s.completedPomodoros; partial += s.partialCycles; }
    return { complete, partial };
  }

  /* ---------- cronômetro (máquina de estados baseada em timestamps) ----------
   * phase: focus | extra | short | long.  state: running | paused | awaiting.
   * 'awaiting' = pausa terminou e o próximo foco só começa por ação do usuário (nada é contado).
   * O tempo decorrido é sempre derivado de Date.now(), então aba em segundo plano ou reload não alteram a contagem. */
  const isBreak = (p) => p === 'short' || p === 'long';

  function startSession(blockId, cfg, nowMs, id) {
    return {
      id: id || `s${nowMs}`, blockId, cfg: { ...cfg }, startedAt: nowMs,
      phase: 'focus', state: 'running', phaseMs: 0, since: nowMs, pausedSince: null,
      pomo: 1, completed: 0, lastBreakAt: 0, segments: [],
      cycles: [{ n: 1, focusMs: 0, extraMs: 0, complete: false }],
      alert: null, alertSeq: 0, alertAck: 0,
    };
  }
  function elapsed(s, nowMs) { return s.phaseMs + (s.state === 'running' ? Math.max(0, nowMs - s.since) : 0); }
  const phaseDuration = (s) => (s.phase === 'focus' ? s.cfg.focusMin : s.phase === 'short' ? s.cfg.shortMin : s.cfg.longMin) * MIN;
  const curCycle = (s) => s.cycles[s.cycles.length - 1];
  function raise(s, type) { s.alertSeq += 1; s.alert = type; }
  function pushSeg(s, type, ms, pomodoro) { if (ms > 0) s.segments.push({ type, ms, pomodoro }); }

  /** Aplica as transições automáticas (foco -> tempo extra, fim de pausa -> aguardando). Retorna true se mudou. */
  function advance(s, nowMs) {
    if (s.state !== 'running') return false;
    let changed = false;
    if (s.phase === 'focus') {
      const f = s.cfg.focusMin * MIN;
      if (elapsed(s, nowMs) >= f) {
        const crossAt = s.since + (f - s.phaseMs);
        pushSeg(s, 'focus', f, s.pomo);
        const c = curCycle(s); c.focusMs = f; c.complete = true;
        s.completed += 1;
        s.phase = 'extra'; s.phaseMs = 0; s.since = crossAt;
        raise(s, 'focus_end');
        changed = true;
      }
    } else if (isBreak(s.phase)) {
      const d = phaseDuration(s);
      if (elapsed(s, nowMs) >= d) {
        pushSeg(s, 'rest', d, s.pomo);
        s.state = 'awaiting'; s.phaseMs = 0; s.since = null;
        raise(s, 'break_end');
        changed = true;
      }
    }
    return changed;
  }

  /** Fecha o período corrente gravando o segmento; não altera a fase. */
  function closePhase(s, nowMs) {
    const el = elapsed(s, nowMs);
    if (s.phase === 'focus') {
      pushSeg(s, 'focus', el, s.pomo);
      const c = curCycle(s); c.focusMs = el; // < foco configurado => ciclo parcial
    } else if (s.phase === 'extra') {
      pushSeg(s, 'extra', el, s.pomo);
      curCycle(s).extraMs += el;
    } else if (s.state !== 'awaiting') {
      pushSeg(s, 'rest', Math.min(el, phaseDuration(s)), s.pomo);
    }
    s.phaseMs = 0; s.since = null;
  }
  function settleInterruption(s, nowMs) {
    if (s.state === 'paused' && s.pausedSince != null && (s.phase === 'focus' || s.phase === 'extra')) {
      pushSeg(s, 'interruption', Math.max(0, nowMs - s.pausedSince), s.pomo);
    }
    s.pausedSince = null;
  }

  function pause(s, nowMs) {
    advance(s, nowMs);
    if (s.state !== 'running') return s;
    s.phaseMs = elapsed(s, nowMs); s.since = null; s.state = 'paused'; s.pausedSince = nowMs;
    return s;
  }
  function resume(s, nowMs) {
    if (s.state !== 'paused') return s;
    settleInterruption(s, nowMs);
    s.state = 'running'; s.since = nowMs;
    return s;
  }
  function nextBreakKind(s) {
    return s.completed > 0 && s.completed % s.cfg.longEvery === 0 && s.lastBreakAt !== s.completed ? 'long' : 'short';
  }
  function canStartBreak(s) { return !isBreak(s.phase) && (s.state === 'running' || s.state === 'paused'); }
  function startBreak(s, nowMs) {
    advance(s, nowMs);
    if (!canStartBreak(s)) return s;
    settleInterruption(s, nowMs);
    if (s.state === 'paused') { s.state = 'running'; s.since = nowMs; } // phaseMs já guarda o acumulado
    closePhase(s, nowMs);
    const kind = nextBreakKind(s);
    s.lastBreakAt = s.completed;
    s.phase = kind; s.phaseMs = 0; s.since = nowMs; s.state = 'running';
    return s;
  }
  /** Inicia (ou retoma após pausa) um novo período de foco, sempre por ação do usuário. */
  function startFocus(s, nowMs) {
    advance(s, nowMs);
    if (!isBreak(s.phase)) return s;
    if (s.state === 'paused') { s.state = 'running'; s.since = nowMs; }
    closePhase(s, nowMs);
    s.pomo += 1;
    s.cycles.push({ n: s.pomo, focusMs: 0, extraMs: 0, complete: false });
    s.phase = 'focus'; s.phaseMs = 0; s.since = nowMs; s.state = 'running';
    return s;
  }
  /** Encerra e devolve o registro da sessão a ser salvo no bloco. */
  function finishSession(s, nowMs) {
    advance(s, nowMs);
    settleInterruption(s, nowMs);
    closePhase(s, nowMs);
    const cycles = s.cycles.filter((c) => c.focusMs > 0);
    return {
      id: s.id, startedAt: s.startedAt, endedAt: nowMs, cfg: s.cfg,
      segments: s.segments, cycles,
      totals: totalsOfSegments(s.segments),
      completedPomodoros: cycles.filter((c) => c.complete).length,
      partialCycles: cycles.filter((c) => !c.complete).length,
    };
  }
  /** Totais da sessão em andamento, incluindo o período aberto (sem alterar a sessão). */
  function liveTotals(s, nowMs) {
    const t = totalsOfSegments(s.segments);
    const el = elapsed(s, nowMs);
    if (s.phase === 'focus') t.focusMs += Math.min(el, s.cfg.focusMin * MIN);
    else if (s.phase === 'extra') t.extraMs += el;
    else if (s.state !== 'awaiting') t.restMs += Math.min(el, phaseDuration(s));
    if (s.state === 'paused' && s.pausedSince != null && (s.phase === 'focus' || s.phase === 'extra')) {
      t.interruptMs += Math.max(0, nowMs - s.pausedSince);
    }
    t.studyMs = t.focusMs + t.extraMs;
    return t;
  }

  /* ---------- sobreposições e invasão por tempo extra ---------- */
  /** Retorna { [blockId]: [mensagens] }. Usa o término real (último estudo do dia) quando ultrapassa o previsto. */
  function findConflicts(blocks, session, nowMs) {
    const out = {};
    const add = (id, msg) => { (out[id] = out[id] || []).push(msg); };
    const byDay = {};
    for (const b of blocks) (byDay[b.date] = byDay[b.date] || []).push(b);
    for (const day of Object.keys(byDay)) {
      const list = byDay[day].map((b) => {
        const sp = blockSpan(b);
        let realEnd = sp.endMin;
        const ends = (b.sessions || []).map((x) => x.endedAt);
        if (session && session.blockId === b.id) ends.push(nowMs);
        for (const e of ends) {
          const d = new Date(e);
          if (isoDate(d) === day) realEnd = Math.max(realEnd, d.getHours() * 60 + d.getMinutes());
        }
        return { b, start: sp.startMin, end: sp.endMin, realEnd };
      });
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], c = list[j];
          if (a.start < c.end && c.start < a.end) {
            add(a.b.id, `Sobrepõe "${c.b.title}" (${fromMin(c.start)}–${fromMin(c.end)})`);
            add(c.b.id, `Sobrepõe "${a.b.title}" (${fromMin(a.start)}–${fromMin(a.end)})`);
          }
        }
      }
      for (const a of list) {
        if (a.realEnd <= a.end) continue;
        for (const c of list) {
          if (c === a || c.start < a.end || c.start >= a.realEnd) continue;
          add(a.b.id, `O estudo real (até ${fromMin(a.realEnd)}) invadiu o início de "${c.b.title}" (${fromMin(c.start)})`);
          add(c.b.id, `Início invadido pelo estudo de "${a.b.title}"`);
        }
      }
    }
    return out;
  }

  /* ---------- relatórios ---------- */
  function blockRealized(block, session, nowMs) {
    let t = sessionsTotals(block.sessions);
    if (session && session.blockId === block.id) t = addTotals(t, liveTotals(session, nowMs));
    return t;
  }
  /**
   * Consolida blocos por matéria (ou semana). Taxa geral = soma dos acertos / soma das questões
   * dos blocos com resultado preenchido (nunca a média das taxas).
   */
  function consolidate(blocks, opts, now, session) {
    const { subject = '', from = '', to = '', groupBy = 'subject' } = opts || {};
    const nowMs = now.getTime();
    const sel = blocks.filter((b) => (!subject || b.subject === subject) && (!from || b.date >= from) && (!to || b.date <= to));
    const mk = (key) => ({
      key, blocks: [], plannedStudyMin: 0, plannedRestMin: 0, plannedTotalMin: 0,
      totals: zeroTotals(), pomodoros: { complete: 0, partial: 0 },
      questions: 0, questionsWithResult: 0, hits: 0, errors: 0, pendingResults: 0,
      status: { concluido: 0, atrasado: 0, em_dia: 0 }, overrun: 0,
    });
    const groups = new Map();
    const total = mk('Total');
    const feed = (g, b) => {
      const sp = blockSpan(b), real = blockRealized(b, session, nowMs), pom = sessionsPomodoros(b.sessions);
      g.blocks.push(b);
      g.plannedStudyMin += sp.studyMin; g.plannedRestMin += sp.restMin; g.plannedTotalMin += sp.totalMin;
      g.totals = addTotals(g.totals, real);
      g.pomodoros.complete += pom.complete; g.pomodoros.partial += pom.partial;
      g.status[blockStatus(b, now)] += 1;
      if (real.studyMs > sp.studyMin * MIN) g.overrun += 1;
      const acc = accuracy(b);
      if (acc.kind === 'value') { g.questions += b.questions; g.questionsWithResult += b.questions; g.hits += b.hits; g.errors += acc.errors; }
      else if (acc.kind === 'pending') { g.questions += b.questions; g.pendingResults += 1; }
    };
    for (const b of sel) {
      const key = groupBy === 'week' ? isoDate(mondayOf(parseDate(b.date))) : b.subject;
      if (!groups.has(key)) groups.set(key, mk(key));
      feed(groups.get(key), b); feed(total, b);
    }
    const fin = (g) => { g.rate = g.questionsWithResult > 0 ? (g.hits * 100) / g.questionsWithResult : null; return g; };
    const rows = [...groups.values()].map(fin).sort((a, b) => (a.key < b.key ? -1 : 1));
    return { rows, total: fin(total), blocks: sel };
  }

  return {
    MIN, DEFAULT_CONFIG, pad, isoDate, parseDate, okDate, okTime, toMin, fromMin, addDays, mondayOf, atMinutes, fmtDur, fmtClock,
    validateConfig, breaksFor, planBlock, blockSpan, validateBlockPlan, blockStatus, STATUS_LABEL,
    parseCount, validateResult, accuracy, totalsOfSegments, addTotals, sessionsTotals, sessionsPomodoros, zeroTotals,
    startSession, elapsed, advance, pause, resume, startBreak, startFocus, finishSession, liveTotals,
    canStartBreak, nextBreakKind, isBreak, phaseDuration, findConflicts, blockRealized, consolidate,
  };
});
