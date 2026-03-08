import {
  IMPORT_MODE_MERGE,
  IMPORT_MODE_REPLACE,
  createImportTools,
  formatDelta,
  summarizeData
} from './import-utils.js';

export function createImportWorkflow({
  $,
  t,
  btn,
  openModal,
  closeModal,
  safeParseJson,
  defaultData,
  uid,
  normalizeTagText,
  presetColors,
  favoritesHeading,
  importBackupKey,
  state,
  saveData,
  render,
  toast
}) {
  const importTools = createImportTools({
    defaultData,
    uid,
    normalizeTagText,
    presetColors,
    favoritesHeading
  });

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
      localStorage.setItem(importBackupKey, JSON.stringify({
        savedAt: new Date().toISOString(),
        data: state.data
      }));
    } catch {
      // ignore backup failures; import can still proceed
    }
  }

  function loadImportBackup() {
    const raw = localStorage.getItem(importBackupKey);
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

        warning.textContent = selectedMode === IMPORT_MODE_MERGE
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

        confirmButton.textContent = selectedMode === IMPORT_MODE_MERGE
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

  return {
    parseMarkdownImport: (text) => importTools.parseMarkdownImport(text),
    loadImportBackup,
    showImportConfirm,
    showRestoreBackupConfirm,
    applyImportedData
  };
}