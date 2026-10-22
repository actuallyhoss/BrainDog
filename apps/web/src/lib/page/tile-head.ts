/**
 * A tile's heading row on the board: its icon, its name at 15 and 600, and how many it holds, the same
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

/**
 * WHAT A TILE'S WELL SAYS BY ITS COLOUR (one accent used): a question waiting on the person in the working
 * accent's tint, cash and what is earned in the earn green, and everything else the quiet grey. Late is not a kind, so
 * it is read off the block itself (`headTone`).
 */
const KIND_TONE: Readonly<Record<string, HeadTone>> = {
  queue: 'action',
  forecast: 'earn',
  bridge: 'earn',
};

/** The glyphs that are money on any kind: a figure of cash on a `stat` wears the earn green as a forecast does. */
const EARN_ICONS: ReadonlySet<string> = new Set(['money', 'wallet']);

/** The tones a heading's well takes, `IconWell`'s own; `undefined` is the quiet grey. */
export type HeadTone = 'action' | 'danger' | 'earn';

/** What a heading reads to choose its well's tone. */
export type Toned = {
  readonly kind: string;
  readonly icon?: string | undefined;
  /** The block's declared intent: `bad` is something that needs the person now. */
  readonly tone?: string | undefined;
  readonly where?: string | undefined;
  /** Set where the page drew the block as what is late (`home/home-rows.ts`). */
  readonly late?: boolean | undefined;
};

/**
 * A CLAUSE THAT KEEPS ONLY WHAT FELL DUE: `by before today`, `day before today`, `due before +1d` (what is due today at
 * the latest). A bound further out (`by before +8d`) is what is coming, and one further back (`as_of before -7d`) is
 * something else gone old, and neither is late.
 */
const LATE_CLAUSE = /^\s*([a-z][a-z0-9_]*)\s+before\s+(?:today|now|\+1d)\s*$/u;

/** A floor on the same day that starts at yesterday or later: `by after yesterday` keeps what is due today, not late. */
const FLOOR = /^\s*([a-z][a-z0-9_]*)\s+after\s+(?:yesterday|today|now|\+\d+d)\s*$/u;

/**
 * THE FIELDS THAT SAY WHEN SOMETHING HAPPENED, not when it falls due: `created before today` is everything older than
 * today, which is history, not lateness.
 */
const WHEN_HAPPENED: ReadonlySet<string> = new Set(['at', 'created', 'created_at', 'updated', 'updated_at', 'as_of', 'seen', 'since', 'started', 'last', 'paid_on', 'done_on', 'last_seen', 'left_at', 'ended', 'ended_at']);

function keepsLate(where: string | undefined): boolean {
  if (typeof where !== 'string') return false;
  const clauses = where.split(',');
  const floored = new Set(clauses.flatMap((c) => FLOOR.exec(c)?.[1] ?? []));
  return clauses.some((c) => {
    const field = LATE_CLAUSE.exec(c)?.[1];
    return field !== undefined && !WHEN_HAPPENED.has(field) && !floored.has(field);
  });
}

/**
 * The tone of a tile's well: late or declared bad in the danger tint, then its kind's, then a money glyph's, else none.
 * Red stays for what needs the person: only lateness and a `bad` intent reach it.
 */
export function headTone(b: Toned): HeadTone | undefined {
  if (b.late === true || b.tone === 'bad' || keepsLate(b.where)) return 'danger';
  const k = KIND_TONE[b.kind];
  if (k) return k;
  return b.icon !== undefined && EARN_ICONS.has(b.icon) ? 'earn' : undefined;
}

/** The glyph a tile's heading draws: its own where it names one the app draws, else its kind's, else a page's. */
export function headIcon(kind: string, own: string | undefined, drawable: (name: string) => boolean): string | null {
  if (own && drawable(own)) return own;
  const k = KIND_ICON[kind] ?? 'doc';
  return drawable(k) ? k : null;
}

/** The kinds whose tile is a list of things a person counts. Not cards, which are as often one project's own card. */
const COUNTED: ReadonlySet<string> = new Set(['queue', 'table', 'todo', 'board', 'timeline', 'roadmap', 'deadlines', 'comparison']);

/** Tiles counted by the key they are declared under: Today's People, cards that are a list of people (today F17). */
const COUNTED_KEYS: ReadonlySet<string> = new Set(['faces']);

/** What a tile's heading reads to count: its kind, how many it holds in all, and whether it could not be drawn. */
export type Countable = { readonly kind: string; readonly total: number; readonly refused?: boolean; readonly key?: string | undefined };

/** The count beside a tile's name, or `null` where the tile says no count: nothing held, or not a list. */
export function headCount(b: Countable): number | null {
  if (b.refused || !(COUNTED.has(b.kind) || (b.key !== undefined && COUNTED_KEYS.has(b.key)))) return null;
  return Number.isInteger(b.total) && b.total > 0 ? b.total : null;
}
