/**
 * What `cards` and `section` decide, as functions both drawers call.
 *
 * Kept out of the markup for the reason `board.ts` is: an answer here can be tested without a DOM,
 * and two drawers that each worked it out would be two answers.
 */

/** What a column IS on a card. Closed, because each one is drawn differently. */
export const CARD_ROLES = ['title', 'figure', 'fact', 'trend', 'ring', 'who', 'when', 'mark'] as const;

export type CardRole = (typeof CARD_ROLES)[number];

const isRole = (s: string): s is CardRole => (CARD_ROLES as readonly string[]).includes(s);

/** One figure and at most three facts, so a card stays a card rather than a form. */
const MOST: Record<CardRole, number> = { title: 1, figure: 1, fact: 3, trend: 1, ring: 1, who: 1, when: 1, mark: 1 };

/** A header cell is `role` or `role: label`. */
function headCell(cell: string): { word: string; label: string } {
  const at = cell.indexOf(':');
  return at < 0 ? { word: cell.trim(), label: '' } : { word: cell.slice(0, at).trim(), label: cell.slice(at + 1).trim() };
}

/**
 * What is wrong with a `cards` header row, in words, or null when nothing is.
 *
 * The parser degrades the block with this sentence, because the fence is the only feedback an
 * agent author gets and a card grid that quietly drops its fourth fact is a silent decision.
 */
export function cardFault(cells: readonly string[]): string | null {
  if (cells.length === 0) return 'no header row naming what each column is on a card';
  const seen = new Map<CardRole, number>();
  for (const cell of cells) {
    const { word } = headCell(cell);
    if (!isRole(word)) return `a column called "${word}", which is not one of ${CARD_ROLES.join(', ')}`;
    const n = (seen.get(word) ?? 0) + 1;
    if (n > MOST[word]) return word === 'fact' ? 'more than three facts' : `more than one ${word}`;
    seen.set(word, n);
  }
  return null;
}

/** Where each part of a card comes from, as column indexes. -1 is none. */
export type CardLayout = {
  labels: string[];
  mark: number;
  /** The card's heading: the title, or the person when the card has no title. */
  name: number;
  /** The name column is a person, so the card leads with a face rather than a mark. */
  nameIsWho: boolean;
  when: number;
  figure: number;
  trend: number;
  ring: number;
  facts: number[];
  /** A person under a titled card. -1 when the person is the card's name. */
  who: number;
};

/**
 * The header row, read leniently: a role it does not know is left out rather than thrown.
 *
 * Lenient because `Block` is a public type a host can build by hand, and a renderer that throws
 * takes the whole page with it. The strict reading is `cardFault`, which the parser applies.
 */
export function cardLayout(cells: readonly string[]): CardLayout {
  const read = cells.map(headCell);
  const first = (role: CardRole) => read.findIndex((c) => c.word === role);
  const title = first('title');
  const who = first('who');
  return {
    labels: read.map((c) => c.label),
    mark: first('mark'),
    name: title >= 0 ? title : who,
    nameIsWho: title < 0 && who >= 0,
    when: first('when'),
    figure: first('figure'),
    trend: first('trend'),
    ring: first('ring'),
    facts: read.flatMap((c, i) => (c.word === 'fact' ? [i] : [])).slice(0, MOST.fact),
    who: title >= 0 ? who : -1,
  };
}

/** Two decimals at most, and no trailing zeros, so a path stays short and exact. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * A run of numbers as a line in a `0 0 1000 100` box, or null when there are fewer than two.
 *
 * A TOKEN THAT IS NOT A NUMBER IS A GAP, NEVER A ZERO. The line lifts off at it and starts again
 * after it, because a dip to zero claims the value was zero (05 §7.4). `said` keeps what the author
 * wrote, so the accessible name reads the same numbers the shape was drawn from.
 */
export function trendOf(value: string): { d: string; end: string; said: string[] } | null {
  const tokens = value.trim().split(/[\s,;]+/u).filter(Boolean);
  const numbers = tokens.map((t) => {
    const n = Number(t.replace(/−/gu, '-'));
    return Number.isFinite(n) ? n : null;
  });
  const known = numbers.filter((n): n is number => n !== null);
  if (known.length < 2) return null;
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const last = tokens.length - 1;
  const x = (i: number) => (last === 0 ? 500 : (i / last) * 1000);
  /* Ten units of air at the top and the bottom, so the stroke is never clipped at the extremes.
     A flat run sits in the middle rather than on the floor, where it would read as zero. */
  const y = (n: number) => (hi === lo ? 50 : 90 - ((n - lo) / (hi - lo)) * 80);
  let d = '';
  let pen = false;
  let end = '';
  numbers.forEach((n, i) => {
    if (n === null) {
      pen = false;
      return;
    }
    const point = `${at(x(i))} ${at(y(n))}`;
    d += pen ? ` L${point}` : `${d ? ' ' : ''}M${point}`;
    pen = true;
    /* A zero-length segment with a round cap under a non-scaling stroke is a round dot on the last
       point, drawn with attributes alone: a `circle` would stretch with the box. */
    end = `M${point}h0`;
  });
  return { d, end, said: numbers.map((n, i) => (n === null ? 'no value' : tokens[i]!)) };
}

/**
 * How full a ring is, from `3/5` or `60%`, clamped to the ring. Null draws no ring and keeps the
 * words, because a value that is not a proportion has no arc to be (05 §7.4).
 */
export function ringOf(value: string): number | null {
  const t = value.trim().replace(/,/gu, '');
  const part = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/u.exec(t);
  const pct = /^(-?\d+(?:\.\d+)?)\s*%$/u.exec(t);
  const m = part ? Number(part[1]) / Number(part[2]) : pct ? Number(pct[1]) / 100 : Number.NaN;
  return Number.isFinite(m) ? Math.max(0, Math.min(1, m)) : null;
}

/** The ring's arc as a dash against a path length of 100, two decimals, so it is an attribute and never a style. */
export const ringDash = (m: number): string => `${at(m * 100)} 100`;

/**
 * The letter in a face, as `apps/web`'s `initialOf` draws it, or null for nobody.
 *
 * The article is not the name, and an email is a person nobody has named yet. Null rather than a
 * question mark, because a missing person is a gap on a card, not a stranger.
 */
export function initialOf(name: string): string | null {
  const bare = name.trim().replace(/^the\s+/iu, '');
  const first = [...(bare.split('@')[0] ?? '')][0];
  return first ? first.toUpperCase() : null;
}

/** A thing's mark: its first character, which for a project is the glyph it was given at create. */
export const markOf = (value: string): string | null => {
  const first = [...value.trim()][0];
  return first ? first.toUpperCase() : null;
};

/**
 * The renderer's own words. It cannot import `apps/web`'s `copy.ts`, because it imports nothing
 * (the `graph` gate), so the few sentences it draws live here, as `Grid.svelte`'s `NOT_SAVED` does.
 */
export const CARDS_NONE = 'Nothing to show.';
export const FOLD_SHOW = 'Show';
export const FOLD_HIDE = 'Hide';
export const TREND = 'Trend';

/** A section's count is shown only when it counts something: a zero says nothing a sentence below it does not. */
export const counted = (value: string): boolean => {
  const t = value.trim();
  return t !== '' && Number(t) !== 0;
};
