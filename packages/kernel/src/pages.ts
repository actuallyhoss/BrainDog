/**
 * Reading a page: a document, and the queries its blocks are.
 *
 * NOTHING HERE IS A COMPONENT. A page names blocks; a block names a kind, a source, a predicate and
 * some columns. What this produces is the ROWS and the readings — never the formatting, which is the
 * renderer's and is a different package. The split is what makes a page an agent writes
 * indistinguishable from one that shipped: both are documents, and neither is code.
 *
 * ONE BLOCK'S REFUSAL IS ONE BLOCK. A page whose third block names a field nobody declared shows
 * the other four and says what happened in the third — because a page that fails whole is a page a
 * person cannot use to find out what is wrong with it, and the thing that wrote the block cannot
 * see the screen.
 *
 * A TEMPLATE IS ONE DECLARATION AND ONE PAGE PER ROW. `for: { register, where }` expands into a page
 * per matching row with every `{{field}}` filled from it — so four projects are four pages over one
 * document rather than four documents with the name typed into every predicate, every metric id and
 * every heading. The slug comes from the row's title, so `/p/kiln` survives a re-ordering.
 */

import type { Refusal, Result } from '@braindog/ports';
import { no, ok, refused } from '@braindog/ports';
import type { Leaf, Predicate, Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { ActionRow } from './actions.ts';
import type { Json } from './coerce.ts';
import type { Entry } from './index.ts';
import { predicateOf, windowMs, type EvalContext, type MetricDecl, type Reading } from './metrics.ts';
import { runway, type Leg, type Runway } from './forecast.ts';
import { barsOf, type Bars, type SeriesLine } from './series.ts';
import { MEASURE_BUCKETS, measureBucket, measureSeries, measureWindow, readableZone, type MeasureSeries, type RawReading } from './measures.ts';

export type PageBlock = {
  kind: string;
  heading?: string;
  span?: number;
  source?: string;
  where?: string;
  /** `as: 'scope'` draws where the row applies: its project, or everywhere. */
  /**
   * `as: 'scope'` draws where the row applies. `sign:` writes a money column's figure with `−` where an enum says the
   * money goes out, and a column named `changed`, on a register with no such field, says who changed the row last.
   */
  columns?: { field: string; label?: string; as?: string; sign?: { field: string; minus: string } }[];
  /** A `stat`'s figures. `trend: 12w` draws how the figure moved over that window, from its daily series. */
  cells?: { metric: string; label?: string; trend?: string; note?: string }[];
  /** A `stat`'s: its first figure is the screen's one hero figure. */
  lead?: boolean;
  /** A `section`'s: whether it starts shut, and the glyph beside its heading. */
  fold?: boolean;
  icon?: string;
  /**
   * Over a register with a scope field: the rows of the project `where:` names, then the rows that
   * apply everywhere, a project's row hiding a global one of the same title where the register says
   * the nearer wins (`scope.ts`).
   */
  inherit?: boolean;
  /** A `feed`'s: `seen` marks the rows after the reader's read mark as new, and `first` caps the rows. */
  since?: 'seen';
  first?: number;
  /** A `diff`'s: the row whose history it reads, the field it compares, and how many versions. */
  row?: string;
  field?: string;
  versions?: number;
  order?: { field: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
  /**
   * `forecast.runway` only: what is liquid today, and the legs the walk reads.
   *
   * A number, or `{ metric }`: the figure a page's own `Cash now` tile reads, so the walk and the tile
   * start from one declaration rather than from a balance typed twice.
   */
  opening?: number | { metric: string };
  from?: Leg[];
  horizon?: number;
  empty?: string;
  target?: number;
  /**
   * The condition a block draws under. `06 §1.1` publishes it and the kernel did not read it.
   *
   * A red note about an overdue invoice on a record with no invoices is the one thing a `when:`
   * exists to prevent, and the browser has evaluated it since it was written while this side drew
   * every block unconditionally. Two implementations of one page, disagreeing about which blocks
   * are on it.
   */
  when?: { metric: string; gt?: number; gte?: number; lt?: number; lte?: number; is?: number; not?: number };
  /** A `series`'s lines: figures grouped by one date bucket, and how many buckets back and ahead it draws. */
  series?: SeriesLine[];
  back?: number;
  ahead?: number;
  /** A `stat` or `lines` over readings: whether a point is a day or a week. A day when absent. */
  bucket?: string;
  /** A `series`'s: whether it draws what was left, in minus out, as a line. */
  net?: boolean;
  /**
   * A `forecast`'s: the series its opening figure is remembered in, so the line draws how cash moved
   * before today (`08 §3`: the recorded half and the projected half read the same figure).
   */
  recorded?: string;
  /** A `forecast`'s: which of its knobs a reader may move. */
  knobs?: string[];
  /** A `forecast`'s: the figure the late knob marks, how many days late money has come in on average. */
  late?: string;
  /** A `forecast`'s: say under the chart how many days are left when the walk goes under within this many days. */
  under?: number;
  /** A `bar` or `split`'s: the label of the row that holds what no part does, drawn last and linked to those rows. */
  unset?: string;
  /** A `cards` block's: a row whose day in `field` is older than `after` is drawn as out of date. */
  stale?: { field: string; after: string };
  /**
   * A `progress` block's: the figure, grouped by a word, that says what was spent against each row's limit. The record
   * reads it beside the rows and the host sets each row against the part whose key is that row's value.
   */
  spent?: string;
  /**
   * A `progress` block's: the figure, grouped by a link to the block's own rows, that says how far each row has come, so
   * a goal is moved by the rows logged against it rather than a number typed on it. Each row's target is its second
   * column, set against the part whose key is that row.
   */
  toward?: string;
  /** Whether the condition was satisfied. Absent on a block with no `when:`, which always draws. */
  drawn?: boolean;
};

/**
 * Every key a block declaration may carry, so one it cannot is NAMED rather than ignored.
 *
 * A LIST AND NOT A TYPE CHECK, because a declaration arrives as JSON from a pack somebody else
 * wrote and TypeScript is not there at the moment it is read. The browser has had this since a
 * agent wrote `06 §1.1`'s own worked example, got `when:` silently dropped, and shipped a block
 * that always drew; the kernel accepted anything at all.
 */
const READS = new Set([
  'kind', 'heading', 'span', 'source', 'where', 'columns', 'cells', 'order', 'limit',
  'target', 'authored', 'empty', 'tone', 'body', 'drawn', 'when', 'opening', 'from', 'horizon',
  /* AND THE KEYS A RESULT CARRIES, BECAUSE A BLOCK THAT CAME OUT OF HERE CAN GO BACK IN. `block()`
     is a public call and `BlockResult` is a `PageBlock` with the answer on it, so reading one back
     - to redraw it with one column changed, which is what a caller adjusting a block actually does
     - reported `rows`, `matched` and `refusals` as keys this record does not read. That was hidden
     for as long as every branch below overwrote the refusal list, and it is a false refusal either
     way: they are keys this file wrote. */
  'rows', 'matched', 'readings', 'walk', 'refusals',
  'fold', 'icon', 'inherit', 'since', 'first', 'row', 'field', 'versions', 'lead',
  'inherited', 'scopes', 'feed', 'seen', 'history', 'values',
  /* A `series`'s lines and reach, and the bars it answers with. */
  'series', 'back', 'ahead', 'net', 'bars',
  /* A `stat` or `lines` over readings: its bucket, and the series it answers with. */
  'bucket', 'measures',
  /* A `forecast`'s remembered figure and knobs, and the points it answers with. */
  'recorded', 'knobs', 'past',
  /* Who changed each row of a table last, when a column asks, and the row for what no part holds. */
  'changes', 'unset',
  /* A `forecast`'s late mark and its warning reach, and the lateness it answers with. */
  'late', 'under', 'lateness',
  /* A card grid's out-of-date rule. */
  'stale',
  /* A `progress` budget's figure of what was spent, grouped by the word its rows are, and a goal's of what was logged
     toward it, grouped by the row. */
  'spent', 'toward',
]);

export type PageDecl = {
  page: string;
  title: string;
  blocks: PageBlock[];
  /** `for:` makes it a template: one page per row of the register it names. */
  for?: { register: string; where?: string };
  requires?: string[];
  [key: string]: unknown;
};

export type BlockResult = PageBlock & {
  /** The rows the block draws, cut to `limit`. */
  rows: Entry[];
  /** How many the predicate matched, which is what a total is a total OF. */
  matched: number;
  /** A `stat` block's figures, in the order its cells named them. */
  /** Each cell's figure, and the target the record holds for it, so a host says the record's target rather than its own build's. */
  readings?: { metric: string; label?: string; reading: Reading | null; refusal?: Refusal; trend?: (number | null)[]; target?: MetricDecl['target'] }[];
  /** A `forecast.runway` block's walk. */
  walk?: Runway;
  /** On a block that inherits: how many of `rows`, at the end, apply everywhere rather than to the project. */
  inherited?: number;
  /**
   * Where each row applies, aligned with `rows`: its project's title, or `null` for everywhere. On
   * `sessions.live`, the name of the project each run was placed in.
   */
  scopes?: (string | null)[];
  /** A `feed` block's rows, newest first, a burst being one row. */
  feed?: FeedRow[];
  /** On a feed with `since: seen`: the reader's read mark, or `null` when they have none yet. */
  seen?: string | null;
  /** A `diff` block's versions of its field, newest first, at most `versions` of them. */
  history?: { at: string; by: string; text: string }[];
  /** A `series` block's buckets and each line's value in them. */
  bars?: Bars;
  /** A `stat` or `lines` over a register of readings: one series a measure, newest reading first (`measures.ts`). */
  measures?: MeasureSeries[];
  /** A walk's `recorded:` series over the ninety days before today, oldest first, a day with no point absent. */
  past?: { at: string; value: number }[];
  /** Aligned with `rows`, when a column is `changed`: who changed each row last, as a kind of actor and by name, and when. */
  changes?: ({ by: FeedBy; who: string; at: string } | null)[];
  /** A forecast's `late:` figure, read: how many days late money has come in on average, or `null` when nothing was paid. */
  lateness?: number | null;
  /**
   * Every `{{path}}` in the block's heading, body, empty sentence or authored cells that the record
   * holds a value for, by the path as written. A path it holds nothing for is absent, and draws `—`.
   */
  values?: Record<string, Json>;
  /** What this block could not do. Non-empty means the block drew nothing. */
  refusals: Refusal[];
};

/** The kinds of actor a feed groups by, `packages/render/src/feed.ts`'s `FEED_BY`, copied as `BLOCK_KINDS` is in `declare.ts`. */
export const FEED_BY = ['agent', 'rule', 'you'] as const;
export type FeedBy = (typeof FEED_BY)[number];

/** One row of a feed. `who`, `kind` and `target` are `null` on the row that folds a group's rows past `first:`. */
export type FeedRow = {
  by: FeedBy;
  who: string | null;
  count: number;
  kind: string | null;
  target: string | null;
  note: string | null;
  at: string;
  /** What the target is called, where the host could say (a row's title), for a reader who is not handed an id. */
  thing?: string | null;
  /** On a `setup` row (`feed.ts`), how many example rows the record set itself up with. */
  rows?: number;
};

/** One event, as the activity source reads it. */
export type ActivityEvent = { ts: string; actor: string; kind: string; target: string | null; note: string | null; thing?: string | null; rows?: number };

/** One event about a row, oldest first. A create carries every field in `to` and `field: null`. */
export type RowEvent = { ts: string; actor: string; kind: string; field: string | null; to: Json | null };

/** `read_at` is the record's clock when it read the page, which a host draws "today" and "out of date" against. */
export type PageResult = { page: string; title: string; blocks: BlockResult[]; read_at?: string; [key: string]: unknown };

export type PageDeps = {
  /** Every live page declaration. */
  pages: () => PageDecl[];
  /** One metric document by its id, or `null`. */
  metric: (id: string) => MetricDecl | null;
  /** One reading. It is a callback rather than SQL because this layer runs queries it did not write. */
  read: (decl: MetricDecl) => Result<Reading>;
  list: (q: {
    register: string;
    where?: Predicate | undefined;
    limit?: number;
    order?: { field: string; dir?: 'asc' | 'desc' }[];
  }) => Result<{ rows: Entry[]; matched: number }>;
  schemaOf: (register: string) => Schema | null;
  /** The field that titles a row of this register — what a template's slug is made from. */
  titleOf: (register: string) => string | null;
  /** The cash walk, when a block names it. */
  runway: (opening: number, legs: readonly Leg[], horizon?: number) => Runway | null;
  ctx: EvalContext;
  /*
   * OPTIONAL, so a host that has not wired one of these gets `NOT_IN_THIS_BUILD` on the block that
   * needs it rather than a type error in every caller.
   */
  /** The field that says where a register's rows apply, and the register of projects it points at. */
  scopeOf?: (register: string) => { field: string; to: string } | null;
  /** The kernel's `inScope`, which is where nearer-wins is decided. */
  inScope?: (register: string, project: string, opts: { limit?: number; open?: boolean }) => Result<{ rows: Entry[]; inherited: Entry[] }>;
  /** Every event about one row of `register`, oldest first. `row` is a spoken id or a row id. */
  history?: (register: string, row: string) => Result<RowEvent[]>;
  /** The newest `limit` events, newest first, and the reader's read mark. */
  activity?: (limit: number) => { events: ActivityEvent[]; seen: string | null };
  /** Every run of the kernel's `session` register not in one of its `done` states, the most recently seen first. */
  sessionsLive?: () => Entry[];
  /** Every active scheduled action, as the record's `actions` read lists them, keys by label. */
  actions?: () => ActionRow[];
  /** The record's timezone, which a day of readings is counted in. `UTC` when absent. */
  tz?: string;
  /**
   * The readings a `stat` or `lines` over a register draws: the named fields of every row the predicate admits whose
   * `when` is on or after `since`, and the newest reading of each measure whenever it was.
   */
  readings?: (q: {
    register: string;
    where?: Predicate | undefined;
    when: string;
    value: string;
    name?: string;
    unit?: string;
    since: string;
  }) => Result<{ readings: RawReading[]; latest: RawReading[] }>;
  /** A series' daily points from one day to another, both included, oldest first (`metric_point`). */
  points?: (series: string, from: string, to: string) => { at: string; value: number }[];
};

/** The sources a block may name that are not a register. Named, so a new one is a refusal. */
const COMPUTED = new Set(['forecast.runway', 'activity', 'sessions.live', 'actions']);

/**
 * The kinds that add their rows up, whose `limit:` cuts the GROUPS they draw and never the rows they read.
 *
 * A sum over the first six rows is a wrong number rather than a short list, and the app will not draw
 * a reducing block that was handed less than the whole answer. So these read as many rows as a list
 * read hands back at once, and a register past that says it cannot be drawn rather than adding up part.
 */
const REDUCES = new Set(['bar', 'chips', 'gauge', 'split', 'progress']);
const READ_WHOLE = 200;

/** The register `sessions.live` reads, whose fields its `where` and columns name. */
const SESSION = 'session';

/** How many events a feed reads. Bursts are counted from events, so a feed of 20 rows reads more than 20. */
const FEED_EVENTS = 500;

/** How many versions a `diff` shows: `42 §4.5` bounds `versions` at 2 to 10. */
const VERSIONS = { least: 2, most: 10 } as const;

/**
 * Every page a person could open, templates expanded.
 *
 * The slug of an expanded page is the ROW'S TITLE, lower-cased and hyphenated — not its number.
 * `/p/kiln` is a URL somebody can type and one that survives the row being renumbered; `/p/things-1`
 * is neither.
 */
export function resolvePages(deps: PageDeps): { slug: string; decl: PageDecl; row?: Entry; refusal?: Refusal }[] {
  const out: { slug: string; decl: PageDecl; row?: Entry; refusal?: Refusal }[] = [];
  const taken = new Set<string>();

  /**
   * A slug nothing else has.
   *
   * TWO ROWS WITH THE SAME TITLE USED TO GIVE TWO PAGES AT ONE ADDRESS, and only the first was
   * reachable — while its own filled predicate (`name is Kiln`) matched BOTH, so the page for one
   * project showed the other's rows under its own name. A punctuation-only title slugged to the
   * empty string, and every one of those collided there.
   */
  const claim = (name: string, register: string, seq: number | null): string => {
    const base = slugify(name) || `${register}-${seq ?? 0}`;
    if (!taken.has(base)) {
      taken.add(base);
      return base;
    }
    /* AND THE FALLBACK WAS NEVER CHECKED EITHER, so the collision it exists to break could happen
       to it: a static page called `kiln`, a static page called `kiln-1`, and a template row titled
       "Kiln" at seq 1 put two pages at `kiln-1`. `readPage` finds by slug, so the second was listed
       and unreachable, which is the exact failure the paragraph above says was fixed. Counting up
       ends because `taken` is finite and every step adds to it. */
    let unique = `${base}-${seq ?? taken.size}`;
    for (let n = 2; taken.has(unique); n += 1) unique = `${base}-${seq ?? taken.size}-${n}`;
    taken.add(unique);
    return unique;
  };

  for (const decl of deps.pages()) {
    if (!decl.for) {
      out.push({ slug: claim(decl.page, 'page', null), decl });
      continue;
    }

    /* A TEMPLATE THAT CANNOT BE EXPANDED IS STILL A PAGE, and it says why. These were `continue`d,
       so a declaration with a typo in its `for.where` was reported as a page that does not exist —
       to the person who had just written it. */
    const refuse = (refusal: Refusal): void => {
      out.push({ slug: claim(decl.page, 'page', null), decl, refusal });
    };

    const schema = deps.schemaOf(decl.for.register);
    if (!schema) {
      refuse({ code: 'REGISTER_UNKNOWN', fix: `${decl.page} is a page per row of ${decl.for.register}, and there is no such register.`, at: 'for' });
      continue;
    }
    const said = predicateOf(decl.for.where, schema, deps.ctx);
    if (said.bad.length) {
      refuse(said.bad[0]!);
      continue;
    }
    const listed = deps.list({ register: decl.for.register, where: said.predicate, limit: 200 });
    if (!listed.ok) {
      /* A LIST CANNOT CONFLICT — nothing was written — so the guard is the type system agreeing
         rather than a case anybody expects to see. */
      if (refused(listed)) refuse(listed.refusal);
      continue;
    }
    const title = deps.titleOf(decl.for.register);
    if (!title) {
      refuse({ code: 'REQUIRED_MISSING', fix: `${decl.for.register} names no title field, so its pages have no name.`, at: 'for' });
      continue;
    }

    /* TWO ROWS OF ONE NAME, IN TWO PLACES, ARE TELLABLE APART BY THE PLACE. A project's skill hides the global one of
       its name (`32 §2.1`, nearer wins), so both are real and both have pages; numbering the second gave
       `review-pr` and `review-pr-1`, which says nothing about which is which, and which of them took the bare
       name turned on the order the rows were listed in. So the row that applies everywhere keeps the name, and a
       row scoped to a place is named for it too: `review-pr-kiln`. */
    const rows = listed.value.rows;
    const counts = new Map<string, number>();
    for (const row of rows) {
      const base = slugify(String(row.fields[title] ?? ''));
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    const scope = deps.scopeOf?.(decl.for.register) ?? null;
    let places: Map<string, string> | null = null;
    const placeOf = (row: Entry): string | null => {
      const at = scope ? row.fields[scope.field] : undefined;
      if (!scope || typeof at !== 'string') return null;
      if (!places) {
        const named = deps.titleOf(scope.to);
        const held = deps.list({ register: scope.to, limit: 200 });
        places = new Map(held.ok && named ? held.value.rows.map((r) => [r.id, String(r.fields[named] ?? '')]) : []);
      }
      return places.get(at) || null;
    };
    const slugs = new Map<Entry, string>();
    const shared = [...counts.values()].some((n) => n > 1);
    const everywhereFirst = shared ? [...rows].sort((x, y) => Number(placeOf(x) !== null) - Number(placeOf(y) !== null)) : rows;
    for (const row of everywhereFirst) {
      const name = String(row.fields[title] ?? '');
      const place = (counts.get(slugify(name)) ?? 0) > 1 ? placeOf(row) : null;
      slugs.set(row, claim(place === null ? name : `${name} ${place}`, decl.for.register, row.seq));
    }
    for (const row of rows) out.push({ slug: slugs.get(row)!, decl: fill(decl, row) as PageDecl, row });
  }
  return out;
}

/** One page, with every block run. */
export function readPage(deps: PageDeps, slug: string): Result<PageResult> {
  const found = resolvePages(deps).find((p) => p.slug === slug);
  if (!found)
    return no<PageResult>('PAGE_UNKNOWN', `There is no page at ${slug}.`, {
      at: 'slug',
      allowed: resolvePages(deps).map((p) => p.slug),
    });

  /* A PAGE THAT COULD NOT BE EXPANDED IS A PAGE WITH ONE SENTENCE ON IT, not a 404. The person
     reading it is usually the person who wrote the declaration. */
  /* THE RECORD'S CLOCK, WHEN IT READ THE PAGE. What is out of date, what is late and which day is today on this page are
     the record's answers, so a host draws them against this rather than against its own clock. */
  const read_at = new Date(deps.ctx.nowMs).toISOString();
  if (found.refusal)
    return ok({ ...found.decl, page: found.slug, read_at, blocks: [{ kind: 'note', rows: [], matched: 0, refusals: [found.refusal] }] });

  /* AN EXPANDED PAGE SAYS WHICH ROW IT IS ABOUT, so a host can name the project without guessing it
     from the title. The title is already the row's, so this says nothing the page did not. */
  const title = found.row ? deps.titleOf(found.row.register) : null;
  return ok({
    ...found.decl,
    page: found.slug,
    read_at,
    ...(found.row && found.row.seq !== null
      ? { param: { register: found.row.register, seq: found.row.seq, title: String((title && Object.hasOwn(found.row.fields, title) ? found.row.fields[title] : null) ?? '') } }
      : {}),
    blocks: found.decl.blocks.map((b) => readBlock(deps, b)),
  });
}

/**
 * One block.
 *
 * IT NEVER THROWS. Everything a block can get wrong — a source nobody has, a predicate the register
 * cannot answer, a metric that is not declared — comes back as a refusal ON THE BLOCK, so the page
 * around it still draws.
 */
/**
 * Whether a block's `when:` is satisfied, given the figure it names.
 *
 * A FIGURE THAT CANNOT BE READ DOES NOT DRAW THE BLOCK. The alternative, drawing it anyway, is how a
 * red note about an overdue invoice appears on a record with no invoices at all. A `when:` naming a
 * metric nobody declared is the same answer for the same reason: the condition is unknown, and
 * drawing on an unknown is guessing.
 *
 * A CONDITION WITH NO TEST IN IT IS NOT A CONDITION. `{ metric: 'overdue' }` with no comparison does
 * not draw, because the author meant something and the block waits until they say what.
 */
function drawnWhen(deps: PageDeps, block: PageBlock): boolean {
  const when = block.when;
  if (!when) return true;
  const decl = deps.metric(when.metric.split(':')[0] ?? '');
  if (!decl) return false;
  const at = when.metric.indexOf(':');
  const read = deps.read(at < 0 ? decl : (fill(decl, null, when.metric.slice(at + 1)) as MetricDecl));
  if (!read.ok) return false;
  const v = read.value.value;
  if (v === null) return false;
  if (when.gt !== undefined) return v > when.gt;
  if (when.gte !== undefined) return v >= when.gte;
  if (when.lt !== undefined) return v < when.lt;
  if (when.lte !== undefined) return v <= when.lte;
  if (when.is !== undefined) return v === when.is;
  if (when.not !== undefined) return v !== when.not;
  return false;
}

export function readBlock(deps: PageDeps, block: PageBlock): BlockResult {
  /* A KEY THIS BUILD DOES NOT READ IS SAID, and it is said whatever else the block turns out to be:
     a `cells` block with a misspelt key and a `table` block with one are the same mistake, and the
     stat arm below returns before any other check runs. */
  const unread = Object.keys(block)
    .filter((key) => !READS.has(key))
    .map((key): Refusal => ({ code: 'DECLARATION_INVALID', fix: `${key}: is not a key this record reads.`, at: key }));

  const base: BlockResult = { ...block, rows: [], matched: 0, refusals: unread };

  /**
   * AND `unread` HAS TO SURVIVE THE RETURN THAT SPREADS `base`, WHICH IT DID NOT.
   *
   * The comment above says the misspelt key is said whatever else the block turns out to be, and it
   * was true of exactly one path: the eight returns below each write their own `refusals:` over the
   * spread, so a block that both misspelt a key AND named a source nobody publishes reported only
   * the source. The author fixed the source, redeployed, and met the second sentence they could have
   * had the first time. Every refusal this function knows about goes back in one list.
   */
  const also = (...more: readonly Refusal[]): Refusal[] => [...unread, ...more];

  /* AND A BLOCK WHOSE CONDITION IS NOT MET DRAWS NOTHING, before any query runs. `drawn` is on the
     result rather than implied by an empty one, because "the condition was false" and "the query
     matched nothing" are different facts and a renderer that cannot tell them apart draws the empty
     state of a block that was never meant to be on the page. */
  if (!drawnWhen(deps, block)) return { ...base, drawn: false };

  /* THE PAGE'S LIVE FIGURES ARE THE RECORD'S TO SAY, so the host does not answer them from a copy of
     its own. Only for a block that draws: a figure in a block that is not on the page is not read. */
  const values = valuesOf(deps, block);
  if (values) base.values = values;

  /* A STAT OVER A REGISTER AND NO FIGURES reads that register's rows, as a table does, and the host draws one tile a
     measure from them: the numbers a project reported are rows, and a figure per measure would be a declaration per
     measure nobody can write ahead of the project sending it. */
  if (block.cells || (block.kind === 'stat' && !block.source?.startsWith('register.'))) {
    return {
      ...base,
      readings: (block.cells ?? []).map(({ trend: window, ...cell }) => {
        const decl = deps.metric(cell.metric.split(':')[0] ?? '');

        if (!decl)
          return {
            ...cell,
            reading: null,
            refusal: {
              code: 'METRIC_UNKNOWN',
              fix: `There is no metric called ${cell.metric}. A figure this record computes rather than declares is not one either.`,
              at: 'metric',
            },
          };
        /* The declaration with its parameter filled: `project-owed:Kiln` is one document read about
           one project, which is what makes a project page a declaration rather than a case. */
        /* THE FIRST COLON SEPARATES, and everything after it is the parameter — a project called
           `C:\Repos` is a project, and splitting on every colon read it as `C`. */
        const at = cell.metric.indexOf(':');
        const param = at < 0 ? undefined : cell.metric.slice(at + 1);
        const read = deps.read(param === undefined ? decl : (fill(decl, null, param) as MetricDecl));
        const moved = window === undefined ? {} : trendOf(deps, cell.metric, window);
        const target = decl.target === undefined ? {} : { target: decl.target };
        if ('refusal' in moved) return { ...cell, ...target, reading: read.ok ? read.value : null, refusal: moved.refusal };
        if (read.ok) return { ...cell, ...target, reading: read.value, ...moved };
        return refused(read) ? { ...cell, ...target, reading: null, refusal: read.refusal } : { ...cell, ...target, reading: null };
      }),
    };
  }

  /* A SERIES READS ITS FIGURES, grouped by one bucket, and lines them up on one run of buckets. */
  if (block.kind === 'series') {
    const got = barsOf(block.series, block.back, block.ahead, deps.metric, deps.read);
    return 'refusal' in got ? { ...base, refusals: also(got.refusal) } : { ...base, bars: got.bars, matched: got.bars.keys.length };
  }

  /* A BLOCK WITH NO SOURCE IS A WRITTEN BLOCK, and the record has nothing to add to it. `05` §1 makes
     `table` the page-only kind that takes `source:` and `columns:`; every other kind draws the rows
     of its own fenced text, so a `note` or a `code` block is held, travels and versions like any
     other declaration and is simply handed back. Refusing it would be the record insisting that a
     paragraph is a query. */
  if (!block.source) return base;
  /* A COMPUTED SOURCE IS A READING OVER SEVERAL REGISTERS rather than a query against one, and what
     it reads is DECLARED on the block: a forecast that knew the word "obligations" would be a
     forecast that works for one record. */
  if (block.source === 'forecast.runway') {
    const opened = openingOf(deps, block.opening);
    if (opened.refusal) return { ...base, refusals: also(opened.refusal) };
    if (opened.value === null || !Array.isArray(block.from))
      return {
        ...base,
        refusals: also({
          code: 'REQUIRED_MISSING',
          fix: 'A cash walk names what is liquid today (`opening:`) and the legs it reads (`from:`). A runway seeded from a balance nobody declared is a forecast that looks like a fact.',
          at: 'opening',
        }),
      };
    /* `NOT_IN_THIS_BUILD` RATHER THAN `UNIMPLEMENTED`, and the distinction below it is the one that
       matters to whoever wrote the block: `08 §2.6` and `06 §3` PUBLISH these computed sources, so a
       block naming one is a correct declaration against a build that has not caught up — a deploy
       away, not an edit away. `SOURCE_UNKNOWN` at the bottom of this function is the other answer,
       for a word no document publishes at all. Both said `UNIMPLEMENTED` once and a person could not
       tell "wait" from "you made this up". */
    const walk = deps.runway(opened.value, block.from, block.horizon);
    if (!walk)
      return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not compute a cash walk.', at: 'source' }) };
    /* A BALANCE IN ONE CURRENCY AND MOVEMENTS IN ANOTHER ARE NOT ONE WALK. */
    if (opened.unit !== null && walk.currency !== null && opened.unit !== walk.currency)
      return {
        ...base,
        refusals: also({
          code: 'MIXED_CURRENCY',
          fix: `The opening balance is in ${opened.unit} and the movements are in ${walk.currency}. A cash walk adds them, so they need one currency.`,
          at: 'opening',
        }),
      };
    const recorded = recordedOf(deps, block);
    if ('refusal' in recorded) return { ...base, refusals: also(recorded.refusal) };
    const late = latenessOf(deps, block);
    if ('refusal' in late) return { ...base, refusals: also(late.refusal) };
    return { ...base, walk, ...recorded, ...late, matched: walk.steps.length, refusals: also(...walk.refusals) };
  }
  /* A FEED READS THE RECORD'S EVENTS, not a register's rows. */
  if (block.source === 'activity') return activityBlock(deps, block, base, also);
  if (block.source === 'sessions.live') return liveBlock(deps, block, base, also);
  if (block.source === 'actions') return actionsBlock(deps, block, base, also);
  /* A BAR OR A SPLIT OVER A GROUPED FIGURE draws the figure's parts, so a part may be a monthly share of a yearly
     cost, which a sum over the rows cannot be. The host adds what no part holds as its `unset:` row. */
  if (block.source.startsWith('metric.')) return metricBlock(deps, block, block.source.slice('metric.'.length), base, also);
  if (COMPUTED.has(block.source))
    return {
      ...base,
      refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: `${block.source} is computed, and this record does not compute it yet.`, at: 'source' }),
    };

  const register = block.source.startsWith('register.') ? block.source.slice('register.'.length) : null;
  const schema = register ? deps.schemaOf(register) : null;
  if (!register || !schema)
    return { ...base, refusals: also({ code: 'SOURCE_UNKNOWN', fix: `${block.source} is not a source this record reads.`, at: 'source' }) };

  /* A DIFF READS ONE ROW'S HISTORY, not the rows a predicate matches. */
  if (block.kind === 'diff') return diffBlock(deps, block, register, schema, base, also);

  /* OUT OF DATE IS A DAY AND A WINDOW, checked here because the host draws it from both. */
  if (block.stale !== undefined) {
    const s = block.stale as { field?: unknown; after?: unknown } | null;
    const type = s && typeof s.field === 'string' && Object.hasOwn(schema.fields, s.field) ? schema.fields[s.field]?.type : undefined;
    if (!s || (type !== 'day' && type !== 'instant') || typeof s.after !== 'string' || windowMs(s.after) === null)
      return {
        ...base,
        refusals: also({ code: 'DECLARATION_INVALID', fix: `stale: names a day field on ${register} and a window, such as { field: as_of, after: 7d }.`, at: 'stale' }),
      };
  }

  const said = predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };

  /* THE NUMBERS A PROJECT REPORTED ARE WORKED OUT HERE, NOT IN THE BROWSER. A `stat` or `lines` over a register names
     which field is when, which the value, and optionally the measure's name and unit, and the record hands back one
     series a measure over the period and the one before, bucketed by the record's local day or week (`measures.ts`).
     A year of hourly polls is a few hundred numbers on the wire rather than every reading. */
  if ((block.kind === 'stat' || block.kind === 'lines') && deps.readings && (block.columns?.length ?? 0) >= 2) {
    const [when, val, name, unit] = (block.columns ?? []).map((c) => c.field);
    const missing = [when, val, name, unit].filter((f): f is string => f !== undefined && !Object.hasOwn(schema.fields, f));
    if (missing.length)
      return {
        ...base,
        refusals: also({ code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${missing.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }),
      };
    if (block.bucket !== undefined && !(MEASURE_BUCKETS as readonly unknown[]).includes(block.bucket))
      return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: `bucket: is ${MEASURE_BUCKETS.join(' or ')}.`, at: 'bucket' }) };
    const tz = readableZone(deps.tz);
    const window = measureWindow(deps.ctx.nowMs, block.back, measureBucket(block.bucket), tz);
    const read = deps.readings({ register, where: said.predicate, when: when!, value: val!, ...(name ? { name } : {}), ...(unit ? { unit } : {}), since: window.since });
    if (!read.ok) return { ...base, refusals: refused(read) ? also(read.refusal) : also() };
    const measures = measureSeries([...read.value.latest, ...read.value.readings], {
      nowMs: deps.ctx.nowMs,
      back: block.back,
      bucket: block.bucket,
      tz,
      fallback: block.heading ?? '',
    });
    return { ...base, measures, matched: read.value.readings.length };
  }

  /* WHERE A ROW APPLIES IS THE REGISTER'S SCOPE FIELD, and nothing else can answer it. Both keys that
     ask are checked before any query, so a block that cannot say which project draws nothing rather
     than every row of the register. */
  const inherit = block.inherit === true;
  const scoped = (block.columns ?? []).filter((c) => c.as === 'scope');
  if ((inherit && (!deps.scopeOf || !deps.inScope)) || (scoped.length && !deps.scopeOf))
    return {
      ...base,
      refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read where a row applies yet.', at: inherit ? 'inherit' : 'columns' }),
    };
  const scope = inherit || scoped.length ? (deps.scopeOf?.(register) ?? null) : null;
  if (inherit && !scope)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `${register} has no field that says where its rows apply, so there is nothing to inherit.`, at: 'inherit' }),
    };
  const astray = scoped.find((c) => c.field !== scope?.field);
  if (astray)
    return {
      ...base,
      refusals: also({
        code: 'DECLARATION_INVALID',
        fix: scope
          ? `as: scope draws where a row applies, which ${register} says in ${scope.field}, not ${astray.field}.`
          : `as: scope draws where a row applies, and ${register} has no field that says so.`,
        at: 'columns',
      }),
    };

  /* A LIMIT OF ZERO DRAWS NOTHING, which is what it says. `Math.max(1, …)` turned it into one row —
     a block declaring it wanted no rows and getting one is a block nobody can write. */
  const limit = REDUCES.has(block.kind) ? READ_WHOLE : block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  if (limit === 0) return { ...base, matched: 0 };
  /* THE ORDER GOES TO THE QUERY, not to the page after it. Sorting the rows that came back is
     sorting a page that was already chosen: "the five largest" would be five arbitrary rows put in
     order, which is a different answer and an invisible one. */
  const listed: Result<Listed> =
    inherit && scope
      ? listInherited(deps, register, scope, said.predicate, limit, block.order)
      : deps.list({
          register,
          where: said.predicate,
          limit,
          ...(block.order?.length ? { order: block.order } : {}),
        });
  if (!listed.ok) return { ...base, refusals: refused(listed) ? also(listed.refusal) : also() };

  /* THE COLUMNS ARE CHECKED AGAINST THE REGISTER. A column naming a field nobody declared renders as
     an empty cell under a heading that promises one, which reads as "no value" rather than as "no
     such thing" — and the difference is whether anybody investigates. */
  const unknown = (block.columns ?? [])
    .map((c) => c.field)
    .filter((f) => f !== 'seq' && f !== CHANGED && !Object.hasOwn(schema.fields, f));

  /* A REFUSAL MEANS THE BLOCK DREW NOTHING, which is what `BlockResult` says and what it was not
     doing: it returned the rows AND the refusal, so a renderer that drew the rows and ignored the
     sentence would show a table with a column of blanks where a field nobody declared should be —
     which reads as "no value" rather than as "no such thing". */
  if (unknown.length)
    return {
      ...base,
      refusals: also({
        code: 'FIELD_UNKNOWN',
        fix: `${register} has no field called ${unknown.join(', ')}.`,
        at: 'columns',
        allowed: Object.keys(schema.fields),
      }),
    };

  /* A SIGN IS READ FROM AN ENUM AND ONE OF ITS VALUES, or the figure would carry a sign nothing decides. */
  const unsigned = (block.columns ?? []).find((c) => {
    if (c.sign === undefined) return false;
    const field = typeof c.sign?.field === 'string' && Object.hasOwn(schema.fields, c.sign.field) ? schema.fields[c.sign.field] : undefined;
    return !(field?.type === 'enum' && typeof c.sign?.minus === 'string' && (field.values ?? []).includes(c.sign.minus));
  });
  if (unsigned)
    return {
      ...base,
      refusals: also({
        code: 'DECLARATION_INVALID',
        fix: `sign: names an enum field on ${register} and the value that makes the amount go out, such as { field: direction, minus: owed_by_me }.`,
        at: 'columns',
      }),
    };
  const asksChanged = (block.columns ?? []).some((c) => c.field === CHANGED) && !Object.hasOwn(schema.fields, CHANGED);
  if (asksChanged && !deps.history)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read who changed a row onto a page yet.', at: 'columns' }) };

  const rows = listed.value.rows;
  /* A BUDGET SETS ITS ROWS AGAINST A FIGURE, read here beside them, so a limit and what was spent come from one answer.
     A GOAL IS SET AGAINST WHAT WAS LOGGED TOWARD IT the same way, the figure grouped by the row it points at. */
  const figure = block.kind !== 'progress' ? undefined : block.spent !== undefined ? { id: block.spent, at: 'spent' } : block.toward !== undefined ? { id: block.toward, at: 'toward' } : undefined;
  const spent = figure === undefined ? {} : spentOf(deps, figure.id, figure.at);
  if ('refusal' in spent) return { ...base, refusals: also(spent.refusal) };
  /* A LIMIT AND WHAT WAS SPENT AGAINST IT ARE ONE CURRENCY, for the reason two currencies are never added: a EUR 50 limit
     is not 90% used by GBP 45. */
  const unit = 'readings' in spent ? (spent.readings[0]?.reading?.unit ?? null) : null;
  const limitField = block.columns?.[1]?.field;
  if (unit !== null && limitField !== undefined) {
    const other = rows.map((r) => r.fields[limitField]).find((v): v is { currency: string } => typeof v === 'object' && v !== null && typeof (v as { currency?: unknown }).currency === 'string' && (v as { currency: string }).currency !== unit);
    if (other)
      return {
        ...base,
        refusals: also({ code: 'MIXED_CURRENCY', fix: `A row here is in ${other.currency} and ${figure?.id} is in ${unit}, and two currencies are never set against each other. Give the row's ${limitField} in ${unit}, or read a figure in ${other.currency}.`, at: figure?.at ?? 'spent' }),
      };
  }
  return {
    ...base,
    ...spent,
    rows,
    ...(asksChanged ? { changes: changesOf(deps, register, rows) } : {}),
    matched: listed.value.matched,
    ...(inherit ? { inherited: listed.value.inherited ?? 0 } : {}),
    ...(scope ? { scopes: scopesOf(deps, rows, scope) } : {}),
  };
}

/**
 * What a cash walk starts from: a number written on the block, or the reading of a declared figure.
 *
 * `{ metric }` IS THE ONE THAT CANNOT DRIFT. A page that leads with Cash now and walks from a typed
 * opening says two things about one balance, and only one of them moves when an account is updated.
 */
function openingOf(deps: PageDeps, opening: PageBlock['opening']): { value: number | null; unit: string | null; refusal?: Refusal } {
  if (typeof opening === 'number') return { value: opening, unit: null };
  if (!opening || typeof opening !== 'object' || typeof opening.metric !== 'string') return { value: null, unit: null };
  const decl = deps.metric(opening.metric);
  if (!decl)
    return {
      value: null,
      unit: null,
      refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${opening.metric} for the walk to start from.`, at: 'opening' },
    };
  const read = deps.read(decl);
  if (!read.ok) return { value: null, unit: null, ...(refused(read) ? { refusal: read.refusal } : {}) };
  if (read.value.refusals.length) return { value: null, unit: null, refusal: read.value.refusals[0]! };
  return { value: read.value.value ?? 0, unit: read.value.unit };
}

/** The knobs a `forecast` may offer. */
export const KNOBS = ['horizon', 'late', 'spend', 'leave'] as const;

/** How far back a forecast draws what was recorded. */
const RECORDED_DAYS = 90;

/**
 * A walk's remembered balance before today, when it names the series, and its knobs checked.
 *
 * `recorded:` NAMES THE FIGURE THE OPENING IS, or the line would join two measures at today: the
 * opening is a reading of one figure, and what came before has to be that figure remembered, which is
 * why a series other than the opening's is refused rather than drawn.
 */
function recordedOf(deps: PageDeps, block: PageBlock): { past?: { at: string; value: number }[] } | { refusal: Refusal } {
  if (block.knobs !== undefined && (!Array.isArray(block.knobs) || block.knobs.some((k) => !(KNOBS as readonly unknown[]).includes(k))))
    return { refusal: { code: 'DECLARATION_INVALID', fix: `knobs is a list of ${KNOBS.join(', ')}.`, at: 'knobs', allowed: [...KNOBS] } };
  if (block.recorded === undefined) return {};
  const id = typeof block.recorded === 'string' ? block.recorded.replace(/^series\./u, '') : '';
  const opening = block.opening !== null && typeof block.opening === 'object' ? block.opening.metric : null;
  if (!id || id !== opening)
    return { refusal: { code: 'DECLARATION_INVALID', fix: `recorded: names the series its opening figure is remembered in, which is ${opening ?? 'a figure this walk does not open from'}.`, at: 'recorded' } };
  if (!deps.points) return {};
  const DAY = 86_400_000;
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { past: deps.points(id, at(deps.ctx.nowMs - RECORDED_DAYS * DAY), at(deps.ctx.nowMs - DAY)) };
}

/**
 * A forecast's late mark, read from the figure it names, and its warning reach checked.
 *
 * THE MARK IS A FACT ABOUT WHAT HAPPENED: how late money has come in, from the paid rows. The knob itself
 * stays arithmetic over the walk, and the mark only says where the record puts a reader's guess.
 */
function latenessOf(deps: PageDeps, block: PageBlock): { lateness?: number | null } | { refusal: Refusal } {
  if (block.under !== undefined && (!Number.isInteger(block.under) || block.under < 1 || block.under > 365))
    return { refusal: { code: 'OUT_OF_BOUNDS', fix: 'under: is a whole number of days between 1 and 365.', at: 'under' } };
  if (block.late === undefined) return {};
  const decl = typeof block.late === 'string' ? deps.metric(block.late) : null;
  if (!decl) return { refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${String(block.late)} for the late knob to mark.`, at: 'late' } };
  const read = deps.read(decl);
  if (!read.ok) return refused(read) ? { refusal: read.refusal } : {};
  if (read.value.refusals.length) return { refusal: read.value.refusals[0]! };
  return { lateness: read.value.value };
}

/**
 * How a figure moved over a window, one value a day from its series, a day with no point a gap.
 *
 * A GAP AND NOT A ZERO: a day the snapshot did not run is a day nothing is known about, and a dip to
 * zero would say the balance was zero. Today is not in it, because today's point is written tomorrow.
 */
function trendOf(deps: PageDeps, metric: string, window: string): { trend?: (number | null)[] } | { refusal: Refusal } {
  const span = windowMs(window);
  if (span === null)
    return { refusal: { code: 'DECLARATION_INVALID', fix: `trend: ${window} is not a window. Write 12w, 90d or 3m.`, at: 'trend' } };
  if (!deps.points) return {};
  const DAY = 86_400_000;
  const days = Math.max(1, Math.round(span / DAY));
  const at = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const last = deps.ctx.nowMs - DAY;
  const from = at(last - (days - 1) * DAY);
  const by = new Map(deps.points(metric, from, at(last)).map((p) => [p.at, p.value]));
  const trend = Array.from({ length: days }, (_, i) => by.get(at(last - (days - 1 - i) * DAY)) ?? null);
  return trend.some((v) => v !== null) ? { trend } : {};
}

/* ── where a row applies ─────────────────────────────────────────────────── */

type Listed = { rows: Entry[]; matched: number; inherited?: number };

/**
 * A project's rows, then the rows that apply everywhere.
 *
 * `inScope` DECIDES WHAT IS HIDDEN, so the page and a run's context cannot disagree about which
 * global row a project's row replaces. It does not take a predicate, so the rows themselves come from
 * `list`, and what `inScope` contributes is the set of titles a project row has claimed.
 */
function listInherited(
  deps: PageDeps,
  register: string,
  scope: { field: string; to: string },
  predicate: Predicate | undefined,
  limit: number,
  order: PageBlock['order'],
): Result<Listed> {
  const clauses: Predicate[] =
    predicate === undefined ? [] : Array.isArray((predicate as { all?: unknown }).all) ? (predicate as { all: Predicate[] }).all : [predicate];
  const home = clauses.find((n): n is Leaf => (n as Leaf).field === scope.field && typeof (n as Leaf).is === 'string');
  if (!home)
    return no('REQUIRED_MISSING', `A block that inherits names its project in where:, as ${scope.field} is <project>.`, { at: 'where' });
  const project = home.is as string;
  const rest = clauses.filter((n) => n !== home);

  const claimed = deps.inScope!(register, project, { open: true, limit: 200 });
  if (!claimed.ok) return claimed;
  const shown = deps.inScope!(register, project, { limit: 200 });
  if (!shown.ok) return shown;
  const title = deps.titleOf(register);
  const titleOf = (e: Entry): string => String(e.fields[title ?? ''] ?? '');
  const visible = new Set(shown.value.inherited.map(titleOf));
  const hidden = title ? [...new Set(claimed.value.rows.map(titleOf))].filter((t) => !visible.has(t)) : [];

  const sorted = order?.length ? { order } : {};
  const own = deps.list({ register, where: predicate, limit, ...sorted });
  if (!own.ok) return own;
  const room = limit - own.value.rows.length;
  const everywhere: Predicate = {
    all: [...rest, { field: scope.field, empty: true }, ...(hidden.length ? [{ none: [{ field: title!, in: hidden }] }] : [])],
  };
  /* ASKED EVEN WITH NO ROOM, because `matched` is what the total is a total of. */
  const global = deps.list({ register, where: everywhere, limit: Math.max(1, room), ...sorted });
  if (!global.ok) return global;
  const tail = global.value.rows.slice(0, Math.max(0, room));
  return ok({ rows: [...own.value.rows, ...tail], matched: own.value.matched + global.value.matched, inherited: tail.length });
}

/** Where each row applies, as the title of its project, or `null` for a row that applies everywhere. */
/**
 * A `bar` or a `split` over a figure grouped by a word: the reading, whose parts the host draws.
 *
 * A DATE CUT INTO BUCKETS IS A SERIES, not parts of a whole, so only a figure grouped by a word is read here.
 */
function metricBlock(deps: PageDeps, block: PageBlock, id: string, base: BlockResult, also: (...r: Refusal[]) => Refusal[]): BlockResult {
  if (block.kind !== 'bar' && block.kind !== 'split')
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: `A ${block.kind} does not read a figure yet; a bar or a split does.`, at: 'source' }) };
  const decl = deps.metric(id);
  if (!decl) return { ...base, refusals: also({ code: 'METRIC_UNKNOWN', fix: `There is no metric called ${id}.`, at: 'source' }) };
  if (typeof decl.group_by !== 'string' || decl.bucket !== undefined)
    return {
      ...base,
      refusals: also({ code: 'DECLARATION_INVALID', fix: `A ${block.kind} over a figure draws its parts, so ${id} groups by a word, and a date cut into buckets is a series.`, at: 'source' }),
    };
  const read = deps.read(decl);
  if (!read.ok) return { ...base, refusals: refused(read) ? also(read.refusal) : also() };
  if (read.value.refusals.length) return { ...base, refusals: also(...read.value.refusals) };
  return { ...base, readings: [{ metric: id, reading: read.value }], matched: read.value.groups?.length ?? 0 };
}

/**
 * What a `progress` budget spent, as the figure it names: grouped by a word, never cut into date buckets, because each
 * part is set against the row whose value is its key.
 */
function spentOf(deps: PageDeps, id: unknown, at = 'spent'): { readings: NonNullable<BlockResult['readings']> } | { refusal: Refusal } | Record<string, never> {
  if (typeof id !== 'string' || id === '')
    return { refusal: { code: 'DECLARATION_INVALID', fix: `${at}: names a figure grouped by a word, such as spent-this-month.`, at } };
  const decl = deps.metric(id);
  if (!decl) return { refusal: { code: 'METRIC_UNKNOWN', fix: `There is no metric called ${id}.`, at } };
  if (typeof decl.group_by !== 'string' || decl.bucket !== undefined)
    return { refusal: { code: 'DECLARATION_INVALID', fix: `A progress block sets each row against a part of ${id}, so it groups by a word, and a date cut into buckets is a series.`, at } };
  const read = deps.read(decl);
  if (!read.ok) return refused(read) ? { refusal: read.refusal } : {};
  if (read.value.refusals.length) return { refusal: read.value.refusals[0]! };
  return { readings: [{ metric: id, reading: read.value }] };
}

/** The column that says who changed a row last. A register's own field of that name wins. */
const CHANGED = 'changed';

/** Who changed each row last, from its history: the newest event, its kind of actor, and when. */
function changesOf(deps: PageDeps, register: string, rows: readonly Entry[]): ({ by: FeedBy; who: string; at: string } | null)[] {
  return rows.map((r) => {
    const events = r.seq === null ? undefined : deps.history?.(register, `${register}#${r.seq}`);
    const last = events?.ok ? events.value.at(-1) : undefined;
    return last ? { by: byOf(last.actor), who: last.actor, at: last.ts } : null;
  });
}

function scopesOf(deps: PageDeps, rows: readonly Entry[], scope: { field: string; to: string }): (string | null)[] {
  const said = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);
  const ids = [...new Set(rows.flatMap((r) => said(r.fields[scope.field])))];
  const title = deps.titleOf(scope.to);
  const listed = ids.length && title ? deps.list({ register: scope.to, where: { field: 'id', in: ids }, limit: 200 }) : null;
  const names = new Map(listed?.ok ? listed.value.rows.map((r) => [r.id, String(r.fields[title!] ?? r.id)] as const) : []);
  return rows.map((r) => {
    const at = said(r.fields[scope.field]);
    return at.length ? at.map((id) => names.get(id) ?? id).join(', ') : null;
  });
}

/* ── activity ────────────────────────────────────────────────────────────── */

/** What a feed's `where:` may ask about an event. `actor` is the kind of actor, which is what the groups are. */
const ACTIVITY: Schema = {
  register: 'activity',
  fields: { actor: { type: 'enum', values: FEED_BY }, kind: { type: 'text' }, target: { type: 'text' } },
};

/**
 * The kind of actor behind an event, by `30 §3`'s grammar.
 *
 * A run and a token are agents, and so is `spark`; a rule, an ingest and the record's own work are
 * rules, because nobody chose them at that moment. Anything else is a person.
 */
export function byOf(actor: string): FeedBy {
  if (/^S\d+$/.test(actor) || actor.startsWith('agent:') || actor === 'spark') return 'agent';
  if (actor.startsWith('rule:') || actor.startsWith('ingest:') || actor === 'system') return 'rule';
  return 'you';
}

/**
 * Events, newest first, as feed rows: a run of events by one actor, of one kind, on one target is
 * one row with a count, and past `first` rows a group's remainder is one row, so no count is lost.
 */
export function feedRows(events: readonly ActivityEvent[], first?: number): FeedRow[] {
  const bursts: FeedRow[] = [];
  for (const e of events) {
    const last = bursts.at(-1);
    if (last && last.who === e.actor && last.kind === e.kind && last.target === e.target) last.count += 1;
    else
      bursts.push({
        by: byOf(e.actor),
        who: e.actor,
        count: 1,
        kind: e.kind,
        target: e.target,
        note: e.note,
        at: e.ts,
        ...(e.thing === undefined ? {} : { thing: e.thing }),
        ...(e.rows === undefined ? {} : { rows: e.rows }),
      });
  }
  if (first === undefined) return bursts;
  const cap = Math.min(50, Math.max(1, Math.floor(first)));
  const kept: FeedRow[] = [];
  const rest = new Map<FeedBy, FeedRow>();
  const taken = new Map<FeedBy, number>();
  for (const row of bursts) {
    const n = taken.get(row.by) ?? 0;
    taken.set(row.by, n + 1);
    if (n < cap) kept.push(row);
    else {
      const folded = rest.get(row.by);
      if (folded) folded.count += row.count;
      else rest.set(row.by, { by: row.by, who: null, count: row.count, kind: null, target: null, note: null, at: row.at });
    }
  }
  return [...kept, ...rest.values()];
}

/**
 * An agent's events, newest first, as rows grouped by WHO did them: a burst is one row with a count, and past
 * `first` rows one agent's remainder is one row that keeps its name, so no count is lost and no agent's work is
 * folded into another's.
 */
export function agentRows(events: readonly ActivityEvent[], first?: number): FeedRow[] {
  const bursts: FeedRow[] = [];
  for (const e of events) {
    const last = bursts.at(-1);
    if (last && last.who === e.actor && last.kind === e.kind && last.target === e.target) last.count += 1;
    else bursts.push({ by: byOf(e.actor), who: e.actor, count: 1, kind: e.kind, target: e.target, note: e.note, at: e.ts, thing: e.thing ?? null });
  }
  if (first === undefined) return bursts;
  const cap = Math.min(50, Math.max(1, Math.floor(first)));
  const kept: FeedRow[] = [];
  const rest = new Map<string, FeedRow>();
  const taken = new Map<string, number>();
  for (const row of bursts) {
    const who = row.who ?? '';
    const n = taken.get(who) ?? 0;
    taken.set(who, n + 1);
    if (n < cap) kept.push(row);
    else {
      const folded = rest.get(who);
      if (folded) folded.count += row.count;
      else rest.set(who, { by: row.by, who: row.who, count: row.count, kind: null, target: null, note: null, at: row.at, thing: null });
    }
  }
  return [...kept, ...rest.values()];
}

function activityBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: (...more: readonly Refusal[]) => Refusal[]): BlockResult {
  if (!deps.activity)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its activity onto a page yet.', at: 'source' }) };
  const said = predicateOf(block.where, ACTIVITY, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const read = deps.activity(FEED_EVENTS);
  const kept = read.events.filter((e) => evaluate(said.predicate, { actor: byOf(e.actor), kind: e.kind, target: e.target }, ACTIVITY));
  /* AN `agents` BLOCK IS THE AGENTS' WORK ONLY, one group per agent, so its `first:` counts each agent's rows. */
  if (block.kind === 'agents') {
    const theirs = kept.filter((e) => byOf(e.actor) === 'agent');
    return { ...base, feed: agentRows(theirs, block.first), matched: theirs.length };
  }
  return {
    ...base,
    feed: feedRows(kept, block.first),
    matched: kept.length,
    ...(block.since === 'seen' ? { seen: read.seen } : {}),
  };
}

/* ── the record's scheduled actions ──────────────────────────────────────── */

/** What an `actions` block's `where`, `order` and columns may name: one row per action, as `listActions` reads it. */
const ACTIONS: Schema = {
  register: 'actions',
  fields: {
    ingest: { type: 'text' },
    channel: { type: 'enum', values: ['pull', 'call', 'poll'] },
    project: { type: 'text' },
    host: { type: 'text' },
    every: { type: 'text' },
    key: { type: 'text' },
    state: { type: 'enum', values: ['pending', 'firing', 'paused', 'done'] },
    next: { type: 'text' },
    last_at: { type: 'text' },
    last_outcome: { type: 'text' },
    /* The last run's HTTP status and note, so a host can say why an action paused or waits. */
    last_status: { type: 'int' },
    last_note: { type: 'text' },
    runs: { type: 'int' },
    failures: { type: 'int' },
  },
};

/** One action as a row a table or cards block draws. The key is its label, and `seq` is `null` because it is no register's row. */
const actionEntry = (a: ActionRow): Entry => ({
  id: `action:${a.ingest}`,
  register: ACTIONS.register,
  seq: null,
  fields: {
    ingest: a.ingest,
    channel: a.channel,
    project: a.project,
    host: a.host,
    every: a.every,
    key: a.key,
    state: a.state,
    next: a.next,
    last_at: a.last?.at ?? null,
    last_outcome: a.last?.outcome ?? null,
    last_status: a.last?.status ?? null,
    last_note: a.last?.note ?? null,
    runs: a.month.runs,
    failures: a.month.failures,
  },
  state: a.state,
  version: 1,
  created_at: a.last?.at ?? '',
  updated_at: a.last?.at ?? '',
  deleted_at: null,
});

/**
 * The record's scheduled actions, one row each, in the order the record lists them (by ingest id).
 *
 * THE SAME LIST AS THE `actions` READ, so a page and the "Runs on" screen cannot disagree about what runs. A key is
 * its label and nothing sealed is read. The order is the record's: `order:` is refused rather than ignored.
 */
function actionsBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: (...more: readonly Refusal[]) => Refusal[]): BlockResult {
  if (!deps.actions)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its scheduled actions onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'actions come in the order the record lists them, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(ACTIONS.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `An action has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(ACTIONS.fields) }),
    };
  const said = predicateOf(block.where, ACTIONS, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const kept = deps.actions().map(actionEntry).filter((r) => evaluate(said.predicate, r.fields, ACTIONS));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  return { ...base, rows: kept.slice(0, limit), matched: kept.length };
}

/* ── the runs working now ────────────────────────────────────────────────── */

/**
 * The runs that are not finished, as rows of `session`, the most recently seen first.
 *
 * WHICH RUNS ARE LIVE IS THE HOST'S TO SAY, from the register's own `done` list, so a page and a
 * briefing agree. The order is the host's too: `order:` is refused rather than ignored.
 */
function liveBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: (...more: readonly Refusal[]) => Refusal[]): BlockResult {
  if (!deps.sessionsLive)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its live runs onto a page yet.', at: 'source' }) };
  const schema = deps.schemaOf(SESSION);
  if (!schema) return { ...base, refusals: also({ code: 'SOURCE_UNKNOWN', fix: 'This record keeps no runs.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'sessions.live comes the most recently seen first, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => f !== 'seq' && !Object.hasOwn(schema.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `${SESSION} has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(schema.fields) }),
    };
  const said = predicateOf(block.where, schema, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const kept = deps.sessionsLive().filter((r) => evaluate(said.predicate, r.fields, schema));
  const limit = block.limit === undefined ? 50 : Math.max(0, Math.floor(block.limit));
  const rows = kept.slice(0, limit);
  return { ...base, rows, matched: kept.length, scopes: projectsOf(deps, rows) };
}

/** A spoken id as the ladder writes a run's project: `things#1`. */
const SPOKEN = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/;

/**
 * The project each run was placed in, by its name, aligned with `rows`, or `null` for a run placed nowhere.
 *
 * A RUN HOLDS ITS PROJECT AS A SPOKEN ID, which a reader cannot use, so it is named here as
 * `scopesOf` names a ref, and every host draws the same name. An id that names no row is kept as it
 * was written rather than dropped. A register with its own prefix is not read, as `fill` does not.
 */
function projectsOf(deps: PageDeps, rows: readonly Entry[]): (string | null)[] {
  const asked = new Map<string, Set<number>>();
  for (const r of rows) {
    const m = SPOKEN.exec(typeof r.fields.project === 'string' ? r.fields.project : '');
    if (m) asked.set(m[1]!, (asked.get(m[1]!) ?? new Set<number>()).add(Number(m[2])));
  }
  const names = new Map<string, string>();
  for (const [register, seqs] of asked) {
    const title = deps.titleOf(register);
    const listed = title ? deps.list({ register, where: { field: 'seq', in: [...seqs] }, limit: 200 }) : null;
    if (listed?.ok) for (const r of listed.value.rows) names.set(`${register}#${r.seq}`, String(r.fields[title!] ?? ''));
  }
  return rows.map((r) => {
    const at = r.fields.project;
    return typeof at === 'string' && at !== '' ? names.get(at) || at : null;
  });
}

/* ── one row's history ───────────────────────────────────────────────────── */

/** The values one text field held, oldest first, an event that left it as it was being no version. */
export function versionsOf(events: readonly RowEvent[], field: string): { at: string; by: string; text: string }[] {
  const out: { at: string; by: string; text: string }[] = [];
  for (const e of events) {
    const to = e.field === null ? (e.to !== null && typeof e.to === 'object' && !Array.isArray(e.to) ? e.to[field] : undefined) : e.field === field ? e.to : undefined;
    if (typeof to !== 'string' || out.at(-1)?.text === to) continue;
    out.push({ at: e.ts, by: e.actor, text: to });
  }
  return out;
}

function diffBlock(
  deps: PageDeps,
  block: PageBlock,
  register: string,
  schema: Schema,
  base: BlockResult,
  also: (...more: readonly Refusal[]) => Refusal[],
): BlockResult {
  const refuse = (refusal: Refusal): BlockResult => ({ ...base, refusals: also(refusal) });
  if (!block.row) return refuse({ code: 'REQUIRED_MISSING', fix: 'A diff names the row whose history it reads, as row: skills#2.', at: 'row' });
  if (!block.field) return refuse({ code: 'REQUIRED_MISSING', fix: 'A diff names the field it compares, as field: body.', at: 'field' });
  const decl = schema.fields[block.field];
  if (!decl) return refuse({ code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${block.field}.`, at: 'field', allowed: Object.keys(schema.fields) });
  /* LINES ARE WHAT A DIFF COMPARES, so a field that holds no text has no diff to draw. */
  if (decl.type !== 'document' && decl.type !== 'text')
    return refuse({ code: 'DECLARATION_INVALID', fix: `A diff compares text, and ${block.field} is ${decl.type}.`, at: 'field' });
  if (!deps.history) return refuse({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read a row’s history onto a page yet.', at: 'source' });
  const events = deps.history(register, block.row);
  if (!events.ok) return { ...base, refusals: refused(events) ? also(events.refusal) : also() };
  const all = versionsOf(events.value, block.field).reverse();
  const n = Math.min(VERSIONS.most, Math.max(VERSIONS.least, Math.floor(block.versions ?? VERSIONS.least)));
  return { ...base, history: all.slice(0, n), matched: all.length };
}

/* ── the small parts ─────────────────────────────────────────────────────── */

/** A title as a slug a person can type: lower-case, hyphens, nothing else. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * `{{field}}` filled from one row, everywhere in the document.
 *
 * A STRING PASS OVER THE WHOLE DOCUMENT, deliberately: the placeholder appears in a title, in a
 * predicate, in a heading, in an empty state and in a metric id, and a substitution that walked only
 * the fields somebody remembered is a substitution that leaves `{{name}}` on a screen.
 */
export function fill(doc: unknown, row: Entry | null, param?: string): unknown {
  /* ESCAPED THE WAY JSON ESCAPES, not by replacing the one character somebody remembered. A title
     with a backslash, a newline or a tab in it made `JSON.parse` throw — out of `resolvePages`,
     which every page listing calls, so ONE row called `C:\Repos` made every page in the record
     unlistable. `JSON.stringify` of the value, minus its quotes, is the escaping the format already
     has, and it covers the ones nobody thinks of. */
  const escaped = (value: string): string => JSON.stringify(value).slice(1, -1);
  const text = JSON.stringify(doc).replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    if (key === 'it') return param === undefined ? whole : escaped(param);
    /* A ROW'S SPOKEN ID, spelled as the ladder writes a run's `project` (`things#1`), so a template page
       finds its runs by `project is {{spoken}}`. A register with its own prefix would need its
       declaration here; the projects register has none. */
    if (key === 'spoken') return row ? escaped(row.register + '#' + String(row.seq)) : whole;
    /* OWN PROPERTIES ONLY. `{{constructor}}` read the prototype and filled a heading with source code. */
    const value = row && Object.hasOwn(row.fields, key) ? row.fields[key] : undefined;
    return value === null || value === undefined ? whole : escaped(String(value));
  });
  return JSON.parse(text);
}

/**
 * The registers a page draws from, so a caller's scope can be checked against it.
 *
 * A PAGE'S TITLE IS A SENTENCE ABOUT WHAT THE RECORD HOLDS. "Payroll, monthly" tells a bookkeeper
 * invited to one register that there is a payroll register — which is the exact inference `boot`
 * filters its own list to prevent: a list of names is itself information. `pages()` returned every
 * page a record declares to anybody with `read` on anything.
 *
 * `for:` COUNTS AS MUCH AS A BLOCK'S `source`. A template is one page per row of the register it
 * walks, so its existence says that register is there — and each expanded page carries a row's title
 * as its own, which says more.
 *
 * A PAGE THAT NAMES NONE IS PROSE, and prose is for anybody who may read.
 *
 * AND A `stat` BLOCK NAMES ITS REGISTERS THROUGH ITS FIGURES, WHICH THIS DID NOT LOOK AT.
 *
 * `05 §1` makes `table` the page-only kind that takes `source:`; a `stat` has `cells:` instead, and
 * each cell names a metric whose own declaration carries the `source`. So a page made entirely of
 * figures named no register here, was treated as prose, and was listed to everybody. Driven over
 * HTTP with a read token whose ceiling is one register: `list` refuses, `metric` refuses, `boot`
 * shows one register, and then `pages` names the payroll page and `page` hands back its readings.
 * The shipped seed's own Money page is exactly that shape.
 *
 * IT NEEDS A RESOLVER, because a metric id is a name and the declaration behind it lives in the
 * record. The caller passes one; a page whose metric cannot be resolved contributes nothing, which
 * is the same answer `metric` gives for a name it cannot reach and is the safe direction: the
 * listing is filtered by what a page IS known to touch, so an unknown is not a licence.
 */
export function registersOf(decl: PageDecl, metric?: (id: string) => MetricDecl | null): string[] {
  const named = new Set<string>();
  const add = (source: unknown) => {
    if (typeof source === 'string' && source.startsWith('register.')) named.add(source.slice('register.'.length));
  };
  if (decl.for?.register) named.add(decl.for.register);
  for (const block of decl.blocks ?? []) {
    add(block.source);
    for (const cell of block.cells ?? []) {
      /* THE FIRST COLON SEPARATES, as everywhere else: `project-owed:C:\Repos` is one project. */
      const at = cell.metric.indexOf(':');
      add(metric?.(at < 0 ? cell.metric : cell.metric.slice(0, at))?.source);
    }
    /* A SERIES READS EVERY FIGURE IT LINES UP. */
    for (const line of block.series ?? []) for (const id of [line?.metric, line?.then]) if (typeof id === 'string') add(metric?.(id)?.source);
    /* A WALK THAT STARTS FROM A FIGURE READS THAT FIGURE'S LIST, and so does the figure its late knob marks. */
    if (block.opening && typeof block.opening === 'object') add(metric?.(block.opening.metric)?.source);
    if (typeof block.late === 'string') add(metric?.(block.late)?.source);
    /* A BAR OR A SPLIT OVER A FIGURE READS THE FIGURE'S LIST. */
    if (typeof block.source === 'string' && block.source.startsWith('metric.')) add(metric?.(block.source.slice('metric.'.length))?.source);
    /* A `when:` READS A FIGURE TOO, and a block that draws only when a number crosses a line is a
       statement about that number whether or not the block is on the page. */
    if (block.when?.metric) {
      const at = block.when.metric.indexOf(':');
      add(metric?.(at < 0 ? block.when.metric : block.when.metric.slice(0, at))?.source);
    }
    /* AND SO DOES A `{{path}}` IN ITS PROSE, which the page answer now fills from the record. */
    for (const path of pathsOf(block)) {
      const said = pathOf(path);
      if (!said) continue;
      if ('metric' in said) add(metric?.(said.metric)?.source);
      else named.add(said.register);
    }
  }
  return [...named];
}

/* ── live values ─────────────────────────────────────────────────────────── */

/** Lexically a path, `05 §7.1`, as the renderer reads one. */
const PATH = /^[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?(?:\.[A-Za-z][A-Za-z0-9_-]*(?:#\d+)?)*$/;

/** The eight typed forms of `05 §7.2`, whose argument may be a path. */
const TYPED = new Set(['date', 'day', 'until', 'ago', 'money', 'quantity', 'pct', 'ref']);

/**
 * The field types a path may read. `05 §7.1` rule 2: a document or a note is an argument, not a figure.
 * A secret is never a figure, and a ref or a list would be an id, so each is left out by not being named.
 */
const FIGURES = new Set(['text', 'url', 'email', 'enum', 'int', 'number', 'decimal', 'money', 'day', 'instant', 'bool', 'boolean', 'duration', 'pct']);

/**
 * Every `{{path}}` a reader would see in a block, each once: in its heading, body, empty sentence and
 * authored cells, outside code spans, as a bare path or as a typed form's path argument.
 */
export function pathsOf(block: PageBlock): string[] {
  const authored = (block as { authored?: unknown }).authored;
  const cells = Array.isArray(authored)
    ? authored.flatMap((r) => (r !== null && typeof r === 'object' && Array.isArray((r as { cells?: unknown }).cells) ? (r as { cells: unknown[] }).cells : []))
    : [];
  const out = new Set<string>();
  /* A FIGURE'S OWN NOTE NAMES FIGURES TOO: `in {{cash-accounts}} account(s)` under Cash now. */
  const notes = (block.cells ?? []).map((c) => (c as { note?: unknown }).note);
  for (const text of [block.heading, (block as { body?: unknown }).body, block.empty, ...cells, ...notes]) {
    if (typeof text !== 'string') continue;
    /* CODE SPANS FIRST, as the renderer lifts them: a `{{…}}` in backticks is text, not a question. */
    for (const m of text.replace(/`[^`]*`/g, ' ').matchAll(/\{\{([^{}]*)\}\}/g)) {
      const body = (m[1] ?? '').trim();
      const colon = body.indexOf(':');
      const form = colon > 0 ? body.slice(0, colon).trim() : '';
      const raw = TYPED.has(form) ? body.slice(colon + 1).trim() : body;
      /* A typed form's literal is the author's value; `ref`'s `tasks#241` is a literal and not a path. */
      if (TYPED.has(form) && (!/^[A-Za-z]/.test(raw) || (form === 'ref' && /^[a-z][a-z0-9_]*#\d+$/.test(raw)))) continue;
      if (PATH.test(raw)) out.add(raw);
    }
  }
  return [...out];
}

/**
 * What a path names, in `05 §7.1`'s grammar outside a template: a metric, a row's field by spoken id,
 * or a register's count. Nothing else is read: `tasks.open` and `portfolio.revenue` are not yet, and a
 * path that names none of these is `null` rather than a guess.
 */
function pathOf(path: string): { metric: string } | { register: string; seq: number; field: string } | { register: string; count: true } | null {
  const parts = path.split('.');
  if (parts.length === 1) return /^[a-z][a-z0-9_-]*$/.test(path) ? { metric: path } : null;
  if (parts.length !== 2) return null;
  const [head, tail] = parts as [string, string];
  const row = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/.exec(head);
  if (row) return { register: row[1]!, seq: Number(row[2]), field: tail };
  if (tail === 'count' && /^[a-z][a-z0-9_]*$/.test(head)) return { register: head, count: true };
  return null;
}

/** A stored value a reader may be shown: a scalar, or a money's amount and currency and nothing else. */
function figure(v: Json | undefined): Json | undefined {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.amount === 'number' && typeof v.currency === 'string')
    return { amount: v.amount, currency: v.currency };
  return undefined;
}

/**
 * One path's value, or `undefined` when the record holds none.
 *
 * NOTHING IS COMPUTED HERE THAT THE RECORD DOES NOT ALREADY ANSWER: a declared metric's reading, a
 * stored field, a count `list` already returns. A field is read from the row's OWN properties and only
 * when the register declares it, so `tasks#1.constructor` is nothing rather than the prototype.
 */
function valueAt(deps: PageDeps, path: string): Json | undefined {
  const said = pathOf(path);
  if (!said) return undefined;
  if ('metric' in said) {
    const decl = deps.metric(said.metric);
    const read = decl ? deps.read(decl) : null;
    if (!read?.ok || read.value.value === null) return undefined;
    return read.value.unit ? { amount: read.value.value, currency: read.value.unit } : read.value.value;
  }
  const schema = deps.schemaOf(said.register);
  if (!schema) return undefined;
  if ('count' in said) {
    const listed = deps.list({ register: said.register, limit: 1 });
    return listed.ok ? listed.value.matched : undefined;
  }
  const decl = Object.hasOwn(schema.fields, said.field) ? schema.fields[said.field] : undefined;
  if (!decl || !FIGURES.has(decl.type)) return undefined;
  const listed = deps.list({ register: said.register, where: { field: 'seq', is: said.seq }, limit: 1 });
  const row = listed.ok ? listed.value.rows[0] : undefined;
  return row && Object.hasOwn(row.fields, said.field) ? figure(row.fields[said.field]) : undefined;
}

/** Every path in a block the record holds a value for, or `undefined` when there are none. */
function valuesOf(deps: PageDeps, block: PageBlock): Record<string, Json> | undefined {
  const out: Record<string, Json> = {};
  for (const path of pathsOf(block)) {
    const v = valueAt(deps, path);
    if (v !== undefined) out[path] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The registers ONE block draws from, for a caller deciding whether to blank it.
 *
 * The same walk as `registersOf` over a single block, and it exists because the record checked
 * `block.source` alone: a `stat` block has none, so its readings were never blanked for a caller
 * who cannot read the register behind them.
 */
export function registersOfBlock(block: PageBlock, metric?: (id: string) => MetricDecl | null): string[] {
  return registersOf({ page: '', title: '', blocks: [block] }, metric);
}
