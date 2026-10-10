// Turns blocks into real SugarCube code, and builds the export files.
(function () {
  const TR = window.TR;
  const SUGARCUBE_VERSION = '2.37.3';

  const q = (s) => JSON.stringify(String(s == null ? '' : s));
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const varById = (story, id) => story.variables.find((v) => v.id === id);
  const passageById = (story, id) => story.passages.find((p) => p.id === id);

  function literal(type, value) {
    switch (type) {
      case 'number': return String(num(value));
      case 'flag': return value === true || value === 'true' ? 'true' : 'false';
      case 'list': return '[' + (Array.isArray(value) ? value : []).map(q).join(', ') + ']';
      default: return q(value);
    }
  }

  // Text: **bold**, *italic* and {stat} -> SugarCube markup.
  function formatText(story, text) {
    let out = String(text || '');
    out = out.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name, offset, whole) => {
      const v = story.variables.find((x) => x.name === name);
      if (!v) return m;
      if (v.type === 'list') return `<<print $${name}.length ? $${name}.join(", ") : "nothing">>`;
      if (v.type === 'flag') return `<<print $${name} ? "Yes" : "No">>`;
      const next = whole.charAt(offset + m.length);
      return /[A-Za-z0-9_.\[]/.test(next) ? `<<print $${name}>>` : `$${name}`;
    });
    out = out.replace(/\*\*(.+?)\*\*/g, "''$1''").replace(/\*([^*\n]+)\*/g, '//$1//');
    return out;
  }

  function ruleCode(story, rule) {
    const v = varById(story, rule.varId);
    if (!v) return 'false';
    const r = '$' + v.name;
    const op = TR.validOp(TR.COND_OPS, v.type, rule.op);
    const val = v.type === 'number' ? String(num(rule.value)) : q(rule.value);
    switch (op) {
      case 'eq': return `${r} is ${val}`;
      case 'neq': return `${r} isnot ${val}`;
      case 'gt': return `${r} gt ${val}`;
      case 'lt': return `${r} lt ${val}`;
      case 'gte': return `${r} gte ${val}`;
      case 'lte': return `${r} lte ${val}`;
      case 'true': return `${r} is true`;
      case 'false': return `${r} is false`;
      case 'has': return `${r}.includes(${q(rule.value)})`;
      case 'hasnt': return `not ${r}.includes(${q(rule.value)})`;
      case 'empty': return `${r}.length is 0`;
      case 'notempty': return `${r}.length gt 0`;
    }
    return 'false';
  }

  function branchCode(story, br) {
    const parts = br.rules.map((r) => ruleCode(story, r));
    if (!parts.length) return 'true';
    if (parts.length === 1) return parts[0];
    return parts.map((p) => `(${p})`).join(br.match === 'any' ? ' or ' : ' and ');
  }

  // Blocks that only change stats and print nothing.
  function actionCode(story, b) {
    const v = varById(story, b.varId);
    if (!v) return '';
    const r = '$' + v.name;
    if (b.type === 'set') {
      const op = TR.validOp(TR.SET_OPS, v.type, b.op);
      if (v.type === 'number') {
        const sym = { set: 'to', add: '+=', sub: '-=', mul: '*=' }[op];
        return `<<set ${r} ${sym} ${num(b.value)}>>`;
      }
      if (v.type === 'text') return `<<set ${r} to ${q(b.value)}>>`;
      if (v.type === 'flag') return op === 'toggle' ? `<<set ${r} to not ${r}>>` : `<<set ${r} to ${literal('flag', b.value)}>>`;
      if (v.type === 'list') return `<<set ${r} to []>>`;
    }
    if (b.type === 'item' && v.type === 'list') {
      return b.op === 'remove' ? `<<set ${r} to ${r}.filter(i => i !== ${q(b.item)})>>` : `<<run ${r}.pushUnique(${q(b.item)})>>`;
    }
    if (b.type === 'random' && v.type === 'number') {
      let lo = Math.round(num(b.min)), hi = Math.round(num(b.max));
      if (hi < lo) [lo, hi] = [hi, lo];
      return `<<set ${r} to random(${lo}, ${hi})>>`;
    }
    return '';
  }

  function compileBlocks(story, blocks) {
    let out = '';
    (blocks || []).forEach((b, i) => {
      const next = blocks[i + 1];
      switch (b.type) {
        case 'text': {
          const t = formatText(story, b.text).replace(/\s+$/, '');
          if (t) out += t + '\n\n';
          break;
        }
        case 'choice': {
          const target = passageById(story, b.target);
          const label = b.label || (target ? target.name : 'Continue');
          if (!target) {
            out += `/* Choice "${label.replace(/\*\//g, '')}" has no destination yet */\\\n`;
            break;
          }
          const actions = (b.actions || []).map((a) => actionCode(story, a)).join('');
          if (actions || /[\[\]|]/.test(label)) {
            out += `<<link ${q(label)} ${q(target.name)}>>${actions}<</link>>\n`;
          } else {
            out += label === target.name ? `[[${label}]]\n` : `[[${label}|${target.name}]]\n`;
          }
          if (next && next.type === 'text') out += '\n';
          break;
        }
        case 'set':
        case 'item':
        case 'random': {
          const code = actionCode(story, b);
          if (code) out += code + '\\\n';
          break;
        }
        case 'goto': {
          const target = passageById(story, b.target);
          if (target) out += `<<goto ${q(target.name)}>>\\\n`;
          break;
        }
        case 'if': {
          b.branches.forEach((br, bi) => {
            out += `<<${bi === 0 ? 'if' : 'elseif'} ${branchCode(story, br)}>>\\\n`;
            out += compileBlocks(story, br.blocks);
          });
          if (b.hasElse) {
            out += '<<else>>\\\n';
            out += compileBlocks(story, b.elseBlocks);
          }
          out += '<</if>>\\\n';
          break;
        }
      }
    });
    return out;
  }

  const tidy = (s) => s.replace(/[\s\\]+$/, '');

  TR.compilePassage = (story, p) => tidy(compileBlocks(story, p.blocks));

  TR.compileStoryInit = (story) =>
    story.variables.map((v) => `<<set $${v.name} to ${literal(v.type, v.initial)}>>`).join('\n');

  TR.compileStoryCaption = (story) =>
    story.variables.filter((v) => v.sidebar).map((v) => `${TR.prettyVarName(v.name)}: ${formatText(story, '{' + v.name + '}')}`).join('<br>\n');

  // All passages as SugarCube would see them, including the special ones.
  function allPassages(story) {
    const list = story.passages.map((p) => ({ name: p.name, text: TR.compilePassage(story, p), x: p.x, y: p.y, id: p.id }));
    const maxX = Math.max(0, ...story.passages.map((p) => p.x));
    if (story.variables.length) list.push({ name: 'StoryInit', text: TR.compileStoryInit(story), x: maxX + 300, y: 0 });
    const caption = TR.compileStoryCaption(story);
    if (caption) list.push({ name: 'StoryCaption', text: caption, x: maxX + 300, y: 150 });
    return list;
  }

  const escHTML = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Twine 2 "archive" file: open it with Twine 2 > Library > Import.
  TR.exportTwineArchive = (story) => {
    const passages = allPassages(story);
    let startPid = 1;
    const body = passages.map((p, i) => {
      if (p.id === story.startId) startPid = i + 1;
      return `<tw-passagedata pid="${i + 1}" name="${escHTML(p.name)}" tags="" position="${Math.round(p.x)},${Math.round(p.y)}" size="100,100">${escHTML(p.text)}</tw-passagedata>`;
    }).join('');
    return `<tw-storydata name="${escHTML(story.name)}" startnode="${startPid}" creator="Story Builder" creator-version="1.0.0" ifid="${escHTML(story.ifid)}" zoom="1" format="SugarCube" format-version="${SUGARCUBE_VERSION}" options="" hidden>` +
      '<style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css"></style>' +
      '<script role="script" id="twine-user-script" type="text/twine-javascript"></script>' +
      body + '</tw-storydata>\n';
  };

  // Twee 3 text file (works with Tweego and Twine 2.6+ import).
  TR.exportTwee = (story) => {
    const escName = (n) => n.replace(/([\\\[\]{}])/g, '\\$1');
    const start = passageById(story, story.startId);
    const data = { ifid: story.ifid, format: 'SugarCube', 'format-version': SUGARCUBE_VERSION, start: start ? start.name : 'Start', zoom: 1 };
    let out = `:: StoryTitle\n${story.name}\n\n:: StoryData\n${JSON.stringify(data, null, 2)}\n\n`;
    allPassages(story).forEach((p) => {
      const text = p.text.replace(/^::/gm, '\\::');
      out += `:: ${escName(p.name)} {"position":"${Math.round(p.x)},${Math.round(p.y)}","size":"100,100"}\n${text}\n\n`;
    });
    return out;
  };

  // A single HTML file anyone can open to play the story.
  TR.exportPlayable = (story) => {
    const data = JSON.stringify(story).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHTML(story.name)}</title>
<style>html,body{margin:0;height:100%;background:#111}#story{min-height:100%;display:flex}#story>.trp{flex:1}</style>
</head>
<body>
<div id="story"></div>
<script>var STORY = ${data};</script>
<script>window.TRPlayer = (${TRPlayerFactory.toString()})();</script>
<script>TRPlayer.mount(document.getElementById('story'), STORY);</script>
</body>
</html>
`;
  };
})();
