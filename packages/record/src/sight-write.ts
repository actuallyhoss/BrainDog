/**
 * WRITES HELD TO THE ROW (sharing plan §2.6, Slice 4): what a caller may write, asked before a write and after it.
 *
 * TODAY'S GRANTS FEED IT. The write predicate on a list is the caller's read scope there (`kernel.scope`: the member
 * row's `row_where` and the private rows left out for them), because today one rule per list per person says both what
 * a member reads and what they write. Slice 5 adds shares, whose write predicate can be narrower than their read, and
 * changes `within` and nothing that asks it.
 *
 * BEFORE THE WRITE (`writable`): a row outside the predicate is answered exactly as a row that is not there, the same
 * code and sentence as the method gives for a missing one, so no refusal proves a row exists; a delete asks the delete
 * capability; a hidden field in a patch is a field the list does not have; and a writer whose predicate on the list is
 * conditional may not change a gate field, the fields some grant's condition reads, so no grantee can move a row into
 * another grantee's view. AFTER IT (`within`): the kernel runs the same clause again in the write's transaction and
 * unwinds a create outside it or an edit that moves the row out (`WriteContext.within`).
 */

import type { Entry, Json, Kernel } from '@braindog/kernel';
import type { Refusal, Sql } from '@braindog/ports';

import type { CallContext } from './index.ts';

const NONE: ReadonlySet<string> = new Set();

/** A list's name as one of its rows, "task" for Tasks, enough for a sentence about a row. */
const one = (name: string): string => {
  const w = name.trim().toLowerCase();
  if (/ies$/u.test(w)) return `${w.slice(0, -3)}y`;
  if (/(?:s|x|ch|sh)es$/u.test(w)) return w.slice(0, -2);
  if (/[^s]s$/u.test(w)) return w.slice(0, -1);
  return w;
};

export type WriteSight = ReturnType<typeof writeSight>;

export function writeSight(deps: { kernel: Kernel; sql: Sql; listName: (list: string) => string; reads: (ctx: CallContext, register: string) => boolean }) {
  const { kernel, sql, listName, reads } = deps;

  /**
   * The rows this caller may add to one list (the append predicate), as the scope the kernel's create takes, or
   * `undefined` for any row. An appender who reads nothing still adds, inside her rule.
   */
  const added = (ctx: CallContext, register: string): Json | undefined => kernel.scope(ctx, register);

  /**
   * The rows of one list already there this caller may write (the write predicate), as the scope the kernel's write
   * takes: `undefined` for every row, and `null` for none, when she cannot read the list at all, since the write
   * predicate includes read.
   */
  const within = (ctx: CallContext, register: string): Json | undefined => (reads(ctx, register) ? kernel.scope(ctx, register) : null);

  /** Whether one row is inside what this caller may write on its list, deleted or not. One query, by id. */
  const admitted = (ctx: CallContext, register: string, id: string): boolean => {
    const rule = within(ctx, register);
    return rule === undefined || kernel.admits(register, rule, id);
  };

  /**
   * THE GATE FIELDS OF A LIST: every field some active grant's condition on it reads (today a member's `row_where`), so
   * changing one changes who sees the row. Slice 5 adds the shares' conditions and a project share's scope field.
   */
  const gateFields = (register: string): ReadonlySet<string> => {
    const rules = sql.all<{ row_where: string }>(
      `SELECT DISTINCT m.row_where FROM member m JOIN person p ON p.id = m.person_id
        WHERE m.register = ? AND m.row_where IS NOT NULL AND p.suspended_at IS NULL`,
      register,
    );
    if (rules.length === 0) return NONE;
    const out = new Set<string>();
    for (const r of rules) {
      let rule: Json;
      try {
        rule = JSON.parse(r.row_where) as Json;
      } catch {
        continue;
      }
      for (const field of kernel.ruleFields(register, rule)) out.add(field);
    }
    return out;
  };

  /** The fields of a list hidden from this caller (sharing plan §2.7). None until Slice 6 hides any. */
  const hiddenFields = (_ctx: CallContext, _register: string): ReadonlySet<string> => NONE;

  /** Whether this caller may delete or restore rows of a list. Today the write rung carries delete; Slice 5 splits it. */
  const mayDelete = (_ctx: CallContext, _register: string): Refusal | null => null;

  /** Whether a patch changes what a row holds in one field: a value sent back as it was read is no change. */
  const changes = (row: Entry, field: string, value: unknown): boolean => {
    const held = row.fields[field];
    if (value === null || value === undefined || value === '') return held !== undefined;
    if (JSON.stringify(value) === JSON.stringify(held)) return false;
    /* A REF SENT BY ITS NAME, `things#1`, is the id the row holds. */
    if (typeof value === 'string' && typeof held === 'string') return kernel.nameOf(held) !== value;
    return true;
  };

  /**
   * May this caller write this patch on this row (`null` for a create), and if not, the refusal. `missing` is what the
   * method answers for a row that is not there, handed back unchanged for a row outside the caller's predicate.
   */
  const writable = (ctx: CallContext, register: string, row: Entry | null, patch: Record<string, unknown> | null | undefined, missing: Refusal): Refusal | null => {
    if (row !== null && !admitted(ctx, register, row.id)) return missing;
    const sent = patch !== null && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    /* A HIDDEN FIELD IS ONE THE LIST DOES NOT HAVE, to this caller, in the kernel's words for that. */
    const hidden = hiddenFields(ctx, register);
    for (const key of Object.keys(sent))
      if (hidden.has(key)) return { code: 'FIELD_UNKNOWN', fix: `${register} has no field called ${key}.`, at: key };
    if (row !== null && Object.hasOwn(sent, 'deleted_at')) {
      const stop = mayDelete(ctx, register);
      if (stop) return stop;
    }
    /* A CONDITIONAL WRITER LEAVES THE GATE FIELDS AS THEY ARE. Whole-list writers, and creates, are not asked here: the
       kernel holds a create to the predicate after it is made. */
    const conditional = ctx.wheres !== undefined && Object.hasOwn(ctx.wheres, register);
    if (row === null || !conditional) return null;
    const gates = gateFields(register);
    for (const key of Object.keys(sent)) {
      if (!gates.has(key) || !changes(row, key, sent[key])) continue;
      const label = kernel.register(register)?.fields.find((f) => f.id === key)?.label ?? key;
      return {
        code: 'FORBIDDEN',
        fix: `Only ${kernel.ownerName() ?? 'the owner'} or an Admin can change ${label} on a shared ${one(listName(register))}.`,
        at: key,
      };
    }
    return null;
  };

  return { added, within, admitted, gateFields, hiddenFields, writable };
}
