/* Interface do MVP-ESTUDY: calendário semanal, bloco, cronômetro e relatórios. Dados em localStorage. */
(() => {
  'use strict';
  const C = window.Core;
  const K = window.Capacity;
  const KEY = 'estudy.mvp.v1';
  const HPX = 52; // altura de uma hora no calendário (deve coincidir com --hour no CSS)
  const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dur = C.fmtDur;

  /* ---------- estado e persistência ---------- */
  const fresh = () => K.normalizeState({ settings: { config: { ...C.DEFAULT_CONFIG } }, blocks: [], session: null });
  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY));
      if (r && Array.isArray(r.blocks)) {
        return K.normalizeState(r);
      }
    } catch (e) { /* storage indisponível ou corrompido */ }
    return fresh();
  }
  let state = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sem persistência */ } };
  const ui = { weekStart: C.mondayOf(new Date()), view: 'calendar', drag: null, minuteKey: '', timerSig: '' };
  const blockById = (id) => state.blocks.find((b) => b.id === id);

  /* ---------- áudio e avisos ---------- */
  let audio = null;
  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { /* sem áudio */ }
  }
  function beep(kind) {
    if (!audio) return;
    const notes = kind === 'focus_end' ? [880, 880, 880] : [523, 659, 784];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      const t = audio.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    });
  }
  const ALERT_TEXT = {
    focus_end: '⏰ Foco encerrado! O tempo extra já está sendo contado como estudo. Continue, pause, inicie a pausa ou encerre a sessão.',
    break_end: '☕ Pausa encerrada! O próximo foco só começa quando você clicar em "Iniciar foco".',
  };
  function showBanner(type) {
    const el = $('#alert-banner');
    el.innerHTML = `<span>${esc(ALERT_TEXT[type])}</span><button id="banner-close">Entendi</button>`;
    el.hidden = false;
  }
  function handleAlert() {
    const s = state.session;
    if (!s || s.alertSeq <= s.alertAck) return;
    s.alertAck = s.alertSeq; save();
    beep(s.alert); showBanner(s.alert);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Estudy', { body: ALERT_TEXT[s.alert] }); } catch (e) { /* ignora */ }
    }
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
    const cards = [
      [`Limite semanal${ov ? ' (exceção da semana)' : ''}`, lim ? 'sem limite' : m(c.limitMin)],
      ['Carga planejada (estudo líquido)', m(c.plannedNetMin)],
      [c.excessMin > 0 ? 'Excesso de planejamento' : 'Saldo para planejar', lim ? '—' : (c.excessMin > 0 ? m(c.excessMin) : m(c.balanceMin))],
      ['Estudado na semana', m(Math.round(c.realizedMin))],
      ['Restante previsto', m(c.remainingMin)],
      ['Projeção da semana', m(Math.round(c.projectionMin))],
      [c.projectedExcessMin > 0 ? 'Excesso projetado' : 'Margem disponível', lim ? '—' : (c.projectedExcessMin > 0 ? m(Math.round(c.projectedExcessMin)) : m(Math.round(c.marginMin)))],
      ['Livre na agenda (daqui p/ frente)', m(c.freeAgendaMin)],
    ];
    const bad = new Set(['Excesso de planejamento', 'Excesso projetado']);
    $('#capacity').innerHTML = cards.map(([l, v]) => `<div class="stat${bad.has(l) ? ' bad' : ''}"><span class="muted">${l}</span><b>${v}</b></div>`).join('') +
      (c.warnings.length ? `<div class="cap-warn">${c.warnings.map((w) => `⚠ ${esc(WARN[w])}`).join('<br>')}</div>` : '');
  }

  function renderCalendar() {
    const now = new Date(), nowMs = now.getTime();
    const days = [...Array(7)].map((_, i) => C.addDays(ui.weekStart, i));
    const iso = days.map(C.isoDate), todayIso = C.isoDate(now);
    const wb = state.blocks.filter((b) => iso.includes(b.date));
    const hStart = Math.min(6, ...wb.map((b) => Math.floor(C.toMin(b.start) / 60)));
    const conflicts = C.findConflicts(state.blocks, state.session, nowMs);
    $('#week-title').textContent = `${days[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    // Realizado atribuído ao dia em que a sessão INICIOU (mantém o estudo na semana em que ocorreu, mesmo se o bloco for transferido).
    const realByDate = {};
    const addReal = (ms, t) => { const d = C.isoDate(new Date(ms)); realByDate[d] = C.addTotals(realByDate[d] || C.zeroTotals(), t); };
    for (const b of state.blocks) for (const x of b.sessions) addReal(x.startedAt, x.totals);
    if (state.session) addReal(state.session.startedAt, C.liveTotals(state.session, nowMs));
    const sum = (list, dates) => {
      const a = list.reduce((acc, b) => { const sp = C.blockSpan(b); acc.pStudy += sp.studyMin * C.MIN; acc.pRest += sp.restMin * C.MIN; return acc; }, { pStudy: 0, pRest: 0 });
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
      for (const b of wb.filter((x) => x.date === iso[i])) html += blockHtml(b, hStart, now, conflicts[b.id]);
      if (iso[i] === todayIso) {
        const nm = now.getHours() * 60 + now.getMinutes();
        if (nm >= hStart * 60) html += `<div class="now-line" style="top:${((nm - hStart * 60) / 60) * HPX}px"></div>`;
      }
      html += '</div>';
    });
    $('#calendar').innerHTML = html + '</div>';
  }

  function blockHtml(b, hStart, now, conflict) {
    const sp = C.blockSpan(b), st = C.blockStatus(b, now);
    const active = state.session && state.session.blockId === b.id;
    const height = Math.max(30, (sp.totalMin / 60) * HPX - 2);
    const tip = [`${b.subject} — ${b.title}`, `${b.start}–${BC.endLabel(sp.endMin)}`,
      `Estudo ${dur(sp.studyMin * C.MIN)} + descanso ${dur(sp.restMin * C.MIN)}`, `Situação: ${C.STATUS_LABEL[st]}`, ...(conflict || [])].join('\n');
    return `<div class="block st-${st}${conflict ? ' conflict' : ''}${active ? ' active' : ''}" draggable="true" data-id="${b.id}" title="${esc(tip)}"
      style="top:${((sp.startMin - hStart * 60) / 60) * HPX}px;height:${height}px">
      <b>${esc(b.subject)} · ${esc(b.title)}</b>
      <span class="meta">${b.start}–${BC.endLabel(sp.endMin)} · 🍅 ${b.estimated}</span>
      <span class="tag">${C.STATUS_LABEL[st]}</span>${active ? ' <span class="tag run">● Em andamento</span>' : ''}${conflict ? ' <span class="tag warn">⚠ Conflito</span>' : ''}
    </div>`;
  }

  function bindCalendar() {
    const cal = $('#calendar');
    cal.addEventListener('click', (e) => {
      const blk = e.target.closest('.block');
      if (blk) return openBlockDialog({ id: blk.dataset.id });
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
      const b = blockById(ui.drag.id), total = C.blockSpan(b).totalMin;
      const y = e.clientY - col.getBoundingClientRect().top - ui.drag.grab;
      let min = Math.round((Number(col.dataset.hstart) * 60 + (y / HPX) * 60) / 15) * 15;
      min = Math.max(0, Math.min(min, 1440 - total));
      b.date = col.dataset.date; b.start = C.fromMin(min);
      ui.drag = null; save(); renderCalendar();
    });
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

  /* ---------- assistente de criação de bloco (3 etapas): 01 o quê e quando · 02 pomodoros · 03 conferir ---------- */
  const BC = window.BlockCheck;
  // Volta a configuração (pomodoro padrão + disponibilidade) para K.FACTORY_CONFIG. Blocos, sessões, limite semanal, fechamento e exceções de semana ficam como estão.
  function resetConfig() {
    if (!confirm('Isso substitui sua configuração atual. Continuar?')) return false;
    Object.assign(state.settings, K.factorySettings());
    save();
    return true;
  }
  const WIZ_STEPS = ['O quê e quando', 'Pomodoros', 'Conferir'];
  // Etapa em que cada campo mora (usado pelo botão "Corrigir" da etapa 03).
  const FIELD_STEP = { subject: 1, title: 1, date: 1, start: 1, kind: 1, priority: 1, deadline: 2, fixed: 1, estimated: 2, focusMin: 2, shortMin: 2, longEvery: 2, longMin: 2 };
  const AREAS = {
    estudo: { name: 'Estudos', group: 'Matéria', item: 'Assunto', newGroup: 'Nova matéria', newItem: 'Novo assunto', kinds: [['estudo', 'Estudo'], ['revisao', 'Revisão']] },
    trabalho: { name: 'Trabalho', group: 'Projeto', item: 'Tarefa', newGroup: 'Novo projeto', newItem: 'Nova tarefa', kinds: [['estudo', 'Execução'], ['revisao', 'Revisão']] },
  };
  const PRIORITIES = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];

  function openBlockWizard({ date, start, prefill }) {
    const dlg = $('#dlg-block'), c0 = state.settings.config;
    // Tudo o que foi preenchido fica aqui; voltar e avançar só trocam o que é mostrado.
    const w = { area: 'estudo', subject: '', title: '', pdf: '', pages: '', kind: 'estudo', priority: '', date: date || C.isoDate(new Date()), start: start || '08:00',
      deadline: '', fixed: false, estimated: 3, focusMin: c0.focusMin, shortMin: c0.shortMin, longEvery: c0.longEvery, longMin: c0.longMin, reviewOf: null, ...(prefill || {}) };
    w.priority = w.priority || ''; w.deadline = w.deadline || '';
    let step = 1, form = null;

    const pool = () => state.blocks.filter((x) => (x.area || 'estudo') === w.area);
    const subjectsOf = () => [...new Set(pool().map((x) => x.subject))].sort();
    const titlesOf = () => [...new Set(pool().filter((x) => x.subject === w.subject).map((x) => x.title))].sort();
    const draft = () => ({
      area: w.area, subject: w.subject.trim(), title: w.title.trim(), date: w.date, start: w.start, estimated: numVal(String(w.estimated)),
      pdf: w.pdf.trim(), pages: w.pages.trim(), kind: w.kind, priority: w.priority || null, deadline: w.deadline || null, fixed: !!w.fixed,
      config: { focusMin: numVal(String(w.focusMin)), shortMin: numVal(String(w.shortMin)), longEvery: numVal(String(w.longEvery)), longMin: numVal(String(w.longMin)) },
    });
    // Bloqueios e avisos da etapa 03 (regras em js/blockcheck.js; a do limite semanal precisa do estado do app).
    const findings = () => {
      const d = draft(), now = Date.now(), list = BC.checkBlock(state, d, now);
      if (!list.some((x) => x.level === 'block')) {
        const wk = K.weekKey(d.date), nb = K.normalizeBlock({ id: '__novo', completed: false, sessions: [], ...d });
        const after = K.capacityFor({ ...state, blocks: [...state.blocks, nb] }, wk, now), before = K.capacityFor(state, wk, now);
        if (after.excessMin > before.excessMin) list.push({ id: 'week-limit', level: 'warn', field: 'estimated', text: BC.TEXTS.weekLimit({ excessMin: after.excessMin }) });
      }
      return list;
    };

    // Lê o formulário da etapa atual para `w` (chamado antes de qualquer troca de etapa ou nova pintura).
    const pickRead = (name) => { const sel = form.elements[name + 'Sel'].value; w[name] = (sel === '__new' ? form.elements[name].value : sel).trim(); };
    const sync = () => {
      if (!form) return;
      if (step === 1) {
        w.area = form.elements.area.value; pickRead('subject'); pickRead('title');
        for (const k of ['kind', 'priority', 'date', 'start', 'pdf', 'pages']) if (form.elements[k]) w[k] = form.elements[k].value;
        w.fixed = form.elements.fixed.checked;
      } else if (step === 2) {
        for (const k of ['estimated', 'focusMin', 'shortMin', 'longEvery', 'longMin', 'deadline']) w[k] = form.elements[k].value;
      }
    };
    const pick = (name, label, newLabel, list, value) => {
      const isNew = !list.includes(value);
      return `<label>${label}<select name="${name}Sel">${list.map((o) => `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}
        <option value="__new"${isNew ? ' selected' : ''}>➕ ${newLabel}…</option></select></label>
        <label${isNew ? '' : ' hidden'}>${newLabel}<input name="${name}" value="${isNew ? esc(value) : ''}" autocomplete="off"></label>`;
    };
    const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${l}</option>`).join('');
    const num = (name, label) => `<label>${label}<input type="number" name="${name}" min="1" step="1" value="${esc(w[name])}"></label>`;
    const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;

    const body = () => {
      const A = AREAS[w.area];
      if (step === 1) return `<div class="form-grid">
        <label>Área<select name="area">${Object.entries(AREAS).map(([k, a]) => `<option value="${k}"${w.area === k ? ' selected' : ''}>${a.name}</option>`).join('')}</select></label>
        <span></span>
        ${pick('subject', A.group + ' *', A.newGroup, subjectsOf(), w.subject)}
        ${pick('title', A.item + ' *', A.newItem, titlesOf(), w.title)}
        ${w.area === 'estudo' ? `<label>PDF (nome ou link)<input name="pdf" value="${esc(w.pdf)}"></label><label>Páginas / trecho previsto<input name="pages" value="${esc(w.pages)}"></label>` : ''}
        <label>Tipo<select name="kind">${opt(A.kinds, w.kind)}</select></label>
        <label>Prioridade<select name="priority"><option value="">—</option>${opt(PRIORITIES, w.priority)}</select></label>
        <label>Dia *<input type="date" name="date" value="${esc(w.date)}"></label>
        <label>Início *<input type="time" name="start" value="${esc(w.start)}"></label>
        <label class="check"><input type="checkbox" name="fixed"${w.fixed ? ' checked' : ''}> Horário obrigatório (não mover automaticamente)</label>
      </div>`;
      if (step === 2) return `<p class="muted">Foco e pausas vêm do ⚙ Pomodoro padrão; pode ajustar só para este bloco.</p><div class="form-grid">
        ${num('estimated', 'Pomodoros *')}${num('focusMin', 'Foco (min)')}${num('shortMin', 'Pausa curta (min)')}
        ${num('longEvery', 'Pomodoros até a pausa longa')}${num('longMin', 'Pausa longa (min)')}
        <label>Prazo (opcional)<input type="date" name="deadline" value="${esc(w.deadline)}"></label>
      </div><div class="wz-cfgbtns"><button type="button" id="wz-use-default">Usar configuração padrão atual</button><button type="button" id="wz-reset">Redefinir configuração</button></div>
        <div class="preview" id="wz-preview"></div>`;
      const d = draft(), list = findings(), blocked = list.some((x) => x.level === 'block');
      const sp = !list.some((x) => /^empty-/.test(x.id)) ? C.planBlock(d.estimated, d.config) : null;
      const when = isNaN(C.parseDate(d.date)) ? '—' : `${C.parseDate(d.date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}, ${d.start}${sp ? `–${BC.endLabel(C.toMin(d.start) + sp.totalMin)}` : ''}`;
      return `<dl class="wz-sum">${row('Área', A.name)}${row(A.group, esc(d.subject) || '—')}${row(A.item, esc(d.title) || '—')}
        ${row('Tipo', esc((A.kinds.find(([k]) => k === d.kind) || [])[1]))}${row('Prioridade', esc((PRIORITIES.find(([k]) => k === d.priority) || [0, '—'])[1]))}
        ${row('Quando', esc(when))}${d.deadline ? row('Prazo', esc(d.deadline)) : ''}${d.fixed ? row('Horário', 'obrigatório') : ''}
        ${sp ? row('Pomodoros', `${d.estimated} × ${d.config.focusMin} min · estudo ${dur(sp.studyMin * C.MIN)} + pausas ${dur(sp.restMin * C.MIN)}`) : ''}</dl>
        <div aria-live="polite">${list.length ? `<ul class="wz-list">${list.map((x) => `<li class="wz-${x.level}"><span class="wz-ico" aria-hidden="true">${x.level === 'block' ? '⛔' : '⚠'}</span>
          <span><b class="wz-tag">${x.level === 'block' ? 'Corrigir para criar' : 'Aviso'}:</b> ${esc(x.text)}</span>
          <button type="button" data-fix="${x.field}">Corrigir</button></li>`).join('')}</ul>` : '<p class="wz-ok">✅ Tudo certo, nenhum aviso. É só criar!</p>'}</div>
        ${blocked ? '' : list.length ? '<p class="muted">Só avisos: você pode criar mesmo assim.</p>' : ''}`;
    };

    const focusField = (f) => {
      const el = f === 'subject' || f === 'title' ? (form.elements[f].closest('label').hidden ? form.elements[f + 'Sel'] : form.elements[f]) : form.elements[f];
      if (el) el.focus();
    };
    // Etapa 01: campo obrigatório vazio impede avançar e a mensagem aparece no próprio campo.
    const step1Ok = () => {
      sync();
      form.querySelectorAll('.field-err').forEach((x) => x.remove());
      const bad = BC.checkBlock(state, draft(), Date.now()).filter((x) => x.level === 'block' && /^empty-/.test(x.id) && ['subject', 'title', 'date', 'start'].includes(x.field));
      bad.forEach((x) => {
        const el = form.elements[x.field], ctl = el.closest('label').hidden ? form.elements[x.field + 'Sel'] : el, lab = ctl.closest('label');
        lab.insertAdjacentHTML('beforeend', `<span class="field-err" id="err-${x.field}" role="alert">${esc(x.text)}</span>`);
        ctl.setAttribute('aria-invalid', 'true'); ctl.setAttribute('aria-describedby', 'err-' + x.field);
      });
      if (bad.length) { const f = form.elements[bad[0].field]; (f.closest('label').hidden ? form.elements[bad[0].field + 'Sel'] : f).focus(); }
      return !bad.length;
    };
    const go = (n, field) => { sync(); step = n; paint(); if (field) focusField(field); };
    let created = false; // evita bloco duplicado em clique duplo
    const create = () => {
      if (created) return;
      sync();
      if (findings().some((x) => x.level === 'block')) return paint();
      created = true;
      state.blocks.push(K.normalizeBlock({ id: uid(), completed: false, sessions: [], studied: '', questions: null, hits: null, notes: '', reviewOf: w.reviewOf || null, ...draft() }));
      save(); dlg.close(); render();
    };
    function paint() {
      const blocked = step === 3 && findings().some((x) => x.level === 'block'), warned = step === 3 && !blocked && findings().length > 0;
      dlg.innerHTML = `<form method="dialog" id="wz-form" novalidate>
        <h3>Novo bloco</h3>
        <ol class="wz-steps">${WIZ_STEPS.map((t, i) => `<li${i + 1 === step ? ' class="on" aria-current="step"' : ''}><b>0${i + 1}</b> ${t}</li>`).join('')}</ol>
        ${body()}
        <div class="actions"><div class="left"><button type="button" id="wz-cancel">Cancelar</button></div>
          ${step > 1 ? '<button type="button" id="wz-back">← Voltar</button>' : ''}
          ${step < 3 ? '<button type="submit" class="primary">Avançar →</button>'
            : `<button type="submit" class="primary" id="wz-ok"${blocked ? ' disabled' : ''}>${warned ? 'Criar mesmo assim' : 'Criar bloco'}</button>`}</div></form>`;
      form = $('#wz-form', dlg);
      $('#wz-cancel', dlg).onclick = () => dlg.close();
      if (step > 1) $('#wz-back', dlg).onclick = () => go(step - 1);
      form.addEventListener('submit', (e) => { e.preventDefault(); if (step === 1 && !step1Ok()) return; if (step < 3) go(step + 1); else create(); });
      if (step === 1) form.addEventListener('change', (e) => {
        if (!['area', 'subjectSel', 'titleSel'].includes(e.target.name)) return;
        const n = e.target.name; sync(); paint(); form.elements[n].focus();
      });
      if (step === 2) {
        const prev = () => {
          sync(); const d = draft(), ok = !C.validateConfig(d.config).length && Number.isInteger(d.estimated) && d.estimated >= 1;
          const sp = ok && C.planBlock(d.estimated, d.config);
          $('#wz-preview', dlg).innerHTML = ok ? `Estudo: <b>${dur(sp.studyMin * C.MIN)}</b> · pausas: <b>${dur(sp.restMin * C.MIN)}</b> · reservado: <b>${dur(sp.totalMin * C.MIN)}</b>${isTimeOk(d.start) ? ` · término previsto: <b>${BC.endLabel(C.toMin(d.start) + sp.totalMin)}</b>` : ''}` : 'Preencha pomodoros e tempos com inteiros positivos para ver os cálculos.';
        };
        form.addEventListener('input', prev); prev();
        const fill = (c) => { for (const k of ['focusMin', 'shortMin', 'longEvery', 'longMin']) form.elements[k].value = c[k]; prev(); };
        $('#wz-use-default', dlg).onclick = () => fill(state.settings.config);
        $('#wz-reset', dlg).onclick = () => { if (resetConfig()) fill(state.settings.config); };
      }
      if (step === 1) form.addEventListener('input', (e) => { // limpa a mensagem do campo quando o usuário mexe nele
        const lab = e.target.closest('label'); if (!lab) return;
        lab.querySelectorAll('.field-err').forEach((x) => x.remove()); e.target.removeAttribute('aria-invalid');
      });
      if (step === 3) dlg.querySelectorAll('[data-fix]').forEach((btn) => { btn.onclick = () => go(FIELD_STEP[btn.dataset.fix], btn.dataset.fix); });
      if (!dlg.open) dlg.showModal();
    }
    const isTimeOk = (s) => /^\d{2}:\d{2}$/.test(s || '');
    paint();
  }

  function openBlockDialog({ id, date, start, prefill }) {
    if (!id) return openBlockWizard({ date, start, prefill }); // blocos novos: passo a passo; existentes: editor abaixo
    const dlg = $('#dlg-block');
    const b = id ? blockById(id) : null;
    const v = b || { subject: '', title: '', date: date || C.isoDate(new Date()), start: start || '08:00', estimated: 1,
      config: { ...state.settings.config }, pdf: '', pages: '', studied: '', questions: null, hits: null, notes: '', completed: false, sessions: [],
      kind: 'estudo', reviewOf: null, priority: null, deadline: null, fixed: false, remainingMin: null, ...(prefill || {}) };
    const cfg = v.config;
    const st = b ? C.blockStatus(b, new Date()) : null;
    const active = b && state.session && state.session.blockId === b.id;
    const real = b ? realizedFor(b) : null, pom = b ? C.sessionsPomodoros(b.sessions) : null;
    const A = AREAS[v.area] || AREAS.estudo, isWork = A === AREAS.trabalho; // bloco de Trabalho usa rótulos de Trabalho
    const wording = (m) => (isWork ? m.replace('Informe a matéria.', 'Informe o projeto.').replace('Informe o assunto ou título.', 'Informe a tarefa.') : m);
    const subjects = [...new Set(state.blocks.filter((x) => (x.area || 'estudo') === (v.area || 'estudo')).map((x) => x.subject))];
    dlg.innerHTML = `<form method="dialog" id="block-form" novalidate>
      <h3>${isWork ? 'Bloco de trabalho' : 'Bloco de estudo'} ${b ? `<span class="chip st-${st}">${C.STATUS_LABEL[st]}</span>${active ? ' <span class="tag run">● Em andamento</span>' : ''}` : ''}</h3>
      <fieldset><legend>Planejamento</legend><div class="form-grid">
        <label>${A.group} *<input name="subject" list="subjects" value="${esc(v.subject)}" required></label>
        <label>${isWork ? 'Tarefa' : 'Assunto / título'} *<input name="title" value="${esc(v.title)}" required></label>
        <label>Dia *<input type="date" name="date" value="${v.date}" required></label>
        <label>Início *<input type="time" name="start" value="${v.start}" required></label>
        <label>Pomodoros estimados *<input type="number" name="estimated" min="1" step="1" value="${v.estimated}" required></label>
        ${BC.materialFields(isWork, v, esc)}
        <label>Tipo<select name="kind">${A.kinds.map(([k, l]) => `<option value="${k}"${v.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Prioridade<select name="priority"><option value="">—</option>${[['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']].map(([k, l]) => `<option value="${k}"${v.priority === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Prazo (opcional)<input type="date" name="deadline" value="${v.deadline || ''}"></label>
        <label class="check"><input type="checkbox" name="fixed"${v.fixed ? ' checked' : ''}> Horário obrigatório (não mover automaticamente)</label>
        ${b ? `<label>Restante previsto (min de estudo)<input name="remaining" inputmode="numeric" placeholder="automático" value="${v.remainingMin ?? ''}"></label>` : ''}
      </div>
      <datalist id="subjects">${subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <details style="margin-top:8px"><summary>Pomodoro deste bloco (copiado do padrão; ajuste se precisar)</summary><div class="form-grid" style="margin-top:8px">
        <label>Foco (min)<input type="number" name="focusMin" min="1" step="1" value="${cfg.focusMin}"></label>
        <label>Pausa curta (min)<input type="number" name="shortMin" min="1" step="1" value="${cfg.shortMin}"></label>
        <label>Pomodoros até a pausa longa<input type="number" name="longEvery" min="1" step="1" value="${cfg.longEvery}"></label>
        <label>Pausa longa (min)<input type="number" name="longMin" min="1" step="1" value="${cfg.longMin}"></label>
        <div class="wide"><button type="button" id="use-default">Usar configuração padrão atual</button></div>
      </div></details>
      <div class="preview" id="plan-preview"></div><div class="preview" id="cap-preview"></div></fieldset>
      ${b ? `<fieldset><legend>Execução</legend><div class="form-grid">
        <label class="wide">Conteúdo / páginas efetivamente estudados<input name="studied" value="${esc(v.studied)}"></label>
        <label>Questões respondidas<input name="questions" inputmode="numeric" value="${v.questions ?? ''}"></label>
        <label>Acertos<input name="hits" inputmode="numeric" value="${v.hits ?? ''}"></label>
        <div class="field">Erros / Taxa de acerto<b id="res-calc"></b></div>
        <label class="wide">Observações (dificuldades, conteúdo pendente)<textarea name="notes" rows="3">${esc(v.notes)}</textarea></label></div>
        <div class="preview"><b>Realizado:</b> foco regular ${dur(real.focusMs)} + extra ${dur(real.extraMs)} = <b>${dur(real.studyMs)}</b> estudados
          · descanso ${dur(real.restMs)} · interrupções ${dur(real.interruptMs)}<br>
          Pomodoros completos: ${pom.complete} de ${v.estimated} estimados · ciclos parciais: ${pom.partial}</div>
        <details style="margin-top:8px"><summary>Sessões (${v.sessions.length})</summary>${sessionsHtml(b)}</details></fieldset>` : ''}
      <div class="errors" id="block-errors"></div><div class="warns" id="block-warns" aria-live="polite"></div>
      <div class="actions">
        <div class="left">${b ? `<button type="button" id="b-timer" class="primary">${active ? '⏱ Abrir cronômetro' : (b.sessions.length ? '⏱ Retomar estudo (nova sessão)' : '⏱ Iniciar cronômetro')}</button>
          ${b.kind !== 'revisao' ? '<button type="button" id="b-review">＋ Agendar revisão</button>' : ''}
          <button type="button" id="b-toggle">${b.completed ? '↺ Reabrir bloco' : '✔ Marcar como concluído'}</button>
          <button type="button" id="b-delete" class="danger">Excluir</button>` : ''}</div>
        <button type="button" id="b-cancel">Fechar</button><button type="submit" class="primary">Salvar</button>
      </div></form>`;
    const form = $('#block-form', dlg);
    const read = (n) => (form.elements[n] ? form.elements[n].value : '');

    const gatherPlan = () => ({
      subject: read('subject').trim(), title: read('title').trim(), date: read('date'), start: read('start'),
      estimated: numVal(read('estimated')), pdf: read('pdf').trim(), pages: read('pages').trim(),
      config: { focusMin: numVal(read('focusMin')), shortMin: numVal(read('shortMin')), longEvery: numVal(read('longEvery')), longMin: numVal(read('longMin')) },
      kind: read('kind') || 'estudo', priority: read('priority') || null, deadline: read('deadline') || null,
      fixed: !!(form.elements.fixed && form.elements.fixed.checked),
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
        const sp = C.planBlock(p.estimated, p.config), end = BC.endLabel(C.toMin(p.start || '00:00') + sp.totalMin);
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
      const errs = refresh().map(wording), data = gatherPlan();
      if (b) {
        const r = C.validateResult(read('questions'), read('hits'));
        errs.push(...r.errors);
        Object.assign(data, { studied: read('studied').trim(), notes: read('notes').trim(), questions: r.questions, hits: r.hits });
        const rm = parseCountLocal(read('remaining'));
        if (rm.error) errs.push('Restante previsto: use apenas números inteiros não negativos.'); else data.remainingMin = rm.value;
      }
      $('#block-errors', dlg).innerHTML = errs.map((m) => `<div>${esc(m)}</div>`).join('');
      return errs.length ? null : data;
    };
    // Regras de js/blockcheck.js também na edição: bloqueios recusam; avisos pedem um segundo clique (confirmação).
    let ackSig = '';
    const gate = (d) => {
      if (!b) return true;
      const found = BC.checkBlock(state, { ...d, area: b.area || 'estudo' }, Date.now(), { original: b });
      const hard = found.filter((x) => x.level === 'block'), soft = found.filter((x) => x.level === 'warn');
      $('#block-warns', dlg).innerHTML = hard.length ? '' : soft.map((x) => `<div>⚠ ${esc(x.text)}</div>`).join('') + (soft.length ? '<div>Clique de novo para salvar mesmo assim.</div>' : '');
      if (hard.length) { $('#block-errors', dlg).innerHTML = hard.map((x) => `<div>⛔ ${esc(x.text)}</div>`).join(''); return false; }
      const sig = soft.map((x) => x.id + x.text).join('|');
      if (sig && sig !== ackSig) { ackSig = sig; return false; }
      return true;
    };
    const collectChecked = () => { const d = collect(); return d && gate(d) ? d : null; };
    const commit = (data) => {
      if (b) Object.assign(b, data);
      else state.blocks.push(K.normalizeBlock({ id: uid(), completed: false, sessions: [], studied: '', questions: null, hits: null, notes: '', reviewOf: v.reviewOf || null, ...data }));
      save();
    };
    form.addEventListener('input', refresh);
    $('#use-default', dlg).onclick = () => { Object.entries(state.settings.config).forEach(([k, val]) => { form.elements[k].value = val; }); refresh(); };
    $('#b-cancel', dlg).onclick = () => dlg.close();
    form.addEventListener('submit', (e) => { e.preventDefault(); const d = collectChecked(); if (!d || !guardCapacity(d)) return; commit(d); dlg.close(); render(); });
    if (b) {
      $('#b-delete', dlg).onclick = () => {
        if (!confirm('Excluir este bloco e todo o seu histórico de sessões?')) return;
        if (active) state.session = null;
        state.blocks = state.blocks.filter((x) => x.id !== b.id); save(); dlg.close(); render();
      };
      $('#b-toggle', dlg).onclick = () => {
        const d = collectChecked(); if (!d) return;
        Object.assign(d, { completed: !b.completed, completedAt: b.completed ? null : Date.now() });
        commit(d); dlg.close(); render();
      };
      const rv = $('#b-review', dlg);
      if (rv) rv.onclick = () => {
        const d = collectChecked(); if (!d) return;
        commit(d); dlg.close();
        const next = C.isoDate(C.addDays(C.parseDate(d.date), 7));
        openBlockDialog({ date: next, start: d.start, prefill: { kind: 'revisao', reviewOf: b.id, subject: d.subject, title: `Revisão: ${d.title}`, estimated: 1, pdf: d.pdf, priority: d.priority, area: b.area || 'estudo' } });
      };
      $('#b-timer', dlg).onclick = () => {
        const d = collectChecked(); if (!d || !guardCapacity(d)) return;
        commit(d); startTimer(b.id) && dlg.close(); render();
      };
    }
    refresh();
    dlg.showModal();
  }

  /* ---------- cronômetro ---------- */
  function startTimer(blockId) {
    unlockAudio();
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* ignora */ } }
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
    unlockAudio();
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
      el.innerHTML = `<div class="muted" id="t-block"></div><div class="phase" id="t-phase"></div><div class="clock" id="t-clock"></div>
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
    const dlg = $('#dlg-settings'), c = state.settings.config, av = state.settings.availability, cl = state.settings.closing;
    dlg.innerHTML = `<form method="dialog" id="set-form" novalidate><h3>Configurações</h3>
      <fieldset><legend>Pomodoro padrão</legend>
      <p class="muted">Vale para novos blocos. Blocos e sessões já criados mantêm a configuração que tinham.</p>
      <div class="form-grid">
        <label>Foco (min)<input type="number" name="focusMin" min="1" step="1" value="${c.focusMin}"></label>
        <label>Pausa curta (min)<input type="number" name="shortMin" min="1" step="1" value="${c.shortMin}"></label>
        <label>Pomodoros até a pausa longa<input type="number" name="longEvery" min="1" step="1" value="${c.longEvery}"></label>
        <label>Pausa longa (min)<input type="number" name="longMin" min="1" step="1" value="${c.longMin}"></label>
        <div class="wide"><button type="button" id="set-reset-cfg">Redefinir configuração</button></div></div></fieldset>
      <fieldset><legend>Limite semanal e disponibilidade (rotina padrão)</legend>
      <p class="muted">O limite conta só tempo de <b>estudo</b> (sem pausas). Não é meta de preenchimento. Exceções de uma semana ficam em "Semana" no calendário e não alteram esta rotina.</p>
      <div class="form-grid"><label>Limite semanal de estudo (horas líquidas; vazio = sem limite)<input name="limitH" inputmode="decimal" value="${minToHours(state.settings.weeklyLimitMin)}"></label>
        <label>Fechamento do relatório semanal<select name="closeDay">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}"${cl.day === d ? ' selected' : ''}>${WD[d]}</option>`).join('')}</select></label>
        <label>Horário do fechamento<input type="time" name="closeTime" value="${cl.time}"></label></div>
      <p class="muted" style="margin-top:10px">Faixas de estudo por dia (ex.: 08:00-12:00, 14:00-18:00). Vazio = dia indisponível.</p>
      <div class="form-grid">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label>${WD[d]}<input name="day${d}" placeholder="indisponível" value="${esc(fmtRanges(av.days[d]))}"></label>`).join('')}</div>
      <label class="field" style="margin-top:10px">Períodos indisponíveis (um por linha: "3 12:00-14:00 Almoço" repete toda quarta; "2026-10-15 09:00-10:00 Consulta" só naquele dia)
        <textarea name="unavail" rows="3">${esc(fmtUnavail(av.unavailable))}</textarea></label></fieldset>
      <div class="errors" id="set-errors"></div>
      <div class="actions"><div class="left"><button type="button" id="demo">Carregar dados de exemplo</button><button type="button" id="wipe" class="danger">Apagar todos os dados</button></div>
        <button type="button" id="set-cancel">Fechar</button><button type="submit" class="primary">Salvar</button></div></form>`;
    const f = $('#set-form', dlg);
    $('#set-cancel', dlg).onclick = () => dlg.close();
    $('#set-reset-cfg', dlg).onclick = () => {
      if (!resetConfig()) return;
      for (const k of ['focusMin', 'shortMin', 'longEvery', 'longMin']) f.elements[k].value = state.settings.config[k];
      const av2 = state.settings.availability;
      for (let d = 1; d <= 7; d++) f.elements['day' + d].value = fmtRanges(av2.days[d]);
      f.elements.unavail.value = fmtUnavail(av2.unavailable);
    };
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const cfg = {}; ['focusMin', 'shortMin', 'longEvery', 'longMin'].forEach((k) => { cfg[k] = numVal(f.elements[k].value); });
      const errs = C.validateConfig(cfg);
      const lim = hoursToMin(f.elements.limitH.value); if (lim.error) errs.push('Limite semanal: informe horas (ex.: 20 ou 22,5) ou deixe vazio.');
      const days = {};
      for (let d = 1; d <= 7; d++) { const r = parseRanges(f.elements['day' + d].value, WD[d]); if (r.error) errs.push(r.error); else if (r.ranges.length) days[d] = r.ranges; }
      const un = parseUnavail(f.elements.unavail.value); if (un.error) errs.push(un.error);
      $('#set-errors', dlg).innerHTML = errs.map((m) => `<div>${esc(m)}</div>`).join('');
      if (errs.length) return;
      Object.assign(state.settings, { config: cfg, weeklyLimitMin: lim.value, availability: { days, unavailable: un.list }, closing: { day: Number(f.elements.closeDay.value), time: f.elements.closeTime.value || '21:00' } });
      save(); dlg.close(); render();
    });
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
    sel.innerHTML = '<option value="">Todas</option>' + [...new Set(state.blocks.map((b) => b.subject))].sort().map((s) => `<option${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');
    const opts = { subject: sel.value, from: $('#f-from').value, to: $('#f-to').value, groupBy: $('#f-group').value };
    const now = new Date(), r = C.consolidate(state.blocks, opts, now, state.session);
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
        return `<tr><td class="l">${C.parseDate(b.date).toLocaleDateString('pt-BR')} ${b.start}</td><td class="l"><a href="#" data-open-block="${b.id}">${esc(b.subject)} – ${esc(b.title)}</a></td>
          <td><span class="chip st-${st}">${C.STATUS_LABEL[st]}</span></td><td>${dur(sp.studyMin * C.MIN)}</td><td>${dur(re.studyMs)}</td><td>${dur(re.extraMs)}</td>
          <td>${b.questions ?? '—'}</td><td>${b.hits ?? '—'}</td><td>${a.label}</td></tr>`;
      }).join('')}</tbody></table></div></details>`).join('');
    $('#report').innerHTML = html;
  }

  /* ---------- orquestração ---------- */
  function setView(v) {
    ui.view = v;
    $('#view-calendar').hidden = v !== 'calendar'; $('#view-reports').hidden = v !== 'reports';
    document.querySelectorAll('[data-view]').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    render();
  }
  function render() {
    if (ui.view === 'calendar') renderCalendar(); else renderReports();
    renderTimer();
    document.body.classList.toggle('has-timer', !!state.session);
    if (chat) chat.refresh();
  }
  function tick() {
    const s = state.session;
    if (s && C.advance(s, Date.now())) { save(); handleAlert(); render(); return; }
    renderTimer();
    const key = new Date().toISOString().slice(0, 16);
    if (key !== ui.minuteKey && !ui.drag && !document.querySelector('dialog[open]')) { ui.minuteKey = key; render(); }
  }

  document.addEventListener('click', (e) => {
    unlockAudio();
    const a = e.target.closest('[data-act]'); if (a && a.closest('#timer')) timerAction(a.dataset.act);
    if (e.target.id === 'banner-close') $('#alert-banner').hidden = true;
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
  $('#f-clear').addEventListener('click', () => { $('#report-filters').reset(); renderReports(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); ui.timerSig = ''; render(); } });
  document.addEventListener('visibilitychange', tick);

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
  function toggleChat() {
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
  bindCalendar();
  render();
  handleAlert();
  setInterval(tick, 500);
})();
