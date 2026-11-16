// Фронтенд глоссария: граф терминов (Cytoscape.js), поиск, карточка термина, список.
(async function () {
  const COLORS = {};
  const css = getComputedStyle(document.documentElement);
  const $ = (id) => document.getElementById(id);
  // Статическая версия (scripts/export_static.py): те же данные из JSON-снимка API, поиск — в браузере
  const STATIC = document.documentElement.dataset.static === '1';
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const norm = (s) => s.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
  let allTerms = null;
  async function staticSearch(q) {
    allTerms ??= await get('api/terms.json');
    const w = norm(q);
    return allTerms.map((t) => {
      const n = norm(t.term), e = norm(t.en), d = norm(t.definition);
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

  const [graph, stats] = await Promise.all([api('/api/graph'), api('/api/stats')]);
  for (const c of Object.keys(graph.categories)) COLORS[c] = css.getPropertyValue(`--c-${c}`).trim() || '#888';
  $('stats').textContent = `${stats.terms} терминов, ${stats.relations} связей, ${stats.sources} источников.`;

  // стартовые позиции по кругу категорий: раскладка cose детерминирована (randomize: false)
  function placed(nodes) {
    const cats = Object.keys(graph.categories);
    return nodes.map((n) => {
      const ci = cats.indexOf(n.data.category);
      const same = nodes.filter((m) => m.data.category === n.data.category);
      const k = same.indexOf(n);
      const a = (2 * Math.PI * ci) / cats.length, b = (2 * Math.PI * k) / same.length;
      return { ...n, position: { x: 1000 * Math.cos(a) + 180 * Math.cos(b), y: 520 * Math.sin(a) + 140 * Math.sin(b) } };
    });
  }

  const cy = cytoscape({
    container: $('cy'),
    elements: [...placed(graph.nodes), ...graph.edges],
    wheelSensitivity: 0.25,
    style: [
      { selector: 'node', style: {
        'background-color': (n) => COLORS[n.data('category')],
        width: (n) => 18 + 5 * Math.sqrt(n.data('degree')), height: (n) => 18 + 5 * Math.sqrt(n.data('degree')),
        label: 'data(label)', 'font-size': (n) => 11 + 2.2 * Math.sqrt(n.data('degree')), 'text-wrap': 'wrap', 'text-max-width': 130,
        'text-valign': 'bottom', 'text-margin-y': 3, color: '#1d2124',
        'text-background-color': '#f6f5f1', 'text-background-opacity': 0.7, 'text-background-padding': 1 } },
      { selector: 'node[?authored]', style: { 'border-width': 2, 'border-style': 'dashed', 'border-color': '#1d2124' } },
      { selector: 'edge', style: { width: 1, 'line-color': '#c9c5bc', 'target-arrow-color': '#c9c5bc',
        'target-arrow-shape': 'triangle', 'arrow-scale': 0.7, 'curve-style': 'bezier' } },
      { selector: 'edge[type = "alternative"]', style: { 'line-style': 'dashed', 'target-arrow-shape': 'none' } },
      { selector: '.faded', style: { opacity: 0.12 } },
      { selector: '.hidden', style: { display: 'none' } },
      { selector: 'node.focus', style: { 'border-width': 4, 'border-color': '#1d2124', 'font-weight': 700, 'font-size': 12 } },
      { selector: 'edge.hl', style: { width: 2, 'line-color': '#5f666b', 'target-arrow-color': '#5f666b',
        label: 'data(label)', 'font-size': 9, 'text-rotation': 'autorotate', color: '#5f666b',
        'text-background-color': '#f6f5f1', 'text-background-opacity': 1 } },
    ],
    layout: { name: 'cose', animate: false, randomize: false, nodeRepulsion: () => 14000, idealEdgeLength: () => 80,
      gravity: 0.08, numIter: 2500, nodeDimensionsIncludeLabels: true, componentSpacing: 60, fit: true, padding: 20 },
  });

  // cose не учитывает пропорции экрана: вытянутый по вертикали граф поворачиваем на 90°
  const bb = cy.nodes().boundingBox();
  const box = cy.container().getBoundingClientRect();
  if (bb.h / bb.w > 1.2 && box.width > box.height) {
    cy.nodes().positions((n) => ({ x: n.position('y'), y: -n.position('x') }));
  }
  cy.fit(undefined, 20);

  // легенда = фильтр по категориям
  const hidden = new Set();
  for (const [id, name] of Object.entries(graph.categories)) {
    const b = document.createElement('button');
    b.innerHTML = `<i style="background:${COLORS[id]}"></i>${name}`;
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
    cy.elements().not(hood).addClass('faded');
    n.addClass('focus');
    n.connectedEdges().addClass('hl');
    cy.animate({ fit: { eles: hood, padding: 60 }, duration: 350 });
  };
  cy.on('tap', 'node', (e) => show(e.target.id()));
  cy.on('tap', (e) => { if (e.target === cy) clearFocus(); });

  async function show(id, fromHistory = false) {
    const t = await api(`/api/terms/${encodeURIComponent(id)}`);
    $('panel-empty').hidden = true; $('card').hidden = false;
    $('c-cat').textContent = t.category_name; $('c-cat').style.color = COLORS[t.category];
    $('c-term').textContent = t.term; $('c-en').textContent = t.en;
    $('c-authored').hidden = !t.authored; $('c-def').textContent = t.definition;
    const rel = $('c-rel'); rel.innerHTML = '';
    const link = (b) => { const a = document.createElement('a'); a.textContent = b.term; a.onclick = () => show(b.id); return a; };
    for (const r of t.related) { const li = document.createElement('li'); li.innerHTML = `<span class="k">${r.label} → </span>`; li.append(link(r.to)); rel.append(li); }
    for (const r of t.incoming) { const li = document.createElement('li'); li.append(link(r.from)); li.insertAdjacentHTML('beforeend', ` <span class="k">← ${r.label}</span>`); rel.append(li); }
    const src = $('c-src'); src.innerHTML = '';
    for (const s of t.sources) {
      const li = document.createElement('li');
      if (s.url) { const a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.title; li.append(a); }
      else li.textContent = s.title;
      src.append(li);
    }
    $('c-api').href = $('c-api').textContent = `/api/terms/${t.id}`;
    if (!fromHistory) history.replaceState(null, '', `#${t.id}`);
    if ($('graph-view').classList.contains('on')) focus(t.id);
  }

  // поиск с подсказками
  const q = $('q'), sug = $('suggest');
  let items = [], sel = -1, timer;
  const render = () => {
    sug.innerHTML = '';
    items.slice(0, 12).forEach((t, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.setAttribute('aria-selected', i === sel);
      li.innerHTML = `${t.term} <small>${t.en}</small>`;
      li.onmousedown = () => pick(t.id);
      sug.append(li);
    });
    sug.hidden = !items.length;
  };
  const pick = (id) => { sug.hidden = true; q.blur(); show(id); };
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

  // список по категориям
  if (location.hash.length > 1) show(decodeURIComponent(location.hash.slice(1)), true);
  addEventListener('hashchange', () => { if (location.hash.length > 1) show(decodeURIComponent(location.hash.slice(1)), true); });
  const full = await api('/api/terms?detail=true');
  const list = $('list');
  for (const [cid, cname] of Object.entries(graph.categories)) {
    const h = document.createElement('h2'); h.textContent = cname; h.style.color = COLORS[cid]; list.append(h);
    const dl = document.createElement('dl');
    for (const t of full.filter((x) => x.category === cid)) {
      const dt = document.createElement('dt'); dt.textContent = `${t.term} — ${t.en}`; dt.onclick = () => show(t.id);
      const dd = document.createElement('dd'); dd.textContent = t.definition;
      dl.append(dt, dd);
    }
    list.append(dl);
  }

  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
    $('graph-view').classList.toggle('on', b.dataset.view === 'graph');
    $('list-view').classList.toggle('on', b.dataset.view === 'list');
    if (b.dataset.view === 'graph') cy.resize();
  }));

})();
