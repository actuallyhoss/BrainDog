/**
 * The bindings themselves: DATA, in a plain module, so that anything can read them.
 *
 * THEY LIVED IN `keys.svelte.ts`, WHICH USES RUNES, AND THAT MADE THEM UNREADABLE BY A TEST. Three
 * places in this app carry a note about it. `admit.ts` keeps a copy of one binding's label with a
 * comment saying the registry cannot be imported; `palette.test.ts` reads the registry as TEXT and
 * greps it for two ids; and `keys.svelte.ts` itself closed a paragraph with "`keys.test.ts` asserts
 * it now" about a file that did not exist, because it could not exist. `NEVER_BIND` is a list of the
 * chords a browser owns and the product must never take, and nothing has ever checked it.
 *
 * The precedent is one import above where this came from: `silenced` lives in a plain `.ts` next
 * door and is re-exported, "for the reason `icons.ts` does the same". A registry is data and the
 * dispatcher is behaviour, and only the second one needs a rune.
 *
 * `keys.svelte.ts` RE-EXPORTS EVERYTHING HERE, so no screen changed and no import moved.
 */

export type Scope = 'document' | 'work' | 'grid' | 'board' | 'page' | 'decide' | 'gate' | 'inbox' | 'palette' | 'nav';


export type Binding = {
  id: string;
  scope: Scope;
  /** As it is printed on a `<kbd>`, which is also the primary exposure — AT support for
      `aria-keyshortcuts` is patchy, so it is never the only one. */
  key: string;
  label: string;
  bare: boolean;
};

/**
 * Never bound, and asserted by a test over the registry.
 *
 * IT WAS NOT, TWICE. The comment claimed a test and there was none, and the list had no importer at
 * all, so `NEVER_BIND` was a promise nothing kept: it was already broken once, when the dispatcher
 * read the pressed key with `g` armed without asking whether a modifier was held, so `g` then
 * `Ctrl+H` navigated Home over the browser's own binding. The sentence was then rewritten to say
 * "`keys.test.ts` asserts it now" about a file that did not exist and, while the registry lived in a
 * module with runes in it, could not. It exists now, next to this file, and the first thing it found
 * was that this list held all twelve function keys while the grid bound `F2`.
 *
 * Chrome's own extension API is the honest proxy for what is contestable at all: a command shortcut
 * must include Ctrl or Alt, and certain OS and browser shortcuts always take priority and cannot be
 * overridden.
 */
export const NEVER_BIND = [
  ...'TNWLDPSFGOHJR'.split('').map((k) => `Mod+${k}`),
  ...'NWBOJR'.split('').map((k) => `Mod+Shift+${k}`),
  'Mod+Shift+Delete',
  ...Array.from({ length: 9 }, (_, i) => `Mod+${i + 1}`),
  'Alt+ArrowLeft',
  'Alt+ArrowRight',
  /* THE FUNCTION KEYS A BROWSER ACTUALLY OWNS, AND IT USED TO BE ALL TWELVE. `F1` to `F12` went on
     this list as a block, and the grid binds `F2` for edit-in-place: the registry forbade a chord
     and then took it, and nothing anywhere read the list, so the contradiction sat in one file for
     as long as the file has existed. The first test over this list found it in a millisecond.
     `F2`, `F4`, `F8` and `F9` are not claimed by Chrome or Firefox on any platform, and `F2` is the
     rename-or-edit key every spreadsheet and file manager has had for thirty years, which is why
     the grid wanted it. The other eight stay: help, find again, reload, move focus between panes,
     caret browsing, the menu bar, full screen and the developer tools. `⇧F10` is the context-menu
     key and is deliberately not `F10`. */
  'F1',
  'F3',
  'F5',
  'F6',
  'F7',
  'F10',
  'F11',
  'F12',
] as const;

/** `Space` scrolls, always. Taking the page-scroll key inside a 500-row grid is exactly the kind of
    collision that makes a keyboard-first app feel broken to somebody who did not read the keymap. */
export const SCROLL_KEYS = ['Space', 'PageDown', 'PageUp'] as const;

export const BINDINGS: Binding[] = [
  { id: 'palette', scope: 'document', key: '⌘K', label: 'Open the palette', bare: false },
  { id: 'palette-slash-key', scope: 'document', key: '/', label: 'Open the palette, caret in the query', bare: true },
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
  { id: 'help', scope: 'document', key: '?', label: 'This sheet. It is help, not Slash', bare: true },
  { id: 'menu', scope: 'document', key: '⇧F10', label: 'The row or block menu', bare: false },

  /* THE WORK SCREEN (`lib/work/Work.svelte`), the owner's old tool's keys: the screen he did 85% of his writing on was
     worked with them, and a board of seventy rows with no keys is worked one row at a time. They act on the task the
     cursor is on, and never while a box has the caret. */
  { id: 'work-move', scope: 'work', key: 'j  k', label: 'The next or the previous task', bare: true },
  { id: 'work-tick', scope: 'work', key: 'x', label: 'Tick it, or take the tick off', bare: true },
  { id: 'work-edit', scope: 'work', key: 'e', label: 'Change its words where it is', bare: true },
  { id: 'work-due', scope: 'work', key: 'd', label: 'Set the day it is due', bare: true },
  { id: 'work-lane', scope: 'work', key: 'm', label: 'Move it to another state or project', bare: true },
  { id: 'work-delete', scope: 'work', key: 'Delete', label: 'Delete it, with an undo', bare: false },
  { id: 'work-open', scope: 'work', key: '↵', label: 'Open it', bare: false },
  { id: 'work-new', scope: 'work', key: 'n  c', label: 'Type a new task', bare: true },
  { id: 'work-find', scope: 'work', key: '/', label: 'Search the tasks', bare: true },
  { id: 'work-leave', scope: 'work', key: 'Esc', label: 'Cancel, or leave the box', bare: false },

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
  { id: 'gate-next', scope: 'gate', key: 'j  k', label: 'The next or the previous open question', bare: true },

  /* THE TWO QUEUES, which bound nothing (DESIGN-SYSTEM D1). A number answers the question under the cursor, as a press on
     its button does; the gate above is where one is examined, and the queue is where one already thought about is cleared. */
  { id: 'decide-move', scope: 'decide', key: 'j  k', label: 'The next or the previous question', bare: true },
  { id: 'decide-open', scope: 'decide', key: '↵', label: 'Open it, with every option and its reasoning', bare: false },
  { id: 'decide-answer', scope: 'decide', key: '1–9', label: 'Answer with that option', bare: true },
  { id: 'decide-approve', scope: 'decide', key: 'a', label: 'Answer with the suggested option, or accept the change', bare: true },
  { id: 'decide-defer', scope: 'decide', key: 'd', label: 'Defer it: a reason and a wake date', bare: true },
  { id: 'decide-select', scope: 'decide', key: 'x', label: 'Select it, to answer several at once', bare: true },
  { id: 'decide-send', scope: 'decide', key: '⌘↵  Esc', label: 'From inside a reason: send it, or go back to the list', bare: false },

  { id: 'inbox-move', scope: 'inbox', key: 'j  k', label: 'The next or the previous email', bare: true },
  { id: 'inbox-open', scope: 'inbox', key: '↵', label: 'Open it or close it', bare: false },
  { id: 'inbox-file', scope: 'inbox', key: 'e', label: 'File it in the chosen list', bare: true },
  { id: 'inbox-archive', scope: 'inbox', key: 'Delete', label: 'Archive it, with its bytes kept', bare: false },
  { id: 'inbox-select', scope: 'inbox', key: 'x', label: 'Select it, to file or archive several', bare: true },
  { id: 'inbox-clear', scope: 'inbox', key: 'Esc', label: 'Clear the selection', bare: false },

  { id: 'palette-move', scope: 'palette', key: '↑  ↓', label: 'Move', bare: false },
  { id: 'palette-run', scope: 'palette', key: '↵', label: 'Run the row', bare: false },
  { id: 'palette-complete', scope: 'palette', key: '⇥', label: 'Complete the query, and nothing else', bare: false },

  { id: 'nav-move', scope: 'nav', key: '⌥↑  ⌥↓', label: 'Move the focused item', bare: false },
  { id: 'nav-menu', scope: 'nav', key: '⇧F10', label: 'Move up, Move down, Move to top, Hide', bare: false },
];

export const SCOPE_ORDER: Scope[] = ['document', 'work', 'grid', 'board', 'page', 'decide', 'gate', 'inbox', 'palette', 'nav'];
