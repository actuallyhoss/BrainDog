/**
 * EVERY VERB A MENU CAN HOLD, ONCE: what it does, in the one place that says which glyph means it. The same action wears
 * the same glyph in every "…" and every right-click menu, whichever screen drew it, and `tools/gates/menu-items.mjs`
 * reads the app's menus against this map and fails a new item with no glyph, or one that means the same as another
 * with a different glyph.
 *
 * Keyed by what the item does, so "Rename this list" and "Rename" are one verb. Plain data, so a gate and `node` read it.
 */

import type { IconName } from '../ui/icons.ts';

export const VERB_ICONS = {
  /* Going somewhere. */
  open: 'arrow',
  newTab: 'external',
  back: 'back',
  /* Telling and copying. */
  send: 'slash',
  copyLink: 'link',
  copy: 'copy',
  /* Keeping it where you can see it. */
  pin: 'pin',
  keepLayout: 'lock',
  hide: 'eye-off',
  show: 'eye',
  peek: 'eye',
  select: 'check',
  /* Changing it. */
  rename: 'tag',
  edit: 'edit',
  ask: 'ask',
  state: 'check',
  later: 'clock',
  done: 'check',
  move: 'arrowUp',
  moveDown: 'arrowDown',
  add: 'plus',
  /* Who has it. */
  hand: 'user-check',
  share: 'user-plus',
  private: 'lock',
  merge: 'git-merge',
  /* How it is drawn and made. */
  display: 'settings',
  settings: 'settings',
  fields: 'rows',
  layout: 'grid',
  board: 'board',
  source: 'code',
  history: 'history',
  filter: 'filter',
  money: 'money',
  download: 'download',
  run: 'play',
  stop: 'stop',
  notify: 'bell',
  refresh: 'refresh',
  addon: 'plug',
  more: 'more',
  /* Going, last. */
  archive: 'archive',
  delete: 'trash',
  dismiss: 'close',
  signOut: 'log-out',
} as const satisfies Record<string, IconName>;

export type VerbId = keyof typeof VERB_ICONS;

/** The words of the link's three, here since every menu that stands for a link draws them. */
export const linkWords = { open: 'Open', newTab: 'Open in new tab', copyLink: 'Copy link' } as const;

/** The words of the verbs only a link's menu draws, or that a page's "…" now shares with it. */
export const thingWords = {
  rename: 'Rename',
  renameThis: (one: string) => `Rename this ${one.toLowerCase()}`,
  nameField: 'Name',
  renameList: 'Rename this list',
  details: 'Edit details',
  more: 'More',
  stopTelling: 'Stop telling me',
  tellAgain: 'Tell me again',
  boardOn: 'Lay out as a board',
  boardOff: 'Back to a plain page',
  contacts: 'Import contacts',
  statement: 'Import a statement',
  reorder: 'Reorder the areas',
  ask: 'Note a choice to make',
  whole: 'Add one with all its fields',
  hide: 'Hide from the sidebar',
  hidden: (name: string) => `${name} is out of the sidebar.`,
  customise: 'Customise the sidebar',
  hideSidebar: 'Hide the sidebar',
  startHere: 'Open here when I start',
  startHereOff: 'Stop opening here when I start',
  reading: 'Reading…',
  unread: 'Its other actions could not be read.',
  again: 'Try again',
  save: 'Save',
  cancel: 'Cancel',
  menuOf: 'Menu',
} as const;
