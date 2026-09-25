/**
 * An `inputs` block's writes: a field typed into on a page goes to the record's row after a pause, and the page is read
 * again (brief D7 of `loop/research-dynamic-layouts.md`, P8).
 *
 * WHY A PAUSE AND NOT EVERY KEYSTROKE. The renderer hands on every keystroke (`braindog-render`'s `OnInput` says the
 * waiting is the host's), and a write per keystroke is one line in the row's history per character: typing `1250` over
 * `1200` would say the price was 1, then 12, then 125, each a fact about a finger rather than about the price. So a
 * field is written after `QUIET` of nothing typed into it, once, with what it says then.
 *
 * WITH THE ROW'S VERSION, the version the page drew it at or the one the last write here made, whichever is later. A
 * row somebody changed in the meantime is a conflict, said as one and read again, and never written over; and two
 * fields of one row typed in a row are written one after the other, each at the version the one before it made, so the
 * second is not refused as stale by the first.
 *
 * A REFUSAL IS SAID BESIDE THE FIELD, as a form says it (`06 §8`): the record's own sentence, kept per field until that
 * field is written, and never a toast at the other end of the screen about a box the reader is still looking at. A
 * money the record would refuse is said here without asking it, in the words the row page uses (`field-draft.ts`).
 *
 * PURE BUT FOR THE CLOCK AND THE WRITE, both handed in, so the test drives the pause with a fake clock and the write
 * with a stub, and `PageView` hands it the row writer and its own re-read.
 */

import { exponentOf, type Row, type RowRef } from 'braindog-render';

import { copy } from '../copy.ts';
import { homeCurrency } from './api.ts';
import { REGISTERS } from './held.ts';
import { patchOf } from './field-draft.ts';
import type { Wrote } from './rows-write.ts';
import type { FieldDecl, Fields } from './schema.ts';

/** How long a field has to go untouched before what it says is written. The brief's 600ms: under a typist's pause. */
export const QUIET = 600;

/** The timers the pause is kept on: the browser's, or a test's. */
export type Clock = { set: (run: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

const browser: Clock = { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };

export type InputsDeps = {
  /** The row writer's `update`: `rowWriter(base).update`. */
  write: (register: string, seq: number, patch: Fields, version?: number) => Promise<Wrote>;
  /** What the row holds in `field` now, as the page read it, so a money keeps its currency and nothing unchanged is sent. */
  held: (ref: RowRef, field: string) => unknown;
  /** Reads the page again, so every figure, note and `when:` over the row answers what was written. */
  reread: () => Promise<void>;
  /** Called whenever what is said beside a field changes, with every field's sentence by `keyOf`. */
  said: (said: ReadonlyMap<string, string>) => void;
  clock?: Clock;
  quiet?: number;
};

/** A field of a row, as the sentences beside the fields are kept: `checks#1.price`. */
export const keyOf = (ref: Pick<RowRef, 'register' | 'seq'>, field: string): string => `${ref.register}#${ref.seq}.${field}`;

/** An `inputs` row's type cell, `money` or `enum:idea,sample,made`, as the type alone. */
const typeOf = (cell: string | undefined): string => (cell ?? '').split(':')[0]!.trim();

/** A money as a person types it or as the page opened it: `GBP 1,200.00`, `1200`, `1,250.5 GBP`, `-50`. */
/** The minus sign `money()` writes, U+2212, spelled by its code so it cannot be read as a hyphen here. */
const MINUS = String.fromCharCode(0x2212);

const MONEY = /^(?:([A-Z]{3})\s*)?(-?[\d,]*\.?\d+)(?:\s*([A-Z]{3}))?$/u;

/**
 * What a field's text is as the record stores it, or the sentence the record would refuse it with.
 *
 * MONEY IS READ HERE AND NOT BY `patchOf`, because the box opens on the record's own reading, `GBP 1,200.00`, where the
 * row page's box opens on `1200`: the code and the thousands commas are what an `inputs` block says so that the spec
 * drawn where nothing can write still names its currency. A code typed is the currency the figure is in; none typed is
 * the row's own, then the record's home currency. The places are the currency's, as the row page checks them.
 *
 * AN INSTANT IS THE MINUTE THE BOX HOLDS, read as the UTC minute the page opened it on (`blocks.ts` `inputsRows`), so
 * opening a box and leaving it writes nothing.
 *
 * EVERYTHING ELSE IS `patchOf`, the row page's own, so a duration is typed in its unit and a yes or no is a tick.
 */
export function inputPatch(f: FieldDecl, typed: string, held: unknown): { ok: true; patch: Fields } | { ok: false; fix: string } {
  const raw = typed.trim();
  if (f.type === 'money') {
    if (raw === '') return { ok: true, patch: { [f.id]: null } };
    /* THE PAGE WRITES A NEGATIVE WITH THE MINUS SIGN, `GBP −50.00`, and a person types a hyphen: both are the one sign. */
    const m = MONEY.exec(raw.replaceAll(MINUS, '-'));
    if (!m || (m[1] && m[3])) return { ok: false, fix: copy.moneyShape };
    const code = m[1] ?? m[3] ?? heldCurrency(held) ?? homeCurrency() ?? 'GBP';
    const digits = m[2]!.replaceAll(',', '');
    const exp = exponentOf(code);
    const places = digits.includes('.') ? digits.length - digits.indexOf('.') - 1 : 0;
    if (places > exp) return { ok: false, fix: copy.moneyPlaces(exp) };
    return { ok: true, patch: { [f.id]: { amount: Math.round(Number(digits) * 10 ** exp), currency: code } } };
  }
  if (f.type === 'instant' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/u.test(raw)) return { ok: true, patch: { [f.id]: `${raw}:00.000Z` } };
  /* `boolean` IS THE KERNEL'S SECOND SPELLING, which a type answered on the row may carry and this app's list does not. */
  if (f.type === 'bool' || (f.type as string) === 'boolean') return { ok: true, patch: patchOf({ ...f, type: 'bool' }, raw === 'true', held, null) };
  return { ok: true, patch: patchOf(f, raw, held, null) };
}

const heldCurrency = (v: unknown): string | null =>
  v !== null && typeof v === 'object' && typeof (v as { currency?: unknown }).currency === 'string' ? (v as { currency: string }).currency : null;

/**
 * Whether a patch says what the row already holds, so that nothing is sent: a write of the same value is not a change.
 *
 * A NUMBER IS COMPARED AS A NUMBER. `patchOf` hands an `int` or a `decimal` on as the text in the box, `"12"`, and the
 * record coerces it; compared as JSON with the row's `12` it always differed, so a count typed back to what it held
 * was written anyway, a line in the row's history saying 12 became 12 (`inputs-write.test.ts`).
 */
const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ||
  (a === '' && (b === null || b === undefined)) ||
  (typeof a === 'string' && typeof b === 'number' && a.trim() !== '' && Number(a) === b);

/**
 * The field's declaration: the list's, where this build holds it, else the type the record answered on the row.
 *
 * THE RECORD'S TYPE IS ENOUGH TO WRITE BY, because a list a pack brought reaches `REGISTERS` only once the page asked for
 * it, and a block drawn before that must still write a number as a number.
 */
function fieldOf(register: string, field: string, type: string): FieldDecl {
  return REGISTERS[register]?.fields.find((f) => f.id === field) ?? ({ id: field, type } as FieldDecl);
}

export type InputsWriter = {
  /** What `OnInput` is handed: the row the field was drawn from, and what the box says now. */
  input: (row: Row, value: string) => void;
  /** Writes every field still waiting for its pause, now. For a page being left, and for a test. */
  flush: () => Promise<void>;
};

export function inputsWriter(deps: InputsDeps): InputsWriter {
  const clock = deps.clock ?? browser;
  const quiet = deps.quiet ?? QUIET;
  /* THE FIELDS WAITING FOR THEIR PAUSE, each with the text it will write and the timer that will write it. */
  const waiting = new Map<string, { row: Row; value: string; handle: unknown }>();
  /* THE VERSION EACH ROW WAS LAST WRITTEN AT HERE, and the write in flight on it, so a second field waits for the first. */
  const versions = new Map<string, number>();
  const chains = new Map<string, Promise<void>>();
  const said = new Map<string, string>();

  const tell = () => deps.said(new Map(said));

  async function send(row: Row, value: string): Promise<void> {
    const ref = row.ref;
    const field = row.cells[0]?.trim() ?? '';
    if (!ref || field === '') return;
    const key = keyOf(ref, field);
    const held = deps.held(ref, field);
    const out = inputPatch(fieldOf(ref.register, field, typeOf(row.cells[2])), value, held);
    if (!out.ok) {
      said.set(key, out.fix);
      return tell();
    }
    if (said.delete(key)) tell();
    if (same(out.patch[field], held)) return;
    const version = Math.max(ref.version, versions.get(`${ref.register}#${ref.seq}`) ?? 0);
    const wrote = await deps.write(ref.register, ref.seq, out.patch, version);
    if (wrote.ok) {
      versions.set(`${ref.register}#${ref.seq}`, wrote.entry.version);
    } else {
      said.set(key, wrote.fix);
      tell();
    }
    /* READ AGAIN AFTER A CONFLICT TOO, so the box and the figures under it show what the record holds now. */
    if (wrote.ok || wrote.why === 'conflict') await deps.reread();
  }

  /** One row's writes, one after the other, so each is sent at the version the one before it made. */
  function queued(row: Row, value: string): Promise<void> {
    const at = row.ref ? `${row.ref.register}#${row.ref.seq}` : '';
    const next = (chains.get(at) ?? Promise.resolve()).then(() => send(row, value));
    const kept = next.catch(() => undefined);
    chains.set(at, kept);
    return kept;
  }

  return {
    input(row, value) {
      if (!row.ref) return;
      const key = keyOf(row.ref, row.cells[0]?.trim() ?? '');
      const prior = waiting.get(key);
      if (prior) clock.clear(prior.handle);
      const handle = clock.set(() => {
        waiting.delete(key);
        void queued(row, value);
      }, quiet);
      waiting.set(key, { row, value, handle });
    },
    async flush() {
      const now = [...waiting.values()];
      waiting.clear();
      for (const w of now) clock.clear(w.handle);
      await Promise.all(now.map((w) => queued(w.row, w.value)));
    },
  };
}
