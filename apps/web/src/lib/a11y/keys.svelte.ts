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

/* `silenced` lives next door in a plain `.ts` and is re-exported here, for the reason `icons.ts`
   does the same: this file uses runes, so an import chain that reaches it cannot be loaded by
   `node --test` — and the one accessibility claim in this app is the last thing that should be
   untestable. Imported AND re-exported rather than passed through, so the name is in scope here
   too. */
import { silenced } from './chars.ts';

export { silenced };

export type Scope = 'document' | 'grid' | 'board' | 'page' | 'gate' | 'palette' | 'nav';


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
 * Never bound, and asserted by a test over the registry.
 *
 * IT WAS NOT. The comment claimed a test and there was none, and the list had no importer at all —
 * so `NEVER_BIND` was a promise nothing kept, and it was already broken: with `g` armed, the
 * dispatcher read the pressed key without asking whether a modifier was held, so `g` then `Ctrl+H`
 * navigated Home over the browser's own binding. `keys.test.ts` asserts it now. Chrome's own extension API is the honest
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
  /* `g s` IS BACK, BECAUSE SEARCH BECAME A PLACE YOU GO. This row printed it while nothing bound
     it, and the fix at the time was to delete the key: *"search is not a place you go, it is the
     thing under the launcher"* — which was true while the palette was the only search, and which
     contradicted `19 §2`'s screen inventory and `19 §4`'s own chord list, both of which name
     `/search?q=`. The palette caps its record hits and now has somewhere to overflow to, so the
     screen exists and the chord reaches it. */
  { id: 'goto', scope: 'document', key: 'g then h d i s v p ,', label: 'Go to Home, Decide, Inbox, Search, Vault, Packs, Settings', bare: true },
  { id: 'goto-nav', scope: 'document', key: 'g then 1–9', label: 'The nth item of your nav, in your order', bare: true },
  { id: 'sidebar', scope: 'document', key: '⌘\\', label: 'Toggle the sidebar', bare: false },
  { id: 'undo', scope: 'document', key: '⌘Z', label: 'Undo the last change', bare: false },
  { id: 'commit', scope: 'document', key: '⌘↵', label: 'Commit the primary action of whatever is open', bare: false },
  { id: 'close', scope: 'document', key: 'Esc', label: 'Close the topmost layer, one per press', bare: false },
  { id: 'help', scope: 'document', key: '?', label: 'This sheet. It is help, never the assistant', bare: true },
  { id: 'menu', scope: 'document', key: '⇧F10', label: 'The row or block menu', bare: false },

  { id: 'row-down', scope: 'grid', key: 'j  ↓', label: 'Row down, keeping the column', bare: true },
  { id: 'row-up', scope: 'grid', key: 'k  ↑', label: 'Row up, keeping the column', bare: true },
  { id: 'col', scope: 'grid', key: '←  →', label: 'Move between columns', bare: false },
  { id: 'ends', scope: 'grid', key: 'Home  End', label: 'Row ends', bare: false },
  { id: 'register-ends', scope: 'grid', key: '⌘Home  ⌘End', label: 'Top and bottom of the list', bare: false },
  { id: 'open', scope: 'grid', key: '↵', label: 'Open the row', bare: false },
  { id: 'peek', scope: 'grid', key: 'p', label: 'Peek, with the list still visible', bare: true },
  { id: 'select', scope: 'grid', key: 'x  ⇧x  ⌘a', label: 'Select, extend, all loaded', bare: true },
  { id: 'edit', scope: 'grid', key: 'e  F2', label: 'Edit the focused cell in place', bare: true },
  { id: 'new', scope: 'grid', key: 'n', label: 'New row', bare: true },
  { id: 'display', scope: 'grid', key: 'v', label: 'Display options', bare: true },
  { id: 'copy-id', scope: 'grid', key: 'y  ⇧Y', label: 'Copy the id, or the link', bare: true },
  { id: 'related', scope: 'grid', key: 'o', label: 'Open the linked list', bare: true },
  // The only destructive key, and it is not a letter. It is the key whose name is what it does.
  { id: 'delete', scope: 'grid', key: 'Delete', label: 'Delete, with an undo toast', bare: false },
  { id: 'save-view', scope: 'grid', key: '⌥V  ⌥B', label: 'Save the filter as a view, or bind it as a block', bare: false },

  /**
   * THE BOARD, WHICH BOUND THREE THINGS AND PRINTED NONE OF THEM.
   *
   * `19 §4` is that the sheet documents the bindings by READING them, so it cannot drift from what
   * is bound. A board's arrows are the primitive's own composite behaviour rather than a dispatcher
   * binding, which is exactly the argument that keeps a thing off this list and then off the sheet:
   * the reader is told a grid moves with arrows, meets a board, and finds arrows that do something
   * else. Its own scope rather than `grid`, so a register list does not advertise a card it has not
   * got.
   *
   * `bare: false` ON ALL THREE. None is a bare character, so none is subject to the *Character
   * keys* switch, and the two move chords are modified, which is what keeps them out of WCAG
   * 2.1.4's single-character exception.
   *
   * `⇧←  ⇧→` AND `⌥↑  ⌥↓` FOR ONE VERB. `⌥↑ ⌥↓` is this registry's own `nav-move`, "Move the
   * focused item", so the board answers the key the product already teaches; its horizontal
   * spelling is unavailable because `Alt` with a horizontal arrow is the browser's Back and Forward
   * and is on `NEVER_BIND`. `⇧←  ⇧→` is the same verb on the axis a board is drawn on.
   */
  { id: 'card-col', scope: 'board', key: '←  →', label: 'Move between columns', bare: false },
  { id: 'card-row', scope: 'board', key: '↑  ↓', label: 'Move up and down a column', bare: false },
  { id: 'card-move', scope: 'board', key: '⇧←  ⇧→   ⌥↑  ⌥↓', label: 'Move the focused card to the next column', bare: false },

  { id: 'block-move', scope: 'page', key: 'j  k', label: 'Move between blocks', bare: true },
  { id: 'block-enter', scope: 'page', key: '↵  Esc', label: 'Enter the block, or leave it', bare: false },
  { id: 'block-source', scope: 'page', key: 'o', label: 'Open the list behind this, filtered', bare: true },
  { id: 'block-link', scope: 'page', key: 'y', label: 'Copy a link to the block', bare: true },
  // Shift, not bare `e`: bare `e` means edit in place inside a grid, and a key's meaning must be a
  // function of the object in focus, not of the page you happen to be on.
  { id: 'block-source-code', scope: 'page', key: '⇧E', label: 'Open the source', bare: false },

  { id: 'gate-highlight', scope: 'gate', key: '1–9', label: 'Highlight an option. It does not choose it', bare: true },
  { id: 'gate-open', scope: 'gate', key: '↵', label: 'Open the commit step, focus the empty reason', bare: false },
  { id: 'gate-commit', scope: 'gate', key: '⌘↵', label: 'Commit, from inside the reason', bare: false },
  { id: 'gate-defer', scope: 'gate', key: 'd', label: 'Defer: a reason and a wake date', bare: true },
  { id: 'gate-leave', scope: 'gate', key: 'Esc', label: 'Leave. The question stays open', bare: false },

  { id: 'palette-move', scope: 'palette', key: '↑  ↓', label: 'Move', bare: false },
  { id: 'palette-run', scope: 'palette', key: '↵', label: 'Run the row', bare: false },
  { id: 'palette-complete', scope: 'palette', key: '⇥', label: 'Complete the query, and nothing else', bare: false },

  { id: 'nav-move', scope: 'nav', key: '⌥↑  ⌥↓', label: 'Move the focused item', bare: false },
  { id: 'nav-menu', scope: 'nav', key: '⇧F10', label: 'Move up, Move down, Move to top, Hide', bare: false },
];

export const SCOPE_ORDER: Scope[] = ['document', 'grid', 'board', 'page', 'gate', 'palette', 'nav'];

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
