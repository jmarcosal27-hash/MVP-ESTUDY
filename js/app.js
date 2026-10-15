/* Interface do MVP-ESTUDY: calendário semanal, bloco, cronômetro e relatórios. Dados em localStorage. */
(() => {
  'use strict';
  const C = window.Core;
  const K = window.Capacity;
  const A = window.Alarm;
  const CF = window.Conflict;
  const APP_VERSION = 'sprint 2 · 15/10/2026';
  const KEY = 'estudy.mvp.v1';
  const HPX = 52; // altura de uma hora no calendário (deve coincidir com --hour no CSS)
  const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dur = C.fmtDur;

  /* ---------- estado e persistência ---------- */
  const fresh = () => K.normalizeState({ settings: { config: { ...C.DEFAULT_CONFIG } }, blocks: [], session: null });
  let loadNotice = '';
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* storage indisponível */ }
    if (!raw) return fresh();
    try { const r = JSON.parse(raw); if (r && typeof r === 'object') return K.normalizeState(r); } catch (e) { /* ilegível: cai para a cópia de segurança */ }
    try { if (!localStorage.getItem(KEY + '.corrompido')) localStorage.setItem(KEY + '.corrompido', raw); } catch (e) { /* sem espaço */ }
    loadNotice = 'Os dados salvos estavam ilegíveis. Guardei uma cópia de segurança (chave "estudy.mvp.v1.corrompido" no navegador) e comecei do zero.';
    return fresh();
  }
  let state = load();
  state.settings.config = { ...C.DEFAULT_CONFIG }; // valores FIXOS para blocos novos (25/5/4/15); cada bloco é customizado no cadastro
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sem persistência */ } };
  const ui = { weekStart: C.mondayOf(new Date()), view: 'calendar', drag: null, minuteKey: '', timerSig: '' };
  const blockById = (id) => state.blocks.find((b) => b.id === id);

  /* ---------- alarme e avisos (ver js/alarm.js) ---------- */
  const unlockAudio = () => A.unlock();
  const ALERT_TEXT = {
    focus_end: '⏰ POMODORO ENCERRADO! O tempo extra já está sendo contado como estudo. Continue, pause, inicie a pausa ou encerre a sessão.',
    break_end: '☕ PAUSA ENCERRADA! O próximo foco só começa quando você clicar em "Iniciar foco".',
  };
  const ALERT_TITLE = { focus_end: 'POMO ENCERROU!', break_end: 'PAUSA ENCERROU!' };
  function showBanner(type, soundBlocked) {
    const el = $('#alert-banner'); el.textContent = '';
    const sp = document.createElement('span'); sp.textContent = ALERT_TEXT[type] + (soundBlocked ? ' (O navegador bloqueou o som: clique em qualquer lugar da página para liberar.)' : '');
    const sil = document.createElement('button'); sil.id = 'banner-silence'; sil.textContent = '🔕 Silenciar alarme';
    const ok = document.createElement('button'); ok.id = 'banner-close'; ok.textContent = 'Entendi';
    el.append(sp, sil, ok); el.hidden = false;
  }
  const alarmSeconds = () => (Number.isFinite(state.settings.alarmSec) ? state.settings.alarmSec : A.DEFAULT_SECONDS);
  const silenceAlarm = () => { A.stop(); A.stopFlash(); };
  function handleAlert() {
    const s = state.session;
    if (!s || s.alertSeq <= s.alertAck) return;
    s.alertAck = s.alertSeq; save();
    const played = A.play(s.alert, alarmSeconds());
    showBanner(s.alert, !played || !A.isReady());
    const away = document.hidden || !document.hasFocus();
    if (away) A.flashTitle(ALERT_TITLE[s.alert]);
    if (away || !A.isReady()) A.notify('Estudy · ' + ALERT_TITLE[s.alert], ALERT_TEXT[s.alert].replace(/^[^ ]+ /, ''));
  }

  /* ---------- calendário ---------- */

  /* ---------- disponibilidade: conversão texto <-> dados ---------- */
  const WD = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const fmtRanges = (arr) => (arr || []).map((r) => `${r.from}-${r.to}`).join(', ');
  const isHM = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  function parseRanges(text, label) {
    const out = [], t = text.trim();
    if (!t) return { ranges: out };
    for (const part of t.split(',')) {
      const m = part.trim().match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
      if (!m) return { error: `${label}: use o formato 08:00-12:00, 14:00-18:00.` };
      const from = C.fromMin(C.toMin(m[1])), to = C.fromMin(C.toMin(m[2]));
      if (!isHM(from) || !isHM(to) || C.toMin(from) >= C.toMin(to)) return { error: `${label}: faixa inválida "${part.trim()}" (o início deve ser antes do fim).` };
      out.push({ from, to });
    }
    out.sort((a, b) => C.toMin(a.from) - C.toMin(b.from));
    for (let i = 1; i < out.length; i++) if (C.toMin(out[i].from) < C.toMin(out[i - 1].to)) return { error: `${label}: faixas sobrepostas.` };
    return { ranges: out };
  }
  const fmtUnavail = (list) => (list || []).map((u) => `${u.day || u.date} ${u.from}-${u.to}${u.label ? ' ' + u.label : ''}`).join('\n');
  function parseUnavail(text) {
    const out = [];
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = line.match(/^(\d{4}-\d{2}-\d{2}|[1-7])\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*(.*)$/);
      if (!m) return { error: `Indisponível "${line}": use "3 12:00-14:00 Almoço" (dia 1=seg…7=dom) ou "2026-10-15 09:00-10:00 Consulta".` };
      const from = C.fromMin(C.toMin(m[2])), to = C.fromMin(C.toMin(m[3]));
      if (C.toMin(from) >= C.toMin(to)) return { error: `Indisponível "${line}": início deve ser antes do fim.` };
      const u = /^\d{4}/.test(m[1]) ? { date: m[1] } : { day: Number(m[1]) };
      out.push({ ...u, from, to, label: m[4].trim() });
    }
    return { list: out };
  }
  const parseCountLocal = (raw) => C.parseCount(raw);
  const hoursToMin = (v) => { const t = String(v).trim().replace(',', '.'); if (t === '') return { value: null }; const n = Number(t); return Number.isFinite(n) && n >= 0 ? { value: Math.round(n * 60) } : { error: true }; };
  const minToHours = (m) => (m === null || m === undefined ? '' : String(Math.round((m / 60) * 100) / 100).replace('.', ','));

  function realizedFor(b) { return C.blockRealized(b, state.session, Date.now()); }


  const WARN = {
    LIMIT_REACHED: 'A carga planejada alcançou o limite semanal.',
    EXCESS: 'A carga planejada ULTRAPASSA o limite semanal.',
    PROJECTION_OVER_LIMIT: 'A projeção da semana ultrapassa o limite: reorganize ou transfira atividades.',
    BALANCE_WITHOUT_SLOTS: 'Há saldo de estudo, mas faltam horários livres para usá-lo.',
    PROJECTION_NO_SLOTS: 'Há blocos atrasados sem horário livre suficiente para o que falta estudar.',
  };
  function renderCapacity(c, monday) {
    const m = (x) => dur(x * C.MIN);
    const lim = c.limitMin === null;
    const ov = state.weekOverrides[monday] && state.weekOverrides[monday].limitMin !== undefined;
    const card = (l, v, bad) => `<div class="stat${bad ? ' bad' : ''}"><span class="muted">${l}</span><b>${v}</b></div>`;
    const over = c.excessMin > 0, pover = c.projectedExcessMin > 0;
    // principais: o que o estudante olha todo dia
    $('#capacity').innerHTML =
      card(`Limite semanal${ov ? ' (só esta semana)' : ''}`, lim ? 'sem limite' : m(c.limitMin)) +
      card('Planejado (estudo)', m(c.plannedNetMin)) +
      card(over ? 'Excesso de planejamento' : 'Ainda cabe', lim ? '—' : (over ? m(c.excessMin) : m(c.balanceMin)), over) +
      card('Estudado na semana', m(Math.round(c.realizedMin))) +
      (c.warnings.length ? `<div class="cap-warn">${c.warnings.map((w) => `⚠ ${esc(WARN[w])}`).join('<br>')}</div>` : '');
    // detalhes: ficam recolhidos para não poluir a tela
    const more = [card('Restante previsto', m(c.remainingMin)), card('Projeção da semana', m(Math.round(c.projectionMin)))];
    if (pover) more.push(card('Excesso projetado', m(Math.round(c.projectedExcessMin)), true));
    more.push(card('Livre na agenda (daqui p/ frente)', m(c.freeAgendaMin)));
    $('#capacity-more').innerHTML = more.join('');
  }

  /** Blocos que se sobrepõem ficam lado a lado (colunas) em vez de um cobrir o outro. */
  function layoutDay(blocks) {
    const items = blocks.map((b) => { const sp = C.blockSpan(b); return { id: b.id, s: sp.startMin, e: sp.endMin }; }).sort((a, b) => a.s - b.s || a.e - b.e);
    const out = {}; let group = [], groupEnd = -1;
    const flush = () => { const cols = Math.max(1, ...group.map((g) => g.col + 1)); group.forEach((g) => { out[g.id] = { col: g.col, cols }; }); group = []; };
    for (const it of items) {
      if (group.length && it.s >= groupEnd) { flush(); groupEnd = -1; }
      const used = new Set(group.filter((g) => g.e > it.s).map((g) => g.col)); let col = 0; while (used.has(col)) col++;
      group.push({ ...it, col }); groupEnd = Math.max(groupEnd, it.e);
    }
    if (group.length) flush();
    return out;
  }

  function renderCalendar() {
    const now = new Date(), nowMs = now.getTime();
    const days = [...Array(7)].map((_, i) => C.addDays(ui.weekStart, i));
    const iso = days.map(C.isoDate), todayIso = C.isoDate(now);
    const wb = state.blocks.filter((b) => iso.includes(b.date));
    const hStart = Math.min(6, ...wb.map((b) => Math.floor(C.toMin(b.start) / 60)));
    const conflicts = C.findConflicts(state.blocks.filter((b) => !b.pending), state.session, nowMs);
    $('#week-title').textContent = `${days[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    // Realizado atribuído ao dia em que a sessão INICIOU (mantém o estudo na semana em que ocorreu, mesmo se o bloco for transferido).
    const realByDate = {};
    const addReal = (ms, t) => { const d = C.isoDate(new Date(ms)); realByDate[d] = C.addTotals(realByDate[d] || C.zeroTotals(), t); };
    for (const b of state.blocks) for (const x of b.sessions) addReal(x.startedAt, x.totals);
    if (state.session) addReal(state.session.startedAt, C.liveTotals(state.session, nowMs));
    const sum = (list, dates) => {
      const a = list.reduce((acc, b) => { if (b.pending) return acc; const sp = C.blockSpan(b); acc.pStudy += sp.studyMin * C.MIN; acc.pRest += sp.restMin * C.MIN; return acc; }, { pStudy: 0, pRest: 0 });
      a.real = dates.reduce((t, d) => C.addTotals(t, realByDate[d] || C.zeroTotals()), C.zeroTotals());
      return a;
    };
    const week = sum(wb, iso);
    renderCapacity(K.capacityFor(state, iso[0], nowMs), iso[0]);
    $('#week-summary').innerHTML = [
      ['Planejado (estudo)', dur(week.pStudy)], ['Planejado (descanso)', dur(week.pRest)],
      ['Estudado (foco + extra)', dur(week.real.studyMs)], ['… dos quais extra', dur(week.real.extraMs)],
      ['Descanso realizado', dur(week.real.restMs)], ['Interrupções', dur(week.real.interruptMs)],
    ].map(([l, v]) => `<div class="stat"><span class="muted">${l}</span><b>${v}</b></div>`).join('');

    let html = '<div class="cal-grid"><div class="cal-head"></div>';
    days.forEach((d, i) => {
      const t = sum(wb.filter((b) => b.date === iso[i]), [iso[i]]);
      html += `<div class="cal-head${iso[i] === todayIso ? ' today' : ''}"><div class="dname">${DAYS[i]} ${d.getDate()}/${d.getMonth() + 1}${iso[i] === todayIso ? ' · hoje' : ''}</div>
        <div class="totals">Plan.: ${dur(t.pStudy)} + ${dur(t.pRest)} desc.<br>Estudado: ${dur(t.real.studyMs)} · desc. ${dur(t.real.restMs)}</div></div>`;
    });
    html += `<div class="gutter" style="height:${(24 - hStart) * HPX}px">${[...Array(24 - hStart)].map((_, i) => `<span style="top:${i * HPX}px">${C.pad(hStart + i)}:00</span>`).join('')}</div>`;
    days.forEach((d, i) => {
      html += `<div class="col${iso[i] === todayIso ? ' today' : ''}" data-date="${iso[i]}" data-hstart="${hStart}" style="height:${(24 - hStart) * HPX}px">`;
      const dayBlocks = wb.filter((x) => x.date === iso[i]), lay = layoutDay(dayBlocks);
      for (const b of dayBlocks) html += blockHtml(b, hStart, now, conflicts[b.id], lay[b.id]);
      if (iso[i] === todayIso) {
        const nm = now.getHours() * 60 + now.getMinutes();
        if (nm >= hStart * 60) html += `<div class="now-line" style="top:${((nm - hStart * 60) / 60) * HPX}px"></div>`;
      }
      html += '</div>';
    });
    $('#calendar').innerHTML = html + '</div>';
  }

  function blockHtml(b, hStart, now, conflict, lay) {
    const sp = C.blockSpan(b), st = C.blockStatus(b, now), pend = b.pending === true;
    const label = pend ? 'Pendente · conflito' : C.STATUS_LABEL[st];
    const active = state.session && state.session.blockId === b.id;
    const height = Math.max(30, (sp.totalMin / 60) * HPX - 2);
    const tip = [`${b.subject} — ${b.title}`, `${b.start}–${C.fromMin(sp.endMin)}`,
      `Estudo ${dur(sp.studyMin * C.MIN)} + descanso ${dur(sp.restMin * C.MIN)}`, `Situação: ${label}`, ...(pend ? ['Proposta pendente: o horário conflita com outro bloco. Clique para resolver.'] : []), ...(conflict || [])].join('\n');
    const L = lay || { col: 0, cols: 1 };
    return `<div class="block ${pend ? 'pending' : 'st-' + st}${conflict ? ' conflict' : ''}${active ? ' active' : ''}" draggable="true" data-id="${esc(b.id)}" title="${esc(tip)}"
      tabindex="0" role="button" aria-label="${esc(`${b.subject}, ${b.title}, ${b.start} às ${C.fromMin(sp.endMin)}, ${label}${conflict ? ', com conflito' : ''}`)}"
      style="top:${((sp.startMin - hStart * 60) / 60) * HPX}px;height:${height}px;left:calc(${(L.col / L.cols) * 100}% + 3px);right:auto;width:calc(${100 / L.cols}% - 6px)">
      <b>${esc(b.subject)} · ${esc(b.title)}</b>
      <span class="meta">${b.start}–${C.fromMin(sp.endMin)} · 🍅 ${b.estimated}</span>
      <span class="tag">${pend ? '⚠ ' : ''}${label}</span>${active ? ' <span class="tag run">● Em andamento</span>' : ''}${conflict ? ' <span class="tag warn">⚠ Conflito</span>' : ''}
    </div>`;
  }

  function bindCalendar() {
    const cal = $('#calendar');
    cal.addEventListener('keydown', (e) => {
      const blk = e.target.closest && e.target.closest('.block');
      if (blk && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openBlock(blk.dataset.id); }
    });
    cal.addEventListener('click', (e) => {
      const blk = e.target.closest('.block');
      if (blk) return openBlock(blk.dataset.id);
      const col = e.target.closest('.col');
      if (!col) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      const min = Number(col.dataset.hstart) * 60 + Math.floor((y / HPX) * 4) * 15;
      openBlockDialog({ date: col.dataset.date, start: C.fromMin(Math.min(min, 1425)) });
    });
    cal.addEventListener('dragstart', (e) => {
      const blk = e.target.closest('.block');
      if (!blk) return;
      ui.drag = { id: blk.dataset.id, grab: e.clientY - blk.getBoundingClientRect().top };
      e.dataTransfer.setData('text/plain', blk.dataset.id); e.dataTransfer.effectAllowed = 'move';
    });
    cal.addEventListener('dragover', (e) => {
      const col = e.target.closest('.col');
      if (col && ui.drag) { e.preventDefault(); col.classList.add('dragover'); }
    });
    cal.addEventListener('dragleave', (e) => { const col = e.target.closest('.col'); if (col) col.classList.remove('dragover'); });
    cal.addEventListener('dragend', () => { ui.drag = null; renderCalendar(); });
    cal.addEventListener('drop', (e) => {
      const col = e.target.closest('.col');
      if (!col || !ui.drag) return;
      e.preventDefault();
      const b = blockById(ui.drag.id);
      if (!b) { ui.drag = null; render(); return; }
      const total = C.blockSpan(b).totalMin;
      const y = e.clientY - col.getBoundingClientRect().top - ui.drag.grab;
      let min = Math.round((Number(col.dataset.hstart) * 60 + (y / HPX) * 60) / 15) * 15;
      min = Math.max(0, Math.min(min, 1440 - total));
      const nd = col.dataset.date, ns = C.fromMin(min);
      ui.drag = null;
      if (!confirmMove(b, nd, ns)) { renderCalendar(); return; }
      if (!CF.checkConflict(state, { ...b, date: nd, start: ns }, { ignoreId: b.id }).ok) { renderCalendar(); handleConflict({ block: b, data: { date: nd, start: ns } }); return; }
      b.date = nd; b.start = ns; b.pending = false; save(); renderCalendar();
    });
  }

  /** Arrastar também respeita conflito, bloco concluído e limite semanal (mesmas proteções do chat). */
  function confirmMove(b, date, start) {
    const draft = { ...b, date, start }, issues = [];
    if (b.completed) issues.push(`"${b.title}" já está concluído.`);
    if (b.fixed) issues.push(`"${b.title}" tem horário obrigatório.`);
    const wk = K.weekKey(date), now = Date.now();
    const before = K.capacityFor(state, wk, now), after = K.capacityFor({ ...state, blocks: state.blocks.map((o) => (o.id === b.id ? draft : o)) }, wk, now);
    if (after.excessMin > before.excessMin) issues.push(`A carga da semana passa a ultrapassar o limite em ${dur(after.excessMin * C.MIN)}.`);
    return !issues.length || confirm(`Mover "${b.title}" para ${date} ${start}?\n\n${issues.map((x) => '• ' + x).join('\n')}\n\nMover mesmo assim?`);
  }


  /* ---------- regra de conflito (Sprint 8): reserva total do bloco, foco e pausas ---------- */
  function openBlock(id) {
    const b = blockById(id);
    if (b && b.pending) return resolvePending(b);
    openBlockDialog({ id });
  }
  function resolvePending(b) {
    if (CF.checkConflict(state, b, { ignoreId: b.id }).ok) { openBlockDialog({ id: b.id }); return; } // sem conflito agora: "Salvar" confirma
    handleConflict({ block: b, data: {} });
  }
  /**
   * block = bloco existente (ou null para um bloco novo); data = campos propostos (ainda não gravados).
   * Novo bloco em conflito é guardado como PROPOSTA PENDENTE (laranja, ⚠, não confirmada). O bloco existente nunca é alterado.
   */
  function handleConflict({ block, data }) {
    let blk = block;
    if (!blk) { // bloco novo: vira proposta pendente
      blk = K.normalizeBlock({ id: uid(), completed: false, sessions: [], studied: '', questions: null, hits: null, notes: '', ...data, pending: true });
      state.blocks.push(blk); save(); render();
    } else if (blk.pending && Object.keys(data).length) { Object.assign(blk, data); save(); render(); }
    const isNew = !block, draft = { ...blk, ...data };
    const chk = CF.checkConflict(state, draft, { ignoreId: draft.id });
    if (chk.ok) { Object.assign(blk, data, { pending: false }); save(); render(); return; } // ninguém mais bloqueia: confirma
    const first = chk.conflicts[0], other = blockById(first.blockId), msg = CF.conflictMessage(first, other);
    const mv = CF.moveAfter(state, draft, first.blockId);
    const dlg = $('#dlg-conflict'); dlg.textContent = '';
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    let chosen = false;
    const body = mk('div', 'conflict-box');
    body.append(mk('h3', '', msg.title), ...msg.lines.map((l, i) => mk('p', i === msg.lines.length - 1 ? 'conflict-q' : '', l)));
    const actions = mk('div', 'conflict-actions');
    const bMove = mk('button', 'primary', `MOVER PARA DEPOIS DE ${msg.blockName.toUpperCase()}`); bMove.type = 'button';
    const bOther = mk('button', '', 'ESCOLHER OUTRO HORÁRIO'); bOther.type = 'button';
    actions.append(bMove, bOther); body.append(actions);
    if (mv.ok) bMove.title = `O bloco começaria às ${mv.start}, logo depois de "${msg.blockName}".`;
    else { bMove.disabled = true; body.append(mk('p', 'conflict-why', 'Esta opção está desabilitada: ' + mv.reason)); }
    dlg.append(body);
    bMove.onclick = () => {
      chosen = true; dlg.close();
      const again = CF.moveAfter(state, { ...blk, ...data }, first.blockId); // reconfere com o estado atual
      if (!again.ok) { handleConflict({ block: blk, data }); return; }
      Object.assign(blk, data, { date: again.date, start: again.start, pending: false }); save(); render();
      showNotice(`"${blk.title}" foi movido para ${again.start}, logo depois de "${msg.blockName}".`);
    };
    bOther.onclick = () => { chosen = true; dlg.close(); openBlockDialog({ id: blk.id, prefill: data }); }; // preserva o que já foi preenchido
    dlg.addEventListener('close', () => {
      if (chosen) return;
      showNotice(isNew || blk.pending
        ? `"${blk.title}" ficou como proposta pendente (laranja). Clique nele para resolver o conflito.`
        : `Alteração cancelada: "${blk.title}" continua onde estava.`);
    }, { once: true });
    dlg.showModal();
  }

  /* ---------- diálogo do bloco (cadastro, detalhes e execução) ---------- */
  const numVal = (v) => (v === '' ? NaN : Number(v));
  function sessionsHtml(b) {
    if (!b.sessions.length) return '<p class="muted">Nenhuma sessão registrada ainda.</p>';
    return '<ul>' + b.sessions.map((s) => {
      const t = s.totals, d = new Date(s.startedAt);
      return `<li>${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}: foco ${dur(t.focusMs)} + extra ${dur(t.extraMs)} = <b>${dur(t.studyMs)}</b>
        · descanso ${dur(t.restMs)} · interrupções ${dur(t.interruptMs)} · ${s.completedPomodoros} pomodoro(s)${s.partialCycles ? ` + ${s.partialCycles} parcial` : ''}</li>`;
    }).join('') + '</ul>';
  }

  function openBlockDialog({ id, date, start, prefill }) {
    const dlg = $('#dlg-block');
    const b = id ? blockById(id) : null;
    const v = b ? { ...b, ...(prefill || {}) } : { subject: '', title: '', date: date || C.isoDate(new Date()), start: start || '08:00', estimated: 1,
      config: { ...C.DEFAULT_CONFIG }, pdf: '', pages: '', studied: '', questions: null, hits: null, notes: '', completed: false, sessions: [],
      kind: 'estudo', reviewOf: null, priority: null, deadline: null, fixed: false, remainingMin: null, ...(prefill || {}) };
    const cfg = v.config;
    const st = b ? C.blockStatus(b, new Date()) : null;
    const active = b && state.session && state.session.blockId === b.id;
    const real = b ? realizedFor(b) : null, pom = b ? C.sessionsPomodoros(b.sessions) : null;
    const subjects = [...new Set(state.blocks.map((x) => x.subject))];
    dlg.innerHTML = `<form method="dialog" id="block-form" novalidate>
      <h3>${b ? 'Bloco de estudo' : 'Novo bloco de estudo'} ${b ? (b.pending ? '<span class="chip pend">⚠ Pendente</span>' : `<span class="chip st-${st}">${C.STATUS_LABEL[st]}</span>${active ? ' <span class="tag run">● Em andamento</span>' : ''}`) : ''}</h3>
      ${b && b.pending ? '<div class="errors">⚠ Proposta pendente: este horário conflita com outro bloco. Ajuste o dia/horário e salve para confirmar.</div>' : ''}
      <fieldset><legend>Planejamento</legend><div class="form-grid g2">
        <label>Matéria *<input name="subject" list="subjects" value="${esc(v.subject)}" required></label>
        <label>Assunto / título *<input name="title" value="${esc(v.title)}" required></label>
        <label>Prioridade<select name="priority"><option value="">Sem prioridade</option>${[['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']].map(([k, l]) => `<option value="${k}"${v.priority === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Tipo<select name="kind"><option value="estudo"${v.kind === 'estudo' ? ' selected' : ''}>Estudo</option><option value="revisao"${v.kind === 'revisao' ? ' selected' : ''}>Revisão</option></select></label>
        <label>Data *<input type="date" name="date" value="${esc(v.date)}" required></label>
        <label>Início *<input type="time" name="start" value="${esc(v.start)}" required></label>
      </div>
      <datalist id="subjects">${subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <details open class="pomo-box"><summary>🍅 Pomodoros deste bloco</summary><div class="form-grid g2" style="margin-top:8px">
        <label>Pomodoros estimados *<input type="number" name="estimated" min="1" step="1" value="${v.estimated}" required></label>
        <label>Foco (min)<input type="number" name="focusMin" min="1" step="1" value="${cfg.focusMin}"></label>
        <label>Pausa curta (min)<input type="number" name="shortMin" min="1" step="1" value="${cfg.shortMin}"></label>
        <label>Pomodoros até a pausa longa<input type="number" name="longEvery" min="1" step="1" value="${cfg.longEvery}"></label>
        <label>Pausa longa (min)<input type="number" name="longMin" min="1" step="1" value="${cfg.longMin}"></label>
      </div></details>
      <div class="preview" id="plan-preview"></div><div class="preview" id="cap-preview"></div></fieldset>
      ${b ? `<fieldset><legend>Execução</legend><div class="form-grid g2">
        <label class="wide">Link do material (PDF, aula…)<input name="pdf" value="${esc(v.pdf)}" placeholder="https://… ou nome do arquivo"></label>
        <label>Questões respondidas<input name="questions" inputmode="numeric" value="${esc(v.questions ?? '')}"></label>
        <label>Acertos<input name="hits" inputmode="numeric" value="${esc(v.hits ?? '')}"></label>
        <div class="field wide">Erros / Taxa de acerto<b id="res-calc"></b></div>
        <label class="wide">Observações (dificuldades, conteúdo pendente)<textarea name="notes" rows="3">${esc(v.notes)}</textarea></label></div>
        <div class="preview"><b>Realizado:</b> foco regular ${dur(real.focusMs)} + extra ${dur(real.extraMs)} = <b>${dur(real.studyMs)}</b> estudados
          · descanso ${dur(real.restMs)} · interrupções ${dur(real.interruptMs)}<br>
          Pomodoros completos: ${pom.complete} de ${v.estimated} estimados · ciclos parciais: ${pom.partial}</div>
        <details style="margin-top:8px"><summary>Sessões (${v.sessions.length})</summary>${sessionsHtml(b)}</details></fieldset>` : ''}
      <div class="errors" id="block-errors"></div>
      <div class="actions sticky">
        <div class="left">${b ? `<button type="button" id="b-timer" class="primary"${b.pending ? ' hidden' : ''}>${active ? '⏱ Abrir cronômetro' : (b.sessions.length ? '⏱ Retomar estudo (nova sessão)' : '⏱ Iniciar cronômetro')}</button>
          ${b.kind !== 'revisao' && !b.pending ? '<button type="button" id="b-review">＋ Agendar revisão</button>' : ''}
          <button type="button" id="b-toggle"${b.pending ? ' hidden' : ''}>${b.completed ? '↺ Reabrir bloco' : '✔ Marcar como concluído'}</button>
          <button type="button" id="b-delete" class="danger">Excluir</button>` : ''}</div>
        <button type="button" id="b-cancel">Fechar</button><button type="submit" class="primary">Salvar</button>
      </div></form>`;
    const form = $('#block-form', dlg);
    const read = (n) => (form.elements[n] ? form.elements[n].value : '');

    const gatherPlan = () => ({
      subject: read('subject').trim(), title: read('title').trim(), date: read('date'), start: read('start'),
      estimated: numVal(read('estimated')),
      config: { focusMin: numVal(read('focusMin')), shortMin: numVal(read('shortMin')), longEvery: numVal(read('longEvery')), longMin: numVal(read('longMin')) },
      kind: read('kind') || 'estudo', priority: read('priority') || null,
      ...(form.elements.pdf ? { pdf: read('pdf').trim() } : {}), // campos fora da tela (páginas, prazo, obrigatório, restante) são preservados
    });
    // Efeito do bloco sobre a capacidade da semana de destino (sem salvar nada).
    const capInfo = (data) => {
      if (C.validateBlockPlan(data).length) return null;
      const wk = K.weekKey(data.date), now = Date.now();
      const draft = b ? { ...b, ...data } : K.normalizeBlock({ id: '__novo', completed: false, sessions: [], ...data });
      const after = K.capacityFor({ ...state, blocks: b ? state.blocks.map((x) => (x.id === b.id ? draft : x)) : [...state.blocks, draft] }, wk, now);
      return { wk, after, before: K.capacityFor(state, wk, now) };
    };
    const guardCapacity = (data) => {
      const info = capInfo(data);
      if (!info || info.after.excessMin <= info.before.excessMin) return true;
      const opts = b ? [] : K.wouldFit(state, data, info.wk).options.map((o) => '• ' + o.text);
      if (!opts.length) opts.push('• Reduzir os pomodoros deste bloco.', '• Transferir este ou outro bloco para outra semana.', '• Excluir ou substituir um bloco menos prioritário.');
      return confirm(`Esta mudança faz a carga da semana ultrapassar o limite em ${dur(info.after.excessMin * C.MIN)}.\n\nAlternativas:\n${opts.join('\n')}\n\nDeseja ultrapassar o limite mesmo assim? (O limite NÃO será alterado.)`);
    };
    const refresh = () => {
      const p = gatherPlan(), errs = C.validateBlockPlan(p);
      const okCfg = !C.validateConfig(p.config).length && Number.isInteger(p.estimated) && p.estimated >= 1;
      if (okCfg) {
        const sp = C.planBlock(p.estimated, p.config), end = C.fromMin(C.toMin(p.start || '00:00') + sp.totalMin);
        $('#plan-preview', dlg).innerHTML = `Tempo previsto de estudo: <b>${dur(sp.studyMin * C.MIN)}</b> · descanso: <b>${dur(sp.restMin * C.MIN)}</b> ·
          duração reservada: <b>${dur(sp.totalMin * C.MIN)}</b> · término previsto: <b>${end}</b>`;
      } else $('#plan-preview', dlg).textContent = 'Preencha estimativa e pomodoro com inteiros positivos para ver os cálculos.';
      const ci = capInfo(p);
      if (ci) {
        const a = ci.after, lim = a.limitMin;
        $('#cap-preview', dlg).innerHTML = lim === null ? 'Semana sem limite definido.' :
          `Semana de ${C.parseDate(ci.wk).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}: carga <b>${dur(a.plannedNetMin * C.MIN)}</b> de <b>${dur(lim * C.MIN)}</b> → ` +
          (a.excessMin > 0 ? `<b style="color:var(--red)">excesso de ${dur(a.excessMin * C.MIN)}</b>` : `saldo <b>${dur(a.balanceMin * C.MIN)}</b>`) +
          (K.freeIntervals(state, p.date, b ? [b.id] : []).some((iv) => iv.startMin <= C.toMin(p.start) && iv.endMin >= C.toMin(p.start) + K.agendaMin({ ...p })) ? '' : '<br>⚠ Este horário está fora da disponibilidade ou ocupado.');
      } else $('#cap-preview', dlg).textContent = '';
      if (b) {
        const r = C.validateResult(read('questions'), read('hits'));
        const a = C.accuracy({ questions: r.questions, hits: r.hits });
        $('#res-calc', dlg).textContent = r.errors.length ? '—' : (a.kind === 'value' ? `${a.errors} erro(s) · ${a.label}` : a.label);
      }
      return errs;
    };
    // Valida e devolve os dados; null se houver erros (exibidos no diálogo).
    const collect = () => {
      const errs = refresh(), data = gatherPlan();
      if (b) {
        const r = C.validateResult(read('questions'), read('hits'));
        errs.push(...r.errors);
        Object.assign(data, { notes: read('notes').trim(), questions: r.questions, hits: r.hits });

      }
      $('#block-errors', dlg).innerHTML = errs.map((m) => `<div>${esc(m)}</div>`).join('');
      return errs.length ? null : data;
    };
    const commit = (data) => {
      if (b) {
        const cur = blockById(b.id); // o estado pode ter sido trocado por outra aba enquanto o diálogo estava aberto
        if (!cur) { alert('Este bloco foi excluído em outra aba; nada foi salvo.'); return false; }
        Object.assign(cur, data, { pending: false }); // salvar sem conflito confirma o bloco
      } else state.blocks.push(K.normalizeBlock({ id: uid(), completed: false, sessions: [], studied: '', questions: null, hits: null, notes: '', reviewOf: v.reviewOf || null, ...data }));
      save(); return true;
    };
    form.addEventListener('input', refresh);
    $('#b-cancel', dlg).onclick = () => dlg.close();
    // Regra de conflito: qualquer interseção (foco ou pausa) impede confirmar; abre o pop-up de resolução.
    const conflictOf = (d) => CF.checkConflict(state, { ...(b ? blockById(b.id) || b : {}), ...d, id: b ? b.id : '__novo' }, { ignoreId: b ? b.id : '__novo' });
    form.addEventListener('submit', (e) => {
      e.preventDefault(); const d = collect(); if (!d || !guardCapacity(d)) return;
      if (conflictOf(d).ok) { if (commit(d)) { dlg.close(); render(); } return; }
      dlg.close(); handleConflict({ block: b ? (blockById(b.id) || b) : null, data: d });
    });
    if (b) {
      $('#b-delete', dlg).onclick = () => {
        if (!confirm('Excluir este bloco e todo o seu histórico de sessões?')) return;
        if (active) state.session = null;
        state.blocks = state.blocks.filter((x) => x.id !== b.id); save(); dlg.close(); render();
      };
      $('#b-toggle', dlg).onclick = () => {
        const d = collect(); if (!d) return;
        const cur0 = blockById(b.id) || b;
        Object.assign(d, { completed: !cur0.completed, completedAt: cur0.completed ? null : Date.now() });
        commit(d); dlg.close(); render();
      };
      const rv = $('#b-review', dlg);
      if (rv) rv.onclick = () => {
        const d = collect(); if (!d) return;
        commit(d); dlg.close();
        const next = C.isoDate(C.addDays(C.parseDate(d.date), 7));
        openBlockDialog({ date: next, start: d.start, prefill: { kind: 'revisao', reviewOf: b.id, subject: d.subject, title: `Revisão: ${d.title}`, estimated: 1, pdf: d.pdf, priority: d.priority } });
      };
      $('#b-timer', dlg).onclick = () => {
        const d = collect(); if (!d || !guardCapacity(d)) return;
        if (!conflictOf(d).ok) { dlg.close(); handleConflict({ block: blockById(b.id) || b, data: d }); return; }
        commit(d); startTimer(b.id) && dlg.close(); render();
      };
    }
    refresh();
    dlg.showModal();
  }

  /* ---------- cronômetro ---------- */
  function startTimer(blockId) {
    unlockAudio();
    if (A.permission() === 'default') A.requestPermission(); // pede a permissão de notificação no primeiro cronômetro
    if (state.session) {
      if (state.session.blockId === blockId) { $('#timer').scrollIntoView({ block: 'end' }); return true; }
      const other = blockById(state.session.blockId);
      alert(`Já existe um cronômetro ativo no bloco "${other ? other.title : '?'}". Encerre-o antes de iniciar outro.`);
      return false;
    }
    const b = blockById(blockId);
    state.session = C.startSession(blockId, b.config, Date.now());
    save(); return true;
  }
  function timerAction(act) {
    const s = state.session; if (!s) return;
    const now = Date.now();
    unlockAudio(); silenceAlarm(); // qualquer ação sua no cronômetro silencia o alarme
    if (act === 'pause') C.pause(s, now);
    else if (act === 'resume') C.resume(s, now);
    else if (act === 'break') C.startBreak(s, now);
    else if (act === 'focus') C.startFocus(s, now);
    else if (act === 'open') return openBlockDialog({ id: s.blockId });
    else if (act === 'finish') {
      C.advance(s, now);
      const lt = C.liveTotals(s, now);
      if (!confirm(`Encerrar a sessão e salvar ${dur(lt.studyMs)} de estudo (${dur(lt.extraMs)} de tempo extra)?`)) return;
      const rec = C.finishSession(s, now), b = blockById(s.blockId);
      if (b && (rec.totals.studyMs > 0 || rec.totals.restMs > 0)) b.sessions.push(rec);
      state.session = null; $('#alert-banner').hidden = true; document.title = 'Estudy – Organização dos Estudos';
    }
    save(); handleAlert(); render();
  }
  function renderTimer() {
    const el = $('#timer'), s = state.session;
    if (!s) { el.hidden = true; ui.timerSig = ''; return; }
    const b = blockById(s.blockId);
    if (!b) { state.session = null; save(); el.hidden = true; return; }
    const now = Date.now(), sig = [s.id, s.phase, s.state].join('|');
    if (sig !== ui.timerSig) {
      ui.timerSig = sig;
      const brk = C.isBreak(s.phase), focusLike = !brk;
      const kind = C.nextBreakKind(s) === 'long' ? 'longa' : 'curta';
      const btn = (a, label, cls = '') => `<button data-act="${a}" class="${cls}">${label}</button>`;
      let buttons = '';
      if (s.state === 'awaiting') buttons = btn('focus', '▶ Iniciar foco', 'primary');
      else if (s.state === 'paused') buttons = btn('resume', '▶ Retomar', 'primary') + (focusLike ? btn('break', `☕ Pausa ${kind}`) : btn('focus', 'Iniciar foco'));
      else buttons = btn('pause', '⏸ Pausar') + (focusLike ? btn('break', `☕ Iniciar pausa ${kind}`) : btn('focus', 'Pular pausa e iniciar foco'));
      buttons += btn('finish', '⏹ Encerrar', 'danger') + btn('open', 'Bloco');
      el.className = `timer ${s.phase === 'extra' ? 'extra' : brk ? 'rest' : ''}`;
      el.setAttribute('aria-label', 'Cronômetro de estudo');
      el.innerHTML = `<div class="muted" id="t-block"></div><div class="phase" id="t-phase" role="status" aria-live="polite"></div><div class="clock" id="t-clock"></div>
        <div class="row">${buttons}</div><div class="info" id="t-info"></div>`;
      $('#t-block', el).textContent = `${b.subject} — ${b.title}`;
    }
    const el0 = C.elapsed(s, now), PH = { focus: 'Foco', extra: 'Tempo extra', short: 'Pausa curta', long: 'Pausa longa' };
    let label = PH[s.phase], clock;
    if (s.state === 'awaiting') { label = 'Pausa encerrada — aguardando você'; clock = '00:00'; }
    else if (s.phase === 'extra') clock = '+' + C.fmtClock(el0);
    else clock = C.fmtClock(C.phaseDuration(s) - el0);
    if (s.state === 'paused') label += ' (pausado)';
    const prev = C.sessionsPomodoros(b.sessions), lt = C.liveTotals(s, now), tot = C.blockRealized(b, s, now);
    $('#t-phase', el).textContent = label;
    $('#t-clock', el).textContent = clock;
    $('#t-info', el).innerHTML = `<span>🍅 Concluídos: <b>${prev.complete + s.completed}</b> de <b>${b.estimated}</b> estimados</span>
      <span>Estudo total no bloco: <b>${dur(tot.studyMs)}</b> (extra ${dur(tot.extraMs)})</span>
      <span>Nesta sessão: foco ${dur(lt.focusMs)} · extra ${dur(lt.extraMs)} · descanso ${dur(lt.restMs)} · interrupções ${dur(lt.interruptMs)}</span>`;
    el.hidden = false;
    document.title = `${clock} · ${label} – Estudy`;
  }

  /* ---------- configurações ---------- */
  function openSettings() {
    const dlg = $('#dlg-settings'), av = state.settings.availability, cl = state.settings.closing;
    dlg.innerHTML = `<form method="dialog" id="set-form" novalidate><h3>Configurações</h3>
      <fieldset><legend>Alarme e notificações</legend>
      <p class="muted">Quando o pomodoro ou a pausa acaba, o app toca o alarme, pisca o título da aba e mostra uma notificação no canto da tela.</p>
      <div class="form-grid"><label>Duração do alarme<select name="alarmSec">${[[10, '10 segundos'], [30, '30 segundos'], [60, '1 minuto'], [300, 'Até eu silenciar (máx. 5 min)']].map(([k, l]) => `<option value="${k}"${alarmSeconds() === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="field">Notificação no canto da tela<b id="notif-status"></b></div></div>
      <div class="actions" style="justify-content:flex-start"><button type="button" id="alarm-test">🔔 Testar alarme</button><button type="button" id="alarm-stop">🔕 Parar</button><button type="button" id="notif-enable">Ativar notificações</button></div>
      <p class="muted" id="notif-hint"></p></fieldset>
      <fieldset><legend>Limite semanal e disponibilidade (rotina padrão)</legend>
      <p class="muted">O limite conta só tempo de <b>estudo</b> (sem pausas). Não é meta de preenchimento. Exceções de uma semana ficam em "Semana" no calendário e não alteram esta rotina.</p>
      <div class="form-grid"><label>Limite semanal de estudo (horas líquidas; vazio = sem limite)<input name="limitH" inputmode="decimal" value="${minToHours(state.settings.weeklyLimitMin)}"></label>
        <label>Fechamento do relatório semanal<select name="closeDay">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}"${cl.day === d ? ' selected' : ''}>${WD[d]}</option>`).join('')}</select></label>
        <label>Horário do fechamento<input type="time" name="closeTime" value="${esc(cl.time)}"></label></div>
      <p class="muted" style="margin-top:10px">Faixas de estudo por dia (ex.: 08:00-12:00, 14:00-18:00). Vazio = dia indisponível.</p>
      <div class="form-grid">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label>${WD[d]}<input name="day${d}" placeholder="indisponível" value="${esc(fmtRanges(av.days[d]))}"></label>`).join('')}</div>
      <label class="field" style="margin-top:10px">Períodos indisponíveis (um por linha: "3 12:00-14:00 Almoço" repete toda quarta; "2026-10-15 09:00-10:00 Consulta" só naquele dia)
        <textarea name="unavail" rows="3">${esc(fmtUnavail(av.unavailable))}</textarea></label></fieldset>
      <div class="errors" id="set-errors"></div>
      <div class="actions"><div class="left"><button type="button" id="demo">Carregar dados de exemplo</button><button type="button" id="wipe" class="danger">Apagar todos os dados</button></div>
        <button type="button" id="set-cancel">Fechar</button><button type="submit" class="primary">Salvar</button></div></form>`;
    const f = $('#set-form', dlg);
    $('#set-cancel', dlg).onclick = () => dlg.close();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const errs = [];
      const lim = hoursToMin(f.elements.limitH.value); if (lim.error) errs.push('Limite semanal: informe horas (ex.: 20 ou 22,5) ou deixe vazio.');
      const days = {};
      for (let d = 1; d <= 7; d++) { const r = parseRanges(f.elements['day' + d].value, WD[d]); if (r.error) errs.push(r.error); else if (r.ranges.length) days[d] = r.ranges; }
      const un = parseUnavail(f.elements.unavail.value); if (un.error) errs.push(un.error);
      $('#set-errors', dlg).innerHTML = errs.map((m) => `<div>${esc(m)}</div>`).join('');
      if (errs.length) return;
      Object.assign(state.settings, { alarmSec: Number(f.elements.alarmSec.value), weeklyLimitMin: lim.value, availability: { days, unavailable: un.list }, closing: { day: Number(f.elements.closeDay.value), time: f.elements.closeTime.value || '21:00' } });
      save(); dlg.close(); render();
    });
    const notifStatus = () => {
      const p = A.permission(), t = { granted: 'Ativadas ✓', denied: 'Bloqueadas (libere nas configurações do navegador)', default: 'Ainda não ativadas', unsupported: 'Não suportadas neste navegador' }[p];
      $('#notif-status', dlg).textContent = t;
      $('#notif-hint', dlg).textContent = location.protocol === 'file:' ? 'Abrindo o arquivo direto do computador, alguns navegadores bloqueiam notificações. Se não aparecerem, avise o dono do projeto (o som e o título piscando continuam funcionando).' : '';
    };
    notifStatus();
    $('#alarm-test', dlg).onclick = () => { unlockAudio(); A.play('focus_end', 6); A.notify('Estudy · teste', 'Se você viu isto, as notificações estão funcionando.'); };
    $('#alarm-stop', dlg).onclick = silenceAlarm;
    $('#notif-enable', dlg).onclick = () => { A.requestPermission().then(notifStatus); };
    $('#demo', dlg).onclick = () => { loadDemo(); dlg.close(); render(); };
    $('#wipe', dlg).onclick = () => { if (confirm('Apagar blocos, sessões e configurações?')) { state = fresh(); save(); dlg.close(); render(); } };
    dlg.showModal();
  }

  /* ---------- exceção de uma semana (não altera a rotina padrão) ---------- */
  function openWeekDialog() {
    const dlg = $('#dlg-week'), monday = C.isoDate(ui.weekStart), eff = K.effectiveWeek(state, monday), base = state.settings.availability;
    const ov = state.weekOverrides[monday] || {};
    const title = `${ui.weekStart.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${C.addDays(ui.weekStart, 6).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`;
    dlg.innerHTML = `<form method="dialog" id="week-form" novalidate><h3>Semana ${title}</h3>
      <p class="muted">Ajustes só desta semana. A rotina padrão (em Configurações) <b>não</b> muda.</p>
      <div class="form-grid"><label>Limite desta semana (horas líquidas; vazio = usar o padrão${state.settings.weeklyLimitMin === null ? ': sem limite' : ': ' + minToHours(state.settings.weeklyLimitMin) + 'h'})
        <input name="limitH" inputmode="decimal" value="${ov.limitMin !== undefined ? minToHours(ov.limitMin) : ''}"></label></div>
      <p class="muted" style="margin-top:10px">Faixas de estudo por dia nesta semana (vazio = indisponível).</p>
      <div class="form-grid">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label>${WD[d]}<input name="day${d}" placeholder="indisponível" value="${esc(fmtRanges(eff.days[d]))}"></label>`).join('')}</div>
      <label class="field" style="margin-top:10px">Períodos indisponíveis só desta semana (um por linha)<textarea name="unavail" rows="3">${esc(fmtUnavail(ov.unavailable))}</textarea></label>
      <div class="errors" id="week-errors"></div>
      <div class="actions"><div class="left"><button type="button" id="week-reset" class="danger">Restaurar padrão desta semana</button></div>
        <button type="button" id="week-cancel">Fechar</button><button type="submit" class="primary">Salvar</button></div></form>`;
    const f = $('#week-form', dlg);
    $('#week-cancel', dlg).onclick = () => dlg.close();
    $('#week-reset', dlg).onclick = () => { delete state.weekOverrides[monday]; save(); dlg.close(); render(); };
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const errs = [], o = {};
      const lim = hoursToMin(f.elements.limitH.value);
      if (lim.error) errs.push('Limite: informe horas (ex.: 20 ou 22,5) ou deixe vazio.'); else if (lim.value !== null) o.limitMin = lim.value;
      const days = {};
      for (let d = 1; d <= 7; d++) {
        const r = parseRanges(f.elements['day' + d].value, WD[d]);
        if (r.error) { errs.push(r.error); continue; }
        if (fmtRanges(r.ranges) !== fmtRanges(base.days[d])) days[d] = r.ranges; // só guarda o que difere do padrão
      }
      if (Object.keys(days).length) o.days = days;
      const un = parseUnavail(f.elements.unavail.value); if (un.error) errs.push(un.error); else if (un.list.length) o.unavailable = un.list;
      $('#week-errors', dlg).innerHTML = errs.map((m) => `<div>${esc(m)}</div>`).join('');
      if (errs.length) return;
      if (Object.keys(o).length) state.weekOverrides[monday] = o; else delete state.weekOverrides[monday];
      save(); dlg.close(); render();
    });
    dlg.showModal();
  }
  function loadDemo() {
    const mon = ui.weekStart, M = C.MIN;
    const cfg = { focusMin: 50, shortMin: 10, longEvery: 4, longMin: 30 };
    const mk = (dayOff, start, subject, title, est, extra = {}) => ({ id: uid(), subject, title, date: C.isoDate(C.addDays(mon, dayOff)), start, estimated: est,
      config: { ...cfg }, pdf: '', pages: '', studied: '', questions: null, hits: null, notes: '', completed: false, sessions: [], ...extra });
    const sess = (focus, extra, rest, pomos, partial = 0) => ({ id: uid(), startedAt: mon.getTime() + 9 * 3600e3, endedAt: mon.getTime() + 12 * 3600e3, cfg: { ...cfg }, segments: [], cycles: [],
      totals: { focusMs: focus * M, extraMs: extra * M, restMs: rest * M, interruptMs: 0, studyMs: (focus + extra) * M }, completedPomodoros: pomos, partialCycles: partial });
    state.blocks.push(
      mk(0, '08:00', 'Direito Constitucional', 'Direitos fundamentais', 3, { completed: true, questions: 20, hits: 14, pdf: 'dc.pdf', pages: 'p. 10–35', sessions: [sess(150, 12, 20, 3)] }),
      mk(1, '14:00', 'Matemática', 'Porcentagem', 2, { questions: 15, sessions: [sess(60, 0, 10, 1, 1)] }),
      mk(2, '09:00', 'Português', 'Crase e regência', 2, { questions: 30, hits: 27, completed: true, sessions: [sess(100, 5, 10, 2)] }),
      mk(3, '19:00', 'Matemática', 'Razão e proporção', 3, { questions: 10, hits: 4, notes: 'Dificuldade em regra de três composta.' }),
      mk(4, '20:00', 'Direito Constitucional', 'Controle de constitucionalidade', 2),
    );
    state = K.normalizeState(state); save();
  }

  /* ---------- relatórios ---------- */
  const rate = (g) => (g.rate !== null ? g.rate.toFixed(1).replace('.', ',') + '%' : (g.pendingResults ? 'Resultado pendente' : 'Sem questões registradas'));
  function renderReports() {
    const sel = $('#f-subject'), cur = sel.value;
    sel.innerHTML = '<option value="">Todas</option>' + [...new Set(state.blocks.map((b) => b.subject))].sort().map((s) => `<option>${esc(s)}</option>`).join('');
    sel.value = cur; // sem atributo "selected": assim o botão Limpar volta para "Todas"
    const opts = { subject: sel.value, from: $('#f-from').value, to: $('#f-to').value, groupBy: $('#f-group').value };
    const now = new Date(), r = C.consolidate(state.blocks.filter((b) => !b.pending), opts, now, state.session);
    if (!r.blocks.length) { $('#report').innerHTML = '<p class="muted">Nenhum bloco encontrado para os filtros escolhidos.</p>'; return; }
    const lbl = opts.groupBy === 'week' ? (k) => `Semana de ${C.parseDate(k).toLocaleDateString('pt-BR')}` : (k) => k;
    const row = (g, label, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td>${g.blocks.length}</td><td>${dur(g.plannedStudyMin * C.MIN)}</td><td>${dur(g.plannedRestMin * C.MIN)}</td>
      <td>${dur(g.totals.studyMs)}</td><td>${dur(g.totals.focusMs)}</td><td>${dur(g.totals.extraMs)}</td><td>${dur(g.totals.restMs)}</td><td>${dur(g.totals.interruptMs)}</td>
      <td>${g.pomodoros.complete}/${g.pomodoros.partial}</td><td>${g.questions}</td><td>${g.hits}</td><td>${g.errors}</td><td>${rate(g)}</td>
      <td>${g.status.concluido}</td><td>${g.status.atrasado}</td><td>${g.status.em_dia}</td><td>${g.overrun}</td></tr>`;
    let html = `<div class="table-wrap"><table><thead><tr><th class="l">${opts.groupBy === 'week' ? 'Período' : 'Matéria'}</th><th>Blocos</th><th>Estudo previsto</th><th>Descanso previsto</th>
      <th>Estudado (total)</th><th>Foco regular</th><th>Tempo extra</th><th>Descanso real</th><th>Interrupções</th><th>Pomodoros (compl./parc.)</th>
      <th>Questões</th><th>Acertos</th><th>Erros</th><th>Taxa de acerto</th><th>Concluídos</th><th>Atrasados</th><th>Em dia</th><th>Acima do previsto</th></tr></thead><tbody>
      ${r.rows.map((g) => row(g, lbl(g.key))).join('')}${r.rows.length > 1 ? row(r.total, 'Total geral', 'total') : ''}</tbody></table></div>
      <p class="muted">Taxa de acerto = soma dos acertos ÷ soma das questões dos blocos com resultado preenchido (não é a média das taxas). Questões sem resultado: ${r.total.questions - r.total.questionsWithResult}.</p>`;
    // pontos de atenção
    const ranked = r.rows.filter((g) => g.rate !== null).sort((a, b) => a.rate - b.rate);
    const late = r.blocks.filter((b) => C.blockStatus(b, now) === 'atrasado');
    const notes = r.blocks.filter((b) => !b.completed && b.notes);
    html += '<h3>Pontos de atenção</h3><ul>' +
      (ranked.length > 1 ? `<li>Menor taxa de acerto: <b>${esc(lbl(ranked[0].key))}</b> (${rate(ranked[0])}).</li>` : '') +
      `<li>${r.total.overrun} bloco(s) com mais tempo estudado do que o previsto.</li><li>${late.length} bloco(s) atrasado(s) e não concluído(s).</li>` +
      notes.map((b) => `<li>Pendência em <b>${esc(b.subject)} – ${esc(b.title)}</b>: ${esc(b.notes)}</li>`).join('') + '</ul>';
    // blocos que compõem os resultados
    html += '<h3>Blocos do resultado</h3>' + r.rows.map((g) => `<details class="rep-blocks"><summary>${esc(lbl(g.key))} (${g.blocks.length})</summary><div class="table-wrap"><table>
      <thead><tr><th class="l">Dia</th><th class="l">Bloco</th><th>Situação</th><th>Previsto</th><th>Estudado</th><th>Extra</th><th>Questões</th><th>Acertos</th><th>Taxa</th></tr></thead><tbody>
      ${g.blocks.slice().sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1)).map((b) => {
        const sp = C.blockSpan(b), re = C.blockRealized(b, state.session, now.getTime()), a = C.accuracy(b), st = C.blockStatus(b, now);
        return `<tr><td class="l">${C.parseDate(b.date).toLocaleDateString('pt-BR')} ${b.start}</td><td class="l"><a href="#" data-open-block="${esc(b.id)}">${esc(b.subject)} – ${esc(b.title)}</a></td>
          <td><span class="chip st-${st}">${C.STATUS_LABEL[st]}</span></td><td>${dur(sp.studyMin * C.MIN)}</td><td>${dur(re.studyMs)}</td><td>${dur(re.extraMs)}</td>
          <td>${b.questions ?? '—'}</td><td>${b.hits ?? '—'}</td><td>${a.label}</td></tr>`;
      }).join('')}</tbody></table></div></details>`).join('');
    $('#report').innerHTML = html;
  }


  /* ---------- relatório semanal (requisito 11): só mostra e PROPÕE; não altera o calendário sozinho ---------- */
  const W = window.WeeklyReport || null;
  const pct = (r) => (r === null || r === undefined ? '—' : r.toFixed(1).replace('.', ',') + '%');
  /** Gera (uma vez) o relatório da semana fechada e avisa na aba e no chat. */
  function autoGenerateReport() {
    if (!W) return;
    const wk = W.shouldGenerate(state, Date.now());
    if (!wk) return;
    const rep = W.buildWeeklyReport(state, wk, Date.now());
    if (!rep.execution.planned && !rep.execution.studiedMin) return; // semana sem atividade: não gera relatório vazio
    state.reports = { ...state.reports, [wk]: rep };
    const msgs = ((state.chat || {}).messages || []).concat([{ role: 'system', at: Date.now(), text: `📊 O relatório da semana de ${C.parseDate(wk).toLocaleDateString('pt-BR')} está pronto: abra a aba "Relatório semanal" para ver o diagnóstico e as sugestões (nada foi alterado no calendário).` }]);
    state.chat = { messages: msgs.slice(-100) };
    save();
    $('#tab-weekly').textContent = 'Relatório semanal ●';
  }
  /** Planeja os comandos, mostra o que muda e só grava após confirmação. */
  function applyCommandsWithConfirm(commands, title, reason) {
    const plan = window.Commands.plan(state, commands, Date.now());
    if (plan.status === 'needs_clarification') {
      const q = (plan.questions || []).find((x) => x.options && x.options.length);
      if (q) { pickOption(q, title, reason); return; }
      alert('Preciso de mais informação:\n' + (plan.questions || []).map((x) => '• ' + x.text).join('\n'));
      return;
    }
    if (!plan.changes.length) { alert('Nada a alterar:\n' + ((plan.warnings || []).map((x) => '• ' + x.text).join('\n') || 'nenhuma alteração possível.')); return; }
    if (!confirm(`${title}${reason ? `\n\nMotivo: ${reason}` : ''}\n\nAlterações que serão feitas:\n${plan.changes.map((c) => '• ' + c.summary).join('\n')}\n\nAplicar no calendário?`)) return;
    const res = window.Commands.applyChanges(state, plan.changes, { source: 'chat', summary: title, nowMs: Date.now() });
    if (res.applied.length) { state = K.normalizeState(res.state); save(); render(); }
    alert(res.applied.length ? `${res.applied.length} alteração(ões) salva(s).${res.failed.length ? '\nNão aplicadas:\n' + res.failed.map((f) => '• ' + f.reason).join('\n') : ''}` : 'Nada foi alterado:\n' + res.failed.map((f) => '• ' + f.reason).join('\n'));
  }
  /** Quando há escolha a fazer (ex.: horário da revisão), mostra as opções como botões. */
  function pickOption(q, title, reason) {
    const dlg = $('#dlg-pick');
    dlg.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><p>${esc(q.text)}</p><div class="actions" style="justify-content:flex-start">${q.options.map((o, i) => `<button type="button" data-o="${i}" class="primary">${esc(o.label)}</button>`).join('')}</div>
      <div class="actions"><button type="button" id="pick-cancel">Cancelar</button></div></form>`;
    $('#pick-cancel', dlg).onclick = () => dlg.close();
    dlg.querySelectorAll('[data-o]').forEach((b) => { b.onclick = () => { const o = q.options[Number(b.dataset.o)]; dlg.close(); if (o.commands) applyCommandsWithConfirm(o.commands, title, reason); }; });
    dlg.showModal();
  }
  function applySuggestion(sg) { applyCommandsWithConfirm(sg.commands, sg.text, sg.reason); }
  function renderWeekly() {
    const el = $('#weekly'), sel = $('#w-week');
    if (!W) { el.textContent = 'Módulo de relatório indisponível.'; return; }
    const now = Date.now(), cur = K.weekKey(C.isoDate(new Date(now)));
    const weeks = [...new Set([...state.blocks.map((b) => b.originWeek || K.weekKey(b.date)), ...Object.keys(state.reports), C.isoDate(C.addDays(C.parseDate(cur), -7)), cur])].sort().reverse();
    const keep = sel.value && weeks.includes(sel.value) ? sel.value : (Object.keys(state.reports).sort().pop() || weeks.find((w) => w < cur) || cur);
    sel.innerHTML = weeks.map((w) => `<option value="${w}"${w === keep ? ' selected' : ''}>${C.parseDate(w).toLocaleDateString('pt-BR')} – ${C.addDays(C.parseDate(w), 6).toLocaleDateString('pt-BR')}${w === cur ? ' (atual)' : ''}</option>`).join('');
    const wk = sel.value, r = W.buildWeeklyReport(state, wk, now), ex = r.execution, f = (m) => dur(m * C.MIN);
    const saved = state.reports[wk];
    $('#w-meta').textContent = saved ? `Gerado em ${new Date(saved.generatedAt).toLocaleString('pt-BR')} · esta tela recalcula com os registros atuais` : 'Ainda não gerado automaticamente (a semana pode não ter fechado).';
    const li = (arr, fn) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${fn(x)}</li>`).join('')}</ul>` : '<p class="muted">Nada a registrar.</p>');
    const nw = r.nextWeek;
    el.innerHTML = `<h3>Execução da semana</h3><div class="summary">${[
      ['Blocos planejados', ex.planned], ['Concluídos', ex.done], ['Atrasados', ex.late], ['Em dia', ex.onTrack], ['Parcialmente realizados', ex.partial],
      ['Tempo planejado', f(ex.plannedMin)], ['Tempo estudado', f(ex.studiedMin)], ['… tempo extra', f(ex.extraMin)],
      ['Questões respondidas', `${ex.questions}${ex.questionsWithResult !== ex.questions ? ` (${ex.questionsWithResult} com resultado)` : ''}`], ['Acertos', ex.hits], ['Erros', ex.errors], ['Taxa de acerto', ex.rate === null ? 'Sem questões com resultado' : pct(ex.rate)],
    ].map(([l, v]) => `<div class="stat"><span class="muted">${l}</span><b>${v}</b></div>`).join('')}</div>
      ${ex.rescheduledOut.length ? `<p><b>Reagendados para outra semana (continuam contando como não realizados aqui):</b></p>${li(ex.rescheduledOut, (x) => esc(x.text || (x.title ? `${x.subject} — ${x.title}` : JSON.stringify(x))))}` : ''}
      ${ex.timeMetNotCompleted ? `<p class="muted">${ex.timeMetNotCompleted} bloco(s) cumpriram o tempo previsto, mas não foram concluídos.</p>` : ''}
      <h3>Forças e fraquezas</h3>
      <p><b>Pontos fortes</b></p>${li(r.strengths, (x) => esc(x.reason || x.text || x.subject))}
      <p><b>Pontos de atenção</b></p>${li(r.weaknesses, (x) => esc(x.reason || x.text || x.subject))}
      ${r.lowData.length ? `<p><b>Poucos dados para concluir</b></p>${li(r.lowData, (x) => esc(x.text))}` : ''}
      ${r.registeredDifficulties.length ? `<p><b>Dificuldades que você registrou</b></p>${li(r.registeredDifficulties, (x) => `<b>${esc(x.subject)} — ${esc(x.title)}:</b> ${esc(x.text)}`)}` : ''}
      ${r.estimationBias.length ? `<p><b>Estimado × realizado</b></p>${li(r.estimationBias, (x) => `${esc(x.subject)}: previsto ${f(x.avgPlannedMin)}, realizado ${f(x.avgRealMin)} (${x.n} bloco(s) concluído(s))${x.recurrentOverrun ? ' — estoura com frequência' : ''}`)}` : ''}
      <details><summary class="muted">Como ler este relatório</summary>${li(r.cautions, esc)}</details>
      <h3>Preparando a semana de ${C.parseDate(nw.week).toLocaleDateString('pt-BR')}</h3>
      <p>Já programado: <b>${nw.scheduled.length}</b> bloco(s)/revisão(ões). Capacidade: ${nw.capacity.limitMin === null ? 'sem limite' : `<b>${f(nw.capacity.plannedNetMin)}</b> de ${f(nw.capacity.limitMin)} comprometidos (saldo ${f(nw.capacity.balanceMin)})`}.</p>
      <p><b>Sugestões</b> <span class="muted">(são propostas; nada muda no calendário até você aplicar)</span></p>
      ${nw.suggestions.length ? nw.suggestions.map((sg, i) => `<div class="stat" style="margin-bottom:6px"><b>${esc(sg.text)}</b><br><span class="muted">Por quê: ${esc(sg.reason)}</span><br>
        <span class="muted">Impacto: ${sg.impact && sg.impact.netMin !== undefined ? `+${f(sg.impact.netMin)} de estudo` : ''}${sg.impact && sg.impact.balanceAfterMin !== undefined ? `, saldo da semana após aplicar: ${f(sg.impact.balanceAfterMin)}` : ''}</span><br>
        <button type="button" data-sg="${i}">Aplicar esta sugestão…</button></div>`).join('') : '<p class="muted">Sem sugestões.</p>'}
      ${nw.doesNotFit.length ? `<div class="unplaced"><b>Não cabe na semana seguinte:</b><br>${nw.doesNotFit.map((x) => '• ' + esc(x.reason || x.text)).join('<br>')}</div>` : ''}
      ${nw.note ? `<p class="muted">${esc(nw.note)}</p>` : ''}`;
    el.querySelectorAll('[data-sg]').forEach((b) => { b.onclick = () => applySuggestion(nw.suggestions[Number(b.dataset.sg)]); });
  }

  /* ---------- orquestração ---------- */
  function setView(v) {
    ui.view = v;
    $('#view-calendar').hidden = v !== 'calendar'; $('#view-reports').hidden = v !== 'reports'; $('#view-weekly').hidden = v !== 'weekly';
    if (v === 'weekly') $('#tab-weekly').textContent = 'Relatório semanal';
    document.querySelectorAll('[data-view]').forEach((t) => { t.classList.toggle('active', t.dataset.view === v); t.setAttribute('aria-pressed', String(t.dataset.view === v)); });
    render();
  }
  function render() {
    if (ui.view === 'calendar') renderCalendar(); else if (ui.view === 'weekly') renderWeekly(); else renderReports();
    renderTimer();
    document.body.classList.toggle('has-timer', !!state.session);
    if (chat) chat.refresh();
  }
  function tick() {
    const s = state.session;
    if (s && C.advance(s, Date.now())) { save(); handleAlert(); render(); return; }
    renderTimer();
    const key = Math.floor(Date.now() / (state.session ? 10000 : 60000)); // com cronômetro, o painel de capacidade acompanha a cada 10 s
    if (key !== ui.minuteKey && !ui.drag && !document.querySelector('dialog[open]')) { ui.minuteKey = key; render(); }
  }

  document.addEventListener('click', (e) => {
    unlockAudio();
    if (ui.soundNotice && !e.target.closest('#banner-close')) { ui.soundNotice = false; $('#alert-banner').hidden = true; }
    const a = e.target.closest('[data-act]'); if (a && a.closest('#timer')) timerAction(a.dataset.act);
    if (e.target.id === 'banner-silence') silenceAlarm();
    if (e.target.id === 'banner-close') { $('#alert-banner').hidden = true; silenceAlarm(); }
    const ob = e.target.closest('[data-open-block]'); if (ob) { e.preventDefault(); openBlockDialog({ id: ob.dataset.openBlock }); }
  });
  document.addEventListener('keydown', unlockAudio, { once: true });
  document.querySelectorAll('[data-view]').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  $('#btn-settings').addEventListener('click', openSettings);
  $('#prev-week').addEventListener('click', () => { ui.weekStart = C.addDays(ui.weekStart, -7); render(); });
  $('#next-week').addEventListener('click', () => { ui.weekStart = C.addDays(ui.weekStart, 7); render(); });
  $('#today-week').addEventListener('click', () => { ui.weekStart = C.mondayOf(new Date()); render(); });
  $('#new-block').addEventListener('click', () => openBlockDialog({}));
  $('#week-config').addEventListener('click', openWeekDialog);
  $('#gen-schedule').addEventListener('click', openScheduleDialog);
  $('#report-filters').addEventListener('input', renderReports);
  $('#w-week').addEventListener('change', renderWeekly);
  $('#w-refresh').addEventListener('click', () => { const wk = $('#w-week').value; if (W) { state.reports = { ...state.reports, [wk]: W.buildWeeklyReport(state, wk, Date.now()) }; save(); } renderWeekly(); });
  $('#f-clear').addEventListener('click', () => { $('#report-filters').reset(); renderReports(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); ui.timerSig = ''; render(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) A.stopFlash(); tick(); });

  /* ---------- gerar cronograma (requisito 08): propõe, deixa revisar e só grava após confirmar ---------- */
  function openScheduleDialog() {
    const dlg = $('#dlg-schedule'), monday = C.isoDate(ui.weekStart);
    const rowHtml = () => `<div class="sched-row">
      <label>Matéria *<input data-f="subject" list="subjects-s"></label><label>Assunto/atividade *<input data-f="title"></label>
      <label>Qtd. de blocos *<input data-f="blocks" type="number" min="1" step="1" value="1"></label><label>Pomodoros por bloco *<input data-f="pomodoros" type="number" min="1" step="1" value="2"></label>
      <label>Material (PDF/link)<input data-f="material"></label><label>Prazo<input data-f="deadline" type="date"></label>
      <label>Prioridade<select data-f="priority"><option value="">—</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>
      <label>Dia obrigatório<input data-f="fixedDate" type="date"></label><label>Hora obrigatória<input data-f="fixedStart" type="time"></label>
      <button type="button" class="rm danger">Remover</button></div>`;
    dlg.innerHTML = `<form method="dialog" id="sched-form" novalidate><h3>Gerar cronograma — semana de ${ui.weekStart.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</h3>
      <p class="muted">Informe o que precisa estudar. Uso a disponibilidade, o limite semanal e os blocos já agendados (que são preservados). Nada é gravado antes da sua confirmação.</p>
      <datalist id="subjects-s">${[...new Set(state.blocks.map((x) => x.subject))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <div id="sched-rows">${rowHtml()}</div>
      <div class="actions"><div class="left"><button type="button" id="sched-add">+ Mais um item</button></div><button type="button" id="sched-close">Fechar</button><button type="submit" class="primary">Gerar proposta</button></div>
      <div class="errors" id="sched-errors"></div><div class="sched-out" id="sched-out"></div></form>`;
    const rows = $('#sched-rows', dlg), out = $('#sched-out', dlg);
    $('#sched-add', dlg).onclick = () => rows.insertAdjacentHTML('beforeend', rowHtml());
    $('#sched-close', dlg).onclick = () => dlg.close();
    rows.addEventListener('click', (e) => { if (e.target.classList.contains('rm') && rows.children.length > 1) e.target.closest('.sched-row').remove(); });
    let proposal = null;

    const showProposal = (r) => {
      proposal = r;
      const f = (m) => dur(m * C.MIN), cb = r.capacity.before, ca = r.capacity.after;
      const capLine = ca.limitMin === null ? '' : `Carga da semana: ${f(cb.plannedNetMin)} → <b>${f(ca.plannedNetMin)}</b> de ${f(ca.limitMin)} (${ca.excessMin > 0 ? `<b style="color:var(--red)">excesso ${f(ca.excessMin)}</b>` : `saldo ${f(ca.balanceMin)}`}).`;
      out.innerHTML = `<h4>Proposta (${r.placements.length} bloco(s))</h4><p>${capLine}</p>
        ${r.placements.length ? `<div class="table-wrap"><table><thead><tr><th class="l">Usar</th><th class="l">Bloco</th><th>Dia</th><th>Início</th><th>Pomodoros</th><th class="l">Por quê</th></tr></thead><tbody>
          ${r.placements.map((p, i) => `<tr data-i="${i}"><td class="l"><input type="checkbox" data-k="use" checked></td><td class="l">${esc(p.subject)} · ${esc(p.title)}${p.fixed ? ' 🔒' : ''}</td>
            <td><input type="date" data-k="date" value="${p.date}"></td><td><input type="time" data-k="start" value="${p.start}"></td><td>${p.estimated}</td><td class="l muted" style="white-space:normal">${esc(p.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhum bloco coube.</p>'}
        ${r.unplaced.length ? `<div class="unplaced"><b>Não couberam (${r.unplaced.length}):</b><br>${r.unplaced.map((u) => `• ${esc((u.item && (u.item.title || u.item.subject)) || 'item')}${u.item && u.item.blockIndex ? ` (bloco ${u.item.blockIndex})` : ''} — ${esc(u.reason)}`).join('<br>')}</div>` : ''}
        ${(r.warnings || []).map((w) => `<div class="muted">⚠ ${esc(w.text || w)}</div>`).join('')}
        <div class="errors" id="sched-apply-errors"></div>
        <div class="actions"><span class="muted" style="margin-right:auto">Ajuste dia e hora se quiser; ao confirmar eu reverifico conflitos.</span>
          ${r.placements.length ? '<button type="button" id="sched-confirm" class="primary">Confirmar e gravar no calendário</button>' : ''}</div>`;
      const cf = $('#sched-confirm', out);
      if (cf) cf.onclick = confirmProposal;
    };
    function confirmProposal() {
      const errBox = $('#sched-apply-errors', out); errBox.innerHTML = '';
      const chosen = [...out.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector('[data-k=use]').checked).map((tr) => {
        const p = proposal.placements[Number(tr.dataset.i)];
        return { ...p, date: tr.querySelector('[data-k=date]').value, start: tr.querySelector('[data-k=start]').value };
      });
      if (!chosen.length) { errBox.textContent = 'Selecione ao menos um bloco.'; return; }
      const changes = chosen.map((p) => {
        const blk = K.normalizeBlock({ id: uid(), subject: p.subject, title: p.title, date: p.date, start: p.start, estimated: p.estimated, config: p.config, kind: p.kind || 'estudo',
          reviewOf: p.reviewOf || null, priority: p.priority || null, deadline: p.deadline || null, fixed: !!p.fixed, material: p.material || '', pdf: p.material || '',
          completed: false, sessions: [], source: 'scheduler', originWeek: K.weekKey(p.date) });
        return { op: 'create', id: blk.id, before: null, after: blk, summary: `Criar: ${blk.subject} · ${blk.title} em ${blk.date} ${blk.start}` };
      });
      // checa o efeito no limite antes de gravar (o limite nunca é alterado sozinho)
      const wk = K.weekKey(chosen[0].date);
      const hypo = K.capacityFor({ ...state, blocks: [...state.blocks, ...changes.map((c) => c.after)] }, wk, Date.now());
      if (hypo.excessMin > 0 && !confirm(`Com os seus ajustes a carga da semana ultrapassa o limite em ${dur(hypo.excessMin * C.MIN)}. Gravar mesmo assim? (O limite NÃO será alterado.)`)) return;
      const res = window.Commands.applyChanges(state, changes, { source: 'chat', summary: `Cronograma gerado: ${changes.length} bloco(s)`, nowMs: Date.now() });
      if (!res.applied.length) { errBox.innerHTML = res.failed.map((f) => `<div>${esc(f.reason)}</div>`).join(''); return; }
      state = K.normalizeState(res.state); save(); render(); if (chat) chat.refresh();
      alert(`${res.applied.length} bloco(s) gravado(s) no calendário.${res.failed.length ? '\n\nNão foi possível gravar:\n' + res.failed.map((f) => '• ' + f.reason).join('\n') : ''}\n\nO botão "Desfazer última alteração" do Assistente desfaz este cronograma.`);
      dlg.close();
    }
    $('#sched-form', dlg).addEventListener('submit', (e) => {
      e.preventDefault();
      const errs = [], items = [];
      [...rows.children].forEach((row, i) => {
        const g = (k) => row.querySelector(`[data-f=${k}]`).value.trim();
        const blocks = Number(g('blocks')), pom = Number(g('pomodoros'));
        if (!g('subject') || !g('title')) errs.push(`Item ${i + 1}: informe matéria e assunto.`);
        if (!Number.isInteger(blocks) || blocks < 1 || !Number.isInteger(pom) || pom < 1) errs.push(`Item ${i + 1}: blocos e pomodoros devem ser inteiros ≥ 1.`);
        if (g('fixedStart') && !g('fixedDate')) errs.push(`Item ${i + 1}: horário obrigatório precisa de um dia.`);
        items.push({ subject: g('subject'), title: g('title'), blocks, pomodoros: pom, material: g('material') || undefined, deadline: g('deadline') || undefined,
          priority: g('priority') || undefined, fixedDate: g('fixedDate') || undefined, fixedStart: g('fixedStart') || undefined });
      });
      $('#sched-errors', dlg).innerHTML = errs.map((m) => `<div>${esc(m)}</div>`).join('');
      if (errs.length) return;
      showProposal(window.Scheduler.proposeSchedule(state, { items, preserveExisting: true }, monday, Date.now()));
    });
    dlg.showModal();
  }

  /* ---------- assistente (chat): só interpreta; cálculos e gravação passam pelos módulos ---------- */
  let chat = null;
  let guide = null;
  function toggleGuide() {
    const dr = $('#guide-drawer'), open = dr.hidden;
    if (open && !$('#chat-drawer').hidden) toggleChat(); // um painel lateral por vez
    dr.hidden = !open; document.body.classList.toggle('chat-open', open);
    if (open && !guide && window.TestGuide) guide = window.TestGuide.mount(dr, { version: APP_VERSION });
  }
  function toggleChat() {
    if (!$('#guide-drawer').hidden) toggleGuide();
    const dr = $('#chat-drawer'), open = dr.hidden;
    dr.hidden = !open; document.body.classList.toggle('chat-open', open);
    if (open && !chat && window.Chat) {
      chat = window.Chat.mount(dr, {
        getState: () => state,
        setState: (ns) => { state = K.normalizeState(ns); save(); render(); },
        now: () => Date.now(),
      });
    }
  }
  $('#btn-chat').addEventListener('click', toggleChat);
  $('#btn-guide').addEventListener('click', toggleGuide);
  $('#app-version').textContent = APP_VERSION;
  /** Faixa de aviso reaproveitando #alert-banner. */
  function showNotice(text, soundHint) {
    const el = $('#alert-banner'); el.textContent = '';
    const sp = document.createElement('span'); sp.textContent = text;
    const bt = document.createElement('button'); bt.id = 'banner-close'; bt.textContent = 'Entendi';
    el.append(sp, bt); el.hidden = false; ui.soundNotice = !!soundHint;
  }
  if (loadNotice) showNotice(loadNotice);
  else if (state.quarantine && state.quarantine.length) showNotice(`${state.quarantine.length} bloco(s) com dados inválidos foram guardados à parte (não aparecem no calendário, mas não foram apagados).`);
  else if (state.session) showNotice('Há um cronômetro em andamento. Clique em qualquer lugar da página para ativar o som dos alertas.', true);
  autoGenerateReport();
  bindCalendar();
  render();
  handleAlert();
  /* Relógio em Web Worker: o navegador atrasa timers de abas escondidas (até 1×/min); o worker não, então o alarme dispara na hora. */
  (function startTicker() {
    try {
      const blob = new Blob(['setInterval(function(){postMessage(1)},500)'], { type: 'text/javascript' });
      const w = new Worker(URL.createObjectURL(blob)); w.onmessage = tick; return;
    } catch (e) { /* sem worker: usa timer comum */ }
    setInterval(tick, 500);
  })();
  window.addEventListener('focus', () => A.stopFlash());
})();
