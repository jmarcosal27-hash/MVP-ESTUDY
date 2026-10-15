/* Regra de conflito (Sprint 8): o bloco reserva TODO o seu período (foco + pausas); qualquer interseção com outro bloco
 * — inclusive pausas — é conflito. Horários colados não conflitam (intervalos semiabertos [início, fim)).
 * Módulo puro: não grava nada e nunca altera o bloco existente. Tempos em minutos desde 00:00 do dia do bloco. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./capacity.js'));
  else root.Conflict = factory(root.Core, root.Capacity);
})(typeof self !== 'undefined' ? self : this, function (C, Cap) {
  const hm = (min) => C.fromMin(min);
  const norm = (b) => Cap.normalizeBlock(b);

  /** Linha do tempo do bloco: foco, pausa, foco… (sem pausa depois do último foco). */
  function blockSegments(block) {
    const b = norm(block), cfg = b.config, breaks = C.breaksFor(b.estimated, cfg), out = [];
    let t = C.toMin(b.start);
    for (let n = 1; n <= b.estimated; n++) {
      out.push({ type: 'focus', n, startMin: t, endMin: t + cfg.focusMin }); t += cfg.focusMin;
      if (n < b.estimated) {
        const kind = breaks[n - 1], len = kind === 'long' ? cfg.longMin : cfg.shortMin;
        out.push({ type: kind, n, startMin: t, endMin: t + len }); t += len;
      }
    }
    return out;
  }
  function blockInterval(block) {
    const segs = blockSegments(block);
    return { startMin: segs[0].startMin, endMin: segs[segs.length - 1].endMin };
  }
  const validForCheck = (b) => b && !b.pending && C.okDate(b.date) && C.okTime(b.start) && Number.isInteger(b.estimated) && b.estimated >= 1;

  /** Conflitos do rascunho com os blocos confirmados do mesmo dia (ordenados pelo início da interseção). */
  function checkConflict(state, draft, opts) {
    const ignoreId = opts && opts.ignoreId !== undefined ? opts.ignoreId : draft.id;
    const me = blockInterval(draft), conflicts = [];
    for (const other of (state && state.blocks) || []) {
      if (!validForCheck(other) || other.date !== draft.date || other.id === ignoreId) continue;
      const iv = blockInterval(other), s = Math.max(me.startMin, iv.startMin), e = Math.min(me.endMin, iv.endMin);
      if (s >= e) continue; // colados ou separados: sem conflito
      const part = blockSegments(other).find((g) => g.startMin <= s && s < g.endMin);
      conflicts.push({ blockId: other.id, title: other.title, overlap: { startMin: s, endMin: e },
        theirPart: { type: part.type, startMin: part.startMin, endMin: part.endMin }, kind: part.type === 'focus' ? 'focus' : 'pause' });
    }
    return { ok: conflicts.length === 0, conflicts: conflicts.sort((a, b) => a.overlap.startMin - b.overlap.startMin) };
  }

  /** Textos do pop-up (exatamente como combinado com o dono do projeto). */
  function conflictMessage(conflict, existingBlock) {
    const name = (existingBlock && existingBlock.title) || conflict.title, from = hm(conflict.theirPart.startMin), to = hm(conflict.theirPart.endMin);
    if (conflict.kind === 'pause') {
      const pauseLabel = conflict.theirPart.type === 'long' ? 'pausa longa' : 'pausa curta';
      return { kind: 'pause', pauseLabel, from, to, blockName: name, title: 'Opa! Essa pausa já tem dono. ☕', lines: [
        `Das ${from} às ${to}, você tem uma ${pauseLabel} do bloco ${name}.`,
        'Não é possível agendar outro bloco nesse período. Descanso também faz parte do planejamento — você é estudante, não uma máquina! 😂',
        'O que deseja fazer?'] };
    }
    return { kind: 'focus', from, to, blockName: name, title: 'Esse horário já está reservado.', lines: [
      `Das ${from} às ${to}, você tem um período de estudo reservado do bloco ${name}.`,
      'Não é possível agendar outro bloco nesse período.',
      'O que deseja fazer?'] };
  }

  /** "Mover para depois de X": começa exatamente quando X termina por completo, se couber (inclusive as pausas do novo bloco). */
  function moveAfter(state, draft, existingBlockId) {
    const ex = ((state && state.blocks) || []).find((b) => b.id === existingBlockId);
    if (!ex) return { ok: false, code: 'OTHER_CONFLICT', reason: 'O bloco de referência não existe mais.' };
    const start = blockInterval(ex).endMin, moved = { ...norm(draft), date: ex.date, start: hm(Math.min(start, 1439)) };
    const len = blockInterval({ ...moved, start: '00:00' }).endMin;
    if (start + len > 1440) return { ok: false, code: 'PAST_MIDNIGHT', reason: `Não cabe depois de "${ex.title}": o novo bloco terminaria depois da meia-noite.` };
    moved.start = hm(start);
    const chk = checkConflict(state, moved, { ignoreId: draft.id });
    if (!chk.ok) {
      const c = chk.conflicts[0];
      return { ok: false, code: 'OTHER_CONFLICT', reason: `Não cabe logo depois de "${ex.title}": o novo bloco (${hm(start)}–${hm(start + len)}) bateria em "${c.title}".` };
    }
    return { ok: true, start: hm(start), date: ex.date };
  }

  /** Pode confirmar? Só se for válido e sem nenhum conflito. */
  function isConfirmable(state, block) {
    return C.validateBlockPlan(norm(block)).length === 0 && checkConflict(state, block, { ignoreId: block.id }).ok;
  }

  /** Pares já sobrepostos em dados antigos (a tela só marca; nunca apaga nem move). */
  function findLegacyConflicts(state) {
    const list = ((state && state.blocks) || []).filter(validForCheck), out = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.date !== b.date) continue;
      const x = blockInterval(a), y = blockInterval(b);
      if (Math.max(x.startMin, y.startMin) < Math.min(x.endMin, y.endMin)) out.push(x.startMin <= y.startMin ? { a: a.id, b: b.id, date: a.date } : { a: b.id, b: a.id, date: a.date });
    }
    return out;
  }

  return { blockSegments, blockInterval, checkConflict, conflictMessage, moveAfter, isConfirmable, findLegacyConflicts };
});
