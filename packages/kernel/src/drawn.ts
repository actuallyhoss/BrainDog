/**
 * WHETHER EACH BLOCK OF A PAGE IS DRAWN, FOR EVERY READER: the screen, an agent reading the page, a shared page and an
 * export. An empty or unused part is not drawn, and an empty page says so in one line, never one a tile.
 *
 * MOVED FROM THE BROWSER (`apps/web/src/lib/page/home.ts`). The rule was the screen's alone, so an agent reading
 * `/p/quietcart` through the record saw "Where it stands" over a dash and chips that were a name and a dash, blocks the app
 * hid. The record's answer now says it: each block it leaves out is `drawn: false` with `why`, and a host draws what
 * the record drew (`markDrawn`, around the assembled blocks in `pages.ts`).
 *
 * ONE RULE OVER TWO SHAPES. The record's block (`pages.ts` `BlockResult`: `matched` a count, `readings` a figure each)
 * and the app's (`LiveBlock`: `matched` the rows, `metrics` a tile each, `parts`, and `cannot` for a block that build
 * cannot draw) are read through `Drawable`, which names only what the rule asks and narrows each key where it reads
 * it, so the app calls the same functions over what it holds.
 *
 * PURE: no clock, no record, no I/O.
 */

import { isRegisteredKind } from './kinds/keys.ts';

/**
 * Why a block is not drawn: it holds nothing (`empty`), what it reads no row has said (`unsaid`), its `when:` said no
 * (`when`), the reader cannot draw it (`cannot`), the reader's level does not reach what the block writes (`level`), or
 * the record refused it to a reader who does not hold the whole record, who is not drawn a tile saying so (`held`, the
 * app's `page/held.ts`).
 */
export type Why = 'empty' | 'unsaid' | 'when' | 'cannot' | 'level' | 'held';
export const WHY: readonly Why[] = ['empty', 'unsaid', 'when', 'cannot', 'level', 'held'];

/** The `empty:` an author writes for a block that keeps its nought: a ledger wants its zeros. */
export const KEEP = 'keep';

/**
 * WHAT THE RULE READS OF A BLOCK, in either shape. Every key but the four it cannot do without is `unknown` and narrowed
 * where it is read, so the record's block and the app's both fit without a cast.
 */
export type Drawable = {
  kind: string;
  drawn?: boolean | undefined;
  why?: Why | undefined;
  refusals: readonly unknown[];
  rows: readonly unknown[];
  empty?: unknown;
  body?: unknown;
  cannot?: unknown;
  answer?: unknown;
  entries?: unknown;
  /** The cells a block's author wrote out in the page itself, `[{ cells: ['Done', '3', '5'] }]`, which it is drawn from. */
  authored?: unknown;
  matched?: unknown;
  total?: unknown;
  metrics?: unknown;
  readings?: unknown;
  parts?: unknown;
  source?: unknown;
  cells?: unknown;
  columns?: unknown;
  range?: unknown;
  measures?: unknown;
  latest?: unknown;
  readOnce?: unknown;
  queue?: unknown;
  feed?: unknown;
  actions?: unknown;
  history?: unknown;
  walks?: unknown;
  walk?: unknown;
  bars?: unknown;
  /** A `kpis` block's key numbers (`sources/kpis.ts`), which it is drawn from and not from rows. */
  kpis?: unknown;
  area?: unknown;
  panel?: unknown;
  box?: unknown;
  /** The glyph a block names for its tile's heading, which a box's own glyph may echo (`unechoed`). */
  icon?: unknown;
  /** How a stat is drawn; `lead` is a page's hero, whose noughts answer the page (`noughtOverNone`). */
  form?: unknown;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null;
const list = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);
const none = (v: unknown): boolean => v === null || v === undefined || (Array.isArray(v) && v.length === 0);

/** Drawn unless something said it is not: the record's block leaves `drawn` out where no `when:` was asked. */
const on = (b: Drawable): boolean => b.drawn !== false;

/**
 * THE KINDS WHOSE EMPTINESS IS THE POINT, never hidden: a sentence, a heading, a field to type into, and the kinds whose
 * rows are written on the declaration rather than read from a list. A capture with nothing under it is the way to add
 * the first thing; a path with no steps is where the first step is added.
 */
const KEPT = new Set(['note', 'section', 'capture', 'inputs', 'steps', 'quote', 'code', 'tree', 'embed', 'link', 'gallery']);

/** The kinds that frame a page rather than say anything on it: a heading over blocks, and a field to type into. */
const FRAME = new Set(['section', 'capture', 'inputs']);

/** Whether the author asked for the block's nought (`empty: keep`): it is never left out for holding nothing. */
export const keeps = (b: Drawable): boolean => b.empty === KEEP;

/** A block the record refused, or the reader cannot draw: it draws its own sentence and is never called empty. */
export const says = (b: Drawable): boolean => b.refusals.length > 0 || b.cannot !== undefined;

/**
 * A BLOCK A REGISTERED KIND DRAWS (`kinds/keys.ts`) is never judged here, because only its own module can read what it
 * holds. The app marks one by the `answer` it keeps whole.
 */
const registered = (b: Drawable): boolean => b.answer !== undefined || isRegisteredKind(b.kind);

/** Whether the author wrote what the block says when it holds nothing. A blank sentence, and `keep`, say nothing. */
const saysEmpty = (b: Drawable): boolean => typeof b.empty === 'string' && b.empty.trim() !== '' && b.empty !== KEEP;

/** A value somebody wrote: not nothing, not an empty string and not an empty list. Nought is a value. */
const isSet = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);

/** A series whose every bucket is a gap holds nothing: the record trims the run to where a value starts, and none did. */
const barsNone = (b: Drawable): boolean => b.bars == null || (isObj(b.bars) && list(b.bars.values).every((line) => list(line).every((v) => v === null)));

/** How many rows the block matched: the app's rows, or the record's count. */
const matchedCount = (b: Drawable): number => (Array.isArray(b.matched) ? b.matched.length : typeof b.matched === 'number' ? b.matched : 0);

/**
 * The rows a chart is asked about: every row the app was handed, or the rows the record answered, cut to `limit`. The
 * record's cut is the one place the two can differ, and only on a block longer than its limit.
 */
const matchedRows = (b: Drawable): readonly unknown[] => (Array.isArray(b.matched) ? b.matched : b.rows);
const fieldsOf = (row: unknown): Obj => (isObj(row) && isObj(row.fields) ? row.fields : {});

/**
 * A FIGURE'S PARTS, where the block draws one figure split by a word: the app's `parts`, or the record's one reading of
 * a `metric.` source with no `cells:`. A stat over a figure is its tiles and never its parts, as the app reads it.
 */
function partsOf(b: Drawable): { groups: readonly unknown[]; value: unknown } | null {
  if (isObj(b.parts)) return Array.isArray(b.parts.groups) ? { groups: b.parts.groups, value: b.parts.value } : null;
  if (b.kind === 'stat' || b.cells !== undefined || typeof b.source !== 'string' || !b.source.startsWith('metric.')) return null;
  const cell = list(b.readings)[0];
  const reading = isObj(cell) ? cell.reading : null;
  return isObj(reading) ? { groups: list(reading.groups), value: reading.value } : null;
}

/** A block's figures, one a tile: the app's `metrics`, or the record's `readings` where they are not one figure's parts. */
const figuresOf = (b: Drawable): readonly unknown[] => (Array.isArray(b.metrics) ? b.metrics : partsOf(b) ? [] : list(b.readings));

/** Whether a figure adds up a field no row has filled in: the app's tile says so, and so may the record's reading. */
const unsaidFigure = (f: unknown): boolean => isObj(f) && (f.unsaid === true || (isObj(f.reading) && f.reading.unsaid === true));

/**
 * MONEY THAT ADDED UP NO ROW AND CAME TO NOUGHT (leftovers9, Sam 2 Nov: "remove any $0 cards"): a project's "Revenue $0"
 * or Today's "Owed to you $0" over a list that holds rows, none of them this figure's. The app's tile says so
 * (`noughtOverNone`), and so does the record's reading by its rows, its value and a currency for its unit. Money that
 * read rows and came to nought, a budget with nothing left, is an answer and is kept, and so is a page's hero (`form:
 * lead`), where "In $0" this month is what Money says.
 */
const noughtOverNone = (f: Obj): boolean =>
  f.noughtOverNone === true ||
  (isObj(f.reading) && f.reading.beyond === undefined && f.reading.rows === 0 && f.reading.value === 0 && typeof f.reading.unit === 'string' && /^[A-Z]{3}$/u.test(f.reading.unit));

/**
 * A FIGURE THAT SAYS NOTHING ON A PAGE BEING READ: one that adds up a field no row has filled in (`unsaidFigure`), and
 * one over a list that holds no row at all, whose zero the record calls not news (the app's `nothingHeld`, the record's
 * `held: 0`). A figure the record refused says why, and is never idle.
 */
function idle(f: unknown, alone = false, hero = false): boolean {
  if (!isObj(f) || f.refusal !== undefined) return false;
  if (unsaidFigure(f) || f.nothingHeld === true || (!hero && noughtOverNone(f))) return true;
  if (!isObj(f.reading) || f.reading.held !== 0) return false;
  /* A WALK THAT NEVER WENT UNDER says so by `beyond` ('Lasts past ...'), which is the whole of a tile drawn alone; in a
     row of several figures over nothing held it is an empty part, and the row of noughts beside it is not drawn for it. */
  if (f.reading.beyond !== undefined && alone) return false;
  return !(typeof f.reading.value === 'number' && f.reading.value !== 0);
}

/**
 * THE BLOCK WITH ITS IDLE FIGURES TAKEN FROM ITS ROW, and the figures beside them kept. A row of nothing but such figures
 * keeps none, and says its `empty:` line in their place. `empty: keep` keeps every one: a ledger wants its zeros.
 */
function told<B extends Drawable>(b: B): B {
  if (keeps(b)) return b;
  const hero = b.form === 'lead';
  if (Array.isArray(b.metrics)) {
    const alone = b.metrics.length === 1;
    return b.metrics.some((f) => idle(f, alone, hero)) ? ({ ...b, metrics: b.metrics.filter((f) => !idle(f, alone, hero)) } as B) : b;
  }
  if (Array.isArray(b.readings) && !partsOf(b)) {
    const alone = b.readings.length === 1;
    if (b.readings.some((f) => idle(f, alone, hero))) return { ...b, readings: b.readings.filter((f) => !idle(f, alone, hero)) } as B;
  }
  return b;
}

/**
 * Whether a block answered nothing at all: no row, figure, question, line of the feed, step of a walk or version.
 *
 * EVERY SHAPE AN ANSWER COMES IN IS ASKED, because a kind holds what it holds in its own field: a stat its figures, a
 * queue its `queue`, a forecast its `walk`. A block a registered kind draws is never called empty here.
 */
export function holdsNothing(b: Drawable): boolean {
  if (registered(b)) return false;
  /* A BLOCK WITH NO SOURCE IS DRAWN FROM ITS DECLARATION (its `body`), so it holds what its author wrote. */
  if (typeof b.body === 'string' && b.body.trim() !== '') return false;
  const parts = partsOf(b);
  return (
    b.rows.length === 0 &&
    none(b.entries) &&
    /* WRITTEN OUT IN THE PAGE, a ring of three numbers holds them: answered empty, Layout's ring never showed. */
    none(b.authored) &&
    matchedCount(b) === 0 &&
    (typeof b.total !== 'number' || b.total === 0) &&
    figuresOf(b).every((f, _, all) => idle(f, all.length === 1, b.form === 'lead')) &&
    none(b.measures) &&
    none(b.latest) &&
    none(b.readOnce) &&
    none(b.queue) &&
    none(b.feed) &&
    none(b.actions) &&
    none(b.history) &&
    none(b.walks) &&
    /* KEY NUMBERS ARE WHAT A `kpis` BLOCK HOLDS: a client that keeps its own count of rows read it as holding nothing. */
    none(b.kpis) &&
    b.walk == null &&
    barsNone(b) &&
    /* A FIGURE THAT READ NO ROW, no part and no whole, holds nothing as a list of none does. */
    (parts === null || (parts.groups.length === 0 && !parts.value))
  );
}

/**
 * Whether a block has nothing to draw but its `empty:` line: it holds nothing, is not a kind whose emptiness is the
 * point, and its author did not ask for its nought.
 */
export const bare = (b: Drawable): boolean => !says(b) && !KEPT.has(b.kind) && !keeps(b) && holdsNothing(b);

/**
 * THE COLUMNS A CHART IS MADE OF, by place: a bar and a split name each part by the first and add up the second, chips
 * count by the first, and a gauge and a progress fill by the second. A list draws its rows' names whatever else is
 * empty, so a list is never one of these.
 */
const PICTURED: Readonly<Record<string, readonly number[]>> = { bar: [0, 1], split: [0, 1], chips: [0], gauge: [1], progress: [1] };

/**
 * A RANGE IS MADE OF ITS BANDS, the low and the high (`range: true`, `label | spent | low | high`). What was spent is a
 * mark on a band that may not be there yet, so a range nothing is spent on is still every band it was given.
 */
const BANDS: readonly number[] = [2, 3];

const columnField = (b: Drawable, n: number): string | null => {
  const c = list(b.columns)[n];
  return isObj(c) && typeof c.field === 'string' && c.field !== '' ? c.field : null;
};

/**
 * THE COLUMNS OF A CARD THAT DRAW NOTHING OF THEIR OWN: `hue` tints the card and `quiet` dims it (`packages/render`
 * `cards.ts`), so a row that holds only these still draws a card that says nothing.
 */
const UNDRAWN = new Set(['hue', 'quiet']);

/** The fields a cards block draws: every column that names one, but those that only colour or dim the card. */
function cardFields(b: Drawable): string[] {
  return list(b.columns).flatMap((c, n) => {
    const field = isObj(c) && !(typeof c.as === 'string' && UNDRAWN.has(c.as)) ? columnField(b, n) : null;
    return field === null ? [] : [field];
  });
}

/**
 * What a row holds under a column's name: its field, or what the record stamps on the row itself (`updated_at`), which
 * a column may name as well and which is never among the fields.
 */
const held = (row: unknown, field: string): unknown => {
  const fields = fieldsOf(row);
  return Object.hasOwn(fields, field) ? fields[field] : isObj(row) && field !== 'fields' && Object.hasOwn(row, field) ? row[field] : undefined;
};

/**
 * WHETHER EVERY CARD OF A CARDS BLOCK SAYS NOTHING: it read rows, and not one of them holds a value in any column the
 * block draws, so each card is a dash under the block's heading. ONE VALUE ON ONE ROW KEEPS THE BLOCK AND EVERY CARD IN
 * IT, so a card with a name is never left out: a service imported with no cost is still what the project runs on.
 *
 * NOT WHAT TOOK THE DASH OFF "WHERE IT STANDS". That block is titled by the health and draws only
 * while its `when:` counts one of its four fields said, so on a project nobody had described it is already out with
 * `why: 'when'`, and when it is drawn a card says something and this answers no. This catches the cards block that
 * carries no such gate. The tile left standing over nothing on that page was the boxed section under it (`panelHeld`).
 */
function cardsUnsaid(b: Drawable): boolean {
  const rows = matchedRows(b);
  const fields = cardFields(b);
  return rows.length > 0 && fields.length > 0 && !rows.some((r) => fields.some((f) => isSet(held(r, f))));
}

/**
 * WHETHER A `spec` SAYS NOTHING: it read rows, and not one holds a value in the column that is its value (the second),
 * so every row is a name over a dash and the renderer draws no row of it (`unvalued`, `drawnRows`).
 */
function valuesUnsaid(b: Drawable): boolean {
  const rows = matchedRows(b);
  const field = columnField(b, 1);
  /* ONLY A LIST'S ROWS: a spec over deadlines or another computed source takes its cells from the read, not from fields. */
  if (typeof b.source !== 'string' || !b.source.startsWith('register.')) return false;
  return rows.length > 0 && field !== null && !rows.some((r) => isSet(held(r, field)) && String(held(r, field)).trim() !== '');
}

/**
 * WHETHER A BLOCK READS WHAT NO ROW HAS SAID: a chart over rows of which not one holds a column the chart is made of, a
 * figure's parts when no row the figure read sits in any part, a row of figures every one of which adds up a field
 * nobody filled in, or cards of which not one says anything (`cardsUnsaid`). Each draws only that a field is empty on
 * every row: "How they are going" was one grey track of eleven over "Not said yet" on the founder's Projects
 *.
 *
 * A COLUMN THAT NAMES NO FIELD IS NOT ASKED ABOUT, and a block the record refused, a registered kind's, or one whose
 * author keeps its nought, is not this rule's to judge.
 */
export function unsaid(b: Drawable): boolean {
  if (says(b) || registered(b) || keeps(b)) return false;
  const parts = partsOf(b);
  if (parts) {
    /* ROWS READ AND NONE IN A PART: a whole and no group. A figure that read no row at all holds nothing (`holdsNothing`),
       and keeps its empty line where it leads the page. */
    if (parts.groups.length === 0) return typeof parts.value === 'number' && parts.value !== 0;
    return parts.groups.every((g) => isObj(g) && g.value === null && none(g.parts));
  }
  const figures = figuresOf(b);
  if (figures.length > 0) return figures.every(unsaidFigure);
  if (b.kind === 'cards') return cardsUnsaid(b);
  if (b.kind === 'spec' || b.kind === 'params') return valuesUnsaid(b);
  const at = b.kind === 'progress' && b.range === true ? BANDS : PICTURED[b.kind];
  const rows = matchedRows(b);
  if (!at || rows.length === 0) return false;
  return at.some((n) => {
    const field = columnField(b, n);
    return field !== null && !rows.some((r) => isSet(fieldsOf(r)[field]));
  });
}

/**
 * WHY A PAGE BEING READ LEAVES A BLOCK OUT WHEREVER IT STANDS, or `null`: the reader cannot draw it, or what it reads no
 * row has said. A BLOCK THE READER CANNOT DRAW IS NOT THE READER'S TO FIX: "This part of the page cannot be drawn from
 * the record yet" told a person about a build, not their record. A block the record REFUSED is still drawn, because its
 * sentence names the fix in the declaration and somebody has to see it.
 */
function goneWhy(b: Drawable): Why | null {
  if (b.cannot !== undefined && b.refusals.length === 0) return 'cannot';
  return unsaid(b) ? 'unsaid' : null;
}

/** Whether a page being read leaves a block out wherever it stands (`goneWhy`). */
export const gone = (b: Drawable): boolean => goneWhy(b) !== null;

/**
 * THE PAGE'S LEAD, WHICH IS THE ONE BLOCK THAT MAY SAY IT IS EMPTY: the first drawn block that says anything, a heading
 * and a field to type into aside, whether that is what it holds or the `empty:` line its author wrote. `-1` when no
 * block says anything.
 *
 * ONE EMPTY LINE A PAGE, NEVER ONE A TILE. Every block on Work carries an `empty:`, so a list with
 * nothing in it drew eight to twelve tiles each saying it held nothing. A page whose lead holds something draws no empty
 * line at all; a page whose lead holds nothing draws that one, and nothing else that is empty.
 */
export function leadOf(blocks: readonly Drawable[]): number {
  return blocks.findIndex((b) => on(b) && !FRAME.has(b.kind) && !gone(b) && (!bare(b) || saysEmpty(b)));
}

/**
 * WHETHER A SECTION'S HOST PANEL KEEPS IT ON THE PAGE WITH NOTHING UNDER IT. IT DOES, UNLESS THE RECORD CAN SEE THE
 * PANEL HOLDS NOTHING. The key a row's numbers are sent with and a run's changes are always something to read. A
 * project's scheduled actions may be none, and the host draws nothing for none, so a boxed section naming `actions`
 * over blocks that all went was a tile holding only its heading ("More about Pinwheel").
 *
 * KEPT BY DEFAULT. The record cannot see the host's panel, and a section handed no `actions` is one
 * nobody counted for: shutting it took the heading off a project with one scheduled action and nothing else under the
 * box, which is worse than a heading over nothing. Only a section handed its `actions` as a list of none is shut.
 */
const seesNoActions = (b: Drawable): boolean => Array.isArray(b.actions) && b.actions.length === 0;
const panelHeld = (b: Drawable): boolean => typeof b.panel === 'string' && !(b.panel === 'actions' && b.box === true && seesNoActions(b));

const areaOf = (b: Drawable): 'main' | 'rail' => (b.area === 'rail' ? 'rail' : 'main');

/** The blocks a section heads: those after it in its own column, up to the next section there. */
function headed(blocks: readonly Drawable[], at: number): Drawable[] {
  const held: Drawable[] = [];
  const area = areaOf(blocks[at]!);
  for (const next of blocks.slice(at + 1)) {
    if (areaOf(next) !== area) continue;
    if (next.kind === 'section') break;
    held.push(next);
  }
  return held;
}

/**
 * THE BLOCKS AS A PAGE IS READ: the same list at the same indexes, each block left out marked `drawn: false` with its
 * `why`. The indexes stay, because every write and every id on a page is keyed by the block's place in the declaration.
 * A block already not drawn is kept as it came, so a reader that runs this over the record's answer reads the record's
 * flag and judges only what the record drew.
 *
 * A PAGE AT ITS OWN ADDRESS (`own`) IS NEVER EMPTIED BY THIS: one whose every block would go keeps the first that says
 * anything, so a list page with nothing in it yet says its one sentence ("Nothing in Tasks yet.") under its title.
 *
 * A SECTION OVER NOTHING GOES WITH ITS BLOCKS: a heading whose every block in its column, up to the next section, is not
 * drawn heads nothing, a box included (the record's `emptyBoxesShut`, which this replaces). A section with no block
 * after it is the author's own divider, and one carrying a host panel holds that panel; both stay. But a BOXED section
 * whose panel is the row's scheduled actions, counted and found to be none, is shut with its blocks (`panelHeld`).
 */
export function emptyHidden<B extends Drawable>(blocks: readonly B[], own = false): B[] {
  const lead = leadOf(blocks);
  const out = blocks.map((b, n): B => {
    if (!on(b)) return b;
    const why = goneWhy(b) ?? (bare(b) && !(n === lead && saysEmpty(b)) ? 'empty' : null);
    return why ? ({ ...b, drawn: false, why } as B) : told(b);
  });
  /* A HEADING IS NOT WHAT A PAGE SAYS, and one over nothing goes below, so it does not count as something drawn. */
  if (own && !out.some((b) => on(b) && b.kind !== 'section')) {
    const first = blocks.findIndex((b) => on(b) && !FRAME.has(b.kind) && !gone(b));
    if (first >= 0) out[first] = told(blocks[first]!);
  }
  out.forEach((b, n) => {
    if (b.kind !== 'section' || !on(b) || says(b) || panelHeld(b)) return;
    const under = headed(out, n);
    if (under.length > 0 && under.every((x) => !on(x))) out[n] = { ...b, drawn: false, why: 'empty' } as B;
  });
  return out;
}

/**
 * THE RECORD'S ANSWER, MARKED: `emptyHidden` at the page's own address, and a block its `when:` turned off saying so
 * (`why: 'when'`), so every reader of the answer, an agent's as much as the screen, draws the same blocks.
 */
export function markDrawn<B extends Drawable>(blocks: readonly B[], own = true): B[] {
  return unechoed(emptyHidden(blocks.map((b) => (on(b) || b.why !== undefined ? b : ({ ...b, why: 'when' } as B))), own));
}

/**
 * NO TILE DRAWS ONE GLYPH TWICE. Inside a boxed section (a `section` with `box: true`, over the blocks `headed` gives
 * it), a block naming the box's own glyph is answered without its `icon`, so the drawer gives it its kind's: "More about
 * Copperleaf" and its "Notes" both said `notebook-pen` and the tile showed the same mark twice. A block outside a box, or
 * with a glyph of its own, keeps it; the indexes and every other key stay.
 */
export function unechoed<B extends Drawable>(blocks: readonly B[]): B[] {
  const out = [...blocks];
  blocks.forEach((b, n) => {
    if (b.kind !== 'section' || b.box !== true || typeof b.icon !== 'string' || b.icon === '') return;
    const area = areaOf(b);
    for (let at = n + 1; at < blocks.length; at++) {
      const next = blocks[at]!;
      if (areaOf(next) !== area) continue;
      if (next.kind === 'section') break;
      if (next.icon !== b.icon) continue;
      const { icon: _echo, ...rest } = out[at]!;
      out[at] = rest as B;
    }
  });
  return out;
}

/**
 * ARRANGING STILL DRAWS EVERY BLOCK: while a page is arranged, or previewed as a change, a block that is empty today is
 * still one somebody is placing, so each block this rule left out is drawn again. A block whose `when:` said no stays
 * out, as it always has.
 */
export function arranged<B extends Drawable>(blocks: readonly B[]): B[] {
  return blocks.map((b) => {
    if (on(b) || b.why === undefined || b.why === 'when') return b;
    const { why: _left, ...rest } = b;
    return { ...rest, drawn: true } as unknown as B;
  });
}
