export function createMenuController({
  $,
  t,
  appVersion,
  favoritesHeading,
  state,
  normalizeTagText,
  isEditMode,
  setEditMode,
  closeModal,
  loadImportBackup,
  parseMarkdownImport,
  showImportConfirm,
  showRestoreBackupConfirm,
  applyImportedData,
  saveData,
  render,
  toast,
  showHelp,
  showLanguageModal
}) {
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
    lines.push(`<!-- oshiTag v${appVersion} export ${nowISODate()} -->`);
    lines.push('');

    for (const group of state.data.groups) {
      lines.push(`# ${escapeMd(group.name)}`);
      for (const idol of group.idols) {
        lines.push(`## ${escapeMd(idol.name)}`);
        if (idol.cheerColor) lines.push(`<!-- cheerColor: ${idol.cheerColor} -->`);
        for (const tag of idol.tags) {
          lines.push(`### ${escapeMd(normalizeTagText(tag.text))}`);
        }
        lines.push('');
      }
      lines.push('');
    }

    lines.push(`# ${favoritesHeading}`);
    for (const favorite of state.data.favorites) {
      lines.push(`## ${escapeMd(favorite.name)}`);
      for (const tag of favorite.tags) {
        lines.push(`### ${escapeMd(normalizeTagText(tag.text))}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd() + '\n';
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

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

    btnMenu.addEventListener('click', (event) => {
      event.stopPropagation();
      if (menuPanel.classList.contains('open')) closeMenu();
      else openMenu();
    });

    document.addEventListener('click', () => closeMenu());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
        closeModal();
        if (isEditMode()) setEditMode(false);
      }
    });

    $('#btnExportMd').addEventListener('click', () => {
      downloadText(`oshiTag-${nowISODate()}.md`, exportMarkdown());
      closeMenu();
    });

    $('#fileImportMd').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      event.target.value = '';
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

  return {
    initMenu
  };
}