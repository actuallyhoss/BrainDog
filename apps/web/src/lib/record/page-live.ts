/**
 * A declared page on `/p/<slug>`, read from the record, and only from the record.
 *
 * A ROUTE-ONLY MODULE, like `row-live.ts`: the client carries the route table as a value.
 *
 * A REFUSAL IS THE RECORD'S SENTENCE, `UNREACHABLE` AND `UNAUTHORIZED` INCLUDED. Those two drew the
 * in-browser sample's page and kept that for the tab, so a person whose session lapsed read the seeded
 * studio's Desk under their own record's address until they reloaded. The sample is gone now.
 * Every page now asks, and the next one asks again. A page the record does not have is `missing`, with
 * the addresses of the pages it does have.
 *
 * A LIVE PAGE IS DRAWN FROM THE ANSWER AND NOTHING ELSE. Each block the record sent becomes the shape
 * the page's drawing already reads, except a block whose kind is registered (`lib/page/kinds/index.ts`),
 * which keeps the answer whole and is drawn from it by its own module. A block this build cannot draw from
 * that answer carries one plain sentence instead, and is never filled from anything the record did not send.
 *
 * THE DECLARATIONS ARE THE SEED'S COPY, as they are for the list and the row (`remote.ts` says why):
 * a register's labels, a metric's format and target line.
 */

import { createClient, type ClientOptions } from '@braindog/client';
import { COSTS, isBucket, isQuiet, type Bars, type FxRead, type MeasureSeries, type Part, type QueueQuestion, type TargetIn } from '@braindog/kernel';
import { MISSING, integer, money, quantity, since, day as fmtDay } from 'braindog-render';

import { copy } from '../copy.ts';
import type { ActionRow, Outcome } from './actions.ts';
import {
  agentsTable,
  columnHeading,
  decl as fieldOf,
  feedTable,
  historyTable,
  markColumns,
  toRows,
  unnamed,
  walkTable,
  type BlockResult,
  type FeedRow,
  type MeasureLatest,
  type Metric,
  type Walk,
  type WalkStep,
} from './api.ts';
import { REGISTERS } from './held.ts';
import { linkOf } from './blocks.ts';
import { bylineOf } from './byline.ts';
import { METRICS } from './declared.ts';
import { readBoot } from './boot-live.ts';
import { format, fxNote, hrefFor, leadOf, noteOf, partsShown, partsText, targetSaid, walksNote, withParam, type MetricDecl } from './metrics.ts';
import { moneyInText } from './money.ts';
import { entryOf, learn, namesOf, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';
import { REDUCES, SUMS, type PageBlock, type PageDecl } from './schema.ts';
import { compile } from './where.ts';
import { drawerOf } from '../page/kinds/index.ts';
import { pathOf } from '../ui/icons.ts';
import type { BlockResult as Answer } from '@braindog/kernel';

export type Fetch = NonNullable<ClientOptions['fetch']>;

export const liveWords = {
  cannot: 'This part of the page cannot be drawn from the record yet.',
  changed: 'The page changed while it was being read.',
  /**
   * WHAT A REDUCING FIGURE SAYS WHEN THE FIELD IT ADDS UP IS ONE NOBODY HAS FILLED IN.
   *
   * It is the tile's half of the sentence the bar beside it already draws, *"No project in play says
   * what it earns. Put a year on one and it draws here."* That bar can name the field because a
   * declaration wrote its `empty:` for one block; this line is said under any figure, so it names
   * what happened rather than what to type.
   *
   * IT BELONGS IN `copy.ts` AND IS HERE BECAUSE THAT FILE IS ANOTHER AGENT'S THIS RUN. `liveWords`
   * is already the two sentences this path says for itself, so a third sits beside them rather than
   * being written twice; moving it is a rename and nothing else.
   */
  unsaid: copy.nothingMatched,
} as const;

/** A refusal as the record sends one, and only the keys read here. */
type Said = { code: string; fix: string };

/** A reading as the kernel's `metrics.ts` sends one, and only the keys read here. */
type Reading = {
  value: number | null;
  unit: string | null;
  rows: number;
  /**
   * How many rows the list holds at all, which is not `rows` and is what an empty list means here.
   *
   * OPTIONAL BECAUSE A READING BUILT BY HAND HAS ONLY EVER WRITTEN `rows`, the same reason
   * `news-live.ts` leaves it optional: a required key would have made every such reading in
   * `page-live.test.ts` a compile error rather than a repair. Where it is absent the tile falls back
   * to `rows`, which is the old, ambiguous reading of a zero and withholds the verdict rather than
   * inventing one. The record always sends it.
   */
  held?: number;
  met: boolean | null;
  refusals: Said[];
  /**
   * A grouped figure's parts, and how many past the cap were not drawn. `label` is what the record calls a part where its
   * key is not words: the title of the row a ref points at, an enum's declared label. Unchecked, so it is narrowed where
   * it is read; a record on an older kernel sends none.
   */
  groups?: { key: string; value: number | null; parts?: Part[]; label?: unknown }[];
  more?: number;
  /** Money in several currencies not added up, and how a figure across currencies was read. */
  parts?: Part[];
  fx?: FxRead;
  /** A figure converted out of its declared currency: its target, converted at the latest rate. */
  targetIn?: TargetIn;
};

/* `group` IS A GROUPED CARD'S, the row its link points at by handle and title (`PageRow.group`), narrowed by `groupsOf`. */
type Row = RecordRow & { updated_at?: string; group?: unknown };

/**
 * A block as the record's `page` answers it: the declaration, with what the kernel read on it.
 *
 * WHAT THE RECORD CHECKS AND WHAT IT MERELY CARRIES ARE DIFFERENT THINGS, and this type is where that
 * difference is written down rather than cast away. `declare.ts` checks a block's `kind`, `span`,
 * `limit`, `tone`, `fold`, `icon`, `source`, `cells`, `when`, `columns` and `order` when a declaration
 * is installed, so those arrive at the shapes it admits. It does not look at `heading`, `empty`,
 * `body`, `target` or `authored` AT ALL, and `pages.ts` forwards them because they are keys a block
 * may carry. Each of those is `unknown` here and is narrowed once, by the code that puts it on a
 * block, because the app's own `PageBlock` promises a shape nobody checked.
 *
 * THE SAMPLE CANNOT REACH THIS. Its blocks are typed literals in `fixtures/sample.ts`, written in this repo and
 * checked by the compiler. A live block is JSON from a record, and a pack is a thing a stranger
 * wrote, so this path is the only one where a declaration can be a shape the app did not expect.
 */
type Answered = {
  source?: string;
  span?: number;
  limit?: number;
  tone?: PageBlock['tone'];
  /* A SECTION'S `true`, AND ON A GROUPED CARD BLOCK `true` OR HOW MANY OF EACH GROUP SHOW, narrowed below. */
  fold?: unknown;
  icon?: string;
  columns?: { field: string; label?: unknown; width?: string; align?: 'start' | 'end'; as?: string; sign?: { field: string; minus: string }; metric?: unknown }[];
  cells?: { metric: string; label?: unknown; trend?: unknown; note?: unknown }[];
  /* THE KEYS THE RECORD NEVER CHECKED, NAMED RATHER THAN COUNTED. This said THE SIX and listed
     seven, and `label` below makes any count wrong again, so it names them: `kind`, `where`,
     `heading`, `empty`, `body`, `target`, `authored`, and every `label` a column, cell or reading
     carries. `blocks.ts` draws the text ones through `escapeCell`, which is `c.replaceAll(...)`, and
     `authored` through `r.cells.map(escapeCell)`. Anything that is not the shape the app's type
     promises is a TypeError inside the page's own render rather than a block saying it cannot be
     drawn, and a block that throws takes the whole page with it.

     `label` WAS THE ONE LEFT TRUSTED. The kernel now refuses a non-text label at install, so a
     record on this build cannot send one; a record on an older kernel still can, and this is the
     path that reads what a record actually sent rather than what it should have sent. */
  kind?: unknown;
  where?: unknown;
  heading?: unknown;
  empty?: unknown;
  body?: unknown;
  target?: unknown;
  authored?: unknown;
  rows?: Row[];
  matched?: number;
  readings?: { metric: string; label?: unknown; reading: Reading | null; refusal?: Said; trend?: unknown; note?: unknown }[];
  scopes?: (string | null)[];
  rings?: (number | null)[];
  inherited?: number;
  refusals?: Said[];
  drawn?: boolean;
  values?: Record<string, unknown>;
  /** A lead note's line as the model wrote it overnight, sent only while the figures it was written from still hold. */
  said?: unknown;
  [key: string]: unknown;
};

/**
 * A PAGE AS THE RECORD ANSWERS ONE, which is not the same object as a page this app declares.
 *
 * `schema.ts`'s `PageDecl` is a DECLARATION: it carries `blocks`, and it marks `requires` required
 * because a page this app writes names the registers it reads (`rows-write.ts`, and `06 §1.1`, where
 * `requires` is what takes a page out of the nav with the pack that owned its rows). An ANSWER is
 * neither of those things. Its blocks come back beside the declaration and are drawn separately, and
 * `requires` is a key the record sends only when the declaration behind it has one.
 *
 * NAMING THAT DIFFERENCE IS THE POINT. This was one `as unknown as PageDecl` with a `requires: []`
 * in front of it: the app declaring, on the record's behalf, that the page reads no register at all.
 * The cast is what let it through, and a cast that bridges two types silences every other difference
 * between them at the same time.
 */
/**
 * `declared_version` is the version the record holds the page at, which arranging it writes against. `filters` is
 * what the page may be narrowed by, as the record answered it; `filtersOf` (`$lib/page/filters.ts`) reads it.
 */
export type LivePageDecl = Omit<PageDecl, 'blocks' | 'requires'> & { requires?: readonly string[]; declared_version?: number; filters?: unknown; look?: LiveLook };

/**
 * HOW THE ENGINE ARRANGED THE PAGE (`loop/contract-17.md`, the look overlay), as the record answers it beside the
 * blocks: which block leads, the order of the rest by their keys, what it hid, the line it leads with, the one next
 * action, the blocks pinned in place, and who arranged it (the rules, Slash, or the person). The record answers it as
 * `PageResult.look` (`packages/kernel/src/compose.ts` `LookBody`), already applied to the blocks. `kept` names the
 * person who kept what Slash arranged, where the record says it.
 *
 * NARROWED HERE (`lookOf`), because the record checks a look against the block grammar and the app's type still says
 * more than the record checked: a key that is not text is no key, and a look with no `by` is no look at all.
 */
export type LiveLook = {
  /** The page declaration the look is laid over, which every page drawn from one template shares; a look is `look.<page>`. */
  page: string | null;
  basis: string | null;
  lead: string | null;
  order: readonly string[];
  hide: readonly string[];
  headline: string | null;
  next: { row: string; text: string } | null;
  pinned: readonly string[];
  by: 'rule' | 'slash' | 'owner';
  kept: string | null;
};

type AnsweredPage = LivePageDecl & { blocks?: Answered[]; [key: string]: unknown };

/** A block the page draws: the app's `BlockResult`, with what only a live answer carries. */
export type LiveBlock = BlockResult & {
  /** The block's `{{path}}` values as the record answered them. */
  values?: Record<string, unknown>;
  /** An `actions` block's rows, in the shape "Runs on" reads. */
  actions?: ActionRow[];
  /** Set when this build cannot draw the block from a live answer: the one line drawn instead. */
  cannot?: string;
  /**
   * An `inputs` block's: the record's home currency as the kernel answers it beside `types`, or `null` where none is set,
   * which a bare figure typed into an empty money box is written in (`inputs-write.ts` `home`).
   */
  home?: string | null;
  /** A block with a column `as: scope`: what each of those cells draws its chip from (`scopeCellsOf`). */
  scopeCells?: ScopeCells;
  /**
   * WHAT THE BLOCK IS, AS THE RECORD NAMES IT: its declared `key`, or the record's stable hash of its kind, source and
   * heading. A page recomposing follows a block by this and never by its place (`$lib/page/recompose.ts`). Absent from a
   * record older than the look overlay, where the page works one out the same way.
   */
  key?: string;
  /** Who changed each row last, aligned with the rows, as the record answered it (`$lib/page/byline.ts` reads it). */
  changes?: unknown[];
};

/** The mark and hue of the project a row applies to, as the kernel answers them beside `scopes` (`scope_marks`). */
export type ScopeMark = { mark: string | null; hue: number | null };

/**
 * WHAT A SCOPE CELL DRAWS ITS CHIP FROM, handed to the renderer beside the block.
 *
 * `columns` are the indexes of the columns declared `as: scope`; a cell there holds the project's name, or
 * `everywhere`. `marks` is each name's mark and hue, and `glyph` the globe's path, which the renderer draws for
 * everywhere because it ships no glyph art of its own (05 §3).
 *
 * BY NAME, AND NOT BY ROW, because a board or a checklist keeps a row somebody just moved where they left it
 * (`page-writes.ts` `keptSegment`), so a list aligned with the rows as read would hand a card another row's mark. A
 * name is the cell's own text wherever the row ends up.
 *
 * THE RENDERER READS THE SAME SHAPE under the same name (`packages/render/svelte/p/Table.svelte`, `Cards.svelte`),
 * and it is written out there rather than imported, because this app's modules are not the render package's to read.
 */
export type ScopeCells = { columns: readonly number[]; everywhere: string; glyph: string | null; marks: ReadonlyMap<string, ScopeMark> };

export type LivePage = { page: LivePageDecl; blocks: LiveBlock[] };

export type Opened =
  | { from: 'live'; page: LivePage; now: number }
  | { from: 'missing'; held: { address: string; title?: string }[] }
  | { from: 'refused'; fix: string };

/** What a scope cell reads for a row that applies to every project, as the sample says it. */
const EVERYWHERE = 'Everywhere';

/**
 * One row's half of `scope_marks`, narrowed: a mark that is words, and a hue that is a whole degree on the wheel, else
 * `null` in that half. The kernel checks both (`pages.ts` `markOf`); a record on another build is read, not trusted.
 */
const scopeMarkOf = (v: unknown): ScopeMark | null => {
  if (!isObject(v)) return null;
  const { mark, hue } = v;
  return {
    mark: typeof mark === 'string' && mark.trim() !== '' ? mark : null,
    hue: typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue <= 359 ? hue : null,
  };
};

/**
 * What a block's scope cells draw their chips from, or nothing for a block with no column `as: scope`.
 *
 * THE MARK IS READ BESIDE THE NAME THE CELL ALREADY HOLDS, from `scope_marks`, which the kernel reads off the same
 * project rows as `scopes`, so a chip and the words in it never come from two reads. A `scope_marks` that is not one
 * entry a row is left out whole, and the cells keep their words with no mark.
 */
function scopeCellsOf(columns: readonly { as?: unknown }[], rows: readonly { cells: (string | null)[] }[], said: unknown): ScopeCells | undefined {
  const at = columns.flatMap((c, i) => (c.as === 'scope' ? [i] : []));
  if (at.length === 0) return undefined;
  const each = Array.isArray(said) && said.length === rows.length ? said : [];
  const marks = new Map<string, ScopeMark>();
  rows.forEach((row, n) => {
    const mark = scopeMarkOf(each[n]);
    if (!mark) return;
    for (const i of at) {
      const name = row.cells[i];
      if (typeof name === 'string' && name !== '' && name !== EVERYWHERE) marks.set(name, mark);
    }
  });
  return { columns: at, everywhere: EVERYWHERE, glyph: pathOf('globe', undefined) ?? null, marks };
}

/** The register a block's rows belong to, when it has one this build can draw. */
function registerOf(b: Answered): string | null {
  if (b.source === 'sessions.live') return 'session';
  /* AN `inputs` BLOCK NAMES ITS LIST AS `register:`, as a capture does, and has no `source:`. Without this the page read
     never asked for a pack's list before drawing one, and every such block came back as the line saying it cannot be
     drawn, on the first record that had not already opened that list somewhere else. */
  if (b.kind === 'inputs') return typeof b.register === 'string' && b.register !== '' ? b.register : null;
  return b.source?.startsWith('register.') ? b.source.slice('register.'.length) : null;
}

/**
 * WHAT A GROUPED FIGURE'S PARTS ARE KEYED BY: the list the figure reads and the field it groups by, from this build's copy
 * of the figure (`METRICS`). `null` for a block over anything else, and for a figure this build does not declare, whose
 * parts are named by the record's own `label` or by their keys.
 */
function groupedBy(b: Answered): { register: string; field: string } | null {
  if (typeof b.source !== 'string' || !b.source.startsWith('metric.')) return null;
  const id = b.source.slice('metric.'.length);
  const at = id.indexOf(':');
  const figure = METRICS[at < 0 ? id : id.slice(0, at)];
  const by = figure?.group_by;
  if (!figure || typeof by !== 'string' || !figure.source.startsWith('register.')) return null;
  return { register: figure.source.slice('register.'.length), field: by };
}

/**
 * THE LIST A GROUPED FIGURE'S KEYS POINT AT, when it groups by a ref, or `null`. Such a key is the ULID the record stores
 * the ref as, which is the one string a person must never read: Cash now by book drew "Book #01M3VMPSHV07AM4S51WDTFM5XG".
 */
function partsTarget(b: Answered): string | null {
  const by = groupedBy(b);
  const f = by ? fieldOf(by.register, by.field) : undefined;
  return f?.type === 'ref' && typeof f.to === 'string' && f.to !== '' ? f.to : null;
}

/** The label the record gave a part, when it is words. */
const labelled = (g: { label?: unknown }): string | null => (typeof g.label === 'string' && g.label.trim() !== '' ? g.label.trim() : null);

/** Whether the record named every part of a grouped figure itself, so no list has to be walked to name them here. */
const partsNamed = (b: Answered): boolean => (b.readings?.[0]?.reading?.groups ?? []).every((g) => labelled(g) !== null);

/**
 * A PART'S NAME, NEVER ITS KEY WHEN THE KEY IS AN ID: the record's `label`, else the title of the row the key points at,
 * else that row said as its kind and number, and a key whose row this reader cannot reach as the kind alone ("Unnamed
 * book", `unnamed`). A key that is a word (an enum's value, a name) keeps the record's label as it came, and `blocks.ts`
 * says it as its field says it first, which knows the person's own word for a value.
 */
function partName(g: { key: string; label?: unknown }, target: string | null, refs: ReadonlyMap<string, RefMap>): string | undefined {
  const said = labelled(g);
  if (said !== null) return said;
  if (target === null) return undefined;
  const map = refs.get(target);
  const seq = map?.seqOf.get(g.key);
  if (seq === undefined) return unnamed(target, g.key);
  return map?.titleOf.get(seq) ?? unnamed(target, seq);
}

/** A string the record did not have to check, or nothing. */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** A block's `fold:` as the app reads it: `true`, or a whole number of cards above nought. Anything else is no fold. */
const foldOf = (v: unknown): boolean | number | undefined => (typeof v === 'boolean' || (typeof v === 'number' && Number.isInteger(v) && v > 0) ? v : undefined);

/**
 * The roles a DECLARATION may give a column, which are the roles `declare.ts` admits (`CARD_ROLES` there).
 *
 * `braindog-render`'s own `CARD_ROLES` has one more, `quiet`, and its comment says why it is not one of
 * these: the evaluator writes `quiet` from the record's clock, and a declaration does not name it.
 *
 * `next` AND `reply` CAME WITH THE CARD ROLES, AND THIS LIST DROPPED BOTH. The kernel admitted them and answered `nexts`, the
 * renderer drew "Next: ...", and a card declared `{ field: 'what', as: 'next' }` reached the fence as `fact: Next` over
 * the card's own `what`: "The first piece" where the record had answered "Sample the fit" (`dynamic-app.test.ts`).
 * `scope` is not a role either. It says what the cell HOLDS, which this file settles from `scopes`
 * before anything is drawn, so it is not carried onto the column.
 *
 * A WORD THAT IS NEITHER IS DROPPED RATHER THAN ASSERTED. The record refuses one at install, so this
 * is the second half of a check rather than the only one, and `as Column[]` was the app promising a
 * closed set about a string it had not looked at.
 */
const ROLES = ['title', 'figure', 'fact', 'trend', 'ring', 'who', 'when', 'mark', 'next', 'reply', 'hue', 'picture'] as const;
const roleOf = (v: unknown): (typeof ROLES)[number] | undefined => ROLES.find((r) => r === v);

const columnsOf = (b: Answered) => {
  /* THE REGISTER SAYS WHICH COLUMNS ARE FIGURES, AND UNTIL NOW THIS PATH GUESSED FROM THE NAME.
     It matched `amount` or `cost`, which are the only two money fields any page currently
     declares, so nothing on screen was wrong. It was one pack away from being wrong in both
     directions: `revenue` and `rate` are declared money and were drawn as ordinary text, and a
     text field called `cost_centre` would have been drawn as a figure.

     THE COST IS NOT ONLY AN ELLIPSIS. A truncated figure reads as a smaller number rather than as
     damage (13 §4.2), and `truncate: 'never'` is also how `cardPlan` and `cardRoles` pick which
     column is a card's figure, so a money column this missed was demoted to a fact on every phone.

     The sample path was fixed in `d666678` to ask `decl`. This asks the same function rather than
     a second copy of the same guess, which is how the two halves came to disagree in the first
     place. A block over no register has nothing to ask and truncates as the text it is drawn as. */
  const register = registerOf(b) ?? '';
  return (b.columns ?? []).map((c) => {
    /* A SCOPE COLUMN ON A CARD IS A FACT: the cell says where the row applies, filled from `scopes` below, and the
       renderer draws it as a chip from the block's `scopeCells`. */
    const as = c.as === 'scope' && b.kind === 'cards' ? 'fact' : roleOf(c.as);
    return {
      field: c.field,
      /* A card's trend column reads a `metric:` and names no field, so with no label of its own it is headed by nothing. */
      label: columnHeading(register, { field: c.field ?? '', label: str(c.label) }),
      width: c.width ?? 'minmax(12ch,1fr)',
      align: c.align ?? 'start',
      truncate: fieldOf(register, c.field)?.type === 'money' ? ('never' as const) : ('end' as const),
      ...(as === undefined ? {} : { as }),
    };
  });
};

/**
 * One figure of a `stat` block, as a tile.
 *
 * THE VERDICT IS THE RECORD'S (`met`), and a figure over an empty list carries none, because a tick
 * over an empty list is a verdict on nothing. The label, the format and the target line are the
 * declaration's.
 *
 * AN EMPTY LIST IS `held === 0` AND NOT `rows === 0`, and the difference is the whole of it. `rows` is
 * what the predicate matched and `held` is what the list holds at all, so nothing overdue over forty
 * invoices and nothing overdue over a list nobody has written to came through here as the same tile.
 * This is the renderer the live pages use, `/p/<slug>` among them, and it was the one left keying off
 * `rows` after `news-live.ts` was moved: driven in `engines.test.ts` over one kernel reading,
 * `{rows: 0, held: 40}`, Home answered `tone: "good"` with a link and this answered no verdict and no
 * link. One figure, two screens, two answers — and the project page is the screen the kernel's own
 * narrowing of `held` was written for, so it was the screen most likely to be asked.
 *
 * AND THERE IS A THIRD STATE BETWEEN THOSE TWO, which `unsaid` below is: a list that holds rows where
 * not one of them carries the field the figure adds up. Its own paragraph says what that drew.
 */
/** The four aggregations that reduce a FIELD to one number. A count reads rows and is not one of them. */
const REDUCING = ['sum', 'avg', 'min', 'max'] as const;

/** The fields a figure adds up, averages or takes a bound of, both halves of a pair included. */
function reducedFields(value: MetricDecl['value']): string[] {
  const halves: unknown[] = 'diff' in value ? [value.diff.of, value.diff.per] : 'ratio' in value ? [value.ratio.of, value.ratio.per] : [value];
  return halves.flatMap((half) => {
    const said = isObject(half) ? half : {};
    return REDUCING.flatMap((word) => {
      const operand = said[word];
      if (typeof operand === 'string') return [operand];
      /* A ROW-LEVEL PRODUCT reduces over the field it multiplies, which is the first half of `product`. */
      const product = isObject(operand) && Array.isArray(operand.product) ? operand.product[0] : null;
      return typeof product === 'string' ? [product] : [];
    });
  });
}

/**
 * WHETHER A FIGURE'S OWN PREDICATE REQUIRES THE FIELD IT REDUCES OVER TO BE FILLED IN.
 *
 * THIS IS THE LINE BETWEEN THE TWO ZEROES, and it is narrow on purpose. `out-30d` sums `amount`
 * where the obligation is open and due inside a month: nothing matched over forty obligations is
 * GBP 0.00 owed, which is the answer that figure exists to give, and it keeps its verdict and its
 * door. `projects-earning` sums `revenue` where `revenue is set`: nothing matched means no row
 * carries the number being added up, so its zero is the absence of an answer rather than one.
 *
 * `compile` IS ASKED RATHER THAN THE SENTENCE BEING READ A SECOND TIME. The same rule written twice
 * is what `metrics.ts` and the kernel's `scopeOf` are still paying for (`50 §1`), and the grammar
 * spells this clause three ways, `is set`, `is present` and `is not empty`, all of which compile to
 * one `present` clause. A register the app has no declaration for compiles to no clauses, so the
 * tile answers as it did before rather than guessing.
 */
function overUnsaidField(decl: MetricDecl): boolean {
  const register = decl.source.startsWith('register.') ? decl.source.slice('register.'.length) : null;
  if (register === null) return false;
  const reduced = reducedFields(decl.value);
  if (reduced.length === 0) return false;
  return compile(register, decl.where).clauses.some((c) => c.op === 'present' && reduced.includes(c.field));
}

const isTarget = (v: unknown): v is { lte: number } | { gte: number } =>
  typeof v === 'object' && v !== null && (typeof (v as { lte?: unknown }).lte === 'number' || typeof (v as { gte?: unknown }).gte === 'number');

export function tileOf(cell: NonNullable<Answered['readings']>[number], values?: Record<string, unknown>, missed: 'warn' | 'bad' = 'warn'): Metric {
  const at = cell.metric.indexOf(':');
  const template = METRICS[at < 0 ? cell.metric : cell.metric.slice(0, at)];
  const built = template && at >= 0 ? withParam(template, cell.metric.slice(at + 1)) : template;
  /* THE TARGET IS THE RECORD'S, which a use case may have set for a person (`install.ts` `MODULE_TARGETS`); the build's
     declaration only says it when the record did not. */
  const held = (cell as { target?: unknown }).target;
  const decl = built && isTarget(held) ? { ...built, target: held } : built;
  const label = str(cell.label) ?? decl?.name ?? cell.metric;
  const r = cell.reading;
  /* A FIGURE IN SEVERAL CURRENCIES IS EACH AMOUNT IN ITS OWN, never a blank, and says why it is not one number. */
  const across = r ? fxNote(r) : null;
  const said = (fallback: string) =>
    typeof cell.note === 'string'
      ? noteOf(cell.note, (id) => {
          const v = values?.[id];
          if (typeof v === 'number') return format(METRICS[id]?.format, v);
          return resolverOf(values)(id);
        })
      : fallback;
  if (r && r.parts && !cell.refusal && r.refusals.length === 0)
    return { id: cell.metric, label, value: partsShown(decl?.format, r.parts), note: [said(''), across].filter(Boolean).join(' · ') };
  if (!r || r.value === null || cell.refusal || r.refusals.length)
    return { id: cell.metric, label, value: MISSING, note: copy.figureUnavailable, tone: 'warn' };
  const empty = (r.held ?? r.rows) === 0;
  /**
   * AND THE STATE BETWEEN THE TWO: THE LIST HOLDS ROWS, AND NOT ONE OF THEM HAS SAID.
   *
   * The rule above is the kernel's, written for a COUNT, and its own words are that zero matched
   * over rows that exist is good news (`packages/kernel/src/metrics.ts`). A REDUCING figure turns
   * that sentence over. A sum of no values is zero and the kernel means it to be, so `GBP 0.00` is
   * the same number whether a portfolio earned nothing or nobody has written down what it earns,
   * and `target: { gte: 0 }` on a money sum is met by every value such a sum can take, which is the
   * decoration a target is refused at install for being. So `met: true` carried no measurement and
   * the tile drew a tick anyway.
   *
   * MEASURED AT HIS SIZE, on a record built to it: 27 projects, 14 in
   * play, a monthly figure held for three of them and `revenue` unset on every row, because the
   * importer files a monthly figure as a reading and has no year to write. After `a89bc072` put
   * `revenue is set` on the Earning figures the reading is `rows: 0, held: 27`, and this renderer
   * answered `tone: "good"` with `href: /r/things?f=lane:in:building,earning&f=revenue:is:set` —
   * a green GBP 0.00 with a door into a list of no rows, on the first screen he opens about his
   * portfolio, in the same block row as a bar correctly drawing "No project in play says what it
   * earns." One page, two blocks, two answers.
   *
   * THE TONE AND THE DOOR GO AND THE SENTENCE ARRIVES, which is what `api.ts` already does for the
   * empty register a few lines from its own `held === 0`. The figure itself stays: a total of
   * nothing is zero, and it is the verdict on it that was invented.
   */
  const unsaid = !empty && r.rows === 0 && decl !== undefined && overUnsaidField(decl);
  const met = empty || unsaid ? null : r.met;
  /* NO DOOR OVER NO ROWS, AND NONE FOR A FIGURE THAT READS NO LIST: `hrefFor` answers `null` there, where it used to
     answer Money's page on every record. */
  const door = decl && !empty && !unsaid ? hrefFor(decl) : null;
  /* THE LINE IS THE RECORD'S SERIES, and only numbers and gaps are drawn: anything else is not a day. */
  const trend = Array.isArray(cell.trend) && cell.trend.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v))) ? (cell.trend as (number | null)[]) : undefined;
  return {
    id: cell.metric,
    label,
    ...(trend ? { trend } : {}),
    /* A CURRENCY CODE IS MONEY AND ANY OTHER UNIT IS A QUANTITY. Every unit went to `money`, so a
       sum of 150 kg drew `KG 1.50` and 12.5 hours drew `H 0.13`. */
    value: !r.unit
      ? format(decl?.format, r.value)
      : /^[A-Z]{3}$/u.test(r.unit)
        ? money(Math.round(r.value), r.unit)
        : quantity(r.value, r.unit),
    /* A NOTE THE CELL DECLARES is said instead of the target, each figure it names formatted as declared, and a converted
       figure says as of which day's rates. */
    note: [said(unsaid ? liveWords.unsaid : decl ? targetSaid(decl, r) : ''), across].filter(Boolean).join(' · '),
    /* A MISSED TARGET IS AMBER, and red only on a tile its page declared `bad`: the day the cash runs out. */
    tone: met === null ? undefined : met ? 'good' : missed,
    ...(door ? { href: door } : {}),
    /* AND IT SAYS SO, so a page being read leaves the tile out: "Earning £0" over projects none of which says what it
       earns is no figure at all. A page being arranged still draws it, with the sentence. */
    ...(unsaid ? { unsaid: true } : {}),
    /* AND A FIGURE OVER A LIST THAT HOLDS NOTHING SAYS THAT TOO, only where the record counted it (`held`): an empty Work
       drew "Done in 7 days 0" under eight tiles each saying the list held nothing. */
    ...(r.held === 0 ? { nothingHeld: true } : {}),
  };
}

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const count = (v: unknown): number => (typeof v === 'number' ? v : 0);
const STATES: readonly ActionRow['state'][] = ['pending', 'firing', 'paused', 'done'];

/** One row of an `actions` block, back in the shape the actions read gives "Runs on". */
export function actionOf(fields: Record<string, unknown>): ActionRow {
  const at = text(fields.last_at);
  const state = STATES.find((s) => s === fields.state) ?? 'pending';
  return {
    ingest: String(fields.ingest ?? ''),
    channel: fields.channel === 'pull' || fields.channel === 'call' ? fields.channel : 'poll',
    project: text(fields.project),
    host: text(fields.host),
    every: String(fields.every ?? ''),
    key: text(fields.key),
    state,
    next: text(fields.next),
    last: at
      ? { at, outcome: (text(fields.last_outcome) ?? 'ok') as Outcome, status: typeof fields.last_status === 'number' ? fields.last_status : null, note: text(fields.last_note) ?? '' }
      : null,
    month: { runs: count(fields.runs), requests: 0, bytes: 0, failures: count(fields.failures), held: 0 },
    days: [],
  };
}

/** The four intents a row may carry, as `schema.ts` spells them and `05 §7.4` publishes them. */
const TONE_WORDS = ['good', 'warn', 'bad', 'info'] as const;

/**
 * The rows somebody WROTE on a block, when they are rows a renderer can draw.
 *
 * `05 §2` makes authored rows the norm in the dialect, and `declare.ts` does not check them: a pack
 * declaring `authored: "two"`, or one row of it without a `cells` list, installs cleanly and reaches
 * `r.cells.map(escapeCell)`. A row that is not the shape the app's type promises is left out, so the
 * block draws the rows that ARE rows instead of the page failing on the one that is not.
 */
function authoredOf(v: unknown): PageBlock['authored'] {
  if (!Array.isArray(v)) return undefined;
  const rows = v.flatMap((r) => {
    const said = r !== null && typeof r === 'object' ? (r as { cells?: unknown; tone?: unknown }) : null;
    if (!Array.isArray(said?.cells)) return [];
    const cells = said.cells.filter((c): c is string => typeof c === 'string');
    if (cells.length !== said.cells.length) return [];
    const tone = TONE_WORDS.find((t) => t === said.tone);
    return [{ cells, ...(tone === undefined ? {} : { tone }) }];
  });
  return rows.length ? rows : undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStep = (v: unknown): v is WalkStep =>
  isObject(v) && typeof v.day === 'string' && typeof v.label === 'string' && Number.isFinite(v.delta) && Number.isFinite(v.balance) && typeof v.source === 'string';

/** A `series` block's `bars`, when they are what the record's `barsOf` sends: every line as long as the keys. */
function barsOf(v: unknown): Bars | null {
  if (!isObject(v) || !Array.isArray(v.keys) || !v.keys.every((k) => typeof k === 'string')) return null;
  const n = v.keys.length;
  const cell = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x));
  if (!Array.isArray(v.values) || !v.values.every((line) => Array.isArray(line) && line.length === n && line.every(cell))) return null;
  if (!Array.isArray(v.states) || v.states.length !== n || !v.states.every((s) => s === '' || s === 'partial' || s === 'due' || s === 'ahead')) return null;
  if (!isBucket(v.bucket) || typeof v.current !== 'string') return null;
  /* ONE CHART A CURRENCY, when the record lined the lines up once per currency: each as long as the keys, or none. */
  const split = Array.isArray(v.split)
    ? v.split.filter((t): t is { unit: string; values: (number | null)[][] } =>
        isObject(t) && typeof t.unit === 'string' && Array.isArray(t.values) && t.values.every((line) => Array.isArray(line) && line.length === n && line.every(cell)),
      )
    : [];
  return {
    bucket: v.bucket,
    current: v.current,
    keys: v.keys,
    states: v.states,
    values: v.values,
    unit: typeof v.unit === 'string' ? v.unit : null,
    ...(split.length > 0 ? { split } : {}),
  };
}

/** A forecast's remembered points, when they are points: a day and a number each. Anything else is none. */
function pastOf(v: unknown): { at: string; value: number }[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((p): p is { at: string; value: number } => isObject(p) && typeof p.at === 'string' && typeof p.value === 'number' && Number.isFinite(p.value));
}

/** A `forecast.runway` block's `walk`, when it is one. The record builds it; a record on another build may not have. */
function walkOf(v: unknown): Walk | null {
  if (!isObject(v) || !Array.isArray(v.steps) || !v.steps.every(isStep) || !Number.isFinite(v.from)) return null;
  return {
    from: v.from as number,
    currency: typeof v.currency === 'string' ? v.currency : null,
    steps: v.steps,
    crossed: isStep(v.crossed) ? v.crossed : null,
    /* A WALK OF SEVERAL, one a currency, carries its own remembered cash. */
    ...(pastOf(v.past) ? { past: pastOf(v.past)! } : {}),
    /* THE WALK'S OWN LENGTH, `horizon: 'last'` resolved (kernel's `Runway.horizon`), for the horizon knob's readout. */
    ...(typeof v.horizon === 'number' ? { horizon: v.horizon } : {}),
    /* AND HOW FAR IT WALKED PAST THAT, which the length control offers up to (`reach` rows, `blocks.ts`). */
    ...(typeof v.reach === 'number' && Number.isInteger(v.reach) && v.reach > 0 ? { reach: v.reach } : {}),
  };
}

/** The longest key a block or a look may carry: a key is a handle, never a paragraph. */
const KEY_MOST = 160;

/** A block's key as the record answered it, when it is one: short text with something in it. */
export function keyOf(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' && v.length <= KEY_MOST ? v : null;
}

/** Keys as the record answered them, each once, in its order; anything that is not a key is left out. */
const keysOf = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(keyOf).filter((k): k is string => k !== null))] : []);

const LOOK_BY: readonly LiveLook['by'][] = ['rule', 'slash', 'owner'];

/**
 * A page's look as the record answered it, or `null` where it sent none or one this build cannot read. One with no
 * `by` is none: who arranged a page is what decides whether a person is offered Undo, and a guess at it would offer
 * Undo on the person's own arrangement.
 */
export function lookOf(v: unknown): LiveLook | null {
  if (!isObject(v)) return null;
  const by = LOOK_BY.find((w) => w === v.by);
  if (!by) return null;
  const said = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);
  const next = isObject(v.next) && keyOf(v.next.row) !== null && said(v.next.text) !== null ? { row: v.next.row as string, text: said(v.next.text)! } : null;
  return {
    page: typeof v.look === 'string' && /^[a-z][a-z0-9_-]{0,63}$/u.test(v.look) ? v.look : null,
    basis: said(v.basis),
    lead: keyOf(v.lead),
    order: keysOf(v.order),
    hide: keysOf(v.hide),
    headline: said(v.headline),
    next,
    pinned: keysOf(v.pinned),
    by,
    kept: said(v.kept),
  };
}

const FEED_BY: readonly FeedRow['by'][] = ['agent', 'rule', 'you'];
const textOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

/** An `activity` block's `feed`, when every row is one the renderer can file under a group. */
function feedOf(v: unknown): FeedRow[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (r) =>
      isObject(r) && FEED_BY.includes(r.by as FeedRow['by']) && Number.isFinite(r.count) && typeof r.at === 'string' &&
      textOrNull(r.who) && textOrNull(r.kind) && textOrNull(r.target) && textOrNull(r.note) && (r.thing === undefined || textOrNull(r.thing)) &&
      (r.things === undefined || (Array.isArray(r.things) && r.things.every((t) => typeof t === 'string'))),
  );
  return ok ? (v as FeedRow[]) : null;
}

/**
 * A `queue` block's questions, when every one of them is a question a person can be shown.
 *
 * Checked field by field for the reason `feedOf` is: what arrives here is whatever a record sent, and
 * a question drawn with `undefined` where its options should be is worse than a block that says it
 * cannot be drawn. An option missing any of its four parts drops the whole question rather than the
 * option, because a choice that quietly lost one of its ways to answer is a different choice.
 */
function queueOf(v: unknown): QueueQuestion[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (q) =>
      isObject(q) &&
      typeof q.id === 'string' &&
      typeof q.who === 'string' &&
      typeof q.at === 'string' &&
      typeof q.kind === 'string' &&
      typeof q.question === 'string' &&
      typeof q.why === 'string' &&
      /* THE BAND IS CHECKED AGAINST THE FOUR, not merely for being a string. It is the ranking, and a
         record a version ahead that sent a fifth band would otherwise have its whole queue drawn in an
         order this build could not explain. A record a version BEHIND sends no band at all, which is
         why absent is allowed and a wrong one is not. */
      (q.cost === undefined || (typeof q.cost === 'string' && (COSTS as readonly string[]).includes(q.cost))) &&
      Array.isArray(q.options) &&
      q.options.every((o) => isObject(o) && typeof o.key === 'string' && typeof o.label === 'string' && typeof o.because === 'string' && typeof o.recommended === 'boolean'),
  );
  return ok ? (v as QueueQuestion[]) : null;
}

/** A `diff` block's `history`, newest first, when every version is text. */
function historyOf(v: unknown): { at: string; by: string; text: string }[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((h) => isObject(h) && typeof h.at === 'string' && typeof h.by === 'string' && typeof h.text === 'string')
    ? (v as { at: string; by: string; text: string }[])
    : null;
}

/**
 * Who changed row `n` last, as the kernel sent it, in the words the sample's column uses: a person is you, a rule is
 * named as a rule, and an agent by its name.
 */
function changeOf(changes: unknown, n: number): { by: string; at: string } | null {
  const c = Array.isArray(changes) ? (changes[n] as unknown) : null;
  if (!isObject(c) || typeof c.who !== 'string' || typeof c.at !== 'string') return null;
  const by = c.by === 'you' ? 'you' : c.who.replace(/^rule:/u, 'rule.').replace(/^agent:/u, '');
  return { by, at: c.at };
}

/**
 * Each card's group by name, aligned with the rows, or `null` when the record said none.
 *
 * ON THE ROW, as the record answers it now: `{ value: 'organisations#7', name: 'Encore' }`, and `value: ''` for a card
 * that points at nothing, which is no group. A record that put no group on any row is read through the names it sent
 * beside the rows, as an older build did; neither, and the page reads the names from `names` (`blocks.ts`).
 */
function groupsOf(rows: readonly Row[], beside: unknown): (string | null)[] | null {
  if (rows.some((r) => isObject(r.group)))
    return rows.map((r) => {
      const g = r.group;
      return isObject(g) && typeof g.value === 'string' && g.value !== '' && typeof g.name === 'string' && g.name.trim() !== '' ? g.name.trim() : null;
    });
  if (Array.isArray(beside) && beside.length === rows.length) return beside.map((g) => (typeof g === 'string' && g.trim() !== '' ? g : null));
  return null;
}

/** A series the record sent, when it is one: a name, a unit, aligned buckets, and numbers or gaps. */
function isSeries(v: unknown): v is MeasureSeries {
  if (v === null || typeof v !== 'object') return false;
  const m = v as Partial<MeasureSeries>;
  const numbers = (a: unknown) => Array.isArray(a) && a.every((x) => x === null || (typeof x === 'number' && Number.isFinite(x)));
  return (
    typeof m.name === 'string' &&
    typeof m.unit === 'string' &&
    (m.bucket === 'day' || m.bucket === 'week') &&
    Array.isArray(m.keys) &&
    m.keys.every((k) => typeof k === 'string') &&
    numbers(m.now) &&
    numbers(m.was) &&
    m.now!.length === m.keys.length &&
    m.was!.length === m.keys.length &&
    (m.latest === null || (typeof m.latest === 'object' && typeof m.latest?.value === 'number' && typeof m.latest.day === 'string' && typeof m.latest.at === 'string'))
  );
}

/**
 * A `lines` block's measures read once, when the record sent them: a name, a finite number, a unit and the instant and
 * day it was read. One that is not is left out, and the rest are drawn.
 */
function latestOf(v: unknown): MeasureLatest[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (m): m is MeasureLatest =>
      isObject(m) &&
      typeof m.measure === 'string' &&
      typeof m.value === 'number' &&
      Number.isFinite(m.value) &&
      typeof m.unit === 'string' &&
      typeof m.at === 'string' &&
      typeof m.day === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/u.test(m.day),
  );
}

/** One answered block as the page draws it. */
export function blockOf(b: Answered, refs: ReadonlyMap<string, RefMap>, now: number, me: string | null = null, names: ReadonlyMap<string, string> = new Map()): LiveBlock {
  const {
    kind: _kind,
    where: _where,
    heading: _heading,
    empty: _empty,
    body: _body,
    target: _target,
    authored: _authored,
    cells: _cells,
    columns: _columns,
    /* THE KEYS THE RECORD DOES CHECK, taken by name so each is present only when it has a value.
       `exactOptionalPropertyTypes` draws the distinction the spread of an optional key erases: a
       `tone` that is absent and a `tone` that is explicitly `undefined` are different objects, and
       only the first is what `heading?: string` means. */
    source,
    span,
    limit,
    tone,
    fold,
    icon,
    rows: got = [],
    matched = 0,
    readings,
    scopes,
    /* EACH ROW'S PROJECT MARK, taken by name so it reaches the page narrowed on `scopeCells` and never raw through `rest`. */
    scope_marks: scopeMarked,
    rings,
    inherited,
    refusals = [],
    values,
    drawn,
    walk: walked,
    walks: walkedApart,
    walkFx,
    feed: fed,
    queue: waiting,
    seen: mark,
    history: versions,
    bars: barred,
    changes: changed,
    working: onIt,
    working_now: atWork,
    past: remembered,
    measures: measured,
    /* THE MEASURES READ ONCE, beside the lines, taken by name and narrowed below so none rides through `rest` unchecked. */
    latest: readOnce,
    /* A CAPTURE'S LIST AND WHAT A NEW ROW IN IT IS FILLED WITH, taken by name so neither rides through `rest`
       unchecked: `fills` is what a press writes, so a value in it the app did not look at is a value it would store. */
    register: into,
    fills: filled,
    /* WHAT A BUILT PAGE'S FORMS ARE DRAWN FROM, taken by name and narrowed below, so a record on another
       build that sent one in a shape this cannot read draws the plain form rather than a wrong one. */
    nexts: nexted,
    /* EACH CARD'S TREND, a run of numbers a card, taken by name and narrowed into its cell below. */
    trends: trended,
    types: typed,
    home: homeSaid,
    done_now: doneNow,
    next: nextAt,
    open: openSteps,
    /* THE MODEL'S LINE FOR A LEAD NOTE, taken by name so it never rides through `rest` onto a block that is not one. */
    said: modelSaid,
    /* WHAT THE BLOCK IS, taken by name and narrowed by `keyOf`, so a page never keys its blocks by something that is not text. */
    key: keyed,
    /* WHAT A CARD BLOCK'S CARDS ARE GROUPED BY, AND EACH CARD'S GROUP BY NAME, taken by name and narrowed below. */
    group: grouped,
    groups: groupNames,
    ...rest
  } = b;

  /* NARROWED ONCE, HERE, because the record does not check any of these and the app's type says it
     does. A key that is not what it claims to be is left off the block rather than put on it: the
     page then draws a block that is missing a heading, which is visible, instead of throwing inside
     the renderer, which takes every other block on the page with it. */
  const kind = str(b.kind) ?? '';
  const heading = str(b.heading);
  const where = str(b.where);
  const empty = str(b.empty);
  const body = str(b.body);
  const target = typeof b.target === 'number' && Number.isFinite(b.target) ? b.target : undefined;
  const authored = authoredOf(b.authored);
  /* A FIGURE'S LABEL IS THE RECORD'S OR ITS OWN NAME. The record checks that a cell names a metric
     and does not check that it carries a label, and the app's type says every cell has one. */
  const cells = b.cells?.map((c) => ({
    metric: c.metric,
    label: str(c.label) ?? c.metric,
    ...(typeof c.trend === 'string' ? { trend: c.trend } : {}),
    ...(typeof c.note === 'string' ? { note: c.note } : {}),
  }));

  /* THE DECLARATION'S COLUMNS ARE REPLACED BY DRAWN ONES, and everything the record sent that this
     file does not name rides through untouched, so a key a later kernel adds is carried rather than
     dropped. */
  const shell: LiveBlock = {
    ...rest,
    /* WHO CHANGED EACH ROW, aligned with the rows, put back on the block so a page draws its bylines and tints
       (`$lib/page/byline.ts` narrows each one itself). */
    ...(Array.isArray(changed) ? { changes: changed } : {}),
    kind,
    ...(source === undefined ? {} : { source }),
    ...(span === undefined ? {} : { span }),
    ...(limit === undefined ? {} : { limit }),
    ...(tone === undefined ? {} : { tone }),
    ...(foldOf(fold) === undefined ? {} : { fold: foldOf(fold)! }),
    ...(kind === 'cards' && typeof grouped === 'string' && grouped !== '' ? { group: grouped } : {}),
    ...(icon === undefined ? {} : { icon }),
    ...(heading === undefined ? {} : { heading }),
    ...(where === undefined ? {} : { where }),
    ...(empty === undefined ? {} : { empty }),
    ...(body === undefined ? {} : { body }),
    ...(target === undefined ? {} : { target }),
    ...(authored === undefined ? {} : { authored }),
    ...(cells === undefined ? {} : { cells }),
    register: undefined,
    /* THE CAST IS `schema.ts`'S ROLE LIST BEING TWO SHORT: it still names the eight roles and `scope`, and the renderer's
       `Column` and the kernel both take `next` and `reply`. The two words belong in that file. */
    columns: columnsOf(b) as LiveBlock['columns'],
    entries: [],
    matched: [],
    refusals: refusals.map((r) => r.fix),
    rows: [],
    shown: 0,
    total: 0,
    drawn: drawn !== false,
    stale_at: new Date(now).toISOString(),
    metrics: undefined,
    ...(values ? { values } : {}),
    ...(keyOf(keyed) === null ? {} : { key: keyOf(keyed)! }),
  };
  const cannot: LiveBlock = { ...shell, cannot: liveWords.cannot };

  if (refusals.length || drawn === false) return shell;
  /* A REGISTERED KIND IS DRAWN FROM THE ANSWER AS THE RECORD SENT IT (`lib/page/kinds/index.ts`), so nothing below
     translates it: the answer rides on the block whole, and its module narrows what it reads. The shell still carries
     what every block's frame reads, the heading, the source's list and the count of what was drawn against what matched,
     so the page's head and its "showing N of M" line need nothing from the module. A refused block and one whose
     `when:` said no returned above, and are drawn as every other kind's are. */
  if (drawerOf(kind)) {
    const register = registerOf(b);
    return {
      ...shell,
      ...(register && REGISTERS[register] ? { register } : {}),
      shown: got.length,
      total: Math.max(matched, got.length),
      answer: b as unknown as Answer,
    };
  }
  /* A LEAD NOTE IS THE SCREEN'S ONE SENTENCE, SAID BY `noteOf`'S RULES (`leadOf`): a clause whose every figure is nought
     goes, and `N thing(s)` is one thing or several. Before this the body went to the renderer as written, which filled
     each figure and left the rest alone, so the first line of a desk read "1 essential step(s) done" (measured at HEAD
     in `dynamic-app.test.ts`). The holes are kept, so each figure is still written by the page's resolver, the way the
     cells beside it are.

     A LEAD WITH NOTHING LEFT TO SAY IS NOT DRAWN, as a note whose `when:` said no is not: "0 essential steps done" is
     the clause the rule exists to take away, and a panel with no sentence in it is a hole in the first screen. */
  if (kind === 'note' && rest.lead === true && body !== undefined) {
    /* THE MODEL'S LINE COMES FIRST WHEN THE RECORD SENT ONE. It is written nightly from these same figures and checked
       before it is kept (`packages/record/src/headlines.ts`): every number in it is one the figures hold, and it is sent
       only while they still hold the values it was written from, so it cannot say what the tiles beside it do not. */
    const own = typeof modelSaid === 'string' ? modelSaid.trim() : '';
    if (own !== '') return { ...shell, body: own };
    const lead = leadOf(body, resolverOf(values));
    return lead.trim() === '' ? { ...shell, body: '', drawn: false } : { ...shell, body: lead };
  }
  /* AN `inputs` BLOCK IS ONE ROW'S FIELDS TO TYPE INTO, read by `register:` and never by `source:`, so it is answered
     before the check that sends a block with no source back as written text. That check was where it went: the kernel
     answered the row and its `types`, and the page drew `Nothing matched.` over a row it had been handed.

     THE TYPES ARE THE RECORD'S, and a block whose `types` is not a map of words draws the line saying it cannot be drawn
     rather than guessing a control from the value: a money guessed to be text is a box that writes a string into a
     money field. */
  if (kind === 'inputs') {
    const register = registerOf(b);
    const types = isObject(typed) && Object.values(typed).every((t) => typeof t === 'string') ? (typed as Record<string, string>) : null;
    if (!register || !REGISTERS[register] || !types) return cannot;
    const entries = got.slice(0, 1).map((r) => entryOf(register, r, refs));
    const home = typeof homeSaid === 'string' && /^[A-Z]{3}$/u.test(homeSaid) ? homeSaid : null;
    return { ...shell, register, entries, matched: entries, rows: toRows(register, entries, shell.columns, now, namesOf(refs)), shown: entries.length, total: entries.length, names: namesOf(refs), types, home } as LiveBlock;
  }
  /* A CAPTURE READS NO ROWS, and it has no `source:` either, so it is answered before the check that sends a block
     with none back as written text. Its list is kept on `register`, which every other block here takes from its
     source, because `draw()` names the list from it and the page decides from it whether a line can be written.

     FILLS THAT ARE NOT ALL TEXT ARE A BLOCK THIS BUILD CANNOT DRAW, and not a capture that fills less: dropping the
     one value it could not read turns a line typed under "Later" into an open task, which is a write nobody made. */
  if (kind === 'capture') {
    const text = isObject(filled) && Object.values(filled).every((v) => typeof v === 'string');
    if (typeof into !== 'string' || into === '' || !text) return cannot;
    return { ...shell, register: into, fills: { ...(filled as Record<string, string>) } };
  }
  /* A STAT OVER A REGISTER AND NO FIGURES draws a tile a measure from the rows (`measures.ts`), as the kernel answers it. */
  if (b.cells || (kind === 'stat' && !registerOf(b))) return { ...shell, metrics: (readings ?? []).map((cell) => tileOf(cell, values, b.tone === 'bad' ? 'bad' : 'warn')) };
  /* A BAR OR A SPLIT OVER A FIGURE draws the parts the record read, EACH BY ITS NAME: a part keyed by a ref is the row
     it points at, read from the walk `pageReader` made of that list, and never the ULID the key is. */
  if (typeof source === 'string' && source.startsWith('metric.')) {
    const reading = readings?.[0]?.reading;
    if (!reading) return cannot;
    const target = partsTarget(b);
    const groups = (reading.groups ?? []).map((g) => {
      const key = String(g.key);
      const label = partName({ key, label: g.label }, target, refs);
      return { key, ...(label === undefined ? {} : { label }), value: typeof g.value === 'number' ? g.value : null, ...(Array.isArray(g.parts) ? { parts: g.parts } : {}) };
    });
    const parts = { metric: source.slice('metric.'.length), value: reading.value, groups, more: typeof reading.more === 'number' ? reading.more : 0, unit: reading.unit };
    return { ...shell, parts, shown: groups.length, total: groups.length };
  }
  if (kind === 'series') {
    const bars = barsOf(barred);
    return bars ? { ...shell, bars, shown: bars.keys.length, total: bars.keys.length } : cannot;
  }
  if (!b.source) return shell;
  /* WHAT A PROJECT RUNS ON NAMES NO REGISTER (`packages/kernel/src/pages.ts` `runsOnBlock`), so `registerOf` cannot
     resolve it and the common path below, which checks `REGISTERS[register]`, drew every such block as one this
     build cannot draw. Its rows are the kernel's own fields, scoped and ordered already: the project's
     own first, then the ones that apply everywhere. */
  if (b.source === 'runs_on') {
    const register = 'runs_on';
    const entries = got.map((r) => entryOf(register, r, refs));
    const rows = toRows(register, entries, shell.columns, now, namesOf(refs));
    /* EACH ROW'S PROJECT IS A CHIP, as any block with a `scope` column draws one: the kernel's own
       `scopes`, the project's name for its own rows and none, drawn as Everywhere, for the ones beside it. */
    (b.columns ?? []).forEach((c, i) => {
      if (c.as !== 'scope') return;
      rows.forEach((row, n) => {
        row.cells[i] = scopes?.[n] ?? EVERYWHERE;
      });
    });
    const scopeCells = scopeCellsOf(b.columns ?? [], rows, scopeMarked);
    return {
      ...shell,
      register,
      entries,
      matched: entries,
      rows,
      shown: entries.length,
      total: matched,
      names: namesOf(refs),
      /* A ROW THAT APPLIES EVERYWHERE DRAWS FAINT, exactly as a run gone quiet does (`lib/record/blocks.ts`
         `cardsRows` already reads this array for any cards block): the kernel's own `quiet` cell on each row,
         which a declaration cannot name (`braindog-render`'s `CARD_ROLES` admits it, `declare.ts`
         does not), so it is filled here rather than through a column an author wrote. */
      quiet: entries.map((e) => Boolean(e.fields.quiet)),
      ...(scopeCells ? { scopeCells } : {}),
    };
  }
  /* A `deadlines` BLOCK READS ACROSS EVERY LIST (`packages/kernel/src/pages.ts` `deadlinesBlock`), so its rows are
     the kernel's own fields, `list`, `row`, `title`, `day`, `amount`, `direction`, and not a register's: `deadlines`
     names no real list, so `registerOf` answers null for it and the common path below sent every such block back
     as one this build cannot draw. Entries carry the raw fields (`homeBlocks` reads `entries[n].fields.day` to
     split Overdue), and rows are said by hand: `toRows`'s `display()` only knows a field's type through a declared
     register, which this one can never be. */
  if (b.source === 'deadlines') {
    const spoken = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u;
    const entries = got.map((r) => entryOf('deadlines', r, refs));
    const rows: LiveBlock['rows'] = got.map((r) => {
      const at = typeof r.fields.row === 'string' ? spoken.exec(r.fields.row) : null;
      const cells = (b.columns ?? []).map((c) => {
        const v = r.fields[c.field];
        if (c.field === 'day') return typeof v === 'string' ? fmtDay(v) : null;
        if (c.field === 'amount') {
          if (!isObject(v) || typeof v.amount !== 'number' || typeof v.currency !== 'string') return null;
          const said = money(v.amount, v.currency);
          const out = c.sign ? r.fields[c.sign.field] === c.sign.minus : false;
          return `${out ? '−' : '+'}${said}`;
        }
        return typeof v === 'string' ? v : v === null || v === undefined ? null : String(v);
      });
      return { key: typeof r.fields.row === 'string' ? r.fields.row : String(r.id), cells, ...(at ? { href: `/r/${at[1]}/${at[2]}` } : {}) };
    });
    return { ...shell, register: 'deadlines', entries, matched: entries, rows, shown: entries.length, total: matched };
  }
  if (b.source === 'actions') {
    const actions = got.map((r) => actionOf(r.fields));
    return { ...shell, actions, shown: actions.length, total: matched };
  }
  /* WHAT IS WAITING ON A PERSON. `total` is how many are open and `shown` how many came back, so the
     block can say what it left out rather than drawing three of nine as though that were all of it. */
  /* WHAT WAS PUT OFF IS A QUEUE TOO: the same questions, each still open and waiting on its day, so it is read as the
     open one is and keeps its own source. */
  if (b.source === 'governance.open' || b.source === 'governance.later') {
    const queue = queueOf(waiting);
    return queue ? { ...shell, queue, shown: queue.length, total: matched } : cannot;
  }
  /* WHAT WAS DECIDED IS ROWS NO LIST HOLDS: one line a decision, its cells the declared columns in the words a person
     reads (the day as an age, the answer by its option's label or the word for accepting or declining), and each a
     door to the decision on `/decide/<id>`. `latest` is when the newest was decided, which a calm line can say. */
  if (b.source === 'governance.decided') {
    const answerWord = (v: unknown): string => (v === 'accept' ? copy.acceptIt : v === 'reject' ? copy.rejectIt : typeof v === 'string' ? v : '');
    const cell = (f: Record<string, unknown>, field: string): string => {
      const v = f[field];
      if (field === 'at') return typeof v === 'string' ? since(v, now) : '';
      if (field === 'answer_label') return typeof v === 'string' && v !== '' ? moneyInText(v) : answerWord(f.answer);
      if (field === 'answer') return answerWord(v);
      return typeof v === 'string' ? moneyInText(v) : v === null || v === undefined ? '' : String(v);
    };
    const rows: LiveBlock['rows'] = got.flatMap((r) => {
      const id = typeof r.id === 'string' ? r.id : '';
      const f = isObject(r.fields) ? r.fields : {};
      return id === '' ? [] : [{ key: `decided:${id}`, cells: shell.columns.map((c) => cell(f, c.field)), href: `/decide/${encodeURIComponent(id)}` }];
    });
    const first = got[0]?.fields;
    const latest = isObject(first) && typeof first.at === 'string' ? first.at : null;
    return { ...shell, rows, shown: rows.length, total: Math.max(rows.length, matched), latest } as LiveBlock;
  }

  /* A WALK, A FEED AND A DIFF ARE NOT ROWS OF A REGISTER. The kernel answers each as its own key, and each
     is shaped by the function that shapes the sample's, so the same renderer draws both. One the record
     did not send, or sent in a shape this cannot read, says it cannot be drawn rather than drawing empty. */
  if (b.source === 'forecast.runway') {
    /* ONE WALK A CURRENCY, when the record could not add them up, each drawn under its code and the reason said once. */
    const apart = Array.isArray(walkedApart) ? walkedApart.map(walkOf) : [];
    if (apart.length > 0 && apart.every((w): w is Walk => w !== null)) {
      const fx = isObject(walkFx) ? walkFx : {};
      const missing = Array.isArray(fx.missing) ? fx.missing.filter((m): m is string => typeof m === 'string') : [];
      return {
        ...shell,
        walks: apart,
        walkNote: walksNote(typeof fx.home === 'string' ? fx.home : null, missing, apart.length),
        ...walkTable(apart[0]!, kind === 'bridge' || kind === 'forecast' ? apart[0]!.steps.length : limit, new Date(now).toISOString().slice(0, 10), false),
      };
    }
    const walk = walkOf(walked);
    const past = pastOf(remembered);
    return walk
      ? {
          ...shell,
          walk,
          ...(past ? { past } : {}),
          ...walkTable(walk, kind === 'bridge' || kind === 'forecast' ? walk.steps.length : limit, new Date(now).toISOString().slice(0, 10), false),
        }
      : cannot;
  }
  if (b.source === 'activity') {
    const feed = feedOf(fed);
    if (!feed) return cannot;
    /* WHAT EACH AGENT DID: the record grouped its rows by who, and the renderer draws one head per agent. */
    /* EVERY EVENT IS ON A ROW, a burst counted on its own and the rest past `first:` folded into one, so nothing is left out to say. */
    if (kind === 'agents') return { ...shell, feed, ...agentsTable(feed, now), total: feed.length };
    const seen = typeof mark === 'string' ? mark : null;
    const marks = b.since === 'seen' || mark !== undefined;
    return { ...shell, feed, ...(marks ? { seen } : {}), ...feedTable(feed, marks, seen, now, me, names), total: matched };
  }
  if (kind === 'diff') {
    const history = historyOf(versions);
    return history ? { ...shell, history, ...historyTable(history, Math.max(matched, history.length)) } : cannot;
  }

  const register = registerOf(b);
  /* A register the seed does not declare has no labels to draw with, and says so rather than drawing half an answer. */
  if (!register || !REGISTERS[register]) return cannot;
  /* THE NUMBERS A PROJECT REPORTED, worked out by the record: one series a measure, drawn as tiles or charts. */
  if (kind === 'stat' || kind === 'lines') {
    if (Array.isArray(measured)) {
      const measures = measured.filter(isSeries);
      /* A MEASURE READ ONCE IS ITS READING, which a current record answers beside a `lines` block's lines (`latest`), and
         a `stat` has none of: its tiles are each a measure's newest reading already. */
      const latest = kind === 'lines' ? latestOf(readOnce) : [];
      /* EVERY MEASURE IS DRAWN, so nothing is cut: `matched` counts readings, which no tile or chart is one of. */
      const drawn = measures.length + latest.length;
      return { ...shell, register, measures, ...(latest.length > 0 ? { readOnce: latest } : {}), shown: drawn, total: drawn };
    }
  }
  /* A SUM OVER THE FIRST PAGE IS A WRONG NUMBER, so a kind that adds up draws only the whole answer.
     THE KERNEL REFUSES THIS NOW, at `packages/kernel/src/pages.ts`, and a refused block returned
     above with the record's own sentence rather than this line, so on a current record the guard
     below will not fire. It is kept because the record is a different deployment from this app: a
     record on an older kernel still answers 200 rows of 301 with an empty `refusals`, which is the
     case this guard was written for and the one it is still the only protection against. */
  if (SUMS.has(kind) && got.length < matched) return cannot;
  /* AND WHETHER THE BLOCK IS DRAWING A SLICE IS THE OTHER QUESTION, which is `REDUCES` and not
     `SUMS`: a section adds nothing up and is still never showing a page of its answer, because the
     count it draws is `total`. One variable answered both here and the section half was wrong.
     Measured through `blockOf` on a section with 2 rows and `matched: 301`: `shown 2, total 301`,
     which is the condition `/p/[slug]` prints "Showing 2 of 301" on, under a heading that draws no
     row of its own and whose own count said 301. `api.ts` reads `REDUCES` for the same `shown` on
     the sample and printed nothing, so one declaration drew two different pages. */
  const reduces = REDUCES.has(kind);

  /* A BUDGET IS DRAWN AGAINST WHAT ITS FIGURE SPENT, which the record read beside the rows; without it there is no budget to draw. */
  const { spent, toward } = rest as { spent?: unknown; toward?: unknown };
  const figure = spent ?? toward;
  let spentBy: LiveBlock['spentBy'];
  if (kind === 'progress' && figure !== undefined) {
    const reading = readings?.[0]?.reading;
    if (typeof figure !== 'string' || !reading) return cannot;
    /* A GOAL'S PARTS ARE KEYED BY THE ROW THEY WERE LOGGED AGAINST, which the record groups by its id; the rows here are
       drawn by number, so each key is said as that row's number. */
    const seqOf = new Map(got.map((r) => [String(r.id), String(r.seq)]));
    const groups = (reading.groups ?? []).map((g) => ({ key: spent === undefined ? (seqOf.get(String(g.key)) ?? String(g.key)) : String(g.key), value: typeof g.value === 'number' ? g.value : null }));
    spentBy = { metric: figure, unit: typeof reading.unit === 'string' ? reading.unit : null, groups, ...(spent === undefined ? { toward: true } : {}) };
  }

  const live = b.source === 'sessions.live';
  const entries = got.map((r) => entryOf(register, r, refs));
  /* HOW FAR ALONG A CARD IS FROM ITS STEPS, worked out by the record where the ring's own field is empty. Drawn through the
     field, so the ring reads as a typed one does; the row itself is not changed. */
  const ring = kind === 'cards' ? b.columns?.find((c) => c.as === 'ring')?.field : undefined;
  const drawnEntries = ring && Array.isArray(rings) ? entries.map((e, n) => (typeof rings[n] === 'number' ? { ...e, fields: { ...e.fields, [ring]: rings[n] } } : e)) : entries;
  const rows = toRows(register, drawnEntries, shell.columns, now, namesOf(refs));
  /* WHO CHANGED EACH ROW LAST, named by the kernel on `changes`, and each money column's sign. */
  markColumns(register, b.columns, entries, rows, (_e, n) => changeOf(changed, n));
  /* WHETHER AN AGENT IS ON EACH ROW, which the record works out from the row's history and its live
     runs. Narrowed here like everything else the record sends: a `working_now` that is not an array
     of booleans is left off, and the block draws no dots rather than drawing one for `"yes"`. */
  const working = onIt === true;
  const workingNow = working && Array.isArray(atWork) ? atWork.map((v) => v === true) : undefined;
  /* WHERE A ROW APPLIES, and which project a run is in, are named by the kernel on `scopes`. */
  (b.columns ?? []).forEach((c, i) => {
    if (c.as !== 'scope' && !(live && c.field === 'project')) return;
    rows.forEach((row, n) => {
      row.cells[i] = scopes?.[n] ?? (live ? (row.cells[i] ?? null) : EVERYWHERE);
    });
  });
  /* AND THE CHIP EACH OF THOSE CELLS WEARS: the project's mark in its hue, or the globe for everywhere. A
     run's project is where it was placed, and a run placed nowhere is not "everywhere", so an agent's runs draw words. */
  const scopeCells = live ? undefined : scopeCellsOf(b.columns ?? [], rows, scopeMarked);
  /* EACH CARD'S NEXT STEP IS THE RECORD'S ANSWER, `nexts`, written into the cell and never into the row, unlike a ring.
     The column names a field of the STEPS list, and the card's own list may hold a field of the same name: the measured
     desk's areas have a `what` of their own, so merged into the row it would also have replaced the card's `what` in
     any other column drawing it. A card with no open step says nothing there. */
  const nexts = kind === 'cards' && Array.isArray(nexted) && nexted.length === got.length ? nexted.map((v) => (typeof v === 'string' ? v : null)) : null;
  (b.columns ?? []).forEach((c, i) => {
    if (c.as !== 'next') return;
    rows.forEach((row, n) => {
      row.cells[i] = nexts?.[n] ?? null;
    });
  });
  /* AND EACH CARD'S TREND, `trends`, the record's reading of the column's `metric:` with the card's own fields filled
     in. Such a column names no field, so `toRows` drew it empty and this writes the run as the words `trendOf` reads,
     a gap as `-` and never as a zero. A card the record read nothing for draws no line. The record reads the first such
     column only (`pages.ts` `trendColumn`), so only that one is filled: a second would draw the first one's line. */
  const trends = kind === 'cards' && Array.isArray(trended) && trended.length === got.length ? trended : null;
  const trendAt = (b.columns ?? []).findIndex((c) => c.as === 'trend' && typeof c.metric === 'string');
  if (trendAt >= 0)
    rows.forEach((row, n) => {
      const run = trends?.[n];
      row.cells[trendAt] = Array.isArray(run) ? run.map((v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '-')).join(' ') : null;
    });
  /* EACH CARD'S GROUP BY NAME, READ OFF ITS OWN ROW (`PageRow.group` in the kernel's `pages.ts`): the record puts it on
     the row and not beside the rows, so a block held from a reader keeps no name of a list she may not read. A card the
     record says points at nothing (`value: ''`, "No project") and a group that is not text are drawn among the
     ungrouped rather than under a heading of something else. A record on an older build answered the names beside the
     rows, `groups`, which is read the same way when no row says its own. */
  const cardGroups = kind === 'cards' ? groupsOf(got, groupNames) : null;
  /* WHO CHANGED EACH ROW LAST, AS A BYLINE (`bylineOf`): an agent, an app, a rule or Slash, for whom, and whether the
     reader has seen it. Only where the record said a change for some row; a row you changed yourself carries none. */
  const lines = Array.isArray(changed) && changed.length === got.length ? got.map((_r, n) => bylineOf(changed[n], me, names, now, typeof mark === 'string' ? mark : null)) : null;
  const bylines = lines?.some((l) => l !== null) ? lines : null;
  /* A PATH'S MARKS ARE THE RECORD'S, one a row, and the first open one's place. A path under `first:` SAYS ITS OWN REST
     as "N more" (`blocks.ts` `pathRows`), so `shown` is the whole match and the page's slice line is not drawn under it
     as the same count told twice. */
  const marks = kind === 'steps' && Array.isArray(doneNow) && doneNow.length === got.length && doneNow.every((d) => typeof d === 'boolean') ? (doneNow as boolean[]) : null;
  const path = marks ? { done_now: marks, next: typeof nextAt === 'number' && Number.isInteger(nextAt) && nextAt >= 0 && nextAt < marks.length ? nextAt : null } : {};
  const short = marks !== null && typeof rest.first === 'number';
  /* AND HOW MANY STEPS ARE OPEN, which the short view's "N more" is counted from: `matched` holds the done ones too. */
  const open = short && typeof openSteps === 'number' && Number.isInteger(openSteps) && openSteps >= 0 ? { open: openSteps } : {};
  return {
    ...shell,
    register,
    entries,
    matched: entries,
    rows,
    shown: reduces || short ? matched : entries.length,
    total: matched,
    ...path,
    ...open,
    ...(spentBy === undefined ? {} : { spentBy }),
    names: namesOf(refs),
    ...(cardGroups ? { groups: cardGroups } : {}),
    ...(bylines ? { bylines } : {}),
    ...(inherited === undefined ? {} : { inherited }),
    /* GONE QUIET AS THE RECORD SAYS IT (`isQuiet`): open, and not heard from in 15 minutes (`WORKING_MS`), read off its
       `last_seen` alone, so a run that never said it is never shown at work. */
    ...(live ? { quiet: got.map((r) => isQuiet({ fields: r.fields as never }, now)) } : {}),
    ...(working ? { working } : {}),
    ...(workingNow ? { working_now: workingNow } : {}),
    ...(scopeCells ? { scopeCells } : {}),
  };
}

/**
 * A block's `{{path}}` resolver, over the values the record answered.
 *
 * Formatting is the reader's, as `05 §7.1` rule 3 says: money as money, a count as a count. A value
 * the record did not send is `null`, which the renderer draws as `—`.
 *
 * A FIGURE THAT IS A DAY IS WRITTEN AS ONE. The record sends a figure's number and not its shape, so `cash-as-of`, a day
 * held as whole days since 1970, was written as a count: Money's "Out of date" note read "The oldest balance in Cash
 * now is from 20,690", and now reads "from 25 Aug". ONLY A DAY: every other shape is a count the sentence names the unit
 * of itself, and `days` through `format` made Money's lead "runs out in 12 days days" and kept a nought clause `leadOf`
 * drops.
 */
export function resolverOf(values: Record<string, unknown> | undefined): (path: string) => string | null {
  return (path) => {
    if (!values || !Object.hasOwn(values, path)) return null;
    const v = values[path];
    /* `<figure>.since` IS A DAY, said as the month a person would: "quiet since April", and the year only when it is not
       this one. */
    if (path.endsWith('.since') && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v)) return monthOf(v);
    if (typeof v === 'string') return v;
    if (typeof v === 'number') {
      if (Object.hasOwn(METRICS, path) && METRICS[path]?.format === 'day') return format('day', v);
      return Number.isInteger(v) ? integer(v) : String(v);
    }
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    /* A FIGURE IN SEVERAL CURRENCIES, one amount a currency, written as a tile writes its parts. */
    if (Array.isArray(v)) {
      const parts = v.filter((p): p is { amount: number; currency: string } => isObject(p) && typeof p.amount === 'number' && typeof p.currency === 'string');
      return parts.length && parts.length === v.length ? partsText(parts) : null;
    }
    if (v !== null && typeof v === 'object') {
      const { amount, currency } = v as { amount?: unknown; currency?: unknown };
      if (typeof amount === 'number' && typeof currency === 'string') return money(amount, currency);
    }
    return null;
  };
}

/** A day as its month, `April`, with the year when it is not this year's, `April 2025`. */
function monthOf(day: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  const month = at.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  return at.getUTCFullYear() === new Date().getUTCFullYear() ? month : `${month} ${at.getUTCFullYear()}`;
}

/* A FILE'S NAME IS ITS HASH, and only a hash in the one shape the record writes is ever put in an address: a value an
   agent wrote into a row is not a path segment until it is proven to be 64 hex digits (`kernel/src/coerce.ts` `file`). */
const SHA256 = /^[0-9a-f]{64}$/u;

/** The hash a stored file is kept under, or null for a value that is no file. */
function sha256Of(v: unknown): string | null {
  if (!isObject(v)) return null;
  const { sha256 } = v;
  return typeof sha256 === 'string' && SHA256.test(sha256) ? sha256 : null;
}

/**
 * Where each file a block draws is served, by the row and the field that hold it: the page's `RenderOptions.file`.
 *
 * THE RENDERER NAMES A FILE BY WHERE THE RECORD KEEPS IT, `file:<list>#<seq>/<field>`, and never by its address, because
 * only the host knows the address (`packages/render/src/gallery.ts`). The record's page answer already carries each
 * file's stored value, `{ sha256, mime, bytes, name }`, so the address is made from what the block holds and nothing is
 * fetched to find it. Three places hold one:
 * - the rows a block drew over a list, a card's `picture` among them (`entries`, beside `register`);
 * - the rows the record answered a registered kind with (`answer.rows`, over `answer.source`), a `gallery` over a list;
 * - a `gallery`'s written-out rows, whose files the record answers in `answer.files`, one a row in the rows' order, so
 *   the reference its author typed finds the file the record looked up for it.
 *
 * The answer is RECORD-RELATIVE, `/api/files/<sha256>`: the page places it under the record it is on, as it places every
 * other address the renderer draws (`RenderOptions.href`, `at`). A file the block does not hold, or one the record could
 * not find, answers `null`, and the tile or card draws its caption and no picture, never a reference as words.
 */
export function fileAt(block: LiveBlock): (row: string, field: string) => string | null {
  const held = new Map<string, string>();
  const keep = (list: string, seq: unknown, fields: unknown): void => {
    if (!isObject(fields) || typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) return;
    for (const [field, v] of Object.entries(fields)) {
      const sha256 = sha256Of(v);
      if (sha256) held.set(`${list}#${seq}/${field}`, sha256);
    }
  };
  if (block.register) for (const e of block.entries) keep(block.register, e.seq, e.fields);
  const answer: unknown = block.answer;
  if (isObject(answer)) {
    const { source, rows, authored, files } = answer;
    const list = typeof source === 'string' && source.startsWith('register.') ? source.slice('register.'.length) : '';
    if (list && Array.isArray(rows)) for (const r of rows) if (isObject(r)) keep(list, r.seq, r.fields);
    if (Array.isArray(authored) && Array.isArray(files) && files.length === authored.length)
      authored.forEach((r, n) => {
        const cells = isObject(r) && Array.isArray(r.cells) ? r.cells : [];
        const said = cells.find((c): c is string => typeof c === 'string' && c.trim().startsWith('file:'));
        const sha256 = sha256Of(files[n]);
        if (said && sha256) held.set(said.trim().slice('file:'.length).trim(), sha256);
      });
  }
  return (row, field) => {
    const sha256 = held.get(`${row}/${field}`);
    return sha256 ? `/api/files/${sha256}` : null;
  };
}

/**
 * THE PAGES A RECORD HOLDS, AS ADDRESSES WITH THEIR TITLES, because the reader is standing at an
 * address that did not work. This answered titles alone, so `/p/say-what-it-is-and-who-it-is-for`
 * offered "Your project" to somebody who had just typed a slug, and the page titled Your project
 * answers at `/p/home-guide`: both words on offer refuse again when typed.
 */
const heldOf = (listed: unknown): { address: string; title?: string }[] =>
  Array.isArray(listed)
    ? listed.flatMap((p) => {
        const said = p !== null && typeof p === 'object' ? (p as { page?: unknown; slug?: unknown; title?: unknown }) : {};
        const address = typeof said.slug === 'string' ? said.slug : typeof said.page === 'string' ? said.page : null;
        if (address === null) return [];
        return [typeof said.title === 'string' ? { address, title: said.title } : { address }];
      })
    : [];

/**
 * A READ OF ONE PAGE, NARROWED BY THE READER'S CHOICE when they made one (`?f.thing=12`, `$lib/page/filters.ts`).
 * Every block over a list with that field is narrowed by the kernel, and the answer's `filters` carries what may be
 * chosen next; an empty choice is no choice, and the page is asked for by its slug alone.
 */
export type PageReader = { read(slug: string, filter?: Readonly<Record<string, string>>, opts?: { walk?: Walked }): Promise<Opened> };

/** A length a reader picked on a forecast's horizon knob: whole days, or `last`, to the last dated movement. */
export type Walked = number | 'last';

/**
 * THE LENGTHS READERS PICKED PAST HOW FAR A WALK REACHES, by page. A forecast walks two years at most unasked (the
 * kernel's `WALK_UNASKED`), so five years is a length the page asks the record for when somebody picks it, and every
 * read of that page after it asks again: a re-read when the record moves would otherwise walk two years and pull the
 * chart back from under the reader. Held for the tab and not by one reader, because Home reads its page through a new
 * reader each time. A page left lets it go (`forgetWalks`), so the next visit opens on what the page opens on.
 */
const WALKS = new Map<string, Walked>();

/** Asks every later read of `slug` to walk `length` (`BlockSlot.svelte`, as the horizon knob is pressed). */
export function askWalk(slug: string, length: Walked): void {
  if (length === 'last' || (Number.isInteger(length) && length > 0)) WALKS.set(slug, length);
}

/** The length asked for on `slug`, if any. */
export const walkAsked = (slug: string): Walked | undefined => WALKS.get(slug);

/** Lets go of every length asked, but the one on the page still being read. */
export function forgetWalks(but: string | null = null): void {
  for (const slug of [...WALKS.keys()]) if (slug !== but) WALKS.delete(slug);
}

/** A page reader for one tab. `base` is the page's own origin; the app never holds a token. */
export function pageReader(base: string, io?: Fetch, clock: () => number = () => Date.now()): PageReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const maps = new Map<string, RefMap>();

  /* A REF ARRIVES AS THE TARGET ROW'S ULID, so each register a ref points at is walked once and kept,
     as the row reader does. A register this reader may not list is left out, and its refs draw as ids. */
  const walked = new Map<string, RecordRow[]>();
  async function rowsOf(register: string): Promise<RecordRow[] | null> {
    const kept = walked.get(register);
    if (kept) return kept;
    const rows: RecordRow[] = [];
    let cursor: string | null = null;
    do {
      const out = await client.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) });
      if (!out.ok) return null;
      rows.push(...(out.value.rows as RecordRow[]));
      cursor = out.value.cursor;
    } while (cursor !== null);
    walked.set(register, rows);
    return rows;
  }
  const asked = new Map<string, Promise<void>>();
  async function mapOf(register: string): Promise<RefMap | null> {
    const kept = maps.get(register);
    if (kept) return kept;
    /* A use case's own list is declared before it is walked, or its rows have no title to be named by. */
    await learn(client.schema, register, asked);
    const rows = await rowsOf(register);
    if (!rows) return null;
    const map = refMapOf(register, rows);
    maps.set(register, map);
    return map;
  }

  return {
    async read(slug, filter, opts = {}) {
      /* `client.page` drops an empty choice, so the page is asked for by its slug alone. A record that does not read
         `filter` answers the whole page.

         AND A LENGTH PICKED PAST THE WALK'S REACH IS ASKED FOR BY NAME (`walk`), which the record hands the kernel and
         the kernel walks only where a block offers it. Through `call`, as the client's `page` takes no length yet; a
         record that does not read `walk` keeps it as text it never looks at, and answers the walk it would have. */
      const walk = opts.walk ?? WALKS.get(slug);
      const out =
        walk === undefined
          ? await client.page(slug, filter)
          : await client.call<unknown>('page', { slug, ...(filter && Object.keys(filter).length ? { filter } : {}), walk });
      if (!out.ok) {
        if (!('refusal' in out)) return { from: 'refused', fix: liveWords.changed };
        if (out.refusal.code === 'PAGE_UNKNOWN') {
          const listed = await client.pages();
          return { from: 'missing', held: listed.ok ? heldOf(listed.value) : [] };
        }
        return { from: 'refused', fix: out.refusal.fix };
      }

      const { blocks = [], read_at, look: arranged, ...bare } = out.value as AnsweredPage;
      /* HOW THE ENGINE ARRANGED IT, narrowed, and left off a page whose look this build cannot read. */
      const look = lookOf(arranged);
      const page: LivePageDecl = look ? { ...bare, look } : bare;
      /* TODAY IS THE RECORD'S, where it says what its clock read, so a record pinned to a day draws its own late rows,
         out-of-date balances and forecast from that day. A record that does not say is read against this clock. */
      const said = typeof read_at === 'string' ? Date.parse(read_at) : Number.NaN;
      const now = Number.isFinite(said) ? said : clock();
      /* EVERY LIST A BLOCK DRAWS IS ASKED FOR, through `learn`, whether or not this build ships it. A use case's own
         lists are declared by the record and by no file here, and a page over them drew
         "cannot be drawn" on every block. This then skipped any list the bundle holds, so a field added to Projects at
         run time was on the record and in no block over Projects: measured in `field-write.test.ts`, where the page
         asked for `page` and nothing else. `learn` keeps what it asked per reader, so a list two blocks draw is asked once. */
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (register) await learn(client.schema, register, asked);
      }
      const wanted = new Set<string>();
      for (const b of blocks) {
        const register = b.refusals?.length ? null : registerOf(b);
        if (register) for (const target of targetsOf(register)) wanted.add(target);
      }
      /* A FIGURE GROUPED BY A REF NAMES ITS PARTS FROM THE LIST THE REF POINTS AT, which no `register.` source asks
         for: the figure's own list is learnt, so its field is known to be a ref, and its target walked like any other.
         Not where the record named every part itself (`label`), which a current kernel does. */
      for (const b of blocks) {
        const by = b.refusals?.length || partsNamed(b) ? null : groupedBy(b);
        if (!by) continue;
        await learn(client.schema, by.register, asked);
        const target = partsTarget(b);
        if (target) wanted.add(target);
      }
      /* WHO IS READING, for a feed that names the reader as You: the shell's own `boot`, kept, so it costs no call. */
      const booted = blocks.some((b) => b.source === 'activity') ? await readBoot(base, io) : null;
      const me = booted?.from === 'live' ? (booted.boot.me?.person ?? null) : null;
      const names = new Map(Object.entries(booted?.from === 'live' ? (booted.boot.names ?? {}) : {}));
      const refs = new Map<string, RefMap>();
      for (const target of wanted) {
        const map = await mapOf(target);
        if (map) refs.set(target, map);
      }
      /* THE PAGE IS THE ANSWER, AND THE ONE DERIVED KEY IS DERIVED FROM THE ANSWER. `identity` names
         the row a page is ABOUT, and it is what the page and its rail row wear a project's colour
         from; the record does not send it, but an expanded page sends `param`: the register, the
         number and the title of the row it was expanded from, which is the same row. So a live
         project page carries its own hue for the reason the sample's does (`pages.ts` sets both from
         one pair), rather than losing it to a key nobody carried across. What the record sent wins. */
      const identity = page.identity ?? (page.param ? { register: page.param.register, seq: page.param.seq } : undefined);
      /* A BAR OVER A LIST OF LINKS adds up what the linked rows hold: an organisation's balance is the money in the
         accounts it names. The linked list is walked once, as a ref's target is, and each row's money is handed on by id. */
      const linked = new Map<number, Record<string, unknown>>();
      for (const [i, b] of blocks.entries()) {
        const link = b.refusals?.length || (b.kind !== 'bar' && b.kind !== 'split') ? null : linkOf(registerOf(b), b.columns?.[1]?.field);
        if (!link) continue;
        const rows = await rowsOf(link.to);
        /* BY THE ULID AND BY THE NUMBER, because the element the bar looks up is no longer the one that
           arrived. `entryOf` resolves a `list<ref>` element to the target row's SEQUENCE as of
           `a4d0111d`, which is what a person says and what every other screen wants; this map was
           written before that and keyed only by the ULID the record sends. The lookup then missed on
           every row, every row was skipped as linking to nothing, and the founder use case's "Balance
           by organisation" drew its empty line, "No organisation lists an account yet", on a record
           whose three organisations each hold an account. It was caught in a marketing capture rather
           than by a test, which is why the test beside this one drives both forms. */
        if (rows)
          linked.set(
            i,
            Object.fromEntries(
              rows.flatMap((r) => {
                const held = r.fields[link.money];
                return r.seq === null ? [[r.id, held] as const] : [[r.id, held] as const, [String(r.seq), held] as const];
              }),
            ),
          );
      }
      return {
        from: 'live',
        now,
        page: {
          page: identity ? { ...page, identity } : page,
          blocks: blocks.map((b, i) => {
            const drawn = blockOf(b, refs, now, me, names);
            const held = linked.get(i);
            return held && !drawn.cannot ? { ...drawn, linked: held } : drawn;
          }),
        },
      };
    },
  };
}
