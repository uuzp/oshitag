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
import { createDialogs } from './dialogs.js';
import { createImportWorkflow } from './import-workflow.js';
import { createLocaleManager } from './locale-manager.js';
import { createMenuController } from './menu-controller.js';
import { createRenderer } from './render.js';

const APP_VERSION = '0.2.9';

const STORAGE_KEY = 'oshitag:data:v2';
const LEGACY_KEY = 'oshitag:data:v1';
const IMPORT_BACKUP_KEY = 'oshitag:data:import-backup:v1';
const MD_FAVORITES_HEADING = '[FAVORITES]';

// Common penlight / idol cheer colors (not an official standard; meant to cover the usual set)
const PRESET_COLORS = [
  '#ff1744',
  '#ff3b30',
  '#ff5252',
  '#ff6d00',
  '#ff8f00',
  '#ffab00',
  '#ffd600',
  '#ffea00',
  '#00c853',
  '#00e676',
  '#64dd17',
  '#00b8d4',
  '#00e5ff',
  '#18ffff',
  '#2979ff',
  '#2962ff',
  '#304ffe',
  '#651fff',
  '#7c4dff',
  '#b388ff',
  '#f50057',
  '#ff4081',
  '#ff80ab',
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
    const text = cur.trim();
    cur = '';
    if (!text) return;
    const normalized = normalizeTagText(text);
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
      next.groups = old.groups.map((group) => ({
        id: group.id || uid(),
        name: String(group.name ?? '').trim() || '未命名组合',
        idols: Array.isArray(group.idols)
          ? group.idols.map((idol) => ({
              id: idol.id || uid(),
              name: String(idol.name ?? '').trim() || '未命名偶像',
              cheerColor: String(idol.cheerColor ?? '').trim() || PRESET_COLORS[0],
              tags: Array.isArray(idol.tags)
                ? idol.tags
                    .map((tag) => ({ id: tag.id || uid(), text: normalizeTagText(tag.text) }))
                    .filter((tag) => tag.text)
                : []
            }))
          : []
      }));
    }

    if (Array.isArray(old.combos)) {
      next.favorites = old.combos.map((combo) => ({
        id: combo.id || uid(),
        name: String(combo.name ?? '').trim() || '未命名收藏夹',
        tags: Array.isArray(combo.tags)
          ? combo.tags
              .map((tag) => ({ id: tag.id || uid(), text: normalizeTagText(tag.text) }))
              .filter((tag) => tag.text)
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

    for (const group of data.groups) {
      if (!group.id) group.id = uid();
      if (!Array.isArray(group.idols)) group.idols = [];
      for (const idol of group.idols) {
        if (!idol.id) idol.id = uid();
        if (!idol.cheerColor) idol.cheerColor = PRESET_COLORS[0];
        if (!Array.isArray(idol.tags)) idol.tags = [];
        for (const tag of idol.tags) {
          if (!tag.id) tag.id = uid();
          tag.text = normalizeTagText(tag.text);
        }
        idol.tags = idol.tags.filter((tag) => tag.text);
      }
    }

    for (const favorite of data.favorites) {
      if (!favorite.id) favorite.id = uid();
      if (!Array.isArray(favorite.tags)) favorite.tags = [];
      for (const tag of favorite.tags) {
        if (!tag.id) tag.id = uid();
        tag.text = normalizeTagText(tag.text);
      }
      favorite.tags = favorite.tags.filter((tag) => tag.text);
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
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.fontSize = '16px';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

function tagsToCopy(tags) {
  const normalized = tags.map((tag) => normalizeTagText(tag.text ?? tag)).filter(Boolean);
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

  const add = (tag) => {
    const norm = normalizeTagText(tag?.text ?? tag);
    if (!norm) return;
    const key = norm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(norm);
  };

  const scanGroupReverse = (group) => {
    if (!group || !Array.isArray(group.idols)) return;
    for (let idolIndex = group.idols.length - 1; idolIndex >= 0; idolIndex--) {
      const idol = group.idols[idolIndex];
      if (!idol || !Array.isArray(idol.tags)) continue;
      for (let tagIndex = idol.tags.length - 1; tagIndex >= 0; tagIndex--) add(idol.tags[tagIndex]);
    }
  };

  const prefer = preferGroupId ? findGroup(preferGroupId) : null;
  if (prefer) scanGroupReverse(prefer);

  for (let groupIndex = state.data.groups.length - 1; groupIndex >= 0; groupIndex--) {
    const group = state.data.groups[groupIndex];
    if (prefer && group?.id === prefer.id) continue;
    scanGroupReverse(group);
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
  return state.data.groups.find((group) => group.id === id) || null;
}

function findFav(id) {
  return state.data.favorites.find((favorite) => favorite.id === id) || null;
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
  const group = findGroup(groupId);
  if (!group) return;

  const name = await showPrompt({
    title: t('prompt.groupRename.title') || '编辑组合名',
    placeholder: t('prompt.groupRename.placeholder') || t('prompt.groupAdd.placeholder') || '组合名',
    okText: t('modal.ok') || '确定',
    initialValue: group.name
  });
  if (name == null) return;

  const trimmed = String(name).trim();
  if (!trimmed) return;
  group.name = trimmed;
  saveData();
  render();
}

async function renameFavFolder(folderId) {
  const folder = findFav(folderId);
  if (!folder) return;

  const name = await showPrompt({
    title: t('prompt.favRename.title') || '编辑收藏夹名',
    placeholder: t('prompt.favRename.placeholder') || t('prompt.favAdd.placeholder') || '收藏夹名称',
    okText: t('modal.ok') || '确定',
    initialValue: folder.name
  });
  if (name == null) return;

  const trimmed = String(name).trim();
  if (!trimmed) return;
  folder.name = trimmed;
  saveData();
  render();
}

async function renameIdol(groupId, idolId) {
  const group = findGroup(groupId);
  const idol = group?.idols?.find((item) => item.id === idolId) || null;
  if (!group || !idol) return;

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
  const group = findGroup(groupId);
  const idol = group?.idols?.find((item) => item.id === idolId) || null;
  const tag = idol?.tags?.find((item) => item.id === tagId) || null;
  if (!group || !idol || !tag) return;

  const current = normalizeTagText(tag.text);
  const value = await showPrompt({
    title: t('prompt.tagRename.title') || '编辑TAG',
    placeholder: t('prompt.tagRename.placeholder') || t('prompt.tagAdd.placeholder') || 'TAG',
    okText: t('modal.ok') || '确定',
    initialValue: current
  });
  if (value == null) return;

  const next = normalizeTagText(value);
  if (!next) return;

  const nextKey = next.toLowerCase();
  const conflict = idol.tags.some((item) => item.id !== tagId && normalizeTagText(item.text).toLowerCase() === nextKey);
  if (conflict) return toast(t('toast.tagExists') || t('toast.favTagExists') || '已存在');

  tag.text = next;
  saveData();
  render();
}

async function renameFavTag(folderId, tagId) {
  const folder = findFav(folderId);
  const tag = folder?.tags?.find((item) => item.id === tagId) || null;
  if (!folder || !tag) return;

  const current = normalizeTagText(tag.text);
  const value = await showPrompt({
    title: t('prompt.tagRename.title') || '编辑TAG',
    placeholder: t('prompt.tagRename.placeholder') || t('prompt.favTagAdd.title') || 'TAG',
    okText: t('modal.ok') || '确定',
    initialValue: current
  });
  if (value == null) return;

  const next = normalizeTagText(value);
  if (!next) return;

  const nextKey = next.toLowerCase();
  const conflict = folder.tags.some((item) => item.id !== tagId && normalizeTagText(item.text).toLowerCase() === nextKey);
  if (conflict) return toast(t('toast.tagExists') || t('toast.favTagExists') || '已存在');

  tag.text = next;
  saveData();
  render();
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

const importWorkflow = createImportWorkflow({
  $,
  t,
  btn,
  openModal,
  closeModal,
  safeParseJson,
  defaultData,
  uid,
  normalizeTagText,
  presetColors: PRESET_COLORS,
  favoritesHeading: MD_FAVORITES_HEADING,
  importBackupKey: IMPORT_BACKUP_KEY,
  state,
  saveData,
  render,
  toast
});

const { loadImportBackup, showImportConfirm, showRestoreBackupConfirm, applyImportedData } = importWorkflow;

const localeManager = createLocaleManager({
  $,
  t,
  btn,
  openModal,
  closeModal,
  showPrompt,
  showConfirm,
  toast,
  render,
  BUILTIN_LOCALES,
  I18N_STORAGE_LANG,
  applyI18n,
  i18n,
  loadUserLocales,
  pickLocaleAuto,
  safeParseJson,
  saveUserLocales
});

const { showLanguageModal } = localeManager;

const menuController = createMenuController({
  $,
  t,
  appVersion: APP_VERSION,
  favoritesHeading: MD_FAVORITES_HEADING,
  state,
  normalizeTagText,
  isEditMode,
  setEditMode,
  closeModal,
  loadImportBackup,
  parseMarkdownImport: importWorkflow.parseMarkdownImport,
  showImportConfirm,
  showRestoreBackupConfirm,
  applyImportedData,
  saveData,
  render,
  toast,
  showHelp,
  showLanguageModal
});

const { initMenu } = menuController;

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
