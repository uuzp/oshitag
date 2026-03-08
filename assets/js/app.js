/* oshiTag - minimal tabs UI
 * Groups tabs -> Idols cards -> Tags
 * Favorites tabs -> Tags
 * Click to copy, double-click to delete
 */

import {
  BUILTIN_LOCALES,
  I18N_STORAGE_LANG,
  applyI18n,
  i18n,
  initI18n,
  loadUserLocales,
  pickLocaleAuto,
  safeParseJson,
  saveUserLocales,
  t
} from './i18n.js';
import {
  IMPORT_MODE_MERGE,
  IMPORT_MODE_REPLACE,
  createImportTools,
  formatDelta,
  summarizeData
} from './import-utils.js';
import { createDialogs } from './dialogs.js';
import { createRenderer } from './render.js';

const APP_VERSION = '0.2.9';

const STORAGE_KEY = 'oshitag:data:v2';
const LEGACY_KEY = 'oshitag:data:v1';
const IMPORT_BACKUP_KEY = 'oshitag:data:import-backup:v1';
const MD_FAVORITES_HEADING = '[FAVORITES]';

// Common penlight / idol cheer colors (not an official standard; meant to cover the usual set)
const PRESET_COLORS = [
  // Reds
  '#ff1744',
  '#ff3b30',
  '#ff5252',
  // Oranges / Ambers
  '#ff6d00',
  '#ff8f00',
  '#ffab00',
  // Yellows
  '#ffd600',
  '#ffea00',
  // Greens
  '#00c853',
  '#00e676',
  '#64dd17',
  // Cyans / Aquas
  '#00b8d4',
  '#00e5ff',
  '#18ffff',
  // Blues
  '#2979ff',
  '#2962ff',
  '#304ffe',
  // Purples
  '#651fff',
  '#7c4dff',
  '#b388ff',
  // Pinks
  '#f50057',
  '#ff4081',
  '#ff80ab',
  // White / Warm white
  '#ffffff',
  '#fff4d6'
];

const $ = (sel, root = document) => root.querySelector(sel);

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
}

function normalizeTagText(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  if (raw === '#') return '';
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function uniqKeepOrder(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseTagsInput(input) {
  const s = String(input ?? '').trim();
  if (!s) return [];

  const tokens = [];
  let cur = '';

  const push = () => {
    const t = cur.trim();
    cur = '';
    if (!t) return;
    const normalized = normalizeTagText(t);
    if (!normalized) return;
    tokens.push(normalized);
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const isWhitespace = /\s/u.test(ch) || ch === '\u3000';
    const isSep = ch === ',' || isWhitespace;

    if (ch === '#') {
      push();
      cur = '#';
      continue;
    }

    if (isSep) {
      push();
      continue;
    }

    cur += ch;
  }
  push();

  return uniqKeepOrder(tokens);
}

function defaultData() {
  return {
    version: 2,
    ui: {
      activeGroupId: null,
      activeFavId: null
    },
    groups: [],
    favorites: []
  };
}

function migrateLegacyIfNeeded() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return;

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return;

  try {
    const old = JSON.parse(legacy);
    if (!old || typeof old !== 'object') return;

    const next = defaultData();

    if (Array.isArray(old.groups)) {
      next.groups = old.groups.map((g) => ({
        id: g.id || uid(),
        name: String(g.name ?? '').trim() || '未命名组合',
        idols: Array.isArray(g.idols)
          ? g.idols.map((i) => ({
              id: i.id || uid(),
              name: String(i.name ?? '').trim() || '未命名偶像',
              cheerColor: String(i.cheerColor ?? '').trim() || PRESET_COLORS[0],
              tags: Array.isArray(i.tags)
                ? i.tags
                    .map((t) => ({ id: t.id || uid(), text: normalizeTagText(t.text) }))
                    .filter((t) => t.text)
                : []
            }))
          : []
      }));
    }

    // old combos -> favorites
    if (Array.isArray(old.combos)) {
      next.favorites = old.combos.map((c) => ({
        id: c.id || uid(),
        name: String(c.name ?? '').trim() || '未命名收藏夹',
        tags: Array.isArray(c.tags)
          ? c.tags
              .map((t) => ({ id: t.id || uid(), text: normalizeTagText(t.text) }))
              .filter((t) => t.text)
          : []
      }));
    }

    next.ui.activeGroupId = next.groups[0]?.id || null;
    next.ui.activeFavId = next.favorites[0]?.id || null;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function loadData() {
  migrateLegacyIfNeeded();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const data = { ...defaultData(), ...parsed };

    if (!data.ui || typeof data.ui !== 'object') data.ui = defaultData().ui;
    if (!Array.isArray(data.groups)) data.groups = [];
    if (!Array.isArray(data.favorites)) data.favorites = [];

    for (const g of data.groups) {
      if (!g.id) g.id = uid();
      if (!Array.isArray(g.idols)) g.idols = [];
      for (const idol of g.idols) {
        if (!idol.id) idol.id = uid();
        if (!idol.cheerColor) idol.cheerColor = PRESET_COLORS[0];
        if (!Array.isArray(idol.tags)) idol.tags = [];
        for (const t of idol.tags) {
          if (!t.id) t.id = uid();
          t.text = normalizeTagText(t.text);
        }
        idol.tags = idol.tags.filter((t) => t.text);
      }
    }

    for (const f of data.favorites) {
      if (!f.id) f.id = uid();
      if (!Array.isArray(f.tags)) f.tags = [];
      for (const t of f.tags) {
        if (!t.id) t.id = uid();
        t.text = normalizeTagText(t.text);
      }
      f.tags = f.tags.filter((t) => t.text);
    }

    if (!data.ui.activeGroupId && data.groups[0]) data.ui.activeGroupId = data.groups[0].id;
    if (!data.ui.activeFavId && data.favorites[0]) data.ui.activeFavId = data.favorites[0].id;

    return data;
  } catch {
    return defaultData();
  }
}

const state = {
  data: loadData(),
  runtime: {
    editMode: false
  }
};

function isEditMode() {
  return !!state.runtime.editMode;
}

function setEditMode(v) {
  state.runtime.editMode = !!v;
  render();
}

function toggleEditMode() {
  setEditMode(!isEditMode());
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 1300);
}

const {
  openModal,
  closeModal,
  btn,
  showPrompt,
  showConfirm,
  showTagPromptWithSuggestions,
  showHelp,
  showColorPicker,
  initModalClose
} = createDialogs({
  $,
  t,
  toast,
  normalizeTagText,
  parseTagsInput,
  uniqKeepOrder,
  presetColors: PRESET_COLORS
});

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      // iOS Safari/PWA may zoom the page when focusing a small-font input.
      // Ensure >=16px to avoid unintended zoom during copy fallback.
      ta.style.fontSize = '16px';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function tagsToCopy(tags) {
  const normalized = tags.map((t) => normalizeTagText(t.text ?? t)).filter(Boolean);
  return uniqKeepOrder(normalized);
}

function collectGroupAllTags(group) {
  const tags = [];
  for (const idol of group?.idols || []) tags.push(...(idol.tags || []));
  return tags;
}

function suggestedTagsFromGroups({ preferGroupId = null, limit = 24 } = {}) {
  const out = [];
  const seen = new Set();

  const add = (t) => {
    const norm = normalizeTagText(t?.text ?? t);
    if (!norm) return;
    const key = norm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(norm);
  };

  const scanGroupReverse = (g) => {
    if (!g || !Array.isArray(g.idols)) return;
    for (let ii = g.idols.length - 1; ii >= 0; ii--) {
      const idol = g.idols[ii];
      if (!idol || !Array.isArray(idol.tags)) continue;
      for (let ti = idol.tags.length - 1; ti >= 0; ti--) add(idol.tags[ti]);
    }
  };

  const prefer = preferGroupId ? findGroup(preferGroupId) : null;
  if (prefer) scanGroupReverse(prefer);

  for (let gi = state.data.groups.length - 1; gi >= 0; gi--) {
    const g = state.data.groups[gi];
    if (prefer && g?.id === prefer.id) continue;
    scanGroupReverse(g);
  }

  return out.slice(0, limit);
}

async function copyText(label, tags) {
  const list = tagsToCopy(tags);
  const text = list.join(' ');
  if (!text) return toast(t('toast.copyEmpty') || '');
  const ok = await writeClipboard(text);
  if (ok) {
    toast(t('toast.copied', { label }));
    return;
  }

  toast(t('toast.copyFailed'));

  // Some environments (notably iOS Safari/PWA) may block programmatic clipboard
  // writes unless the call is in a strict user-gesture. Provide a manual fallback.
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const hint = document.createElement('div');
  hint.style.color = 'var(--muted)';
  hint.style.fontSize = '12px';
  hint.textContent = '可手动全选并复制：';

  const textarea = document.createElement('textarea');
  textarea.className = 'input';
  textarea.setAttribute('readonly', '');
  textarea.style.minHeight = '120px';
  textarea.style.resize = 'vertical';
  textarea.value = text;

  wrap.appendChild(hint);
  wrap.appendChild(textarea);

  openModal(t('toast.copyFailed') || '复制失败', wrap, [btn(t('modal.gotIt') || '知道了', 'btn', closeModal)]);
  requestAnimationFrame(() => {
    // Do not auto-select all: it looks odd and can fight user selection.
    textarea.focus();
    try {
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
    } catch {
      // ignore
    }
  });
}

function findGroup(id) {
  return state.data.groups.find((g) => g.id === id) || null;
}

function findFav(id) {
  return state.data.favorites.find((f) => f.id === id) || null;
}

function activeGroup() {
  const id = state.data.ui.activeGroupId;
  return (id && findGroup(id)) || state.data.groups[0] || null;
}

function activeFav() {
  const id = state.data.ui.activeFavId;
  return (id && findFav(id)) || state.data.favorites[0] || null;
}

function setActiveGroup(id) {
  state.data.ui.activeGroupId = id;
  saveData();
  render();
}

function setActiveFav(id) {
  state.data.ui.activeFavId = id;
  saveData();
  render();
}

async function renameGroup(groupId) {
  const g = findGroup(groupId);
  if (!g) return;
  const name = await showPrompt({
    title: t('prompt.groupRename.title') || '编辑组合名',
    placeholder: t('prompt.groupRename.placeholder') || t('prompt.groupAdd.placeholder') || '组合名',
    okText: t('modal.ok') || '确定',
    initialValue: g.name
  });
  if (name == null) return;
  const trimmed = String(name).trim();
  if (!trimmed) return;
  g.name = trimmed;
  saveData();
  render();
}

async function renameFavFolder(folderId) {
  const f = findFav(folderId);
  if (!f) return;
  const name = await showPrompt({
    title: t('prompt.favRename.title') || '编辑收藏夹名',
    placeholder: t('prompt.favRename.placeholder') || t('prompt.favAdd.placeholder') || '收藏夹名称',
    okText: t('modal.ok') || '确定',
    initialValue: f.name
  });
  if (name == null) return;
  const trimmed = String(name).trim();
  if (!trimmed) return;
  f.name = trimmed;
  saveData();
  render();
}

async function renameIdol(groupId, idolId) {
  const g = findGroup(groupId);
  const idol = g?.idols?.find((x) => x.id === idolId) || null;
  if (!g || !idol) return;
  const name = await showPrompt({
    title: t('prompt.idolRename.title') || '编辑偶像名',
    placeholder: t('prompt.idolRename.placeholder') || t('prompt.idolAdd.placeholder') || '偶像名',
    okText: t('modal.ok') || '确定',
    initialValue: idol.name
  });
  if (name == null) return;
  const trimmed = String(name).trim();
  if (!trimmed) return;
  idol.name = trimmed;
  saveData();
  render();
}

async function renameIdolTag(groupId, idolId, tagId) {
  const g = findGroup(groupId);
  const idol = g?.idols?.find((x) => x.id === idolId) || null;
  const tag = idol?.tags?.find((x) => x.id === tagId) || null;
  if (!g || !idol || !tag) return;

  const current = normalizeTagText(tag.text);
  const v = await showPrompt({
    title: t('prompt.tagRename.title') || '编辑TAG',
    placeholder: t('prompt.tagRename.placeholder') || t('prompt.tagAdd.placeholder') || 'TAG',
    okText: t('modal.ok') || '确定',
    initialValue: current
  });
  if (v == null) return;

  const next = normalizeTagText(v);
  if (!next) return;

  const nextKey = next.toLowerCase();
  const conflict = idol.tags.some((x) => x.id !== tagId && normalizeTagText(x.text).toLowerCase() === nextKey);
  if (conflict) return toast(t('toast.tagExists') || t('toast.favTagExists') || '已存在');

  tag.text = next;
  saveData();
  render();
}

async function renameFavTag(folderId, tagId) {
  const f = findFav(folderId);
  const tag = f?.tags?.find((x) => x.id === tagId) || null;
  if (!f || !tag) return;

  const current = normalizeTagText(tag.text);
  const v = await showPrompt({
    title: t('prompt.tagRename.title') || '编辑TAG',
    placeholder: t('prompt.tagRename.placeholder') || t('prompt.favTagAdd.title') || 'TAG',
    okText: t('modal.ok') || '确定',
    initialValue: current
  });
  if (v == null) return;

  const next = normalizeTagText(v);
  if (!next) return;

  const nextKey = next.toLowerCase();
  const conflict = f.tags.some((x) => x.id !== tagId && normalizeTagText(x.text).toLowerCase() === nextKey);
  if (conflict) return toast(t('toast.tagExists') || t('toast.favTagExists') || '已存在');

  tag.text = next;
  saveData();
  render();
}

function getImportTools() {
  return createImportTools({
    defaultData,
    uid,
    normalizeTagText,
    presetColors: PRESET_COLORS,
    favoritesHeading: MD_FAVORITES_HEADING
  });
}

function createImportCompareCard(title, summary) {
  const card = document.createElement('section');
  card.className = 'compare-card';

  const heading = document.createElement('h4');
  heading.className = 'compare-card-title';
  heading.textContent = title;

  const stats = document.createElement('div');
  stats.className = 'compare-stats';
  stats.textContent = [
    t('import.summary.groups', { count: summary.groups }),
    t('import.summary.idols', { count: summary.idols }),
    t('import.summary.favorites', { count: summary.favorites }),
    t('import.summary.tags', { count: summary.tags })
  ].join('\n');

  card.appendChild(heading);
  card.appendChild(stats);
  return card;
}

function createImportDiffSection(title, diff, labels) {
  if (!diff.addedTotal && !diff.removedTotal) return null;

  const section = document.createElement('section');
  section.className = 'compare-diff-card';

  const heading = document.createElement('h4');
  heading.className = 'compare-card-title';
  heading.textContent = title;
  section.appendChild(heading);

  const buildBlock = (label, items, total) => {
    const block = document.createElement('div');
    block.className = 'compare-diff-block';

    const text = document.createElement('div');
    text.className = 'compare-names';
    block.appendChild(text);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'expand-link';

    let expanded = false;
    const visibleCount = 6;

    const renderItems = () => {
      const shown = expanded ? items : items.slice(0, visibleCount);
      text.textContent = `${label}${shown.length ? `\n${shown.join('\n')}` : `\n${t('import.previewEmpty')}`}`;

      if (items.length <= visibleCount) {
        toggle.remove();
        return;
      }

      toggle.textContent = expanded
        ? t('import.diffCollapse')
        : t('import.diffExpand', { count: total - shown.length });
      if (!toggle.isConnected) block.appendChild(toggle);
    };

    toggle.addEventListener('click', () => {
      expanded = !expanded;
      renderItems();
    });

    renderItems();
    return block;
  };

  if (diff.addedTotal) section.appendChild(buildBlock(labels.added, diff.addedItems, diff.addedTotal));
  if (diff.removedTotal) section.appendChild(buildBlock(labels.removed, diff.removedItems, diff.removedTotal));

  return section;
}

function backupDataBeforeImport() {
  try {
    localStorage.setItem(IMPORT_BACKUP_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      data: state.data
    }));
  } catch {
    // ignore backup failures; import can still proceed
  }
}

function loadImportBackup() {
  const raw = localStorage.getItem(IMPORT_BACKUP_KEY);
  if (!raw) return null;

  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') return null;

  return {
    savedAt: parsed.savedAt ? String(parsed.savedAt) : '',
    data: parsed.data,
    summary: summarizeData(parsed.data)
  };
}

function showImportConfirm(preview) {
  return new Promise((resolve) => {
    const importTools = getImportTools();
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const currentSummary = summarizeData(state.data);
    const sourceSummary = preview.summary;
    const operationByMode = {
      [IMPORT_MODE_REPLACE]: importTools.prepareImportOperation(IMPORT_MODE_REPLACE, state.data, preview.data),
      [IMPORT_MODE_MERGE]: importTools.prepareImportOperation(IMPORT_MODE_MERGE, state.data, preview.data)
    };
    let selectedMode = IMPORT_MODE_REPLACE;

    const warning = document.createElement('div');
    warning.style.whiteSpace = 'pre-wrap';

    const modeRow = document.createElement('div');
    modeRow.className = 'mode-row';

    const makeModeButton = (mode, label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mode-chip';
      button.textContent = label;
      button.dataset.mode = mode;
      button.addEventListener('click', () => {
        selectedMode = mode;
        renderPreview();
      });
      return button;
    };

    const modeButtons = [
      makeModeButton(IMPORT_MODE_REPLACE, t('import.mode.replace')),
      makeModeButton(IMPORT_MODE_MERGE, t('import.mode.merge'))
    ];
    for (const button of modeButtons) modeRow.appendChild(button);

    const compareGrid = document.createElement('div');
    compareGrid.className = 'compare-grid';

    const delta = document.createElement('div');
    delta.className = 'compare-delta';

    const diffGrid = document.createElement('div');
    diffGrid.className = 'compare-grid';

    const confirmButton = btn(t('import.confirmReplace'), 'btn', () => {
      closeModal();
      resolve(operationByMode[selectedMode]);
    });

    const renderPreview = () => {
      const operation = operationByMode[selectedMode];

      warning.textContent =
        selectedMode === IMPORT_MODE_MERGE
          ? t('import.confirmWarningMerge')
          : t('import.confirmWarningReplace');

      for (const button of modeButtons) {
        button.classList.toggle('active', button.dataset.mode === selectedMode);
      }

      compareGrid.innerHTML = '';
      compareGrid.appendChild(createImportCompareCard(t('import.currentData'), currentSummary));
      compareGrid.appendChild(createImportCompareCard(t('import.sourceData'), sourceSummary));
      compareGrid.appendChild(createImportCompareCard(t('import.resultData'), operation.summary));

      delta.textContent = [
        t('import.deltaTitle'),
        t('import.delta.groups', { delta: formatDelta(operation.deltas.groups) }),
        t('import.delta.idols', { delta: formatDelta(operation.deltas.idols) }),
        t('import.delta.favorites', { delta: formatDelta(operation.deltas.favorites) }),
        t('import.delta.tags', { delta: formatDelta(operation.deltas.tags) })
      ].join('\n');

      diffGrid.innerHTML = '';
      const sections = [
        createImportDiffSection(t('import.diffGroupsTitle'), operation.diffs.groups, {
          added: t('import.diffGroupsAdded'),
          removed: t('import.diffGroupsRemoved')
        }),
        createImportDiffSection(t('import.diffIdolsTitle'), operation.diffs.idols, {
          added: t('import.diffIdolsAdded'),
          removed: t('import.diffIdolsRemoved')
        }),
        createImportDiffSection(t('import.diffFavoritesTitle'), operation.diffs.favorites, {
          added: t('import.diffFavoritesAdded'),
          removed: t('import.diffFavoritesRemoved')
        }),
        createImportDiffSection(t('import.diffTagsTitle'), operation.diffs.tags, {
          added: t('import.diffTagsAdded'),
          removed: t('import.diffTagsRemoved')
        })
      ].filter(Boolean);

      if (sections.length === 0) {
        const noChange = document.createElement('section');
        noChange.className = 'compare-diff-card';

        const title = document.createElement('h4');
        title.className = 'compare-card-title';
        title.textContent = t('import.noDiffTitle');

        const body = document.createElement('div');
        body.className = 'compare-names';
        body.textContent = t('import.noDiffBody');

        noChange.appendChild(title);
        noChange.appendChild(body);
        diffGrid.appendChild(noChange);
      } else {
        for (const section of sections) diffGrid.appendChild(section);
      }

      confirmButton.textContent =
        selectedMode === IMPORT_MODE_MERGE
          ? t('import.confirmMerge')
          : t('import.confirmReplace');
    };

    wrap.appendChild(warning);
    wrap.appendChild(modeRow);
    wrap.appendChild(compareGrid);
    wrap.appendChild(delta);
    wrap.appendChild(diffGrid);

    $('#modal')?.classList.add('modal-wide');
    openModal(t('import.confirmTitle'), wrap, [
      btn(t('modal.cancel'), 'btn btn-secondary', () => {
        closeModal();
        resolve(null);
      }),
      confirmButton
    ]);

    renderPreview();
  });
}

function showRestoreBackupConfirm(backup) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const warning = document.createElement('div');
    warning.style.whiteSpace = 'pre-wrap';
    warning.textContent = t('backup.restoreConfirm');

    const meta = document.createElement('div');
    meta.style.whiteSpace = 'pre-wrap';
    meta.textContent = backup.savedAt
      ? t('backup.savedAt', { time: backup.savedAt })
      : t('backup.savedAtUnknown');

    const summary = document.createElement('div');
    summary.style.whiteSpace = 'pre-wrap';
    summary.textContent = [
      t('import.summary.groups', { count: backup.summary.groups }),
      t('import.summary.idols', { count: backup.summary.idols }),
      t('import.summary.favorites', { count: backup.summary.favorites }),
      t('import.summary.tags', { count: backup.summary.tags })
    ].join('\n');

    wrap.appendChild(warning);
    wrap.appendChild(meta);
    wrap.appendChild(summary);

    openModal(t('backup.restoreTitle'), wrap, [
      btn(t('modal.cancel'), 'btn btn-secondary', () => {
        closeModal();
        resolve(false);
      }),
      btn(t('backup.restoreAction'), 'btn', () => {
        closeModal();
        resolve(true);
      })
    ]);
  });
}

// ---------- Actions ----------
async function addGroup() {
  const name = await showPrompt({ title: t('prompt.groupAdd.title'), placeholder: t('prompt.groupAdd.placeholder') });
  if (!name) return;
  const g = { id: uid(), name: name.trim(), idols: [] };
  if (!g.name) return;
  state.data.groups.push(g);
  state.data.ui.activeGroupId = g.id;
  saveData();
  render();
}

async function addIdol(groupId) {
  const name = await showPrompt({ title: t('prompt.idolAdd.title'), placeholder: t('prompt.idolAdd.placeholder') });
  if (!name) return;
  const g = findGroup(groupId);
  if (!g) return;
  const idol = { id: uid(), name: name.trim(), cheerColor: PRESET_COLORS[0], tags: [] };
  if (!idol.name) return;
  g.idols.push(idol);
  saveData();
  render();
}

async function addTagsToIdol(groupId, idolId) {
  const raw = await showPrompt({ title: t('prompt.tagAdd.title'), placeholder: t('prompt.tagAdd.placeholder') });
  if (!raw) return;
  const parts = parseTagsInput(raw);
  if (parts.length === 0) return;

  const g = findGroup(groupId);
  if (!g) return;
  const idol = g.idols.find((i) => i.id === idolId);
  if (!idol) return;

  const existing = new Set(idol.tags.map((t) => normalizeTagText(t.text)).map((t) => t.toLowerCase()));
  for (const p of parts) {
    const key = p.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    idol.tags.push({ id: uid(), text: p });
  }

  saveData();
  render();
}

function deleteGroup(groupId) {
  const idx = state.data.groups.findIndex((g) => g.id === groupId);
  if (idx === -1) return;
  state.data.groups.splice(idx, 1);
  if (state.data.ui.activeGroupId === groupId) state.data.ui.activeGroupId = state.data.groups[0]?.id || null;
  saveData();
  render();
}

function deleteIdol(groupId, idolId) {
  const g = findGroup(groupId);
  if (!g) return;
  const idx = g.idols.findIndex((i) => i.id === idolId);
  if (idx === -1) return;
  g.idols.splice(idx, 1);
  saveData();
  render();
}

function deleteTag(groupId, idolId, tagId) {
  const g = findGroup(groupId);
  if (!g) return;
  const idol = g.idols.find((i) => i.id === idolId);
  if (!idol) return;
  const idx = idol.tags.findIndex((t) => t.id === tagId);
  if (idx === -1) return;
  idol.tags.splice(idx, 1);
  saveData();
  render();
}

async function addFavFolder() {
  const name = await showPrompt({ title: t('prompt.favAdd.title'), placeholder: t('prompt.favAdd.placeholder') });
  if (!name) return;
  const f = { id: uid(), name: name.trim(), tags: [] };
  if (!f.name) return;
  state.data.favorites.push(f);
  state.data.ui.activeFavId = f.id;
  saveData();
  render();
}

async function addFavTags(folderId) {
  const suggestions = suggestedTagsFromGroups({ preferGroupId: activeGroup()?.id || null, limit: 28 });
  const raw = await showTagPromptWithSuggestions({
    title: t('prompt.favTagAdd.title'),
    placeholder: t('prompt.tagAdd.placeholder'),
    suggestions,
    onSuggestionPicked: (tagText) => {
      const f = findFav(folderId);
      if (!f) return true;

      const norm = normalizeTagText(tagText);
      if (!norm) return true;

      const key = norm.toLowerCase();
      const existing = new Set(f.tags.map((t) => normalizeTagText(t.text)).map((t) => t.toLowerCase()));
      if (existing.has(key)) {
        toast(t('toast.favTagExists'));
        return true;
      }

      f.tags.push({ id: uid(), text: norm });
      saveData();
      render();
      toast(t('toast.favTagAdded'));
      return true;
    },
    okText: t('prompt.favTagAdd.ok')
  });
  if (!raw) return;
  const parts = parseTagsInput(raw);
  if (parts.length === 0) return;

  const f = findFav(folderId);
  if (!f) return;

  const existing = new Set(f.tags.map((t) => normalizeTagText(t.text)).map((t) => t.toLowerCase()));
  for (const p of parts) {
    const key = p.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    f.tags.push({ id: uid(), text: p });
  }

  saveData();
  render();
}

function deleteFavFolder(folderId) {
  const idx = state.data.favorites.findIndex((f) => f.id === folderId);
  if (idx === -1) return;
  state.data.favorites.splice(idx, 1);
  if (state.data.ui.activeFavId === folderId) state.data.ui.activeFavId = state.data.favorites[0]?.id || null;
  saveData();
  render();
}

function deleteFavTag(folderId, tagId) {
  const f = findFav(folderId);
  if (!f) return;
  const idx = f.tags.findIndex((t) => t.id === tagId);
  if (idx === -1) return;
  f.tags.splice(idx, 1);
  saveData();
  render();
}

// ---------- Render ----------
const render = createRenderer({
  $,
  state,
  t,
  isEditMode,
  activeGroup,
  activeFav,
  findGroup,
  findFav,
  setActiveGroup,
  setActiveFav,
  addGroup,
  addFavFolder,
  addIdol,
  addTagsToIdol,
  addFavTags,
  renameGroup,
  renameFavFolder,
  renameIdol,
  renameIdolTag,
  renameFavTag,
  deleteGroup,
  deleteFavFolder,
  deleteIdol,
  deleteTag,
  deleteFavTag,
  saveData,
  copyText,
  collectGroupAllTags,
  normalizeTagText,
  showColorPicker,
  presetColors: PRESET_COLORS
});

// ---------- Markdown import/export ----------
function nowISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeMd(text) {
  return String(text ?? '').replace(/\r?\n/g, ' ').trim();
}

function exportMarkdown() {
  const lines = [];
  lines.push(`<!-- oshiTag v${APP_VERSION} export ${nowISODate()} -->`);
  lines.push('');

  for (const g of state.data.groups) {
    lines.push(`# ${escapeMd(g.name)}`);
    for (const idol of g.idols) {
      lines.push(`## ${escapeMd(idol.name)}`);
      if (idol.cheerColor) lines.push(`<!-- cheerColor: ${idol.cheerColor} -->`);
      for (const t of idol.tags) {
        lines.push(`### ${escapeMd(normalizeTagText(t.text))}`);
      }
      lines.push('');
    }
    lines.push('');
  }

  lines.push(`# ${MD_FAVORITES_HEADING}`);
  for (const f of state.data.favorites) {
    lines.push(`## ${escapeMd(f.name)}`);
    for (const t of f.tags) {
      lines.push(`### ${escapeMd(normalizeTagText(t.text))}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function applyImportedData(preview) {
  backupDataBeforeImport();
  state.data = preview.data;
  saveData();
  render();
  toast(t('toast.mdImported', {
    groups: preview.summary.groups,
    favorites: preview.summary.favorites,
    tags: preview.summary.tags
  }));
}

// ---------- Menu + PWA ----------
function initMenu() {
  const btnMenu = $('#btnMenu');
  const menuPanel = $('#menuPanel');
  const btnRestoreBackup = $('#btnRestoreBackup');

  const updateRestoreButtonState = () => {
    if (!btnRestoreBackup) return;
    btnRestoreBackup.disabled = !loadImportBackup();
  };

  const closeMenu = () => {
    menuPanel.classList.remove('open');
    btnMenu.setAttribute('aria-expanded', 'false');
    menuPanel.setAttribute('aria-hidden', 'true');
  };

  const openMenu = () => {
    updateRestoreButtonState();
    menuPanel.classList.add('open');
    btnMenu.setAttribute('aria-expanded', 'true');
    menuPanel.setAttribute('aria-hidden', 'false');
  };

  btnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuPanel.classList.contains('open')) closeMenu();
    else openMenu();
  });

  document.addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      closeModal();
      if (isEditMode()) setEditMode(false);
    }
  });

  $('#btnExportMd').addEventListener('click', () => {
    downloadText(`oshiTag-${nowISODate()}.md`, exportMarkdown());
    closeMenu();
  });

  $('#fileImportMd').addEventListener('change', async (e) => {
    const importTools = getImportTools();
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    e.target.value = '';
    closeMenu();

    const preview = importTools.parseMarkdownImport(text);
    if (!preview) {
      toast(t('toast.importEmpty'));
      return;
    }

    const operation = await showImportConfirm(preview);
    if (!operation) return;

    applyImportedData(operation);
  });

  btnRestoreBackup?.addEventListener('click', async () => {
    closeMenu();

    const backup = loadImportBackup();
    if (!backup) {
      toast(t('toast.backupMissing'));
      return;
    }

    const ok = await showRestoreBackupConfirm(backup);
    if (!ok) return;

    state.data = backup.data;
    saveData();
    render();
    toast(t('toast.backupRestored'));
  });

  $('#btnHelp').addEventListener('click', () => {
    closeMenu();
    showHelp();
  });

  $('#btnLang')?.addEventListener('click', () => {
    closeMenu();
    showLanguageModal();
  });
}

function localeOptions() {
  const items = [];
  for (const [code, bundle] of i18n.bundles.entries()) {
    items.push({ code, name: bundle?.name || code });
  }
  items.sort((a, b) => a.code.localeCompare(b.code));
  return items;
}

function showLanguageModal() {
  const prev = { mode: i18n.mode, locale: i18n.locale };

  const wrap = document.createElement('div');
  wrap.className = 'field';

  const label = document.createElement('div');
  label.style.color = 'var(--muted)';
  label.style.fontSize = '12px';
  label.style.marginBottom = '8px';
  label.textContent = t('lang.current');

  const sel = document.createElement('select');
  sel.className = 'input';
  sel.style.height = '42px';

  const optAuto = document.createElement('option');
  optAuto.value = 'auto';
  optAuto.textContent = t('lang.auto');
  sel.appendChild(optAuto);

  for (const it of localeOptions()) {
    const o = document.createElement('option');
    o.value = it.code;
    o.textContent = `${it.name} (${it.code})`;
    sel.appendChild(o);
  }

  sel.value = i18n.mode === 'auto' ? 'auto' : i18n.locale;

  const hint = document.createElement('div');
  hint.style.color = 'var(--muted)';
  hint.style.fontSize = '12px';
  hint.style.marginTop = '10px';
  hint.textContent = t('lang.jsonHint');

  wrap.appendChild(label);
  wrap.appendChild(sel);

  const updateTexts = (els) => {
    $('#modalTitle').textContent = t('lang.title');
    label.textContent = t('lang.current');
    optAuto.textContent = t('lang.auto');
    hint.textContent = t('lang.jsonHint');

    if (els?.edit) els.edit.textContent = t('lang.editJson');
    if (els?.add) els.add.textContent = t('lang.add');
    if (els?.del) els.del.textContent = t('lang.delete');
    if (els?.ok) els.ok.textContent = t('modal.ok');
  };

  const applySelection = (v, { persist } = { persist: false }) => {
    if (v === 'auto') {
      if (persist) localStorage.setItem(I18N_STORAGE_LANG, 'auto');
      i18n.mode = 'auto';
      i18n.locale = pickLocaleAuto();
    } else {
      if (persist) localStorage.setItem(I18N_STORAGE_LANG, v);
      i18n.mode = 'manual';
      i18n.locale = v;
    }
    if (!i18n.bundles.has(i18n.locale)) i18n.locale = i18n.fallback;
    applyI18n();
    render();
  };

  const deleteBtn = btn(t('lang.delete'), 'btn btn-secondary', async () => {
    const code = sel.value;
    if (!code || code === 'auto') return;
    if (BUILTIN_LOCALES.some((x) => x.code === code)) {
      toast(t('lang.deleteNotAllowed'));
      return;
    }

    const user = loadUserLocales();
    if (!Object.prototype.hasOwnProperty.call(user, code)) {
      toast(t('lang.deleteNotAllowed'));
      return;
    }

    const ok = await showConfirm({
      title: t('lang.delete'),
      message: t('lang.deleteConfirm', { code }),
      okText: t('lang.delete')
    });
    if (!ok) return;

    const user2 = loadUserLocales();
    if (!Object.prototype.hasOwnProperty.call(user2, code)) return;
    delete user2[code];
    saveUserLocales(user2);
    i18n.bundles.delete(code);

    for (const o of Array.from(sel.options)) {
      if (o.value === code) o.remove();
    }

    if (i18n.mode === 'manual' && i18n.locale === code) {
      localStorage.setItem(I18N_STORAGE_LANG, 'auto');
      i18n.mode = 'auto';
      i18n.locale = pickLocaleAuto();
      if (!i18n.bundles.has(i18n.locale)) i18n.locale = i18n.fallback;
      sel.value = 'auto';
    }

    applyI18n();
    render();
    toast(t('lang.deleted', { code }));
    updateDeleteState();
  });

  function updateDeleteState() {
    const code = sel.value;
    if (!code || code === 'auto') {
      deleteBtn.disabled = true;
      return;
    }
    if (BUILTIN_LOCALES.some((x) => x.code === code)) {
      deleteBtn.disabled = true;
      return;
    }
    const user = loadUserLocales();
    deleteBtn.disabled = !Object.prototype.hasOwnProperty.call(user, code);
  }

  sel.addEventListener('change', updateDeleteState);
  updateDeleteState();

  sel.addEventListener('change', () => {
    applySelection(sel.value, { persist: false });
    updateTexts(els);
    updateDeleteState();
    toast(t('lang.applied', { code: i18n.mode === 'auto' ? pickLocaleAuto() : i18n.locale }));
  });

  const onDismiss = () => {
    i18n.mode = prev.mode;
    i18n.locale = prev.locale;
    applyI18n();
    render();
    closeModal();
  };

  const els = {
    edit: btn(t('lang.editJson'), 'btn btn-secondary', async () => {
      const mode = sel.value;
      const code = mode === 'auto' ? pickLocaleAuto() : mode;
      await showEditLocaleJson(code);
      showLanguageModal();
    }),
    add: btn(t('lang.add'), 'btn btn-secondary', async () => {
      await showAddLocaleFlow();
      showLanguageModal();
    }),
    ok: btn(t('modal.ok'), 'btn', () => {
      applySelection(sel.value, { persist: true });
      closeModal();
    })
  };

  els.del = deleteBtn;

  updateTexts(els);

  const actions = [els.edit, els.add, deleteBtn, els.ok];

  openModal(t('lang.title'), wrap, actions, onDismiss);
}

async function showAddLocaleFlow() {
  const code = await showPrompt({ title: t('lang.addCodeTitle'), placeholder: t('lang.addCodePlaceholder'), okText: t('modal.ok') });
  if (!code) return;
  const cleanCode = String(code).trim();
  if (!cleanCode) return;
  const name = await showPrompt({ title: t('lang.addNameTitle'), placeholder: t('lang.addNamePlaceholder'), okText: t('modal.ok') });
  if (name == null) return;

  const user = loadUserLocales();
  if (!user[cleanCode]) user[cleanCode] = { name: String(name || cleanCode), strings: {} };
  saveUserLocales(user);

  i18n.bundles.set(cleanCode, { name: String(name || cleanCode), strings: {} });
  await showEditLocaleJson(cleanCode);
}

function showEditLocaleJson(code) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const textarea = document.createElement('textarea');
    textarea.className = 'input';
    textarea.style.minHeight = '240px';
    textarea.style.resize = 'vertical';

    const current = i18n.bundles.get(code)?.strings || {};
    // Don't require users to edit meta.name but allow it if they want
    textarea.value = JSON.stringify(current, null, 2);

    wrap.appendChild(textarea);

    const onSave = () => {
      const parsed = safeParseJson(textarea.value);
      if (!parsed || typeof parsed !== 'object') {
        toast(t('lang.invalidJson'));
        return;
      }

      const user = loadUserLocales();
      const prevName = user[code]?.name || i18n.bundles.get(code)?.name || code;
      const name = String(parsed['meta.name'] || prevName);
      user[code] = { name, strings: parsed };
      saveUserLocales(user);

      i18n.bundles.set(code, { name, strings: parsed });

      // If editing current locale, re-apply
      if (i18n.mode === 'manual' && i18n.locale === code) {
        applyI18n();
        render();
      }

      toast(t('lang.saved'));
      closeModal();
      resolve(true);
    };

    openModal(`${t('lang.manage')}：${code}`, wrap, [
      btn(t('modal.cancel'), 'btn btn-secondary', () => {
        closeModal();
        resolve(false);
      }),
      btn(t('lang.save'), 'btn', onSave)
    ]);

    requestAnimationFrame(() => textarea.focus());
  });
}

function initPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

function init() {
  // i18n must be ready before initial render/menu wiring
  initI18n().finally(() => {
    initMenu();
    initModalClose();
    initPwa();

    const btnEdit = $('#btnEdit');
    if (btnEdit) {
      btnEdit.addEventListener('click', () => toggleEditMode());
    }

    applyI18n();
    render();
  });
}

init();
