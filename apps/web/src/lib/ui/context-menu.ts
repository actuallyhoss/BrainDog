/**
 * THE ITEM'S MENU, AT THE POINTER. A right-click on anything that stands for a thing opens that thing's menu where the
 * pointer is, a held thumb opens it as the bottom sheet, and `⇧F10` or the context-menu key opens it on the focused
 * item. There is one menu per thing and every way in reaches it, so the items, the keys and the focus return are the same.
 *
 * THREE WAYS AN ITEM STANDS FOR SOMETHING, all resolved here (`pick`):
 *   - A LINK INTO THE APP stands for what it opens, without opting in: a sidebar row, a card, a table cell, a mention, a
 *     breadcrumb. The shell's one menu (`things/ThingMenu.svelte`) reads what it points at and offers the same items as
 *     that page's "…", with Open, Open in new tab and Copy link. No page has to be loaded first.
 *   - `data-thing="<address>"` is the same for something that is not a link: a palette row, a button that opens a page.
 *   - `data-menu-host` is an item with a menu of its own: its "…" is the first `aria-haspopup="menu"` control inside it
 *     that belongs to no nearer host. A value names another trigger by selector instead, which is how a selected row
 *     hands a right-click to the selection's menu; `self` is an item that hears `menuat` itself (`ownMenu`), for a row
 *     whose verbs have no "…" drawn. A host with no menu hands the press to the nearest one around it.
 *
 * A LINK IN A HOST. A link that is the host's whole face, or that opens the very thing the host is (`data-menu-thing`),
 * IS the host, and its menu opens with the link's three verbs added. A smaller link to something else (a person's name in
 * a task's row) is that something else, and opens its menu. A selected row's press is the selection's whatever it hit.
 *
 * The shell installs one set of listeners (`watchMenus`), so no screen listens for a right-click of its own.
 *
 * THE TRIGGER IS TOLD, NOT CLICKED. It is sent `menuat` with the point, and `Menu.svelte` opens its own list there; a
 * trigger that opens a menu of its own making listens through `menuAt`. One nobody claims is clicked, so a "…" that
 * knows nothing of this still opens its menu, hung from itself.
 *
 * THE BROWSER KEEPS ITS MENU where a person wants the browser's: in a field or anything editable, over text they
 * selected, on a link out of the app, with Shift held, and on empty space where nothing applies.
 */

import { DOORS, here } from '../at.ts';

export const MENU_AT = 'menuat';

/** Where to open, as a rect in the window, and where focus goes back to when the menu closes. */
export type MenuAt = { x: number; y: number; height: number; back: HTMLElement | null };

/**
 * A THING'S MENU, ASKED OF THE SHELL. `href` is the address it stands for, `from` the element pressed, which says whether
 * it is in a dialog or the sidebar. The shell's answer is `true` once it owns the press; the menu may still be reading.
 */
export type ThingAsk = { href: string; name: string; at: MenuAt; from: HTMLElement };
let thingMenu: ((ask: ThingAsk) => boolean) | null = null;
/** The shell says who opens a thing's menu. Returns the function that takes it away. */
export function hearThings(open: (ask: ThingAsk) => boolean): () => void {
  thingMenu = open;
  return () => {
    if (thingMenu === open) thingMenu = null;
  };
}

/**
 * THE LINK THE PRESS WAS ON, handed to whichever menu opens from it, so a host's own menu gains Open, Open in new tab and
 * Copy link when it was opened from its link (`Menu.svelte`). Taken once, by that opening.
 */
let pressedLink: string | null = null;
export function takePressedLink(): string | null {
  const said = pressedLink;
  pressedLink = null;
  return said;
}

/** The dialog the press was in: what opens from it is drawn inside it, since a modal dialog makes the rest inert. */
let pressedIn: Element | null = null;
export const pressedDialog = (): Element | null => (pressedIn?.isConnected && (pressedIn as HTMLDialogElement).open ? pressedIn : null);

/** A page's own "…", wherever its head draws it: what its title's right-click opens. */
export const PAGE_MENU = '.menu-trigger:has(.head-more, .change-more, .tool-more, .more-trigger)';

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
export function ownMenu(open: (at: MenuAt) => void, thing?: string | null) {
  const heard = menuAt(open);
  return (node: HTMLElement) => {
    node.setAttribute('data-menu-host', 'self');
    /* THE THING IT STANDS FOR: a link in it to the same thing is the item, not something else. */
    if (thing) node.setAttribute('data-menu-thing', thing);
    const off = heard(node);
    return () => {
      off();
      node.removeAttribute('data-menu-host');
      node.removeAttribute('data-menu-thing');
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
 * THE ADDRESS OF A LINK INTO THE APP, relative to the origin, or null for anything else: a link out, a download, a door of
 * the host's (an attached file, `/api`), a jump on this page. The browser's menu is the right one for all of those.
 */
export function appAddress(a: Element): string | null {
  const said = a.getAttribute('href');
  if (!said || said.startsWith('#') || a.hasAttribute('download')) return null;
  let url: URL;
  try {
    url = new URL(said, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin || !/^https?:$/u.test(url.protocol)) return null;
  if (DOORS.has(url.pathname.split('/')[1] ?? '')) return null;
  return url.pathname + url.search;
}

/** Whether a link is the host's whole face: measured by area, so a name linked in a row is not and a card is. */
function isFace(link: Element, host: HTMLElement): boolean {
  const a = link.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  return a.width * a.height >= 0.6 * h.width * h.height;
}

/** The address only, with no query: a card's link and a row's own address are one thing whatever they carry. */
const bare = (href: string): string => here(href.split(/[?#]/u)[0] ?? href);

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

/** What a press on an element opens. */
type Picked = { host: HTMLElement; link: string | null } | { thing: string; from: HTMLElement };

/** What a press on `el` opens, or null where the browser keeps its menu. */
function pick(el: Element | null, shift: boolean, selected: boolean): Picked | null {
  if (!el || shift || selected || editable(el)) return null;
  const host = withMenu(el);
  const link = el.closest('a[href]');
  const address = link ? appAddress(link) : null;
  const marked = el.closest<HTMLElement>('[data-thing]');
  /* A LINK OUT OF THE APP IN NOBODY'S HOST, OR IN ONE: the browser's menu, whose Open in new tab and Copy link are right. */
  if (link && address === null && (!host || host.contains(link))) return null;
  if (!host) {
    if (address !== null) return { thing: address, from: link as HTMLElement };
    return marked?.dataset.thing ? { thing: marked.dataset.thing, from: marked } : null;
  }
  const named = host.dataset.menuHost;
  /* A SELECTED ROW'S PRESS IS THE SELECTION'S, whatever part of the row it hit. */
  const handsOn = named !== undefined && named !== '' && named !== 'self';
  if (marked?.dataset.thing && host.contains(marked) && marked !== host && (!link || marked.contains(link))) {
    if (!handsOn) return { thing: address ?? marked.dataset.thing, from: marked };
  }
  if (!link || address === null) return { host, link: marked === host ? (marked.dataset.thing ?? null) : null };
  /* THE LINK STANDS AROUND THE HOST, OR THE HOST IS THE LINK'S OWN: one thing, and its menu gains the link's verbs. */
  if (handsOn) return { host, link: null };
  /* A HOST THAT SAYS WHICH THING IT IS DRAWS THE LINK'S VERBS ITSELF. */
  if (host.dataset.menuThing && bare(host.dataset.menuThing) === bare(address)) return { host, link: null };
  if (link.contains(host) || isFace(link, host)) return { host, link: host.dataset.menuThing ? null : address };
  return { thing: address, from: link as HTMLElement };
}

/** Open what was picked, at a rect. Whether anything took it. */
function openPicked(picked: Picked, x: number, y: number, height = 0): boolean {
  const from = 'host' in picked ? picked.host : picked.from;
  pressedIn = from.closest('dialog[open]');
  if ('host' in picked) {
    pressedLink = picked.link;
    if (openHostMenu(picked.host, x, y, height)) return true;
    pressedLink = null;
    return false;
  }
  const focused = document.activeElement;
  const back = focused instanceof HTMLElement && focused !== document.body ? focused : from;
  const name = (from.getAttribute('aria-label') || from.textContent || '').trim().replace(/\s+/gu, ' ');
  return thingMenu?.({ href: picked.thing, name, at: { x, y, height, back }, from }) ?? false;
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
      else pressedLink = null;
      return;
    }
    drop();
    if (!e.isPrimary || !el || el.closest('[data-hold]')) return;
    const picked = pick(el, false, selectedOver(el));
    if (!picked) return;
    const { clientX: x, clientY: y, pointerId: id } = e;
    hold = {
      x,
      y,
      id,
      timer: setTimeout(() => {
        hold = null;
        if (!('host' in picked ? picked.host : picked.from).isConnected) return;
        heldAt = performance.now();
        navigator.vibrate?.(10);
        document.getSelection()?.removeAllRanges();
        openPicked(picked, x, y);
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
    /* A MENU'S OWN ITEM, RIGHT-CLICKED: the menu stays, and neither a second menu nor the browser's opens over it. */
    if (el?.closest('[role="menu"]') && !e.shiftKey) {
      e.preventDefault();
      return;
    }
    const picked = pick(el, e.shiftKey, selected);
    if (!picked) return;
    const was = document.getSelection()?.toString() ?? '';
    if (!openPicked(picked, e.clientX, e.clientY)) return;
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
    if (el.closest('[role="menu"]')) return;
    const picked = pick(el, false, false);
    if (!picked) return;
    const r = el.getBoundingClientRect();
    if (!openPicked(picked, r.left + Math.min(24, r.width / 2), r.top, r.height)) return;
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
