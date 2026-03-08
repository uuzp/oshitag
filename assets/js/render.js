import { enablePointerSort, reorderById } from './sort-utils.js';

const DBLCLICK_THRESHOLD_MS = 400;
const RENAME_DELAY_MS = 320;

function createRenameScheduler(isEditMode, action) {
  let timer = null;

  return {
    schedule() {
      if (!isEditMode()) return;
      if (timer) clearTimeout(timer);

      timer = setTimeout(() => {
        timer = null;
        if (!isEditMode()) return;
        action();
      }, RENAME_DELAY_MS);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

function wasDoubleClick(lastClickTime) {
  return (Date.now() - lastClickTime) < DBLCLICK_THRESHOLD_MS;
}

export function createRenderer({
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
  presetColors
}) {
  const sortRuntime = { isEditMode };

  function renderTabs(rootEl, items, activeId, { onSelect, onAdd, onDelete, onRename, emptyEmoji }) {
    rootEl.innerHTML = '';

    if (!rootEl._oshitagSortableTabs) {
      rootEl._oshitagSortableTabs = true;
      enablePointerSort(rootEl, {
        itemSelector: '.tab[data-sort-id]',
        canStart: (event) => {
          const item = event.target.closest?.('.tab');
          if (!item) return false;
          if (item.classList.contains('plus') || item.classList.contains('empty-plus')) return false;
          return true;
        },
        onReorder: (ids) => {
          const uniqueIds = new Set(ids);
          const groupIds = new Set(state.data.groups.map((group) => group.id));
          const favoriteIds = new Set(state.data.favorites.map((favorite) => favorite.id));
          const isGroupTabs = ids.length > 0 && Array.from(uniqueIds).every((id) => groupIds.has(id));
          const isFavoriteTabs = ids.length > 0 && Array.from(uniqueIds).every((id) => favoriteIds.has(id));

          if (isGroupTabs) reorderById(state.data.groups, ids);
          if (isFavoriteTabs) reorderById(state.data.favorites, ids);

          if (isGroupTabs || isFavoriteTabs) {
            saveData();
            render();
          }
        }
      }, sortRuntime);
    }

    const editMode = isEditMode();
    const canRename = editMode && typeof onRename === 'function';

    if (!rootEl._oshitagClickTracker) {
      rootEl._oshitagClickTracker = { lastId: null, lastTime: 0 };
    }

    const clickTracker = rootEl._oshitagClickTracker;

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

    for (const item of items) {
      const tab = document.createElement('div');
      tab.className = 'tab' + (item.id === activeId ? ' active' : '');
      tab.textContent = item.name;
      tab.setAttribute('data-sort-id', item.id);

      tab.addEventListener('click', () => {
        const now = Date.now();
        const isDoubleClick = clickTracker.lastId === item.id && (now - clickTracker.lastTime) < DBLCLICK_THRESHOLD_MS;

        clickTracker.lastId = item.id;
        clickTracker.lastTime = now;

        if (!editMode && isDoubleClick && typeof onSelect?.onDblClick === 'function') {
          onSelect.onDblClick(item.id);
          return;
        }

        if (!editMode) {
          onSelect(item.id);
          return;
        }

        if (isDoubleClick) {
          if (rootEl._oshitagRenameTimer) {
            clearTimeout(rootEl._oshitagRenameTimer);
            rootEl._oshitagRenameTimer = null;
          }
          onDelete(item.id);
          return;
        }

        if (canRename && item.id === activeId) {
          if (rootEl._oshitagRenameTimer) clearTimeout(rootEl._oshitagRenameTimer);
          rootEl._oshitagRenameTimer = setTimeout(() => {
            rootEl._oshitagRenameTimer = null;
            if (!isEditMode()) return;

            const stillActive = rootEl.querySelector('.tab.active')?.getAttribute('data-sort-id') === item.id;
            if (stillActive) onRename(item.id);
          }, RENAME_DELAY_MS);
          return;
        }

        onSelect(item.id);
      });

      rootEl.appendChild(tab);
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

  function renderIdolTag(group, idol, tag) {
    const chip = document.createElement('div');
    chip.className = 'tag';

    const tagText = normalizeTagText(tag.text);
    chip.textContent = tagText;
    chip.setAttribute('data-sort-id', tag.id);

    const renameScheduler = createRenameScheduler(isEditMode, () => renameIdolTag(group.id, idol.id, tag.id));
    let lastClickTime = 0;

    chip.addEventListener('click', (event) => {
      event.stopPropagation();

      const isDouble = wasDoubleClick(lastClickTime);
      lastClickTime = Date.now();

      if (isEditMode() && isDouble) {
        renameScheduler.cancel();
        deleteTag(group.id, idol.id, tag.id);
        return;
      }

      if (isEditMode()) {
        renameScheduler.schedule();
        return;
      }

      copyText(tagText, [tagText]);
    });

    return chip;
  }

  function renderFavoriteTag(folder, tag) {
    const chip = document.createElement('div');
    chip.className = 'tag';

    const tagText = normalizeTagText(tag.text);
    chip.textContent = tagText;
    chip.setAttribute('data-sort-id', tag.id);

    const renameScheduler = createRenameScheduler(isEditMode, () => renameFavTag(folder.id, tag.id));
    let lastClickTime = 0;

    chip.addEventListener('click', (event) => {
      event.stopPropagation();

      const isDouble = wasDoubleClick(lastClickTime);
      lastClickTime = Date.now();

      if (isEditMode() && isDouble) {
        renameScheduler.cancel();
        deleteFavTag(folder.id, tag.id);
        return;
      }

      if (isEditMode()) {
        renameScheduler.schedule();
        return;
      }

      copyText(tagText, [tagText]);
    });

    return chip;
  }

  function renderIdolCard(group, idol) {
    const card = document.createElement('div');
    card.className = 'idol-card';
    card.setAttribute('data-sort-id', idol.id);

    const renameScheduler = createRenameScheduler(isEditMode, () => renameIdol(group.id, idol.id));

    const head = document.createElement('div');
    head.className = 'idol-head';

    const left = document.createElement('div');
    left.className = 'idol-name';

    const dot = document.createElement('div');
    dot.className = 'color-dot';
    dot.style.background = idol.cheerColor || presetColors[0];
    dot.title = '设置应援色';
    dot.addEventListener('click', (event) => {
      if (!isEditMode()) return;
      event.stopPropagation();

      showColorPicker({
        title: t('color.title', { name: idol.name }),
        initial: idol.cheerColor,
        onPick: (color) => {
          idol.cheerColor = color;
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

    let lastClickTime = 0;
    head.addEventListener('click', () => {
      const isDouble = wasDoubleClick(lastClickTime);
      lastClickTime = Date.now();

      if (isEditMode() && isDouble) {
        renameScheduler.cancel();
        deleteIdol(group.id, idol.id);
        return;
      }

      if (isEditMode()) {
        renameScheduler.schedule();
        return;
      }

      copyText(idol.name, idol.tags);
    });

    const tags = document.createElement('div');
    tags.className = 'tag-grid';

    if (!tags._oshitagSortableTags) {
      tags._oshitagSortableTags = true;
      enablePointerSort(tags, {
        itemSelector: '.tag[data-sort-id]',
        canStart: (event) => {
          const chip = event.target.closest?.('.tag');
          if (!chip) return false;
          if (chip.classList.contains('plus')) return false;
          return true;
        },
        onReorder: (ids) => {
          const groupRef = findGroup(group.id);
          const idolRef = groupRef?.idols?.find((entry) => entry.id === idol.id);
          if (!idolRef) return;

          reorderById(idolRef.tags, ids);
          saveData();
          render();
        }
      }, sortRuntime);
    }

    for (const tag of idol.tags) {
      tags.appendChild(renderIdolTag(group, idol, tag));
    }

    if (isEditMode()) {
      const plus = document.createElement('div');
      plus.className = 'tag plus';
      plus.textContent = '+';
      plus.title = t('add.tag');
      plus.addEventListener('click', (event) => {
        event.stopPropagation();
        addTagsToIdol(group.id, idol.id);
      });
      tags.appendChild(plus);
    }

    card.appendChild(head);
    card.appendChild(tags);

    return card;
  }

  function renderGroupStage() {
    const stage = $('#groupStage');
    stage.innerHTML = '';

    const group = activeGroup();
    if (!group) {
      const empty = document.createElement('div');
      empty.className = 'big-card';
      empty.style.color = 'var(--muted)';
      empty.textContent = t('empty.groups');
      stage.appendChild(empty);
      return;
    }

    const card = document.createElement('div');
    card.className = 'big-card';
    card.addEventListener('click', (event) => {
      if (isEditMode()) return;
      if (event.target.closest('.idol-card, .tag, .color-dot')) return;
      copyText(group.name, collectGroupAllTags(group));
    });

    const grid = document.createElement('div');
    grid.className = 'idol-grid';

    if (!grid._oshitagSortableIdols) {
      grid._oshitagSortableIdols = true;
      enablePointerSort(grid, {
        itemSelector: '.idol-card[data-sort-id]',
        canStart: (event) => {
          if (event.target.closest?.('.idol-add')) return false;
          if (event.target.closest?.('.color-dot')) return false;
          return true;
        },
        onReorder: (ids) => {
          const active = activeGroup();
          if (!active) return;

          reorderById(active.idols, ids);
          saveData();
          render();
        }
      }, sortRuntime);
    }

    for (const idol of group.idols) {
      grid.appendChild(renderIdolCard(group, idol));
    }

    if (isEditMode()) {
      const plus = document.createElement('div');
      plus.className = 'idol-card idol-add';
      plus.textContent = '＋';
      plus.title = t('add.idol');
      plus.addEventListener('click', (event) => {
        event.stopPropagation();
        addIdol(group.id);
      });
      grid.appendChild(plus);
    }

    card.appendChild(grid);
    stage.appendChild(card);
  }

  function renderFavoritesStage() {
    const stage = $('#favStage');
    stage.innerHTML = '';

    const folder = activeFav();
    if (!folder) {
      const empty = document.createElement('div');
      empty.className = 'big-card';
      empty.style.color = 'var(--muted)';
      empty.textContent = t('empty.favorites');
      stage.appendChild(empty);
      return;
    }

    const card = document.createElement('div');
    card.className = 'big-card';
    card.addEventListener('click', (event) => {
      if (isEditMode()) return;
      if (event.target.closest('.tag')) return;
      copyText(folder.name, folder.tags);
    });

    const tags = document.createElement('div');
    tags.className = 'tag-grid';

    if (!tags._oshitagSortableFavTags) {
      tags._oshitagSortableFavTags = true;
      enablePointerSort(tags, {
        itemSelector: '.tag[data-sort-id]',
        canStart: (event) => {
          const chip = event.target.closest?.('.tag');
          if (!chip) return false;
          if (chip.classList.contains('plus')) return false;
          return true;
        },
        onReorder: (ids) => {
          const active = activeFav();
          if (!active) return;

          reorderById(active.tags, ids);
          saveData();
          render();
        }
      }, sortRuntime);
    }

    for (const tag of folder.tags) {
      tags.appendChild(renderFavoriteTag(folder, tag));
    }

    if (isEditMode()) {
      const plus = document.createElement('div');
      plus.className = 'tag plus';
      plus.textContent = '+';
      plus.title = t('add.tag');
      plus.addEventListener('click', (event) => {
        event.stopPropagation();
        addFavTags(folder.id);
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
      const group = findGroup(groupId);
      if (!group) return;
      copyText(group.name, collectGroupAllTags(group));
    };

    const favoriteOnSelect = setActiveFav;
    favoriteOnSelect.onDblClick = (folderId) => {
      if (isEditMode()) return;
      const folder = findFav(folderId);
      if (!folder) return;
      copyText(folder.name, folder.tags);
    };

    renderTabs($('#groupTabs'), state.data.groups, activeGroup()?.id || null, {
      onSelect: groupOnSelect,
      onAdd: addGroup,
      onRename: renameGroup,
      onDelete: deleteGroup,
      emptyEmoji: '➕'
    });

    renderTabs($('#favTabs'), state.data.favorites, activeFav()?.id || null, {
      onSelect: favoriteOnSelect,
      onAdd: addFavFolder,
      onRename: renameFavFolder,
      onDelete: deleteFavFolder,
      emptyEmoji: '➕'
    });

    renderGroupStage();
    renderFavoritesStage();
  }

  return render;
}