/**
 * A tile's heading row on the board (DIRECTION §39): its icon, its name at 15 and 600, and how many it holds, the same
 * on every tile. A block that names its own glyph keeps it; one that names none takes its kind's, so a page is not half
 * tiles with a glyph and half without. A count is said only where the tile is a list of things a person counts (the
 * questions, the tasks, the rows), never on a figure, a chart or a sentence, where the number is the tile itself.
 *
 * PURE, AND NODE LOADS IT, so `tile-head.test.ts` holds the rule without a component. The glyph is a name; the slot
 * draws it only where the app has a drawing for it (`isGlyph`).
 */

/** Each kind's glyph, for a tile that names none: what the tile holds, not how it is drawn. */
const KIND_ICON: Readonly<Record<string, string>> = {
  queue: 'ask',
  table: 'rows',
  comparison: 'rows',
  tree: 'rows',
  todo: 'task',
  steps: 'task',
  progress: 'task',
  cards: 'grid',
  board: 'board',
  roadmap: 'calendar',
  timeline: 'calendar',
  plan: 'calendar',
  deadlines: 'calendar',
  calendar: 'calendar',
  heat: 'calendar',
  feed: 'activity',
  agents: 'session',
  stat: 'grid',
  gauge: 'grid',
  ring: 'grid',
  chips: 'grid',
  spec: 'rows',
  params: 'settings',
  inputs: 'edit',
  bar: 'activity',
  series: 'activity',
  lines: 'activity',
  sparkline: 'activity',
  split: 'activity',
  forecast: 'money',
  bridge: 'money',
  diff: 'history',
  note: 'doc',
  quote: 'doc',
  code: 'code',
};

/** The glyph a tile's heading draws: its own where it names one the app draws, else its kind's, else a page's. */
export function headIcon(kind: string, own: string | undefined, drawable: (name: string) => boolean): string | null {
  if (own && drawable(own)) return own;
  const k = KIND_ICON[kind] ?? 'doc';
  return drawable(k) ? k : null;
}

/** The kinds whose tile is a list of things a person counts. Not cards, which are as often one project's own card. */
const COUNTED: ReadonlySet<string> = new Set(['queue', 'table', 'todo', 'board', 'timeline', 'roadmap', 'deadlines', 'comparison']);

/** What a tile's heading reads to count: its kind, how many it holds in all, and whether it could not be drawn. */
export type Countable = { readonly kind: string; readonly total: number; readonly refused?: boolean };

/** The count beside a tile's name, or `null` where the tile says no count: nothing held, or not a list. */
export function headCount(b: Countable): number | null {
  if (b.refused || !COUNTED.has(b.kind)) return null;
  return Number.isInteger(b.total) && b.total > 0 ? b.total : null;
}
