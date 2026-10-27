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
 * fields can be counted. A field held unique is refused with them: every entry holds its own value, so the answer would
 * be the list again, one count of 1 an entry.
 *
 * THE MOST COMMON VALUES, AND HOW MUCH IS LEFT. A title or a day can hold thousands of values, and a strip of chips or an
 * agent reads a few dozen. `counts` holds the `SHOWN` most common, and `more` says how many values and entries are not
 * in it, so nothing is dropped without being said. `matched` is always the list's own, also when the walk stopped early.
 */

import type { Json } from '@braindog/kernel';
import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import { hiddenOf } from '../sight.ts';
import type { RecordDeps } from './index.ts';

/** The field types a count is answered for. */
const COUNTED: ReadonlySet<string> = new Set(['enum', 'ref', 'bool', 'text', 'int', 'day', 'email', 'url']);
/** A page of the walk, the most `list` answers at once. */
const PAGE = 500;
/** The most the walk reads before it answers with what it has counted and says so (`capped`). */
const WALK_MAX = 10_000;
/** The most values one answer holds. The rest are told as `more`. */
const SHOWN = 50;

export type Counted = {
  register: string;
  by: string;
  /** The `SHOWN` most common values with how many entries hold each, most first; `null` is the entries that leave it empty. */
  counts: { value: Json; n: number }[];
  /** The list's own `matched` for the same `where`: the sum of `counts` and `more.n`. */
  matched: number;
  /**
   * Present when `counts` is not everything: `n` entries are in none of its counts, and `values` further values were
   * counted. When `capped` is set too, `values` is those seen before the walk stopped, so at least that many.
   */
  more?: { values: number; n: number };
  /** Present when the walk stopped at `WALK_MAX` before the end of the list. `matched` is still the whole list's. */
  capped?: true;
};

/** What a read hands back: every value it counted, and the list's `matched` where the read knows it apart from them. */
type Read = { counts: Map<string, number>; capped: boolean; matched?: number };
/** The two limits, said by a test that cannot make ten thousand entries to reach one. */
export type Limits = { shown?: number; walkMax?: number; page?: number };

type Tally = (q: { register: string; field: string; where?: never }) => Result<{ value: Json; n: number }[]>;

export function methods(deps: RecordDeps, limits: Limits = {}) {
  const { kernel, guard, named, no, readsEveryList } = deps;
  const shown = limits.shown ?? SHOWN;
  const walkMax = limits.walkMax ?? WALK_MAX;
  const pageSize = limits.page ?? PAGE;
  /* THE KERNEL'S ONE-QUERY COUNT, READ WHERE IT IS DECLARED. `countBy` joins the kernel beside `block:` (blocked to the
     kernel's owner in batch 50); until then this reads nothing and the walk below answers. */
  const tallied = (): Tally | undefined => (kernel as unknown as { countBy?: Tally }).countBy;

  return {
    /**
     * `{ register, by, where? }`: for each value of the field `by`, how many entries of `register` that `where` admits
     * hold it. Answers `{ register, by, counts: [{ value, n }], matched, more? }`, most first, then by value.
     */
    async countBy(args: { register: string; by?: unknown; where?: unknown }, ctx: CallContext): Promise<Result<Counted>> {
      const missing = named(args);
      if (missing) return { ok: false, refusal: missing };
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      const decl = kernel.register(args.register);
      if (!decl) return no('REGISTER_UNKNOWN', `There is no list called ${args.register}.`, { at: 'register' });

      /* A FIELD HIDDEN FROM HER IS ONE THE LIST DOES NOT HAVE: not counted by, and not in her filter,
         which the walk reads without it (`kernel.list`'s `hide`), so no count tells her what it holds. */
      const hidden = hiddenOf(ctx, args.register);
      const live = decl.fields.filter((f) => f.retired !== true && !hidden.has(f.id));
      const countable = live.filter((f) => COUNTED.has(f.type) && !held(f)).map((f) => f.id);
      const field = live.find((f) => f.id === args.by);
      if (field === undefined)
        return no('FIELD_UNKNOWN', `${decl.name} has no field called ${JSON.stringify(args.by ?? null)} to count by.`, { at: 'by', allowed: countable });
      if (!COUNTED.has(field.type))
        return no('VALUE_MALFORMED', `${field.label ?? field.id} cannot be counted by its values. Count by one of ${countable.join(', ')}.`, {
          at: 'by',
          allowed: countable,
        });
      if (held(field))
        return no(
          'VALUE_MALFORMED',
          `${field.label ?? field.id} is different on every one of ${decl.name}, so there is nothing to count.${countable.length ? ` Count by one of ${countable.join(', ')}.` : ''}`,
          { at: 'by', allowed: countable },
        );

      const rule = kernel.scope(ctx, args.register);
      const fast = tallied();
      const read =
        fast !== undefined && rule === undefined && hidden.size === 0 && readsEveryList?.(ctx) === true
          ? fromTally(fast({ register: args.register, field: field.id, ...(args.where === undefined ? {} : { where: args.where as never }) }), field.type)
          : walk(args.register, field.id, decl.state === field.id, args.where, rule, ctx);
      if (!read.ok) return read;

      const every = [...read.value.counts.entries()]
        .map(([key, n]) => ({ value: JSON.parse(key) as Json, n }))
        .sort((a, b) => b.n - a.n || order(a.value, b.value));
      const counts = every.slice(0, shown);
      const sum = (of: { n: number }[]) => of.reduce((total, c) => total + c.n, 0);
      /* THE LIST'S OWN `matched`, NOT WHAT THE WALK GOT THROUGH. A walk that stopped early counted part of the list, and
         the sum of that part was answered as the whole. The entries past the stop are in `more.n` with the rest. */
      const matched = read.value.matched ?? sum(every);
      const left = matched - sum(counts);
      const more = every.length > counts.length || left > 0 ? { more: { values: every.length - counts.length, n: left } } : {};
      return { ok: true, value: { register: args.register, by: field.id, counts, matched, ...more, ...(read.value.capped ? { capped: true as const } : {}) } };
    },
  };

  /* THE KERNEL'S ANSWER IN THE WALK'S SHAPE. SQLite hands a bool back as 1 or 0, which the list hands back as true or
     false, so a chip filtering on the value it was given finds the same entries either way. */
  function fromTally(got: Result<{ value: Json; n: number }[]>, type: string): Result<Read> {
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
  ): Result<Read> {
    const counts = new Map<string, number>();
    let cursor: string | null = null;
    let seen = 0;
    let matched: number | undefined;
    do {
      const page = kernel.list(
        {
          register,
          limit: pageSize,
          ...(where === undefined ? {} : { where: where as never }),
          ...(cursor === null ? {} : { cursor }),
          reads: (r: string) => deps.readable(ctx, r) === null,
        },
        rule,
        [...hiddenOf(ctx, register)],
      );
      if (!page.ok) return page;
      matched ??= page.value.matched;
      for (const e of page.value.rows) {
        const key = JSON.stringify((mirrored ? e.state : e.fields[by]) ?? null);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      seen += page.value.rows.length;
      cursor = page.value.cursor;
    } while (cursor !== null && seen < walkMax);
    const capped = cursor !== null;
    return { ok: true, value: { counts, capped, ...(capped && matched !== undefined ? { matched } : {}) } };
  }
}

/** A field held unique: no two entries share a value, so a count by it is the list again. */
function held(f: { unique?: boolean }): boolean {
  return f.unique === true;
}

/** Two values in a steady order: empty last, then numbers, then the rest by their text. */
function order(a: Json, b: Json): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}
