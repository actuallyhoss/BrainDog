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

import type { Row, RowRef, TableRow } from 'braindog-render';

import { copy } from '../copy.ts';
import { REGISTERS } from '../record/held.ts';
import type { LiveBlock } from '../record/page-live.ts';
import type { Declared, Kept } from '../record/page-write.ts';
import type { InputsWriter } from '../record/inputs-write.ts';
import type { Drop } from '../record/roadmap-write.ts';
import type { toasts } from '../ui/toast.svelte.ts';
import { optimist, UNDO_MS } from '../data/optimistic.ts';
import { isQuestion } from '../work/capture.ts';
import { words } from './words.ts';

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
export type Seen = { see(list: string, keys: readonly string[]): ReadonlySet<string>; forget(): void };

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
};

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
  function keptSegment<S extends { rows: Row[] }>(at: number, segment: S, block?: LiveBlock): S {
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
    return marked(at, out, block);
  }

  /** The rows of `segment` that arrived since block `at` was last drawn, marked. Rows the page drew from no record row are never marked. */
  function marked<S extends { rows: Row[] }>(at: number, segment: S, block?: LiveBlock): S {
    const seen = deps.arrivals;
    if (!seen) return segment;
    const key = (row: Row): string | null => (row.ref ? `${row.ref.register}#${row.ref.seq}` : null);
    const on = seen.see(listOf(at, block), segment.rows.flatMap((r) => key(r) ?? []));
    if (on.size === 0) return segment;
    return { ...segment, rows: segment.rows.map((r) => (on.has(key(r) ?? '') ? { ...r, arrived: true } : r)) };
  }

  /** A `table` block's rows with the ones that arrived since it was last drawn marked, as `keptSegment` marks a list's. */
  function arrivedTable(at: number, rows: readonly TableRow[], block?: LiveBlock): TableRow[] {
    const seen = deps.arrivals;
    if (!seen) return [...rows];
    const on = seen.see(listOf(at, block), rows.map((r) => r.key));
    return on.size === 0 ? [...rows] : rows.map((r) => (on.has(r.key) ? { ...r, arrived: true } : r));
  }

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
    hold: { at: number; before: readonly Row[]; what: Kept; back: Back; undone: Kept; said: (w: PageWrite['words']) => string; early?: boolean },
  ) {
    if (!ref) return void toasts.push(copy.pageRowUnknown, { intent: 'warn' });
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
      return void toasts.push(copy.pageRowNoState, { intent: 'warn' });
    }
    const out = await m.updateRow(deps.base(), ref, patch, title);
    if (out.from !== 'written') {
      undraw();
      toasts.push(out.fix, { intent: 'warn' });
    }
    if (out.from === 'written') {
      if (on === deps.slug()) holdRow(m, hold.at, hold.before, ref, { ...hold.what, version: out.version, pending: Boolean(hold.early) });
      const made: RowRef = { ...ref, version: out.version ?? ref.version };
      toasts.push(hold.said(m.words), { intent: 'good', undo: () => void putBack(m, made, decl, title, hold), life: UNDO_MS });
    }
    if (out.from === 'written' || out.from === 'conflict') await deps.reread();
    if (out.from === 'written' && hold.early && on === deps.slug()) settleRow(m, hold.at, ref);
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
    void writeRow(row.ref, (m, ref, decl) => (field ? m.movePatch(ref, field, to, decl) : null), title, {
      at,
      before,
      what: { to },
      back: async (_m, ref, decl) => (field ? (await import('./move-undo.ts')).moveBackOf(ref, field, to, from, decl, held) : null),
      undone: { to: from },
      said: (w) => w.moved(title, to),
      early: true,
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
   * writes through. What was filled on the reader's behalf is said once, as the grid says it. A refusal is the
   * record's sentence; a landed row reads the page again, so a list of tasks below the field draws it.
   */
  async function captureLine(register: string, text: string, inherited: Record<string, string>) {
    const now = deps.now();
    if (now === null) return;
    const typed = text.trim();
    /* A QUESTION IS ASKED, NOT FILED: "what is due this week" goes to the palette, where search and Slash answer it,
       as Today's ask bar sends it. Only where the host can open one; elsewhere the line is a row as it always was. */
    if (deps.ask && isQuestion(typed)) return deps.ask(typed);
    /* THE LINE IS ON THE LIST BEFORE IT IS WRITTEN, at the head of every checklist over the list it goes to, and it goes
       once the page has read the row back, or at once if the record refuses it (`lib/data/optimistic.ts`). */
    let line: Row = { cells: [typed], done: false };
    typedLine(register, line, true);
    const [{ captureRow, readLine }, { rowWriter }] = await Promise.all([import('./capture.ts'), import('../record/rows-write.ts')]);
    /* THE LIGHT SYNTAX, READ: "Chase Halden tomorrow #kiln" is drawn and written as "Chase Halden", due tomorrow. */
    const read = readLine(register, typed, now);
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
    const writer = rowWriter(deps.base());
    const drawn = line;
    /* THROUGH THE ONE OPTIMISTIC RUNNER, so the receipt names the row and offers it back for six seconds, as a tick's
       does: Undo archives the row it wrote, at the version it landed with, and reads the page again. */
    const out = await optimist(toasts).run<{ seq: number; version: number }>({
      apply: () => {},
      revert: () => typedLine(register, drawn, false),
      send: () => writer.create(register, row.fields).then((w) => (w.ok ? { ok: true as const, value: w.entry } : { ok: false as const, fix: w.fix })),
      said: words.added(read.text, REGISTERS[register]?.name ?? register, read.said, row.filled),
      undo: (landed) => () => void writer.archive(register, landed.seq, landed.version).then(() => deps.reread()),
    });
    if (!out.ok) return;
    await deps.reread();
    typedLine(register, drawn, false);
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
    void writeRow(row.ref, (m, ref, decl) => m.tickPatch(ref, done, decl), title, {
      at,
      before,
      what: { done },
      back: async (_m, ref, decl) => (await import('./tick-undo.ts')).tickBackOf(ref, done, decl, held),
      undone: { done: !done },
      said: (w) => w.ticked(title, done),
      early: true,
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

  return { forPage, warm, keptSegment, arrivedTable, moveCard, capturable, captureLine, typeInto, saidOf, tickTask, rescheduleBar, onpath, stepable, addStep };
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
