/* oshiTag - minimal tabs UI
 * Groups tabs -> Idols cards -> Tags
 * Favorites tabs -> Tags
 * Click to copy, double-click to delete
 */

const APP_VERSION = '0.1.0';

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
  if (!text) return toast('没有可复制的TAG');
  const ok = await writeClipboard(text);
  toast(ok ? `已复制：${label}` : '复制失败（浏览器权限限制）');
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
function openModal(title, bodyNode, actions) {
  const modal = $('#modal');
  $('#modalTitle').textContent = title;
  const body = $('#modalBody');
  body.innerHTML = '';
  body.appendChild(bodyNode);

  const act = $('#modalActions');
  act.innerHTML = '';
  for (const a of actions) act.appendChild(a);

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const modal = $('#modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
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
      btn('取消', 'btn btn-secondary', onCancel),
      btn(okText, 'btn', onOk)
    ]);

    requestAnimationFrame(() => input.focus());
  });
}

function showHelp() {
  const div = document.createElement('div');
  div.innerHTML = `
    <div style="color: var(--muted); font-size: 12px; margin-bottom: 10px;">
      单击复制，双击删除。导入/导出在右上角 ⋯。
    </div>
    <div>
      <div style="color: var(--muted); font-size: 12px; margin-bottom: 10px;">
        默认是浏览模式（隐藏加号）。点右上角“＋”进入编辑模式（可新增/删除/改色）。
      </div>
      <b>组合（顶部标签页）</b>
      <ul>
        <li>单击：切换</li>
        <li>长按：复制该组合内所有TAG</li>
        <li>编辑模式：显示“＋”并允许新增/双击删除</li>
      </ul>
      <b>偶像</b>
      <ul>
        <li>单击偶像名：复制该偶像全部TAG</li>
        <li>编辑模式：双击偶像名删除；点颜色圆点改色；点“+”新增TAG</li>
      </ul>
      <b>TAG</b>
      <ul>
        <li>单击TAG：复制该TAG</li>
        <li>编辑模式：双击TAG删除</li>
      </ul>
      <b>收藏夹</b>
      <ul>
        <li>两层结构：收藏夹 → TAG</li>
        <li>单击收藏夹大矩形空白处：复制该收藏夹全部TAG</li>
        <li>编辑模式：显示“+”新增TAG；双击TAG删除</li>
      </ul>
    </div>
  `;

  openModal('帮助', div, [btn('知道了', 'btn', closeModal)]);
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
      toast('请输入形如 #39c5bb 的HEX颜色');
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
    btn('取消', 'btn btn-secondary', closeModal),
    btn('确定', 'btn', () => apply(input.value))
  ]);

  requestAnimationFrame(() => input.focus());
}

// ---------- Actions ----------
async function addGroup() {
  const name = await showPrompt({ title: '新增组合', placeholder: '组合名' });
  if (!name) return;
  const g = { id: uid(), name: name.trim(), idols: [] };
  if (!g.name) return;
  state.data.groups.push(g);
  state.data.ui.activeGroupId = g.id;
  saveData();
  render();
}

async function addIdol(groupId) {
  const name = await showPrompt({ title: '新增偶像', placeholder: '偶像名' });
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
  const raw = await showPrompt({ title: '新增TAG', placeholder: '支持空格 / 逗号 / # 分隔批量' });
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
  const name = await showPrompt({ title: '新增收藏夹', placeholder: '收藏夹名称' });
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
    title: '新增TAG到收藏夹',
    placeholder: '支持空格 / 逗号 / # 分隔批量',
    suggestions,
    onSuggestionPicked: (tagText) => {
      const f = findFav(folderId);
      if (!f) return true;

      const norm = normalizeTagText(tagText);
      if (!norm) return true;

      const key = norm.toLowerCase();
      const existing = new Set(f.tags.map((t) => normalizeTagText(t.text)).map((t) => t.toLowerCase()));
      if (existing.has(key)) {
        toast('收藏夹里已经有这个TAG');
        return true;
      }

      f.tags.push({ id: uid(), text: norm });
      saveData();
      render();
      toast('已添加到收藏夹');
      return true;
    },
    okText: '添加'
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
      plus.title = '新增';
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
    plus.title = '新增';
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
    empty.textContent = '还没有组合。';
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
    plus.title = '新增偶像';
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
      title: `应援色：${idol.name}`,
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
    plus.title = '新增TAG';
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
    empty.textContent = '还没有收藏夹。';
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
    plus.title = '新增TAG';
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
    btnEdit.setAttribute('aria-label', isEditMode() ? '退出编辑' : '编辑');
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
  toast('已导入 MD');
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
}

function initModalClose() {
  const modal = $('#modal');
  modal.addEventListener('click', (e) => {
    if (e.target && e.target.matches('[data-modal-close]')) closeModal();
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
  initMenu();
  initModalClose();
  initDisableContextMenu();
  initPwa();

  const btnEdit = $('#btnEdit');
  if (btnEdit) {
    btnEdit.addEventListener('click', () => toggleEditMode());
  }

  render();
}

init();
