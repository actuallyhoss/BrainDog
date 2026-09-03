/**
 * The keymap: a registry the ONE dispatcher consults. No screen adds a listener of its own, and no
 * screen binds a key outside this file.
 *
 * That is what makes two otherwise expensive promises cheap: a `Character keys: off` switch that
 * silences the whole bare-letter namespace while every modifier chord keeps working, and a `?` sheet
 * that documents the bindings by READING them, so it cannot drift from what is bound (19 §4).
 *
 * THE ARCHITECTURAL DECISION, and everything else follows from it:
 *
 *   Every bare single-letter shortcut lives inside a focused `role="grid"`. The only document-level
 *   bare keys are `g`, `/` and `?`.
 *
 * It buys two things at once. It satisfies WCAG 2.1.4's focus exception with no settings toggle.
 * And it solves the screen-reader collision MECHANICALLY: NVDA and JAWS reserve nearly the whole
 * alphabet as browse-mode quick-nav keys, but a composite widget flips them into focus mode — the
 * mode where the H key puts the letter H in a text box. A grid is therefore the only place bare
 * letters are safe, and it is exactly where they are wanted.
 */

export type Scope = 'document' | 'grid' | 'page' | 'gate' | 'palette' | 'nav';

export type Binding = {
  id: string;
  scope: Scope;
  /** As it is printed on a `<kbd>`, which is also the primary exposure — AT support for
      `aria-keyshortcuts` is patchy, so it is never the only one. */
  key: string;
  label: string;
  bare: boolean;
  run?: (e: KeyboardEvent) => void;
};

/**
 * Never bound, and asserted by a test over the registry. Chrome's own extension API is the honest
 * proxy for what is contestable at all: a command shortcut must include Ctrl or Alt, and certain
 * OS and browser shortcuts always take priority and cannot be overridden.
 */
export const NEVER_BIND = [
  ...'TNWLDPSFGOHJR'.split('').map((k) => `Mod+${k}`),
  ...'NWBOJR'.split('').map((k) => `Mod+Shift+${k}`),
  'Mod+Shift+Delete',
  ...Array.from({ length: 9 }, (_, i) => `Mod+${i + 1}`),
  'Alt+ArrowLeft',
  'Alt+ArrowRight',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
] as const;

/** `Space` scrolls, always. Taking the page-scroll key inside a 500-row grid is exactly the kind of
    collision that makes a keyboard-first app feel broken to somebody who did not read the keymap. */
export const SCROLL_KEYS = ['Space', 'PageDown', 'PageUp'] as const;

export const BINDINGS: Binding[] = [
  { id: 'palette', scope: 'document', key: '⌘K', label: 'Open the palette', bare: false },
  { id: 'palette-slash', scope: 'document', key: '/', label: 'Open the palette, caret in the query', bare: true },
  { id: 'goto', scope: 'document', key: 'g then h d i s v p ,', label: 'Go to Home, Decide, Inbox, Search, Vault, Packs, Settings', bare: true },
  { id: 'goto-nav', scope: 'document', key: 'g then 1–9', label: 'The nth item of your nav, in your order', bare: true },
  { id: 'sidebar', scope: 'document', key: '⌘\\', label: 'Toggle the sidebar', bare: false },
  { id: 'undo', scope: 'document', key: '⌘Z', label: 'Undo the last write', bare: false },
  { id: 'commit', scope: 'document', key: '⌘↵', label: 'Commit the primary action of whatever is open', bare: false },
  { id: 'close', scope: 'document', key: 'Esc', label: 'Close the topmost layer, one per press', bare: false },
  { id: 'help', scope: 'document', key: '?', label: 'This sheet. It is help, never the assistant', bare: true },
  { id: 'menu', scope: 'document', key: '⇧F10', label: 'The row or block menu', bare: false },

  { id: 'row-down', scope: 'grid', key: 'j  ↓', label: 'Row down, keeping the column', bare: true },
  { id: 'row-up', scope: 'grid', key: 'k  ↑', label: 'Row up, keeping the column', bare: true },
  { id: 'col', scope: 'grid', key: '←  →', label: 'Column. Inverted on the inline axis under rtl', bare: false },
  { id: 'ends', scope: 'grid', key: 'Home  End', label: 'Row ends', bare: false },
  { id: 'register-ends', scope: 'grid', key: '⌘Home  ⌘End', label: 'Register ends', bare: false },
  { id: 'open', scope: 'grid', key: '↵', label: 'Open the row', bare: false },
  { id: 'peek', scope: 'grid', key: 'p', label: 'Peek — the drawer, with the list still visible', bare: true },
  { id: 'select', scope: 'grid', key: 'x  ⇧x  ⌘a', label: 'Select, extend, all loaded', bare: true },
  { id: 'edit', scope: 'grid', key: 'e  F2', label: 'Edit the focused cell in place', bare: true },
  { id: 'new', scope: 'grid', key: 'n', label: 'New row', bare: true },
  { id: 'filter', scope: 'grid', key: 'f', label: 'Filter', bare: true },
  { id: 'display', scope: 'grid', key: 'v', label: 'Display options', bare: true },
  { id: 'copy-id', scope: 'grid', key: 'y  ⇧Y', label: 'Copy the spoken id, or the link', bare: true },
  { id: 'related', scope: 'grid', key: 'o', label: 'Open the related register', bare: true },
  // The only destructive key, and it is not a letter. It is the key whose name is what it does.
  { id: 'delete', scope: 'grid', key: 'Delete', label: 'Delete, with an undo toast', bare: false },
  { id: 'save-view', scope: 'grid', key: '⌥V  ⌥B', label: 'Save the filter as a view, or bind it as a block', bare: false },

  { id: 'block-move', scope: 'page', key: 'j  k', label: 'Move between blocks', bare: true },
  { id: 'block-enter', scope: 'page', key: '↵  Esc', label: 'Enter the block, or leave it', bare: false },
  { id: 'block-source', scope: 'page', key: 'o', label: "Open the block's register, pre-filtered", bare: true },
  { id: 'block-link', scope: 'page', key: 'y', label: 'Copy a link to the block', bare: true },
  // Shift, not bare `e`: bare `e` means edit in place inside a grid, and a key's meaning must be a
  // function of the object in focus, not of the page you happen to be on.
  { id: 'block-source-code', scope: 'page', key: '⇧E', label: 'Open the declaration', bare: false },

  { id: 'gate-highlight', scope: 'gate', key: '1–9', label: 'Highlight an option. It does not choose it', bare: true },
  { id: 'gate-open', scope: 'gate', key: '↵', label: 'Open the commit step, focus the empty reason', bare: false },
  { id: 'gate-commit', scope: 'gate', key: '⌘↵', label: 'Commit — from inside the reason, with content', bare: false },
  { id: 'gate-defer', scope: 'gate', key: 'd', label: 'Defer: a reason and a wake date', bare: true },
  { id: 'gate-leave', scope: 'gate', key: 'Esc', label: 'Leave. The question stays open', bare: false },

  { id: 'palette-move', scope: 'palette', key: '↑  ↓', label: 'Move', bare: false },
  { id: 'palette-run', scope: 'palette', key: '↵', label: 'Run the row', bare: false },
  { id: 'palette-complete', scope: 'palette', key: '⇥', label: 'Complete the query, and nothing else', bare: false },

  { id: 'nav-move', scope: 'nav', key: '⌥↑  ⌥↓', label: 'Move the focused item', bare: false },
  { id: 'nav-menu', scope: 'nav', key: '⇧F10', label: 'Move up, Move down, Move to top, Hide', bare: false },
];

export const SCOPE_ORDER: Scope[] = ['document', 'grid', 'page', 'gate', 'palette', 'nav'];

/** The ONE test. No screen implements its own, and the rule it encodes is never relaxed. */
export function typing(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

/** `lockScroll` is a COUNTER, not a boolean, so two overlays closing in the wrong order do not
    unlock early. `overlaid() > 0` silences every hotkey except close. */
class Overlays {
  #count = $state(0);
  get depth() {
    return this.#count;
  }
  open() {
    this.#count++;
    document.documentElement.style.overflow = 'hidden';
  }
  close() {
    this.#count = Math.max(0, this.#count - 1);
    if (this.#count === 0) document.documentElement.style.overflow = '';
  }
}

export const overlays = new Overlays();

/** The `g` prefix is armed for one second, then expires. `g w` is a chord, not a mode. */
export class GoPrefix {
  armed = $state(false);
  #timer: ReturnType<typeof setTimeout> | undefined;
  arm() {
    this.armed = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.armed = false), 1000);
  }
  disarm() {
    this.armed = false;
    clearTimeout(this.#timer);
  }
}
