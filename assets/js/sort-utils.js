function suppressNextClick() {
  const onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener('click', onClick, true);
  };

  document.addEventListener('click', onClick, true);
}

export function reorderById(items, orderedIds) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const nextItems = [];

  for (const id of orderedIds) {
    const item = itemMap.get(id);
    if (item) nextItems.push(item);
  }

  for (const item of items) {
    if (!orderedIds.includes(item.id)) nextItems.push(item);
  }

  items.length = 0;
  items.push(...nextItems);
}

export function enablePointerSort(container, {
  itemSelector,
  idAttr = 'data-sort-id',
  canStart = () => true,
  onReorder
}, {
  isEditMode = () => false
} = {}) {
  if (!container) return;

  let pointerId = null;
  let draggingEl = null;
  let startX = 0;
  let startY = 0;
  let didDrag = false;
  let didCapture = false;

  const getItem = (element) => element?.closest?.(itemSelector) || null;
  const getId = (element) => element?.getAttribute?.(idAttr) || '';

  const reset = () => {
    if (draggingEl) draggingEl.classList.remove('is-dragging');
    container.classList.remove('is-sorting');

    if (didCapture && pointerId != null) {
      try {
        container.releasePointerCapture?.(pointerId);
      } catch {
        // ignore release failures
      }
    }

    pointerId = null;
    draggingEl = null;
    didDrag = false;
    didCapture = false;
  };

  const onPointerDown = (event) => {
    if (!isEditMode()) return;
    if (event.button != null && event.button !== 0) return;
    if (!canStart(event)) return;

    const item = getItem(event.target);
    if (!item || !getId(item)) return;

    if (event.pointerType === 'touch') event.preventDefault();

    pointerId = event.pointerId;
    draggingEl = item;
    startX = event.clientX;
    startY = event.clientY;
    didDrag = false;
    didCapture = false;
  };

  const onPointerMove = (event) => {
    if (pointerId == null || event.pointerId !== pointerId || !draggingEl) return;

    const dx = Math.abs(event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);
    if (!didDrag) {
      if (dx + dy < 5) return;

      didDrag = true;
      container.classList.add('is-sorting');
      draggingEl.classList.add('is-dragging');

      try {
        container.setPointerCapture?.(pointerId);
        didCapture = true;
      } catch {
        didCapture = false;
      }
    }

    event.preventDefault();

    const over = getItem(document.elementFromPoint(event.clientX, event.clientY));
    if (!over || over === draggingEl || !getId(over)) return;

    const all = Array.from(container.querySelectorAll(itemSelector));
    const from = all.indexOf(draggingEl);
    const to = all.indexOf(over);
    if (from === -1 || to === -1) return;

    if (to > from) container.insertBefore(draggingEl, over.nextSibling);
    else container.insertBefore(draggingEl, over);
  };

  const onPointerUp = (event) => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    const wasDrag = didDrag;

    if (wasDrag) {
      const ids = Array.from(container.querySelectorAll(itemSelector))
        .map((element) => getId(element))
        .filter(Boolean);

      if (typeof onReorder === 'function') onReorder(ids);
      suppressNextClick();
    }

    reset();
  };

  const onPointerCancel = (event) => {
    if (pointerId == null || event.pointerId !== pointerId) return;
    reset();
  };

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerCancel);
}