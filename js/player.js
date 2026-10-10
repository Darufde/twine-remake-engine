// The story player. Used for "Play" inside the app, and copied as-is into the
// exported playable game file, so it must not depend on anything else in the app.
function TRPlayerFactory() {
  var CSS = [
    '.trp{display:flex;min-height:100%;font-family:Georgia,"Times New Roman",serif;background:#111;color:#eee}',
    '.trp-side{width:220px;flex:none;padding:24px 20px;border-right:1px solid #333;background:#181818;font-family:system-ui,sans-serif}',
    '.trp-side h1{font-size:1.15rem;margin:0 0 16px;line-height:1.3}',
    '.trp-stats{font-size:.92rem;line-height:1.6}',
    '.trp-stat{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #333;padding:2px 0}',
    '.trp-stat b{font-weight:600;color:#9cd1ff;text-align:right}',
    '.trp-controls{margin-top:20px;display:flex;gap:8px;flex-wrap:wrap}',
    '.trp-controls button{font:inherit;font-size:.85rem;background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:6px;padding:6px 10px;cursor:pointer}',
    '.trp-controls button:hover:not(:disabled){background:#383838}',
    '.trp-controls button:disabled{opacity:.4;cursor:default}',
    '.trp-main{flex:1;padding:48px 24px;overflow:auto}',
    '.trp-passage{max-width:680px;margin:0 auto;font-size:1.2rem;line-height:1.65;animation:trpFade .35s ease}',
    '.trp-passage p{margin:0 0 1em}',
    '.trp-choice{display:block;width:100%;text-align:left;font:inherit;font-size:1.05rem;margin:0 0 10px;padding:10px 14px;border-radius:8px;border:1px solid #3d6b99;background:#16283a;color:#9cd1ff;cursor:pointer}',
    '.trp-choice:hover:not(:disabled){background:#1e3a55}',
    '.trp-choice:disabled{opacity:.5;cursor:not-allowed;border-style:dashed}',
    '.trp-error{color:#ff9c9c;font-family:system-ui,sans-serif;font-size:1rem}',
    '@keyframes trpFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
    '@media (max-width:700px){.trp{flex-direction:column}.trp-side{width:auto;border-right:0;border-bottom:1px solid #333;padding:14px 16px}.trp-main{padding:24px 16px}}',
  ].join('\n');

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function pretty(name) {
    var s = String(name).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function mount(root, story, opts) {
    opts = opts || {};
    if (!document.getElementById('trp-style')) {
      var st = document.createElement('style');
      st.id = 'trp-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    var varsById = {};
    var varsByName = {};
    story.variables.forEach(function (v) { varsById[v.id] = v; varsByName[v.name] = v; });

    function initialVars() {
      var out = {};
      story.variables.forEach(function (v) {
        out[v.name] = v.type === 'list' ? copy(v.initial || []) : v.type === 'number' ? num(v.initial) : v.type === 'flag' ? (v.initial === true || v.initial === 'true') : String(v.initial == null ? '' : v.initial);
      });
      return out;
    }

    var vars = initialVars();
    var history = [];
    var autoJumps = 0;

    root.innerHTML =
      '<div class="trp"><aside class="trp-side"><h1></h1><div class="trp-stats"></div>' +
      '<div class="trp-controls"><button type="button" data-act="back">← Back</button><button type="button" data-act="restart">Restart</button></div></aside>' +
      '<main class="trp-main"><div class="trp-passage"></div></main></div>';
    root.querySelector('h1').textContent = story.name;
    var statsEl = root.querySelector('.trp-stats');
    var passageEl = root.querySelector('.trp-passage');
    var mainEl = root.querySelector('.trp-main');
    var backBtn = root.querySelector('[data-act=back]');
    root.querySelector('[data-act=restart]').onclick = function () {
      if (confirm('Start the story over from the beginning?')) { vars = initialVars(); history = []; autoJumps = 0; go(story.startId); }
    };
    backBtn.onclick = function () {
      if (history.length < 2) return;
      history.pop();
      autoJumps = 0;
      var prev = history[history.length - 1];
      vars = copy(prev.vars);
      render(prev.id);
    };

    function display(v, val) {
      if (v.type === 'list') return val && val.length ? val.join(', ') : 'nothing';
      if (v.type === 'flag') return val ? 'Yes' : 'No';
      return String(val);
    }

    // **bold**, *italic* and {stat} -- the same rules the Twine export uses.
    var TOKEN_RE = /\*\*(.+?)\*\*|\*([^*\n]+?)\*|\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
    function formatLine(line) {
      var out = '';
      var last = 0;
      line.replace(TOKEN_RE, function (m, bold, italic, name, offset) {
        out += esc(line.slice(last, offset));
        if (bold != null) out += '<strong>' + formatLine(bold) + '</strong>';
        else if (italic != null) out += '<em>' + formatLine(italic) + '</em>';
        else out += varsByName[name] ? esc(display(varsByName[name], vars[name])) : esc(m);
        last = offset + m.length;
        return m;
      });
      return out + esc(line.slice(last));
    }
    function formatText(text) {
      return String(text == null ? '' : text).split('\n').map(formatLine).join('<br>');
    }

    function check(rule) {
      var v = varsById[rule.varId];
      if (!v) return false;
      var val = vars[v.name];
      switch (rule.op) {
        case 'eq': return v.type === 'number' ? num(val) === num(rule.value) : String(val) === String(rule.value);
        case 'neq': return v.type === 'number' ? num(val) !== num(rule.value) : String(val) !== String(rule.value);
        case 'gt': return num(val) > num(rule.value);
        case 'lt': return num(val) < num(rule.value);
        case 'gte': return num(val) >= num(rule.value);
        case 'lte': return num(val) <= num(rule.value);
        case 'true': return val === true;
        case 'false': return val !== true;
        case 'has': return (val || []).indexOf(rule.value) !== -1;
        case 'hasnt': return (val || []).indexOf(rule.value) === -1;
        case 'empty': return !(val || []).length;
        case 'notempty': return (val || []).length > 0;
      }
      // Fall back to the first option for this stat type.
      var first = { number: 'eq', text: 'eq', flag: 'true', list: 'has' }[v.type];
      return first ? check({ varId: rule.varId, op: first, value: rule.value }) : false;
    }

    function branchTrue(br) {
      if (!br.rules.length) return true;
      return br.match === 'any' ? br.rules.some(check) : br.rules.every(check);
    }

    function apply(b) {
      var v = varsById[b.varId];
      if (!v) return;
      var n = v.name;
      if (b.type === 'set') {
        if (v.type === 'number') {
          var x = num(b.value), cur = num(vars[n]);
          vars[n] = b.op === 'add' ? cur + x : b.op === 'sub' ? cur - x : b.op === 'mul' ? cur * x : x;
        } else if (v.type === 'text') {
          vars[n] = String(b.value == null ? '' : b.value);
        } else if (v.type === 'flag') {
          vars[n] = b.op === 'toggle' ? !vars[n] : b.value === true || b.value === 'true';
        } else if (v.type === 'list') {
          vars[n] = [];
        }
      } else if (b.type === 'item' && v.type === 'list') {
        var list = vars[n] || (vars[n] = []);
        if (b.op === 'remove') vars[n] = list.filter(function (i) { return i !== b.item; });
        else if (b.item && list.indexOf(b.item) === -1) list.push(b.item);
      } else if (b.type === 'random' && v.type === 'number') {
        var lo = Math.round(num(b.min)), hi = Math.round(num(b.max));
        if (hi < lo) { var t = lo; lo = hi; hi = t; }
        vars[n] = lo + Math.floor(Math.random() * (hi - lo + 1));
      }
    }

    function renderBlocks(blocks, el, ctx) {
      (blocks || []).forEach(function (b) {
        if (b.type === 'text') {
          if (!String(b.text || '').trim()) return;
          var p = document.createElement('p');
          p.innerHTML = formatText(b.text);
          el.appendChild(p);
        } else if (b.type === 'choice') {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'trp-choice';
          var targetPassage = null;
          story.passages.forEach(function (p) { if (p.id === b.target) targetPassage = p; });
          var target = targetPassage ? targetPassage.id : null;
          btn.innerHTML = formatText(b.label || (targetPassage ? targetPassage.name : 'Continue'));
          if (!target) { btn.disabled = true; btn.title = 'This choice does not lead anywhere yet'; }
          btn.onclick = function () {
            (b.actions || []).forEach(apply);
            autoJumps = 0;
            go(target);
          };
          el.appendChild(btn);
        } else if (b.type === 'set' || b.type === 'item' || b.type === 'random') {
          apply(b);
        } else if (b.type === 'if') {
          var done = false;
          for (var i = 0; i < b.branches.length; i++) {
            if (branchTrue(b.branches[i])) { renderBlocks(b.branches[i].blocks, el, ctx); done = true; break; }
          }
          if (!done && b.hasElse) renderBlocks(b.elseBlocks, el, ctx);
        } else if (b.type === 'goto') {
          if (b.target) ctx.jumps.push(b.target);
        }
      });
    }

    function updateStats() {
      statsEl.innerHTML = '';
      story.variables.forEach(function (v) {
        if (!v.sidebar) return;
        var row = document.createElement('div');
        row.className = 'trp-stat';
        row.innerHTML = '<span>' + esc(pretty(v.name)) + '</span><b>' + esc(display(v, vars[v.name])) + '</b>';
        statsEl.appendChild(row);
      });
      backBtn.disabled = history.length < 2;
    }

    function render(id) {
      var p = null;
      story.passages.forEach(function (x) { if (x.id === id) p = x; });
      passageEl.innerHTML = '';
      passageEl.style.animation = 'none';
      void passageEl.offsetWidth;
      passageEl.style.animation = '';
      mainEl.scrollTop = 0;
      if (!p) {
        passageEl.innerHTML = '<p class="trp-error">This passage could not be found.</p>';
        updateStats();
        return;
      }
      var ctx = { jumps: [] };
      renderBlocks(p.blocks, passageEl, ctx);
      updateStats();
      if (ctx.jumps.length && ++autoJumps > 50) {
        passageEl.insertAdjacentHTML('beforeend', '<p class="trp-error">Stopped: the story keeps jumping between passages on its own.</p>');
        return;
      }
      // Each jump happens in turn, just like SugarCube's <<goto>>.
      ctx.jumps.forEach(function (target) {
        setTimeout(function () {
          // A jump replaces the current step, so "Back" skips over it.
          history.pop();
          go(target);
        }, 0);
      });
    }

    function go(id) {
      if (!id) return;
      history.push({ id: id, vars: copy(vars) });
      render(id);
    }

    go(opts.startId || story.startId);
  }

  return { mount: mount };
}
window.TRPlayer = TRPlayerFactory();
