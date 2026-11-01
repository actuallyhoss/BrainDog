/**
 * Every write a declared page makes: a task ticked, a card moved, a bar dropped on a new day, a line captured, a field
 * typed into, and an option pressed on a queue. The one job `PageView.svelte` held beside five others until it was
 * split, and the `Writes` object the page hands each block.
 *
 * ONE OBJECT, HANDED DOWN WHOLE, OR NOTHING AT ALL. A page that can be written hands every block the same `Writes`; a
 * preview hands none, and a block with no writes draws no control, because the renderer draws a control only for a
 * callback it was given (`packages/render/svelte/Block.svelte`). So "inert" is one `null`, never a flag checked in six
 * places.
 *
 * NO RUNE LIVES HERE, so this file loads in plain Node the way `tick-undo.ts` and `capture.ts` beside it do. What the
 * writes remember between gestures (the rows held in place, the loaded write module, what the record refused about a
 * typed field) is kept by the component in a rune and reached through `state`, so the page redraws when it changes and
 * this file never has to know how.
 *
 * AND NOTHING HERE REACHES FOR THE SCREEN. The toasts, the navigation and the record's address are handed in, because
 * each of them is a browser thing and the rules of a write are not.
 */

import { holdFocus } from '../ui/keep-focus.ts';
import type { Row, RowRef, TableRow } from 'braindog-render';

import { copy } from '../copy.ts';
import { REGISTERS } from '../record/held.ts';
import { listWord } from '../record/names.ts';
import type { LiveBlock } from '../record/page-live.ts';
import type { Declared, Kept } from '../record/page-write.ts';
import type { InputsWriter } from '../record/inputs-write.ts';
import type { Drop } from '../record/roadmap-write.ts';
import type { toasts } from '../ui/toast.svelte.ts';
import { optimist, UNDO_MS } from '../data/optimistic.ts';
import { isQuestion } from '../work/capture.ts';
import { words } from './words.ts';
import type { ActAction, OpenSheet } from './act-sheet.ts';
import type { Fields } from '../record/schema.ts';

/* TODAY'S LIGHT SYNTAX, handed on so the palette's reader reaches `lib/work` through this one held file. */
export { captureOf, contextOf, isQuestion, projectNamed } from '../work/capture.ts';
export { dayOf, daySaid, shapeOf } from '../work/board.ts';

/** The page write module, loaded on the first gesture. */
type PageWrite = typeof import('../record/page-write.ts');
type Change = (m: PageWrite, ref: RowRef, decl: Declared | null) => Record<string, unknown> | null;
/* A WAY BACK MAY LOAD WHAT IT NEEDS when it is pressed, as a tick's does, so nothing is fetched for an undo never used. */
type Back = (m: PageWrite, ref: RowRef, decl: Declared | null) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;

/** The rows somebody has just ticked or moved in one block, and the block as it was drawn when they did. */
type Hold = { before: Row[]; held: Map<string, Kept> };

/**
 * What the writes remember between gestures, which the component keeps in one rune.
 *
 * `module` IS THE WRITE MODULE ONCE A GESTURE HAS LOADED IT. The rows are drawn through its `keepInPlace`, and a hold
 * exists only after a gesture, so a page nobody has touched never pulls it in.
 *
 * `kept` IS ABOUT ONE PAGE, so it carries the slug it was taken on and a page opened after it reads none of it. That is
 * the register screen dropping its holds when the question changes, one layer up: a row pinned to an index on Work
 * would otherwise be spliced into the block at the same index on Money.
 */
export type Held = {
  module: PageWrite | null;
  kept: { slug: string; blocks: Map<number, Hold> };
  /** The key `inputs-write.ts` files a field's sentence under, once that module has loaded. */
  inputsKey: ((ref: RowRef, field: string) => string) | null;
  /** What the record refused about a typed field, by `inputsKey`. */
  inputSaid: ReadonlyMap<string, string>;
  /**
   * LINES CAPTURED AND NOT YET WRITTEN, by the list they go to, drawn at the head of every `todo` or `list` block over
   * that list until the record has the row and the page has read it back (`captureLine`). The slug they were typed on
   * goes with them, as `kept`'s does.
   */
  added: { slug: string; rows: ReadonlyMap<string, readonly Row[]> };
};

/** Nothing held: the state a page opens with. A function, so no two pages ever share one map. */
export const heldNone = (): Held => ({
  module: null,
  kept: { slug: '', blocks: new Map() },
  inputsKey: null,
  inputSaid: new Map(),
  added: { slug: '', rows: new Map() },
});

/** Which rows of each list arrived since it was last drawn (`arrivals` in `lib/data/optimistic.ts`). */
export type Seen = { see(list: string, keys: readonly string[], answered?: boolean): ReadonlySet<string>; forget(): void };

export type WritesDeps = {
  /** The page's address now, which a hold is taken on and a late write is checked against. */
  slug: () => string;
  /** The record's clock the page was read against, or `null` while no live answer is drawn, when nothing is written. */
  now: () => number | null;
  /** Every block the page draws, declared then added, which an `inputs` write reads the row it edits from. */
  blocks: () => readonly LiveBlock[];
  /** The record's own address, `apiBase()` in the app. */
  base: () => string;
  /** Reads the page again after a write, without blanking it. */
  reread: () => Promise<void>;
  /** The app's toasts, where a write says what it did and offers its way back. */
  toasts: Pick<typeof toasts, 'push'>;
  /** Where the writes keep what they hold, read fresh on every gesture. */
  state: { get(): Held; set(next: Held): void };
  /** Marks the rows that arrived since a block was last drawn, so they are tinted for a moment. Absent, none are. */
  arrivals?: Seen;
  /** Opens the palette with a line a capture was asked, which is a question and not a row. Absent, every line is a row. */
  ask?: (line: string) => void;
  /**
   * A write that landed, with what happened to its row in a word or two, so the page's Just changed keeps it for ten
   * minutes (`row-host.svelte.ts`). Absent, nothing is kept.
   */
  touched?: (ref: { register: string; seq: number }, mark: string, title: string) => void;
  /** Opens the sheet a declared action asks first or shows after (`act-sheet.ts`). Absent, `openSheet` mounts the real one. */
  sheet?: OpenSheet;
};

/** Where a declared action was pressed: the block, its place on the page, and the rows it drew then. */
export type Pressed = { block: LiveBlock; at: number; before: readonly Row[] };

/** What a press came to: whether it landed and, when the record refused it, its sentence and the field it named. */
export type Acted = { ok: boolean; fix?: string; at?: string };

/**
 * THE ONE TABLE OF VERBS A PRESS SENDS TO THE RECORD BY THEIR OWN CLIENT METHOD. The row verbs are the six
 * writes above said as verbs (`row.tick` is the tick write, `row.move` a card moved, `row.create` a captured line or a
 * new row), and `suggestion.answer` is the option write a question's card makes (`decide-write.ts`); every other verb a
 * page may name goes to the record through the method named here. `null` is a verb this host has no single change for
 * yet (`VERBS` in `packages/record/src/verbs.ts`): a press on it says what it would do and runs nothing.
 */
export const ACT_CALLS: Readonly<Record<string, string | null>> = Object.freeze({
  'rule.from_arrivals': null,
});

/** The verbs the six writes carry, and the option write's. */
const ROW_VERBS: ReadonlySet<string> = new Set(['row.create', 'row.update', 'row.delete', 'row.tick', 'row.move']);
const ANSWER_VERB = 'suggestion.answer';

/** Whether this host can carry out `verb` at all. */
export const actable = (verb: string): boolean => ROW_VERBS.has(verb) || verb === ANSWER_VERB || (Object.hasOwn(ACT_CALLS, verb) && ACT_CALLS[verb] !== null) || verb === 'question.ask';

/** What a press was made on, as `act` reads it: the drawn row, the record row, a question's id, its name and fields. */
type On = { drawn: Row | null; ref: RowRef | null; id: string | null; title: string | null; fields: Readonly<Record<string, unknown>>; block: LiveBlock | null };

/** The writes one page makes, over what the page hands in. */
export function pageWrites(deps: WritesDeps) {
  const { toasts } = deps;

  /* WHAT IS HELD NOW, read at each use and never kept in a local, because a gesture's write lands after awaits and the
     state it lands on is whatever the page holds by then. */
  const stored = (): Held => deps.state.get();
  const put = (next: Partial<Held>): void => deps.state.set({ ...stored(), ...next });

  /* AND THEY GO WHEN THE PAGE DOES. `/p/[slug]` keeps the reader across slugs, so without this a reader who left Work
     for Money and came back found Work's holds still standing, over rows the record has since moved on from. */
  function forPage(on: string) {
    if (stored().kept.slug !== on) {
      put({ kept: { slug: on, blocks: new Map() }, added: { slug: on, rows: new Map() } });
      deps.arrivals?.forget();
      runsOf.clear();
    }
  }

  /**
   * THE WRITE MODULE, FETCHED BEFORE THE FIRST GESTURE NEEDS IT. A tick is drawn the moment it is pressed only when the
   * module that holds the row is already here; on a page's first tick it was a chunk away. `PageView` calls this once the
   * page has drawn, so the fetch is after the page and never in its way.
   */
  function warm() {
    if (!stored().module) void import('../record/page-write.ts').then((m) => put({ module: m }));
  }

  /**
   * A block's segment with its held rows where they were, its captured lines at its head, and the rows that arrived
   * since it was last drawn marked. Untouched until something on this page is held, typed or new.
   *
   * A HELD ROW CHANGES THE BLOCK'S `raw`, which is what the primitive drops its own marks on (`ticks` in `List.svelte`,
   * `moved` in `Grid.svelte`). The box is ticked by the primitive the instant it is pressed, and then by the hold here
   * the instant after; without the change the primitive kept its own tick beside the hold's and, when the record refused
   * and the hold was taken back, went on drawing the tick it no longer had, as "Not saved". Only a hold that wears
   * something counts: a moved bar wears nothing, and its roadmap keeps its drag until the page is read again.
   */
  function keptSegment<S extends { rows: Row[] }>(at: number, segment: S, block?: LiveBlock, several: boolean | number = false): S {
    const { module, kept, added } = stored();
    const on = deps.slug();
    const hold = kept.slug === on ? kept.blocks.get(at) : undefined;
    let out: S = module && hold ? { ...segment, rows: module.keepInPlace(hold.before, segment.rows, hold.held) } : segment;
    /* A CHECKLIST AND A BOARD ONLY: a path draws its stones from its own cell and a roadmap its bars from their days, so
       for those the primitive's own marks are still the only drawing of the gesture until the page is read again. */
    const kind = (segment as { kind?: unknown }).kind;
    const worn = hold && (kind === 'todo' || kind === 'board') ? wornOf(hold.held) : '';
    const raw = (segment as { raw?: unknown }).raw;
    if (worn && typeof raw === 'string') out = { ...out, raw: `${raw}\u0000${worn}` };
    const typed = added.slug === on && block?.register && (block.kind === 'todo' || block.kind === 'list') ? added.rows.get(block.register) : undefined;
    /* AND A LINE AT THE HEAD MOVES EVERY ROW BELOW IT ONE PLACE, so it changes `raw` too: the primitive's marks are by
       place, and a mark left where it was would sit on the row above the one it was made on. */
    if (typed && typed.length > 0) {
      out = { ...out, rows: [...typed, ...out.rows] };
      const now = (out as { raw?: unknown }).raw;
      if (typeof now === 'string') out = { ...out, raw: `${now}\u0000+${typed.length}` };
    }
    return marked(at, out, block, several);
  }

  /**
   * The rows of `register` block `at` holds ticked done now, by their number: what Home's own late list draws ticked
   * (`home/HomeRows.svelte`), which draws no renderer rows for `keptSegment` to hold. A refusal or an Undo takes the
   * hold back, and the tick with it.
   */
  function heldDone(at: number, register: string): ReadonlySet<number> {
    const { kept } = stored();
    const hold = kept.slug === deps.slug() ? kept.blocks.get(at) : undefined;
    const lead = `${register}#`;
    return new Set([...(hold?.held ?? [])].flatMap(([key, k]) => (k.done === true && key.startsWith(lead) ? [Number(key.slice(lead.length))] : [])));
  }

  /**
   * The rows of `segment` that arrived since block `at` was last drawn, marked. Rows the page drew from no record row are never marked.
   *
   * A BLOCK DRAWN AS SEVERAL RUNS OF ROWS IS READ RUN BY RUN (`several` is the run's place). Every run of one block was
   * the same list here (`listOf`), so each run's rows were new against the run drawn before it, and a block of two runs
   * stood marked for as long as it kept drawing. A caller that says only that there are several (`true`) marks none:
   * its look is no baseline, as a block the record did not answer.
   */
  function marked<S extends { rows: Row[] }>(at: number, segment: S, block?: LiveBlock, several: boolean | number = false): S {
    const seen = deps.arrivals;
    if (!seen) return segment;
    const key = (row: Row): string | null => (row.ref ? `${row.ref.register}#${row.ref.seq}` : null);
    const keys = segment.rows.flatMap((r) => key(r) ?? []);
    const list = listOf(at, block);
    let on: ReadonlySet<string>;
    if (typeof several === 'number') on = arrivedInRun(seen, list, several, keys, answered(block));
    else {
      /* ONE RUN AGAIN, so what its runs held is no longer what the block draws, and they start again if they come back. */
      const was = runsOf.get(list);
      if (was) runsOf.set(list, runsNone(was.turn + 1));
      on = seen.see(list, keys, !several && answered(block));
    }
    if (on.size === 0) return segment;
    return { ...segment, rows: segment.rows.map((r) => (on.has(key(r) ?? '') ? { ...r, arrived: true } : r)) };
  }

  /**
   * What each run of a block held when it was last drawn, by the block (`listOf`). `was` is the look before `last`, kept
   * because the runs of one look are drawn one after another: by the time the second run is read, the first has already
   * given up the row that went from it.
   */
  type Runs = { turn: number; last: Map<number, ReadonlySet<string>>; was: Map<number, ReadonlySet<string>>; came: Set<string>; moved: Set<string> };
  const runsNone = (turn: number): Runs => ({ turn, last: new Map(), was: new Map(), came: new Set(), moved: new Set() });
  const runsOf = new Map<string, Runs>();

  /**
   * Which of `keys`, the rows run `run` of block `list` draws now, arrived in the block since it was last drawn.
   *
   * EACH RUN IS A LIST OF ITS OWN to `arrivals`, so a run is only ever read against itself. A ROW THAT CAME FROM ANOTHER
   * RUN OF THE SAME BLOCK DID NOT ARRIVE: a task ticked goes from the open run to the done one, and a group that takes
   * a place above moves every run below it. So a row new to its run is marked only when no other run held it (`came`),
   * and one that only changed runs is held unmarked for as long as the mark would have stood (`moved`).
   */
  function arrivedInRun(seen: Seen, list: string, run: number, keys: readonly string[], sure: boolean): ReadonlySet<string> {
    const runs = runsOf.get(list) ?? runsNone(0);
    runsOf.set(list, runs);
    const on = seen.see(`${list}#${runs.turn}.${run}`, keys, sure);
    const elsewhere = new Set<string>();
    for (const held of [runs.last, runs.was]) for (const [place, had] of held) if (place !== run) for (const k of had) elsewhere.add(k);
    const out = new Set<string>();
    for (const k of keys) {
      if (!on.has(k)) {
        runs.came.delete(k);
        runs.moved.delete(k);
      } else if (runs.came.has(k)) out.add(k);
      else if (runs.moved.has(k)) continue;
      else if (elsewhere.has(k)) runs.moved.add(k);
      else {
        runs.came.add(k);
        out.add(k);
      }
    }
    /* A look the record did not answer is no baseline here either, so it is not what the run is said to have held. */
    if (sure) {
      runs.was.set(run, runs.last.get(run) ?? new Set());
      runs.last.set(run, new Set(keys));
    }
    return out;
  }

  /** A `table` block's rows with the ones that arrived since it was last drawn marked, as `keptSegment` marks a list's. */
  function arrivedTable(at: number, rows: readonly TableRow[], block?: LiveBlock): TableRow[] {
    const seen = deps.arrivals;
    if (!seen) return [...rows];
    const on = seen.see(listOf(at, block), rows.map((r) => r.key), answered(block));
    return on.size === 0 ? [...rows] : rows.map((r) => (on.has(r.key) ? { ...r, arrived: true } : r));
  }

  /**
   * WHETHER WHAT A BLOCK DRAWS NOW IS THE RECORD'S ANSWER, which is what lets an empty look be a baseline (`arrivals` in
   * `lib/data/optimistic.ts`), so the first row into a list that was truly empty is marked.
   *
   * A PAGE IS ONE READ: every block of it comes back in one answer under one clock (`Opened` in `page-live.ts`), so the
   * page's clock says it for all of them, and none answers after another. The block's own answer is still asked, because
   * four blocks hold no rows without the record having said their list is empty: one it refused, one this build cannot
   * draw, one it left out, and one added while arranging over a list the page does not read yet (`added` in
   * `Arrange.svelte`, which has no read time). Their look marks nothing and is no baseline.
   */
  const answered = (block?: LiveBlock): boolean =>
    deps.now() !== null && !(block && (block.drawn === false || block.cannot !== undefined || (block.refusals?.length ?? 0) > 0 || block.stale_at === ''));

  /* WHICH LIST A BLOCK IS, for what arrived in it: the page, the place and what the block reads, so a block added in
     arrange mode at a place another block held is a new list with a baseline of its own, not a list of new rows. */
  const listOf = (at: number, block?: LiveBlock): string => `${deps.slug()}#${at}#${block?.kind ?? ''}#${block?.register ?? ''}`;

  /** Holds `ref` in block `at`, wearing `what`. `before` is the block as drawn now, which is the frame every place is read off. Answers what was held there before. */
  function holdRow(m: PageWrite, at: number, before: readonly Row[], ref: RowRef, what: Kept): Kept | undefined {
    const slug = deps.slug();
    const { kept } = stored();
    const blocks = new Map(kept.slug === slug ? kept.blocks : []);
    const prior = blocks.get(at);
    const was = prior?.held.get(m.rowKey(ref));
    blocks.set(at, { before: [...before], held: new Map(prior?.held).set(m.rowKey(ref), what) });
    put({ kept: { slug, blocks } });
    return was;
  }

  /** Puts block `at`'s hold on `ref` back to `was`: what it held before a gesture the record refused, or nothing. */
  function unholdRow(m: PageWrite, at: number, ref: RowRef, was: Kept | undefined) {
    const slug = deps.slug();
    const { kept } = stored();
    if (kept.slug !== slug) return;
    const prior = kept.blocks.get(at);
    if (!prior) return;
    const held = new Map(prior.held);
    if (was) held.set(m.rowKey(ref), was);
    else held.delete(m.rowKey(ref));
    const blocks = new Map(kept.blocks);
    if (held.size === 0) blocks.delete(at);
    else blocks.set(at, { ...prior, held });
    put({ kept: { slug, blocks } });
  }

  /** Block `at`'s hold on `ref`, no longer waiting on the record: it has the write and the page has read it back. */
  function settleRow(m: PageWrite, at: number, ref: RowRef) {
    const { kept } = stored();
    const now = kept.slug === deps.slug() ? kept.blocks.get(at)?.held.get(m.rowKey(ref)) : undefined;
    if (now?.pending) holdRow(m, at, kept.blocks.get(at)!.before, ref, { ...now, pending: false });
  }

  /**
   * ON A LIVE PAGE A MOVED CARD AND A TICKED TASK ARE WRITES to the row each came from, named by the `ref` the page
   * answer carried. A refusal is the record's own sentence. A write that landed, or one that met a row changed first,
   * reads the page again without blanking it, so the card's mark goes once the row agrees with it.
   *
   * A WRITE THAT LANDS HOLDS ITS ROW AND SAYS SO WITH A WAY BACK. The re-read can leave the row out: a `todo` whose
   * `where:` leaves out done rows answers without the row it just ticked, and a
   * tick with no row and no receipt is a tick somebody reverses to check. The row stays where it was, wearing `what`;
   * the receipt's undo sends `back` at the version the write made, and the row stays put through that too, wearing
   * `undone`.
   */
  async function writeRow(
    ref: RowRef | undefined,
    change: Change,
    title: string,
    hold: { at: number; before: readonly Row[]; what: Kept; back: Back; undone: Kept; said: (w: PageWrite['words'], patch: Record<string, unknown>) => string; early?: boolean; mark?: string | ((patch: Record<string, unknown>, m: PageWrite) => string) },
  ): Promise<boolean> {
    if (!ref) return (toasts.push(copy.pageRowUnknown, { intent: 'warn' }), false);
    /* THE PAGE THE GESTURE WAS MADE ON. A write that lands after the reader has opened another page holds nothing,
       because its place was read off a block that page does not have. */
    const on = deps.slug();
    const m = stored().module ?? (await import('../record/page-write.ts'));
    if (!stored().module) put({ module: m });
    /* DRAWN BEFORE IT IS SENT (`lib/data/optimistic.ts`), where the hold can say what the row now is: a tick's box and a
       card's column. The row wears it over whatever the page reads meanwhile, until the record has answered and the
       page has read the answer back; a refusal puts back what the row was held as before. */
    const was = hold.early && on === deps.slug() ? { prior: holdRow(m, hold.at, hold.before, ref, { ...hold.what, pending: true }) } : null;
    const undraw = () => void (was && on === deps.slug() && unholdRow(m, hold.at, ref, was.prior));
    /* THE REGISTER AS THE RECORD DECLARES IT, so a list a pack brought is ticked and moved by its own states. */
    const decl = await m.schemaOf(deps.base(), ref.register);
    const patch = change(m, ref, decl);
    if (!patch) {
      undraw();
      return (toasts.push(copy.pageRowNoState, { intent: 'warn' }), false);
    }
    const out = await m.updateRow(deps.base(), ref, patch, title);
    if (out.from !== 'written') {
      undraw();
      toasts.push(out.fix, { intent: 'warn' });
    }
    if (out.from === 'written') {
      if (on === deps.slug()) holdRow(m, hold.at, hold.before, ref, { ...hold.what, version: out.version, pending: Boolean(hold.early) });
      const made: RowRef = { ...ref, version: out.version ?? ref.version };
      if (hold.mark) deps.touched?.(ref, typeof hold.mark === 'function' ? hold.mark(patch, m) : hold.mark, title);
      toasts.push(hold.said(m.words, patch), { intent: 'good', undo: () => void putBack(m, made, decl, title, hold), life: UNDO_MS });
    }
    if (out.from === 'written' || out.from === 'conflict') await deps.reread();
    if (out.from === 'written' && hold.early && on === deps.slug()) settleRow(m, hold.at, ref);
    /* WHETHER IT LANDED, for a declared press that shows its answer once only after the write is in (`act`). */
    return out.from === 'written';
  }

  /**
   * The receipt's undo: the opposite write at the version the first one made, with the row held where it still is.
   *
   * DRAWN AT ONCE TOO, for a tick and a card, which wear the way back before it is sent and the change again if the
   * record refuses it.
   */
  async function putBack(m: PageWrite, ref: RowRef, decl: Declared | null, title: string, hold: { at: number; back: Back; what: Kept; undone: Kept; early?: boolean }) {
    const { kept } = stored();
    const prior = kept.slug === deps.slug() ? kept.blocks.get(hold.at) : undefined;
    if (hold.early && prior) holdRow(m, hold.at, prior.before, ref, { ...hold.undone, pending: true });
    const patch = await hold.back(m, ref, decl);
    if (!patch) {
      if (hold.early && prior) holdRow(m, hold.at, prior.before, ref, { ...hold.what, version: ref.version });
      return;
    }
    const out = await m.updateRow(deps.base(), ref, patch, title);
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      if (hold.early && prior) holdRow(m, hold.at, prior.before, ref, { ...hold.what, version: ref.version });
    } else if (prior) holdRow(m, hold.at, prior.before, ref, { ...hold.undone, version: out.version, pending: Boolean(hold.early) });
    if (out.from === 'written' || out.from === 'conflict') await deps.reread();
    if (out.from === 'written' && hold.early) settleRow(m, hold.at, ref);
  }

  function moveCard(block: LiveBlock, row: Row, to: string, at: number, before: readonly Row[]) {
    const title = row.cells[1] ?? copy.cardFallback;
    /* A PAGE IS DRAWN ONLY OVER A LIVE ANSWER, so there is no card to move without one. The guard only narrows it, here
       and in the tick and the capture below. */
    if (deps.now() === null) return;
    const field = block.columns[0]?.field;
    /* WHERE IT CAME FROM, in the screen's spelling, which is what `movePatch` takes and what the held card wears. */
    const from = row.cells[0] ?? '';
    /* AND THE ROW IT WAS, because the column alone put a done card back dated today: the record re-dates a move into
       `done` that names no day, so a task finished on 1 September came back finished on the day of the undo.
       `moveBackOf` names the day the row held, as a tick's undo does. */
    const held = block.entries.find((e) => e.seq === row.ref?.seq && e.version === row.ref.version);
    return writeRow(row.ref, (m, ref, decl) => (field ? m.movePatch(ref, field, to, decl) : null), title, {
      at,
      before,
      what: { to },
      back: async (_m, ref, decl) => (field ? (await import('./move-undo.ts')).moveBackOf(ref, field, to, from, decl, held) : null),
      undone: { to: from },
      said: (w) => w.moved(title, to),
      early: true,
      mark: words.markMoved(to),
    });
  }

  /**
   * Whether a capture's list can take a line from this page: the list is one this build has a declaration for.
   *
   * THE DECLARATION NAMES THE TITLE FIELD, and the line goes nowhere else. `captureRow` answers null on the same
   * condition; it is asked here without importing it, because the write is loaded only when somebody presses Add, as
   * `page-write.ts` is for the other verbs. Where this is false the capture is handed no `oncapture` and draws its one
   * line naming the list, which is the renderer's rule: a field that cannot write is absent, not greyed.
   */
  const capturable = (block: LiveBlock): boolean => block.kind === 'capture' && Boolean(block.register && REGISTERS[block.register]?.title);

  /**
   * A line typed into a `capture`: one row in its list, titled with the line and filled with what the block pins.
   *
   * THE GRID'S OWN WRITE. `captureRow` is `capturedFields` over the block's fills, so the row is the one `/r/tasks`
   * writes for the same line under the same filter, required fields and all, and `rowWriter` is the client that list
   * writes through. What was filled on the reader's behalf is on the row, not in the receipt (AL13). A refusal is the
   * record's sentence; a landed row reads the page again, so a list of tasks below the field draws it.
   */
  async function captureLine(register: string, text: string, inherited: Record<string, string>) {
    const now = deps.now();
    if (now === null) return;
    /* THE ADD BOX KEEPS THE FOCUS (first-hour audit AH20): read again, it is drawn anew, and the focus fell to the page. */
    /* AND WHERE THE BOX GOES WITH THE EMPTY STATE IT STOOD IN (AL9), the focus lands on what was just added. */
    const back = holdFocus(justAdded);
    const typed = text.trim();
    /* A QUESTION IS ASKED, NOT FILED: "what is due this week" goes to the palette, where search and Slash answer it,
       as Today's ask bar sends it. Only where the host can open one; elsewhere the line is a row as it always was. */
    if (deps.ask && isQuestion(typed)) return deps.ask(typed);
    /* THE LINE IS ON THE LIST BEFORE IT IS WRITTEN, at the head of every checklist over the list it goes to, and it goes
       once the page has read the row back, or at once if the record refuses it (`lib/data/optimistic.ts`). */
    let line: Row = { cells: [typed], done: false };
    typedLine(register, line, true);
    const [{ captureRow, readLine }, { rowWriter }, { lineFigures }, { orderFor, newFor, orderRead, orderWrite }, { recordToday }] = await Promise.all([
      import('./capture.ts'),
      import('../record/rows-write.ts'),
      import('../record/line-figures.ts'),
      import('../tell/order-box.ts'),
      import('../record/zone.ts'),
    ]);
    const writer = rowWriter(deps.base());
    /* AN ORDER IS READ AS THE ORDERS LIST'S OWN BOX AND TELL READ ONE (audit 31 Oct n, AN5): "20 candles for Salma by
       Friday" on the Orders page was an order called the whole line, for nobody. It is Candles, 20 of them, for Salma,
       by Friday, and somebody new it is for is made in People with it, in the same write (RN5). */
    const order = orderFor(typed, register, recordToday(now));
    const title = REGISTERS[register]?.title;
    const ordered = order && title && typeof order.fields[title] === 'string' ? order : null;
    const person = newFor(ordered);
    const read = ordered && title ? (orderRead(ordered.fields, title, person) as { text: string; parsed: Fields; said: string[] }) : lightRead();
    let made: { register: string; seq: number } | null = null;
    function lightRead() {
      /* THE LIGHT SYNTAX, READ: "Chase Halden tomorrow #kiln" is drawn and written as "Chase Halden", due tomorrow. */
      const light = readLine(register, typed, now!);
      /* AND THE AMOUNT AND DAY A LINE ON A LIST OF MONEY CARRIES (AH5): "Electricity bill 850 due 5 Nov" is a bill of 850
         due on 5 Nov called "Electricity bill". What the light syntax read wins over it. */
      const figures = lineFigures(register, light.text, now!);
      return { text: figures.text, parsed: { ...figures.fields, ...light.parsed } as Fields, said: [...light.said, ...figures.said] };
    }
    if (read.text !== typed) {
      typedLine(register, line, false);
      line = { cells: [read.text], done: false };
      typedLine(register, line, true);
    }
    const row = captureRow(register, read.text, inherited, now, read.parsed);
    /* NO ROW IS A LIST WHOSE TITLE LEFT BETWEEN THE READ AND THE PRESS, because the page hands a capture a write only
       when the list declares one. It is the race it is, read again. */
    if (!row) {
      typedLine(register, line, false);
      toasts.push(copy.writeRaced, { intent: 'warn' });
      return void (await deps.reread());
    }
    const drawn = line;
    /* THROUGH THE ONE OPTIMISTIC RUNNER, so the receipt names the row and offers it back for six seconds, as a tick's
       does: Undo archives the row it wrote, at the version it landed with, and reads the page again. */
    const out = await optimist(toasts).run<{ seq: number; version: number }>({
      apply: () => {},
      revert: () => typedLine(register, drawn, false),
      /* ONE WRITE FOR THE ORDER AND SOMEBODY NEW IT IS FOR (RN5): a refused order made nobody. */
      send: () =>
        orderWrite(writer, register, row.fields, person).then(({ out: w, made: m }) => {
          made = m;
          return w.ok ? { ok: true as const, value: w.entry } : { ok: false as const, fix: w.fix };
        }),
      said: words.added(read.text, listWord(register, REGISTERS[register]?.name), read.said),
      /* AND THE PERSON AN ORDER MADE GOES BACK WITH IT, as on the list (RN5), unless something else now links to them (RO9). */
      undo: (landed) => () =>
        void writer
          .archive(register, landed.seq, landed.version)
          .then(() => (made ? writer.archiveAlone(made.register, made.seq) : undefined))
          .then(() => deps.reread()),
    });
    if (!out.ok) return back();
    deps.touched?.({ register, seq: out.value.seq }, words.markAdded, read.text);
    await deps.reread();
    typedLine(register, drawn, false);
    back();
  }

  /** The line Just changed draws for the latest write, or the card itself when the line opens nothing. */
  function justAdded(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>('main button.just-what') ?? document.querySelector<HTMLElement>('main [data-just]');
  }

  /** A captured line drawn on the lists over `register`, or taken off them. */
  function typedLine(register: string, line: Row, on: boolean) {
    const slug = deps.slug();
    const { added } = stored();
    const rows = new Map(added.slug === slug ? added.rows : []);
    const now = (rows.get(register) ?? []).filter((r) => r !== line);
    if (on) now.unshift(line);
    if (now.length > 0) rows.set(register, now);
    else rows.delete(register);
    put({ added: { slug, rows } });
  }

  /**
   * A field typed into on an `inputs` block, written to its row after a pause and the page read again (`inputs-write.ts`).
   *
   * THE WRITER IS LOADED ON THE FIRST KEYSTROKE, as `page-write.ts` is on the first tick, so a page nobody types into
   * never pulls it in; keystrokes made while it loads wait on the same promise, in the order they were typed. What the
   * record refused is kept by field and said under the block (`saidOf`).
   */
  let inputsWriter: Promise<InputsWriter> | null = null;
  function typeInto(row: Row, value: string) {
    if (deps.now() === null) return;
    inputsWriter ??= Promise.all([import('../record/inputs-write.ts'), import('../record/rows-write.ts')]).then(([m, { rowWriter }]) => {
      put({ inputsKey: m.keyOf });
      const writer = rowWriter(deps.base());
      return m.inputsWriter({
        write: (register, seq, patch, version) => writer.update(register, seq, patch, version),
        /* WHAT THE ROW HOLDS NOW, from the answer the page is drawing, so a money keeps its currency and a box left as it
           opened sends nothing. SEARCHED OVER EVERY `inputs` BLOCK ON THE LIST: two blocks over one list, each with its
           own `where:`, edit two rows, and asking only the first finds nothing for the second: a price typed there
           without its code then goes to `inputPatch` with no currency held and is written in the home currency. */
        held: (ref, field) =>
          deps
            .blocks()
            .filter((b) => b.kind === 'inputs' && b.register === ref.register)
            .flatMap((b) => b.entries)
            .find((e) => e.seq === ref.seq)?.fields[field],
        reread: deps.reread,
        said: (said) => put({ inputSaid: said }),
        /* THE RECORD'S HOME CURRENCY, AS THE KERNEL ANSWERS IT ON AN `inputs` BLOCK, so a bare figure typed into an empty
           money box is written in it; with none set the box says to type the code (`inputs-write.ts` `home`). */
        home: () => deps.blocks().find((b) => b.kind === 'inputs' && typeof b.home === 'string')?.home ?? null,
      });
    });
    void inputsWriter.then((w) => w.input(row, value));
  }

  /** The record's sentence about one drawn field of an `inputs` block, when it refused what was typed there. */
  function saidOf(row: Row): string | undefined {
    const { inputsKey, inputSaid } = stored();
    return row.ref && inputsKey ? inputSaid.get(inputsKey(row.ref, row.cells[0]?.trim() ?? '')) : undefined;
  }

  /**
   * A task ticked done or not done, with a receipt whose undo puts the row back as it was.
   *
   * THE UNDO SENDS WHAT THE ROW HELD, read off the block's `entries` at the version the tick is sent at, and not the
   * list's default not-done state: a task in `doing` ticked and undone came back `open`.
   * `tickBackOf` says why, and why a held row the re-read left out still falls back to the default.
   */
  function tickTask(block: LiveBlock, row: Row, done: boolean, at: number, before: readonly Row[]) {
    const title = row.cells[0] ?? copy.cardFallback;
    if (deps.now() === null) return;
    const held = block.entries.find((e) => e.seq === row.ref?.seq && e.version === row.ref.version);
    return writeRow(row.ref, (m, ref, decl) => m.tickPatch(ref, done, decl), title, {
      at,
      before,
      what: { done },
      back: async (_m, ref, decl) => (await import('./tick-undo.ts')).tickBackOf(ref, done, decl, held),
      undone: { done: !done },
      said: (w, patch) => w.ticked(title, done, patch),
      early: true,
      /* THE MARK SAYS THE RECEIPT'S WORD: "Paid" on a bill, "Done" on a task. */
      mark: done ? (patch, m) => (m.doneWord(patch) === 'done' ? words.markDone : m.doneWord(patch).replace(/^./u, (c) => c.toUpperCase())) : words.markReopened,
    });
  }

  /**
   * A roadmap bar dropped on a new day, with a receipt whose undo puts back the fields the row held.
   *
   * THE SAME WRITE A TICK AND A MOVED CARD MAKE, and not `rescheduleRow` on its own, which sends the update and nothing
   * else. `writeRow` is what holds the row where the reader left it, raises the receipt with its undo and reads the page
   * again, and a drop without those is a bar that jumps back on the re-read with no word said. `reschedule` works the
   * patch out from the block's `entries`, the row as the record stores it, and answers null for a drop that means no
   * write, so nothing is sent and no undo is spent.
   *
   * THE HOLD WEARS NOTHING. A tick wears its box and a card its column, because the re-read can leave those rows out;
   * a moved bar is still in the answer, drawn from it at its new day, and the hold only keeps its place in the table.
   */
  async function rescheduleBar(block: LiveBlock, row: Row, drop: Drop, at: number, before: readonly Row[]) {
    if (deps.now() === null) return;
    const { reschedule } = await import('../record/roadmap-write.ts');
    const change = reschedule(block, row, drop);
    if (!change) return;
    void writeRow(row.ref, () => change.patch, change.title, {
      at,
      before,
      what: {},
      back: () => change.back,
      undone: {},
      said: () => change.said,
      mark: words.markDated,
    });
  }

  /**
   * A stone pressed on a path, with a receipt whose undo puts the step back as it was.
   *
   * THE LIST'S `done` FIELD, FROM ITS `steps:` DECLARATION, and not the state a todo's tick moves: a path draws its marks
   * from that one `bool` (`done_now`), so a stone that moved a state would say "done" in the toast and stay open on the
   * path. The write is `writeRow`'s, so the step is held where it was, the receipt names it, and a refusal is the
   * record's own sentence.
   *
   * THE STEP IS FOUND AMONG THE BLOCK'S ENTRIES as a todo's row is, by the record row the stone names (`withRefs` in
   * `blocks.ts` skips the short view's name row and the count, so a stone's `ref` is its own step's). The rules for a
   * stone and its undo are loaded on the press, as a tick's undo is.
   */
  function onpath(block: LiveBlock, row: Row, done: boolean, at: number, before: readonly Row[]) {
    const title = row.cells[0] ?? copy.cardFallback;
    if (deps.now() === null) return;
    const held = block.entries.find((e) => e.seq === row.ref?.seq && e.version === row.ref.version);
    void import('./tick-undo.ts').then((stone) =>
      writeRow(row.ref, (_m, _ref, decl) => stone.stonePatch(done, decl), title, {
        at,
        before,
        what: { done },
        back: (_m, _ref, decl) => stone.stoneBackOf(done, decl, held),
        undone: { done: !done },
        said: (w) => w.ticked(title, done),
        mark: done ? words.markDone : words.markReopened,
      }),
    );
  }

  /**
   * Whether a block is a path a step can be added under: a `steps` block the record answered marks for, over a list.
   *
   * `done_now` IS THE RECORD SAYING THE LIST DECLARES `steps:`, which it answers only then (`marksOf` in `blocks.ts`), so
   * this is asked without loading the declaration; the press reads the declaration itself and says so when it is short.
   */
  const stepable = (block: LiveBlock): boolean => block.kind === 'steps' && Boolean(block.register) && Array.isArray((block as unknown as Record<string, unknown>).done_now);

  /**
   * A step typed under a path: one row in the path's list, titled with the line, belonging to the row the path's steps
   * belong to, and after the last of them. Answers whether it was written, so the field empties only then.
   *
   * THE ROW WRITER'S CREATE, as a capture's line is, over the list's own declaration read from the record, because a
   * path's list is one a pack declared and this build has no copy of it: the title field and the `steps:` `of` come
   * from the record, and `REGISTERS` would know neither.
   *
   * THE ROW IT BELONGS TO IS THE ONE EVERY STEP DRAWN HERE ALREADY NAMES, read off the block's entries; a path with no
   * step yet reads it from the block's `where:`, the `<of> is <row>` clause that put these steps on this path. With
   * neither, a step would be written to no path, and it is not written at all.
   *
   * AFTER THE LAST, where the list sorts by a number: one more than the highest step drawn, so a step added under a
   * path is its last stone and not wherever an empty rank sorts. A list sorted any other way draws it where its order
   * puts it.
   */
  async function addStep(block: LiveBlock, text: string): Promise<boolean> {
    const line = text.trim();
    const register = block.register;
    if (deps.now() === null || !register || line === '') return false;
    const [m, { stepsOf }, { rowWriter }] = await Promise.all([import('../record/page-write.ts'), import('./tick-undo.ts'), import('../record/rows-write.ts')]);
    const decl = await m.schemaOf(deps.base(), register);
    const steps = stepsOf(decl);
    const title = decl ? (decl as { title?: unknown }).title : undefined;
    const parent = steps ? parentOf(block, steps.of) : null;
    if (!steps || typeof title !== 'string' || parent === null) {
      toasts.push(copy.pathStepNowhere, { intent: 'warn' });
      return false;
    }
    const order = steps.order;
    const ranks = order ? block.entries.map((e) => e.fields[order]) : [];
    const last = ranks.length > 0 && ranks.every((r) => typeof r === 'number') ? Math.max(...(ranks as number[])) : null;
    const fields = { [title]: line, [steps.of]: parent, ...(order && last !== null ? { [order]: last + 1 } : {}) };
    const out = await rowWriter(deps.base()).create(register, fields);
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return false;
    }
    toasts.push(copy.pathStepAdded(line), { intent: 'good' });
    await deps.reread();
    return true;
  }

  /* ── a declared action pressed ───────────────────────── */

  /**
   * What a press was made on. A drawn row carries its record row (`ref`), and its fields are read off the block that
   * drew it; a question carries its id. `on` is the block the press came from, where the host says; without it the
   * block is the one that holds the row.
   */
  function onOf(row: unknown, on?: Pressed): On {
    const none: On = { drawn: null, ref: null, id: null, title: null, fields: {}, block: on?.block ?? null };
    if (!row || typeof row !== 'object') return none;
    const r = row as Record<string, unknown>;
    const said = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
    if (typeof r.id === 'string' && !('ref' in r)) return { ...none, id: r.id, title: said(r.question) ?? said(r.title) };
    const drawn = Array.isArray(r.cells) ? (row as Row) : null;
    const ref = drawn?.ref ?? (typeof r.register === 'string' && Number.isInteger(r.seq) ? ({ register: r.register, seq: r.seq as number, version: Number(r.version ?? 0) } as RowRef) : null);
    if (!ref) return { ...none, drawn };
    const block = on?.block ?? deps.blocks().find((b) => b.register === ref.register && b.entries.some((e) => e.seq === ref.seq)) ?? null;
    const entry = block?.entries.find((e) => e.seq === ref.seq);
    const fields = entry?.fields ?? (r.fields && typeof r.fields === 'object' ? (r.fields as Record<string, unknown>) : {});
    const titled = REGISTERS[ref.register]?.title;
    const cell = drawn ? (block?.kind === 'board' ? drawn.cells[1] : drawn.cells[0]) : undefined;
    return { drawn, ref, id: null, title: (titled ? said(fields[titled]) : null) ?? said(cell) ?? null, fields, block };
  }

  /** A way back taken from a receipt: said put back when it was, and "Could not undo" with what when it was not. */
  async function undoBack(what: string, run: () => Promise<{ from: string; fix?: string }>) {
    const out = await run().catch(() => ({ from: 'refused' as const, fix: undefined }));
    if (out.from === 'undone') toasts.push(actWordsOf().undone(what), { intent: 'good' });
    else toasts.push(actWordsOf().undoFailed(what, out.fix), { intent: 'warn' });
    await deps.reread();
  }

  /* THE PRESS'S WORDS, from the module its first press loaded (`act` loads it before anything here is reached). */
  let sheetMod: typeof import('./act-sheet.ts') | null = null;
  const actWordsOf = () => sheetMod!.actWords;

  /**
   * ONE PRESS ON A DECLARED ACTION, with its one step and its Undo (`act-sheet.ts` `stepOf`).
   *
   * THE STEPS FIRST, THEN THE PRESS. Sign in again, a look at what will change, or the sheet that names the loss each
   * answer yes or no, and a no runs nothing. Then the verb runs once, through the write a screen already makes for it,
   * so a declared page's tick, move or answer is held, refused and taken back exactly as the hand-written one is. A
   * verb shown once opens its value after it lands, and the value is never kept.
   *
   * A VERB THIS HOST CANNOT CARRY OUT SAYS WHAT IT WOULD DO AND RUNS NOTHING, before any sheet asks a question it has no
   * answer to. `value` is a switch's or a choice's new value; `on` is the block the press came from.
   */
  async function act(action: ActAction, row?: unknown, value?: unknown, on?: Pressed): Promise<Acted> {
    if (deps.now() === null || !action || typeof action.verb !== 'string') return { ok: false };
    const sheets = (sheetMod ??= await import('./act-sheet.ts'));
    const at = onOf(row, on);
    const args = sheets.argsOf(action, at, value);
    if (!actable(action.verb)) return (toasts.push(sheets.actWords.cannot(action.label.trim(), sheets.lookOf(action, at.title, args).join(' ')), { intent: 'warn' }), { ok: false });
    const open = deps.sheet ?? sheets.openSheet;
    let a = action;
    for (;;) {
      const { step, said } = sheets.stepOf(a);
      const ask =
        step === 'again'
          ? ({ kind: 'again', label: a.label } as const)
          : step === 'look_first'
            ? ({ kind: 'look', label: a.label, lines: sheets.lookOf(a, at.title, args) } as const)
            : step === 'confirm'
              ? ({ kind: 'confirm', label: a.label, said: said ?? sheets.HARD_PLAIN } as const)
              : null;
      if (!ask) break;
      if (!(await open(ask))) return { ok: false };
      a = sheets.pastStep(a, step);
    }
    const out = await pressed(a, at, args, value, on);
    if (a.once === true && out.ok) await open({ kind: 'once', label: a.label, value: sheets.answeredValue(out.value) });
    return { ok: out.ok, ...(out.fix === undefined ? {} : { fix: out.fix }), ...(out.at === undefined ? {} : { at: out.at }) };
  }

  /**
   * The verb run once, through the write its kind already has. Answers whether it was sent and what it answered, for a
   * value shown once; a refusal has been said by then, in the record's own words, and nothing is left changed.
   */
  async function pressed(a: ActAction, at: On, args: Record<string, unknown>, value: unknown, on?: Pressed): Promise<{ ok: boolean; value?: unknown; fix?: string; at?: string }> {
    const w = sheetMod!.actWords;
    const label = a.label.trim();
    const what = at.title ? `${label}, “${at.title}”` : label;
    const place = on?.at ?? -1;
    const before = on?.before ?? [];
    const keepsUndo = a.undo !== false;
    if (a.verb === ANSWER_VERB) {
      const option = typeof args.option === 'string' ? args.option : '';
      if (!at.id || option === '') return (toasts.push(w.noRow, { intent: 'warn' }), { ok: false });
      const [{ answerQuestion }, { undoDecision }] = await Promise.all([import('../record/decide-write.ts'), import('../record/undo-write.ts')]);
      const reason = typeof args.reason === 'string' && args.reason.trim() !== '' ? args.reason : undefined;
      const out = await optimist(toasts).run<{ decision: string | null }>({
        apply: () => {},
        revert: () => {},
        send: () => answerQuestion(deps.base(), at.id!, option, reason).then((x) => (x.from === 'written' ? { ok: true as const, value: x } : { ok: false as const, fix: x.fix })),
        said: w.done(label, at.title ?? option),
        undo: (x) => (keepsUndo && x.decision ? () => void undoBack(what, () => undoDecision(deps.base(), x.decision!)) : null),
      });
      await deps.reread();
      return out.ok ? { ok: true, value: out.value } : { ok: false };
    }
    /* A FORM THAT ASKS: an options question filed through propose, signed by whoever pressed, as Decide's own
       "Ask yourself" sheet files one; its Undo takes it back while it is open. */
    if (a.verb === 'question.ask') {
      const said = value && typeof value === 'object' ? (value as Record<string, unknown>) : args.fields && typeof args.fields === 'object' ? (args.fields as Record<string, unknown>) : {};
      const word = (k: string): string => (typeof said[k] === 'string' ? (said[k] as string) : '');
      const { askYourself } = await import('../record/decide-write.ts');
      const out = await optimist(toasts).run<{ id: string }>({
        apply: () => {},
        revert: () => {},
        send: () =>
          askYourself(deps.base(), { question: word('question'), why: word('why'), options: [{ label: word('first'), because: '' }, { label: word('second'), because: '' }], recommended: null }).then((x) => {
            if (x.from === 'filed') return { ok: true as const, value: { id: x.id } };
            const at = x.at === 'option-1' ? 'first' : x.at === 'option-2' ? 'second' : x.at;
            return { ok: false as const, fix: x.fix, ...(at ? { at } : {}) };
          }),
        said: w.done(label, null),
        undo: (filed) =>
          keepsUndo && filed.id !== ''
            ? () =>
                void undoBack(label, async () => {
                  const { createClient } = await import('@braindog/client');
                  const x = await createClient({ base: deps.base() }).call<unknown>('withdraw', { id: filed.id });
                  return x.ok ? { from: 'undone' } : { from: 'refused', ...('refusal' in x ? { fix: x.refusal.fix } : {}) };
                })
            : null,
      });
      await deps.reread();
      return out.ok ? { ok: true, value: out.value } : { ok: false, fix: out.fix, ...(out.at ? { at: out.at } : {}) };
    }
    if (!ROW_VERBS.has(a.verb)) return generic(a, at, args, what, keepsUndo);
    if (a.verb === 'row.create') {
      /* A FORM NAMES ITS LIST ON THE ACTION, not by a source: it reads no rows, so the page gives it no register. */
      const bound = a.args && !Array.isArray(a.args) ? (a.args as Readonly<Record<string, unknown>>).register : undefined;
      const register = at.block?.register ?? at.ref?.register ?? (typeof bound === 'string' && bound !== '' ? bound : undefined);
      if (!register) return (toasts.push(w.noRow, { intent: 'warn' }), { ok: false });
      /* A LINE TYPED IS A CAPTURE, the same write a capture field makes, with its receipt and its Undo. */
      if (typeof args.fields === 'string' && at.block && capturable(at.block)) return (await captureLine(register, args.fields, {}), { ok: true });
      /* A LINE ON A LIST WITH NO CAPTURE IS ITS TITLE, where the list names one; a press that sends nothing adds nothing,
         rather than a blank one somebody has to find and delete. */
      const titled = REGISTERS[register]?.title;
      const typed = typeof args.fields === 'string' && args.fields.trim() !== '' ? args.fields.trim() : null;
      const fields = args.fields && typeof args.fields === 'object' ? (args.fields as Record<string, unknown>) : typed && titled ? { [titled]: typed } : {};
      if (Object.keys(fields).length === 0) return (toasts.push(w.noAdd, { intent: 'warn' }), { ok: false });
      const { rowWriter } = await import('../record/rows-write.ts');
      const writer = rowWriter(deps.base());
      const out = await optimist(toasts).run<{ seq: number; version: number }>({
        apply: () => {},
        revert: () => {},
        send: () => writer.create(register, fields as never).then((x) => (x.ok ? { ok: true as const, value: x.entry } : { ok: false as const, fix: x.fix, ...('at' in x && x.at ? { at: x.at } : {}) })),
        said: w.done(label, null),
        undo: (made) =>
          keepsUndo ? () => void undoBack(label, () => writer.archive(register, made.seq, made.version).then((x) => (x.ok ? { from: 'undone' } : { from: 'refused', fix: x.fix }))) : null,
      });
      await deps.reread();
      return out.ok ? { ok: true, value: out.value } : { ok: false, fix: out.fix, ...(out.at ? { at: out.at } : {}) };
    }
    if (!at.ref) return (toasts.push(w.noRow, { intent: 'warn' }), { ok: false });
    /* A TICK IS THE TICK WRITE, and a move on a board's own column is the card moved: held, refused and undone as they are. */
    if (a.verb === 'row.tick' && at.drawn && at.block) {
      const done = sheetMod!.doneOf(args.done) ?? !at.drawn.done;
      return { ok: (await tickTask(at.block, at.drawn, done, place, before)) === true };
    }
    const column = at.block?.kind === 'board' ? at.block.columns[0]?.field : undefined;
    if (a.verb === 'row.move' && at.drawn && at.block && column && (args.field === undefined || args.field === column) && typeof args.to === 'string') {
      return { ok: (await moveCard(at.block, at.drawn, args.to, place, before)) === true };
    }
    const now = deps.now();
    let patch: Record<string, unknown> | null = null;
    let back: Record<string, unknown> | null = null;
    if (a.verb === 'row.delete') {
      patch = { deleted_at: new Date(now ?? Date.now()).toISOString() };
      back = { deleted_at: null };
    } else if (a.verb === 'row.tick') {
      /* A TICK ON A ROW NO CHECKLIST DREW: the list's own states, as `tickPatch` reads them, sent as the same write. */
      const done = sheetMod!.doneOf(args.done);
      if (done === null) return (toasts.push(copy.pageRowNoState, { intent: 'warn' }), { ok: false });
      const landed = await writeRow(at.ref, (m, ref, decl) => m.tickPatch(ref, done, decl), at.title ?? label, {
        at: place,
        before,
        what: {},
        back: (m, ref, decl) => m.tickPatch(ref, !done, decl),
        undone: {},
        said: () => w.done(label, at.title),
        mark: label,
      });
      return { ok: landed };
    } else {
      const field = typeof args.field === 'string' ? args.field : '';
      const to = a.verb === 'row.move' ? args.to : args.value;
      /* A YES-OR-NO FIELD NEEDS NO VALUE FROM THE PRESS (polish-i, PI4): a button "Mark as a subscription" bound to
         `subscription` turns it on, as a switch's "true" does, and the field's own type says it is one. Worked out
         where the list's declaration is read (`flagged`), so a list a pack extended is read as the record declares it.
         AND IT SETS, NEVER FLIPS (RF7): "Mark as" pressed on a row already marked, or on a page that still shows it
         unmarked after another tab marked it, unmarked it, because the press wrote the opposite of the page's copy. A
         press clears the field only when it says off, as a switch does. */
      /* AND A SWITCH'S ON OR OFF, so a list a pack declares is written true or false by its own type, never the word. */
      const flag =
        a.verb === 'row.update' && field !== '' && (REGISTERS[at.ref.register]?.fields.find((f) => f.id === field)?.type === 'bool' || to === undefined || sheetMod!.doneOf(to) !== null);
      if (field === '' || (to === undefined && !flag)) return (toasts.push(w.noChange, { intent: 'warn' }), { ok: false });
      if (flag) {
        /* AN UNSET FLAG GOES BACK TO UNSET, so its Undo is never "nothing to put back". */
        const undo = { [field]: at.fields[field] ?? null };
        const flagged = (decl: Declared | null): Record<string, unknown> | null => {
          const typed = decl?.fields.find((f) => f.id === field)?.type ?? REGISTERS[at.ref!.register]?.fields.find((f) => f.id === field)?.type;
          if (typed !== 'bool') return to === undefined ? null : { [field]: to };
          return { [field]: to === undefined ? true : (sheetMod!.doneOf(to) ?? to) };
        };
        const landed = await writeRow(at.ref, (_m, _ref, decl) => flagged(decl), at.title ?? label, {
          at: place,
          before,
          what: {},
          back: () => undo,
          undone: {},
          said: () => w.done(label, at.title),
          mark: label,
        });
        return { ok: landed };
      }
      patch = { [field]: to };
      back = Object.hasOwn(at.fields, field) ? { [field]: at.fields[field] ?? null } : null;
    }
    const sent = patch;
    /* AWAITED, so a value shown once opens only over a write that landed, never over a refusal. */
    const landed = await writeRow(at.ref, () => sent, at.title ?? label, {
      at: place,
      before,
      what: {},
      /* NO WAY BACK IS SAID, NOT SENT EMPTY: a row read without the field has no value to put back. */
      back: () => {
        if (!back) toasts.push(w.undoFailed(what), { intent: 'warn' });
        return back;
      },
      undone: {},
      said: () => w.done(label, at.title),
      mark: label,
    });
    return { ok: landed };
  }

  /**
   * A verb the table sends by its own method: one call to the record with the press's args and the row it was made on.
   * The record says the batch it wrote under, and the receipt's Undo puts that batch back (`undo-back.ts`).
   */
  async function generic(a: ActAction, at: On, args: Record<string, unknown>, what: string, keepsUndo: boolean): Promise<{ ok: boolean; value?: unknown }> {
    const method = ACT_CALLS[a.verb]!;
    const [{ createClient }, { undoChange }] = await Promise.all([import('@braindog/client'), import('../record/undo-write.ts')]);
    const client = createClient({ base: deps.base() });
    const params = { ...args, ...(at.ref ? { register: at.ref.register, seq: at.ref.seq } : {}), ...(at.id ? { id: at.id } : {}) };
    const out = await optimist(toasts, {
      ...(keepsUndo
        ? /* A WAY BACK REFUSED IS SAID WITH WHAT IT WAS: the runner says this sentence, so it is "Could not undo" and the thing. */
          { undoBatch: (batch: string) => undoChange(deps.base(), batch).then((u) => (u.from === 'undone' ? u : { ...u, fix: sheetMod!.actWords.undoFailed(what, u.fix) })) }
        : {}),
      reread: deps.reread,
    }).run<unknown>({
      apply: () => {},
      revert: () => {},
      send: () => client.call<unknown>(method, params).then((x) => (x.ok ? { ok: true as const, value: x.value } : { ok: false as const, fix: 'refusal' in x ? x.refusal.fix : copy.writeRaced })),
      said: sheetMod!.actWords.done(a.label.trim(), at.title),
    });
    await deps.reread();
    return out.ok ? { ok: true, value: out.value } : { ok: false };
  }

  /* THE PAGE READ AGAIN, for a host panel that changed the record from beside a block (a run put back). */
  const reread = (): Promise<void> => deps.reread();

  return { forPage, warm, keptSegment, heldDone, arrivedTable, moveCard, capturable, captureLine, typeInto, saidOf, tickTask, rescheduleBar, onpath, stepable, addStep, act, reread };
}

/**
 * What a block's holds wear, as one string: the key, tick and column of every held row that wears one. It changes
 * exactly when what the primitive should draw from the host changes, which is when its own marks must go.
 */
function wornOf(held: ReadonlyMap<string, Kept>): string {
  const out: string[] = [];
  for (const [key, kept] of held) {
    if (kept.done === undefined && kept.to === undefined) continue;
    out.push(`${key}:${kept.done === undefined ? '' : kept.done ? 1 : 0}:${kept.to ?? ''}:${kept.pending ? 'p' : ''}`);
  }
  return out.join('|');
}

/**
 * The row a path's steps belong to: the value of `of` every drawn step holds, or the one the block's `where:` pins, or
 * `null` when neither says.
 *
 * ONE ROW OR NONE. Steps that name two rows are a block over more than one path, and a new step given either would be
 * a guess, so they answer null as no row does. A `where:` clause still holding a `{{` placeholder is a sentence the
 * record did not fill, and is no row either.
 */
function parentOf(block: LiveBlock, of: string): string | number | null {
  const named = [...new Set(block.entries.map((e) => e.fields[of]).filter((v): v is string | number => typeof v === 'string' || typeof v === 'number'))];
  if (named.length > 0) return named.length === 1 ? named[0]! : null;
  const clause = (block.where ?? '').split(/\s+and\s+/u).map((c) => c.trim().match(/^(\S+)\s+is\s+(.+)$/u)).find((c) => c?.[1] === of);
  const value = clause?.[2]?.trim();
  return value && !value.includes('{{') ? value : null;
}

/** The writes a page hands every block it draws; `null` where the page is inert. */
export type Writes = ReturnType<typeof pageWrites>;
