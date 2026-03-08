export function createLocaleManager({
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
}) {
  function localeOptions() {
    const items = [];
    for (const [code, bundle] of i18n.bundles.entries()) {
      items.push({ code, name: bundle?.name || code });
    }
    items.sort((a, b) => a.code.localeCompare(b.code));
    return items;
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

    for (const item of localeOptions()) {
      const option = document.createElement('option');
      option.value = item.code;
      option.textContent = `${item.name} (${item.code})`;
      sel.appendChild(option);
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

    const applySelection = (value, { persist } = { persist: false }) => {
      if (value === 'auto') {
        if (persist) localStorage.setItem(I18N_STORAGE_LANG, 'auto');
        i18n.mode = 'auto';
        i18n.locale = pickLocaleAuto();
      } else {
        if (persist) localStorage.setItem(I18N_STORAGE_LANG, value);
        i18n.mode = 'manual';
        i18n.locale = value;
      }

      if (!i18n.bundles.has(i18n.locale)) i18n.locale = i18n.fallback;
      applyI18n();
      render();
    };

    const deleteBtn = btn(t('lang.delete'), 'btn btn-secondary', async () => {
      const code = sel.value;
      if (!code || code === 'auto') return;
      if (BUILTIN_LOCALES.some((item) => item.code === code)) {
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

      for (const option of Array.from(sel.options)) {
        if (option.value === code) option.remove();
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

      if (BUILTIN_LOCALES.some((item) => item.code === code)) {
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

    openModal(t('lang.title'), wrap, [els.edit, els.add, deleteBtn, els.ok], onDismiss);
  }

  return {
    showLanguageModal,
    showEditLocaleJson
  };
}