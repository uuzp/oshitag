/* oshiTag - minimal tabs UI
 * Groups tabs -> Idols cards -> Tags
 * Favorites tabs -> Tags
 * Click to copy, double-click to delete
 */

const APP_VERSION = '0.2.8';

// ---------- i18n ----------
const I18N_STORAGE_LANG = 'oshitag:i18n:lang';
const I18N_STORAGE_USER_LOCALES = 'oshitag:i18n:userLocales:v1';

const BUILTIN_LOCALES = [
  { code: 'zh-CN', path: './i18n/zh-CN.json' },
  { code: 'en', path: './i18n/en.json' },
  { code: 'ja', path: './i18n/ja.json' },
  { code: 'ko', path: './i18n/ko.json' }
];

const i18n = {
  ready: false,
  locale: 'zh-CN',
  mode: 'auto', // 'auto' | 'manual'
  bundles: new Map(), // code -> { name, strings }
  strings: {},
  fallback: 'zh-CN'
};

function getBrowserLangCandidates() {
  const raw = String(navigator.language || '').trim();
  if (!raw) return ['zh-CN'];
  const lower = raw.toLowerCase();
  const base = lower.split('-')[0];
  const out = [];
  // Prefer exact match first
  out.push(raw);
  out.push(lower);
  out.push(base);
  // Common Chinese variants
  if (base === 'zh') out.push('zh-CN');
  return Array.from(new Set(out));
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function loadUserLocales() {
  const raw = localStorage.getItem(I18N_STORAGE_USER_LOCALES);
  if (!raw) return {};
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
}

function saveUserLocales(obj) {
  localStorage.setItem(I18N_STORAGE_USER_LOCALES, JSON.stringify(obj));
}

async function loadBuiltinLocale(def) {
  try {
    const res = await fetch(def.path, { cache: 'no-cache' });
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('invalid');
    const name = String(data['meta.name'] || def.code);
    return { code: def.code, name, strings: data };
  } catch {
    // If fetch fails (offline), keep minimal fallback
    return { code: def.code, name: def.code, strings: {} };
  }
}

function pickLocaleAuto() {
  const have = new Set(i18n.bundles.keys());
  for (const c of getBrowserLangCandidates()) {
    const normalized = String(c).trim();
    if (!normalized) continue;
    // exact
    if (have.has(normalized)) return normalized;
    // case-insensitive match
    const found = Array.from(have).find((x) => x.toLowerCase() === normalized.toLowerCase());
    if (found) return found;
    // base language match
    const base = normalized.toLowerCase().split('-')[0];
    const baseFound = Array.from(have).find((x) => x.toLowerCase().split('-')[0] === base);
    if (baseFound) return baseFound;
  }
  return i18n.fallback;
}

function applyI18n() {
  const fallback = i18n.bundles.get(i18n.fallback)?.strings || {};
  const current = i18n.bundles.get(i18n.locale)?.strings || {};
  i18n.strings = { ...fallback, ...current };

  // Static nodes with data-i18n
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (!key) continue;
    const text = t(key);
    if (text) el.textContent = text;
  }

  document.title = t('app.title') || document.title;
}

function t(key, vars) {
  const raw = i18n.strings?.[key];
  const base = raw == null ? '' : String(raw);
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}

async function initI18n() {
  // Load built-ins
  const builtins = await Promise.all(BUILTIN_LOCALES.map(loadBuiltinLocale));
  for (const b of builtins) i18n.bundles.set(b.code, { name: b.name, strings: b.strings });

  // Merge user locales (override / add)
  const user = loadUserLocales();
  for (const [code, bundle] of Object.entries(user)) {
    if (!bundle || typeof bundle !== 'object') continue;
    const name = String(bundle.name || code);
    const strings = bundle.strings && typeof bundle.strings === 'object' ? bundle.strings : {};
    i18n.bundles.set(code, { name, strings });
  }

  const saved = localStorage.getItem(I18N_STORAGE_LANG);
  if (saved && saved !== 'auto') {
    i18n.mode = 'manual';
    i18n.locale = saved;
  } else {
    i18n.mode = 'auto';
    i18n.locale = pickLocaleAuto();
  }

  if (!i18n.bundles.has(i18n.locale)) i18n.locale = i18n.fallback;

  i18n.ready = true;
  applyI18n();
}

const STORAGE_KEY = 'oshitag:data:v2';
const LEGACY_KEY = 'oshitag:data:v1';
const IMPORT_BACKUP_KEY = 'oshitag:data:import-backup:v1';
const MD_FAVORITES_HEADING = '[FAVORITES]';
const IMPORT_MODE_REPLACE = 'replace';
const IMPORT_MODE_MERGE = 'merge';
const IMPORT_MODE_APPEND = 'append';

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

// ---------- Modal ----------
let modalOnRequestClose = null;

function openModal(title, bodyNode, actions, onRequestClose = null) {
  const modal = $('#modal');
  $('#modalTitle').textContent = title;
  const body = $('#modalBody');
  body.innerHTML = '';
  body.appendChild(bodyNode);

  const act = $('#modalActions');
  act.innerHTML = '';
  for (const a of actions) act.appendChild(a);

  modalOnRequestClose = typeof onRequestClose === 'function' ? onRequestClose : null;

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const modal = $('#modal');
  modal.classList.remove('open');
  modal.classList.remove('modal-wide');
  modal.setAttribute('aria-hidden', 'true');
  modalOnRequestClose = null;
}

function requestModalClose() {
  if (typeof modalOnRequestClose === 'function') return modalOnRequestClose();
  closeModal();
}

function btn(text, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function showPrompt({ title, placeholder, okText = '确定', initialValue = '' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const input = document.createElement('input');
    input.className = 'input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    if (initialValue != null) input.value = String(initialValue);

    wrap.appendChild(input);

    const onOk = () => {
      const v = input.value;
      closeModal();
      resolve(v);
    };

    const onCancel = () => {
      closeModal();
      resolve(null);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    });

    openModal(title, wrap, [
      btn('取消', 'btn btn-secondary', onCancel),
      btn(okText, 'btn', onOk)
    ]);

    requestAnimationFrame(() => {
      input.focus();
      try {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    });
  });
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

function dedupeTagObjects(tags) {
  const seen = new Set();
  const out = [];

  for (const tag of tags || []) {
    const text = normalizeTagText(tag?.text ?? tag);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: tag?.id || uid(), text });
  }

  return out;
}

function summarizeData(data) {
  const summary = {
    groups: Array.isArray(data?.groups) ? data.groups.length : 0,
    idols: 0,
    favorites: Array.isArray(data?.favorites) ? data.favorites.length : 0,
    tags: 0
  };

  for (const group of data?.groups || []) {
    summary.idols += Array.isArray(group?.idols) ? group.idols.length : 0;
    for (const idol of group?.idols || []) summary.tags += Array.isArray(idol?.tags) ? idol.tags.length : 0;
  }

  for (const folder of data?.favorites || []) {
    summary.tags += Array.isArray(folder?.tags) ? folder.tags.length : 0;
  }

  return summary;
}

function normalizeNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function cloneTag(tag, { regenerateIds = false } = {}) {
  return {
    id: regenerateIds || !tag?.id ? uid() : tag.id,
    text: normalizeTagText(tag?.text)
  };
}

function cloneIdol(idol, { regenerateIds = false } = {}) {
  return {
    id: regenerateIds || !idol?.id ? uid() : idol.id,
    name: String(idol?.name || '').trim(),
    cheerColor: String(idol?.cheerColor || '').trim() || PRESET_COLORS[0],
    tags: dedupeTagObjects((idol?.tags || []).map((tag) => cloneTag(tag, { regenerateIds })))
  };
}

function cloneGroup(group, { regenerateIds = false } = {}) {
  return {
    id: regenerateIds || !group?.id ? uid() : group.id,
    name: String(group?.name || '').trim(),
    idols: (group?.idols || []).map((idol) => cloneIdol(idol, { regenerateIds })).filter((idol) => idol.name)
  };
}

function cloneFavorite(folder, { regenerateIds = false } = {}) {
  return {
    id: regenerateIds || !folder?.id ? uid() : folder.id,
    name: String(folder?.name || '').trim(),
    tags: dedupeTagObjects((folder?.tags || []).map((tag) => cloneTag(tag, { regenerateIds })))
  };
}

function cloneData(data, { regenerateIds = false } = {}) {
  const next = defaultData();
  next.groups = (data?.groups || []).map((group) => cloneGroup(group, { regenerateIds })).filter((group) => group.name);
  next.favorites = (data?.favorites || []).map((folder) => cloneFavorite(folder, { regenerateIds })).filter((folder) => folder.name);

  if (!regenerateIds) {
    next.ui.activeGroupId = data?.ui?.activeGroupId || next.groups[0]?.id || null;
    next.ui.activeFavId = data?.ui?.activeFavId || next.favorites[0]?.id || null;
  }

  ensureActiveIds(next);
  return next;
}

function ensureActiveIds(data) {
  if (!data?.groups?.some((group) => group.id === data?.ui?.activeGroupId)) {
    data.ui.activeGroupId = data?.groups?.[0]?.id || null;
  }
  if (!data?.favorites?.some((folder) => folder.id === data?.ui?.activeFavId)) {
    data.ui.activeFavId = data?.favorites?.[0]?.id || null;
  }
}

function mergeTagList(targetTags, incomingTags) {
  const existing = new Set((targetTags || []).map((tag) => normalizeTagText(tag.text).toLowerCase()));
  for (const tag of incomingTags || []) {
    const text = normalizeTagText(tag.text);
    if (!text) continue;
    const key = text.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    targetTags.push({ id: uid(), text });
  }
}

function buildReplaceImportResult(importedData) {
  return cloneData(importedData);
}

function buildAppendImportResult(currentData, importedData) {
  const result = cloneData(currentData);
  for (const group of importedData?.groups || []) result.groups.push(cloneGroup(group, { regenerateIds: true }));
  for (const folder of importedData?.favorites || []) result.favorites.push(cloneFavorite(folder, { regenerateIds: true }));
  ensureActiveIds(result);
  return result;
}

function buildMergeImportResult(currentData, importedData) {
  const result = cloneData(currentData);

  for (const incomingGroup of importedData?.groups || []) {
    const groupKey = normalizeNameKey(incomingGroup.name);
    if (!groupKey) continue;

    const targetGroup = result.groups.find((group) => normalizeNameKey(group.name) === groupKey);
    if (!targetGroup) {
      result.groups.push(cloneGroup(incomingGroup, { regenerateIds: true }));
      continue;
    }

    for (const incomingIdol of incomingGroup.idols || []) {
      const idolKey = normalizeNameKey(incomingIdol.name);
      if (!idolKey) continue;

      const targetIdol = targetGroup.idols.find((idol) => normalizeNameKey(idol.name) === idolKey);
      if (!targetIdol) {
        targetGroup.idols.push(cloneIdol(incomingIdol, { regenerateIds: true }));
        continue;
      }

      mergeTagList(targetIdol.tags, incomingIdol.tags || []);
      if (!targetIdol.cheerColor && incomingIdol.cheerColor) targetIdol.cheerColor = incomingIdol.cheerColor;
    }
  }

  for (const incomingFolder of importedData?.favorites || []) {
    const folderKey = normalizeNameKey(incomingFolder.name);
    if (!folderKey) continue;

    const targetFolder = result.favorites.find((folder) => normalizeNameKey(folder.name) === folderKey);
    if (!targetFolder) {
      result.favorites.push(cloneFavorite(incomingFolder, { regenerateIds: true }));
      continue;
    }

    mergeTagList(targetFolder.tags, incomingFolder.tags || []);
  }

  ensureActiveIds(result);
  return result;
}

function listGroupLabels(data) {
  return (data?.groups || []).map((group) => String(group?.name || '').trim()).filter(Boolean);
}

function listIdolLabels(data) {
  const out = [];
  for (const group of data?.groups || []) {
    const groupName = String(group?.name || '').trim();
    for (const idol of group?.idols || []) {
      const idolName = String(idol?.name || '').trim();
      if (!groupName || !idolName) continue;
      out.push(`${groupName} / ${idolName}`);
    }
  }
  return out;
}

function listFavoriteLabels(data) {
  return (data?.favorites || []).map((folder) => String(folder?.name || '').trim()).filter(Boolean);
}

function listTagLabels(data) {
  const out = [];

  for (const group of data?.groups || []) {
    const groupName = String(group?.name || '').trim();
    for (const idol of group?.idols || []) {
      const idolName = String(idol?.name || '').trim();
      for (const tag of idol?.tags || []) {
        const text = normalizeTagText(tag?.text);
        if (!groupName || !idolName || !text) continue;
        out.push(`${groupName} / ${idolName} / ${text}`);
      }
    }
  }

  for (const folder of data?.favorites || []) {
    const folderName = String(folder?.name || '').trim();
    for (const tag of folder?.tags || []) {
      const text = normalizeTagText(tag?.text);
      if (!folderName || !text) continue;
      out.push(`${MD_FAVORITES_HEADING} / ${folderName} / ${text}`);
    }
  }

  return out;
}

function diffLabelLists(currentItems, incomingItems, { limit = 6 } = {}) {
  const currentMap = new Map();
  const incomingMap = new Map();

  const addCount = (map, item) => {
    const text = String(item || '').trim();
    if (!text) return;
    const key = normalizeNameKey(text);
    const prev = map.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      map.set(key, { text, count: 1 });
    }
  };

  for (const item of currentItems || []) addCount(currentMap, item);
  for (const item of incomingItems || []) addCount(incomingMap, item);

  const added = [];
  const removed = [];
  let addedTotal = 0;
  let removedTotal = 0;

  for (const [key, entry] of incomingMap.entries()) {
    const diff = entry.count - (currentMap.get(key)?.count || 0);
    if (diff <= 0) continue;
    addedTotal += diff;
    added.push(diff > 1 ? `${entry.text} ×${diff}` : entry.text);
  }

  for (const [key, entry] of currentMap.entries()) {
    const diff = entry.count - (incomingMap.get(key)?.count || 0);
    if (diff <= 0) continue;
    removedTotal += diff;
    removed.push(diff > 1 ? `${entry.text} ×${diff}` : entry.text);
  }

  return {
    added: added.slice(0, limit),
    removed: removed.slice(0, limit),
    addedTotal,
    removedTotal
  };
}

function formatDelta(value) {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : String(value);
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
    const extra = total > items.length ? `\n${t('import.diffMore', { count: total - items.length })}` : '';
    text.textContent = `${label}${items.length ? `\n${items.join('\n')}${extra}` : `\n${t('import.previewEmpty')}`}`;
    block.appendChild(text);
    return block;
  };

  section.appendChild(buildBlock(labels.added, diff.added, diff.addedTotal));
  section.appendChild(buildBlock(labels.removed, diff.removed, diff.removedTotal));

  return section;
}

function prepareImportOperation(mode, importedData) {
  const currentData = state.data;
  let resultData = null;

  if (mode === IMPORT_MODE_APPEND) resultData = buildAppendImportResult(currentData, importedData);
  else if (mode === IMPORT_MODE_MERGE) resultData = buildMergeImportResult(currentData, importedData);
  else resultData = buildReplaceImportResult(importedData);

  const currentSummary = summarizeData(currentData);
  const sourceSummary = summarizeData(importedData);
  const resultSummary = summarizeData(resultData);

  return {
    mode,
    sourceSummary,
    summary: resultSummary,
    data: resultData,
    deltas: {
      groups: resultSummary.groups - currentSummary.groups,
      idols: resultSummary.idols - currentSummary.idols,
      favorites: resultSummary.favorites - currentSummary.favorites,
      tags: resultSummary.tags - currentSummary.tags
    },
    diffs: {
      groups: diffLabelLists(listGroupLabels(currentData), listGroupLabels(resultData)),
      idols: diffLabelLists(listIdolLabels(currentData), listIdolLabels(resultData)),
      favorites: diffLabelLists(listFavoriteLabels(currentData), listFavoriteLabels(resultData)),
      tags: diffLabelLists(listTagLabels(currentData), listTagLabels(resultData), { limit: 8 })
    }
  };
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
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const currentSummary = summarizeData(state.data);
    const sourceSummary = preview.summary;
    const operationByMode = {
      [IMPORT_MODE_REPLACE]: prepareImportOperation(IMPORT_MODE_REPLACE, preview.data),
      [IMPORT_MODE_MERGE]: prepareImportOperation(IMPORT_MODE_MERGE, preview.data),
      [IMPORT_MODE_APPEND]: prepareImportOperation(IMPORT_MODE_APPEND, preview.data)
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
      makeModeButton(IMPORT_MODE_MERGE, t('import.mode.merge')),
      makeModeButton(IMPORT_MODE_APPEND, t('import.mode.append'))
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
          : selectedMode === IMPORT_MODE_APPEND
            ? t('import.confirmWarningAppend')
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
      diffGrid.appendChild(createImportDiffSection(t('import.diffGroupsTitle'), operation.diffs.groups, {
        added: t('import.diffGroupsAdded'),
        removed: t('import.diffGroupsRemoved')
      }));
      diffGrid.appendChild(createImportDiffSection(t('import.diffIdolsTitle'), operation.diffs.idols, {
        added: t('import.diffIdolsAdded'),
        removed: t('import.diffIdolsRemoved')
      }));
      diffGrid.appendChild(createImportDiffSection(t('import.diffFavoritesTitle'), operation.diffs.favorites, {
        added: t('import.diffFavoritesAdded'),
        removed: t('import.diffFavoritesRemoved')
      }));
      diffGrid.appendChild(createImportDiffSection(t('import.diffTagsTitle'), operation.diffs.tags, {
        added: t('import.diffTagsAdded'),
        removed: t('import.diffTagsRemoved')
      }));

      confirmButton.textContent =
        selectedMode === IMPORT_MODE_MERGE
          ? t('import.confirmMerge')
          : selectedMode === IMPORT_MODE_APPEND
            ? t('import.confirmAppend')
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

function suppressNextClick() {
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.removeEventListener('click', onClick, true);
  };
  document.addEventListener('click', onClick, true);
}

function reorderById(items, orderedIds) {
  const map = new Map(items.map((it) => [it.id, it]));
  const out = [];
  for (const id of orderedIds) {
    const it = map.get(id);
    if (it) out.push(it);
  }
  // Keep any items that somehow weren't in the DOM order (safety)
  for (const it of items) {
    if (!orderedIds.includes(it.id)) out.push(it);
  }
  items.length = 0;
  items.push(...out);
}

function enablePointerSort(container, {
  itemSelector,
  idAttr = 'data-sort-id',
  canStart = () => true,
  onReorder
}) {
  if (!container) return;

  let pointerId = null;
  let draggingEl = null;
  let startX = 0;
  let startY = 0;
  let didDrag = false;
  let didCapture = false;

  const getItem = (el) => el?.closest?.(itemSelector) || null;
  const getId = (el) => el?.getAttribute?.(idAttr) || '';

  const reset = () => {
    if (draggingEl) draggingEl.classList.remove('is-dragging');
    container.classList.remove('is-sorting');
    if (didCapture && pointerId != null) {
      try {
        container.releasePointerCapture?.(pointerId);
      } catch {
        // ignore
      }
    }
    pointerId = null;
    draggingEl = null;
    didDrag = false;
    didCapture = false;
  };

  const onPointerDown = (e) => {
    if (!isEditMode()) return;
    if (e.button != null && e.button !== 0) return;
    if (!canStart(e)) return;

    const item = getItem(e.target);
    if (!item) return;
    if (!getId(item)) return;

    // Prevent default on touch to avoid scroll interference.
    if (e.pointerType === 'touch') {
      e.preventDefault();
    }

    pointerId = e.pointerId;
    draggingEl = item;
    startX = e.clientX;
    startY = e.clientY;
    didDrag = false;
    didCapture = false;
  };

  const onPointerMove = (e) => {
    if (pointerId == null || e.pointerId !== pointerId || !draggingEl) return;

    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (!didDrag) {
      if (dx + dy < 5) return;
      didDrag = true;
      container.classList.add('is-sorting');
      draggingEl.classList.add('is-dragging');

      // Capture only after drag starts; otherwise desktop clicks can be swallowed.
      try {
        container.setPointerCapture?.(pointerId);
        didCapture = true;
      } catch {
        didCapture = false;
      }
    }

    e.preventDefault();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = getItem(el);
    if (!over || over === draggingEl) return;
    if (!getId(over)) return;

    const all = Array.from(container.querySelectorAll(itemSelector));
    const from = all.indexOf(draggingEl);
    const to = all.indexOf(over);
    if (from === -1 || to === -1) return;

    if (to > from) {
      container.insertBefore(draggingEl, over.nextSibling);
    } else {
      container.insertBefore(draggingEl, over);
    }
  };

  const onPointerUp = (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    const wasDrag = didDrag;

    if (wasDrag) {
      const ids = Array.from(container.querySelectorAll(itemSelector))
        .map((el) => getId(el))
        .filter(Boolean);
      if (typeof onReorder === 'function') onReorder(ids);
      suppressNextClick();
    }

    reset();
  };

  const onPointerCancel = (e) => {
    if (pointerId == null || e.pointerId !== pointerId) return;
    reset();
  };

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerCancel);
}

function showConfirm({ title, message, okText }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const msg = document.createElement('div');
    msg.style.whiteSpace = 'pre-wrap';
    msg.textContent = String(message || '');
    wrap.appendChild(msg);

    const onOk = () => {
      closeModal();
      resolve(true);
    };
    const onCancel = () => {
      closeModal();
      resolve(false);
    };

    openModal(String(title || ''), wrap, [
      btn(t('modal.cancel'), 'btn btn-secondary', onCancel),
      btn(okText || t('modal.ok'), 'btn', onOk)
    ]);
  });
}

function showTagPromptWithSuggestions({
  title,
  placeholder,
  suggestions,
  okText = '确定',
  onSuggestionPicked = null
}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const input = document.createElement('input');
    input.className = 'input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';

    const sugg = document.createElement('div');
    sugg.className = 'tag-grid suggestions';

    const list = Array.isArray(suggestions) ? suggestions.filter(Boolean) : [];
    for (const s of list) {
      const chip = document.createElement('div');
      chip.className = 'tag';
      chip.textContent = normalizeTagText(s);
      chip.title = '点一下快速添加（或加入输入框）';
      chip.addEventListener('click', () => {
        if (typeof onSuggestionPicked === 'function' && onSuggestionPicked(chip.textContent) === true) return;
        const merged = uniqKeepOrder([...parseTagsInput(input.value), chip.textContent]);
        input.value = merged.join(' ');
        input.focus();
      });
      sugg.appendChild(chip);
    }

    wrap.appendChild(input);
    if (sugg.childElementCount) wrap.appendChild(sugg);

    const onOk = () => {
      const v = input.value;
      closeModal();
      resolve(v);
    };

    const onCancel = () => {
      closeModal();
      resolve(null);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    });

    openModal(title, wrap, [
      btn(t('modal.cancel'), 'btn btn-secondary', onCancel),
      btn(okText, 'btn', onOk)
    ]);

    requestAnimationFrame(() => input.focus());
  });
}

function showHelp() {
  const root = document.createElement('div');

  const intro = document.createElement('div');
  intro.style.color = 'var(--muted)';
  intro.style.fontSize = '12px';
  intro.style.marginBottom = '10px';
  intro.textContent = t('help.intro');

  const tip = document.createElement('div');
  tip.style.color = 'var(--muted)';
  tip.style.fontSize = '12px';
  tip.style.marginBottom = '10px';
  tip.textContent = t('help.modeTip');

  const section = (titleKey, items) => {
    const b = document.createElement('b');
    b.textContent = t(titleKey);
    const ul = document.createElement('ul');
    for (const k of items) {
      const li = document.createElement('li');
      li.textContent = t(k);
      ul.appendChild(li);
    }
    root.appendChild(b);
    root.appendChild(ul);
  };

  root.appendChild(intro);
  root.appendChild(tip);
  section('help.section.groups', ['help.groups.switch', 'help.groups.longPressCopy', 'help.groups.edit']);
  section('help.section.idols', ['help.idols.copy', 'help.idols.edit']);
  section('help.section.tags', ['help.tags.copy', 'help.tags.edit']);
  section('help.section.favorites', ['help.favorites.about', 'help.favorites.copy', 'help.favorites.edit']);

  openModal(t('help.title'), root, [btn(t('modal.gotIt'), 'btn', closeModal)]);
}

function showColorPicker({ title, initial, onPick }) {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const preset = document.createElement('div');
  preset.className = 'preset';

  const input = document.createElement('input');
  input.className = 'input';
  input.placeholder = '#39c5bb';
  input.value = String(initial || '').trim() || PRESET_COLORS[0];

  const apply = (v) => {
    const val = String(v || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(val)) {
      toast(t('toast.hexInvalid'));
      return;
    }
    closeModal();
    onPick(val.toLowerCase());
  };

  for (const c of PRESET_COLORS) {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.style.background = c;
    s.title = c;
    s.addEventListener('click', () => apply(c));
    preset.appendChild(s);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply(input.value);
    if (e.key === 'Escape') closeModal();
  });

  wrap.appendChild(preset);
  wrap.appendChild(input);

  openModal(title, wrap, [
    btn(t('modal.cancel'), 'btn btn-secondary', closeModal),
    btn(t('modal.ok'), 'btn', () => apply(input.value))
  ]);

  requestAnimationFrame(() => input.focus());
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
function renderTabs(rootEl, items, activeId, { onSelect, onAdd, onDelete, onRename, emptyEmoji }) {
  rootEl.innerHTML = '';

  // Sortable tabs (edit mode only)
  if (!rootEl._oshitagSortableTabs) {
    rootEl._oshitagSortableTabs = true;
    enablePointerSort(rootEl, {
      itemSelector: '.tab[data-sort-id]',
      canStart: (e) => {
        // Avoid dragging the plus button / empty-plus
        const item = e.target.closest?.('.tab');
        if (!item) return false;
        if (item.classList.contains('plus') || item.classList.contains('empty-plus')) return false;
        return true;
      },
      onReorder: (ids) => {
        // Decide which array to reorder by comparing ids.
        const set = new Set(ids);
        const groupIds = new Set(state.data.groups.map((g) => g.id));
        const favIds = new Set(state.data.favorites.map((f) => f.id));
        const isGroupTabs = ids.length && Array.from(set).every((id) => groupIds.has(id));
        const isFavTabs = ids.length && Array.from(set).every((id) => favIds.has(id));
        if (isGroupTabs) reorderById(state.data.groups, ids);
        if (isFavTabs) reorderById(state.data.favorites, ids);
        if (isGroupTabs || isFavTabs) {
          saveData();
          render();
        }
      }
    });
  }

  const editMode = isEditMode();
  const canRename = editMode && typeof onRename === 'function';
  const RENAME_DELAY_MS = 320;

  // Manual double-click tracking (survives DOM re-renders, unlike browser dblclick).
  if (!rootEl._oshitagClickTracker) {
    rootEl._oshitagClickTracker = { lastId: null, lastTime: 0 };
  }
  const clickTracker = rootEl._oshitagClickTracker;
  const DBLCLICK_THRESHOLD_MS = 400;

  if (rootEl._oshitagRenameTimer) {
    clearTimeout(rootEl._oshitagRenameTimer);
    rootEl._oshitagRenameTimer = null;
  }

  if (items.length === 0) {
    if (editMode) {
      const plus = document.createElement('div');
      plus.className = 'tab plus empty-plus';
      plus.textContent = emptyEmoji || '➕';
      plus.title = t('add.title');
      plus.addEventListener('click', onAdd);
      rootEl.appendChild(plus);
    }
    return;
  }

  for (const it of items) {
    const t = document.createElement('div');
    t.className = 'tab' + (it.id === activeId ? ' active' : '');
    t.textContent = it.name;
    t.setAttribute('data-sort-id', it.id);

    // Browse vs Edit are fully separated:
    // - Browse: click switches (immediate), double-click copies
    // - Edit: click active -> rename after delay; click other -> switch; dblclick deletes

    t.addEventListener('click', () => {
      const now = Date.now();
      const isDoubleClick = 
        clickTracker.lastId === it.id && 
        (now - clickTracker.lastTime) < DBLCLICK_THRESHOLD_MS;

      clickTracker.lastId = it.id;
      clickTracker.lastTime = now;

      // Browse mode: double-click -> copy (no switch)
      if (!editMode && isDoubleClick) {
        if (typeof onSelect?.onDblClick === 'function') {
          return onSelect.onDblClick(it.id);
        }
      }

      // Browse mode: single click -> switch immediately
      if (!editMode) {
        return onSelect(it.id);
      }

      // Edit mode: double-click -> delete
      if (editMode && isDoubleClick) {
        if (rootEl._oshitagRenameTimer) {
          clearTimeout(rootEl._oshitagRenameTimer);
          rootEl._oshitagRenameTimer = null;
        }
        return onDelete(it.id);
      }

      // Edit mode: click ACTIVE tab -> delayed rename
      if (canRename && it.id === activeId) {
        if (rootEl._oshitagRenameTimer) clearTimeout(rootEl._oshitagRenameTimer);
        rootEl._oshitagRenameTimer = setTimeout(() => {
          rootEl._oshitagRenameTimer = null;
          if (!isEditMode()) return;
          const stillActive = rootEl.querySelector('.tab.active')?.getAttribute('data-sort-id') === it.id;
          if (!stillActive) return;
          onRename(it.id);
        }, RENAME_DELAY_MS);
        return;
      }

      // Edit mode: click other tabs -> switch immediately
      onSelect(it.id);
    });

    rootEl.appendChild(t);
  }

  if (editMode) {
    const plus = document.createElement('div');
    plus.className = 'tab plus';
    plus.textContent = '＋';
    plus.title = t('add.title');
    plus.addEventListener('click', onAdd);
    rootEl.appendChild(plus);
  }
}

function renderGroupStage() {
  const stage = $('#groupStage');
  stage.innerHTML = '';

  const g = activeGroup();
  if (!g) {
    const empty = document.createElement('div');
    empty.className = 'big-card';
    empty.style.color = 'var(--muted)';
    empty.textContent = t('empty.groups');
    stage.appendChild(empty);
    return;
  }

  const card = document.createElement('div');
  card.className = 'big-card';
  card.addEventListener('click', (e) => {
    if (isEditMode()) return;
    if (e.target.closest('.idol-card, .tag, .color-dot')) return;
    const tags = [];
    for (const idol of g.idols) tags.push(...idol.tags);
    copyText(g.name, tags);
  });

  const grid = document.createElement('div');
  grid.className = 'idol-grid';

  if (!grid._oshitagSortableIdols) {
    grid._oshitagSortableIdols = true;
    enablePointerSort(grid, {
      itemSelector: '.idol-card[data-sort-id]',
      canStart: (e) => {
        // Avoid dragging the add button
        if (e.target.closest?.('.idol-add')) return false;
        // Avoid starting drag from interactive controls
        if (e.target.closest?.('.color-dot')) return false;
        return true;
      },
      onReorder: (ids) => {
        const g2 = activeGroup();
        if (!g2) return;
        reorderById(g2.idols, ids);
        saveData();
        render();
      }
    });
  }

  for (const idol of g.idols) {
    grid.appendChild(renderIdolCard(g, idol));
  }

  if (isEditMode()) {
    const plus = document.createElement('div');
    plus.className = 'idol-card idol-add';
    plus.textContent = '＋';
    plus.title = t('add.idol');
    plus.addEventListener('click', (e) => {
      e.stopPropagation();
      addIdol(g.id);
    });
    grid.appendChild(plus);
  }

  card.appendChild(grid);
  stage.appendChild(card);
}

function renderIdolCard(group, idol) {
  const card = document.createElement('div');
  card.className = 'idol-card';
  card.setAttribute('data-sort-id', idol.id);

  let renameTimer = null;
  const scheduleRename = () => {
    if (!isEditMode()) return;
    if (renameTimer) clearTimeout(renameTimer);
    renameTimer = setTimeout(() => {
      renameTimer = null;
      if (!isEditMode()) return;
      renameIdol(group.id, idol.id);
    }, 320);
  };
  const cancelRename = () => {
    if (renameTimer) clearTimeout(renameTimer);
    renameTimer = null;
  };

  const head = document.createElement('div');
  head.className = 'idol-head';

  const left = document.createElement('div');
  left.className = 'idol-name';

  const dot = document.createElement('div');
  dot.className = 'color-dot';
  dot.style.background = idol.cheerColor || PRESET_COLORS[0];
  dot.title = '设置应援色';
  dot.addEventListener('click', (e) => {
    if (!isEditMode()) return;
    e.stopPropagation();
    showColorPicker({
      title: t('color.title', { name: idol.name }),
      initial: idol.cheerColor,
      onPick: (c) => {
        idol.cheerColor = c;
        saveData();
        render();
      }
    });
  });

  const name = document.createElement('div');
  name.className = 'txt';
  name.textContent = idol.name;

  left.appendChild(dot);
  left.appendChild(name);

  head.appendChild(left);

  // Manual double-click tracking (survives re-renders, no browser dblclick dependency).
  let lastClickTime = 0;
  const DBLCLICK_THRESHOLD_MS = 400;

  head.addEventListener('click', () => {
    const now = Date.now();
    const isDoubleClick = (now - lastClickTime) < DBLCLICK_THRESHOLD_MS;
    lastClickTime = now;

    if (isEditMode() && isDoubleClick) {
      cancelRename();
      return deleteIdol(group.id, idol.id);
    }

    if (isEditMode()) return scheduleRename();
    copyText(idol.name, idol.tags);
  });

  const tags = document.createElement('div');
  tags.className = 'tag-grid';

  if (!tags._oshitagSortableTags) {
    tags._oshitagSortableTags = true;
    enablePointerSort(tags, {
      itemSelector: '.tag[data-sort-id]',
      canStart: (e) => {
        const chip = e.target.closest?.('.tag');
        if (!chip) return false;
        if (chip.classList.contains('plus')) return false;
        return true;
      },
      onReorder: (ids) => {
        const g2 = findGroup(group.id);
        const idol2 = g2?.idols?.find((x) => x.id === idol.id);
        if (!idol2) return;
        reorderById(idol2.tags, ids);
        saveData();
        render();
      }
    });
  }

  for (const t of idol.tags) {
    const chip = document.createElement('div');
    chip.className = 'tag';
    const tagText = normalizeTagText(t.text);
    chip.textContent = tagText;
    chip.setAttribute('data-sort-id', t.id);

    let renameTimer = null;
    const scheduleRename = () => {
      if (!isEditMode()) return;
      if (renameTimer) clearTimeout(renameTimer);
      renameTimer = setTimeout(() => {
        renameTimer = null;
        if (!isEditMode()) return;
        renameIdolTag(group.id, idol.id, t.id);
      }, 320);
    };
    const cancelRename = () => {
      if (renameTimer) clearTimeout(renameTimer);
      renameTimer = null;
    };

    // Manual double-click tracking (survives re-renders).
    let lastClickTime = 0;
    const DBLCLICK_THRESHOLD_MS = 400;

    chip.addEventListener('click', (e) => {
      e.stopPropagation();

      const now = Date.now();
      const isDoubleClick = (now - lastClickTime) < DBLCLICK_THRESHOLD_MS;
      lastClickTime = now;

      if (isEditMode() && isDoubleClick) {
        cancelRename();
        return deleteTag(group.id, idol.id, t.id);
      }

      if (isEditMode()) return scheduleRename();
      copyText(tagText, [tagText]);
    });
    tags.appendChild(chip);
  }

  if (isEditMode()) {
    const plus = document.createElement('div');
    plus.className = 'tag plus';
    plus.textContent = '+';
    plus.title = t('add.tag');
    plus.addEventListener('click', (e) => {
      e.stopPropagation();
      addTagsToIdol(group.id, idol.id);
    });
    tags.appendChild(plus);
  }

  card.appendChild(head);
  card.appendChild(tags);

  return card;
}

function renderFavoritesStage() {
  const stage = $('#favStage');
  stage.innerHTML = '';

  const f = activeFav();
  if (!f) {
    const empty = document.createElement('div');
    empty.className = 'big-card';
    empty.style.color = 'var(--muted)';
    empty.textContent = t('empty.favorites');
    stage.appendChild(empty);
    return;
  }

  const card = document.createElement('div');
  card.className = 'big-card';
  card.addEventListener('click', (e) => {
    if (isEditMode()) return;
    if (e.target.closest('.tag')) return;
    copyText(f.name, f.tags);
  });

  const tags = document.createElement('div');
  tags.className = 'tag-grid';

  if (!tags._oshitagSortableFavTags) {
    tags._oshitagSortableFavTags = true;
    enablePointerSort(tags, {
      itemSelector: '.tag[data-sort-id]',
      canStart: (e) => {
        const chip = e.target.closest?.('.tag');
        if (!chip) return false;
        if (chip.classList.contains('plus')) return false;
        return true;
      },
      onReorder: (ids) => {
        const f2 = activeFav();
        if (!f2) return;
        reorderById(f2.tags, ids);
        saveData();
        render();
      }
    });
  }

  for (const t of f.tags) {
    const chip = document.createElement('div');
    chip.className = 'tag';
    const tagText = normalizeTagText(t.text);
    chip.textContent = tagText;
    chip.setAttribute('data-sort-id', t.id);

    let renameTimer = null;
    const scheduleRename = () => {
      if (!isEditMode()) return;
      if (renameTimer) clearTimeout(renameTimer);
      renameTimer = setTimeout(() => {
        renameTimer = null;
        if (!isEditMode()) return;
        renameFavTag(f.id, t.id);
      }, 320);
    };
    const cancelRename = () => {
      if (renameTimer) clearTimeout(renameTimer);
      renameTimer = null;
    };
    // Manual double-click tracking (survives re-renders).
    let lastClickTime = 0;
    const DBLCLICK_THRESHOLD_MS = 400;

    chip.addEventListener('click', (e) => {
      e.stopPropagation();

      const now = Date.now();
      const isDoubleClick = (now - lastClickTime) < DBLCLICK_THRESHOLD_MS;
      lastClickTime = now;

      if (isEditMode() && isDoubleClick) {
        cancelRename();
        return deleteFavTag(f.id, t.id);
      }

      if (isEditMode()) return scheduleRename();
      copyText(tagText, [tagText]);
    });
    tags.appendChild(chip);
  }

  if (isEditMode()) {
    const plus = document.createElement('div');
    plus.className = 'tag plus';
    plus.textContent = '+';
    plus.title = t('add.tag');
    plus.addEventListener('click', (e) => {
      e.stopPropagation();
      addFavTags(f.id);
    });
    tags.appendChild(plus);
  }

  card.appendChild(tags);
  stage.appendChild(card);
}

function render() {
  document.body.classList.toggle('edit-on', isEditMode());
  const btnEdit = $('#btnEdit');
  if (btnEdit) {
    btnEdit.setAttribute('aria-pressed', isEditMode() ? 'true' : 'false');
    btnEdit.setAttribute('aria-label', isEditMode() ? t('edit.exit') : t('edit.enter'));
  }

  const groupOnSelect = setActiveGroup;
  groupOnSelect.onDblClick = (groupId) => {
    if (isEditMode()) return;
    const g = findGroup(groupId);
    if (!g) return;
    copyText(g.name, collectGroupAllTags(g));
  };

  const favOnSelect = setActiveFav;
  favOnSelect.onDblClick = (folderId) => {
    if (isEditMode()) return;
    const f = findFav(folderId);
    if (!f) return;
    copyText(f.name, f.tags);
  };

  renderTabs($('#groupTabs'), state.data.groups, activeGroup()?.id || null, {
    onSelect: groupOnSelect,
    onAdd: addGroup,
    onRename: renameGroup,
    onDelete: deleteGroup,
    emptyEmoji: '➕'
  });

  renderTabs($('#favTabs'), state.data.favorites, activeFav()?.id || null, {
    onSelect: favOnSelect,
    onAdd: addFavFolder,
    onRename: renameFavFolder,
    onDelete: deleteFavFolder,
    emptyEmoji: '➕'
  });

  renderGroupStage();
  renderFavoritesStage();
}

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

function parseMarkdownImport(mdText) {
  const text = String(mdText ?? '');
  const lines = text.split(/\r?\n/);

  const next = defaultData();

  let currentGroup = null;
  let currentIdol = null;
  let currentFavFolder = null;
  let inFav = false;

  const takeCheerColorIfPresent = (i) => {
    const line = (lines[i] ?? '').trim();
    const m = line.match(/^<!--\s*cheerColor\s*:\s*(#[0-9a-fA-F]{6})\s*-->$/);
    return m ? m[1] : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('# ')) {
      const name = line.slice(2).trim();
      if (!name) continue;
      inFav = name === MD_FAVORITES_HEADING;
      currentIdol = null;
      currentGroup = null;
      currentFavFolder = null;
      if (!inFav) {
        currentGroup = { id: uid(), name, idols: [] };
        next.groups.push(currentGroup);
        if (!next.ui.activeGroupId) next.ui.activeGroupId = currentGroup.id;
      }
      continue;
    }

    if (line.startsWith('## ')) {
      const name = line.slice(3).trim();
      if (!name) continue;
      currentIdol = null;
      if (inFav) {
        const folder = { id: uid(), name, tags: [] };
        next.favorites.push(folder);
        currentFavFolder = folder;
        if (!next.ui.activeFavId) next.ui.activeFavId = folder.id;
      } else if (currentGroup) {
        const idol = { id: uid(), name, cheerColor: PRESET_COLORS[0], tags: [] };
        const maybeColor = takeCheerColorIfPresent(i + 1);
        if (maybeColor) idol.cheerColor = maybeColor.toLowerCase();
        currentGroup.idols.push(idol);
        currentIdol = idol;
      }
      continue;
    }

    if (line.startsWith('### ')) {
      const t = normalizeTagText(line.slice(4).trim());
      if (!t) continue;
      if (inFav) {
        if (!currentFavFolder) continue;
        currentFavFolder.tags.push({ id: uid(), text: t });
      } else {
        if (!currentIdol) continue;
        currentIdol.tags.push({ id: uid(), text: t });
      }
      continue;
    }
  }

  for (const group of next.groups) {
    group.idols = group.idols.filter((idol) => idol.name);
    for (const idol of group.idols) idol.tags = dedupeTagObjects(idol.tags);
  }

  for (const folder of next.favorites) {
    folder.tags = dedupeTagObjects(folder.tags);
  }

  const summary = summarizeData(next);
  const hasContent = summary.groups > 0 || summary.favorites > 0 || summary.tags > 0;
  if (!hasContent) return null;

  return { data: next, summary };
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
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    e.target.value = '';
    closeMenu();

    const preview = parseMarkdownImport(text);
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

function initModalClose() {
  const modal = $('#modal');
  modal.addEventListener('click', (e) => {
    if (e.target && e.target.matches('[data-modal-close]')) requestModalClose();
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
