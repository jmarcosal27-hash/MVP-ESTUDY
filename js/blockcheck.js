/* Restrições do passo a passo de criação de bloco: o que BLOQUEIA e o que só AVISA. Módulo puro, testável em Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./capacity.js'));
  else root.BlockCheck = factory(root.Core, root.Capacity);
})(typeof self !== 'undefined' ? self : this, function (C, K) {
  /** Limites dos avisos, em minutos. Único lugar para ajustar. */
  const LIMITS = Object.freeze({
    dayWarnMin: 6 * 60,   // mais que isto de foco no dia: aviso
    dayStrongMin: 8 * 60, // mais que isto: aviso forte
    stretchMin: 2 * 60,   // foco seguido acima disto: aviso de pausa
    gapMin: 10,           // pausa/intervalo mínimo: abaixo disto (dentro do bloco ou entre blocos) o foco continua "seguido"
  });

  const fmt = (min) => C.fmtDur(min * C.MIN);
  const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; // 2026-10-17 -> 17/10
  // Horário de término sempre em 00:00-23:59; depois da meia-noite acrescenta "do dia seguinte" (ou "N dias depois").
  const endLabel = C.endLabel;
  /** Campos PDF e Páginas do editor de bloco: só nos blocos de estudo (Trabalho não tem material). */
  const materialFields = (isWork, v, esc) => isWork ? '' :
    `<label>PDF (nome ou link)<input name="pdf" value="${esc(v.pdf)}"></label>\n        <label>Páginas / trecho previsto<input name="pages" value="${esc(v.pages)}"></label>`;
  const span = (s) => `${C.fromMin(s.start)}–${C.fromMin(s.end % 1440)}`;

  /** Textos mostrados na etapa 03. Troque aqui; cada um recebe os dados do aviso (p) e devolve uma frase curta. */
  const TEXTS = {
    empty: {
      subject: (p) => (p.area === 'trabalho' ? 'Projeto em branco: eu não adivinho! Escolha um ou crie um novo.' : 'Matéria em branco: eu não adivinho! Escolha uma ou crie uma nova.'),
      title: (p) => (p.area === 'trabalho' ? 'Faltou a tarefa. Dê um nome pra ela não virar "aquela coisa".' : 'Faltou o assunto. Dê um nome pra ele não virar "aquela coisa".'),
      date: () => 'Sem dia, sem bloco. Escolha uma data.',
      start: () => 'Que horas começa? O relógio ainda não sabe.',
      estimated: (v) => (Number.isNaN(v) ? 'Informe o número de pomodoros.'
        : !Number.isInteger(v) ? 'Use um número inteiro de pomodoros: meio pomodoro não vale.'
        : 'Mínimo de 1 pomodoro: zero ou negativo não rende nada.'),
      focusMin: () => 'Foco precisa ser um número inteiro de minutos, maior que zero.',
      shortMin: () => 'A pausa curta precisa ser um número inteiro de minutos, maior que zero.',
      longEvery: () => 'Diga a cada quantos pomodoros vem a pausa longa (inteiro, 1 ou mais).',
      longMin: () => 'A pausa longa precisa ser um número inteiro de minutos, maior que zero.',
    },
    midnight: (p) => `Esse bloco invade a madrugada: termina ${endLabel(p.endMin)}. O dia só tem 24 h, comece mais cedo ou reduza os pomodoros.`,
    past: (p) => `O dia ${br(p.date)} já foi embora e a máquina do tempo está na oficina. Escolha hoje ou um dia que ainda vem.`,
    fixedClash: (p) => `Dois horários obrigatórios no mesmo lugar não dá! "${p.other.title}" já ocupa ${span(p.otherSpan)}. Mude um dos dois.`,
    clash: (p) => `Esse horário esbarra em "${p.other.title}" (${span(p.otherSpan)}). ${p.suggest ? `Que tal começar às ${p.suggest}?` : 'E não achei vaga livre que caiba nesse dia.'}`,
    started: (p) => `Esse bloco de hoje já deveria ter começado (${p.start}). Se é pra registrar algo que você já fez, tudo bem!`,
    dayFocus: (p) => `Já são ${fmt(p.totalMin)} de foco hoje. Seu cérebro também merece um recreio!`,
    dayFocusStrong: (p) => `Alerta máximo: ${fmt(p.totalMin)} de foco no mesmo dia! Isso é maratona, não estudo. Que tal passar parte pra outro dia?`,
    noBreak: {
      stretch: (p) => `${fmt(p.stretchMin)} de foco seguidas, sem uma pausa de pelo menos ${LIMITS.gapMin} min.`,
      gap: (p) => `Só ${p.gapMin} min de respiro perto de "${p.other.title}" (o mínimo é ${LIMITS.gapMin}).`,
      tail: () => 'Respira: encurte o trecho ou dê mais intervalo.',
    },
    outside: () => 'Esse horário está fora da sua disponibilidade (ou num período indisponível). O seu eu do futuro pode reclamar.',
    afterDeadline: (p) => `Esse bloco cai depois do prazo (${br(p.deadline)}). O relógio não espera!`,
    weekLimit: (p) => `Com ele, a semana passa do limite em ${fmt(p.excessMin)}. O limite não muda sozinho: vale rever.`,
  };

  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const isTime = (v) => /^\d{2}:\d{2}$/.test(v || '');
  const posInt = (v) => Number.isInteger(v) && v >= 1;
  const spanOf = (b) => { const s = C.blockSpan(b); return { start: s.startMin, end: s.endMin }; };

  /** Primeiro horário livre (dentro da disponibilidade) que comporte `need` min; hoje, só a partir de agora. */
  function nextFree(state, date, need, ignoreId, nowMs) {
    const now = new Date(nowMs), isToday = C.isoDate(now) === date, nowMin = now.getHours() * 60 + now.getMinutes();
    for (const iv of K.freeIntervals(state, date, ignoreId ? [ignoreId] : [])) {
      const s = isToday ? Math.max(iv.startMin, Math.ceil(nowMin / 15) * 15) : iv.startMin;
      if (iv.endMin - s >= need) return C.fromMin(s);
    }
    return null;
  }

  /**
   * Confere um rascunho de bloco (valores já convertidos: números como Number/NaN).
   * Devolve [{ id, level: 'block'|'warn', field, text }]; bloqueios primeiro.
   * Edição: passe `opts.original` (o bloco antes da edição). Se nada do agendamento mudou, só os campos vazios são conferidos;
   * "dia anterior a hoje" e "já começou" só valem quando a data (ou o início) mudou.
   */
  function checkBlock(state, d, nowMs, opts = {}) {
    const orig = opts.original || null, ignoreId = opts.ignoreId || (orig && orig.id) || null;
    const out = [];
    const add = (id, level, field, text) => out.push({ id, level, field, text });
    const E = TEXTS.empty;

    /* ---- bloqueiam ---- */
    if (!d.subject || !d.subject.trim()) add('empty-subject', 'block', 'subject', E.subject(d));
    if (!d.title || !d.title.trim()) add('empty-title', 'block', 'title', E.title(d));
    if (!isDate(d.date)) add('empty-date', 'block', 'date', E.date());
    if (!isTime(d.start)) add('empty-start', 'block', 'start', E.start());
    if (!posInt(d.estimated)) add('empty-estimated', 'block', 'estimated', E.estimated(d.estimated));
    const cfg = d.config || {};
    for (const k of ['focusMin', 'shortMin', 'longEvery', 'longMin']) if (!posInt(cfg[k])) add('empty-' + k, 'block', k, E[k]());

    const today = C.isoDate(new Date(nowMs));
    if (isDate(d.date) && d.date < today && !(orig && orig.date === d.date)) add('past', 'block', 'date', TEXTS.past(d));

    const keys = ['focusMin', 'shortMin', 'longEvery', 'longMin'];
    const unchanged = orig && orig.date === d.date && orig.start === d.start && orig.estimated === d.estimated && keys.every((k) => orig.config[k] === cfg[k])
      && !!orig.fixed === !!d.fixed && (orig.deadline || null) === (d.deadline || null);
    if (unchanged) return out;

    const timeOk = isDate(d.date) && isTime(d.start) && posInt(d.estimated) && ['focusMin', 'shortMin', 'longEvery', 'longMin'].every((k) => posInt(cfg[k]));
    if (!timeOk) return out;

    const me = spanOf(d);
    if (me.end > 1440) add('midnight', 'block', 'start', TEXTS.midnight({ endMin: me.end }));

    const others = (state.blocks || []).filter((b) => b.id !== ignoreId && b.date === d.date);
    const overlapping = others.filter((b) => { const o = spanOf(b); return me.start < o.end && o.start < me.end; });
    const fixedClash = overlapping.find((b) => d.fixed && b.fixed);
    if (fixedClash) add('fixed-clash', 'block', 'start', TEXTS.fixedClash({ other: fixedClash, otherSpan: spanOf(fixedClash) }));

    /* ---- só avisam ---- */
    const softClash = overlapping.find((b) => b !== fixedClash && !(d.fixed && b.fixed));
    if (softClash) {
      const suggest = nextFree(state, d.date, me.end - me.start, ignoreId, nowMs);
      add('clash', 'warn', 'start', TEXTS.clash({ other: softClash, otherSpan: spanOf(softClash), suggest }));
    }

    const now = new Date(nowMs);
    const moved = !orig || orig.date !== d.date || orig.start !== d.start;
    if (moved && d.date === today && me.start < now.getHours() * 60 + now.getMinutes()) add('started', 'warn', 'start', TEXTS.started({ start: d.start }));

    const totalMin = others.reduce((s, b) => s + b.estimated * b.config.focusMin, 0) + d.estimated * cfg.focusMin;
    if (totalMin > LIMITS.dayStrongMin) add('day-focus', 'warn', 'estimated', TEXTS.dayFocusStrong({ totalMin }));
    else if (totalMin > LIMITS.dayWarnMin) add('day-focus', 'warn', 'estimated', TEXTS.dayFocus({ totalMin }));

    // Falta de pausa: foco seguido OU intervalo curto até um bloco vizinho. Um aviso só.
    // Pausa (dentro do bloco ou entre blocos) menor que LIMITS.gapMin NÃO interrompe a sequência de foco.
    const parts = [];
    const day = [...others.map((b) => ({ b, mine: false })), { b: d, mine: true }].map((x) => ({ ...x, sp: spanOf(x.b) })).sort((x, y) => x.sp.start - y.sp.start);
    let run = 0, withMine = false, stretchMin = 0;
    day.forEach((it, i) => {
      const brk = C.breaksFor(it.b.estimated, it.b.config);
      for (let k = 0; k < it.b.estimated; k++) {
        run += it.b.config.focusMin; withMine = withMine || it.mine;
        if (withMine) stretchMin = Math.max(stretchMin, run);
        const pause = k < brk.length ? (brk[k] === 'long' ? it.b.config.longMin : it.b.config.shortMin) : (day[i + 1] ? day[i + 1].sp.start - it.sp.end : Infinity);
        if (pause >= LIMITS.gapMin) { run = 0; withMine = false; }
      }
    });
    let field = null;
    if (stretchMin > LIMITS.stretchMin) { parts.push(TEXTS.noBreak.stretch({ stretchMin })); field = 'longEvery'; }
    for (const b of others) {
      const o = spanOf(b);
      const gap = o.end <= me.start ? me.start - o.end : me.end <= o.start ? o.start - me.end : null;
      if (gap !== null && gap < LIMITS.gapMin) { parts.push(TEXTS.noBreak.gap({ gapMin: gap, other: b })); field = field || 'start'; }
    }
    if (parts.length) add('no-break', 'warn', field, [...parts, TEXTS.noBreak.tail()].join(' '));

    const free = K.freeIntervals({ ...state, blocks: [] }, d.date);
    if (me.end <= 1440 && !free.some((iv) => iv.startMin <= me.start && iv.endMin >= me.end)) add('outside', 'warn', 'start', TEXTS.outside());

    if (d.deadline && isDate(d.deadline) && d.date > d.deadline) add('deadline', 'warn', 'date', TEXTS.afterDeadline({ deadline: d.deadline }));

    return out;
  }

  return { LIMITS, TEXTS, checkBlock, nextFree, endLabel, materialFields };
});
