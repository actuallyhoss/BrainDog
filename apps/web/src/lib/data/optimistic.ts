/**
 * A write drawn before the record answers it, taken back if the record says no, and offered back for a few seconds
 * once it lands.
 *
 * THE SCREENS WAITED FOR THE ROUND TRIP. A tick, a moved card, a typed row and an archive each drew nothing until the
 * record had answered, so every everyday gesture paid a network's latency before the reader saw it land, and the
 * owner's old tool, which drew first and asked after, felt faster on the same host. The record is
 * right almost every time, so the screen draws the change at once and says so only on the rare refusal.
 *
 * TWO PIECES, BOTH PURE, so plain Node tests them the way `live.test.ts` tests the poll:
 *
 *   `optimist(say)` RUNS ONE CHANGE: `apply` draws it now, `send` writes it, and the answer either `settle`s the
 *   screen on what the record holds or `revert`s the drawing and says the record's one sentence. A change that lands
 *   with `undo` raises a toast whose Undo runs the way back through the same machinery, drawn at once too.
 *
 *   `overlay(keyOf)` IS WHAT A LIST DRAWS WHILE WRITES ARE OUT: patches over rows the record answered, rows added at the
 *   head or foot, rows taken out. It sits OVER the answer rather than in it, so a poll that re-reads the list while a
 *   write is out draws the change still, and dropping the layer is the whole of a revert.
 *
 * NOTHING HERE HOLDS A RUNE OR REACHES FOR THE SCREEN. The toast is handed in as `say`, and `overlay` calls `changed`
 * when it moves so a component can keep a rune in step (`optimistic.svelte.ts` does exactly that).
 *
 * USE, for a screen with a list of rows it writes:
 *
 *   const layer = liveOverlay<Entry>((e) => String(e.seq));          // optimistic.svelte.ts
 *   const shown = $derived(layer.draw(answer.rows));
 *   const run = optimist(toasts).run;
 *   run({
 *     apply: () => (patch = layer.patch('12', (e) => ({ ...e, fields: { ...e.fields, state: 'done' } }))),
 *     revert: () => layer.drop(patch),
 *     send: () => writer.update('tasks', 12, { state: 'done' }, version).then(sent),
 *     settle: (row) => (layer.drop(patch), land(row)),
 *     said: 'Marked Rent done.',
 *     undo: (row) => ({ ... the opposite change, built from what landed ... }),
 *   });
 */

import { batchOf, serverFirst } from '../record/undo-back.ts';
import type { Undone } from '../record/undo-write.ts';

/** What a write answered: the value it landed with, or the record's one sentence about why not. */
export type Sent<T> = { ok: true; value: T } | { ok: false; fix: string };

/** One write the screen draws before it is sent. */
export type Change<T> = {
  /** Draw the change now, before anything is sent. */
  apply: () => void;
  /** Take the drawing back: the record refused the write, or never answered it. */
  revert: () => void;
  /** Write it. A rejection is treated as a refusal whose sentence is `unsent`. */
  send: () => Promise<Sent<T>>;
  /** It landed: settle the screen on what the record answered, usually dropping the overlay and drawing the row. */
  settle?: (value: T) => void;
  /** The receipt, in the past tense with the row named. Absent, a write that lands says nothing. */
  said?: string | ((value: T) => string);
  /**
   * The way back from what landed: a `Change`, drawn and sent the same way, or a function for a screen whose way back
   * already draws itself (the register list's Put back). Absent or `null`, the receipt has no Undo of the screen's own;
   * a write that landed under a batch is still offered the record's, where `optimist` was handed `undoBatch`.
   */
  undo?: (value: T) => Change<unknown> | (() => void) | null;
  /**
   * Read the screen's rows again after the record put them back, so the Undo's drawing is let go only once it has.
   * Absent, `optimist`'s own `reread` is used.
   */
  reread?: () => unknown;
};

/** Where a change speaks: the app's toasts, or a test's list. `life` is how long an Undo stays offered. */
export type Say = {
  push(text: string, opts?: { undo?: () => void; intent?: 'good' | 'warn' | 'bad'; life?: number }): number;
};

/** How long a receipt's Undo is offered: six seconds, long enough to read the line and short enough to be gone. */
export const UNDO_MS = 6_000;

/** What a write that threw is said as, since a throw carries no sentence of the record's. */
export const UNSENT = 'That change did not reach your BrainDog, so it has been put back.';

/**
 * The runner, over where it speaks.
 *
 * `run` RESOLVES WITH THE ANSWER, so a caller that needs to know (a capture line putting the typing back) can, and one
 * that does not can ignore it: every visible consequence has already been drawn or said by then.
 */
export function optimist(
  say: Say,
  { life = UNDO_MS, undoBatch, reread }: { life?: number; undoBatch?: (batch: string) => Promise<Undone>; reread?: () => unknown } = {},
) {
  async function run<T>(change: Change<T>): Promise<Sent<T>> {
    change.apply();
    let out: Sent<T>;
    try {
      out = await change.send();
    } catch {
      out = { ok: false, fix: UNSENT };
    }
    if (!out.ok) {
      change.revert();
      say.push(out.fix, { intent: 'warn' });
      return out;
    }
    const value = out.value;
    change.settle?.(value);
    /* THE RECORD PUTS BACK A WRITE IT LOGGED UNDER A BATCH (`undo-back.ts`); the screen's own inverse is the fallback.
       The record's undo skips a screen's self-drawing Put back, so the screen is read again (`reread`) or it would
       still draw the write until the next poll. */
    const own = change.undo?.(value) ?? null;
    const back = undoBatch ? serverFirst(batchOf(value), own, undoBatch, change.reread ?? reread) : own;
    const said = typeof change.said === 'function' ? change.said(value) : change.said;
    /* AN EMPTY LINE RAISES NO TOAST. */
    if (said) {
      say.push(said, {
        intent: 'good',
        life,
        ...(back ? { undo: typeof back === 'function' ? back : () => void run(back) } : {}),
      });
    }
    return out;
  }
  return { run };
}

/* ── the layer a list draws ────────────────────────────────────────────────── */

type Layer<R> =
  | { kind: 'patch'; key: string; fn: (row: R) => R }
  | { kind: 'add'; row: R; at: 'start' | 'end' }
  | { kind: 'remove'; key: string };

/** A handle on one pending change in an overlay, which `drop` takes back. */
export type Pending = number;

/**
 * Changes drawn over a list the record answered, keyed by `keyOf`, in the order they were made.
 *
 * A PATCH ON A ROW THE ANSWER NO LONGER HAS IS SKIPPED, not resurrected: somebody else removed it, and their change is
 * the newer fact. AN ADDED ROW THE ANSWER NOW HAS is drawn once, from the answer, so the moment between the record
 * writing it and the overlay being dropped never draws it twice.
 */
export function overlay<R>(keyOf: (row: R) => string, changed: () => void = () => {}) {
  const layers = new Map<Pending, Layer<R>>();
  let next = 1;

  const put = (layer: Layer<R>): Pending => {
    const id = next++;
    layers.set(id, layer);
    changed();
    return id;
  };

  return {
    /** How many changes are drawn over the answer now. */
    get size(): number {
      return layers.size;
    },
    /** A change to one row, drawn over whatever the answer says of it. */
    patch: (key: string, fn: (row: R) => R): Pending => put({ kind: 'patch', key, fn }),
    /** A row the record has not written yet, at the head of the list or its foot. */
    add: (row: R, at: 'start' | 'end' = 'start'): Pending => put({ kind: 'add', row, at }),
    /** A row taken out of the list. */
    remove: (key: string): Pending => put({ kind: 'remove', key }),
    /** Takes one change back. Dropping one already dropped does nothing, so a revert and a settle can both call it. */
    drop(id: Pending | null | undefined): void {
      if (id != null && layers.delete(id)) changed();
    },
    /** Takes every change back: the list's question changed, and none of them is about the new answer. */
    clear(): void {
      if (layers.size === 0) return;
      layers.clear();
      changed();
    },
    /** The list as the screen draws it: the answer, with every change still out laid over it in order. */
    draw(rows: readonly R[]): R[] {
      if (layers.size === 0) return [...rows];
      let out = [...rows];
      for (const layer of layers.values()) {
        if (layer.kind === 'patch') out = out.map((row) => (keyOf(row) === layer.key ? layer.fn(row) : row));
        else if (layer.kind === 'remove') out = out.filter((row) => keyOf(row) !== layer.key);
        else if (!out.some((row) => keyOf(row) === keyOf(layer.row))) out = layer.at === 'start' ? [layer.row, ...out] : [...out, layer.row];
      }
      return out;
    },
  };
}

export type Overlay<R> = ReturnType<typeof overlay<R>>;

/* ── rows that arrived ─────────────────────────────────────────────────────── */

/** How long a row that arrived wears its tint: a second and a half, fading (`[data-arrived]` in `blocks.css`). */
export const ARRIVED_MS = 1_500;

/**
 * Which rows of a list are new since it was last drawn, marked for `ms`.
 *
 * A LIST'S FIRST LOOK IS ITS BASELINE, so opening a screen marks nothing: every row on it is new to the reader and a
 * screen of tinted rows says nothing. After that, a key the list did not draw last time is marked, whoever wrote it,
 * which is what makes an agent's row appear under the reader's eye rather than silently among the others.
 *
 * `see` MAY BE CALLED WHILE A SCREEN DRAWS, and more than once for one answer: the same keys twice mark nothing new.
 * `next` says when the earliest mark runs out, so a screen can draw once more then and take the tint away.
 */
export function arrivals(now: () => number = Date.now, ms = ARRIVED_MS) {
  const seen = new Map<string, Set<string>>();
  const until = new Map<string, number>();
  const at = (list: string, key: string) => `${list}\u0000${key}`;
  return {
    /** Notes the keys `list` draws now, and answers which of them are still marked as arrived. */
    see(list: string, keys: readonly string[]): ReadonlySet<string> {
      const t = now();
      const was = seen.get(list);
      if (was) for (const key of keys) if (!was.has(key)) until.set(at(list, key), t + ms);
      seen.set(list, new Set(keys));
      const out = new Set<string>();
      for (const key of keys) {
        const u = until.get(at(list, key));
        if (u === undefined) continue;
        if (u > t) out.add(key);
        else until.delete(at(list, key));
      }
      return out;
    },
    /** When the earliest mark still standing runs out, or `null` when none is. A mark already run out is forgotten here. */
    next(): number | null {
      const t = now();
      let first: number | null = null;
      for (const [key, u] of until) {
        if (u <= t) until.delete(key);
        else if (first === null || u < first) first = u;
      }
      return first;
    },
    /** Forgets every list: the screen changed, and its next look is a baseline again. */
    forget(): void {
      seen.clear();
      until.clear();
    },
  };
}

export type Arrivals = ReturnType<typeof arrivals>;
