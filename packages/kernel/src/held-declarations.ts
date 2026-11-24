/**
 * The reads of the declarations, and of the record's own row, held while neither is written (`heldDeclarations` in
 * `index.ts`).
 *
 * WHY. The declarations change when a pack is installed, updated, turned off or on, a list or a page is edited, or a file
 * is read in, and they are read on nearly every call: a figure was looked for among all of them (412 on his record) each
 * time a walk opened one, `schema` read them all for each list it described, and every write read and parsed every rule
 * the record holds to keep the ones on its list. A read of the declaration table alone, or of the record's own row alone,
 * is now answered from memory until something could have moved it:
 *
 * - WHAT IS HELD. A `SELECT` whose only table is `declaration`, or whose only table is `record` (`readsOf`). A read that
 *   reads any other table beside it, or one this cannot read, goes to SQLite as it always did.
 * - UNTIL WHEN. Until the kernel's stamp moves (`index.ts`): a write it sends to either table, a write it cannot read the
 *   table of, a reload of the lists, or a write on the connection that did not come through the kernel at all. And every
 *   answer is let go when a write is taken back, since a read inside it may have read rows that never were.
 * - EACH ANSWER IS A COPY of the rows held, so a caller that sorts, pushes or changes a row changes only its own. A row
 *   held is a plain object, as a Durable Object hands rows, where `node:sqlite` hands them with no prototype.
 *
 * Held in the object's memory only, and capped: a record started again reads each once more. PURE, and Node loads it.
 */

import type { Param } from '@braindog/ports';

import { readsOf } from './sql-reads.ts';

/** The tables whose reads are held. */
const HELD_TABLES = new Set(['declaration', 'record']);

/** How many statement texts are told apart at most (`holds`), and how many answers are held in all, before all are let go. */
const TEXTS_MOST = 4096;
const ANSWERS_MOST = 4096;

/** The parameters as a key, or `null` where one is not a string, a whole finite number or `null`, which is then read through. */
function keyOf(params: readonly Param[]): string | null {
  if (params.length === 0) return '';
  for (const p of params) if (!(p === null || typeof p === 'string' || (typeof p === 'number' && Number.isFinite(p)))) return null;
  return JSON.stringify(params);
}

/**
 * A row as a plain object. Kept so, and copied so for each caller: `node:sqlite` hands rows with no prototype, and copying
 * 412 of those took longer than reading them (measured: 300 µs a copy, 10 µs once they are plain).
 */
const plain = (r: unknown): unknown => (r !== null && typeof r === 'object' ? { ...r } : r);

/** An answer as a caller may keep it, or as it is held: a list of plain rows, or one. */
const copyOf = <T>(answer: T): T => (Array.isArray(answer) ? (answer.map(plain) as T) : (plain(answer) as T));

/** The reads held, and what is worked out from them alone (`memo`), while the stamp stands. */
export class HeldDeclarations {
  readonly #stampOf: () => string;
  #stamp: string | null = null;
  #answers = new Map<string, Map<string, unknown>>();
  #count = 0;
  #made = new Map<string, unknown>();
  readonly #texts = new Map<string, boolean>();

  /** `stampOf` says what the held answers stand on, and is asked before each one is handed out. */
  constructor(stampOf: () => string) {
    this.#stampOf = stampOf;
  }

  /** Whether a statement is a read of one held table and nothing else. */
  holds(text: string): boolean {
    let held = this.#texts.get(text);
    if (held === undefined) {
      const r = readsOf(text, [], () => false);
      held = !r.writes && !r.unsure && r.tables.length === 1 && HELD_TABLES.has(r.tables[0]!);
      if (this.#texts.size >= TEXTS_MOST) this.#texts.clear();
      this.#texts.set(text, held);
    }
    return held;
  }

  /** A held read's answer: a copy of what it answered while the stamp stands, and `read` once otherwise. */
  read<T>(text: string, params: readonly Param[], read: () => T): T {
    const key = keyOf(params);
    if (key === null) return read();
    this.#sync();
    const held = this.#answers.get(text);
    if (held?.has(key)) return copyOf(held.get(key) as T);
    const got = read();
    if (this.#count >= ANSWERS_MOST) this.#clear();
    let byText = this.#answers.get(text);
    if (byText === undefined) this.#answers.set(text, (byText = new Map()));
    /* AND HANDED OUT AS EVERY LATER ANSWER IS, plain, so two reads of one thing are alike. */
    const kept = copyOf(got);
    byText.set(key, kept);
    this.#count++;
    return copyOf(kept);
  }

  /**
   * What `make` works out from held reads alone, once while the stamp stands. The same value is handed to every caller,
   * so it is one nobody changes.
   */
  memo<T>(name: string, make: () => T): T {
    this.#sync();
    if (this.#made.has(name)) return this.#made.get(name) as T;
    const got = make();
    this.#made.set(name, got);
    return got;
  }

  /** Whether anything is held now, so a write must be told apart from one made past the kernel (`index.ts`). */
  holding(): boolean {
    return this.#count > 0 || this.#made.size > 0;
  }

  /** Let every answer go, as a write taken back does. */
  drop(): void {
    this.#clear();
    this.#stamp = null;
  }

  #clear(): void {
    this.#answers = new Map();
    this.#made = new Map();
    this.#count = 0;
  }

  #sync(): void {
    const stamp = this.#stampOf();
    if (stamp === this.#stamp) return;
    this.#clear();
    this.#stamp = stamp;
  }
}
