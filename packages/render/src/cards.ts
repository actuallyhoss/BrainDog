/**
 * What `cards` and `section` decide, as functions both drawers call.
 *
 * Kept out of the markup for the reason `board.ts` is: an answer here can be tested without a DOM,
 * and two drawers that each worked it out would be two answers.
 */

/**
 * What a column IS on a card. Closed, because each one is drawn differently.
 *
 * `quiet` is never printed: a card whose `quiet` cell says anything is drawn dimmed, as a run not
 * heard from lately is. The page's evaluator writes it from the record's clock, so a declaration
 * does not name it (`packages/kernel/src/declare.ts` keeps the roles a page may declare, which are
 * these less `quiet`).
 *
 * `next` is the first open step under the card, said "Next: ...", and `reply` a line written under
 * the title in a quieter voice, a second opinion under a note. Both are one cell a card, and both
 * draw nothing when the cell is empty: a group whose steps are all done has no next step, and a line
 * reading "Next:" and then nothing says there is one nobody wrote down.
 *
 * `hue` and `picture` are never printed either. `hue` is a whole number from 0 to 359, written on the
 * card as `--hue` and drawn by the host on the card's mark alone, as the one identity accent a project
 * or a person wears (`05 §5`); anything else in the cell is no hue. `picture` is a file the card leads
 * with, in the form a gallery tile names one (`gallery.ts`), drawn only where the host serves it.
 */
export const CARD_ROLES = ['title', 'figure', 'fact', 'trend', 'ring', 'who', 'when', 'mark', 'next', 'reply', 'hue', 'picture', 'quiet'] as const;

export type CardRole = (typeof CARD_ROLES)[number];

const isRole = (s: string): s is CardRole => (CARD_ROLES as readonly string[]).includes(s);

/** One figure and at most three facts, so a card stays a card rather than a form. */
const MOST: Record<CardRole, number> = { title: 1, figure: 1, fact: 3, trend: 1, ring: 1, who: 1, when: 1, mark: 1, next: 1, reply: 1, hue: 1, picture: 1, quiet: 1 };

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
  /** The column that dims a card when it says anything. */
  quiet: number;
  /** The first open step under the card, said as "Next: ...". */
  next: number;
  /** The line under the title, in a quieter voice. */
  reply: number;
  /** The card's identity hue, which the host draws its mark in. */
  hue: number;
  /** The file the card leads with. */
  picture: number;
};

/** Whether a card is dimmed: its `quiet` cell holds anything but space. */
export const isQuiet = (L: CardLayout, cells: readonly string[]): boolean => L.quiet >= 0 && (cells[L.quiet] ?? '').trim() !== '';

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
    quiet: first('quiet'),
    next: first('next'),
    reply: first('reply'),
    hue: first('hue'),
    picture: first('picture'),
  };
}

/**
 * A card's hue, from its `hue` cell: a whole number from 0 to 359, or null.
 *
 * DIGITS AND NOTHING ELSE, because the number is written into the card's `style` as `--hue` and read by the host
 * inside `oklch()`: a cell that could carry anything past the digits would be a value written into a style from a
 * record's text. A turn past 359 is refused rather than wrapped, as the kernel refuses it at write.
 */
export function hueOf(value: string): number | null {
  const t = value.trim();
  if (!/^\d{1,3}$/u.test(t)) return null;
  const n = Number(t);
  return n <= 359 ? n : null;
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
 * What a host says about the run a card is for, when the block's rows are runs (`sessions.live`): the run as it signs
 * (`S42`), the kind of agent, and where it is. Handed beside the block, one a row, as `opts.runs`.
 */
export type RunCell = { run: string; agent: string | null; live: 'working' | 'quiet' | 'stopped' };

/** A run's face as a card draws it: the run, its number, its hue, the glyph its kind wears, and where it is. */
export type RunFace = RunCell & { seq: number; hue: number; glyph: string };

/** A run as a `who` cell names one: `S` and its number. */
const RUN_CELL = /^S([1-9][0-9]*)$/u;

/**
 * The glyph each kind of agent wears, by the names the host's `icon` draws. `apps/web`'s `face.ts` keeps the same
 * table for `AgentFace`; it is written out here because this package imports nothing. `slash` is its own mark.
 */
const RUN_GLYPHS: Readonly<Record<string, string>> = { claude: 'bot', codex: 'code', cursor: 'keyboard', runner: 'play', slash: 'slash', other: 'session' };

/** The glyph for a kind of agent, said as its id, its signature or its name; anything else is `other`'s. */
export function runGlyphOf(agent: string | null): string {
  const said = (agent ?? '').trim().toLowerCase().replace(/^agent:/u, '');
  const kind = said.startsWith('runner:') ? 'runner' : said;
  return Object.hasOwn(RUN_GLYPHS, kind) ? (RUN_GLYPHS[kind] ?? 'session') : 'session';
}

/**
 * A run's face, or null where the card is not for a run.
 *
 * A RUN IS NAMED TWO WAYS. The host hands one a row for a block of runs (`sessions.live`), whose `who` cell says the
 * agent by name; and a `who` cell that is itself a run (`S42`) is one wherever it stands, though nothing then says
 * what kind of agent or whether it is still working, so it wears the plain glyph and a dashed ring only when the card
 * is dimmed as gone quiet.
 *
 * THE HUE IS THE RUN'S NUMBER in twelve steps of thirty degrees, not the agent's, so two Claude runs at once are two
 * colours (`runHue` in `apps/web`'s `face.ts`, the same sum).
 */
export function runFaceOf(cell: string, host: RunCell | null | undefined, quiet: boolean): RunFace | null {
  const said = cell.trim();
  const given = host ?? (RUN_CELL.test(said) ? { run: said, agent: null, live: quiet ? ('quiet' as const) : ('stopped' as const) } : null);
  const seq = given ? RUN_CELL.exec(given.run.trim())?.[1] : undefined;
  if (!given || seq === undefined) return null;
  const n = Number(seq);
  return { ...given, seq: n, hue: (n % 12) * 30, glyph: runGlyphOf(given.agent) };
}

/**
 * The renderer's own words. It cannot import `apps/web`'s `copy.ts`, because it imports nothing
 * (the `graph` gate), so the few sentences it draws live here, as `Grid.svelte`'s `NOT_SAVED` does.
 */
export const CARDS_NONE = 'Nothing to show.';
export const FOLD_SHOW = 'Show';
export const FOLD_HIDE = 'Hide';
export const TREND = 'Trend';
/** The word before a card's next step. */
export const CARDS_NEXT = 'Next';
/** A run's face is a door to the run, named by what it does since its ring is not read out. */
export const RUN_OPEN = 'Open this run';

/** A section's count is shown only when it counts something: a zero says nothing a sentence below it does not. */
export const counted = (value: string): boolean => {
  const t = value.trim();
  return t !== '' && Number(t) !== 0;
};
