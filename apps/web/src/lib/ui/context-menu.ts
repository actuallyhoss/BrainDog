/**
 * THE ITEM'S MENU, AT THE POINTER. A right-click on anything that has a "…" menu opens that same menu where the pointer
 * is, a held thumb opens it as the bottom sheet, and `⇧F10` or the context-menu key opens it on the focused item. There
 * is one menu per item and every way in reaches it, so the items, the keys and the focus return are the same.
 *
 * OPT-IN, ON THE ITEM. Its outer element carries `data-menu-host`, and its "…" is the first `aria-haspopup="menu"`
 * control inside it that belongs to no nearer host. A value names another trigger by selector instead, which is how a
 * selected row hands a right-click to the selection's menu; `self` is an item that hears `menuat` itself (`ownMenu`),
 * for a row whose verbs have no "…" drawn. A host with no menu hands the press to the nearest one around it. The shell installs one set of listeners (`watchMenus`), so
 * no screen listens for a right-click of its own.
 *
 * THE TRIGGER IS TOLD, NOT CLICKED. It is sent `menuat` with the point, and `Menu.svelte` opens its own list there; a
 * trigger that opens a menu of its own making listens through `menuAt`. One nobody claims is clicked, so a "…" that
 * knows nothing of this still opens its menu, hung from itself.
 *
 * THE BROWSER KEEPS ITS MENU where a person wants the browser's: in a field or anything editable, over text they
 * selected, on a link inside the item (open in a new tab), with Shift held, and on anything that is not a host.
 */

export const MENU_AT = 'menuat';

/** Where to open, as a rect in the window, and where focus goes back to when the menu closes. */
export type MenuAt = { x: number; y: number; height: number; back: HTMLElement | null };

/** A press held this long, without moving, is a long press. */
const HOLD_MS = 500;
/** A thumb that moves this far is scrolling, not holding. */
const SLOP = 10;

/**
 * For a trigger that opens a menu of its own making (a page's row menu): call `open` with the point, and claim it.
 * Attached with `{@attach menuAt(...)}`.
 */
export function menuAt(open: (at: MenuAt) => void) {
  return (node: HTMLElement) => {
    const on = (e: Event) => {
      e.preventDefault();
      open((e as CustomEvent<MenuAt>).detail);
    };
    node.addEventListener(MENU_AT, on);
    return () => node.removeEventListener(MENU_AT, on);
  };
}

/**
 * For an item with verbs and no "…": the item is its own trigger, and its menu (`Menu` with `at`) opens where it was
 * right-clicked or held, or at the item from `⇧F10`. Attached with `{@attach ownMenu(...)}`.
 */
export function ownMenu(open: (at: MenuAt) => void) {
  const heard = menuAt(open);
  return (node: HTMLElement) => {
    node.setAttribute('data-menu-host', 'self');
    const off = heard(node);
    return () => {
      off();
      node.removeAttribute('data-menu-host');
    };
  };
}

/** The item's "…": named by the host's value, or its own first menu trigger. */
function triggerOf(host: HTMLElement): HTMLElement | null {
  const named = host.dataset.menuHost;
  /* AN ITEM WITH NO "…" OF ITS OWN whose menu opens only at the pointer or from the keys: it hears `menuat` itself. */
  if (named === 'self') return host;
  if (named) {
    try {
      const el = document.querySelector<HTMLElement>(named);
      if (el) return el;
    } catch {
      /* Not a selector: the host's own trigger, below. */
    }
  }
  for (const el of host.querySelectorAll<HTMLElement>('[aria-haspopup="menu"]')) {
    if (el.closest('[data-menu-host]') === host && !el.matches(':disabled, [aria-disabled="true"]')) return el;
  }
  return null;
}

/** Open this host's menu at a rect. Whether it opened. */
function openOne(host: HTMLElement, x: number, y: number, height: number): boolean {
  const trigger = triggerOf(host);
  if (!trigger) return false;
  const focused = document.activeElement;
  const back = focused instanceof HTMLElement && focused !== document.body && host.contains(focused) ? focused : trigger;
  const told = new CustomEvent<MenuAt>(MENU_AT, { cancelable: true, detail: { x, y, height, back } });
  if (!trigger.dispatchEvent(told)) return true;
  if (trigger === host || trigger.getClientRects().length === 0) return false;
  trigger.click();
  return true;
}

/** Open the host's menu at a rect, or, where it has nothing to open this time, the next one out. Whether one opened. */
export function openHostMenu(from: HTMLElement, x: number, y: number, height = 0): boolean {
  for (let host: HTMLElement | null = from; host; host = host.parentElement ? withMenu(host.parentElement) : null) {
    if (openOne(host, x, y, height)) return true;
  }
  return false;
}

/** Whether the target is something a person types in. */
const editable = (el: Element): boolean =>
  (el as HTMLElement).isContentEditable === true || el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;

/**
 * A LINK INSIDE THE ITEM IS A LINK, and keeps the browser's menu for "Open in new tab". A link that is the item's whole
 * face (a card drawn as one `<a>`) is the item, and opens the item's menu: measured by area, so a name linked in a row
 * keeps the browser's and a card does not.
 */
function aLink(el: Element, host: HTMLElement): boolean {
  const link = el.closest('a[href]');
  if (!link || !host.contains(link) || link === host) return false;
  const a = link.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  return a.width * a.height < 0.6 * h.width * h.height;
}

/** Whether a selection the person made covers the target, read before the press could select a word of its own. */
function selectedOver(el: Element): boolean {
  const sel = document.getSelection();
  return sel !== null && !sel.isCollapsed && sel.toString().trim() !== '' && sel.containsNode(el, true);
}

/** The nearest host from `el` out that has a menu to open: a row with none hands the press to the block around it. */
function withMenu(el: Element): HTMLElement | null {
  let host = el.closest<HTMLElement>('[data-menu-host]');
  while (host && !triggerOf(host)) host = host.parentElement?.closest<HTMLElement>('[data-menu-host]') ?? null;
  return host;
}

/** The host a press on `el` opens, or null where the browser keeps its menu. */
function hostFor(el: Element | null, shift: boolean, selected: boolean): HTMLElement | null {
  if (!el || shift || selected || editable(el)) return null;
  const near = el.closest<HTMLElement>('[data-menu-host]');
  if (!near || aLink(el, near)) return null;
  return withMenu(el);
}

/**
 * THE SHELL'S LISTENERS, installed once. Returns the function that takes them away.
 *
 *   - `contextmenu`: a right-click, or a held finger on Android, opens the host's menu at the pointer. A screen that
 *     already took the event (`defaultPrevented`) keeps it.
 *   - a held touch or pen: the same menu, which `Menu` draws as the sheet under a thumb. A host that answers a long
 *     press of its own says so with `data-hold`.
 *   - `⇧F10` and the context-menu key: the menu of the focused item, at the item.
 */
export function watchMenus(): () => void {
  /* WHAT WAS SELECTED BEFORE THE PRESS: a right-click on a word selects it on some systems before `contextmenu`. */
  let selectedAtPress = false;
  let hold: { timer: ReturnType<typeof setTimeout>; x: number; y: number; id: number } | null = null;
  /** When a long press last opened a menu: the click its lift makes, and Android's `contextmenu`, are eaten. */
  let heldAt = Number.NEGATIVE_INFINITY;
  /** When a key last opened a menu: the `contextmenu` the same key sends after it is eaten. */
  let keyedAt = Number.NEGATIVE_INFINITY;

  const drop = () => {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  };

  function down(e: PointerEvent) {
    const el = e.target instanceof Element ? e.target : null;
    if (e.pointerType === 'mouse') {
      if (e.button === 2 && el) selectedAtPress = selectedOver(el);
      return;
    }
    drop();
    if (!e.isPrimary || !el || el.closest('[data-hold]')) return;
    const host = hostFor(el, false, selectedOver(el));
    if (!host) return;
    const { clientX: x, clientY: y, pointerId: id } = e;
    hold = {
      x,
      y,
      id,
      timer: setTimeout(() => {
        hold = null;
        if (!host.isConnected) return;
        heldAt = performance.now();
        navigator.vibrate?.(10);
        document.getSelection()?.removeAllRanges();
        openHostMenu(host, x, y);
      }, HOLD_MS),
    };
  }

  function move(e: PointerEvent) {
    if (hold && e.pointerId === hold.id && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > SLOP) drop();
  }

  function lifted(e: PointerEvent) {
    if (hold && e.pointerId === hold.id) drop();
  }

  /** The click a held finger makes as it lifts would open the item under its own menu. */
  function click(e: MouseEvent) {
    if (performance.now() - heldAt > 800) return;
    heldAt = Number.NEGATIVE_INFINITY;
    e.preventDefault();
    e.stopPropagation();
  }

  function context(e: MouseEvent) {
    if (e.defaultPrevented) return;
    const now = performance.now();
    /* THE SAME PRESS, SAID TWICE: Android's `contextmenu` for a press already held open, or the key's after its keydown. */
    if (now - heldAt < 800 || now - keyedAt < 800) {
      e.preventDefault();
      return;
    }
    const el = e.target instanceof Element ? e.target : null;
    const touch = (e as PointerEvent).pointerType === 'touch' || (e as PointerEvent).pointerType === 'pen';
    const selected = touch ? selectedOver(el ?? document.body) : selectedAtPress;
    selectedAtPress = false;
    const host = hostFor(el, e.shiftKey, selected);
    if (!host) return;
    const was = document.getSelection()?.toString() ?? '';
    if (!openHostMenu(host, e.clientX, e.clientY)) return;
    e.preventDefault();
    drop();
    if (touch) heldAt = now;
    /* A word the right-click selected on its way in is not the person's selection. */
    if (!selected && was !== '') document.getSelection()?.removeAllRanges();
  }

  function key(e: KeyboardEvent) {
    if (e.defaultPrevented || !((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) return;
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || editable(el)) return;
    const host = withMenu(el);
    if (!host) return;
    const r = (el === host ? host : el).getBoundingClientRect();
    if (!openHostMenu(host, r.left + Math.min(24, r.width / 2), r.top, r.height)) return;
    e.preventDefault();
    keyedAt = performance.now();
  }

  const scroll = () => drop();
  const opts = { capture: true } as const;
  document.addEventListener('pointerdown', down, opts);
  document.addEventListener('pointermove', move, opts);
  document.addEventListener('pointerup', lifted, opts);
  document.addEventListener('pointercancel', lifted, opts);
  document.addEventListener('scroll', scroll, opts);
  document.addEventListener('click', click, opts);
  window.addEventListener('contextmenu', context);
  window.addEventListener('keydown', key);
  return () => {
    drop();
    document.removeEventListener('pointerdown', down, opts);
    document.removeEventListener('pointermove', move, opts);
    document.removeEventListener('pointerup', lifted, opts);
    document.removeEventListener('pointercancel', lifted, opts);
    document.removeEventListener('scroll', scroll, opts);
    document.removeEventListener('click', click, opts);
    window.removeEventListener('contextmenu', context);
    window.removeEventListener('keydown', key);
  };
}
