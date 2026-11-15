// Demo page: pick an example on the left, see it in Pierre's semantic view.
import { FileDiff, processFile } from 'pierre-diffs';
import icons from '../../docs/icons/icons.json';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.hash.slice(1));
const state = {
  theme: params.get('theme') ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  icons: params.get('icons') !== 'pierre',
  kind: params.get('kind') ?? 'all',
  id: params.get('case'),
};
const KIND_LABEL = {
  moved: 'moved', movedWithEdit: 'moved + edited', reordered: 'reordered', renamed: 'renamed',
  reformatted: 'formatting only', extractedFunction: 'extracted', inlinedFunction: 'inlined',
};

// Our icon set, swapped into Pierre's sprite (Pierre maps renamed to the edited glyph).
const ICON_MAP = {
  'diffs-icon-symbol-moved-duo': 'moved-from', 'diffs-icon-symbol-moved-fill': 'moved-to',
  'diffs-icon-symbol-extracted-duo': 'extracted', 'diffs-icon-symbol-extracted-fill': 'extracted',
  'diffs-icon-symbol-inlined-duo': 'inlined', 'diffs-icon-symbol-inlined-fill': 'inlined',
  'diffs-icon-symbol-modified-duo': 'edited', 'diffs-icon-symbol-modified-fill': 'edited',
  'diffs-icon-symbol-added-duo': 'added', 'diffs-icon-symbol-added-fill': 'added',
  'diffs-icon-symbol-deleted-duo': 'deleted', 'diffs-icon-symbol-deleted-fill': 'deleted',
  'diffs-icon-eye-slash': 'reformatted',
};
function swapIcons(root) {
  for (const [id, name] of Object.entries(ICON_MAP)) {
    for (const sym of root.querySelectorAll('symbol#' + id)) {
      sym.setAttribute('viewBox', '0 0 24 24');
      sym.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</g>`;
    }
  }
}

function saveHash() {
  const p = new URLSearchParams();
  if (state.id) p.set('case', state.id);
  p.set('theme', state.theme);
  if (!state.icons) p.set('icons', 'pierre');
  if (state.kind !== 'all') p.set('kind', state.kind);
  history.replaceState(null, '', '#' + p.toString());
}

const data = await (await fetch('./cases.json')).json();
const fmt = (n, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d });

function renderScoreboard() {
  const s = data.scoreboard;
  const tiles = [
    ['Extracted functions', `${s.extracts.found} of ${s.extracts.labelledReal}`, `real extracts found · ${s.extracts.wrong} wrong · ${s.extracts.borderline} borderline`],
    ['Coverage', `${fmt(s.coverage.uncovered)} missed`, `of ${fmt(s.coverage.changedLines)} changed lines · ${s.coverage.patchesThatFail} bad patches`],
    ['Speed', `${fmt(s.speed.medianMs, 1)} ms`, `per file, median · ${fmt(s.speed.p95Ms)} ms p95 · ${fmt(s.speed.maxMs)} ms max`],
    ['Real files', fmt(s.files), `from ${s.dataset}`],
  ];
  $('#scores').innerHTML = tiles.map(([k, v, d]) => `<div class="tile"><div class="tk">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
}

function renderList() {
  const kinds = ['all', ...Object.keys(KIND_LABEL).filter((k) => data.cases.some((c) => c.kinds.includes(k)))];
  $('#filters').innerHTML = kinds.map((k) => `<button class="chip ${k === state.kind ? 'on' : ''}" data-kind="${k}">${k === 'all' ? 'all' : KIND_LABEL[k]}</button>`).join('');
  const shown = data.cases.filter((c) => state.kind === 'all' || c.kinds.includes(state.kind));
  const groups = [...new Set(shown.map((c) => c.group))];
  $('#list').innerHTML = groups.map((g) => `<div class="group">${g}</div>` + shown.filter((c) => c.group === g).map((c) =>
    `<button class="item ${c.id === state.id ? 'on' : ''}" data-id="${encodeURIComponent(c.id)}"><span class="t">${c.title}</span><span class="ks">${c.kinds.map((k) => `<span class="k k-${k}">${KIND_LABEL[k]}</span>`).join('') || '<span class="k">no semantic change</span>'}</span></button>`).join('')).join('');
}

let instance = null;
function renderCase() {
  const c = data.cases.find((x) => x.id === state.id) ?? data.cases[0];
  state.id = c.id;
  $('#case-title').textContent = c.title;
  $('#case-meta').textContent = `${c.kinds.map((k) => KIND_LABEL[k]).join(', ') || 'plain changes only'} · engine ${fmt(c.ms, 1)} ms`;
  const mount = $('#diff');
  instance?.cleanUp?.();
  mount.innerHTML = '';
  const fileDiff = processFile(c.patch, { oldFile: { name: c.name, contents: c.oldContents }, newFile: { name: c.name, contents: c.newContents } });
  fileDiff.semanticOperations = c.operations;
  if (c.regions.length) fileDiff.semanticFolds = c.regions;
  const theme = state.theme === 'light' ? 'light-plus' : 'dark-plus';
  instance = new FileDiff({ theme, themeType: state.theme, diffStyle: 'split', expandUnchanged: c.newContents.split('\n').length < 400 });
  instance.render({ fileDiff, containerWrapper: mount });
  if (state.icons) {
    // Pierre adds its sprite as it renders; swap once it is there.
    const tryswap = (n = 0) => {
      const roots = [document, ...[...mount.querySelectorAll('*')].map((e) => e.shadowRoot).filter(Boolean)];
      roots.forEach(swapIcons);
      if (n < 10) setTimeout(() => tryswap(n + 1), 60);
    };
    tryswap();
  }
  renderList();
  saveHash();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('#theme').textContent = state.theme === 'dark' ? 'Light' : 'Dark';
  $('#icons').textContent = state.icons ? "Pierre's icons" : 'Our icons';
}

$('#theme').onclick = () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; applyTheme(); renderCase(); };
$('#icons').onclick = () => { state.icons = !state.icons; applyTheme(); renderCase(); };
$('#filters').onclick = (e) => { const k = e.target.closest('[data-kind]')?.dataset.kind; if (k) { state.kind = k; renderList(); saveHash(); } };
$('#list').onclick = (e) => { const id = e.target.closest('[data-id]')?.dataset.id; if (id) { state.id = decodeURIComponent(id); renderCase(); } };

applyTheme();
renderScoreboard();
renderCase();
window.__ready = true;
