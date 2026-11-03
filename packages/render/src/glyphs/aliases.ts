/**
 * The names a declaration already uses, and the short names the plan uses, mapped onto the set's own.
 *
 * THE SET IS NAMED THE WAY LUCIDE NAMES IT, so a glyph an agent has seen on lucide.dev is a glyph it can
 * name here without a lookup table in its head. The shell's names came first and are not Lucide's
 * (`home` is Lucide's `house`, `close` is `x`), and every page and register declared so far carries one
 * of them in its `icon:`. So they stay valid as aliases rather than being renamed under the documents
 * that use them. A name that is already Lucide's (`search`, `bell`, `archive`) is kept as it is and has
 * no entry here.
 *
 * Path data is not in this file: it is in `core.ts` and `set.ts`, which carry Lucide's credit.
 */

import type { CoreGlyph } from './core.ts';
import type { SetGlyph } from './set.ts';

/**
 * Every `apps/web/src/lib/ui/icons.ts` name that Lucide spells differently. EVERY TARGET IS IN THE CORE,
 * and the type says so: the shell draws these on every page, and a shell name that resolved into the set
 * would make the rail wait on the chunk that only block pages load.
 */
export const SHELL = {
  home: 'house',
  /* A fork in a road, the Decide screen. Lucide's `split` is the same two-way branch. */
  decide: 'split',
  packs: 'blocks',
  vault: 'shield',
  /* Drawn as three sliders today, and it is Settings, not a cog. */
  settings: 'sliders-horizontal',
  chevron: 'chevron-right',
  chevronDown: 'chevron-down',
  close: 'x',
  /* Lucide renamed `filter` to `funnel`. */
  filter: 'funnel',
  alert: 'triangle-alert',
  arrow: 'arrow-right',
  back: 'arrow-left',
  external: 'external-link',
  stop: 'square',
  money: 'banknote',
  board: 'kanban',
  rows: 'rows-3',
  /* The plan names these three. */
  obligation: 'receipt',
  thing: 'box',
  session: 'bot',
  /* A subscription someone pays for and is served by: a bell on a counter reads as that, where the
     plug drawn today already means `plug`. */
  service: 'concierge-bell',
  people: 'users',
  task: 'square-check',
  doc: 'file-text',
  drag: 'grip-vertical',
  arrowUp: 'arrow-up',
  arrowDown: 'arrow-down',
  grid: 'layout-grid',
  edit: 'pencil',
  trash: 'trash-2',
  refresh: 'rotate-cw',
  ask: 'circle-question-mark',
  more: 'ellipsis',
  observe: 'activity',
  learning: 'lightbulb',
  skill: 'zap',
  /* The rail's places, named as the design system names them. `activity` is Lucide's own name
     and needs no entry. `slash` is the ask field's rounded square with a stroke through it. */
  today: 'calendar',
  work: 'square-check',
  projects: 'layout-grid',
  slash: 'square',
} as const satisfies Record<string, CoreGlyph>;

/** The plan's short names where Lucide's name is longer or different. */
export const SPELLINGS = {
  invoice: 'receipt-text',
  card: 'credit-card',
  message: 'message-square',
  help: 'circle-question-mark',
  alarm: 'alarm-clock',
  loader: 'loader-circle',
  unlock: 'lock-open',
  /* The Keychain's own name for the shield `vault` draws, kept beside it so an old mark still draws. */
  keychain: 'shield',
} as const satisfies Record<string, CoreGlyph | SetGlyph>;

/**
 * THE WORDS REAL RECORDS GIVE A ROW AS ITS MARK, where the set draws the thing under another name. Read
 * from the marks records hold (the owner's projects among them: `cake`, `shop`, `cube`, `site`, `chart`),
 * so a project shows its picture rather than a letter. A word with no fair picture in the set (`paw`,
 * `koala`, `sword`, `dice`) has no entry: the row shows the first letter of its own name instead, which
 * says more than a picture of something else.
 */
export const MARK_WORDS = {
  /* A cake is a celebration first; the set has no cake, and the wrapped gift is the nearest picture. */
  cake: 'gift',
  shop: 'store',
  cube: 'box',
  site: 'globe',
  website: 'globe',
  web: 'globe',
  chart: 'chart-column',
  graph: 'chart-line',
  cart: 'shopping-cart',
  bag: 'shopping-bag',
  food: 'utensils',
  idea: 'lightbulb',
  robot: 'bot',
  photo: 'image',
  film: 'video',
  app: 'smartphone',
  computer: 'laptop',
  chat: 'message-circle',
  email: 'mail',
  bank: 'landmark',
  school: 'graduation-cap',
  health: 'heart-pulse',
  plant: 'sprout',
  tree: 'tree-pine',
  train: 'train-front',
  office: 'building-2',
} as const satisfies Record<string, CoreGlyph | SetGlyph>;

export const ALIASES: Readonly<Record<string, CoreGlyph | SetGlyph>> = { ...SHELL, ...SPELLINGS, ...MARK_WORDS };

/**
 * The set's own name for `name`, or `name` unchanged. It does not say whether a glyph exists: an unknown
 * name draws nothing (05 §3 invariant 2), and that is the drawer's to decide, not this lookup's.
 *
 * `Object.hasOwn`, NOT `name in ALIASES`: a document is free text, and `constructor` or `toString` in
 * an `icon:` would otherwise come back as a function off the object's prototype.
 */
export function canonical(name: string): string {
  return Object.hasOwn(ALIASES, name) ? ALIASES[name]! : name;
}
