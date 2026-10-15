/* Roteiro de teste dentro do app: marcar ✅/❌ item a item, anotar, e copiar o feedback pronto para o WhatsApp.
 * Os resultados ficam no navegador (localStorage), separados dos dados de estudo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TestGuide = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'estudy.teste.v1';

  /** Roteiro (sem o chat). Cada item: id, o que fazer e o que deve acontecer. */
  const PARTS = [
    { id: '1', title: 'Planejar a semana', items: [
      ['1.1', 'Clique num horário vazio de amanhã.', 'Abre o cadastro já com dia e hora.'],
      ['1.2', 'Crie "Redes · Camada de enlace" com 3 pomodoros (foco 50, pausa curta 10).', 'Prévia: estudo 2h30, descanso 20min, reservado 2h50 e o horário de término.'],
      ['1.3', 'Salve o bloco.', 'Aparece azul com o texto "Em dia".'],
      ['1.4', 'Arraste o bloco para outro dia/horário livre.', 'Move; o horário vai de 15 em 15 min.'],
      ['1.5', 'Crie outro bloco que comece NO MEIO do foco do primeiro.', 'Pop-up "Esse horário já está reservado". O bloco novo fica LARANJA com ⚠ (pendente) e não confirma. O primeiro não muda.'],
      ['1.6', 'Crie outro bloco que comece DENTRO DE UMA PAUSA do primeiro.', 'Pop-up "Opa! Essa pausa já tem dono ☕" com o horário e o tipo da pausa e o nome do bloco.'],
      ['1.7', 'No pop-up, clique "MOVER PARA DEPOIS DE …".', 'O bloco novo começa exatamente quando o outro termina, volta à cor normal e o alerta some.'],
      ['1.8', 'Provoque o conflito de novo e clique "ESCOLHER OUTRO HORÁRIO".', 'Abre o ajuste com tudo que você já preencheu; salvando num horário livre, confirma.'],
      ['1.9', 'Provoque o conflito e feche o pop-up (Esc) sem escolher.', 'O bloco continua laranja (pendente). Clicar nele reabre o pop-up.'],
      ['1.10', 'Crie um bloco que começa no minuto exato em que outro termina.', 'NÃO é conflito: cria normalmente.'],
      ['1.11', 'Ponha um bloco logo antes de outro, de modo que ele não caiba depois do existente (outro bloco no caminho).', 'O botão "MOVER PARA DEPOIS" fica desabilitado e explica o motivo.'],
      ['1.12', 'Edite um bloco para 4 pomodoros.', 'Duração e término mudam (sem pausa depois do último); se invadir o próximo, abre o pop-up.'],
      ['1.13', 'Tente um bloco às 23:00 com 3 pomodoros.', 'Recusa: passa da meia-noite.'],
      ['1.14', 'Navegue entre semanas e use "Hoje".', 'O dia atual fica destacado.'],
    ] },
    { id: '2', title: 'Estudar com o cronômetro', items: [
      ['2.1', 'Use um bloco com foco de 1 min. Abra-o e clique "Iniciar cronômetro".', 'Painel com contagem regressiva; o bloco mostra "Em andamento".'],
      ['2.2', 'Tente iniciar outro bloco.', 'Avisa que já existe um cronômetro ativo.'],
      ['2.3', 'Pause ~20 s e retome.', 'Continua de onde parou.'],
      ['2.4', 'Deixe o foco ZERAR (com outra aba aberta, fone baixo, etc.).', 'ALARME forte e repetido, notificação no canto da tela e título da aba piscando. A fase vira "Tempo extra" (+mm:ss) sem pedir confirmação e sem iniciar o descanso.'],
      ['2.5', 'Pause e retome no tempo extra.', 'Continua de onde parou.'],
      ['2.6', 'Aperte F5 com o cronômetro rodando.', 'A sessão continua.'],
      ['2.7', 'Clique "Iniciar pausa" e deixe acabar.', 'Alarme de fim de pausa; fica "aguardando você"; nada é contado até "Iniciar foco".'],
      ['2.8', 'Inicie outro foco e clique "Encerrar" antes de zerar.', 'Salva como ciclo parcial.'],
      ['2.9', 'Abra o bloco.', 'Mostra foco + extra = total, pomodoros completos e parciais. O bloco NÃO conclui sozinho.'],
      ['2.10', 'Com o cronômetro rodando, olhe a tela inteira.', 'MODO FOCO: o cronômetro ocupa a tela toda, com a etapa, a barra de progresso e o que vem depois.'],
      ['2.11', 'Tente clicar no calendário/menus e apertar Tab durante o foco, o tempo extra e a pausa.', 'Nada do calendário responde (nem pelo teclado). Só dá para Pausar/Retomar, iniciar pausa/foco, Tela cheia do navegador e Encerrar.'],
      ['2.12', 'Zere o foco com o modo foco ligado.', 'O alarme e o aviso aparecem POR CIMA da tela cheia (com "Silenciar alarme").'],
      ['2.13', 'Clique em "Encerrar" e confirme.', 'O modo foco acaba e o calendário volta a funcionar; o tempo é salvo no bloco.'],
      ['2.14', 'Aperte F5 no meio de um pomodoro.', 'Volta direto no modo foco, com a contagem certa.'],
    ] },
    { id: '3', title: 'Resultados (questões e acertos)', items: [
      ['3.1', '10 questões, acertos vazio.', '"Resultado pendente" (não 0%).'],
      ['3.2', 'Acertos = 0.', '10 erros e 0,0%.'],
      ['3.3', 'Acertos = 11.', 'Recusa (acertos > questões).'],
      ['3.4', 'Digite -1, 1,5 ou texto.', 'Recusa.'],
      ['3.5', 'Questões vazias.', '"Sem questões registradas".'],
      ['3.6', 'Acertos = 7 de 10.', '3 erros e 70,0%.'],
      ['3.7', 'Marcar como concluído / Reabrir.', 'Verde ao concluir; volta ao reabrir.'],
      ['3.8', 'Deixe um bloco passar do horário sem concluir.', 'Fica vermelho "Atrasado".'],
    ] },
    { id: '4', title: 'Relatórios', items: [
      ['4.1', 'Abra "Relatórios" (use "Carregar dados de exemplo" em Configurações se precisar).', 'Tabela por matéria com planejado, estudado, extra separado, questões, acertos, erros e taxa.'],
      ['4.2', 'Filtre por matéria e por período.', 'Os números mudam certo.'],
      ['4.3', 'Agrupe por Semana.', 'Uma linha por semana.'],
      ['4.4', 'Confira a taxa geral na mão.', 'Soma dos acertos ÷ soma das questões (não a média das taxas).'],
      ['4.5', 'Abra "Blocos do resultado" e clique num bloco.', 'Lista os blocos e abre o bloco.'],
    ] },
    { id: '5', title: 'Limite semanal e capacidade', items: [
      ['5.1', 'Em Configurações defina o limite (ex.: 4 h). Crie um bloco de 3 pomodoros de 50 min.', 'Carga 2h30 (só estudo), saldo 1h30; o bloco ocupa 2h50 na agenda.'],
      ['5.2', 'Crie um 2º bloco igual na mesma semana.', 'Avisa o excesso antes de salvar e mostra alternativas; só grava se você aceitar.'],
      ['5.3', 'Botão "Semana": limite de 10 h só para esta semana.', 'A semana seguinte continua com o limite padrão.'],
      ['5.4', 'Estude um pouco com o cronômetro.', '"Estudado" sobe; a projeção acompanha.'],
      ['5.5', 'Num bloco, clique "Agendar revisão".', 'Abre uma revisão ligada ao bloco, uma semana depois.'],
    ] },
    { id: '6', title: 'Gerar cronograma', items: [
      ['6.1', '"Gerar cronograma": Constitucional 2 blocos de 3 pomodoros; Redes 3 blocos de 2.', '5 blocos propostos, sem sobreposição, com o "por quê".'],
      ['6.2', 'Mude dia/hora de uma linha e confirme.', 'Grava com o seu ajuste.'],
      ['6.3', 'Antes de confirmar, olhe o calendário.', 'Nada foi gravado ainda.'],
      ['6.4', 'Peça mais do que cabe (ex.: 30 blocos).', 'Os que não couberam aparecem com o motivo.'],
    ] },
    { id: '7', title: 'Relatório semanal', items: [
      ['7.1', 'Aba "Relatório semanal" → "Atualizar relatório".', 'Execução da semana, forças/fraquezas e próxima semana.'],
      ['7.2', 'Matéria com poucas questões.', 'Vai para "Poucos dados" (não vira força/fraqueza).'],
      ['7.3', 'Matéria sem questões.', 'Nunca aparece como 0%.'],
      ['7.4', 'Clique "Aplicar esta sugestão…".', 'Pede confirmação antes de mudar o calendário.'],
    ] },
    { id: '8', title: 'Uso real (3 a 5 dias)', items: [
      ['8.1', 'Use o app no lugar da sua agenda, com pomodoros reais.', 'Anote cada atrito em "Nova observação".'],
    ] },
  ].map((p) => ({ ...p, items: p.items.map(([id, what, expect]) => ({ id, what, expect })) }));

  const allItems = () => PARTS.flatMap((p) => p.items.map((i) => ({ ...i, part: p.title })));
  const SEVERITY = { A: 'A (impede de usar)', B: 'B (atrapalha)', C: 'C (incômodo ou ideia)' };

  /** Estado: { items: {id: {r:'ok'|'fail'|null, note, sev}}, notes:[{id, where, text, sev, at}] } */
  const emptyState = () => ({ items: {}, notes: [] });
  function summarize(st) {
    const all = allItems(); let ok = 0, fail = 0;
    for (const i of all) { const r = (st.items[i.id] || {}).r; if (r === 'ok') ok++; else if (r === 'fail') fail++; }
    return { total: all.length, ok, fail, pending: all.length - ok - fail, notes: st.notes.length };
  }

  /** Texto do feedback, em formato que o WhatsApp mostra bem (sem tabelas). */
  function buildReport(st, meta) {
    const s = summarize(st), out = [];
    out.push('*FEEDBACK DO TESTE - ESTUDY* 📚');
    if (meta && meta.version) out.push(`Versão testada: ${meta.version}`);
    if (meta && meta.when) out.push(`Data: ${meta.when}`);
    out.push(`Resultado: ✅ ${s.ok} funcionaram · ❌ ${s.fail} com problema · ⏳ ${s.pending} não testados`);
    const fails = allItems().filter((i) => (st.items[i.id] || {}).r === 'fail');
    if (fails.length) {
      out.push('', '*ITENS COM PROBLEMA*');
      for (const i of fails) {
        const it = st.items[i.id];
        out.push(`❌ ${i.id} (${i.part}) - ${i.what}`);
        out.push(`   Esperado: ${i.expect}`);
        if (it.note) out.push(`   O que aconteceu: ${it.note}`);
        if (it.sev) out.push(`   Gravidade: ${SEVERITY[it.sev] || it.sev}`);
      }
    }
    const withNote = allItems().filter((i) => (st.items[i.id] || {}).r === 'ok' && (st.items[i.id] || {}).note);
    if (withNote.length) {
      out.push('', '*COMENTÁRIOS EM ITENS QUE FUNCIONARAM*');
      for (const i of withNote) out.push(`✅ ${i.id} - ${st.items[i.id].note}`);
    }
    if (st.notes.length) {
      out.push('', '*OBSERVAÇÕES LIVRES*');
      st.notes.forEach((n, k) => {
        out.push(`${k + 1}) ${n.where ? `[${n.where}] ` : ''}${n.text}${n.sev ? ` (Gravidade ${n.sev})` : ''}`);
      });
    }
    return out.join('\n');
  }

  /* ---------- interface ---------- */
  function mount(el, opts) {
    const doc = el.ownerDocument, meta = opts || {};
    let st = emptyState();
    try { const raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.items && Array.isArray(raw.notes)) st = raw; } catch (e) { /* sem dados salvos */ }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* sem persistência */ } };
    const h = (tag, attrs, ...kids) => {
      const n = doc.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v);
      }
      kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : doc.createTextNode(String(c))); });
      return n;
    };
    const stamp = () => meta.version ? `Versão ${meta.version}` : '';

    function render() {
      const s = summarize(st), pct = Math.round(((s.ok + s.fail) / s.total) * 100);
      const root = h('div', { class: 'tg' },
        h('div', { class: 'tg-head' }, h('b', {}, '🧪 Roteiro de teste'), h('span', { class: 'muted' }, stamp())),
        h('div', { class: 'tg-progress', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { class: 'tg-bar', style: `width:${pct}%` })),
        h('div', { class: 'tg-sum' }, `✅ ${s.ok}  ❌ ${s.fail}  ⏳ ${s.pending}  📝 ${s.notes}`),
        h('div', { class: 'tg-actions' },
          h('button', { class: 'primary', type: 'button', onclick: copy }, '📋 Copiar feedback (WhatsApp)'),
          h('button', { type: 'button', onclick: download }, '⬇ Baixar .txt')),
        h('div', { class: 'tg-copied', id: 'tg-copied', 'aria-live': 'polite' }));
      for (const p of PARTS) {
        const done = p.items.filter((i) => (st.items[i.id] || {}).r).length;
        const det = h('details', { class: 'tg-part', open: p.items.some((i) => !(st.items[i.id] || {}).r) && p.id === openPart() ? '' : null },
          h('summary', {}, `${p.id}. ${p.title} `, h('span', { class: 'muted' }, `(${done}/${p.items.length})`)));
        for (const i of p.items) det.append(itemEl(i));
        root.append(det);
      }
      root.append(noteForm());
      el.replaceChildren(root);
    }
    const openPart = () => { const p = PARTS.find((x) => x.items.some((i) => !(st.items[i.id] || {}).r)); return p ? p.id : ''; };

    function itemEl(i) {
      const cur = st.items[i.id] || { r: null, note: '', sev: '' };
      const set = (r) => { st.items[i.id] = { ...cur, r: cur.r === r ? null : r }; save(); render(); };
      const wrap = h('div', { class: `tg-item ${cur.r || ''}` },
        h('div', { class: 'tg-what' }, h('b', {}, i.id + ' '), i.what),
        h('div', { class: 'tg-expect muted' }, 'Esperado: ' + i.expect),
        h('div', { class: 'tg-btns' },
          h('button', { type: 'button', class: cur.r === 'ok' ? 'on-ok' : '', 'aria-pressed': String(cur.r === 'ok'), onclick: () => set('ok') }, '✅ Funcionou'),
          h('button', { type: 'button', class: cur.r === 'fail' ? 'on-fail' : '', 'aria-pressed': String(cur.r === 'fail'), onclick: () => set('fail') }, '❌ Problema')));
      if (cur.r) {
        const note = h('textarea', { rows: '2', placeholder: cur.r === 'fail' ? 'O que aconteceu? (o que você viu)' : 'Comentário (opcional)', 'aria-label': `Nota do item ${i.id}` });
        note.value = cur.note || '';
        note.addEventListener('change', () => { st.items[i.id] = { ...(st.items[i.id] || cur), note: note.value.trim() }; save(); });
        wrap.append(note);
        if (cur.r === 'fail') {
          const sev = h('select', { 'aria-label': `Gravidade do item ${i.id}` }, h('option', { value: '' }, 'Gravidade…'), ...Object.entries(SEVERITY).map(([k, v]) => h('option', { value: k }, v)));
          sev.value = cur.sev || '';
          sev.addEventListener('change', () => { st.items[i.id] = { ...(st.items[i.id] || cur), sev: sev.value }; save(); });
          wrap.append(sev);
        }
      }
      return wrap;
    }

    function noteForm() {
      const where = h('input', { placeholder: 'Onde? (tela/parte)', 'aria-label': 'Onde' });
      const text = h('textarea', { rows: '3', placeholder: 'O que aconteceu, faltou ou te incomodou?', 'aria-label': 'Observação' });
      const sev = h('select', { 'aria-label': 'Gravidade' }, h('option', { value: '' }, 'Gravidade…'), ...Object.entries(SEVERITY).map(([k, v]) => h('option', { value: k }, v)));
      const list = h('div', { class: 'tg-notes' }, st.notes.map((n, k) => h('div', { class: 'tg-note' },
        h('span', {}, `${n.where ? `[${n.where}] ` : ''}${n.text}${n.sev ? ` (${n.sev})` : ''}`),
        h('button', { type: 'button', 'aria-label': 'Remover observação', onclick: () => { st.notes.splice(k, 1); save(); render(); } }, '✕'))));
      return h('details', { class: 'tg-part', open: st.notes.length ? '' : null },
        h('summary', {}, '📝 Nova observação livre ', h('span', { class: 'muted' }, `(${st.notes.length})`)),
        where, text, sev,
        h('button', { type: 'button', onclick: () => {
          if (!text.value.trim()) return;
          st.notes.push({ where: where.value.trim(), text: text.value.trim(), sev: sev.value, at: Date.now() }); save(); render();
        } }, 'Adicionar'), list);
    }

    const reportText = () => buildReport(st, { version: meta.version, when: new Date().toLocaleString('pt-BR') });
    function say(msg) { const c = el.querySelector('#tg-copied'); if (c) c.textContent = msg; }
    function copy() {
      const t = reportText();
      const fallback = () => {
        const ta = doc.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; doc.body.append(ta); ta.select();
        let ok = false; try { ok = doc.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); say(ok ? 'Copiado! Cole no WhatsApp.' : 'Não consegui copiar; use "Baixar .txt".');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => say('Copiado! Cole no WhatsApp.'), fallback); else fallback();
    }
    function download() {
      const blob = new Blob([reportText()], { type: 'text/plain;charset=utf-8' }), a = doc.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'feedback-estudy.txt'; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    render();
    return { refresh: render, report: reportText, state: () => st };
  }

  return { PARTS, SEVERITY, summarize, buildReport, emptyState, mount, KEY };
});
