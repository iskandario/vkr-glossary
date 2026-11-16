// Глоссарий ВКР — граф знаний в духе Obsidian: живой граф (force-graph / d3-force), заметки с [[ссылками]],
// план ВКР, свои заметки (хранятся в браузере), экспорт хранилища для Obsidian.
(async function () {
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null && k !== false)); return e; };
  const css = getComputedStyle(document.documentElement);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
  };

  // ---------- данные: живой API или статический снимок ----------
  const STATIC = document.documentElement.dataset.static === '1';
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${r.status} ${p}`); return r.json(); });
  const api = (p) => {
    if (!STATIC) return get(p);
    const u = new URL(p, 'http://x');
    if (u.pathname === '/api/terms') return get('api/terms.json');
    return get(u.pathname.replace(/^\//, '') + '.json');
  };
  if (STATIC) $('api-link').href = 'api/';
  const [graph, stats, terms, plan, sources] = await Promise.all([api('/api/graph'), api('/api/stats'), api('/api/terms?detail=true'), api('/api/vkr'), api('/api/sources')]);
  const CATS = graph.categories;
  const COLOR = Object.fromEntries(Object.keys(CATS).map((c) => [c, css.getPropertyValue(`--c-${c}`).trim() || '#999']));
  const MINE_COLOR = '#f2f2f2';
  const T = Object.fromEntries(terms.map((t) => [t.id, t]));
  const SRC = Object.fromEntries(sources.map((s) => [s.id, s]));
  const SRC_OF = {}; for (const s of sources) for (const tid of s.terms || []) (SRC_OF[tid] ??= []).push(s.id);
  const norm = (s) => (s || '').toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
  const sortRu = (a, b) => T[a].term.localeCompare(T[b].term, 'ru');
  const out = {}, inc = {};
  for (const e of graph.edges) {
    (out[e.data.source] ??= []).push({ id: e.data.target, label: e.data.label });
    (inc[e.data.target] ??= []).push({ id: e.data.source, label: e.data.label });
  }
  $('stats').textContent = `${stats.terms} терминов · ${stats.relations} связей · ${stats.sources} источников`;

  // ---------- свои заметки (localStorage) ----------
  const NOTES_KEY = 'vkr-notes-v1';
  const notes = store.get(NOTES_KEY, { terms: {}, mine: [] });
  const saveNotes = () => store.set(NOTES_KEY, notes);
  const mineById = (id) => notes.mine.find((n) => n.id === id);
  const byName = {};
  for (const t of terms) { byName[norm(t.term)] = t.id; byName[norm(t.en)] = t.id; byName[t.id] = t.id; }
  const resolve = (name) => { const k = norm(name); return byName[k] || notes.mine.find((n) => norm(n.title) === k)?.id || null; };
  const linksIn = (text) => [...(text || '').matchAll(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g)].map((m) => resolve(m[1])).filter(Boolean);
  const isMine = (id) => typeof id === 'string' && id.startsWith('n-');
  const titleOf = (id) => (isMine(id) ? mineById(id)?.title || 'Без названия' : T[id]?.term || id);
  function mentionsOf(id) {
    const res = [];
    for (const n of notes.mine) if (linksIn(n.body).includes(id)) res.push(n.id);
    for (const [tid, body] of Object.entries(notes.terms)) if (tid !== id && linksIn(body).includes(id)) res.push(tid);
    return [...new Set(res)];
  }

  // ---------- мини-markdown (безопасный: сначала экранирование) ----------
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function md(text) {
    const inline = (s) => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (m, name, alias) => {
        const id = resolve(name.replace(/&quot;/g, '"'));
        return id ? `<a class="wl" data-go="${id}">${alias || name}</a>` : `<span class="wl dead" title="нет такой заметки">${alias || name}</span>`;
      });
    const html = []; let list = false;
    for (const ln of (text || '').split('\n')) {
      const h = ln.match(/^(#{1,3})\s+(.*)/), li = ln.match(/^\s*[-*]\s+(.*)/), q = ln.match(/^>\s?(.*)/);
      if (!li && list) { html.push('</ul>'); list = false; }
      if (h) html.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
      else if (li) { if (!list) { html.push('<ul>'); list = true; } html.push(`<li>${inline(li[1])}</li>`); }
      else if (q) html.push(`<blockquote>${inline(q[1])}</blockquote>`);
      else if (ln.trim()) html.push(`<p>${inline(ln)}</p>`);
    }
    if (list) html.push('</ul>');
    return html.join('');
  }
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); go(a.dataset.go); } });

  // ---------- вкладки ----------
  let tabs = [{ kind: 'graph' }], active = 0;
  const tabTitle = (t) => t.kind === 'graph' ? 'Граф' : t.kind === 'plan' ? 'План ВКР' : t.kind === 'learn' ? 'Учиться' : titleOf(t.id);
  const tabIcon = (t) => t.kind === 'graph' ? '◉' : t.kind === 'plan' ? '☰' : t.kind === 'mine' ? '✎' : t.kind === 'learn' ? '★' : '◇';
  function renderTabs() {
    $('tabs').replaceChildren(...tabs.map((t, i) => el('button', { className: 'tab' + (i === active ? ' on' : ''), title: tabTitle(t), onclick: () => activate(i) },
      el('b', { textContent: tabIcon(t) }), el('span', { textContent: tabTitle(t) }),
      t.kind === 'graph' ? null : el('i', { className: 'x', textContent: '✕', onclick: (e) => { e.stopPropagation(); closeTab(i); } }))));
    $('tabs').children[active]?.scrollIntoView({ inline: 'nearest' });
    document.querySelector('.tabbar').dataset.title = tabs[active] ? tabTitle(tabs[active]) : '';
    syncBottomNav();
  }
  function openTab(tab) {
    let i = tabs.findIndex((t) => t.kind === tab.kind && t.id === tab.id);
    if (i < 0) {
      if ((tab.kind === 'note' || tab.kind === 'mine') && ['note', 'mine'].includes(tabs[active]?.kind)) { tabs[active] = tab; i = active; }
      else { tabs.push(tab); i = tabs.length - 1; }
    }
    activate(i);
  }
  function closeTab(i) { tabs.splice(i, 1); activate(Math.min(active >= i ? active - 1 : active, tabs.length - 1)); }
  function activate(i) {
    active = Math.max(0, i);
    const t = tabs[active];
    for (const [k, pane] of [['graph', 'graph-pane'], ['note', 'note-pane'], ['plan', 'plan-pane'], ['mine', 'mine-pane'], ['learn', 'learn-pane']]) $(pane).hidden = t.kind !== k;
    document.body.classList.remove('m-tree');
    if (t.kind === 'learn') { history.replaceState(null, '', '#learn'); renderLearn(); }
    if (t.kind === 'graph') { history.replaceState(null, '', '#graph'); setTimeout(resizeGraphs, 0); }
    if (t.kind === 'plan') history.replaceState(null, '', '#plan');
    if (t.kind === 'note') renderNote(t.id);
    if (t.kind === 'mine') renderMine(t.id);
    markTree(['note', 'mine'].includes(t.kind) ? t.id : null);
    renderTabs();
  }
  function go(id) {
    if (isMine(id) && mineById(id)) openTab({ kind: 'mine', id });
    else if (T[id]) openTab({ kind: 'note', id });
    document.body.classList.remove('m-tree');
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
  const termRow = (id) => { const r = row({ title: T[id].simple, onclick: () => go(id) }, el('span', { className: 'lbl', textContent: T[id].term }), el('span', { className: 'known-mark', textContent: '' })); r.dataset.id = id; return r; };
  for (const [c, name] of Object.entries(CATS)) {
    const ids = terms.filter((t) => t.category === c).map((t) => t.id).sort(sortRu);
    $('tree-files').append(folder(name, COLOR[c], ids.length, ids.map(termRow)));
  }
  for (const ch of plan) {
    if (!ch.sections) { const ids = ch.terms.map((x) => x.id).sort(sortRu); $('tree-vkr').append(folder(ch.title, null, ids.length, ids.map(termRow), true)); continue; }
    $('tree-vkr').append(folder(ch.title, null, null, ch.sections.map((s) => {
      const ids = s.terms.map((x) => x.id).sort(sortRu);
      return folder(`${s.id} ${s.title}`, null, ids.length, ids.map(termRow));
    }), true));
  }
  function renderMineTree() {
    const list = notes.mine.slice().sort((a, b) => b.updated - a.updated);
    const termNotes = Object.keys(notes.terms).filter((k) => T[k] && notes.terms[k]?.trim()).sort(sortRu);
    $('tree-mine').replaceChildren(
      row({ onclick: newNote }, el('span', { className: 'lbl', textContent: '+ Новая заметка' })),
      ...(list.length ? list.map((n) => { const r = row({ onclick: () => go(n.id) }, el('span', { className: 'mine-dot' }), el('span', { className: 'lbl', textContent: n.title || 'Без названия' })); r.dataset.id = n.id; return r; })
        : [el('div', { className: 'empty-mine', textContent: 'Здесь будут ваши заметки к ВКР: черновики параграфов, мысли, цитаты. Они хранятся в этом браузере и появляются на графе белыми квадратами.' })]),
      ...termNotes.map((id) => { const r = row({ onclick: () => go(id), title: 'Мои заметки к термину' }, el('span', { className: 'dot', style: `background:${COLOR[T[id].category]}` }), el('span', { className: 'lbl', textContent: `${T[id].term} — заметки` })); r.dataset.id = id; return r; }));
  }
  renderMineTree();
  document.querySelectorAll('[data-tree]').forEach((b) => { b.onclick = () => {
    document.querySelectorAll('[data-tree]').forEach((x) => x.classList.toggle('on', x === b));
    for (const k of ['files', 'vkr', 'mine']) $(`tree-${k}`).hidden = b.dataset.tree !== k;
    if (b.dataset.tree === 'vkr') openTab({ kind: 'plan' });
  }; });
  function markTree(id) {
    document.querySelectorAll('.tree .row.active').forEach((r) => r.classList.remove('active'));
    if (!id) return;
    document.querySelectorAll(`.tree .row[data-id="${id}"]`).forEach((r) => {
      r.classList.add('active');
      for (let p = r.parentElement; p && !p.classList.contains('tree'); p = p.parentElement) if (p.classList.contains('folder')) p.classList.remove('closed');
    });
    document.querySelector(`.tree:not([hidden]) .row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // ---------- панели ----------
  const layout = store.get('vkr-layout', { left: true, right: innerWidth > 1100 });
  function applyLayout() { $('app').classList.toggle('no-left', !layout.left); $('app').classList.toggle('no-right', !layout.right); setTimeout(resizeGraphs, 230); }
  $('toggle-left').onclick = () => { layout.left = !layout.left; store.set('vkr-layout', layout); applyLayout(); };
  $('toggle-right').onclick = () => { layout.right = !layout.right; store.set('vkr-layout', layout); applyLayout(); };

  // ---------- граф ----------
  const DEFAULTS = { nodeSize: 1, linkWidth: 1, textFade: 1.1, repel: 120, linkDist: 45, linkStrength: 0.7, center: 0.05, cluster: 0.08,
    showMine: true, arrows: false, hidden: [] };
  const S = { ...DEFAULTS, ...store.get('vkr-graph', {}) };
  const saveS = () => store.set('vkr-graph', S);
  const degree = {};
  function buildData(withPositions = true) {
    const nodes = terms.filter((t) => !S.hidden.includes(t.category)).map((t) => ({ id: t.id, name: t.term, cat: t.category, kind: 'term' }));
    const ids = new Set(nodes.map((n) => n.id));
    const links = graph.edges.filter((e) => ids.has(e.data.source) && ids.has(e.data.target))
      .map((e) => ({ source: e.data.source, target: e.data.target, label: e.data.label }));
    if (S.showMine) {
      for (const n of notes.mine) { nodes.push({ id: n.id, name: n.title || 'Без названия', cat: 'mine', kind: 'mine' }); ids.add(n.id); }
      for (const n of notes.mine) for (const to of new Set(linksIn(n.body))) if (ids.has(to) && to !== n.id) links.push({ source: n.id, target: to, label: 'упоминает', mine: true });
      for (const [tid, body] of Object.entries(notes.terms)) for (const to of new Set(linksIn(body))) if (ids.has(tid) && ids.has(to) && to !== tid) links.push({ source: tid, target: to, label: 'упоминает', mine: true });
    }
    for (const k in degree) delete degree[k];
    for (const l of links) { degree[l.source] = (degree[l.source] || 0) + 1; degree[l.target] = (degree[l.target] || 0) + 1; }
    if (withPositions) {  // старт «облаками» по темам — граф раскрывается красиво, а не из точки
      const cats = [...Object.keys(CATS), 'mine'];
      const prev = new Map((fg?.graphData().nodes || []).map((n) => [n.id, n]));
      for (const n of nodes) {
        const p = prev.get(n.id);
        if (p) { n.x = p.x; n.y = p.y; n.vx = p.vx; n.vy = p.vy; continue; }
        const a = (2 * Math.PI * cats.indexOf(n.cat)) / cats.length;
        n.x = 260 * Math.cos(a) + (Math.random() - 0.5) * 90; n.y = 200 * Math.sin(a) + (Math.random() - 0.5) * 90;
      }
    }
    return { nodes, links };
  }
  const radius = (n, mult = 1) => (2.2 + 1.5 * Math.sqrt(degree[n.id] || 1)) * S.nodeSize * mult;
  const colorOf = (n) => (n.kind === 'mine' ? MINE_COLOR : COLOR[n.cat]);

  let hoverNode = null, focusId = null, filterText = '';
  const hl = { nodes: new Set(), links: new Set() };
  function setHighlight(node) {
    hl.nodes.clear(); hl.links.clear();
    if (!node) return;
    hl.nodes.add(node.id);
    fg.graphData().links.forEach((l) => {
      if (l.source.id === node.id || l.target.id === node.id) { hl.links.add(l); hl.nodes.add(l.source.id); hl.nodes.add(l.target.id); }
    });
  }
  const matchFilter = (n) => !filterText || norm(n.name).includes(filterText);

  // своя сила: термины тянутся к центру своей темы (ползунок «Группировка по темам»)
  function clusterForce() {
    let nodes = [];
    const f = (alpha) => {
      const c = {};
      for (const n of nodes) { (c[n.cat] ??= { x: 0, y: 0, n: 0 }); c[n.cat].x += n.x; c[n.cat].y += n.y; c[n.cat].n++; }
      for (const n of nodes) { const g = c[n.cat]; if (!g || g.n < 2) continue; n.vx += (g.x / g.n - n.x) * S.cluster * alpha; n.vy += (g.y / g.n - n.y) * S.cluster * alpha; }
    };
    f.initialize = (ns) => { nodes = ns; };
    return f;
  }

  let fg = null;
  fg = ForceGraph()($('graph'))
    .backgroundColor('rgba(0,0,0,0)')
    .nodeId('id')
    .nodeLabel(() => '')
    .nodeRelSize(1)
    .nodeVal((n) => radius(n) ** 2)
    .linkColor((l) => (hl.links.has(l) ? '#a88bfa' : l.mine ? 'rgba(242,242,242,.3)' : 'rgba(150,150,150,.22)'))
    .linkWidth((l) => (hl.links.has(l) ? 1.8 : 0.7) * S.linkWidth)
    .linkDirectionalArrowLength(() => (S.arrows ? 3.5 : 0))
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalParticles((l) => (hl.links.has(l) ? 2 : 0))
    .linkDirectionalParticleWidth(2)
    .linkDirectionalParticleColor(() => '#c9b8ff')
    .d3AlphaDecay(0.018)
    .d3VelocityDecay(0.32)
    .cooldownTime(20000)
    .minZoom(0.25).maxZoom(8)
    .nodeCanvasObject((n, ctx, scale) => {
      const center = hoverNode?.id || focusId;
      const dim = (center && !hl.nodes.has(n.id)) || !matchFilter(n);
      const me = n.id === center;
      const r = radius(n, me ? 1.35 : 1);
      ctx.globalAlpha = dim ? 0.12 : 1;
      if (me) {
        const g = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r * 2.6);
        g.addColorStop(0, 'rgba(168,139,250,.5)'); g.addColorStop(1, 'rgba(168,139,250,0)');
        ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.6, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill();
      }
      ctx.beginPath();
      if (n.kind === 'mine') ctx.rect(n.x - r, n.y - r, 2 * r, 2 * r); else ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = colorOf(n); ctx.fill();
      if (T[n.id]?.authored) { ctx.lineWidth = 1.2 / scale; ctx.strokeStyle = '#e3c26b'; ctx.setLineDash([2 / scale, 1.5 / scale]); ctx.stroke(); ctx.setLineDash([]); }
      // подписи проявляются с приближением (как «порог затухания текста» в Obsidian), у подсвеченных — всегда
      const big = (degree[n.id] || 0) >= 7;
      const fade = hl.nodes.has(n.id) ? 1 : Math.max(0, Math.min(1, (scale - S.textFade * (big ? 0.55 : 1)) / 0.5));
      if (fade > 0.02 && !dim) {
        const fs = (big ? 13 : 11.5) / scale;
        ctx.font = `${hl.nodes.has(n.id) ? 600 : 400} ${fs}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.globalAlpha = fade;
        ctx.lineWidth = 3 / scale; ctx.strokeStyle = '#1e1e1e'; ctx.strokeText(n.name, n.x, n.y + r + 2 / scale);
        ctx.fillStyle = hl.nodes.has(n.id) ? '#ffffff' : '#c8c8c8'; ctx.fillText(n.name, n.x, n.y + r + 2 / scale);
      }
      ctx.globalAlpha = 1;
    })
    .nodePointerAreaPaint((n, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, radius(n) + 3, 0, 2 * Math.PI); ctx.fill(); })
    .onNodeHover((n) => {
      hoverNode = n;
      setHighlight(n || (focusId ? fg.graphData().nodes.find((x) => x.id === focusId) : null));
      $('graph').style.cursor = n ? 'pointer' : 'grab';
    })
    .onNodeClick((n) => go(n.id))
    .onNodeDrag(() => { $('graph').style.cursor = 'grabbing'; })
    .onNodeDragEnd((n) => { n.fx = undefined; n.fy = undefined; })   // как в Obsidian: отпустили — узел снова свободен
    .onBackgroundClick(() => { focusId = null; setHighlight(null); });
  function applyForces() {
    fg.d3Force('charge').strength(-S.repel).distanceMax(420);
    fg.d3Force('link').distance((l) => S.linkDist * (l.mine ? 1.3 : 1)).strength(S.linkStrength * 0.6);
    fg.d3Force('center').strength(S.center);
    fg.d3Force('cluster', clusterForce());
  }
  let firstFit = true;
  fg.onEngineStop(() => { if (firstFit) { firstFit = false; fg.zoomToFit(700, 50); } });
  function refreshGraph(reheat = true) { fg.graphData(buildData()); applyForces(); if (reheat) fg.d3ReheatSimulation(); }
  refreshGraph();
  setTimeout(() => fg.zoomToFit(900, 50), 1800);
  function resizeGraphs() {
    const g = $('graph'); if (g.offsetWidth) fg.width(g.offsetWidth).height(g.offsetHeight);
    const l = $('local-graph'); if (lfg && l.offsetWidth) lfg.width(l.offsetWidth).height(l.offsetHeight);
  }
  new ResizeObserver(resizeGraphs).observe($('graph-pane'));
  $('graph-fit').onclick = () => fg.zoomToFit(600, 50);
  $('graph-animate').onclick = () => { fg.graphData().nodes.forEach((n) => { n.vx = (n.vx || 0) + (Math.random() - 0.5) * 40; n.vy = (n.vy || 0) + (Math.random() - 0.5) * 40; }); fg.d3ReheatSimulation(); };
  $('graph-filter').oninput = (e) => { filterText = norm(e.target.value); };

  // настройки графа
  function settingsPanel() {
    const slider = (key, label, min, max, step, onchange) => {
      const inp = el('input', { type: 'range', min, max, step, value: S[key] });
      inp.oninput = () => { S[key] = +inp.value; saveS(); onchange(); };
      return el('label', {}, label, inp);
    };
    const check = (key, label, onchange) => {
      const inp = el('input', { type: 'checkbox', checked: S[key] });
      inp.onchange = () => { S[key] = inp.checked; saveS(); onchange(); };
      return el('label', { className: 'chk' }, label, inp);
    };
    const forces = () => { applyForces(); fg.d3ReheatSimulation(); };
    const groups = Object.entries(CATS).map(([c, name]) => {
      const g = el('div', { className: 'grp' + (S.hidden.includes(c) ? ' off' : '') }, el('i', { style: `background:${COLOR[c]}` }), name);
      g.onclick = () => { S.hidden = S.hidden.includes(c) ? S.hidden.filter((x) => x !== c) : [...S.hidden, c]; g.classList.toggle('off'); saveS(); refreshGraph(); };
      return g;
    });
    $('graph-settings').replaceChildren(
      el('h4', { textContent: 'Фильтры' }),
      check('showMine', 'Мои заметки на графе', () => refreshGraph()),
      el('h4', { textContent: 'Темы (клик — скрыть)' }), ...groups,
      el('h4', { textContent: 'Отображение' }),
      check('arrows', 'Стрелки направления', () => fg.linkDirectionalArrowLength(fg.linkDirectionalArrowLength())),
      slider('textFade', 'Порог подписей', 0.3, 3, 0.05, () => {}),
      slider('nodeSize', 'Размер узлов', 0.5, 2.5, 0.05, () => fg.nodeVal(fg.nodeVal())),
      slider('linkWidth', 'Толщина связей', 0.3, 3, 0.1, () => {}),
      el('h4', { textContent: 'Силы' }),
      slider('center', 'Притяжение к центру', 0, 0.3, 0.01, forces),
      slider('repel', 'Отталкивание', 20, 400, 5, forces),
      slider('linkStrength', 'Сила связей', 0.05, 1.5, 0.05, forces),
      slider('linkDist', 'Длина связей', 10, 150, 1, forces),
      slider('cluster', 'Группировка по темам', 0, 0.4, 0.01, forces),
      el('button', { className: 'reset', textContent: 'Сбросить настройки', onclick: () => { Object.assign(S, DEFAULTS, { hidden: [] }); saveS(); settingsPanel(); refreshGraph(); } }),
    );
  }
  settingsPanel();
  $('graph-settings-btn').onclick = () => { $('graph-settings').hidden = !$('graph-settings').hidden; };

  // ---------- локальный граф ----------
  let lfg = null, localDepth = 1, localFor = null;
  document.querySelectorAll('[data-depth]').forEach((b) => { b.onclick = () => {
    localDepth = +b.dataset.depth; document.querySelectorAll('[data-depth]').forEach((x) => x.classList.toggle('on', x === b)); if (localFor) localGraph(localFor);
  }; });
  function localGraph(id) {
    localFor = id;
    const full = buildData(false);
    const nb = new Map(full.nodes.map((n) => [n.id, new Set()]));
    for (const l of full.links) { nb.get(l.source)?.add(l.target); nb.get(l.target)?.add(l.source); }
    const ids = new Set([id]);
    for (let d = 0; d < localDepth; d++) for (const x of [...ids]) for (const y of nb.get(x) || []) ids.add(y);
    const nodes = full.nodes.filter((n) => ids.has(n.id)).map((n) => ({ ...n, x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 60 }));
    const links = full.links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l }));
    if (!lfg) {
      lfg = ForceGraph()($('local-graph')).backgroundColor('rgba(0,0,0,0)').nodeId('id').nodeLabel(() => '')
        .linkColor(() => 'rgba(160,160,160,.35)').linkWidth(0.8).d3AlphaDecay(0.03).cooldownTime(6000).minZoom(0.3).maxZoom(6)
        .onNodeClick((n) => go(n.id)).onNodeDragEnd((n) => { n.fx = undefined; n.fy = undefined; })
        .nodePointerAreaPaint((n, c, ctx) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.x, n.y, 7, 0, 2 * Math.PI); ctx.fill(); })
        .nodeCanvasObject((n, ctx, scale) => {
          const me = n.id === localFor, r = me ? 6 : 4;
          if (me) { ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.2, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(168,139,250,.3)'; ctx.fill(); }
          ctx.beginPath(); if (n.kind === 'mine') ctx.rect(n.x - r, n.y - r, 2 * r, 2 * r); else ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = colorOf(n); ctx.fill();
          const fs = (me ? 11.5 : 10) / scale; ctx.font = `${me ? 600 : 400} ${fs}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineWidth = 3 / scale; ctx.strokeStyle = '#1e1e1e';
          ctx.strokeText(n.name, n.x, n.y + r + 2 / scale); ctx.fillStyle = me ? '#fff' : '#bdbdbd'; ctx.fillText(n.name, n.x, n.y + r + 2 / scale);
        });
      lfg.d3Force('charge').strength(-110); lfg.d3Force('link').distance(42);
      lfg.onEngineStop(() => lfg.zoomToFit(300, 24));
    }
    resizeGraphs();
    lfg.graphData({ nodes, links });
    setTimeout(() => lfg.zoomToFit(400, 24), 800);
  }
  const linkRow = (x) => row({ onclick: () => go(x.id), title: isMine(x.id) ? '' : T[x.id]?.simple || '' }, isMine(x.id) ? el('span', { className: 'mine-dot' }) : null,
    el('span', { className: 'lbl', textContent: titleOf(x.id) }), el('small', { textContent: x.label }));
  function sidePanel(id) {
    const o = isMine(id) ? [...new Set(linksIn(mineById(id)?.body))].map((x) => ({ id: x, label: 'упоминает' }))
      : [...(out[id] || []), ...[...new Set(linksIn(notes.terms[id]))].map((x) => ({ id: x, label: 'в моих заметках' }))];
    const i = [...(isMine(id) ? [] : inc[id] || []), ...mentionsOf(id).map((x) => ({ id: x, label: 'упоминает' }))];
    $('bl-count').textContent = i.length; $('ol-count').textContent = o.length;
    const none = () => el('div', { className: 'none', textContent: 'нет' });
    $('backlinks').replaceChildren(...(i.length ? i.map(linkRow) : [none()]));
    $('outlinks').replaceChildren(...(o.length ? o.map(linkRow) : [none()]));
    localGraph(id);
  }

  // ---------- редактор с подсказками [[ ----------
  let acState = null;
  function attachAutocomplete(ta) {
    ta.addEventListener('input', () => {
      const pos = ta.selectionStart, m = ta.value.slice(0, pos).match(/\[\[([^\]\n]*)$/);
      if (!m) { closeAc(); return; }
      const q = norm(m[1]);
      const cand = [...terms.map((t) => ({ name: t.term, sub: t.en })), ...notes.mine.map((n) => ({ name: n.title || 'Без названия', sub: 'моя заметка' }))]
        .filter((c) => !q || norm(c.name).includes(q) || norm(c.sub).includes(q)).slice(0, 10);
      if (!cand.length) { closeAc(); return; }
      const r = ta.getBoundingClientRect();
      acState = { ta, start: pos - m[1].length, cand, sel: 0 };
      const ac = $('ac'); ac.hidden = false; ac.style.left = `${r.left + 16}px`; ac.style.top = `${Math.min(r.bottom - 10, innerHeight - 280)}px`;
      renderAc();
    });
    ta.addEventListener('keydown', (e) => {
      if (!acState) return;
      if (e.key === 'ArrowDown') { acState.sel = Math.min(acState.sel + 1, acState.cand.length - 1); renderAc(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { acState.sel = Math.max(acState.sel - 1, 0); renderAc(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === 'Tab') { pickAc(acState.sel); e.preventDefault(); }
      else if (e.key === 'Escape') closeAc();
    });
    ta.addEventListener('blur', () => setTimeout(closeAc, 150));
  }
  function renderAc() {
    $('ac').replaceChildren(...acState.cand.map((c, i) => { const li = el('li', { onmousedown: (e) => { e.preventDefault(); pickAc(i); } }, c.name, el('small', { textContent: c.sub })); li.setAttribute('aria-selected', i === acState.sel); return li; }));
  }
  function pickAc(i) {
    const { ta, start, cand } = acState; const c = cand[i];
    const after = ta.value.slice(ta.selectionStart).replace(/^[^\]\n]*\]\]/, '');
    ta.value = ta.value.slice(0, start) + c.name + ']]' + after;
    const p = start + c.name.length + 2; ta.setSelectionRange(p, p); ta.dispatchEvent(new Event('input')); closeAc(); ta.focus();
  }
  function closeAc() { acState = null; $('ac').hidden = true; }

  function notesBlock(id) {
    const box = el('div', { className: 'my-notes' });
    const view = el('div', { className: 'md' }); view.innerHTML = md(notes.terms[id]);
    const edit = el('button', { className: 'btn', textContent: notes.terms[id]?.trim() ? 'Изменить' : 'Написать' });
    edit.onclick = () => {
      const ta = el('textarea', { className: 'editor', value: notes.terms[id] || '', placeholder: 'Мысли, цитаты, где термин пойдёт в ВКР… Ссылки: [[Задержка]]' });
      attachAutocomplete(ta);
      ta.addEventListener('input', () => { notes.terms[id] = ta.value; saveNotes(); });
      const done = el('button', { className: 'btn primary', textContent: 'Готово', onclick: () => { notes.terms[id] = ta.value; saveNotes(); renderMineTree(); refreshGraph(false); renderNote(id); } });
      box.replaceChildren(el('div', { className: 'hd' }, 'Мои заметки', done), ta);
      ta.focus();
    };
    box.append(el('div', { className: 'hd' }, 'Мои заметки', edit), view);
    return box;
  }

  // ---------- заметка о термине ----------
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
      el('div', { className: 'ask' }, el('button', { className: 'btn', textContent: '✦ Спросить Claude про этот термин', onclick: () => askClaude(id) }), ' ',
        el('button', { className: 'btn', textContent: mastered(id) ? '✓ Изучено' : '★ Учить этот термин', onclick: () => { openTab({ kind: 'learn' }); startSession('cards', [id]); } })),
      notesBlock(id),
      el('div', { className: 'api-line' }, 'JSON: ', el('a', { href: jsonUrl, target: '_blank', textContent: jsonUrl })),
    ].filter(Boolean));
    $('note-pane').scrollTop = 0;
    sidePanel(id);
    history.replaceState(null, '', `#${id}`);
  }

  // ---------- своя заметка ----------
  function newNote() {
    const n = { id: `n-${Date.now().toString(36)}`, title: 'Новая заметка', body: '', updated: Date.now(), created: Date.now() };
    notes.mine.push(n); saveNotes(); renderMineTree(); refreshGraph(false); go(n.id);
    setTimeout(() => { const i = document.querySelector('#mine .title-input'); i?.focus(); i?.select(); }, 50);
  }
  function renderMine(id) {
    const n = mineById(id); if (!n) return;
    const title = el('input', { className: 'title-input', value: n.title });
    const ta = el('textarea', { className: 'editor', value: n.body, placeholder: 'Черновик параграфа, мысли, цитаты. Наберите [[ — появятся подсказки терминов.' });
    const preview = el('div', { className: 'md' });
    const save = () => { n.title = title.value.trim() || 'Без названия'; n.body = ta.value; n.updated = Date.now(); saveNotes(); preview.innerHTML = md(n.body); renderTabs(); };
    title.addEventListener('input', save); ta.addEventListener('input', save);
    title.addEventListener('change', () => { renderMineTree(); refreshGraph(false); });
    ta.addEventListener('blur', () => { renderMineTree(); refreshGraph(false); sidePanel(id); });
    attachAutocomplete(ta);
    preview.innerHTML = md(n.body);
    const dl = () => download(`${safe(n.title)}.md`, new Blob([`# ${n.title}\n\n${n.body}\n`], { type: 'text/markdown' }));
    const del = () => { if (!confirm(`Удалить заметку «${n.title}»?`)) return; notes.mine = notes.mine.filter((x) => x.id !== id); saveNotes(); renderMineTree(); refreshGraph(false); closeTab(active); };
    $('mine').replaceChildren(title,
      el('div', { className: 'note-meta' }, `изменено ${new Date(n.updated).toLocaleString('ru')} · хранится в этом браузере`,
        el('button', { className: 'btn', textContent: '⇩ .md', onclick: dl }), el('button', { className: 'btn danger', textContent: 'Удалить', onclick: del })),
      ta, el('h2', { textContent: 'Просмотр' }), preview);
    sidePanel(id);
    history.replaceState(null, '', `#${id}`);
  }
  $('new-note').onclick = newNote;

  // ---------- план ВКР ----------
  $('plan').append(el('h1', { textContent: 'План ВКР' }),
    el('p', { className: 'plan-intro', textContent: 'Главы и параграфы диплома и термины, которые в них используются. Каждый термин глоссария привязан хотя бы к одному параграфу — лишних терминов нет.' }));
  for (const ch of plan) {
    $('plan').append(el('h2', { textContent: ch.title }));
    for (const s of ch.sections || [{ id: ch.id, title: '', about: ch.about, terms: ch.terms }]) {
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

  // ---------- быстрый переход ----------
  let items = [], sel = 0;
  function search(q) {
    const w = norm(q);
    const all = [...terms.map((t) => ({ id: t.id, name: t.term, en: t.en, sub: t.simple, text: t.simple + ' ' + t.definition, color: COLOR[t.category] })),
      ...notes.mine.map((n) => ({ id: n.id, name: n.title || 'Без названия', en: '', sub: 'моя заметка', text: n.body, color: MINE_COLOR }))];
    if (!w) return all.sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0)).slice(0, 12);
    return all.map((t) => [norm(t.name).startsWith(w) || norm(t.en).startsWith(w) ? 3 : norm(t.name).includes(w) || norm(t.en).includes(w) ? 2 : norm(t.text).includes(w) ? 1 : 0, t])
      .filter(([s]) => s).sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name, 'ru')).map(([, t]) => t).slice(0, 30);
  }
  function renderResults() {
    $('results').replaceChildren(...items.map((t, i) => {
      const li = el('li', { role: 'option', onmousedown: () => pick(i) }, el('div', { className: 't' }, el('i', { style: `background:${t.color}` }), t.name), el('small', { textContent: t.sub }));
      li.setAttribute('aria-selected', i === sel); return li;
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
    if (e.altKey && e.code === 'KeyN') { e.preventDefault(); newNote(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); activate(0); }
    if (e.key === 'Escape') { closeSwitcher(); $('graph-settings').hidden = true; }
  });

  // ---------- экспорт хранилища для Obsidian (zip без сжатия, без библиотек) ----------
  const safe = (s) => s.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  function download(name, blob) { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0, size = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(h, name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(c, name); size += 46 + name.length;
      off += 30 + name.length + data.length;
    }
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, e], { type: 'application/zip' });
  }
  function vaultFiles() {
    const files = [], root = 'Глоссарий ВКР/';
    const secTitle = {}; for (const ch of plan) for (const s of ch.sections || [{ id: ch.id, title: 'Введение' }]) secTitle[s.id] = s.id === 'intro' ? 'Введение' : `${s.id} ${s.title}`;
    for (const t of terms) {
      const rel = (out[t.id] || []).map((r) => `- ${r.label}: [[${T[r.id].term}]]`).concat((inc[t.id] || []).map((r) => `- ← ${r.label}: [[${T[r.id].term}]]`));
      files.push({ name: `${root}${safe(CATS[t.category])}/${safe(t.term)}.md`, text: [
        '---', `aliases: [${JSON.stringify(t.en)}]`, `tags: [${t.category}]`, `vkr: [${t.vkr.map((s) => JSON.stringify(secTitle[s])).join(', ')}]`, '---', '',
        '> [!info] Простыми словами', `> ${t.simple}`, '', '## Определение', t.definition, '',
        '## Где в ВКР', ...t.vkr.map((s) => `- [[План ВКР#${secTitle[s]}]]`), '', '## Связи', ...rel, '',
        '## Источники', ...(SRC_OF[t.id] || []).map((s) => `- ${SRC[s].title}${SRC[s].url ? ` — ${SRC[s].url}` : ''}`), '',
        ...(notes.terms[t.id]?.trim() ? ['## Мои заметки', notes.terms[t.id], ''] : [])].join('\n') });
    }
    const planMd = ['# План ВКР', ''];
    for (const ch of plan) {
      planMd.push(`## ${ch.title}`, '');
      for (const s of ch.sections || [{ id: ch.id, title: '', about: ch.about, terms: ch.terms }]) {
        if (s.title) planMd.push(`### ${secTitle[s.id]}`);
        planMd.push(s.about || '', '', s.terms.map((x) => `[[${T[x.id].term}]]`).join(' · '), '');
      }
    }
    files.push({ name: `${root}План ВКР.md`, text: planMd.join('\n') });
    for (const n of notes.mine) files.push({ name: `${root}Мои заметки/${safe(n.title || 'Без названия')}.md`, text: `# ${n.title}\n\n${n.body}\n` });
    files.push({ name: `${root}README.md`, text: `# Глоссарий ВКР\n\nЭкспорт ${new Date().toLocaleString('ru')}: ${terms.length} терминов, план ВКР${notes.mine.length ? `, моих заметок: ${notes.mine.length}` : ''}.\nВ Obsidian: «Open folder as vault» → эта папка, затем Graph view.\n` });
    return files;
  }
  $('export-vault').onclick = () => download('vkr-glossary-obsidian.zip', zip(vaultFiles()));
  window.__vaultFiles = vaultFiles;  // для автотеста экспорта


  // ---------- телефон: нижняя навигация ----------
  const isM = () => innerWidth < 760;
  function setMobile() { document.body.classList.toggle('m', isM()); resizeGraphs(); }
  addEventListener('resize', setMobile);
  function syncBottomNav() {
    const k = document.body.classList.contains('m-tree') ? 'tree' : tabs[active]?.kind === 'note' ? 'tree' : tabs[active]?.kind;
    document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === k));
  }
  document.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => {
    const k = b.dataset.m;
    if (k === 'graph') activate(0);
    else if (k === 'plan') openTab({ kind: 'plan' });
    else if (k === 'learn') openTab({ kind: 'learn' });
    else { document.querySelector(`[data-tree="${k === 'mine' ? 'mine' : 'files'}"]`).click(); document.body.classList.add('m-tree'); }
    syncBottomNav();
  }; });

  // ---------- обучение: карточки с интервальным повторением и тесты ----------
  const LEARN_KEY = 'vkr-learn-v1';
  const L = store.get(LEARN_KEY, { box: {}, seen: {} });
  const saveL = () => { store.set(LEARN_KEY, L); markKnown(); };
  const boxOf = (id) => L.box[id] || 0;
  const mastered = (id) => boxOf(id) >= 3;
  const course = [];  // порядок изучения = порядок плана ВКР
  for (const ch of plan) for (const s of ch.sections || [{ id: ch.id, title: 'Введение', terms: ch.terms }]) {
    course.push({ id: s.id, title: s.id === 'intro' ? 'Введение' : `${s.id} ${s.title}`, ids: s.terms.map((x) => x.id) });
  }
  const order = [...new Set(course.flatMap((c) => c.ids))];
  function markKnown() {
    document.querySelectorAll('.tree .row[data-id]').forEach((r) => { const m = r.querySelector('.known-mark'); if (m) m.textContent = mastered(r.dataset.id) ? '✓' : ''; });
    const n = order.filter(mastered).length;
    $('learn-progress').textContent = `${n}/${order.length}`;
  }
  markKnown();
  $('learn-entry').onclick = () => openTab({ kind: 'learn' });
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function grade(id, g) {  // g: 0 — не знаю, 1 — почти, 2 — знаю
    L.box[id] = g === 0 ? 1 : g === 1 ? Math.max(1, boxOf(id)) : Math.min(5, boxOf(id) + 1);
    L.seen[id] = Date.now(); saveL();
  }
  function askClaude(id) {
    const t = T[id];
    const text = `Объясни мне термин «${t.term}» (${t.en}) простыми словами и на примере моей ВКР: «Динамическое распределение вычислений между браузерным расширением и сервером при распознавании речи». Определение из моего глоссария: ${t.definition} Приведи аналогию из жизни, скажи, где этот термин появится в тексте ВКР, и задай мне 2 проверочных вопроса.`;
    navigator.clipboard?.writeText(text).then(() => toast('Вопрос скопирован — вставьте его в чат с Claude'), () => prompt('Скопируйте вопрос для Claude:', text));
  }
  function toast(msg) {
    const d = el('div', { textContent: msg, style: 'position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:#2f2f2f;border:1px solid #444;color:#eee;padding:10px 16px;border-radius:10px;z-index:80;font-size:14px;max-width:90vw;text-align:center' });
    document.body.append(d); setTimeout(() => d.remove(), 2600);
  }
  let session = null;
  function startSession(mode, ids) {
    const q = ids.slice(0, 10);
    if (!q.length) { toast('Здесь всё изучено — выберите другой раздел или режим'); return; }
    session = { mode, q, i: 0, right: 0, revealed: false, answered: null };
    renderLearn();
  }
  const nextLesson = () => course.find((c) => c.ids.some((id) => !mastered(id)));
  function renderLearn() {
    const box = $('learn');
    if (session) return renderSession(box);
    const n = order.length, done = order.filter(mastered).length, inProg = order.filter((id) => boxOf(id) > 0 && !mastered(id)).length;
    const lesson = nextLesson();
    const hard = order.filter((id) => boxOf(id) === 1);
    const mode = (title, sub, fn) => el('button', { className: 'mode', onclick: fn }, el('b', { textContent: title }), el('span', { textContent: sub }));
    box.replaceChildren(
      el('h1', { textContent: 'Учиться по глоссарию' }),
      el('p', { className: 'lead', textContent: 'Курс идёт по плану ВКР: от введения к результатам. Термин считается изученным, когда вы трижды подряд ответили «знаю». Прогресс хранится в этом браузере.' }),
      el('div', { className: 'bar' }, el('i', { style: `width:${(100 * done / n).toFixed(1)}%` })),
      el('div', { className: 'stat-row' },
        el('div', { className: 'stat' }, el('b', { textContent: `${done} / ${n}` }), el('span', { textContent: 'изучено' })),
        el('div', { className: 'stat' }, el('b', { textContent: inProg }), el('span', { textContent: 'в процессе' })),
        el('div', { className: 'stat' }, el('b', { textContent: hard.length }), el('span', { textContent: 'сложных — повторить' }))),
      el('div', { className: 'modes' },
        mode(lesson ? `▶ Урок: ${lesson.title}` : '✓ Все уроки пройдены', lesson ? 'Карточки: термин → вспомнить → проверить себя' : 'Повторите сложные или пройдите тест',
          () => lesson && startSession('cards', lesson.ids.filter((id) => !mastered(id)))),
        mode('? Тест: что это значит', 'Термин → выбрать правильное объяснение из четырёх', () => startSession('quiz', shuffle(order.filter((id) => !mastered(id)).slice(0, 30)))),
        mode('⇄ Тест наоборот', 'Объяснение → угадать термин', () => startSession('reverse', shuffle(order.filter((id) => boxOf(id) > 0).concat(order.filter((id) => !boxOf(id))).slice(0, 30)))),
        mode('↻ Повторить сложные', hard.length ? `${hard.length} терминов, где вы ошибались` : 'Пока нет — отлично', () => startSession('cards', shuffle(hard)))),
      el('h2', { textContent: 'По главам ВКР' }),
      el('div', { className: 'chapters' }, ...course.map((c) => {
        const d = c.ids.filter(mastered).length;
        return el('div', { className: 'ch' }, el('div', { className: 't', textContent: c.title }, el('small', { textContent: `${d} из ${c.ids.length} изучено` })),
          el('div', { className: 'bar' }, el('i', { style: `width:${(100 * d / c.ids.length).toFixed(0)}%` })),
          el('button', { className: 'btn', textContent: d === c.ids.length ? 'Повторить' : 'Учить', onclick: () => startSession('cards', d === c.ids.length ? shuffle(c.ids.slice()) : c.ids.filter((id) => !mastered(id))) }));
      })),
      el('p', { className: 'lead', style: 'margin-top:20px', textContent: 'Непонятно даже после объяснения — нажмите «Спросить Claude» на карточке: вопрос скопируется, и мы разберём термин в чате на примере вашей ВКР.' }),
      el('button', { className: 'btn danger', textContent: 'Сбросить прогресс', onclick: () => { if (confirm('Сбросить прогресс обучения?')) { L.box = {}; L.seen = {}; saveL(); renderLearn(); } } }),
    );
    $('learn-pane').scrollTop = 0;
  }
  function renderSession(box) {
    const s = session, id = s.q[s.i], t = T[id];
    const top = el('div', { className: 'session-top' }, el('button', { className: 'btn', textContent: '← К урокам', onclick: () => { session = null; renderLearn(); } }),
      el('div', { className: 'bar' }, el('i', { style: `width:${(100 * s.i / s.q.length).toFixed(0)}%` })), `${s.i + 1} / ${s.q.length}`);
    const next = () => { s.i++; s.revealed = false; s.answered = null; if (s.i >= s.q.length) { const r = s; session = null; renderDone(box, r); } else renderLearn(); };
    const where = t.vkr.map((x) => course.find((c) => c.id === x)?.title).filter(Boolean).join(' · ');
    const answer = () => el('div', { className: 'ans' },
      el('div', { className: 'callout' }, el('div', { className: 'ct', textContent: '💡 Простыми словами' }), el('p', { textContent: t.simple })),
      el('p', { textContent: t.definition }),
      el('p', { className: 'muted', textContent: `Где в ВКР: ${where}` }));
    const tools = el('div', { className: 'ask' }, el('button', { className: 'btn', textContent: 'Открыть заметку', onclick: () => go(id) }), ' ',
      el('button', { className: 'btn', textContent: '✦ Спросить Claude', onclick: () => askClaude(id) }));
    let card;
    if (s.mode === 'cards') {
      card = el('div', { className: 'card' }, el('div', { className: 'cat', style: `color:${COLOR[t.category]}`, textContent: CATS[t.category] }),
        el('div', { className: 'q', textContent: t.term }), el('div', { className: 'en', textContent: t.en !== t.term ? t.en : '' }),
        s.revealed ? answer() : el('p', { className: 'muted', textContent: 'Вспомните, что это значит, — потом проверьте себя.' }));
      const actions = s.revealed
        ? el('div', { className: 'learn-actions' },
          el('button', { className: 'btn bad', textContent: '✗ Не знаю', onclick: () => { grade(id, 0); s.q.push(id); next(); } }),
          el('button', { className: 'btn mid', textContent: '~ Почти', onclick: () => { grade(id, 1); next(); } }),
          el('button', { className: 'btn good', textContent: '✓ Знаю', onclick: () => { grade(id, 2); s.right++; next(); } }))
        : el('button', { className: 'btn primary', style: 'width:100%;padding:12px', textContent: 'Показать ответ', onclick: () => { s.revealed = true; renderLearn(); } });
      box.replaceChildren(top, card, actions, tools);
    } else {
      const reverse = s.mode === 'reverse';
      s.opts ??= {};
      if (!s.opts[s.i]) {
        const same = terms.filter((x) => x.id !== id && x.category === t.category), other = terms.filter((x) => x.id !== id && x.category !== t.category);
        s.opts[s.i] = shuffle([t, ...shuffle(same).slice(0, 2), ...shuffle(other).slice(0, 1)]);
      }
      const opts = s.opts[s.i];
      card = el('div', { className: 'card' },
        el('div', { className: 'cat', style: `color:${COLOR[t.category]}`, textContent: reverse ? 'Какой это термин?' : 'Что значит этот термин?' }),
        el('div', { className: 'q', style: reverse ? 'font-size:19px;font-weight:500' : '', textContent: reverse ? t.simple : t.term }),
        el('div', { className: 'opts' }, ...opts.map((o) => {
          const b = el('button', { className: 'opt', textContent: reverse ? o.term : o.simple });
          if (s.answered) { if (o.id === id) b.classList.add('right'); else if (o.id === s.answered) b.classList.add('wrong'); }
          else b.onclick = () => { s.answered = o.id; const ok = o.id === id; grade(id, ok ? 2 : 0); if (ok) s.right++; renderLearn(); };
          return b;
        })),
        s.answered ? answer() : null);
      box.replaceChildren(top, card, s.answered ? el('button', { className: 'btn primary', style: 'width:100%;padding:12px', textContent: 'Дальше →', onclick: next }) : null, tools);
    }
    $('learn-pane').scrollTop = 0;
  }
  function renderDone(box, s) {
    box.replaceChildren(el('h1', { textContent: 'Готово!' }),
      el('p', { className: 'lead', textContent: `Правильно: ${s.right} из ${s.q.length}. Изучено всего: ${order.filter(mastered).length} из ${order.length}.` }),
      el('button', { className: 'btn primary', textContent: 'К урокам', onclick: () => renderLearn() }));
  }

  // ---------- старт: по ссылке сразу открывается граф ----------
  setMobile();
  applyLayout();
  addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if ((T[h] || mineById(h)) && tabs[active]?.id !== h) go(h); });
  renderTabs();
  const h0 = decodeURIComponent(location.hash.slice(1));
  if (T[h0] || mineById(h0)) go(h0);
  else if (h0 === 'plan') openTab({ kind: 'plan' });
  else if (h0 === 'learn') openTab({ kind: 'learn' });
  else { activate(0); sidePanel('adaptive-strategy'); }
})();
