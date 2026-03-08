export function createDataManager({
  storageKey,
  legacyKey,
  presetColors,
  uid,
  normalizeTagText
}) {
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
    const existing = localStorage.getItem(storageKey);
    if (existing) return;

    const legacy = localStorage.getItem(legacyKey);
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
                cheerColor: String(idol.cheerColor ?? '').trim() || presetColors[0],
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

      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function loadData() {
    migrateLegacyIfNeeded();

    try {
      const raw = localStorage.getItem(storageKey);
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
          if (!idol.cheerColor) idol.cheerColor = presetColors[0];
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

  const state = { data: loadData() };

  function saveData() {
    localStorage.setItem(storageKey, JSON.stringify(state.data));
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
  }

  function setActiveFav(id) {
    state.data.ui.activeFavId = id;
  }

  function createGroup(name) {
    const group = { id: uid(), name: String(name ?? '').trim(), idols: [] };
    if (!group.name) return null;
    state.data.groups.push(group);
    state.data.ui.activeGroupId = group.id;
    return group;
  }

  function createIdol(groupId, name) {
    const group = findGroup(groupId);
    if (!group) return null;
    const idol = { id: uid(), name: String(name ?? '').trim(), cheerColor: presetColors[0], tags: [] };
    if (!idol.name) return null;
    group.idols.push(idol);
    return idol;
  }

  function appendIdolTags(groupId, idolId, tags) {
    const group = findGroup(groupId);
    const idol = group?.idols.find((item) => item.id === idolId);
    if (!group || !idol) return 0;

    const existing = new Set(idol.tags.map((tag) => normalizeTagText(tag.text).toLowerCase()));
    let added = 0;

    for (const rawTag of tags) {
      const normalized = normalizeTagText(rawTag);
      const key = normalized.toLowerCase();
      if (!normalized || existing.has(key)) continue;
      existing.add(key);
      idol.tags.push({ id: uid(), text: normalized });
      added++;
    }

    return added;
  }

  function createFavorite(name) {
    const favorite = { id: uid(), name: String(name ?? '').trim(), tags: [] };
    if (!favorite.name) return null;
    state.data.favorites.push(favorite);
    state.data.ui.activeFavId = favorite.id;
    return favorite;
  }

  function appendFavoriteTags(folderId, tags) {
    const favorite = findFav(folderId);
    if (!favorite) return 0;

    const existing = new Set(favorite.tags.map((tag) => normalizeTagText(tag.text).toLowerCase()));
    let added = 0;

    for (const rawTag of tags) {
      const normalized = normalizeTagText(rawTag);
      const key = normalized.toLowerCase();
      if (!normalized || existing.has(key)) continue;
      existing.add(key);
      favorite.tags.push({ id: uid(), text: normalized });
      added++;
    }

    return added;
  }

  function renameGroup(groupId, name) {
    const group = findGroup(groupId);
    if (!group) return false;
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return false;
    group.name = trimmed;
    return true;
  }

  function renameFavorite(folderId, name) {
    const favorite = findFav(folderId);
    if (!favorite) return false;
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return false;
    favorite.name = trimmed;
    return true;
  }

  function renameIdol(groupId, idolId, name) {
    const group = findGroup(groupId);
    const idol = group?.idols?.find((item) => item.id === idolId) || null;
    if (!group || !idol) return false;
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return false;
    idol.name = trimmed;
    return true;
  }

  function renameIdolTag(groupId, idolId, tagId, value) {
    const group = findGroup(groupId);
    const idol = group?.idols?.find((item) => item.id === idolId) || null;
    const tag = idol?.tags?.find((item) => item.id === tagId) || null;
    if (!group || !idol || !tag) return 'missing';
    const next = normalizeTagText(value);
    if (!next) return 'invalid';
    const nextKey = next.toLowerCase();
    const conflict = idol.tags.some((item) => item.id !== tagId && normalizeTagText(item.text).toLowerCase() === nextKey);
    if (conflict) return 'conflict';
    tag.text = next;
    return 'ok';
  }

  function renameFavoriteTag(folderId, tagId, value) {
    const favorite = findFav(folderId);
    const tag = favorite?.tags?.find((item) => item.id === tagId) || null;
    if (!favorite || !tag) return 'missing';
    const next = normalizeTagText(value);
    if (!next) return 'invalid';
    const nextKey = next.toLowerCase();
    const conflict = favorite.tags.some((item) => item.id !== tagId && normalizeTagText(item.text).toLowerCase() === nextKey);
    if (conflict) return 'conflict';
    tag.text = next;
    return 'ok';
  }

  function deleteGroup(groupId) {
    const index = state.data.groups.findIndex((group) => group.id === groupId);
    if (index === -1) return false;
    state.data.groups.splice(index, 1);
    if (state.data.ui.activeGroupId === groupId) state.data.ui.activeGroupId = state.data.groups[0]?.id || null;
    return true;
  }

  function deleteIdol(groupId, idolId) {
    const group = findGroup(groupId);
    if (!group) return false;
    const index = group.idols.findIndex((idol) => idol.id === idolId);
    if (index === -1) return false;
    group.idols.splice(index, 1);
    return true;
  }

  function deleteIdolTag(groupId, idolId, tagId) {
    const group = findGroup(groupId);
    const idol = group?.idols.find((item) => item.id === idolId);
    if (!group || !idol) return false;
    const index = idol.tags.findIndex((tag) => tag.id === tagId);
    if (index === -1) return false;
    idol.tags.splice(index, 1);
    return true;
  }

  function deleteFavorite(folderId) {
    const index = state.data.favorites.findIndex((favorite) => favorite.id === folderId);
    if (index === -1) return false;
    state.data.favorites.splice(index, 1);
    if (state.data.ui.activeFavId === folderId) state.data.ui.activeFavId = state.data.favorites[0]?.id || null;
    return true;
  }

  function deleteFavoriteTag(folderId, tagId) {
    const favorite = findFav(folderId);
    if (!favorite) return false;
    const index = favorite.tags.findIndex((tag) => tag.id === tagId);
    if (index === -1) return false;
    favorite.tags.splice(index, 1);
    return true;
  }

  return {
    state,
    defaultData,
    saveData,
    findGroup,
    findFav,
    activeGroup,
    activeFav,
    setActiveGroup,
    setActiveFav,
    createGroup,
    createIdol,
    appendIdolTags,
    createFavorite,
    appendFavoriteTags,
    renameGroup,
    renameFavorite,
    renameIdol,
    renameIdolTag,
    renameFavoriteTag,
    deleteGroup,
    deleteIdol,
    deleteIdolTag,
    deleteFavorite,
    deleteFavoriteTag
  };
}