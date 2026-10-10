// The "My Stories" library, test play, help, and start-up.
(function () {
  const TR = window.TR;
  const h = TR.h;
  const $ = (sel) => document.querySelector(sel);
  const SEEN_KEY = 'storyBuilder.seenExample';

  let stories = TR.Store.load();
  const App = (TR.app = {});

  TR.saveAll = () => {
    if (!TR.Store.save(stories)) TR.toast('⚠ Could not save. Your browser storage may be full — please download a backup!', 6000);
  };

  // ---------- library ----------

  App.showLibrary = () => {
    TR.editor.close();
    $('#editor-view').hidden = true;
    $('#library-view').hidden = false;
    renderLibrary();
  };

  App.openStory = (s) => {
    $('#library-view').hidden = true;
    $('#editor-view').hidden = false;
    TR.editor.open(s);
  };

  const fmtDate = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  function renderLibrary() {
    const view = $('#library-view');
    view.innerHTML = '';
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileInput.addEventListener('change', () => importBackup(fileInput.files[0]));

    const sorted = stories.slice().sort((a, b) => b.updated - a.updated);
    view.append(
      h('header', { class: 'lib-head' },
        h('div', {},
          h('h1', {}, '📖 Story Builder'),
          h('p', { class: 'tagline', text: 'Make choose-your-own-adventure stories like Twine — no code needed.' })),
        h('div', { class: 'lib-actions' },
          h('button', { class: 'btn btn-primary btn-big', onclick: newStory }, '＋ New story'),
          h('button', { class: 'btn', onclick: () => fileInput.click() }, '📂 Open a backup'),
          h('button', { class: 'btn', onclick: addExample }, '✨ Add example story'),
          h('button', { class: 'btn btn-ghost', onclick: App.help }, '❓ Help'),
          fileInput)),
      h('p', { class: 'notice' }, '💾 Your stories are saved automatically in this browser. Use ', h('strong', {}, 'Export → Backup'), ' now and then to keep a copy safe.'),
      sorted.length
        ? h('div', { class: 'story-grid' }, sorted.map(storyCard))
        : h('div', { class: 'empty-library' }, h('p', { text: 'No stories yet.' }), h('button', { class: 'btn btn-primary btn-big', onclick: newStory }, '＋ Make your first story')));
  }

  function storyCard(s) {
    const act = (label, title, fn, cls) => h('button', { class: 'btn btn-small' + (cls ? ' ' + cls : ''), title, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
    return h('div', { class: 'story-card', onclick: () => App.openStory(s), title: 'Open this story' },
      h('h3', { text: s.name }),
      h('p', { class: 'meta', text: `${s.passages.length} passage${s.passages.length === 1 ? '' : 's'} · ${s.variables.length} stat${s.variables.length === 1 ? '' : 's'}` }),
      h('p', { class: 'meta', text: 'Edited ' + fmtDate(s.updated) }),
      h('div', { class: 'card-actions' },
        act('✏️ Open', 'Open', () => App.openStory(s), 'btn-primary'),
        act('▶ Play', 'Play this story', () => App.play(s)),
        act('Rename', 'Rename', async () => {
          const name = await TR.askText({ title: 'Rename story', label: 'Story name', value: s.name, okLabel: 'Rename' });
          if (name) { s.name = name; s.updated = Date.now(); TR.saveAll(); renderLibrary(); }
        }),
        act('Copy', 'Make a copy', () => {
          const c = TR.clone(s);
          c.id = TR.uid();
          c.ifid = TR.uuid();
          c.name = s.name + ' (copy)';
          c.updated = Date.now();
          stories.push(c);
          TR.saveAll();
          renderLibrary();
        }),
        act('🗑', 'Delete', async () => {
          if (!(await TR.confirmBox(`Delete "${s.name}" forever? This cannot be undone. (Tip: Export a backup first.)`, 'Delete story'))) return;
          stories = stories.filter((x) => x !== s);
          TR.saveAll();
          renderLibrary();
        }, 'btn-danger-ghost')));
  }

  async function newStory() {
    const name = await TR.askText({ title: 'New story', label: 'What is your story called?', value: '', okLabel: 'Create story' });
    if (name === null) return;
    const s = TR.newStory(name || 'Untitled Story');
    stories.push(s);
    TR.saveAll();
    App.openStory(s);
    TR.toast('Click the ⭐ Start passage to begin writing!', 4000);
  }

  function addExample() {
    const s = TR.sampleStory();
    stories.push(s);
    TR.saveAll();
    renderLibrary();
    TR.toast('Added the example story. Open it to see how it works!');
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = TR.normalizeStory(JSON.parse(reader.result));
        if (stories.some((x) => x.id === s.id)) {
          s.id = TR.uid();
          s.name += ' (imported)';
        }
        stories.push(s);
        TR.saveAll();
        renderLibrary();
        TR.toast(`Opened "${s.name}".`);
      } catch (e) {
        TR.toast('Sorry, that file could not be opened. Please choose a Story Builder backup (.json).', 5000);
      }
    };
    reader.readAsText(file);
  }

  // ---------- play ----------

  App.play = (story, startId) => {
    TR.saveAll();
    $('#play-title').textContent = '▶ Testing: ' + story.name + (startId && startId !== story.startId ? ' (from the middle — stats start fresh)' : '');
    $('#play-overlay').hidden = false;
    TRPlayer.mount($('#play-root'), TR.clone(story), { startId });
  };

  function closePlay() {
    $('#play-overlay').hidden = true;
    $('#play-root').innerHTML = '';
  }

  // ---------- help ----------

  App.help = () => {
    const sec = (title, ...items) => h('section', { class: 'help-sec' }, h('h3', { text: title }), items);
    const li = (...c) => h('li', {}, c);
    TR.modal({
      title: '❓ How Story Builder works',
      wide: true,
      body: h('div', { class: 'help' },
        sec('The basics',
          h('ul', {},
            li(h('strong', {}, 'Passages'), ' are the pages of your story. Each card on the map is one passage. Click a card to edit it, drag it to move it, double-click empty space to make a new one.'),
            li(h('strong', {}, 'Arrows'), ' show where your choices lead. Solid arrows are choices; dashed arrows are automatic jumps.'),
            li('The ⭐ passage is where the story starts.'),
            li('Press ', h('strong', {}, '▶ Play'), ' at any time to try your story.'))),
        sec('Blocks — what each button does',
          h('ul', {},
            li('📝 ', h('strong', {}, 'Text'), ' — words the reader sees. Select words and press B or I for bold or italic. Use "Show a stat" to put a stat\'s value in the text, like {gold}.'),
            li('🔀 ', h('strong', {}, 'Choice'), ' — a button the reader clicks to go to another passage. It can also change stats or give items when clicked.'),
            li('🔢 ', h('strong', {}, 'Change a stat'), ' — set, add to, or subtract from a stat when the reader arrives.'),
            li('🎒 ', h('strong', {}, 'Give / take item'), ' — put items into (or take them out of) a list like an inventory.'),
            li('❓ ', h('strong', {}, 'If…'), ' — only show text or choices when something is true, e.g. "If inventory contains Key". Add "Otherwise" for everything else.'),
            li('🎲 ', h('strong', {}, 'Random number'), ' — roll a dice and save the result.'),
            li('➡️ ', h('strong', {}, 'Jump to passage'), ' — send the reader somewhere automatically (great inside an If).'))),
        sec('Stats & Items',
          h('p', { text: 'Stats are things your story remembers: Numbers (gold, health), Words (a name), Yes/No (did they open the door?) and Lists (an inventory). Make them in 📊 Stats & Items, or right from any stat dropdown with "➕ New stat…". Tick "Show to player" to show a stat in the sidebar while playing.' })),
        sec('Saving & sharing',
          h('ul', {},
            li('Everything saves automatically in this browser. Use ', h('strong', {}, 'Export → Backup (.json)'), ' to keep a copy, and "Open a backup" to load it again — even on another computer.'),
            li(h('strong', {}, 'Export → Playable game'), ' makes one .html file anyone can double-click to play.'),
            li(h('strong', {}, 'Export → Twine 2 file'), ' makes a file you can open in real Twine 2 (Library → Import). It uses the SugarCube story format, so all your stats, conditions and items keep working there.')))),
      buttons: [{ label: 'Got it!', kind: 'primary' }],
    });
  };

  // ---------- start-up ----------

  document.addEventListener('DOMContentLoaded', () => {
    TR.editor.initMap();
    $('#play-close').addEventListener('click', closePlay);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#play-overlay').hidden && !$('#modal-root').children.length) closePlay();
    });
    window.addEventListener('beforeunload', () => TR.saveAll());

    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* storage blocked */ }
    if (!seen && !stories.length) {
      stories.push(TR.sampleStory());
      TR.saveAll();
    }
    renderLibrary();
  });
})();
