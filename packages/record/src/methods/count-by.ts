/**
 * How many of a list's entries hold each value of one field, in one call: `countBy`, PGS-B06 job c.
 *
 * A STRIP OF CHIPS OVER A LIST ASKED ONCE A CHIP. Each facet count was its own `list` with a `where` and `limit: 1`,
 * read for its `matched` (`apps/web/src/lib/data/record.ts`), so the Numbers list's chips were a dozen requests before
 * the screen settled. This answers every value's count from one question, and the answer is the list's own: the same
 * `where`, the same deleted entries left out, so a chip that says 12 opens a list that says 12.
 *
 * ONE QUERY WHEN THE CALLER READS EVERYTHING, THE LIST ITSELF OTHERWISE. The kernel's `countBy` (its page tally, by the
 * expression the field's index is built from) knows nothing of who is asking. A member whose grant holds a rule on this
 * list, or who cannot read every list a `where` might name, is counted by walking `list` with their rule, the read
 * their list is drawn from, so a count never tells them about entries they cannot open. Before the kernel line lands
 * (`countBy` beside `block:`), everybody is counted by the walk.
 *
 * A FIELD WITH A FEW VALUES. A money or a quantity has no value worth a chip (its number differs entry to entry and two
 * currencies are not one count), nor does a list, a file or a secret, so those are refused at the door and say which
 * fields can be counted.
 */

import { whereFor, type Json } from '@braindog/kernel';
import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The field types a count is answered for. */
const COUNTED: ReadonlySet<string> = new Set(['enum', 'ref', 'bool', 'text', 'int', 'day', 'email', 'url']);
/** A page of the walk, the most `list` answers at once. */
const PAGE = 500;
/** The most the walk reads before it answers with what it has counted and says so (`capped`). */
const WALK_MAX = 10_000;

export type Counted = {
  register: string;
  by: string;
  /** Every value the field holds with how many entries hold it, most first; `null` is the entries that leave it empty. */
  counts: { value: Json; n: number }[];
  /** The sum of `counts`: the list's own `matched` for the same `where`. */
  matched: number;
  /** Present when the walk stopped at `WALK_MAX` before the end of the list. */
  capped?: true;
};

type Tally = (q: { register: string; field: string; where?: never }) => Result<{ value: Json; n: number }[]>;

export function methods(deps: RecordDeps) {
  const { kernel, guard, named, no, readsEveryList } = deps;
  /* THE KERNEL'S ONE-QUERY COUNT, READ WHERE IT IS DECLARED. `countBy` joins the kernel beside `block:` (blocked to the
     kernel's owner in batch 50); until then this reads nothing and the walk below answers. */
  const tallied = (): Tally | undefined => (kernel as unknown as { countBy?: Tally }).countBy;

  return {
    /**
     * `{ register, by, where? }`: for each value of the field `by`, how many entries of `register` that `where` admits
     * hold it. Answers `{ register, by, counts: [{ value, n }], matched }`, most first, then by value.
     */
    async countBy(args: { register: string; by?: unknown; where?: unknown }, ctx: CallContext): Promise<Result<Counted>> {
      const missing = named(args);
      if (missing) return { ok: false, refusal: missing };
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      const decl = kernel.register(args.register);
      if (!decl) return no('REGISTER_UNKNOWN', `There is no list called ${args.register}.`, { at: 'register' });

      const live = decl.fields.filter((f) => f.retired !== true);
      const countable = live.filter((f) => COUNTED.has(f.type)).map((f) => f.id);
      const field = live.find((f) => f.id === args.by);
      if (field === undefined)
        return no('FIELD_UNKNOWN', `${decl.name} has no field called ${JSON.stringify(args.by ?? null)} to count by.`, { at: 'by', allowed: countable });
      if (!COUNTED.has(field.type))
        return no('VALUE_MALFORMED', `${field.label ?? field.id} cannot be counted by its values. Count by one of ${countable.join(', ')}.`, {
          at: 'by',
          allowed: countable,
        });

      const rule = whereFor(ctx.wheres, args.register);
      const fast = tallied();
      const read =
        fast !== undefined && rule === undefined && readsEveryList?.(ctx) === true
          ? fromTally(fast({ register: args.register, field: field.id, ...(args.where === undefined ? {} : { where: args.where as never }) }), field.type)
          : walk(args.register, field.id, decl.state === field.id, args.where, rule, ctx);
      if (!read.ok) return read;

      const counts = [...read.value.counts.entries()]
        .map(([key, n]) => ({ value: JSON.parse(key) as Json, n }))
        .sort((a, b) => b.n - a.n || order(a.value, b.value));
      const matched = counts.reduce((sum, c) => sum + c.n, 0);
      return { ok: true, value: { register: args.register, by: field.id, counts, matched, ...(read.value.capped ? { capped: true as const } : {}) } };
    },
  };

  /* THE KERNEL'S ANSWER IN THE WALK'S SHAPE. SQLite hands a bool back as 1 or 0, which the list hands back as true or
     false, so a chip filtering on the value it was given finds the same entries either way. */
  function fromTally(got: Result<{ value: Json; n: number }[]>, type: string): Result<{ counts: Map<string, number>; capped: boolean }> {
    if (!got.ok) return got;
    const counts = new Map<string, number>();
    for (const r of got.value) {
      const value = type === 'bool' && (r.value === 1 || r.value === 0) ? r.value === 1 : (r.value ?? null);
      const key = JSON.stringify(value);
      counts.set(key, (counts.get(key) ?? 0) + Number(r.n));
    }
    return { ok: true, value: { counts, capped: false } };
  }

  /* THE LIST ITSELF, A PAGE AT A TIME, under the caller's rule and with refs into lists they cannot read naming nothing,
     as the record's `list` reads it. */
  function walk(
    register: string,
    by: string,
    mirrored: boolean,
    where: unknown,
    rule: Json | undefined,
    ctx: CallContext,
  ): Result<{ counts: Map<string, number>; capped: boolean }> {
    const counts = new Map<string, number>();
    let cursor: string | null = null;
    let seen = 0;
    do {
      const page = kernel.list(
        {
          register,
          limit: PAGE,
          ...(where === undefined ? {} : { where: where as never }),
          ...(cursor === null ? {} : { cursor }),
          reads: (r: string) => deps.readable(ctx, r) === null,
        },
        rule,
      );
      if (!page.ok) return page;
      for (const e of page.value.rows) {
        const key = JSON.stringify((mirrored ? e.state : e.fields[by]) ?? null);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      seen += page.value.rows.length;
      cursor = page.value.cursor;
    } while (cursor !== null && seen < WALK_MAX);
    return { ok: true, value: { counts, capped: cursor !== null } };
  }
}

/** Two values in a steady order: empty last, then numbers, then the rest by their text. */
function order(a: Json, b: Json): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}
