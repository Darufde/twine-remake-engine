// Story data: creating stories, passages, blocks and stats, plus saving to the browser.
(function () {
  const TR = (window.TR = window.TR || {});
  const STORAGE_KEY = 'storyBuilder.stories.v1';

  // Names SugarCube uses for its own special passages.
  TR.RESERVED_PASSAGES = ['StoryInit', 'StoryCaption', 'StoryTitle', 'StoryData', 'StoryMenu', 'StoryBanner', 'StorySubtitle', 'StoryAuthor', 'PassageReady', 'PassageDone', 'PassageHeader', 'PassageFooter', 'StoryInterface'];

  TR.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  TR.uuid = () => {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID().toUpperCase();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    }).toUpperCase();
  };

  TR.clone = (o) => JSON.parse(JSON.stringify(o));

  // ---- Stat (variable) types ----

  TR.VAR_TYPES = {
    number: { label: 'Number', hint: 'like gold, health, score' },
    text: { label: 'Words', hint: 'like a name or a mood' },
    flag: { label: 'Yes / No', hint: 'like "met the guard"' },
    list: { label: 'List / Inventory', hint: 'a bag of items' },
  };

  TR.defaultInitial = (type) => ({ number: 0, text: '', flag: false, list: [] }[type]);

  // What a "Change a stat" block can do for each type.
  TR.SET_OPS = {
    number: [['set', 'set to'], ['add', 'add'], ['sub', 'subtract'], ['mul', 'multiply by']],
    text: [['set', 'set to']],
    flag: [['set', 'set to'], ['toggle', 'flip (Yes ⇄ No)']],
    list: [['clear', 'empty out']],
  };

  // What an "If" condition can check for each type.
  TR.COND_OPS = {
    number: [['eq', 'is'], ['neq', 'is not'], ['gt', 'is more than'], ['lt', 'is less than'], ['gte', 'is at least'], ['lte', 'is at most']],
    text: [['eq', 'is'], ['neq', 'is not']],
    flag: [['true', 'is Yes'], ['false', 'is No']],
    list: [['has', 'contains'], ['hasnt', 'does not contain'], ['empty', 'is empty'], ['notempty', 'is not empty']],
  };

  TR.validOp = (table, type, op) => {
    const ops = table[type] || [];
    return ops.some((o) => o[0] === op) ? op : (ops[0] ? ops[0][0] : op);
  };

  TR.cleanVarName = (s) => {
    let n = String(s || '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
    if (/^[0-9]/.test(n)) n = '_' + n;
    return n;
  };

  TR.cleanPassageName = (s) => String(s || '').replace(/[\[\]|{}\\]/g, '').replace(/\s+/g, ' ').trim();

  TR.prettyVarName = (name) => {
    const s = String(name).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  TR.uniqueVarName = (story, base, exceptId) => {
    let name = TR.cleanVarName(base) || 'stat';
    const taken = (n) => story.variables.some((v) => v.id !== exceptId && v.name.toLowerCase() === n.toLowerCase());
    if (!taken(name)) return name;
    let i = 2;
    while (taken(name + i)) i++;
    return name + i;
  };

  TR.uniquePassageName = (story, base, exceptId) => {
    let name = TR.cleanPassageName(base) || 'Untitled Passage';
    const taken = (n) =>
      TR.RESERVED_PASSAGES.some((r) => r.toLowerCase() === n.toLowerCase()) ||
      story.passages.some((p) => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase());
    if (!taken(name)) return name;
    let i = 2;
    while (taken(`${name} ${i}`)) i++;
    return `${name} ${i}`;
  };

  // ---- Blocks ----

  TR.blockDefaults = (type) => {
    switch (type) {
      case 'text': return { type, text: '' };
      case 'choice': return { type, label: '', target: null, actions: [] };
      case 'set': return { type, varId: null, op: 'set', value: '' };
      case 'item': return { type, varId: null, op: 'add', item: '' };
      case 'if': return { type, branches: [TR.newBranch()], hasElse: false, elseBlocks: [] };
      case 'random': return { type, varId: null, min: 1, max: 6 };
      case 'goto': return { type, target: null };
    }
    throw new Error('Unknown block type ' + type);
  };

  TR.newBranch = () => ({ match: 'all', rules: [TR.newRule()], blocks: [] });
  TR.newRule = () => ({ varId: null, op: '', value: '' });

  // Visit every block, including ones nested inside If blocks and choice actions.
  TR.walkBlocks = (blocks, fn) => {
    (blocks || []).forEach((b) => {
      fn(b);
      if (b.type === 'if') {
        b.branches.forEach((br) => TR.walkBlocks(br.blocks, fn));
        if (b.hasElse) TR.walkBlocks(b.elseBlocks, fn);
      } else if (b.type === 'choice') {
        TR.walkBlocks(b.actions, fn);
      }
    });
  };

  TR.passageLinks = (p) => {
    const out = [];
    TR.walkBlocks(p.blocks, (b) => {
      if ((b.type === 'choice' || b.type === 'goto') && b.target) out.push({ target: b.target, kind: b.type });
    });
    return out;
  };

  TR.passageProblems = (story, p) => {
    const problems = [];
    TR.walkBlocks(p.blocks, (b) => {
      if ((b.type === 'choice' || b.type === 'goto') && (!b.target || !story.passages.some((x) => x.id === b.target))) {
        problems.push(b.type === 'choice' ? `Choice "${b.label || '…'}" has no destination` : 'A jump has no destination');
      }
      if (['set', 'item', 'random'].includes(b.type) && !story.variables.some((v) => v.id === b.varId)) {
        problems.push('A block has no stat picked');
      }
    });
    return problems;
  };

  TR.passageSnippet = (p) => {
    const t = (p.blocks.find((b) => b.type === 'text' && b.text.trim()) || {}).text || '';
    const s = t.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
    return s.length > 90 ? s.slice(0, 88) + '…' : s;
  };

  // Every item name used anywhere in the story (for suggestions).
  TR.knownItems = (story) => {
    const set = new Set();
    story.variables.forEach((v) => { if (v.type === 'list') (v.initial || []).forEach((i) => set.add(i)); });
    story.passages.forEach((p) => TR.walkBlocks(p.blocks, (b) => {
      if (b.type === 'item' && b.item) set.add(b.item);
      if (b.type === 'if') b.branches.forEach((br) => br.rules.forEach((r) => { if ((r.op === 'has' || r.op === 'hasnt') && r.value) set.add(r.value); }));
    }));
    return [...set].sort();
  };

  TR.varUsageCount = (story, varId) => {
    let n = 0;
    story.passages.forEach((p) => TR.walkBlocks(p.blocks, (b) => {
      if (b.varId === varId) n++;
      if (b.type === 'if') b.branches.forEach((br) => br.rules.forEach((r) => { if (r.varId === varId) n++; }));
    }));
    return n;
  };

  // ---- Stories & passages ----

  TR.newPassage = (story, name, x, y) => {
    const p = { id: TR.uid(), name: TR.uniquePassageName(story, name), x: Math.round(x), y: Math.round(y), blocks: [TR.blockDefaults('text')] };
    story.passages.push(p);
    return p;
  };

  TR.newVariable = (story, name, type, initial) => {
    const v = {
      id: TR.uid(),
      name: TR.uniqueVarName(story, name),
      type,
      initial: initial === undefined ? TR.defaultInitial(type) : initial,
      sidebar: type !== 'text',
    };
    story.variables.push(v);
    return v;
  };

  TR.newStory = (name) => {
    const story = { id: TR.uid(), ifid: TR.uuid(), name: name || 'Untitled Story', startId: null, passages: [], variables: [], created: Date.now(), updated: Date.now() };
    const start = TR.newPassage(story, 'Start', 120, 120);
    story.startId = start.id;
    return story;
  };

  // Fill in anything missing (e.g. from an older or hand-edited backup).
  TR.normalizeStory = (s) => {
    if (!s || typeof s !== 'object' || !Array.isArray(s.passages)) throw new Error('This file is not a Story Builder backup.');
    s.id = s.id || TR.uid();
    s.ifid = s.ifid || TR.uuid();
    s.name = s.name || 'Untitled Story';
    s.variables = Array.isArray(s.variables) ? s.variables : [];
    s.passages.forEach((p) => {
      p.id = p.id || TR.uid();
      p.blocks = Array.isArray(p.blocks) ? p.blocks : [];
      p.x = Number(p.x) || 0;
      p.y = Number(p.y) || 0;
    });
    if (!s.passages.length) TR.newPassage(s, 'Start', 120, 120);
    if (!s.passages.some((p) => p.id === s.startId)) s.startId = s.passages[0].id;
    s.created = s.created || Date.now();
    s.updated = s.updated || Date.now();
    return s;
  };

  // ---- Saving in the browser ----

  TR.Store = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.map((s) => { try { return TR.normalizeStory(s); } catch (e) { return null; } }).filter(Boolean) : [];
      } catch (e) {
        return [];
      }
    },
    save(stories) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  // ---- A small example story that shows off every block ----

  TR.sampleStory = () => {
    const s = TR.newStory('The Locked Castle (example)');
    const gold = TR.newVariable(s, 'gold', 'number', 5);
    const health = TR.newVariable(s, 'health', 'number', 10);
    const inv = TR.newVariable(s, 'inventory', 'list', []);
    const luck = TR.newVariable(s, 'luck', 'number', 0);
    luck.sidebar = false;

    const start = s.passages[0];
    start.x = 80; start.y = 200;
    const bushes = TR.newPassage(s, 'Search the bushes', 380, 60);
    const village = TR.newPassage(s, 'Village gate', 380, 340);
    const castle = TR.newPassage(s, 'Inside the castle', 700, 200);
    const home = TR.newPassage(s, 'Go home', 700, 480);

    const text = (t) => ({ type: 'text', text: t });
    const choice = (label, target, actions) => ({ type: 'choice', label, target: target.id, actions: actions || [] });

    start.blocks = [
      text('You wake up at the edge of a **dark forest**. You have {gold} gold coins and {health} health.\n\nIn the distance you can see a castle.'),
      choice('Search the bushes', bushes),
      choice('Walk to the village', village),
    ];
    bushes.blocks = [
      text('You dig through the bushes and find a *rusty key*!'),
      { type: 'item', varId: inv.id, op: 'add', item: 'Rusty key' },
      { type: 'set', varId: gold.id, op: 'add', value: 2 },
      { type: 'set', varId: health.id, op: 'sub', value: 1 },
      text('You also find 2 coins, but scratch your arm on a thorn. You now have {gold} gold and {health} health.'),
      choice('Head to the village', village),
    ];
    village.blocks = [
      text('A grumpy guard blocks the castle gate. You are carrying: {inventory}.'),
      {
        type: 'if',
        branches: [
          { match: 'all', rules: [{ varId: inv.id, op: 'has', value: 'Rusty key' }], blocks: [
            text('The guard sees your key and steps aside.'),
            choice('Enter the castle', castle),
          ] },
          { match: 'all', rules: [{ varId: gold.id, op: 'gte', value: 3 }], blocks: [
            text('"No key, no entry," says the guard. "...unless you have some coins?"'),
            choice('Bribe the guard (costs 3 gold)', castle, [{ type: 'set', varId: gold.id, op: 'sub', value: 3 }]),
          ] },
        ],
        hasElse: true,
        elseBlocks: [text('"No key, no entry," says the guard.')],
      },
      choice('Give up and go home', home),
    ];
    castle.blocks = [
      { type: 'random', varId: luck.id, min: 1, max: 6 },
      text('You made it inside the castle! You roll a lucky die and get a {luck}.'),
      {
        type: 'if',
        branches: [{ match: 'all', rules: [{ varId: luck.id, op: 'gte', value: 4 }], blocks: [
          { type: 'set', varId: gold.id, op: 'add', value: 100 },
          text('You find the **royal treasure**! You now have {gold} gold. 🎉'),
        ] }],
        hasElse: true,
        elseBlocks: [text('The treasure room is empty. Better luck next time!')],
      },
      text('THE END.'),
    ];
    home.blocks = [text('You go home and have a nice nap. THE END.')];
    return s;
  };
})();
