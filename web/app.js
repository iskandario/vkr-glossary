// Фронтенд глоссария: граф терминов (Cytoscape.js), поиск, карточка термина, список.
(async function () {
  const COLORS = {};
  const css = getComputedStyle(document.documentElement);
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

  // Статическая версия (scripts/export_static.py): те же данные из JSON-снимка API, поиск — в браузере
  const STATIC = document.documentElement.dataset.static === '1';
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const norm = (s) => (s || '').toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
  let allTerms = null;
  async function staticSearch(q) {
    allTerms ??= await get('api/terms.json');
    const w = norm(q);
    return allTerms.map((t) => {
      const n = norm(t.term), e = norm(t.en), d = norm(t.definition + ' ' + t.simple);
      return [n.startsWith(w) || e.startsWith(w) ? 3 : n.includes(w) || e.includes(w) ? 2 : d.includes(w) ? 1 : 0, t];
    }).filter(([s]) => s).sort((a, b) => b[0] - a[0] || a[1].term.localeCompare(b[1].term, 'ru')).map(([, t]) => t);
  }
  const api = (p) => {
    if (!STATIC) return get(p);
    const u = new URL(p, 'http://x');
    if (u.pathname === '/api/terms' && u.searchParams.get('q')) return staticSearch(u.searchParams.get('q'));
    if (u.pathname === '/api/terms') return get('api/terms.json');
    return get(u.pathname.replace(/^\//, '') + '.json');
  };
  if (STATIC) $('api-link').href = 'api/';

  const [graph, stats] = await Promise.all([api('/api/graph'), api('/api/stats')]);
  for (const c of Object.keys(graph.categories)) COLORS[c] = css.getPropertyValue(`--c-${c}`).trim() || '#888';
  $('stats').textContent = `${stats.terms} терминов · ${stats.relations} связей · ${stats.sources} источников`;
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.data.id, n.data]));

  // ---------- граф: термины сгруппированы в «острова» по темам ----------
  const cats = Object.keys(graph.categories);
  const parents = cats.map((c) => ({ data: { id: `cat:${c}`, label: graph.categories[c], category: c, isCat: true } }));
  // клетки поля для тем: связанные темы рядом, «Распределение вычислений» — в центре
  const SLOT = { asr: [0, 0], models: [1, 0], browser: [2, 0], network: [0, 1], distributed: [1, 1], devops: [2, 1], experiment: [1, 2] };
  const CW = 760, CH = 560;
  const nodes = graph.nodes.map((n) => {
    const [cx, cy0] = SLOT[n.data.category] ?? [3, 0];
    const same = graph.nodes.filter((m) => m.data.category === n.data.category);
    const k = same.indexOf(n), b = (2 * Math.PI * k) / same.length;
    return { ...n, data: { ...n.data, parent: `cat:${n.data.category}` },
      position: { x: cx * CW + CW / 2 + 150 * Math.cos(b), y: cy0 * CH + CH / 2 + 120 * Math.sin(b) } };
  });

  const cy = cytoscape({
    container: $('cy'),
    elements: [...parents, ...nodes, ...graph.edges],
    wheelSensitivity: 0.25,
    minZoom: 0.05, maxZoom: 1.4,
    style: [
      { selector: 'node', style: {
        'background-color': (n) => COLORS[n.data('category')],
        width: (n) => 16 + 5 * Math.sqrt(n.data('degree') || 0), height: (n) => 16 + 5 * Math.sqrt(n.data('degree') || 0),
        label: 'data(label)', 'font-size': (n) => 12 + 2 * Math.sqrt(n.data('degree') || 0), 'text-wrap': 'wrap', 'text-max-width': 120,
        'text-valign': 'bottom', 'text-margin-y': 4, color: '#1d2124', 'min-zoomed-font-size': 7,
        'text-background-color': '#ffffff', 'text-background-opacity': 0.75, 'text-background-padding': 1 } },
      { selector: 'node[?isCat]', style: {
        'background-color': (n) => COLORS[n.data('category')], 'background-opacity': 0.06,
        'border-width': 1.5, 'border-color': (n) => COLORS[n.data('category')], 'border-opacity': 0.5,
        shape: 'round-rectangle', padding: 26, label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center',
        'text-wrap': 'none',
        'text-margin-y': -6, 'font-size': 22, 'font-weight': 700, color: (n) => COLORS[n.data('category')],
        'text-background-opacity': 0, 'min-zoomed-font-size': 0 } },
      { selector: 'node[?authored]', style: { 'border-width': 2, 'border-style': 'dashed', 'border-color': '#1d2124' } },
      { selector: 'edge', style: { width: 1, 'line-color': '#cfcac0', 'target-arrow-color': '#cfcac0',
        'target-arrow-shape': 'triangle', 'arrow-scale': 0.7, 'curve-style': 'bezier', opacity: 0.8 } },
      { selector: 'edge[type = "alternative"]', style: { 'line-style': 'dashed', 'target-arrow-shape': 'none' } },
      { selector: '.faded', style: { opacity: 0.1 } },
      { selector: '.hidden', style: { display: 'none' } },
      { selector: 'node.focus', style: { 'border-width': 4, 'border-color': '#1d2124', 'font-weight': 700, 'font-size': 15 } },
      { selector: 'edge.hl', style: { width: 2.2, 'line-color': '#5f666b', 'target-arrow-color': '#5f666b', opacity: 1,
        label: 'data(label)', 'font-size': 10, 'text-rotation': 'autorotate', color: '#5f666b',
        'text-background-color': '#ffffff', 'text-background-opacity': 1, 'min-zoomed-font-size': 6 } },
    ],
    layout: { name: 'preset' },
  });
  window.cy = cy;
  // внутри темы — сетка: начинаем с самого связанного термина, дальше обход соседей (связанные стоят рядом)
  for (const c of cats) {
    const [cx, cy0] = SLOT[c] ?? [3, 0];
    const kids = cy.nodes(`[category = "${c}"]`).not('[?isCat]');
    const order = [], seen = new Set();
    const byDeg = kids.sort((a, b) => b.data('degree') - a.data('degree'));
    for (const start of byDeg) {
      if (seen.has(start.id())) continue;
      const queue = [start];
      seen.add(start.id());
      while (queue.length) {
        const n = queue.shift(); order.push(n);
        n.neighborhood('node').intersection(kids).sort((a, b) => b.data('degree') - a.data('degree'))
          .forEach((m) => { if (!seen.has(m.id())) { seen.add(m.id()); queue.push(m); } });
      }
    }
    const cols = Math.ceil(Math.sqrt(order.length * 1.4)), rows = Math.ceil(order.length / cols);
    const W = CW - 260, H = CH - 200;                 // поле внутри клетки, остальное — зазор между островами
    const gx = W / Math.max(cols - 1, 1), gy = Math.min(H / Math.max(rows - 1, 1), 120);
    order.forEach((n, i) => {
      const r = Math.floor(i / cols), k = i % cols;
      const inRow = Math.min(cols, order.length - r * cols), off = ((cols - inRow) * gx) / 2;  // неполный ряд по центру
      n.position({ x: cx * CW + 130 + off + k * gx, y: cy0 * CH + 100 + r * gy });
    });
  }
  cy.fit(undefined, 16);

  // легенда = фильтр по темам
  const hidden = new Set();
  for (const [id, name] of Object.entries(graph.categories)) {
    const b = el('button', { title: 'Скрыть/показать тему' }, el('i', { style: `background:${COLORS[id]}` }), name);
    b.onclick = () => {
      hidden.has(id) ? hidden.delete(id) : hidden.add(id);
      b.classList.toggle('off', hidden.has(id));
      cy.nodes().forEach((n) => n.toggleClass('hidden', hidden.has(n.data('category'))));
    };
    $('legend').append(b);
  }

  const clearFocus = () => cy.elements().removeClass('faded focus hl');
  const focus = (id) => {
    const n = cy.getElementById(id);
    if (n.empty()) return;
    clearFocus();
    const hood = n.closedNeighborhood();
    cy.elements().not(hood).not(hood.parents()).addClass('faded');
    n.addClass('focus');
    n.connectedEdges().addClass('hl');
    cy.animate({ fit: { eles: hood, padding: 70 }, duration: 350 });
  };
  cy.on('tap', 'node', (e) => { if (!e.target.data('isCat')) show(e.target.id()); });
  cy.on('tap', (e) => { if (e.target === cy) { clearFocus(); cy.animate({ fit: { padding: 16 }, duration: 300 }); } });

  // ---------- карточка ----------
  const chip = (id, note) => {
    const d = byId[id];
    return el('button', { onclick: () => show(id) }, el('i', { style: `background:${COLORS[d.category]}` }), d.label,
      ...(note ? [el('small', { textContent: note })] : []));
  };

  async function show(id, fromHistory = false) {
    const t = await api(`/api/terms/${encodeURIComponent(id)}`);
    $('intro').hidden = true; $('card').hidden = false;
    $('c-cat').textContent = t.category_name; $('c-cat').style.color = COLORS[t.category];
    $('c-term').textContent = t.term;
    $('c-en').textContent = t.en !== t.term ? t.en : '';
    $('c-authored').hidden = !t.authored;
    $('c-simple').textContent = t.simple;
    $('c-def').textContent = t.definition;
    const vk = $('c-vkr'); vk.innerHTML = '';
    for (const s of t.vkr || []) vk.append(el('button', { textContent: s.title, onclick: () => openSection(s.id) }));
    const rel = $('c-rel'); rel.innerHTML = '';
    const seen = new Set();
    for (const r of t.related) if (!seen.has(r.to.id)) { seen.add(r.to.id); rel.append(chip(r.to.id, r.label)); }
    for (const r of t.incoming) if (!seen.has(r.from.id)) { seen.add(r.from.id); rel.append(chip(r.from.id)); }
    const src = $('c-src'); src.innerHTML = '';
    for (const s of t.sources) {
      src.append(el('li', {}, s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', textContent: s.title }) : s.title));
    }
    $('c-nsrc').textContent = t.sources.length;
    const jsonUrl = STATIC ? `api/terms/${t.id}.json` : `/api/terms/${t.id}`;
    $('c-api').href = jsonUrl; $('c-api').textContent = jsonUrl;
    $('panel').scrollTop = 0;
    if (!fromHistory) history.replaceState(null, '', `#${t.id}`);
    if ($('graph-view').classList.contains('on')) focus(t.id);
  }

  // стартовые термины
  for (const id of ['speech-fragment', 'local-inference', 'server-inference', 'scheduler', 'adaptive-strategy',
    'latency', 'whisper', 'webgpu', 'test-stand', 'percentile']) $('start').append(chip(id));

  // ---------- поиск ----------
  const q = $('q'), sug = $('suggest');
  let items = [], sel = -1, timer;
  const render = () => {
    sug.innerHTML = '';
    items.slice(0, 10).forEach((t, i) => {
      const li = el('li', { role: 'option' }, el('b', { textContent: t.term }), el('small', { textContent: t.simple }));
      li.setAttribute('aria-selected', i === sel);
      li.onmousedown = () => pick(t.id);
      sug.append(li);
    });
    sug.hidden = !items.length;
  };
  const pick = (id) => { sug.hidden = true; q.value = ''; q.blur(); show(id); };
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { items = q.value.trim() ? await api(`/api/terms?q=${encodeURIComponent(q.value)}`) : []; sel = -1; render(); }, 120);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
    if (e.key === 'Enter' && items.length) pick(items[Math.max(sel, 0)].id);
    if (e.key === 'Escape') sug.hidden = true;
  });
  q.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 150));

  if (location.hash.length > 1) show(decodeURIComponent(location.hash.slice(1)), true);
  addEventListener('hashchange', () => { if (location.hash.length > 1) show(decodeURIComponent(location.hash.slice(1)), true); });

  // ---------- список ----------
  const full = await api('/api/terms?detail=true');
  const list = $('list');
  for (const [cid, cname] of Object.entries(graph.categories)) {
    list.append(el('h2', { textContent: cname, style: `color:${COLORS[cid]}` }));
    for (const t of full.filter((x) => x.category === cid)) {
      list.append(el('div', { className: 'item', onclick: () => show(t.id) },
        el('div', { className: 't' }, t.term, ...(t.en !== t.term ? [' ', el('small', { textContent: `— ${t.en}` })] : [])),
        el('p', { className: 's', textContent: t.simple }),
        el('p', { className: 'd', textContent: t.definition })));
    }
  }

  // ---------- план ВКР ----------
  const vkr = await api('/api/vkr');
  const box = $('vkr');
  box.append(el('p', { className: 'lead', textContent: 'Как термины распределены по тексту дипломной работы. Каждый термин глоссария используется хотя бы в одном параграфе.' }));
  const secBlock = (s) => el('div', { className: 'sec', id: `sec-${s.id}` },
    el('h4', { textContent: s.title }), el('p', { textContent: s.about || '' }),
    el('div', { className: 'chips' }, ...s.terms.map((x) => chip(x.id))));
  for (const ch of vkr) {
    box.append(el('h2', { textContent: ch.title }));
    if (ch.sections) ch.sections.forEach((s) => box.append(secBlock({ ...s, title: `${s.id} ${s.title}` })));
    else box.append(secBlock({ id: ch.id, title: ch.about, about: '', terms: ch.terms }));
  }

  function setView(v) {
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x.dataset.view === v));
    for (const k of ['graph', 'vkr', 'list']) $(`${k}-view`).classList.toggle('on', k === v);
    if (v === 'graph') { cy.resize(); cy.fit(undefined, 16); }
  }
  function openSection(id) {
    setView('vkr');
    document.querySelectorAll('#vkr .sec').forEach((x) => x.classList.remove('on'));
    const s = $(`sec-${id}`);
    if (s) { s.classList.add('on'); s.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
})();
