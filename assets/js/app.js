/* oshiTag - minimal tabs UI
 * Groups tabs -> Idols cards -> Tags
 * Favorites tabs -> Tags
 * Click to copy, double-click to delete
 */

const APP_VERSION = '0.2.0';

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

function attachLongPress(el, { onLongPress, ms = 520, moveTolerance = 10 }) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const start = (x, y, eventForCallback) => {
    fired = false;
    clear();
    startX = x;
    startY = y;
    timer = setTimeout(() => {
      fired = true;
      onLongPress?.(eventForCallback);
    }, ms);
  };

  const move = (x, y) => {
    if (!timer) return;
    if (Math.abs(x - startX) > moveTolerance || Math.abs(y - startY) > moveTolerance) clear();
  };

  const cancel = () => clear();

  if ('PointerEvent' in window) {
    el.addEventListener('pointerdown', (e) => start(e.clientX, e.clientY, e));
    el.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
  } else {
    el.addEventListener('touchstart', (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      start(t.clientX, t.clientY, e);
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      move(t.clientX, t.clientY);
    }, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchcancel', cancel);
  }

  return {
    wasFired: () => fired,
    reset: () => {
      fired = false;
    }
  };
}

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
  toast(ok ? t('toast.copied', { label }) : t('toast.copyFailed'));
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

function showPrompt({ title, placeholder, okText = '确定' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const input = document.createElement('input');
    input.className = 'input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';

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

    requestAnimationFrame(() => input.focus());
  });
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
function renderTabs(rootEl, items, activeId, { onSelect, onAdd, onDelete, emptyEmoji }) {
  rootEl.innerHTML = '';

  const editMode = isEditMode();

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
    let lp = null;
    if (typeof onSelect?.onLongPress === 'function') {
      lp = attachLongPress(t, {
        onLongPress: () => onSelect.onLongPress(it.id),
        ms: 520,
        moveTolerance: 10
      });
    }

    t.addEventListener('click', () => {
      if (lp?.wasFired()) {
        lp.reset();
        return;
      }
      onSelect(it.id);
    });
    if (editMode) t.addEventListener('dblclick', () => onDelete(it.id));
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
    if (e.target.closest('.idol-card, .tag, .color-dot')) return;
    const tags = [];
    for (const idol of g.idols) tags.push(...idol.tags);
    copyText(g.name, tags);
  });

  const grid = document.createElement('div');
  grid.className = 'idol-grid';

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

  head.addEventListener('click', () => copyText(idol.name, idol.tags));
  if (isEditMode()) head.addEventListener('dblclick', () => deleteIdol(group.id, idol.id));

  const tags = document.createElement('div');
  tags.className = 'tag-grid';

  for (const t of idol.tags) {
    const chip = document.createElement('div');
    chip.className = 'tag';
    chip.textContent = normalizeTagText(t.text);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(chip.textContent, [chip.textContent]);
    });
    if (isEditMode()) {
      chip.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        deleteTag(group.id, idol.id, t.id);
      });
    }
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
    if (e.target.closest('.tag')) return;
    copyText(f.name, f.tags);
  });

  const tags = document.createElement('div');
  tags.className = 'tag-grid';

  for (const t of f.tags) {
    const chip = document.createElement('div');
    chip.className = 'tag';
    chip.textContent = normalizeTagText(t.text);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(chip.textContent, [chip.textContent]);
    });
    if (isEditMode()) {
      chip.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        deleteFavTag(f.id, t.id);
      });
    }
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
  groupOnSelect.onLongPress = (groupId) => {
    const g = findGroup(groupId);
    if (!g) return;
    copyText(g.name, collectGroupAllTags(g));
  };

  renderTabs($('#groupTabs'), state.data.groups, activeGroup()?.id || null, {
    onSelect: groupOnSelect,
    onAdd: addGroup,
    onDelete: deleteGroup,
    emptyEmoji: '➕'
  });

  renderTabs($('#favTabs'), state.data.favorites, activeFav()?.id || null, {
    onSelect: setActiveFav,
    onAdd: addFavFolder,
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

function importMarkdown(mdText) {
  const text = String(mdText ?? '');
  const lines = text.split(/\r?\n/);

  const next = defaultData();

  let currentGroup = null;
  let currentIdol = null;
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
      inFav = name === MD_FAVORITES_HEADING;
      currentIdol = null;
      currentGroup = null;
      if (!inFav) {
        currentGroup = { id: uid(), name, idols: [] };
        next.groups.push(currentGroup);
        if (!next.ui.activeGroupId) next.ui.activeGroupId = currentGroup.id;
      }
      continue;
    }

    if (line.startsWith('## ')) {
      const name = line.slice(3).trim();
      currentIdol = null;
      if (inFav) {
        const folder = { id: uid(), name, tags: [] };
        next.favorites.push(folder);
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
        const folder = next.favorites.at(-1);
        if (!folder) continue;
        folder.tags.push({ id: uid(), text: t });
      } else {
        if (!currentIdol) continue;
        currentIdol.tags.push({ id: uid(), text: t });
      }
      continue;
    }
  }

  state.data = next;
  saveData();
  render();
  toast(t('toast.mdImported'));
}

// ---------- Menu + PWA ----------
function initMenu() {
  const btnMenu = $('#btnMenu');
  const menuPanel = $('#menuPanel');

  const closeMenu = () => {
    menuPanel.classList.remove('open');
    btnMenu.setAttribute('aria-expanded', 'false');
    menuPanel.setAttribute('aria-hidden', 'true');
  };

  const openMenu = () => {
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
    importMarkdown(text);
    e.target.value = '';
    closeMenu();
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

function initDisableContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    const t = e.target;
    const allow =
      (t && (t.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""]'))) ||
      (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'));
    if (allow) return;
    e.preventDefault();
  });
}

function init() {
  // i18n must be ready before initial render/menu wiring
  initI18n().finally(() => {
    initMenu();
    initModalClose();
    initDisableContextMenu();
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
