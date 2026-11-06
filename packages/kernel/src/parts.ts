/**
 * What a kernel extension is handed: the record's own functions, the ones `makeKernel` keeps in its closure.
 *
 * WHY A FILE OF ITS OWN. Every new kernel method used to be written inside `makeKernel`, in the one file every change
 * queues behind, because the functions a method needs (the transaction, the write path, the list cache) exist only
 * inside that closure. `makeKernel` now gathers them into one `KernelParts` object and hands it to `api/index.ts`, and a
 * new method is a file under `api/` that takes this and returns what it adds. Nothing here is new behaviour: each member
 * is the function the kernel's own methods already call.
 *
 * NO MEMBER NAMES `Kernel`. `Kernel` is `ReturnType<typeof makeKernel>`, and `makeKernel` returns what the extensions
 * return, so a part typed from `Kernel` would make the kernel's type depend on itself through every extension. Each
 * member is written out here instead, from the types the kernel's own files export, and `list`'s and `appendEvent`'s
 * argument shapes live here so that `index.ts` and this file hold one copy of each between them.
 *
 * A HELPER MISSING FROM HERE IS A CHANGE TO `index.ts`: one member added to this type and one line where `makeKernel`
 * builds the object.
 */

import type { Clock, Result, Sql } from '@braindog/ports';
import type { Predicate } from '@braindog/where';

import type { Json } from './coerce.ts';
import type { Declaration } from './declare.ts';
import type { Mint } from './ids.ts';
import type { Entry, Patch, RegisterDecl, WriteContext } from './index.ts';
import type { EvalContext } from './metrics.ts';
import type { Observation } from './observe.ts';

/** What `list` is asked: one register, narrowed, ordered and paged. */
export type ListQuery = {
  register: string;
  /** Who is reading, for a `where` that says `someone else` (a task's Owner is not someone else). Set by a page's read. */
  reader?: string | undefined;
  /**
   * Structured, or as the sentence a person and an agent write.
   *
   * BOTH FORMS OR IT IS TWO LANGUAGES. `direction is owed to me, state is open` is what goes in a
   * declaration; the tree is what the compiler reads. One accepted here and the other not would
   * make a block's `where:` and a caller's `where:` different things with the same name.
   */
  where?: Predicate | string;
  /**
   * What to sort by, and it had no way to be said.
   *
   * `list` ordered by `updated_at DESC, id DESC` and took no order at all, so a page block
   * declaring `order:` was sorted by whatever read it afterwards, over the page it had already
   * been handed. That is a different answer from the one it asked for: "the five largest" is not
   * "five arbitrary rows, sorted". The register grid has the same hole one level up.
   *
   * THE SQL COMES FROM `where`, not from a path built here. `31 §2` is explicit that this package
   * imports `jsonPath` so the index and the predicate are the same string; an `ORDER BY` is the
   * third place that has to hold, and `fieldSql` is now exported for it.
   */
  order?: { field: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
  cursor?: string | null;
  includeDeleted?: boolean;
  /**
   * Which registers the caller reads, so a ref into one she cannot is not looked up. Absent is all.
   *
   * THE RECORD GUARDS THE REGISTER BEING LISTED AND NOTHING ELSE, and the ref's lookups read the
   * whole record. So a member invited to Jobs alone, filtering by `client`, was told `ok 0` for a
   * client that exists on the Clients list she cannot read and `REF_UNKNOWN` for one that does not.
   * The kernel cannot know who is asking; the caller that does passes this.
   */
  reads?: (register: string) => boolean;
  /**
   * Which lists a `pointed` hop in `where` may go into (where-hop-49). Absent is `reads`. The record passes the lists
   * the caller reads WHOLE: a hop into one she sees narrowed would count entries her grant keeps from her.
   */
  hops?: (register: string) => boolean;
};

/** One page of a list: the rows, where the next page starts, and how many rows matched in all. */
export type Listed = { rows: Entry[]; cursor: string | null; matched: number };

/** One row event as `appendEvent` writes it: `target` is the row's id, and the `entry:` before it is written for it. */
export type AppendedEvent = {
  kind: string;
  target: string;
  register: string;
  actor: string;
  note?: string | undefined;
  at: string;
  batch?: string | undefined;
  field?: string | null | undefined;
  from?: Json | undefined;
  to?: Json | undefined;
  opId?: string | undefined;
};

/** A live declaration as the table holds it, `body` as the JCS text it was stored as. */
export type HeldDeclaration = { id: string; version: number; kind: string; pack_id: string | null; body: string; checksum: string };

export type KernelParts = {
  /** The record's storage. Every statement goes through it, and nothing depends on which runtime is under it. */
  sql: Sql;
  /** The record's clock, so an extension's "now" is the one its writes are stamped with. */
  clock: Clock;
  /** A fresh ULID, from the same clock. */
  mint: Mint;
  /** One transaction, and a call inside a write runs inside that write's (`index.ts`, `transaction`). */
  transaction: <T>(fn: () => T) => T;
  /** The write path with its four arguments; a `Door` stays the kernel's own. */
  write: (register: string, ref: string | null, patch: Patch, w: WriteContext) => Result<Entry>;
  /** One row by id, spoken id or register and number, or `null`. */
  get: (ref: string | { register: string; seq: number }, opts?: { includeDeleted?: boolean }) => Entry | null;
  list: (q: ListQuery) => Result<Listed>;
  /** A live list's declaration from the cache, or `undefined`. */
  register: (id: string) => RegisterDecl | undefined;
  declarations: () => HeldDeclaration[];
  /** What a predicate or a figure is read against, with a staged batch laid over the record when one is given. */
  evalContext: (staged?: readonly Declaration[]) => EvalContext;
  appendEvent: (e: AppendedEvent) => string;
  observe: (batch: readonly Observation[]) => Result<number>;
  /** Facts held across reads while the lists they read stand (`index.ts`, `heldFacts`): one for each read that asks several. */
  heldFacts: () => <T>(key: string, make: () => T) => T;
  /** Rebuilds the list cache from the declaration table, which a write of a declaration needs before anything reads it. */
  reload: () => void;
  /**
   * How many transactions are open around this call: 0 outside every write.
   *
   * FOR `rehearse`, which must refuse to run inside a write (`api/rehearse.ts`).
   */
  depth: () => number;
  /** Who signs what a context says: a token's run, found or opened with its heartbeat moved, or `actor`. In a transaction only. */
  signedBy: (w: WriteContext) => string;
  /** The refusal for a token whose call names a run another key opened, or `null`. */
  foreignRun: <T>(w: WriteContext) => Result<T> | null;
  /**
   * The kernel's caches, taken out and put back whole.
   *
   * WHAT A ROLLBACK CANNOT REACH. `registers`, `prefixes` and `planned` are kept in memory beside the tables, and a
   * declaration written and then rolled back leaves them describing a record the tables no longer hold. `save` hands back
   * every cache a declaration write refreshes, as one value nobody outside `index.ts` reads, and `restore` puts that value
   * back.
   */
  caches: { save(): unknown; restore(saved: unknown): void };
};
