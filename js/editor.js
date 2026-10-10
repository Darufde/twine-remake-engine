// The story editor: passage map, passage panel with blocks, and the Stats & Items window.
(function () {
  const TR = window.TR;
  const h = TR.h;
  const CARD_W = 200;
  const CARD_H = 104;
  const GRID = 20;
  const $ = (sel) => document.querySelector(sel);

  const E = (TR.editor = {});
  let story = null;
  let openId = null;
  let zoom = 1;
  let codeOpen = false;
  let codePre = null;

  const BLOCK_INFO = {
    text: { icon: '📝', name: 'Text', hint: 'Words the reader sees' },
    choice: { icon: '🔀', name: 'Choice', hint: 'A button that takes the reader to another passage' },
    set: { icon: '🔢', name: 'Change a stat', hint: 'Set or change gold, health, a name…' },
    item: { icon: '🎒', name: 'Give / take item', hint: 'Add or remove an item from a list (inventory)' },
    if: { icon: '❓', name: 'If… (condition)', hint: 'Only show things when something is true' },
    random: { icon: '🎲', name: 'Random number', hint: 'Roll a dice and save the result in a stat' },
    goto: { icon: '➡️', name: 'Jump to passage', hint: 'Send the reader to another passage automatically' },
  };

  // ---------- saving & refreshing ----------

  const saveSoon = TR.debounce(() => TR.saveAll(), 300);
  function touch() {
    story.updated = Date.now();
    saveSoon();
  }
  let dragging = false;
  const mapSoon = TR.debounce(() => {
    if (dragging) mapSoon();
    else if (story) renderMap();
  }, 250);
  const codeSoon = TR.debounce(() => {
    const p = current();
    if (codeOpen && codePre && p) codePre.textContent = TR.compilePassage(story, p);
  }, 200);

  // After typing: save, and refresh the map and code preview a moment later.
  function soft() {
    touch();
    mapSoon();
    codeSoon();
  }
  // After a structural change (block added, dropdown changed...): redraw everything.
  function refresh() {
    touch();
    renderPanel();
    renderMap();
  }

  const current = () => story && story.passages.find((p) => p.id === openId);
  const varOf = (id) => story.variables.find((v) => v.id === id);

  // ---------- opening a story ----------

  E.open = (s) => {
    story = s;
    openId = null;
    zoom = 1;
    renderTopbar();
    renderMap();
    closePanel();
    const map = $('#map');
    map.scrollLeft = Math.max(0, Math.min(...story.passages.map((p) => p.x)) - 60);
    map.scrollTop = Math.max(0, Math.min(...story.passages.map((p) => p.y)) - 60);
  };

  E.currentStory = () => story;

  E.close = () => {
    TR.saveAll();
    story = null;
    openId = null;
  };

  // ---------- top bar ----------

  function renderTopbar() {
    const bar = $('#topbar');
    bar.innerHTML = '';
    const pct = h('span', { class: 'zoom-pct', text: Math.round(zoom * 100) + '%' });
    const setZoom = (z) => {
      zoom = Math.min(1.5, Math.max(0.4, Math.round(z * 10) / 10));
      pct.textContent = Math.round(zoom * 100) + '%';
      renderMap();
    };
    bar.append(
      h('button', { class: 'btn btn-ghost', onclick: () => TR.app.showLibrary() }, '← My Stories'),
      h('button', { class: 'story-title', title: 'Click to rename the story', onclick: renameStory }, story.name, h('span', { class: 'pencil' }, ' ✎')),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: addPassageFromToolbar }, '＋ New passage'),
      h('button', { class: 'btn', onclick: openVariables }, '📊 Stats & Items'),
      h('button', { class: 'btn btn-play', onclick: () => TR.app.play(story) }, '▶ Play'),
      h('button', { class: 'btn', onclick: (e) => exportMenu(e.currentTarget) }, '⬇ Export ▾'),
      h('div', { class: 'zoom' },
        h('button', { class: 'icon-btn', title: 'Zoom out', onclick: () => setZoom(zoom - 0.1) }, '−'),
        pct,
        h('button', { class: 'icon-btn', title: 'Zoom in', onclick: () => setZoom(zoom + 0.1) }, '+')),
      h('button', { class: 'btn btn-ghost', onclick: () => TR.app.help() }, '❓ Help'),
      h('button', { class: 'btn btn-ghost', onclick: () => TR.app.toggleTheme() }, TR.app.themeButtonLabel()));
  }
  E.renderTopbar = renderTopbar;

  async function renameStory() {
    const name = await TR.askText({ title: 'Rename story', label: 'Story name', value: story.name, okLabel: 'Rename' });
    if (name) {
      story.name = name;
      touch();
      renderTopbar();
    }
  }

  function exportMenu(anchor) {
    const base = TR.safeFileName(story.name);
    TR.menu(anchor, [
      {
        label: '🎮 Playable game (.html)',
        hint: 'One file anyone can open in a browser to play',
        onClick: () => TR.download(base + '.html', TR.exportPlayable(story)),
      },
      {
        label: '🧶 Twine 2 file — SugarCube (.html)',
        hint: 'Open in Twine 2: Library → Import',
        onClick: () => {
          TR.download(base + '-twine.html', TR.exportTwineArchive(story));
          TR.toast('Saved! In Twine 2, go to Library → Import and pick this file.', 5000);
        },
      },
      {
        label: '📄 Twee file (.twee)',
        hint: 'Plain-text story file for Tweego / Twine',
        onClick: () => TR.download(base + '.twee', TR.exportTwee(story), 'text/plain'),
      },
      {
        label: '💾 Backup (.json)',
        hint: 'Load it back into Story Builder later',
        onClick: () => TR.download(base + '-backup.json', JSON.stringify(story, null, 2), 'application/json'),
      },
    ]);
  }

  // ---------- the map ----------

  function freeSpot(x, y) {
    x = Math.max(0, Math.round(x / GRID) * GRID);
    y = Math.max(0, Math.round(y / GRID) * GRID);
    let guard = 0;
    while (guard++ < 50 && story.passages.some((p) => Math.abs(p.x - x) < CARD_W + 20 && Math.abs(p.y - y) < CARD_H + 20)) {
      y += CARD_H + 40;
    }
    return { x, y };
  }

  function addPassageAt(x, y, name) {
    const spot = freeSpot(x, y);
    const p = TR.newPassage(story, name || 'Untitled Passage', spot.x, spot.y);
    touch();
    return p;
  }

  function addPassageFromToolbar() {
    const map = $('#map');
    const x = (map.scrollLeft + map.clientWidth / 2) / zoom - CARD_W / 2;
    const y = (map.scrollTop + map.clientHeight / 3) / zoom - CARD_H / 2;
    const p = addPassageAt(x, y);
    openPassage(p.id);
    const input = $('#panel .passage-name');
    if (input) { input.focus(); input.select(); }
  }

  function renderMap() {
    if (!story) return;
    const inner = $('#map-inner');
    const cards = $('#map-cards');
    const svg = $('#map-arrows');
    const labels = $('#map-labels');
    const w = Math.max(2400, ...story.passages.map((p) => p.x + CARD_W + 800));
    const hgt = Math.max(1600, ...story.passages.map((p) => p.y + CARD_H + 600));
    inner.style.width = w * zoom + 'px';
    inner.style.height = hgt * zoom + 'px';
    [cards, svg, labels].forEach((el) => {
      el.style.width = w + 'px';
      el.style.height = hgt + 'px';
      el.style.transform = `scale(${zoom})`;
    });
    svg.setAttribute('width', w);
    svg.setAttribute('height', hgt);

    cards.innerHTML = '';
    story.passages.forEach((p) => {
      const problems = TR.passageProblems(story, p);
      const isStart = p.id === story.startId;
      const handle = h('div', { class: 'card-handle', title: 'Drag me onto another passage to connect them.\nDrop me on empty space (or just click me) to make a new passage.' }, '＋');
      const card = h('div', {
        class: 'card' + (p.id === openId ? ' selected' : '') + (isStart ? ' start' : ''),
        style: { left: p.x + 'px', top: p.y + 'px', width: CARD_W + 'px', height: CARD_H + 'px' },
        title: 'Click to edit · drag to move',
        'data-id': p.id,
      },
      h('div', { class: 'card-title' }, isStart ? h('span', { class: 'badge-start', title: 'The story starts here' }, '⭐ ') : null, p.name),
      h('div', { class: 'card-snippet', text: TR.passageSnippet(p) || 'Empty — click to write' }),
      problems.length ? h('div', { class: 'card-warn', title: problems.join('\n') }, `⚠ ${problems.length} to fix`) : null,
      handle);
      card.addEventListener('pointerdown', (e) => startDrag(e, p, card));
      handle.addEventListener('pointerdown', (e) => startConnect(e, p, handle));
      cards.appendChild(card);
    });
    renderArrows();
    renderTip();
  }

  function startDrag(e, p, card) {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = p.x, oy = p.y;
    let moved = false;
    dragging = true;
    card.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      card.classList.add('dragging');
      p.x = Math.max(0, ox + dx);
      p.y = Math.max(0, oy + dy);
      card.style.left = p.x + 'px';
      card.style.top = p.y + 'px';
      renderArrows();
    };
    const up = () => {
      dragging = false;
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerup', up);
      card.removeEventListener('pointercancel', up);
      if (moved) {
        p.x = Math.round(p.x / GRID) * GRID;
        p.y = Math.round(p.y / GRID) * GRID;
        touch();
        renderMap();
      } else {
        openPassage(p.id);
      }
    };
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerup', up);
    card.addEventListener('pointercancel', up);
  }

  // ---------- connecting passages by dragging the ＋ handle ----------

  // Map coordinates (unzoomed) for a mouse/finger position.
  function mapPoint(ev) {
    const r = $('#map-cards').getBoundingClientRect();
    return [(ev.clientX - r.left) / zoom, (ev.clientY - r.top) / zoom];
  }

  function cardUnder(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const card = el && el.closest('.card');
    return card ? story.passages.find((p) => p.id === card.dataset.id) : null;
  }

  function onMap(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    return !!el && $('#map').contains(el);
  }

  function startConnect(e, from, handle) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    const svg = $('#map-arrows');
    const start = [from.x + CARD_W, from.y + CARD_H / 2];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('class', 'arrow arrow-new');
    line.setAttribute('marker-end', 'url(#arrowhead-new)');
    let moved = false;
    let target = null;
    const sx = e.clientX, sy = e.clientY;
    const mark = (p) => {
      document.querySelectorAll('.card.drop-target').forEach((c) => c.classList.remove('drop-target'));
      if (p) { const c = document.querySelector(`.card[data-id="${p.id}"]`); if (c) c.classList.add('drop-target'); }
    };
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!moved) { moved = true; svg.appendChild(line); document.body.classList.add('connecting'); }
      const pt = mapPoint(ev);
      line.setAttribute('d', `M${start[0]},${start[1]} L${pt[0]},${pt[1]}`);
      const over = cardUnder(ev);
      target = over && over !== from ? over : null;
      mark(target);
    };
    const up = async (ev) => {
      cancel();
      if (!moved) {
        // Just a click: make the next passage to the right.
        await connectToNew(from, from.x + CARD_W + 180, from.y);
      } else if (target) {
        connect(from, target);
      } else if (!cardUnder(ev) && onMap(ev)) {
        const pt = mapPoint(ev);
        await connectToNew(from, pt[0] - CARD_W / 2, pt[1] - CARD_H / 2);
      }
    };
    const cancel = () => {
      dragging = false;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      line.remove();
      mark(null);
      document.body.classList.remove('connecting');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancel);
  }

  // Add a choice button in `from` that goes to `to`.
  function connect(from, to, label) {
    if (linkBlocks(from.blocks).some(({ block }) => block.type === 'choice' && block.target === to.id)) {
      TR.toast(`👍 "${from.name}" already has a button that goes to "${to.name}".`, 3500);
      return;
    }
    from.blocks.push({ type: 'choice', label: label || to.name, target: to.id, actions: [] });
    touch();
    if (openId === from.id) renderPanel();
    renderMap();
    TR.toast(`🔗 Connected! "${from.name}" now has a button that goes to "${to.name}".`, 3500);
  }

  async function connectToNew(from, x, y) {
    const name = await TR.askText({
      title: '➕ What happens next?',
      label: 'Give the new passage a short name',
      hint: 'This is also the words on the button the reader clicks. Example: "Open the door"',
      value: '',
      okLabel: 'Make it!',
    });
    if (name === null) return;
    const to = addPassageAt(x, y, name || 'Next');
    connect(from, to, name || 'Next');
  }

  // ---------- arrows ----------

  // Point on the edge of a card, heading from `from` toward `to`.
  function edgePoint(from, to) {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const sx = dx ? (CARD_W / 2 + 8) / Math.abs(dx) : Infinity;
    const sy = dy ? (CARD_H / 2 + 8) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy, 1);
    return [from[0] + dx * s, from[1] + dy * s];
  }

  // Every choice/jump block in a passage, with the list it lives in.
  function linkBlocks(blocks, out = []) {
    blocks.forEach((b) => {
      if ((b.type === 'choice' || b.type === 'goto') && b.target) out.push({ block: b, list: blocks });
      if (b.type === 'if') {
        b.branches.forEach((br) => linkBlocks(br.blocks, out));
        if (b.hasElse) linkBlocks(b.elseBlocks, out);
      }
    });
    return out;
  }

  const shorten = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function renderArrows() {
    const svg = $('#map-arrows');
    const labels = $('#map-labels');
    const byId = {};
    story.passages.forEach((p) => { byId[p.id] = p; });
    let paths = '';
    labels.innerHTML = '';
    story.passages.forEach((p) => {
      const perTarget = {};
      linkBlocks(p.blocks).forEach(({ block, list }) => {
        const t = byId[block.target];
        if (!t) return;
        if (t === p) {
          const n = (perTarget[t.id] = (perTarget[t.id] || 0) + 1);
          labels.appendChild(h('button', {
            type: 'button',
            class: 'arrow-label arrow-label-' + block.type + (openId === p.id ? ' active' : ''),
            style: { left: p.x + CARD_W / 2 + 'px', top: p.y - 16 - (n - 1) * 26 + 'px' },
            title: 'This goes back to the same passage. Click to change or remove it.',
            onclick: (ev) => linkMenu(ev.currentTarget, p, t, block, list),
          }, '🔁 ' + (block.type === 'goto' ? 'jumps to itself' : shorten(block.label || t.name, 24))));
          return;
        }
        const a = [p.x + CARD_W / 2, p.y + CARD_H / 2];
        const b = [t.x + CARD_W / 2, t.y + CARD_H / 2];
        const s = edgePoint(a, b), e = edgePoint(b, a);
        const dx = e[0] - s[0], dy = e[1] - s[1];
        const len = Math.hypot(dx, dy) || 1;
        const off = Math.min(40, len * 0.15);
        const cx = (s[0] + e[0]) / 2 - (dy / len) * off;
        const cy = (s[1] + e[1]) / 2 + (dx / len) * off;
        const n = (perTarget[t.id] = (perTarget[t.id] || 0) + 1);
        const active = openId && (p.id === openId || t.id === openId);
        if (n === 1) {
          paths += `<path d="M${s[0]},${s[1]} Q${cx},${cy} ${e[0]},${e[1]}" class="arrow arrow-${block.type}${active ? ' arrow-active' : ''}" marker-end="url(#arrowhead${active ? '-active' : ''})"/>`;
        }
        // The middle of the curve, where the button words go.
        const mx = 0.25 * s[0] + 0.5 * cx + 0.25 * e[0];
        const my = 0.25 * s[1] + 0.5 * cy + 0.25 * e[1] + (n - 1) * 26;
        const text = block.type === 'goto' ? '➡️ jumps here' : '🔘 ' + shorten(block.label || t.name, 26);
        labels.appendChild(h('button', {
          type: 'button',
          class: 'arrow-label arrow-label-' + block.type + (active ? ' active' : ''),
          style: { left: mx + 'px', top: my + 'px' },
          title: 'Click to change or remove this connection',
          onclick: (ev) => linkMenu(ev.currentTarget, p, t, block, list),
        }, text));
      });
    });
    svg.innerHTML =
      '<defs>' +
      ['', '-active', '-new'].map((k) => `<marker id="arrowhead${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="arrowhead${k}"/></marker>`).join('') +
      '</defs>' + paths;
  }

  function linkMenu(anchor, from, to, block, list) {
    const items = [];
    if (block.type === 'choice') {
      items.push({
        label: '✏️ Change the button words',
        hint: `Now: "${block.label || to.name}"`,
        onClick: async () => {
          const words = await TR.askText({ title: 'Button words', label: 'What should the button say?', value: block.label || to.name, okLabel: 'Save' });
          if (words) { block.label = words; touch(); if (openId === from.id) renderPanel(); renderMap(); }
        },
      });
    }
    items.push(
      {
        label: '✂️ Remove this connection',
        hint: `Unlink "${from.name}" → "${to.name}"`,
        onClick: async () => {
          if (block.actions && block.actions.length && !(await TR.confirmBox('This button also changes stats or items. Remove it anyway?', 'Remove'))) return;
          const i = list.indexOf(block);
          if (i !== -1) list.splice(i, 1);
          touch();
          if (openId === from.id) renderPanel();
          renderMap();
          TR.toast('✂️ Connection removed.');
        },
      },
      { label: `📝 Open "${shorten(from.name, 24)}"`, hint: 'The passage this arrow starts from', onClick: () => openPassage(from.id) },
      { label: `📝 Open "${shorten(to.name, 24)}"`, hint: 'The passage this arrow goes to', onClick: () => openPassage(to.id) });
    TR.menu(anchor, items);
  }

  // ---------- friendly tip on the map ----------

  const TIP_KEY = 'storyBuilder.hideMapTip';
  function renderTip() {
    const tip = $('#map-tip');
    let hidden = false;
    try { hidden = localStorage.getItem(TIP_KEY) === '1'; } catch (e) { /* storage blocked */ }
    tip.hidden = hidden;
    if (hidden) return;
    tip.innerHTML = '';
    tip.append(
      h('div', { class: 'tip-row' }, h('span', { class: 'tip-plus' }, '＋'), h('span', {}, h('strong', {}, 'Drag the ＋'), ' from a passage onto another passage to connect them.')),
      h('div', { class: 'tip-row' }, h('span', { class: 'tip-plus' }, '＋'), h('span', {}, h('strong', {}, 'Click the ＋'), ' (or drop it on empty space) to make a new passage.')),
      h('div', { class: 'tip-row' }, h('span', { class: 'tip-icon' }, '🔘'), h('span', {}, h('strong', {}, 'Click the words on an arrow'), ' to change them or cut the connection.')),
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => { try { localStorage.setItem(TIP_KEY, '1'); } catch (e) { /* storage blocked */ } tip.hidden = true; } }, 'Got it 👍'));
  }
  E.showTip = () => { try { localStorage.removeItem(TIP_KEY); } catch (e) { /* storage blocked */ } renderTip(); };

  E.initMap = () => {
    $('#map-inner').addEventListener('dblclick', (e) => {
      if (!story || e.target.closest('.card, .arrow-label')) return;
      const r = $('#map-cards').getBoundingClientRect();
      const p = addPassageAt((e.clientX - r.left) / zoom - CARD_W / 2, (e.clientY - r.top) / zoom - CARD_H / 2);
      openPassage(p.id);
      const input = $('#panel .passage-name');
      if (input) { input.focus(); input.select(); }
    });
  };

  // ---------- passage panel ----------

  function openPassage(id) {
    openId = id;
    $('#panel').scrollTop = 0;
    renderPanel();
    renderMap();
  }

  function closePanel() {
    openId = null;
    codePre = null;
    $('#panel').hidden = true;
    $('.workspace').classList.remove('panel-open');
    if (story) renderMap();
  }

  function renderPanel() {
    const panel = $('#panel');
    const p = current();
    if (!p) { closePanel(); return; }
    const scroll = panel.scrollTop;
    panel.hidden = false;
    $('.workspace').classList.add('panel-open');
    panel.innerHTML = '';

    const nameInput = h('input', { class: 'input passage-name', type: 'text', value: p.name, title: 'Passage name' });
    nameInput.addEventListener('change', () => {
      if (!TR.cleanPassageName(nameInput.value)) { nameInput.value = p.name; return; }
      p.name = TR.uniquePassageName(story, nameInput.value, p.id);
      nameInput.value = p.name;
      touch();
      renderMap();
      codeSoon();
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

    const isStart = p.id === story.startId;
    const problems = TR.passageProblems(story, p);

    codePre = h('pre', { class: 'code' });
    codePre.textContent = TR.compilePassage(story, p);
    const details = h('details', { class: 'code-box', ontoggle: () => { codeOpen = details.open; codeSoon(); } },
      h('summary', {}, '👀 Peek at the SugarCube code'),
      h('p', { class: 'hint', text: 'You never have to touch this. It is what gets sent to Twine when you export.' }),
      codePre);
    details.open = codeOpen;

    panel.append(...[
      h('div', { class: 'panel-head' },
        h('label', { class: 'panel-label', text: 'Passage name' }),
        h('div', { class: 'panel-name-row' }, nameInput, h('button', { class: 'icon-btn', title: 'Close', onclick: closePanel }, '✕'))),
      h('div', { class: 'panel-actions' },
        isStart
          ? h('span', { class: 'pill pill-start', title: 'Readers begin here' }, '⭐ Story starts here')
          : h('button', { class: 'btn btn-small', onclick: () => { story.startId = p.id; refresh(); } }, '⭐ Make this the start'),
        h('button', { class: 'btn btn-small', onclick: () => TR.app.play(story, p.id) }, '▶ Play from here'),
        h('button', { class: 'btn btn-small btn-danger-ghost', onclick: () => deletePassage(p) }, '🗑 Delete')),
      problems.length ? h('div', { class: 'problems' }, h('strong', { text: '⚠ Things to fix:' }), h('ul', {}, problems.map((t) => h('li', { text: t })))) : null,
      renderBlockList(p.blocks, 'main'),
      details,
    ].filter(Boolean));
    panel.scrollTop = scroll;
  }

  async function deletePassage(p) {
    if (p.id === story.startId) {
      TR.toast('This is where the story starts. Make another passage the start first.', 4000);
      return;
    }
    let incoming = 0;
    story.passages.forEach((x) => TR.walkBlocks(x.blocks, (b) => { if (b.target === p.id) incoming++; }));
    const msg = `Delete the passage "${p.name}"?` + (incoming ? ` ${incoming} choice(s) or jump(s) lead here and will need a new destination.` : '');
    if (!(await TR.confirmBox(msg, 'Delete passage'))) return;
    story.passages = story.passages.filter((x) => x !== p);
    story.passages.forEach((x) => TR.walkBlocks(x.blocks, (b) => { if (b.target === p.id) b.target = null; }));
    touch();
    closePanel();
  }

  // ---------- blocks ----------

  function renderBlockList(blocks, mode) {
    const wrap = h('div', { class: 'block-list' + (mode === 'actions' ? ' block-list-actions' : '') });
    blocks.forEach((b, i) => wrap.appendChild(renderBlock(b, blocks, i)));
    if (!blocks.length) {
      wrap.appendChild(h('div', { class: 'empty-hint', text: mode === 'actions' ? 'Nothing else happens.' : 'Nothing here yet — add something below.' }));
    }
    wrap.appendChild(addBar(blocks, mode));
    return wrap;
  }

  function addBar(blocks, mode) {
    const types = mode === 'actions' ? ['set', 'item', 'random'] : ['text', 'choice', 'set', 'item', 'if', 'random', 'goto'];
    return h('div', { class: 'add-bar' },
      h('span', { class: 'add-label', text: mode === 'actions' ? '＋ Also:' : '＋ Add:' }),
      types.map((t) => h('button', {
        class: 'add-btn add-' + t,
        type: 'button',
        title: BLOCK_INFO[t].hint,
        onclick: () => {
          const b = TR.blockDefaults(t);
          if (t === 'set' || t === 'random') {
            const v = story.variables.find((x) => t === 'set' || x.type === 'number');
            if (v) { b.varId = v.id; b.op = TR.SET_OPS[v.type][0][0]; if (v.type === 'flag') b.value = true; }
          }
          if (t === 'item') {
            const v = story.variables.find((x) => x.type === 'list');
            if (v) b.varId = v.id;
          }
          blocks.push(b);
          refresh();
        },
      }, `${BLOCK_INFO[t].icon} ${BLOCK_INFO[t].name}`)));
  }

  function blockIsEmpty(b) {
    if (b.type === 'text') return !b.text.trim();
    if (b.type === 'choice') return !b.label && !b.target && !b.actions.length;
    if (b.type === 'if') return b.branches.every((br) => !br.blocks.length) && !b.elseBlocks.length;
    return false;
  }

  function renderBlock(b, list, i) {
    const info = BLOCK_INFO[b.type];
    const tool = (label, title, disabled, fn) => h('button', { class: 'icon-btn small', type: 'button', title, disabled, onclick: fn }, label);
    const tools = h('div', { class: 'block-tools' },
      tool('↑', 'Move up', i === 0, () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; refresh(); }),
      tool('↓', 'Move down', i === list.length - 1, () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; refresh(); }),
      tool('⧉', 'Duplicate', false, () => { list.splice(i + 1, 0, TR.clone(b)); refresh(); }),
      tool('✕', 'Delete', false, async () => {
        if (!blockIsEmpty(b) && !(await TR.confirmBox(`Delete this "${info.name}" block?`, 'Delete'))) return;
        list.splice(i, 1);
        refresh();
      }));
    const bodies = { text: textBody, choice: choiceBody, set: setBody, item: itemBody, if: ifBody, random: randomBody, goto: gotoBody };
    return h('div', { class: 'block block-' + b.type },
      h('div', { class: 'block-head' }, h('span', { class: 'block-name', text: `${info.icon} ${info.name}` }), tools),
      h('div', { class: 'block-body' }, bodies[b.type](b)));
  }

  // ----- form helpers -----

  function select(options, value, onChange, cls) {
    const s = h('select', { class: 'input select' + (cls ? ' ' + cls : '') }, options.map(([v, l]) => h('option', { value: v }, l)));
    s.value = value == null ? '' : String(value);
    s.addEventListener('change', () => onChange(s.value, s));
    return s;
  }

  function textInput(value, placeholder, onInput, cls) {
    const el = h('input', { class: 'input' + (cls ? ' ' + cls : ''), type: 'text', placeholder });
    el.value = value == null ? '' : value;
    el.addEventListener('input', () => onInput(el.value));
    return el;
  }

  function numberInput(value, onInput) {
    const el = h('input', { class: 'input input-num', type: 'number', step: 'any' });
    el.value = value === '' || value == null ? 0 : value;
    el.addEventListener('input', () => onInput(el.value === '' ? 0 : Number(el.value)));
    return el;
  }

  function itemsDatalist() {
    const id = 'items-' + TR.uid();
    return { id, el: h('datalist', { id }, TR.knownItems(story).map((i) => h('option', { value: i }))) };
  }

  function varSelect(currentId, types, onPick) {
    const vars = story.variables.filter((v) => !types || types.includes(v.type));
    const has = vars.some((v) => v.id === currentId);
    const newLabel = types && types.length === 1 && types[0] === 'list' ? '➕ New list…' : '➕ New stat…';
    const opts = [['', types && types[0] === 'list' ? '— pick a list —' : '— pick a stat —']]
      .concat(vars.map((v) => [v.id, `${TR.prettyVarName(v.name)} (${TR.VAR_TYPES[v.type].label})`]))
      .concat([['__new', newLabel]]);
    const s = select(opts, has ? currentId : '', async (val) => {
      if (val === '__new') {
        s.value = has ? currentId : '';
        const v = await createVarDialog(types ? types[0] : 'number', types);
        if (v) onPick(v.id);
      } else if (val) {
        onPick(val);
      }
    }, has ? '' : 'needs');
    return s;
  }

  function passageSelect(currentId, onPick, suggestName) {
    const sorted = story.passages.slice().sort((a, b) => a.name.localeCompare(b.name));
    const has = sorted.some((p) => p.id === currentId);
    const opts = [['', '— pick a passage —']].concat(sorted.map((p) => [p.id, p.name])).concat([['__new', '➕ New passage…']]);
    const s = select(opts, has ? currentId : '', async (val) => {
      if (val === '__new') {
        s.value = has ? currentId : '';
        const name = await TR.askText({ title: 'New passage', label: 'What should the new passage be called?', value: suggestName ? suggestName() : '', okLabel: 'Create' });
        if (name === null) return;
        const from = current();
        const np = addPassageAt(from ? from.x + CARD_W + 180 : 100, from ? from.y : 100, name || 'Untitled Passage');
        onPick(np.id);
      } else if (val) {
        onPick(val);
      }
    }, has ? '' : 'needs');
    return s;
  }

  const row = (...children) => h('div', { class: 'form-row' }, children);
  const word = (t) => h('span', { class: 'word', text: t });

  // ----- each block's form -----

  function textBody(b) {
    const ta = h('textarea', { class: 'input textarea', rows: 3, placeholder: 'Write what the reader sees…' });
    ta.value = b.text;
    const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.max(76, ta.scrollHeight + 2) + 'px'; };
    ta.addEventListener('input', () => { b.text = ta.value; autosize(); soft(); });
    requestAnimationFrame(autosize);

    const wrapWith = (mark) => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const sel = ta.value.slice(s, e) || 'text';
      ta.setRangeText(mark + sel + mark, s, e);
      ta.focus();
      ta.setSelectionRange(s + mark.length, s + mark.length + sel.length);
      b.text = ta.value;
      soft();
    };
    const insert = (str) => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.setRangeText(str, s, e, 'end');
      ta.focus();
      b.text = ta.value;
      autosize();
      soft();
    };

    const statOpts = [['', '{ } Show a stat…']].concat(story.variables.map((v) => [v.id, TR.prettyVarName(v.name)])).concat([['__new', '➕ New stat…']]);
    const statSel = select(statOpts, '', async (val, s) => {
      s.value = '';
      let v = varOf(val);
      if (val === '__new') v = await createVarDialog('number');
      if (v) insert(`{${v.name}}`);
      if (v && val === '__new') renderPanel();
    }, 'select-small');

    return h('div', {},
      h('div', { class: 'text-tools' },
        h('button', { class: 'tool-btn', type: 'button', title: 'Bold (select words first)', onclick: () => wrapWith('**') }, h('b', {}, 'B')),
        h('button', { class: 'tool-btn', type: 'button', title: 'Italic (select words first)', onclick: () => wrapWith('*') }, h('i', {}, 'I')),
        statSel),
      ta);
  }

  function choiceBody(b) {
    return h('div', {},
      row(word('Button says'), textInput(b.label, 'e.g. Open the door', (v) => { b.label = v; soft(); }, 'grow')),
      row(word('Goes to'), passageSelect(b.target, (id) => { b.target = id; refresh(); }, () => b.label)),
      h('div', { class: 'sub' }, h('div', { class: 'sub-title', text: 'When clicked, also:' }), renderBlockList(b.actions, 'actions')));
  }

  function setBody(b) {
    const v = varOf(b.varId);
    const parts = [varSelect(b.varId, null, (id) => {
      const nv = varOf(id);
      b.varId = id;
      b.op = TR.SET_OPS[nv.type][0][0];
      b.value = nv.type === 'flag' ? true : nv.type === 'number' ? 0 : '';
      refresh();
    })];
    if (v) {
      b.op = TR.validOp(TR.SET_OPS, v.type, b.op);
      parts.push(select(TR.SET_OPS[v.type], b.op, (op) => { b.op = op; refresh(); }));
      if (v.type === 'number') parts.push(numberInput(b.value, (x) => { b.value = x; soft(); }));
      else if (v.type === 'text') parts.push(textInput(b.value, 'new words', (x) => { b.value = x; soft(); }, 'grow'));
      else if (v.type === 'flag' && b.op === 'set') parts.push(select([['true', 'Yes'], ['false', 'No']], String(b.value === true || b.value === 'true'), (x) => { b.value = x === 'true'; soft(); }));
    }
    return row(parts);
  }

  function itemBody(b) {
    const dl = itemsDatalist();
    const item = textInput(b.item, 'item name, e.g. Key', (x) => { b.item = x; soft(); }, 'grow');
    item.setAttribute('list', dl.id);
    return h('div', {},
      row(select([['add', 'Give'], ['remove', 'Take away']], b.op, (op) => { b.op = op; refresh(); }), item, dl.el),
      row(word(b.op === 'remove' ? 'from' : 'to'), varSelect(b.varId, ['list'], (id) => { b.varId = id; refresh(); })));
  }

  function randomBody(b) {
    return h('div', {},
      row(word('Roll a number from'), numberInput(b.min, (x) => { b.min = x; soft(); }), word('to'), numberInput(b.max, (x) => { b.max = x; soft(); })),
      row(word('and save it in'), varSelect(b.varId, ['number'], (id) => { b.varId = id; refresh(); })));
  }

  function gotoBody(b) {
    return h('div', {},
      row(word('Go straight to'), passageSelect(b.target, (id) => { b.target = id; refresh(); })),
      h('p', { class: 'hint', text: 'The reader is taken there right away, without clicking. Tip: put this inside an "If…" block.' }));
  }

  function ruleRow(r, canRemove, onRemove) {
    const v = varOf(r.varId);
    const parts = [varSelect(r.varId, null, (id) => {
      const nv = varOf(id);
      r.varId = id;
      r.op = TR.COND_OPS[nv.type][0][0];
      r.value = nv.type === 'number' ? 0 : '';
      refresh();
    })];
    if (v) {
      r.op = TR.validOp(TR.COND_OPS, v.type, r.op);
      parts.push(select(TR.COND_OPS[v.type], r.op, (op) => { r.op = op; refresh(); }));
      if (v.type === 'number') parts.push(numberInput(r.value, (x) => { r.value = x; soft(); }));
      else if (v.type === 'text') parts.push(textInput(r.value, 'words', (x) => { r.value = x; soft(); }, 'grow'));
      else if (r.op === 'has' || r.op === 'hasnt') {
        const dl = itemsDatalist();
        const input = textInput(r.value, 'item name', (x) => { r.value = x; soft(); }, 'grow');
        input.setAttribute('list', dl.id);
        parts.push(input, dl.el);
      }
    }
    if (canRemove) parts.push(h('button', { class: 'icon-btn small', type: 'button', title: 'Remove this condition', onclick: onRemove }, '✕'));
    return h('div', { class: 'form-row rule' }, parts);
  }

  function ifBody(b) {
    const out = h('div', { class: 'if-body' });
    b.branches.forEach((br, bi) => {
      const head = h('div', { class: 'branch-head' },
        h('strong', { text: bi === 0 ? 'If' : 'Otherwise, if' }),
        br.rules.length > 1 ? select([['all', 'ALL of these are true'], ['any', 'ANY of these is true']], br.match, (m) => { br.match = m; refresh(); }, 'select-small') : null,
        bi > 0 ? h('button', { class: 'link-btn', type: 'button', onclick: async () => {
          if (br.blocks.length && !(await TR.confirmBox('Remove this "Otherwise, if" and everything inside it?', 'Remove'))) return;
          b.branches.splice(bi, 1);
          refresh();
        } }, 'remove') : null);
      out.appendChild(h('div', { class: 'branch' },
        head,
        h('div', { class: 'rules' },
          br.rules.map((r, ri) => ruleRow(r, br.rules.length > 1, () => { br.rules.splice(ri, 1); refresh(); })),
          h('button', { class: 'link-btn', type: 'button', onclick: () => { br.rules.push(TR.newRule()); refresh(); } }, '＋ another condition')),
        h('div', { class: 'then-label', text: '…then:' }),
        renderBlockList(br.blocks, 'main')));
    });
    if (b.hasElse) {
      out.appendChild(h('div', { class: 'branch branch-else' },
        h('div', { class: 'branch-head' },
          h('strong', { text: 'Otherwise (if none of the above):' }),
          h('button', { class: 'link-btn', type: 'button', onclick: async () => {
            if (b.elseBlocks.length && !(await TR.confirmBox('Remove "Otherwise" and everything inside it?', 'Remove'))) return;
            b.hasElse = false;
            b.elseBlocks = [];
            refresh();
          } }, 'remove')),
        renderBlockList(b.elseBlocks, 'main')));
    }
    out.appendChild(h('div', { class: 'branch-add' },
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => { b.branches.push(TR.newBranch()); refresh(); } }, '＋ Otherwise, if…'),
      b.hasElse ? null : h('button', { class: 'btn btn-small', type: 'button', onclick: () => { b.hasElse = true; refresh(); } }, '＋ Otherwise')));
    return out;
  }

  // ---------- Stats & Items ----------

  // An input for a stat's starting value. Writes into obj.initial.
  function initialEditor(obj, onChange) {
    const done = () => { if (onChange) onChange(); };
    switch (obj.type) {
      case 'number': return numberInput(obj.initial, (x) => { obj.initial = x; done(); });
      case 'flag': return select([['false', 'No'], ['true', 'Yes']], String(obj.initial === true), (x) => { obj.initial = x === 'true'; done(); });
      case 'list': {
        const el = textInput((obj.initial || []).join(', '), 'empty, or e.g. Map, Torch', (x) => {
          obj.initial = x.split(',').map((s) => s.trim()).filter(Boolean);
          done();
        }, 'grow');
        return el;
      }
      default: return textInput(obj.initial, 'starting words', (x) => { obj.initial = x; done(); }, 'grow');
    }
  }

  function createVarDialog(defaultType, allowedTypes) {
    return new Promise((resolve) => {
      let created = false;
      const types = allowedTypes || Object.keys(TR.VAR_TYPES);
      const tmp = { type: types.includes(defaultType) ? defaultType : types[0], initial: null };
      tmp.initial = TR.defaultInitial(tmp.type);
      const nameInput = h('input', { class: 'input', type: 'text', placeholder: 'e.g. gold, health, playerName' });
      if (tmp.type === 'list' && !story.variables.some((v) => v.name === 'inventory')) nameInput.value = 'inventory';
      const startWrap = h('div');
      const typeWrap = h('div', { class: 'type-cards' });
      const drawTypes = () => {
        typeWrap.innerHTML = '';
        types.forEach((t) => typeWrap.appendChild(h('button', {
          type: 'button',
          class: 'type-card' + (tmp.type === t ? ' active' : ''),
          onclick: () => { tmp.type = t; tmp.initial = TR.defaultInitial(t); drawTypes(); drawStart(); },
        }, h('strong', { text: TR.VAR_TYPES[t].label }), h('small', { text: TR.VAR_TYPES[t].hint }))));
      };
      const drawStart = () => {
        startWrap.innerHTML = '';
        startWrap.append(h('div', { class: 'field' }, h('span', { text: tmp.type === 'list' ? 'Starts with these items (separate with commas)' : 'Starts as' }), initialEditor(tmp)));
      };
      drawTypes();
      drawStart();
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') m.box.querySelector('.btn-primary').click();
      });
      const m = TR.modal({
        title: 'New stat',
        body: h('div', {},
          h('label', { class: 'field' }, h('span', { text: 'Name' }), nameInput, h('small', { class: 'hint', text: 'Letters, numbers and _ only. Spaces become _.' })),
          h('div', { class: 'field' }, h('span', { text: 'What kind of thing is it?' }), typeWrap),
          startWrap),
        buttons: [
          { label: 'Cancel' },
          {
            label: 'Create',
            kind: 'primary',
            onClick: () => {
              if (!TR.cleanVarName(nameInput.value)) { TR.toast('Please give the stat a name.'); return false; }
              const v = TR.newVariable(story, nameInput.value, tmp.type, tmp.initial);
              touch();
              created = true;
              TR.toast(`Created "${TR.prettyVarName(v.name)}". Type {${v.name}} in text to show it.`, 4000);
              resolve(v);
            },
          },
        ],
        onClose: () => { if (!created) resolve(null); },
      });
    });
  }

  function renameVarEverywhere(oldName, newName) {
    const re = new RegExp('\\{' + oldName + '\\}', 'g');
    story.passages.forEach((p) => TR.walkBlocks(p.blocks, (b) => {
      if (b.type === 'text') b.text = b.text.replace(re, '{' + newName + '}');
      if (b.type === 'choice') b.label = b.label.replace(re, '{' + newName + '}');
    }));
  }

  function openVariables() {
    const body = h('div');
    const draw = () => {
      body.innerHTML = '';
      body.appendChild(h('p', { class: 'hint', text: 'Stats remember things while someone plays: gold, health, a name, whether a door is open, the items in a bag. Type {name} in any text to show a stat\'s current value.' }));
      if (!story.variables.length) {
        body.appendChild(h('div', { class: 'empty-hint', text: 'No stats yet. Add one below!' }));
      } else {
        const table = h('div', { class: 'var-table' },
          h('div', { class: 'var-row var-head' }, h('span', { text: 'Name' }), h('span', { text: 'Kind' }), h('span', { text: 'Starts as' }), h('span', { text: 'Show to player', title: 'Show in the sidebar while playing' }), h('span')));
        story.variables.forEach((v) => {
          const name = h('input', { class: 'input', type: 'text', value: v.name });
          name.addEventListener('change', () => {
            if (!TR.cleanVarName(name.value)) { name.value = v.name; return; }
            const newName = TR.uniqueVarName(story, name.value, v.id);
            if (newName !== v.name) { renameVarEverywhere(v.name, newName); v.name = newName; touch(); }
            name.value = v.name;
          });
          const kind = select(Object.entries(TR.VAR_TYPES).map(([k, t]) => [k, t.label]), v.type, async (t, s) => {
            if (TR.varUsageCount(story, v.id) && !(await TR.confirmBox('Some blocks use this stat. Changing its kind may reset those blocks. Continue?', 'Change kind', 'primary'))) {
              s.value = v.type;
              return;
            }
            v.type = t;
            v.initial = TR.defaultInitial(t);
            touch();
            draw();
          });
          const sidebar = h('input', { type: 'checkbox', checked: !!v.sidebar, title: 'Show in the sidebar while playing' });
          sidebar.addEventListener('change', () => { v.sidebar = sidebar.checked; touch(); });
          const del = h('button', { class: 'icon-btn', type: 'button', title: 'Delete this stat', onclick: async () => {
            const used = TR.varUsageCount(story, v.id);
            const msg = `Delete the stat "${v.name}"?` + (used ? ` It is used in ${used} block(s), which will need a new stat picked.` : '');
            if (!(await TR.confirmBox(msg, 'Delete'))) return;
            story.variables = story.variables.filter((x) => x !== v);
            touch();
            draw();
          } }, '🗑');
          table.appendChild(h('div', { class: 'var-row' }, name, kind, initialEditor(v, touch), h('label', { class: 'check' }, sidebar), del));
        });
        body.appendChild(table);
      }
      body.appendChild(h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { if (await createVarDialog('number')) draw(); } }, '＋ Add a stat'));
    };
    draw();
    TR.modal({
      title: '📊 Stats & Items',
      body,
      wide: true,
      buttons: [{ label: 'Done', kind: 'primary' }],
      onClose: () => { if (openId) renderPanel(); renderMap(); },
    });
  }
})();
