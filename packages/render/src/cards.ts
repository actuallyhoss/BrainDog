/**
 * What `cards` and `section` decide, as functions both drawers call.
 *
 * Kept out of the markup for the reason `board.ts` is: an answer here can be tested without a DOM,
 * and two drawers that each worked it out would be two answers.
 */

import { canonical } from './glyphs/aliases.ts';
import { CONTROL_GLYPHS, GLYPH_NAMES, isMark } from './glyphs/names.ts';

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
 * The numbers of a run as written, one token each, a blank token a gap.
 *
 * A HOST WRITES A RUN MORE THAN ONE WAY, and a card's `trend` cell is filled by the record rather than typed: `18 20 - 24`
 * is the dialect's, `[18,null,24]` is an array said as JSON and `18,,24` the same array said by `String()`. Where there
 * are spaces or semicolons between the numbers, a comma inside one groups its thousands (`1,200 3,400`) and a comma after
 * one is the list's; where there are none, the commas are the list's, and two together are a gap and never a zero.
 */
export function runTokens(value: string): string[] {
  const run = value.trim().replace(/^\[(.*)\]$/su, '$1').trim();
  if (run === '') return [];
  if (/[\s;]/u.test(run))
    return run
      .split(/[\s;]+/u)
      .map((t) => t.replace(/,$/u, ''))
      .filter(Boolean);
  return run.split(',').map((t) => t.trim());
}

/**
 * A RUN WITHOUT ITS EMPTY ENDS, and how many readings each end lost: a run one reading a day to today whose first weeks
 * and last nights hold nothing drew its line from a third of the way in to well short of "Today" (live check of 30
 * October, 16). Trimmed, the line spans the frame and its days are those of its first and last readings.
 */
export function trendTrimmed(value: string): { value: string; lead: number; tail: number; length: number } {
  const tokens = runTokens(value);
  const known = (t: string): boolean => t !== '' && Number.isFinite(Number(t.replace(/−/gu, '-').replace(/,(?=\d{3}(?!\d))/gu, '')));
  const first = tokens.findIndex(known);
  if (first < 0) return { value, lead: 0, tail: 0, length: tokens.length };
  let last = tokens.length - 1;
  while (last > first && !known(tokens[last]!)) last--;
  return { value: tokens.slice(first, last + 1).join(', '), lead: first, tail: tokens.length - 1 - last, length: tokens.length };
}

/** What a gap in a run is called in the line's accessible name. */
const NO_VALUE = 'no value';

/**
 * A run of numbers as a line in a `0 0 1000 100` box, or null when there are fewer than two.
 *
 * A TOKEN THAT IS NOT A NUMBER IS A GAP, NEVER A ZERO. The line lifts off at it and starts again
 * after it, because a dip to zero claims the value was zero (05 §7.4). `said` keeps what the author
 * wrote, so the accessible name reads the same numbers the shape was drawn from.
 */
/**
 * WHAT A LINE SAYS TO A SCREEN READER. Eighty raw readings read out one by one is not a chart anybody can follow, and
 * it was what Money said. A short run is said whole; a long one is said as where it went: its two ends, its lowest and
 * highest, and how many readings there are. The readings themselves stay in the chart's own fold.
 */
export const TREND_WHOLE_AT = 8;
export function trendSaid(said: readonly string[]): string {
  if (said.length <= TREND_WHOLE_AT) return said.join(', ');
  const by = said.map((s) => ({ s, n: Number(s.replace(/[^\d.-]/gu, '')) })).filter((x) => Number.isFinite(x.n));
  if (by.length === 0) return said.join(', ');
  const low = by.reduce((a, b) => (b.n < a.n ? b : a));
  const high = by.reduce((a, b) => (b.n > a.n ? b : a));
  return `${said[0]} to ${said.at(-1)}, lowest ${low.s}, highest ${high.s}, ${said.length} readings`;
}

export function trendOf(value: string): { d: string; area: string; end: string; said: string[]; bars: string | null; zero: string | null; below: boolean } | null {
  const tokens = runTokens(value);
  const numbers = tokens.map((t) => {
    const n = t === '' ? Number.NaN : Number(t.replace(/−/gu, '-').replace(/,(?=\d{3}(?!\d))/gu, ''));
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
  /* THE SPACE UNDER THE LINE, one closed shape for each unbroken run, down to the floor at both of its ends: a sheet
     draws it as a pale wash so the line reads as a level and not a wire. A gap closes the shape before it. */
  let area = '';
  let first = '';
  let lastX = '';
  const close = () => {
    if (first !== '') area += ` L${lastX} 100 L${first} 100 Z`;
    first = '';
  };
  numbers.forEach((n, i) => {
    if (n === null) {
      close();
      pen = false;
      return;
    }
    const point = `${at(x(i))} ${at(y(n))}`;
    d += pen ? ` L${point}` : `${d ? ' ' : ''}M${point}`;
    area += pen ? ` L${point}` : `${area ? ' ' : ''}M${point}`;
    if (!pen) first = at(x(i));
    lastX = at(x(i));
    pen = true;
    /* A zero-length segment with a round cap under a non-scaling stroke is a round dot on the last
       point, drawn with attributes alone: a `circle` would stretch with the box. */
    end = `M${point}h0`;
  });
  /* A SHORT RUN OF COUNTS IS BARS: seven points or fewer, none under nothing, are a week of days, each a thing
     counted, and a line through them draws a slope between days that have none. One stroke a point, from the floor;
     a nought still shows as a stub, so a day with nothing is told from a day unknown. */
  const n = tokens.length;
  const bars =
    n <= 7 && lo >= 0
      ? numbers.flatMap((v, i) => (v === null ? [] : [`M${at(((i + 0.5) / n) * 1000)} 100V${at(hi === 0 ? 96 : 100 - Math.max(4, (v / hi) * 90))}`])).join(' ')
      : null;
  close();
  /* NOUGHT, WHERE THE LINE CROSSES IT (Look B: the zero rule solid): a walk that dips below nothing is read against
     where nothing is, and its lowest mark says so (`below`). */
  const zero = lo < 0 && hi > 0 ? `M0 ${at(y(0))}H1000` : null;
  return { d, area, end, said: numbers.map((n, i) => (n === null ? NO_VALUE : tokens[i]!)), bars, zero, below: lo < 0 };
}

const AHEAD = /^@(\d{4}-\d{2}-\d{2})\s+/u;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** What a stat cell says under a line ahead, at its left end: the line starts today. */
export const TREND_TODAY = 'Today';

/**
 * A RUN AHEAD: a trend cell that starts `@2026-10-27`, one point a day from that day, which is the cash walk from today
 * (the host's `cells[].ahead`). Drawn as the run is, and with three things a run behind does not need: a mark on today
 * at its start, a mark on its lowest point, and its two ends dated under it. `null` for a run behind, or one too short
 * to be a line.
 *
 * THE MARKS SIT ON THE LINE `trendOf` DRAWS, worked out by its own scale, so a dot is never off the stroke it names.
 */
export function trendAhead(value: string): { run: string; from: string; to: string; today: string; low: string; lowDay: string } | null {
  const m = AHEAD.exec(value.trim());
  if (!m) return null;
  const from = m[1]!;
  const start = Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(start)) return null;
  const run = value.trim().slice(m[0].length);
  if (trendOf(run) === null) return null;
  const tokens = runTokens(run);
  const numbers = tokens.map((t) => {
    const n = t === '' ? Number.NaN : Number(t.replace(/−/gu, '-').replace(/,(?=\d{3}(?!\d))/gu, ''));
    return Number.isFinite(n) ? n : null;
  });
  const known = numbers.filter((n): n is number => n !== null);
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const last = tokens.length - 1;
  const x = (i: number) => (last === 0 ? 500 : (i / last) * 1000);
  const y = (n: number) => (hi === lo ? 50 : 90 - ((n - lo) / (hi - lo)) * 80);
  const dot = (i: number): string => `M${at(x(i))} ${at(y(numbers[i]!))}h0`;
  const first = numbers.findIndex((n) => n !== null);
  const lowest = numbers.findIndex((n) => n === lo);
  const said = (i: number): string => {
    const d = new Date(start + i * 86_400_000);
    return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
  };
  return { run, from, to: said(last), today: dot(first), low: dot(lowest), lowDay: said(lowest) };
}

/**
 * A card's trend, or `null` when it is not drawn.
 *
 * A LINE WITH NO NAME AND NO NUMBER IS NOT A CHART. Projects drew one card in eleven with a bare red stroke: no word
 * for what it counted, no figure, nothing to read it against. So a card's trend is drawn only when its column has a
 * name (`trend: Done per week`) and more than one of its points is above or below nought;
 * a run of noughts with one count in it is a single fact, and a figure says a single fact better. When it is drawn
 * it carries `last`, the newest value as its cell wrote it, and both drawers print that and the name beside the line.
 *
 * AND IT HAS THREE KNOWN POINTS (`TREND_POINTS`): two are a slope between two facts, which the card's figure says
 * better, so a card with fewer keeps its figure alone. A gap is not a point.
 */
export const TREND_POINTS = 3;

export function cardTrend(value: string, label: string): (NonNullable<ReturnType<typeof trendOf>> & { last: string; label: string }) | null {
  const name = label.trim();
  if (!name) return null;
  const t = trendOf(value);
  if (!t) return null;
  const known = t.said.filter((s) => s !== NO_VALUE);
  if (known.length < TREND_POINTS) return null;
  if (known.filter((s) => Number(s.replace(/−/gu, '-').replace(/,/gu, '')) !== 0).length < 2) return null;
  return { ...t, last: known[known.length - 1]!, label: name };
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

/**
 * A row's mark, the one both drawers and the app's `IdentityMark` draw: the glyph the value names, when it
 * names one that may be a mark (`isMark`), and otherwise a letter. The answer is the glyph's own name, which
 * `markGlyphOf` tells from a letter, or one letter, or null for none.
 *
 * NEVER A LETTER OF A GLYPH'S NAME. A value written the way icons are named (`cake`, `paw`, `close`) is a
 * picture's name, drawn or not, and its first letter says nothing about the row: Oxbow.gg was drawn "C". Such a
 * value, and a control the frame uses (`close`, `pencil`), and a bare shape (`●`), all give way to the first
 * letter of the row's `title`, or to nothing when no title is handed. A value written as a name (`Kiln`) is a
 * name, and its own first letter is the mark, which is what the one-argument call always answered.
 */
export function markOf(value: string, title?: string): string | null {
  const trimmed = value.trim();
  /* `Cake` and `Close` are the picture's name with a capital, as the kernel reads them, and never a "C". `Kiln` names no picture. */
  const v =
    [trimmed.slice(0, 1).toLowerCase() + trimmed.slice(1), trimmed.toLowerCase()].find(
      (c) => c !== trimmed && ICON_WORD.test(c) && (GLYPH_NAMES.has(c) || canonical(c) !== c),
    ) ?? trimmed;
  const named = (): string | null => (title === undefined ? null : initialOf(title));
  if (!v || CONTROL_GLYPHS.has(v) || CONTROL_GLYPHS.has(canonical(v))) return named();
  if (ICON_WORD.test(v)) {
    const glyph = GLYPH_NAMES.has(v) ? v : GLYPH_NAMES.has(canonical(v)) ? canonical(v) : null;
    return glyph !== null && isMark(glyph) ? glyph : named();
  }
  const first = [...v][0]!;
  if (/[\p{L}\p{N}]/u.test(first)) return first.toUpperCase();
  /* A picture somebody typed (an emoji) is a mark of its own; a bare shape (`●`, the four the marks once were) is not. */
  if (/\p{Extended_Pictographic}/u.test(first)) return firstGrapheme(v);
  return named() ?? first;
}

/**
 * How a mark is written when it is a picture's name: `cake`, `chevronDown`, `trash-2`. A name like `Kiln` is not,
 * and neither is one letter (`k`), which is a letter somebody chose.
 */
const ICON_WORD = /^[a-z][a-zA-Z0-9]+(?:-[a-z0-9]+)*$/u;

/** The first thing a reader sees as one character, so a joined emoji (a person at a laptop) is not cut in two. */
const firstGrapheme = (v: string): string => {
  const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter().segment(v)[Symbol.iterator]().next().value : undefined;
  return seg?.segment ?? [...v][0]!;
};

/** The glyph a mark from `markOf` draws, or null when the mark is a letter. Every glyph name is longer than one letter. */
export const markGlyphOf = (mark: string | null): string | null =>
  mark !== null && mark.length > 1 && GLYPH_NAMES.has(mark) ? mark : null;

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
 * The mark a run's face wears: its maker's, where the host draws one for the run's agent (`RenderOptions.agentMark`),
 * else `null` and the face keeps its kind's glyph. A run of Claude's wore a robot and a run of Codex's a pair of
 * brackets, beside the same agents' real marks in the feed under them.
 */
export const runMarkOf = (f: RunFace, agentMark: ((name: string) => AgentMark | null) | undefined): AgentMark | null => {
  const agent = (f.agent ?? '').trim();
  return agent && agentMark ? agentMark(agent) : null;
};

/**
 * How many helpers a run has working with it, as the host hands them beside a block of runs (`sessions.working`), one
 * a row as `opts.runs` is: a count, or the helpers themselves, whose length is the count.
 */
export type Helpers = number | readonly unknown[] | null | undefined;

/**
 * A run's helpers as its card says them, "1 helper" or "9 helpers", or null for none or none said.
 *
 * A RUN THAT STARTED NINE HELPERS READ AS ONE QUIET CARD: the read folds each run's helpers under it, so the
 * Agents page counted one agent at work and nothing on the card said how much was running under it. The line sits
 * under the card's sentence in the reply's quieter voice, and a run with no helpers draws nothing, as an empty reply
 * draws nothing.
 */
export function helpersSaid(helpers: Helpers): string | null {
  const n = Array.isArray(helpers) ? helpers.length : typeof helpers === 'number' && Number.isFinite(helpers) ? Math.floor(helpers) : 0;
  return n > 0 ? `${n} ${n === 1 ? CARDS_HELPER : CARDS_HELPERS}` : null;
}

/** The helpers line for card `n`, from what the host handed beside the block, or null. */
export const helpersOf = (helpers: readonly Helpers[] | undefined, n: number): string | null => helpersSaid(helpers?.[n]);

/**
 * Whether a card is drawn dimmed: its `quiet` cell says so, and it is not a run the host handed. A RUN'S FACE ALREADY
 * SAYS IT, with a dashed ring once it has gone quiet, and a run that has stopped sits under Today or Earlier, which say
 * when. Dimmed as well, a stopped run's card was grey words on a grey face, which nobody could read.
 */
export const isDimmed = (L: CardLayout, cells: readonly string[], host: RunCell | null | undefined): boolean => isQuiet(L, cells) && !host;

/**
 * How many cards the grid holds, as the `data-cards` word the host's stylesheet caps its columns at: `1`, `2`, `3`, or
 * `many` from `CARDS_WIDE` up, where as many columns as fit are already no more than there are cards.
 *
 * THE GRID TAKES AS MANY COLUMNS AS FIT, AND NEVER MORE THAN THERE ARE CARDS, `min(count, columns)`. Projects' three
 * cards in play sat in four columns with a hole where the fourth would go (visual review 3); with the count on the grid
 * the stylesheet sizes each track to at least its share of the row, so three cards fill it. An attribute and not a
 * custom property, because a page kind places every mark by an attribute and adds no inline style.
 */
export const CARDS_WIDE = 4;
export const cardsCount = (n: number): string => (n >= CARDS_WIDE ? 'many' : String(Math.max(1, Math.floor(n))));

/**
 * The renderer's own words. It cannot import `apps/web`'s `copy.ts`, because it imports nothing
 * (the `graph` gate), so the few sentences it draws live here, as `Grid.svelte`'s `NOT_SAVED` does.
 */
export const CARDS_NONE = 'Nothing to show.';
export const FOLD_SHOW = 'Show';
export const FOLD_HIDE = 'Hide';
export const TREND = 'Trend';
/**
 * WHAT A FIGURE'S LINE SAYS BEFORE IT HAS TWO NIGHTS (audit of 30 October, 21): a figure's past is kept each night, so
 * a new one asked for its last twelve weeks drew its number over an empty chart. It says when the line starts instead.
 */
export const TREND_WAIT = 'The line fills in from tonight.';
/** The word before a card's next step. */
export const CARDS_NEXT = 'Next';
/** The words after a run's count of helpers, one and many. */
export const CARDS_HELPER = 'helper';
export const CARDS_HELPERS = 'helpers';
/** A run's face is a door to the run, named by what it does since its ring is not read out. */
export const RUN_OPEN = 'Open this run';

/**
 * The mark an agent wears, as the host draws it: one path on a 24 grid, its fill rule, and its maker's tone, `ink` for a
 * mark its maker draws in black or white and a word such as `claude` for one drawn in its maker's colour.
 *
 * AGENTS WEAR THEIR MAKERS' REAL MARKS, and this package ships no art (05 §3, invariant 2), so the host
 * answers `RenderOptions.agentMark` from its own drawings for the name a cell gives (`Claude`, `Cursor`). A card's who
 * and a feed line's actor were a grey disc with a letter in it, `C`, which says neither the agent nor anything else.
 */
export type AgentMark = { d: string; rule: 'evenodd' | 'nonzero'; tone: string };

/**
 * The paint a mark's tone is drawn in, as an inline style, or `null` for the ink of whatever holds it: a maker's colour
 * is the host's custom property of the same name (`--agent-claude`), and a tone that is not one plain word is ink. A host with no such property draws the mark in
 * ink too, where a bare `var()` left it black on a dark page.
 */
export const agentMarkFill = (tone: string): string | null => (tone !== 'ink' && /^[a-z]+$/u.test(tone) ? `fill:var(--agent-${tone}, currentColor)` : null);

/** A section's count is shown only when it counts something: a zero says nothing a sentence below it does not. */
export const counted = (value: string): boolean => {
  const t = value.trim();
  return t !== '' && Number(t) !== 0;
};
