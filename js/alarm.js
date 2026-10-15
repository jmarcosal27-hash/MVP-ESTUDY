/* Alarme do cronômetro: som forte e repetido (tipo despertador), notificação do sistema e título piscando.
 * Pensado para você perceber o fim do pomodoro mesmo com fone baixo, com outra aba aberta ou ouvindo outra coisa.
 * O som é agendado de uma vez na linha do tempo do Web Audio (não depende de timers, que o navegador atrasa em aba escondida). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.Alarm = factory(root);
})(typeof self !== 'undefined' ? self : this, function (win) {
  const DEFAULT_SECONDS = 300, MAX_SECONDS = 300; // padrão: toca até você silenciar (máx. 5 min)
  let ctx = null, master = null, nodes = [], stopTimer = null, flashTimer = null, originalTitle = null, active = null;

  /** Cria/retoma o áudio. Precisa de um gesto do usuário (clique) pela regra dos navegadores. */
  function unlock() {
    if (!win) return false;
    try {
      ctx = ctx || new (win.AudioContext || win.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx.state !== 'closed';
    } catch (e) { return false; }
  }
  const isReady = () => !!ctx && ctx.state === 'running';

  /**
   * Toca o alarme por `seconds` (0 = só uma vez). kind: 'focus_end' (bip-bip-bip-bip agudo e insistente)
   * ou 'break_end' (dó-mi-sol ascendente). Um único oscilador com volume e nota automatizados na linha do tempo do áudio:
   * leve mesmo para 5 minutos e não depende de timers. Devolve false se o navegador bloqueou o áudio.
   */
  function play(kind, seconds) {
    if (!unlock() || !ctx) return false;
    stop();
    const dur = Math.min(MAX_SECONDS, Math.max(0, seconds === undefined ? DEFAULT_SECONDS : seconds));
    const spec = kind === 'focus_end'
      ? { type: 'square', freqs: [1175, 1175, 1175, 1175], len: 0.14, gap: 0.09, gain: 0.55, period: 1.6 }
      : { type: 'triangle', freqs: [659, 880, 1175], len: 0.28, gap: 0.07, gain: 0.7, period: 2.2 };
    master = ctx.createGain(); master.gain.value = 0.95;
    const comp = ctx.createDynamicsCompressor(); // evita estourar e deixa o som mais "cheio"
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = spec.type; g.gain.value = 0.0001;
    osc.connect(g); g.connect(master); master.connect(comp); comp.connect(ctx.destination);
    nodes.push(osc, g, master, comp);
    const t0 = ctx.currentTime + 0.05, cycles = Math.max(1, Math.ceil(dur / spec.period));
    for (let c = 0; c < cycles; c++) {
      spec.freqs.forEach((f, i) => {
        const t = t0 + c * spec.period + i * (spec.len + spec.gap);
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(spec.gain, t + 0.01);
        g.gain.setValueAtTime(spec.gain, t + spec.len - 0.03);
        g.gain.linearRampToValueAtTime(0.0001, t + spec.len);
      });
    }
    const total = cycles * spec.period;
    osc.start(t0); osc.stop(t0 + total + 0.1);
    active = { kind, until: Date.now() + Math.max(total, 2) * 1000 };
    stopTimer = setTimeout(() => { active = null; }, Math.max(total, 2) * 1000 + 300);
    return true;
  }
  /** Silencia agora. */
  function stop() {
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    nodes.forEach((n) => { try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { /* já parado */ } });
    nodes = []; master = null; active = null;
  }
  const isPlaying = () => !!active && Date.now() < active.until;

  /* ---------- notificação do sistema ---------- */
  const supported = () => !!win && 'Notification' in win;
  const permission = () => (supported() ? win.Notification.permission : 'unsupported');
  /** Pede permissão (precisa ser chamado a partir de um clique). */
  function requestPermission() {
    if (!supported()) return Promise.resolve('unsupported');
    try {
      const r = win.Notification.requestPermission();
      return r && r.then ? r : Promise.resolve(win.Notification.permission);
    } catch (e) { return Promise.resolve(win.Notification.permission); }
  }
  /** Mostra a notificação no canto da tela. Fica até você clicar (requireInteraction). */
  function notify(title, body) {
    if (!supported() || win.Notification.permission !== 'granted') return false;
    try {
      const n = new win.Notification(title, { body, tag: 'estudy-alerta', renotify: true, requireInteraction: true, silent: true });
      n.onclick = () => { try { win.focus(); n.close(); } catch (e) { /* ignora */ } };
      if (win.navigator && win.navigator.vibrate) win.navigator.vibrate([300, 150, 300, 150, 300]);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- título da aba piscando (aparece na barra de abas mesmo sem som) ---------- */
  function flashTitle(text) {
    if (!win || !win.document) return;
    stopFlash();
    originalTitle = win.document.title.replace(/^⏰ .*? \| /, '');
    let on = false;
    flashTimer = setInterval(() => { on = !on; win.document.title = on ? `⏰ ${text} | ${originalTitle}` : originalTitle; }, 900);
  }
  function stopFlash() {
    if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
    if (win && win.document && originalTitle !== null) { win.document.title = originalTitle; originalTitle = null; }
  }
  const isFlashing = () => !!flashTimer;

  return { DEFAULT_SECONDS, MAX_SECONDS, unlock, isReady, play, stop, isPlaying, supported, permission, requestPermission, notify, flashTitle, stopFlash, isFlashing };
});
