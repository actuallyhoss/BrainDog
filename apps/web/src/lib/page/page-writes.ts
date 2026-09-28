/**
 * Every write a declared page makes: a task ticked, a card moved, a bar dropped on a new day, a line captured, a field
 * typed into, and an option pressed on a queue. The one job `PageView.svelte` held beside five others until it was
 * split (`loop/finish/pages.md` R1), and the `Writes` object the page hands each block.
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

import type { Row, RowRef } from 'braindog-render';

import { copy } from '../copy.ts';
import { REGISTERS } from '../record/held.ts';
import type { LiveBlock } from '../record/page-live.ts';
import type { Declared, Kept } from '../record/page-write.ts';
import type { InputsWriter } from '../record/inputs-write.ts';
import type { Drop } from '../record/roadmap-write.ts';
import type { toasts } from '../ui/toast.svelte.ts';

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
};

/** Nothing held: the state a page opens with. A function, so no two pages ever share one map. */
export const heldNone = (): Held => ({ module: null, kept: { slug: '', blocks: new Map() }, inputsKey: null, inputSaid: new Map() });

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
    if (stored().kept.slug !== on) put({ kept: { slug: on, blocks: new Map() } });
  }

  /** A block's segment with its held rows where they were. Untouched until something on this page is held. */
  function keptSegment<S extends { rows: Row[] }>(at: number, segment: S): S {
    const { module, kept } = stored();
    const hold = kept.slug === deps.slug() ? kept.blocks.get(at) : undefined;
    return module && hold ? { ...segment, rows: module.keepInPlace(hold.before, segment.rows, hold.held) } : segment;
  }

  /** Holds `ref` in block `at`, wearing `what`. `before` is the block as drawn now, which is the frame every place is read off. */
  function holdRow(m: PageWrite, at: number, before: readonly Row[], ref: RowRef, what: Kept) {
    const slug = deps.slug();
    const { kept } = stored();
    const blocks = new Map(kept.slug === slug ? kept.blocks : []);
    const prior = blocks.get(at);
    blocks.set(at, { before: [...before], held: new Map(prior?.held).set(m.rowKey(ref), what) });
    put({ kept: { slug, blocks } });
  }

  /**
   * ON A LIVE PAGE A MOVED CARD AND A TICKED TASK ARE WRITES to the row each came from, named by the `ref` the page
   * answer carried. A refusal is the record's own sentence. A write that landed, or one that met a row changed first,
   * reads the page again without blanking it, so the card's mark goes once the row agrees with it.
   *
   * A WRITE THAT LANDS HOLDS ITS ROW AND SAYS SO WITH A WAY BACK. The re-read can leave the row out: a `todo` whose
   * `where:` leaves out done rows answers without the row it just ticked (`loop/research-m4-app.md`, brief 3), and a
   * tick with no row and no receipt is a tick somebody reverses to check. The row stays where it was, wearing `what`;
   * the receipt's undo sends `back` at the version the write made, and the row stays put through that too, wearing
   * `undone`.
   */
  async function writeRow(
    ref: RowRef | undefined,
    change: Change,
    title: string,
    hold: { at: number; before: readonly Row[]; what: Kept; back: Back; undone: Kept; said: (w: PageWrite['words']) => string },
  ) {
    if (!ref) return void toasts.push(copy.pageRowUnknown, { intent: 'warn' });
    /* THE PAGE THE GESTURE WAS MADE ON. A write that lands after the reader has opened another page holds nothing,
       because its place was read off a block that page does not have. */
    const on = deps.slug();
    const m = await import('../record/page-write.ts');
    put({ module: m });
    /* THE REGISTER AS THE RECORD DECLARES IT, so a list a pack brought is ticked and moved by its own states. */
    const decl = await m.schemaOf(deps.base(), ref.register);
    const patch = change(m, ref, decl);
    if (!patch) return void toasts.push(copy.pageRowNoState, { intent: 'warn' });
    const out = await m.updateRow(deps.base(), ref, patch, title);
    if (out.from !== 'written') toasts.push(out.fix, { intent: 'warn' });
    if (out.from === 'written') {
      if (on === deps.slug()) holdRow(m, hold.at, hold.before, ref, { ...hold.what, version: out.version });
      const made: RowRef = { ...ref, version: out.version ?? ref.version };
      toasts.push(hold.said(m.words), { intent: 'good', undo: () => void putBack(m, made, decl, title, hold) });
    }
    if (out.from === 'written' || out.from === 'conflict') await deps.reread();
  }

  /** The receipt's undo: the opposite write at the version the first one made, with the row held where it still is. */
  async function putBack(m: PageWrite, ref: RowRef, decl: Declared | null, title: string, hold: { at: number; back: Back; undone: Kept }) {
    const patch = await hold.back(m, ref, decl);
    if (!patch) return;
    const out = await m.updateRow(deps.base(), ref, patch, title);
    if (out.from !== 'written') toasts.push(out.fix, { intent: 'warn' });
    else {
      const { kept } = stored();
      const prior = kept.slug === deps.slug() ? kept.blocks.get(hold.at) : undefined;
      if (prior) holdRow(m, hold.at, prior.before, ref, { ...hold.undone, version: out.version });
    }
    if (out.from === 'written' || out.from === 'conflict') await deps.reread();
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
       `done` that names no day, so a task finished on 1 September came back finished on the day of the undo (audit
       sixty-five, section 2). `moveBackOf` names the day the row held, as a tick's undo does. */
    const held = block.entries.find((e) => e.seq === row.ref?.seq && e.version === row.ref.version);
    void writeRow(row.ref, (m, ref, decl) => (field ? m.movePatch(ref, field, to, decl) : null), title, {
      at,
      before,
      what: { to },
      back: async (_m, ref, decl) => (field ? (await import('./move-undo.ts')).moveBackOf(ref, field, to, from, decl, held) : null),
      undone: { to: from },
      said: (w) => w.moved(title, to),
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
    const [{ captureRow }, { rowWriter }] = await Promise.all([import('./capture.ts'), import('../record/rows-write.ts')]);
    const row = captureRow(register, text, inherited, now);
    /* NO ROW IS A LIST WHOSE TITLE LEFT BETWEEN THE READ AND THE PRESS, because the page hands a capture a write only
       when the list declares one. It is the race it is, read again. */
    if (!row) {
      toasts.push(copy.writeRaced, { intent: 'warn' });
      return void (await deps.reread());
    }
    const out = await rowWriter(deps.base()).create(register, row.fields);
    if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
    toasts.push(row.filled.length > 0 ? copy.markAddedFilled(row.filled) : copy.writeMarkAdded, { intent: 'good' });
    await deps.reread();
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
   * list's default not-done state: a task in `doing` ticked and undone came back `open` (audit sixty-four, section 3).
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

  return { forPage, keptSegment, moveCard, capturable, captureLine, typeInto, saidOf, tickTask, rescheduleBar, onpath, stepable, addStep };
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
