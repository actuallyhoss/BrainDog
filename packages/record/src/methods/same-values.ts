/**
 * `sameValues`: the rows of one list that hold the same values in the fields named, in groups, a moment field compared
 * by its day. It changes nothing.
 *
 * ASKED FOR BY A CLEANUP RUN ON HIS RECORD (1 Nov): readings written twice, the same key number, day and value, could be
 * found only by paging 2,527 of them. A list that says what makes two of its rows the same has `heldTwice`; this asks
 * the same of any list, by the fields the caller names, in one grouped query.
 *
 * HELD TO A READER OF THE WHOLE LIST, as a figure is (`metric`): every row, no rule of their own on it and no field hidden,
 * since a group's count is a sum over rows, and a caller narrowed to some of them would be told of the others.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** At most this many fields make a group, and at most this many groups come back, the largest first. */
const FIELDS_MOST = 6;
const GROUPS_MOST = 100;
/** A field id as the kernel declares one, so it may stand in a JSON path. */
const ID = /^[a-z][a-z0-9_]{0,63}$/u;
/** The types compared by their day, not their instant. */
const BY_DAY: ReadonlySet<string> = new Set(['instant', 'datetime', 'timestamp']);

export type SameGroup = { values: Record<string, unknown>; n: number; seqs: number[] };
export type SameValues = { register: string; fields: string[]; groups: SameGroup[]; rows: number; more: boolean; say: string };

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, readable, sight, named, no } = deps;
  return {
    async sameValues(args: { register: string; fields?: unknown }, ctx: CallContext): Promise<Result<SameValues>> {
      const missing = named(args);
      if (missing) return { ok: false, refusal: missing };
      const stop = guard(ctx, 'read', args.register);
      if (stop) return { ok: false, refusal: stop };
      const decl = kernel.register(args.register);
      if (!decl) return no('REGISTER_UNKNOWN', `There is no list called ${args.register}.`, { at: 'register' });
      if (readable(ctx, args.register) !== null || !sight.whole(ctx, args.register) || kernel.scope(ctx, args.register) !== undefined)
        return no('FORBIDDEN', `Finding what ${decl.name} holds twice reads all of it, and you read only part of it.`, { at: 'register' });
      const live = decl.fields.filter((f) => f.retired !== true);
      const asked = args.fields;
      if (!Array.isArray(asked) || asked.length === 0 || asked.length > FIELDS_MOST || !asked.every((f) => typeof f === 'string'))
        return no('VALUE_MALFORMED', `fields is a list of 1 to ${FIELDS_MOST} field names whose values make two rows the same, like ["name","thing","at","value"].`, {
          at: 'fields',
          allowed: live.map((f) => f.id),
        });
      const fields = [...new Set(asked as string[])];
      const shapes: { id: string; day: boolean }[] = [];
      for (const id of fields) {
        const f = live.find((x) => x.id === id);
        if (f === undefined || !ID.test(id)) return no('FIELD_UNKNOWN', `${decl.name} has no field called ${id}.`, { at: 'fields', allowed: live.map((x) => x.id) });
        shapes.push({ id, day: BY_DAY.has(String(f.type)) });
      }
      const keys = shapes.map((s, i) => `${s.day ? `substr(json_extract(fields, '$.${s.id}'), 1, 10)` : `json_extract(fields, '$.${s.id}')`} AS k${i}`);
      const by = shapes.map((_, i) => `k${i}`).join(', ');
      const rows = sql.all<Record<string, string | number | null>>(
        `SELECT ${keys.join(', ')}, COUNT(*) AS n, group_concat(seq) AS seqs FROM entry WHERE register = ? AND deleted_at IS NULL AND seq IS NOT NULL GROUP BY ${by} HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT ?`,
        args.register,
        GROUPS_MOST + 1,
      );
      const groups: SameGroup[] = rows.slice(0, GROUPS_MOST).map((r) => ({
        values: Object.fromEntries(shapes.map((s, i) => [s.id, r[`k${i}`] ?? null])),
        n: Number(r.n),
        seqs: String(r.seqs ?? '')
          .split(',')
          .map(Number)
          .filter((n) => Number.isSafeInteger(n))
          .sort((a, b) => a - b),
      }));
      const twice = groups.reduce((sum, g) => sum + g.n - 1, 0);
      const said =
        groups.length === 0
          ? `Nothing in ${decl.name} holds the same ${fields.join(', ')} twice.`
          : `${groups.length}${rows.length > GROUPS_MOST ? '+' : ''} ${groups.length === 1 ? 'set' : 'sets'} in ${decl.name} hold the same ${fields.join(', ')}; ${twice} ${twice === 1 ? 'row is' : 'rows are'} extra. Each set's lowest number is the oldest.`;
      return { ok: true, value: { register: args.register, fields, groups, rows: twice, more: rows.length > GROUPS_MOST, say: said } };
    },
  };
}
