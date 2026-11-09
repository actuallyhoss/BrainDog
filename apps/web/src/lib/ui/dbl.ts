/**
 * A DOUBLE CLICK CHANGES WHAT IT LANDS ON (the owner, 9 Nov: "i should be able to double click on lots of stuff like in
 * people, projects, profile pictures etc. to edit"). A name, a value, a card or a row that has an edit somewhere else (a
 * pencil, Rename in its "…", the panel a press opens) says what that edit is with `{@attach dbl(edit)}`, and a double click
 * on it, a double tap under a thumb, or `F2` while it has focus, goes straight there. Nothing new is drawn: `edit` is the
 * call the pencil or the menu already makes, so the box, the write, the receipt and the Undo are the ones it always had.
 *
 * A SINGLE CLICK IS NEVER HELD BACK to see whether a second follows: it does at once what it always did (opens the row,
 * follows the link), and the double click lands in what it opened, already changing it. So the shell remembers what the
 * first click landed on, and the second press hears that, wherever it lands: a card the first click opened a panel
 * beside may have moved, and a link may already have drawn the next page under the pointer. The second click of the
 * pair is eaten, so it presses nothing the first one drew there, and its press selects no word.
 *
 * WHAT IS NOT CHANGED THIS WAY KEEPS THE BROWSER'S DOUBLE CLICK: text with no `dbl` selects its word, a field selects in
 * itself, and a control inside the node (a tick, a "…", a link to something else) is that control's, unless the node lets
 * it through (`through`, the row's own opener). A picture is left alone: its double click is its own (`PICTURE`).
 *
 * The shell installs one set of listeners (`watchDoubles`), as it does for the right-click (`context-menu.ts`), so no
 * screen listens for a double click of its own.
 */

import { navigating } from '$app/state';

/** What a double click does, handed the element the first press landed on: a node over many rows finds its row there. */
export type Edit = (from: Element) => unknown;

type Held = {
  edit: Edit;
  /** Whether the node changes this time, asked as the first press lands: `false` leaves it to the node round it. */
  can: ((from: Element) => boolean) | null;
  /** Controls inside the node that open it, and so are its own (a row's title button), not a control of their own. */
  through: string | null;
};

const held = new WeakMap<Element, Held>();

/**
 * `{@attach dbl(edit)}`: a double click on the node, or on what it holds that is no control of its own, calls `edit`.
 * `can` says whether it changes now, asked as the first press lands; `through` names the controls inside it that open it.
 */
export function dbl(edit: Edit, { can, through }: { can?: (from: Element) => boolean; through?: string } = {}) {
  return (node: HTMLElement) => {
    held.set(node, { edit, can: can ?? null, through: through ?? null });
    node.setAttribute('data-dbl', '');
    return () => {
      held.delete(node);
      node.removeAttribute('data-dbl');
    };
  };
}

/** Something a person types in: its double click selects in it, always. */
const TYPED = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
/** A control with a press of its own, which a double click on it keeps. */
const CONTROL = `a[href], button, summary, label, [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], [role="tab"], [role="option"], [role="slider"], [aria-haspopup], ${TYPED}`;
/**
 * A PICTURE: a face, a well, a mark. Its double click is the picture's to answer (`Face.svelte`, `IdentityMark.svelte`,
 * `IconWell.svelte`, the panel's mark), so nothing here takes it, even inside a node whose name changes.
 */
const PICTURE = '.face, .agent-face, .well, .p-mark, .name-well, .name-icon, [data-picture]';

/**
 * The node a press on `el` asks to change, and what it says, or null where the press is the browser's or a control's.
 * THE NEAREST NODE THAT CHANGES NOW: one that does not (`can`) leaves the press to the node round it, so a widget's name
 * on Today is Today's to change though it is drawn inside a page whose rows change themselves.
 */
function heldAt(el: Element): { node: Element; h: Held } | null {
  if (el.closest(TYPED) || el.closest(PICTURE)) return null;
  let control: Element | null = null;
  for (let at: Element | null = el; at; at = at.parentElement) {
    const h = held.get(at);
    if (h && (!control || (h.through !== null && control.matches(h.through))) && (!h.can || h.can(el))) return { node: at, h };
    if (!control && at.matches(CONTROL)) control = at;
  }
  return null;
}

/** How long and how far a second press may come after the first and still be its pair. */
const FRESH_MS = 1500;
const NEAR_PX = 16;
/** A tap's own: down and up this close in time and place, and the second this soon after the first. */
const TAP_MS = 500;
const TAP_PX = 12;
const TWICE_MS = 350;
const TWICE_PX = 28;
/** How long a change waits on the page its first press set off for. */
const LANDS_MS = 12_000;

/**
 * THE CHANGE WAITS FOR THE PAGE THE FIRST PRESS SET OFF FOR (a thread on Slash opens at its own address): a box opened
 * while the move was still on its way lost its caret as the page landed, and closed, so it opens on the page that stays.
 */
function landed(go: () => unknown): void {
  const until = performance.now() + LANDS_MS;
  const step = (): void => {
    if (navigating.to === null || performance.now() > until) void go();
    else requestAnimationFrame(step);
  };
  /* A FRAME FIRST, so a move the first press set off has begun. */
  requestAnimationFrame(step);
}

/**
 * THE SHELL'S LISTENERS, installed once. Returns the function that takes them away.
 *
 *   - A POINTER'S DOUBLE CLICK: the first press and its `click` say what they landed on, the second press selects
 *     nothing, the second `click` is eaten, and `dblclick` changes what the first landed on. The press says it too
 *     because a rail row goes on the way down and drops the click its lift sends (`motion/press.ts`).
 *   - A THUMB'S DOUBLE TAP, two taps close together, heard by their lifts: what the first tap landed on changes at the
 *     second's, so it does not wait on a phone's own word for a double tap, which WebKit does not always send. The click
 *     the second tap makes is eaten. The page has no double-tap zoom to fight (`touch-action: manipulation`, `app.css`),
 *     and a press that scrolled is no tap.
 *   - `F2`, THE RENAME KEY every file manager and spreadsheet has: what has focus changes as a double click would change
 *     it. A grid's own `F2` edits its cell in place (`routes/r/[register]`), and a cell holds no node of its own.
 */
export function watchDoubles(): () => void {
  let armed: { go: () => unknown; at: number; x: number; y: number } | null = null;
  let tap: { at: number; x: number; y: number; go: (() => unknown) | null } | null = null;
  let down: { id: number; at: number; x: number; y: number } | null = null;
  /** Until when the click the second tap makes is eaten. */
  let eatUntil = Number.NEGATIVE_INFINITY;

  const near = (a: { x: number; y: number }, x: number, y: number, px: number): boolean => Math.abs(a.x - x) <= px && Math.abs(a.y - y) <= px;
  const paired = (e: MouseEvent): boolean => armed !== null && e.timeStamp - armed.at <= FRESH_MS && near(armed, e.clientX, e.clientY, NEAR_PX);
  const eat = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };
  /** What a press on `target` changes, ready to call, or null. */
  const goOf = (target: EventTarget | null): (() => unknown) | null => {
    const el = target instanceof Element ? target : null;
    const got = el ? heldAt(el) : null;
    return got && el ? () => got.h.edit(el) : null;
  };

  /** The first press of a pair, or its click: what it landed on, ready for the second. */
  function arm(e: MouseEvent) {
    armed = null;
    if (e.detail !== 1 || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const go = goOf(e.target);
    if (go) armed = { go, at: e.timeStamp, x: e.clientX, y: e.clientY };
  }

  function click(e: MouseEvent) {
    /* A CLICK A SCREEN MADE ITSELF (`el.click()`) IS NO PRESS: it neither starts a pair nor ends one. */
    if (!e.isTrusted) return;
    if (e.timeStamp <= eatUntil) return eat(e);
    /* THE PAIR'S SECOND CLICK presses nothing: the first already did what a click does there. */
    if (e.detail >= 2) {
      if (paired(e)) eat(e);
      return;
    }
    arm(e);
  }

  /* THE FIRST PRESS ARMS AS ITS CLICK DOES; THE SECOND SELECTS NO WORD AND MOVES NO FOCUS, where the pair changes something. */
  function press(e: MouseEvent) {
    if (!e.isTrusted || e.timeStamp <= eatUntil) return;
    if (e.detail >= 2) {
      if (paired(e)) e.preventDefault();
      return;
    }
    arm(e);
  }

  function double(e: MouseEvent) {
    if (!e.isTrusted || !paired(e)) return;
    const go = armed!.go;
    armed = null;
    e.preventDefault();
    e.stopPropagation();
    landed(go);
  }

  function pointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    down = { id: e.pointerId, at: e.timeStamp, x: e.clientX, y: e.clientY };
  }

  function pointerUp(e: PointerEvent) {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    const was = down;
    down = null;
    if (!was || was.id !== e.pointerId || e.timeStamp - was.at > TAP_MS || !near(was, e.clientX, e.clientY, TAP_PX)) return void (tap = null);
    const first = tap;
    if (first && e.timeStamp - first.at <= TWICE_MS && near(first, e.clientX, e.clientY, TWICE_PX)) {
      tap = null;
      if (!first.go) return;
      armed = null;
      eatUntil = e.timeStamp + 600;
      landed(first.go);
      return;
    }
    tap = { at: e.timeStamp, x: e.clientX, y: e.clientY, go: goOf(e.target) };
  }

  function cancel() {
    down = null;
    tap = null;
  }

  function key(e: KeyboardEvent) {
    if (e.key !== 'F2' || e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const el = document.activeElement;
    if (!el || el === document.body) return;
    const go = goOf(el);
    if (!go) return;
    e.preventDefault();
    go();
  }

  const opts = { capture: true } as const;
  document.addEventListener('click', click, opts);
  document.addEventListener('mousedown', press, opts);
  document.addEventListener('dblclick', double, opts);
  document.addEventListener('pointerdown', pointerDown, opts);
  document.addEventListener('pointerup', pointerUp, opts);
  document.addEventListener('pointercancel', cancel, opts);
  window.addEventListener('keydown', key);
  return () => {
    document.removeEventListener('click', click, opts);
    document.removeEventListener('mousedown', press, opts);
    document.removeEventListener('dblclick', double, opts);
    document.removeEventListener('pointerdown', pointerDown, opts);
    document.removeEventListener('pointerup', pointerUp, opts);
    document.removeEventListener('pointercancel', cancel, opts);
    window.removeEventListener('keydown', key);
  };
}
