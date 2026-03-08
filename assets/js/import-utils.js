export const IMPORT_MODE_REPLACE = 'replace';
export const IMPORT_MODE_MERGE = 'merge';

export function summarizeData(data) {
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

export function formatDelta(value) {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : String(value);
}

export function createImportTools({ defaultData, uid, normalizeTagText, presetColors, favoritesHeading }) {
  const normalizeNameKey = (name) => String(name || '').trim().toLowerCase();

  const dedupeTagObjects = (tags) => {
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
  };

  const cloneTag = (tag, { regenerateIds = false } = {}) => ({
    id: regenerateIds || !tag?.id ? uid() : tag.id,
    text: normalizeTagText(tag?.text)
  });

  const cloneIdol = (idol, { regenerateIds = false } = {}) => ({
    id: regenerateIds || !idol?.id ? uid() : idol.id,
    name: String(idol?.name || '').trim(),
    cheerColor: String(idol?.cheerColor || '').trim() || presetColors[0],
    tags: dedupeTagObjects((idol?.tags || []).map((tag) => cloneTag(tag, { regenerateIds })))
  });

  const cloneGroup = (group, { regenerateIds = false } = {}) => ({
    id: regenerateIds || !group?.id ? uid() : group.id,
    name: String(group?.name || '').trim(),
    idols: (group?.idols || []).map((idol) => cloneIdol(idol, { regenerateIds })).filter((idol) => idol.name)
  });

  const cloneFavorite = (folder, { regenerateIds = false } = {}) => ({
    id: regenerateIds || !folder?.id ? uid() : folder.id,
    name: String(folder?.name || '').trim(),
    tags: dedupeTagObjects((folder?.tags || []).map((tag) => cloneTag(tag, { regenerateIds })))
  });

  const ensureActiveIds = (data) => {
    if (!data?.groups?.some((group) => group.id === data?.ui?.activeGroupId)) {
      data.ui.activeGroupId = data?.groups?.[0]?.id || null;
    }
    if (!data?.favorites?.some((folder) => folder.id === data?.ui?.activeFavId)) {
      data.ui.activeFavId = data?.favorites?.[0]?.id || null;
    }
  };

  const cloneData = (data, { regenerateIds = false } = {}) => {
    const next = defaultData();
    next.groups = (data?.groups || []).map((group) => cloneGroup(group, { regenerateIds })).filter((group) => group.name);
    next.favorites = (data?.favorites || []).map((folder) => cloneFavorite(folder, { regenerateIds })).filter((folder) => folder.name);

    if (!regenerateIds) {
      next.ui.activeGroupId = data?.ui?.activeGroupId || next.groups[0]?.id || null;
      next.ui.activeFavId = data?.ui?.activeFavId || next.favorites[0]?.id || null;
    }

    ensureActiveIds(next);
    return next;
  };

  const mergeTagList = (targetTags, incomingTags) => {
    const existing = new Set((targetTags || []).map((tag) => normalizeTagText(tag.text).toLowerCase()));
    for (const tag of incomingTags || []) {
      const text = normalizeTagText(tag.text);
      if (!text) continue;
      const key = text.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      targetTags.push({ id: uid(), text });
    }
  };

  const buildReplaceImportResult = (importedData) => cloneData(importedData);

  const buildMergeImportResult = (currentData, importedData) => {
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
  };

  const listGroupLabels = (data) => (data?.groups || []).map((group) => String(group?.name || '').trim()).filter(Boolean);

  const listIdolLabels = (data) => {
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
  };

  const listFavoriteLabels = (data) => (data?.favorites || []).map((folder) => String(folder?.name || '').trim()).filter(Boolean);

  const listTagLabels = (data) => {
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
        out.push(`${favoritesHeading} / ${folderName} / ${text}`);
      }
    }
    return out;
  };

  const diffLabelLists = (currentItems, incomingItems) => {
    const currentMap = new Map();
    const incomingMap = new Map();

    const addCount = (map, item) => {
      const text = String(item || '').trim();
      if (!text) return;
      const key = normalizeNameKey(text);
      const prev = map.get(key);
      if (prev) prev.count += 1;
      else map.set(key, { text, count: 1 });
    };

    for (const item of currentItems || []) addCount(currentMap, item);
    for (const item of incomingItems || []) addCount(incomingMap, item);

    const addedItems = [];
    const removedItems = [];
    let addedTotal = 0;
    let removedTotal = 0;

    for (const [key, entry] of incomingMap.entries()) {
      const diff = entry.count - (currentMap.get(key)?.count || 0);
      if (diff <= 0) continue;
      addedTotal += diff;
      addedItems.push(diff > 1 ? `${entry.text} ×${diff}` : entry.text);
    }

    for (const [key, entry] of currentMap.entries()) {
      const diff = entry.count - (incomingMap.get(key)?.count || 0);
      if (diff <= 0) continue;
      removedTotal += diff;
      removedItems.push(diff > 1 ? `${entry.text} ×${diff}` : entry.text);
    }

    return { addedItems, removedItems, addedTotal, removedTotal };
  };

  const parseMarkdownImport = (mdText) => {
    const text = String(mdText ?? '');
    const lines = text.split(/\r?\n/);
    const next = defaultData();

    let currentGroup = null;
    let currentIdol = null;
    let currentFavFolder = null;
    let inFav = false;

    const takeCheerColorIfPresent = (index) => {
      const line = (lines[index] ?? '').trim();
      const match = line.match(/^<!--\s*cheerColor\s*:\s*(#[0-9a-fA-F]{6})\s*-->$/);
      return match ? match[1] : null;
    };

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line) continue;

      if (line.startsWith('# ')) {
        const name = line.slice(2).trim();
        if (!name) continue;
        inFav = name === favoritesHeading;
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
          const idol = { id: uid(), name, cheerColor: presetColors[0], tags: [] };
          const maybeColor = takeCheerColorIfPresent(index + 1);
          if (maybeColor) idol.cheerColor = maybeColor.toLowerCase();
          currentGroup.idols.push(idol);
          currentIdol = idol;
        }
        continue;
      }

      if (!line.startsWith('### ')) continue;
      const textTag = normalizeTagText(line.slice(4).trim());
      if (!textTag) continue;

      if (inFav) {
        if (!currentFavFolder) continue;
        currentFavFolder.tags.push({ id: uid(), text: textTag });
      } else {
        if (!currentIdol) continue;
        currentIdol.tags.push({ id: uid(), text: textTag });
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
  };

  const prepareImportOperation = (mode, currentData, importedData) => {
    const currentSummary = summarizeData(currentData);
    const sourceSummary = summarizeData(importedData);
    const resultData = mode === IMPORT_MODE_MERGE
      ? buildMergeImportResult(currentData, importedData)
      : buildReplaceImportResult(importedData);
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
        tags: diffLabelLists(listTagLabels(currentData), listTagLabels(resultData))
      }
    };
  };

  return {
    parseMarkdownImport,
    prepareImportOperation
  };
}