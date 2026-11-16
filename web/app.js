// Глоссарий ВКР — интерфейс в духе Obsidian: дерево тем, вкладки, заметки с [[ссылками]], граф, локальный граф, ⌘K.
(async function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null)); return e; };
  const css = getComputedStyle(document.documentElement);

  // ---------- данные: живой API или статический снимок (scripts/export_static.py) ----------
  const STATIC = document.documentElement.dataset.static === '1';
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json(); });
  const api = (p) => {
    if (!STATIC) return get(p);
    const u = new URL(p, 'http://x');
    if (u.pathname === '/api/terms') return get('api/terms.json');
    return get(u.pathname.replace(/^\//, '') + '.json');
  };
  if (STATIC) $('api-link').href = 'api/';

  const [graph, stats, terms, plan] = await Promise.all([api('/api/graph'), api('/api/stats'), api('/api/terms?detail=true'), api('/api/vkr')]);
  const CATS = graph.categories;
  const COLOR = Object.fromEntries(Object.keys(CATS).map((c) => [c, css.getPropertyValue(`--c-${c}`).trim() || '#999']));
  const T = Object.fromEntries(terms.map((t) => [t.id, t]));
  const DEG = Object.fromEntries(graph.nodes.map((n) => [n.data.id, n.data.degree]));
  const out = {}, inc = {};
  for (const e of graph.edges) {
    (out[e.data.source] ??= []).push({ id: e.data.target, label: e.data.label, type: e.data.type });
    (inc[e.data.target] ??= []).push({ id: e.data.source, label: e.data.label, type: e.data.type });
  }
  $('stats').textContent = `${stats.terms} терминов · ${stats.relations} связей · ${stats.sources} источников`;
  const norm = (s) => (s || '').toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
  const sortRu = (a, b) => T[a].term.localeCompare(T[b].term, 'ru');

  // ---------- вкладки ----------
  let tabs = [{ kind: 'graph' }], active = 0;
  const tabTitle = (t) => t.kind === 'graph' ? 'Граф' : t.kind === 'plan' ? 'План ВКР' : T[t.id].term;
  const tabIcon = (t) => t.kind === 'graph' ? '◉' : t.kind === 'plan' ? '☰' : '◇';
  function renderTabs() {
    const box = $('tabs'); box.innerHTML = '';
    tabs.forEach((t, i) => {
      box.append(el('button', { className: 'tab' + (i === active ? ' on' : ''), title: tabTitle(t), onclick: () => activate(i) },
        el('b', { textContent: tabIcon(t) }), el('span', { textContent: tabTitle(t) }),
        t.kind === 'graph' ? null : el('i', { className: 'x', textContent: '✕', onclick: (e) => { e.stopPropagation(); closeTab(i); } })));
    });
    box.children[active]?.scrollIntoView({ inline: 'nearest' });
  }
  function openTab(tab) {
    let i = tabs.findIndex((t) => t.kind === tab.kind && t.id === tab.id);
    if (i < 0) {
      if (tab.kind === 'note' && tabs[active]?.kind === 'note') { tabs[active] = tab; i = active; }  // как в Obsidian: заметка открывается в текущей вкладке
      else { tabs.push(tab); i = tabs.length - 1; }
    }
    activate(i);
  }
  function closeTab(i) { tabs.splice(i, 1); activate(Math.min(active >= i ? active - 1 : active, tabs.length - 1)); }
  function activate(i) {
    active = Math.max(0, i);
    const t = tabs[active];
    $('graph-pane').hidden = t.kind !== 'graph';
    $('note-pane').hidden = t.kind !== 'note';
    $('plan-pane').hidden = t.kind !== 'plan';
    if (t.kind === 'graph') { cy.resize(); history.replaceState(null, '', '#graph'); }
    if (t.kind === 'plan') history.replaceState(null, '', '#plan');
    if (t.kind === 'note') renderNote(t.id);
    markTree(t.kind === 'note' ? t.id : null);
    renderTabs();
  }

  // ---------- дерево ----------
  const row = (props, ...kids) => el('div', { className: 'row', ...props }, ...kids);
  function folder(label, color, count, kids, open = false) {
    const f = el('div', { className: 'folder' + (open ? '' : ' closed') });
    f.append(row({ onclick: () => f.classList.toggle('closed') }, el('span', { className: 'chev', textContent: '▾' }),
      color ? el('span', { className: 'dot', style: `background:${color}` }) : null, el('span', { className: 'lbl', textContent: label }),
      count != null ? el('span', { className: 'n', textContent: count }) : null), el('div', { className: 'kids' }, ...kids));
    return f;
  }
  const termRow = (id) => { const r = row({ title: T[id].simple, onclick: () => go(id) }, el('span', { className: 'lbl', textContent: T[id].term })); r.dataset.id = id; return r; };
  for (const [c, name] of Object.entries(CATS)) {
    const ids = terms.filter((t) => t.category === c).map((t) => t.id).sort(sortRu);
    $('tree-files').append(folder(name, COLOR[c], ids.length, ids.map(termRow)));
  }
  for (const ch of plan) {
    if (!ch.sections) {                       // введение — сразу список терминов
      const ids = ch.terms.map((x) => x.id).sort(sortRu);
      $('tree-vkr').append(folder(ch.title, null, ids.length, ids.map(termRow), true));
      continue;
    }
    $('tree-vkr').append(folder(ch.title, null, null, ch.sections.map((s) => {
      const ids = s.terms.map((x) => x.id).sort(sortRu);
      return folder(`${s.id} ${s.title}`, null, ids.length, ids.map(termRow));
    }), true));
  }
  document.querySelectorAll('[data-tree]').forEach((b) => { b.onclick = () => {
    document.querySelectorAll('[data-tree]').forEach((x) => x.classList.toggle('on', x === b));
    $('tree-files').hidden = b.dataset.tree !== 'files';
    $('tree-vkr').hidden = b.dataset.tree !== 'vkr';
    if (b.dataset.tree === 'vkr') openTab({ kind: 'plan' });
  }; });
  function markTree(id) {
    document.querySelectorAll('.tree .row.active').forEach((r) => r.classList.remove('active'));
    if (!id) return;
    document.querySelectorAll(`.tree .row[data-id="${id}"]`).forEach((r) => {
      r.classList.add('active');
      let p = r.parentElement;
      while (p && !p.classList.contains('tree')) { if (p.classList.contains('folder')) p.classList.remove('closed'); p = p.parentElement; }
    });
    document.querySelector(`.tree:not([hidden]) .row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  $('toggle-left').onclick = () => $('left').classList.toggle('open');

  // ---------- главный граф ----------
  const cats = Object.keys(CATS);
  const nodes = graph.nodes.map((n) => {
    const ci = cats.indexOf(n.data.category);
    const same = graph.nodes.filter((m) => m.data.category === n.data.category);
    const k = same.indexOf(n), a = (2 * Math.PI * ci) / cats.length, b = (2 * Math.PI * k) / same.length;
    return { ...n, position: { x: 700 * Math.cos(a) + 120 * Math.cos(b), y: 500 * Math.sin(a) + 120 * Math.sin(b) } };
  });
  const nodeStyle = {
    'background-color': (n) => COLOR[n.data('category')],
    width: (n) => 7 + 4 * Math.sqrt(n.data('degree') || 1), height: (n) => 7 + 4 * Math.sqrt(n.data('degree') || 1),
    label: 'data(label)', color: '#c9c9c9', 'font-size': (n) => (n.data('degree') >= 7 ? 15 : 12), 'text-valign': 'bottom', 'text-margin-y': 4,
    'text-wrap': 'wrap', 'text-max-width': 130, 'text-outline-color': '#1e1e1e', 'text-outline-width': 2.5, 'min-zoomed-font-size': 8,
    'transition-property': 'opacity', 'transition-duration': '0.15s',
  };
  const cy = cytoscape({
    container: $('cy'), elements: [...nodes, ...graph.edges], minZoom: 0.2, maxZoom: 2.5, wheelSensitivity: 0.3,
    style: [
      { selector: 'node', style: nodeStyle },
      { selector: 'node[?authored]', style: { 'border-width': 1.5, 'border-color': '#e3c26b', 'border-style': 'dashed' } },
      { selector: 'edge', style: { width: 0.7, 'line-color': '#4a4a4a', 'curve-style': 'haystack', opacity: 0.7,
        'transition-property': 'opacity', 'transition-duration': '0.15s' } },
      { selector: '.dim', style: { opacity: 0.08 } },
      { selector: 'node.hl', style: { 'min-zoomed-font-size': 0, color: '#ffffff', 'z-index': 10 } },
      { selector: 'node.me', style: { 'underlay-color': '#a88bfa', 'underlay-opacity': 0.35, 'underlay-padding': 7, 'underlay-shape': 'ellipse',
        'font-weight': 700, 'font-size': 16 } },
      { selector: 'edge.hl', style: { 'line-color': '#a88bfa', width: 1.6, opacity: 1, 'z-index': 9 } },
      { selector: '.off', style: { display: 'none' } },
    ],
    layout: { name: 'cose', animate: true, refresh: 8, randomize: false, fit: true, padding: 30,
      nodeRepulsion: () => 9000, idealEdgeLength: () => 60, edgeElasticity: () => 80, gravity: 0.35, numIter: 1400, initialTemp: 400 },
  });
  // раскладка не знает пропорций экрана: вытянутый граф поворачиваем на 90° и вписываем
  cy.one('layoutstop', () => {
    const bb = cy.nodes().boundingBox(), box = cy.container().getBoundingClientRect();
    if ((bb.h > bb.w) !== (box.height > box.width) && Math.max(bb.h / bb.w, bb.w / bb.h) > 1.15) {
      cy.nodes().positions((n) => ({ x: n.position('y'), y: -n.position('x') }));
    }
    cy.fit(undefined, 40);
  });
  const light = (n) => {
    const hood = n.closedNeighborhood();
    cy.elements().not(hood).addClass('dim');
    hood.nodes().addClass('hl'); n.connectedEdges().addClass('hl'); n.addClass('me');
  };
  const unlight = () => cy.elements().removeClass('dim hl me');
  cy.on('mouseover', 'node', (e) => { unlight(); light(e.target); $('cy').style.cursor = 'pointer'; });
  cy.on('mouseout', 'node', () => { unlight(); $('cy').style.cursor = ''; });
  cy.on('tap', 'node', (e) => go(e.target.id()));
  for (const [c, name] of Object.entries(CATS)) {
    const b = el('button', { title: 'Скрыть/показать' }, el('i', { style: `background:${COLOR[c]}` }), name);
    b.onclick = () => { b.classList.toggle('off'); cy.nodes(`[category = "${c}"]`).toggleClass('off', b.classList.contains('off')); };
    $('legend').append(b);
  }

  // ---------- локальный граф ----------
  let lcy = null;
  function localGraph(id) {
    lcy?.destroy();
    const ids = new Set([id, ...(out[id] || []).map((x) => x.id), ...(inc[id] || []).map((x) => x.id)]);
    const els = [...ids].map((x) => ({ data: { id: x, label: T[x].term, category: T[x].category, degree: DEG[x], me: x === id } }));
    for (const e of graph.edges) if (ids.has(e.data.source) && ids.has(e.data.target)) els.push({ data: { ...e.data } });
    lcy = cytoscape({
      container: $('local-cy'), elements: els, minZoom: 0.3, maxZoom: 1.1,
      style: [
        { selector: 'node', style: { ...nodeStyle, width: 10, height: 10, 'font-size': 9, 'min-zoomed-font-size': 0, 'text-max-width': 80,
          color: '#bdbdbd', 'text-outline-width': 2 } },
        { selector: 'node[?me]', style: { width: 14, height: 14, 'underlay-color': '#a88bfa', 'underlay-opacity': 0.4, 'underlay-padding': 6,
          color: '#fff', 'font-weight': 700, 'font-size': 10.5 } },
        { selector: 'edge', style: { width: 0.8, 'line-color': '#555', 'curve-style': 'haystack' } },
      ],
      layout: { name: 'concentric', concentric: (n) => (n.data('me') ? 2 : 1), levelWidth: () => 1, minNodeSpacing: 70, padding: 18,
        startAngle: -Math.PI / 2, animate: false },
    });
    lcy.on('tap', 'node', (e) => go(e.target.id()));
  }
  const linkRow = (x) => row({ onclick: () => go(x.id), title: T[x.id].simple }, el('span', { className: 'lbl', textContent: T[x.id].term }), el('small', { textContent: x.label }));
  function sidePanel(id) {
    const o = out[id] || [], i = inc[id] || [];
    $('bl-count').textContent = i.length; $('ol-count').textContent = o.length;
    $('backlinks').replaceChildren(...(i.length ? i.map(linkRow) : [el('div', { className: 'none', textContent: 'нет' })]));
    $('outlinks').replaceChildren(...(o.length ? o.map(linkRow) : [el('div', { className: 'none', textContent: 'нет' })]));
    localGraph(id);
  }

  // ---------- заметка ----------
  const wl = (id, text) => el('a', { className: 'wl', textContent: text || T[id].term, title: T[id].simple, onclick: () => go(id) });
  async function renderNote(id) {
    const t = await api(`/api/terms/${encodeURIComponent(id)}`);
    const prop = (k, ...v) => el('div', { className: 'prop' }, el('div', { className: 'k', textContent: k }), el('div', { className: 'v' }, ...v));
    const jsonUrl = STATIC ? `api/terms/${t.id}.json` : `/api/terms/${t.id}`;
    $('note').replaceChildren(...[
      el('h1', { textContent: t.term }),
      el('div', { className: 'props' },
        t.en !== t.term ? prop('English', t.en) : null,
        prop('Тема', el('span', { className: 'tag', textContent: `#${t.category_name.toLowerCase().replaceAll(' ', '-')}` })),
        prop('Где в ВКР', ...t.vkr.map((s) => el('button', { className: 'tag', textContent: s.title, onclick: () => openPlan(s.id) }))),
        t.authored ? prop('Тип', 'авторский термин ВКР') : null),
      el('div', { className: 'callout' }, el('div', { className: 'ct', textContent: '💡 Простыми словами' }), el('p', { textContent: t.simple })),
      el('h2', { textContent: 'Определение' }),
      el('p', { className: 'def', textContent: t.definition }),
      t.authored ? el('div', { className: 'callout authored' }, el('div', { className: 'ct', textContent: '✎ Авторский термин' }),
        el('p', { textContent: 'Понятие введено в ВКР как часть модели автора; источники — текст ВКР и родственные работы.' })) : null,
      el('h2', { textContent: 'Связи' }),
      el('ul', { className: 'rels' },
        ...t.related.map((r) => el('li', {}, el('span', { className: 'rk', textContent: r.label }), wl(r.to.id))),
        ...t.incoming.map((r) => el('li', {}, el('span', { className: 'rk', textContent: `← ${r.label}` }), wl(r.from.id)))),
      el('h2', { textContent: 'Источники' }),
      el('ol', { className: 'srcs' }, ...t.sources.map((s) => el('li', {}, s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', textContent: s.title }) : s.title))),
      el('div', { className: 'api-line' }, 'JSON: ', el('a', { href: jsonUrl, target: '_blank', textContent: jsonUrl })),
    ].filter(Boolean));
    $('note-pane').scrollTop = 0;
    sidePanel(id);
    history.replaceState(null, '', `#${id}`);
  }
  function go(id) { if (!T[id]) return; openTab({ kind: 'note', id }); $('left').classList.remove('open'); }

  // ---------- план ВКР ----------
  $('plan').append(el('h1', { textContent: 'План ВКР' }),
    el('p', { className: 'plan-intro', textContent: 'Главы и параграфы диплома и термины, которые в них используются. Каждый термин глоссария привязан хотя бы к одному параграфу — лишних терминов нет.' }));
  for (const ch of plan) {
    $('plan').append(el('h2', { textContent: ch.title }));
    const secs = ch.sections || [{ id: ch.id, title: '', about: ch.about, terms: ch.terms }];
    for (const s of secs) {
      $('plan').append(el('div', { className: 'plan-sec', id: `sec-${s.id}` },
        s.title ? el('h3', { textContent: `${s.id} ${s.title}` }) : null, el('p', { className: 'about', textContent: s.about }),
        el('div', { className: 'terms' }, ...s.terms.map((x) => x.id).sort(sortRu).map((x) => wl(x)))));
    }
  }
  function openPlan(secId) {
    openTab({ kind: 'plan' });
    const s = $(`sec-${secId}`);
    if (s) { s.scrollIntoView({ block: 'center' }); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
  }

  // ---------- быстрый переход (⌘K) ----------
  let items = [], sel = 0;
  function search(q) {
    const w = norm(q);
    if (!w) return terms.slice().sort((a, b) => DEG[b.id] - DEG[a.id]).slice(0, 12);
    return terms.map((t) => {
      const n = norm(t.term), e = norm(t.en), d = norm(t.simple + ' ' + t.definition);
      return [n.startsWith(w) || e.startsWith(w) ? 3 : n.includes(w) || e.includes(w) ? 2 : d.includes(w) ? 1 : 0, t];
    }).filter(([s]) => s).sort((a, b) => b[0] - a[0] || a[1].term.localeCompare(b[1].term, 'ru')).map(([, t]) => t).slice(0, 30);
  }
  function renderResults() {
    $('results').replaceChildren(...items.map((t, i) => {
      const li = el('li', { role: 'option', onmousedown: () => pick(i) },
        el('div', { className: 't' }, el('i', { style: `background:${COLOR[t.category]}` }), t.term), el('small', { textContent: t.simple }));
      li.setAttribute('aria-selected', i === sel);
      return li;
    }));
    $('results').children[sel]?.scrollIntoView({ block: 'nearest' });
  }
  const openSwitcher = () => { $('switcher').hidden = false; $('q').value = ''; items = search(''); sel = 0; renderResults(); $('q').focus(); };
  const closeSwitcher = () => { $('switcher').hidden = true; };
  const pick = (i) => { if (items[i]) { closeSwitcher(); go(items[i].id); } };
  $('q').addEventListener('input', () => { items = search($('q').value); sel = 0; renderResults(); });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); renderResults(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); renderResults(); e.preventDefault(); }
    if (e.key === 'Enter') pick(sel);
  });
  $('switcher').addEventListener('mousedown', (e) => { if (e.target === $('switcher')) closeSwitcher(); });
  $('search-pill').onclick = openSwitcher; $('open-search').onclick = openSwitcher;
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && ['k', 'o'].includes(e.key.toLowerCase())) { e.preventDefault(); openSwitcher(); }
    if (e.key === 'Escape') closeSwitcher();
  });

  // ---------- старт ----------
  addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (T[h] && tabs[active]?.id !== h) go(h); });
  const h = decodeURIComponent(location.hash.slice(1));
  renderTabs();
  if (T[h]) go(h);
  else if (h === 'plan') openTab({ kind: 'plan' });
  else { activate(0); sidePanel('adaptive-strategy'); }
})();
