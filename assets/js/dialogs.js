export function createDialogs({
  $,
  t,
  toast,
  normalizeTagText,
  parseTagsInput,
  uniqKeepOrder,
  presetColors
}) {
  let modalOnRequestClose = null;

  function openModal(title, bodyNode, actions, onRequestClose = null) {
    const modal = $('#modal');
    $('#modalTitle').textContent = title;

    const body = $('#modalBody');
    body.innerHTML = '';
    body.appendChild(bodyNode);

    const act = $('#modalActions');
    act.innerHTML = '';
    for (const action of actions) act.appendChild(action);

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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
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
        const value = input.value;
        closeModal();
        resolve(value);
      };

      const onCancel = () => {
        closeModal();
        resolve(null);
      };

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') onOk();
        if (event.key === 'Escape') onCancel();
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
          // ignore selection failures
        }
      });
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

      openModal(String(title || ''), wrap, [
        btn(t('modal.cancel'), 'btn btn-secondary', () => {
          closeModal();
          resolve(false);
        }),
        btn(okText || t('modal.ok'), 'btn', () => {
          closeModal();
          resolve(true);
        })
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
      for (const suggestion of list) {
        const chip = document.createElement('div');
        chip.className = 'tag';
        chip.textContent = normalizeTagText(suggestion);
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
        const value = input.value;
        closeModal();
        resolve(value);
      };

      const onCancel = () => {
        closeModal();
        resolve(null);
      };

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') onOk();
        if (event.key === 'Escape') onCancel();
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
      const heading = document.createElement('b');
      heading.textContent = t(titleKey);

      const list = document.createElement('ul');
      for (const key of items) {
        const item = document.createElement('li');
        item.textContent = t(key);
        list.appendChild(item);
      }

      root.appendChild(heading);
      root.appendChild(list);
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
    input.value = String(initial || '').trim() || presetColors[0];

    const apply = (value) => {
      const nextValue = String(value || '').trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(nextValue)) {
        toast(t('toast.hexInvalid'));
        return;
      }

      closeModal();
      onPick(nextValue.toLowerCase());
    };

    for (const color of presetColors) {
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      swatch.style.background = color;
      swatch.title = color;
      swatch.addEventListener('click', () => apply(color));
      preset.appendChild(swatch);
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') apply(input.value);
      if (event.key === 'Escape') closeModal();
    });

    wrap.appendChild(preset);
    wrap.appendChild(input);

    openModal(title, wrap, [
      btn(t('modal.cancel'), 'btn btn-secondary', closeModal),
      btn(t('modal.ok'), 'btn', () => apply(input.value))
    ]);

    requestAnimationFrame(() => input.focus());
  }

  function initModalClose() {
    const modal = $('#modal');
    modal.addEventListener('click', (event) => {
      if (event.target && event.target.matches('[data-modal-close]')) requestModalClose();
    });
  }

  return {
    openModal,
    closeModal,
    requestModalClose,
    btn,
    showPrompt,
    showConfirm,
    showTagPromptWithSuggestions,
    showHelp,
    showColorPicker,
    initModalClose
  };
}