/**
 * THE SIGHT MODULE (sharing plan §2.5 items 3 and 5): what a caller is shown of the rows they read, and which rows they
 * may write. One object, `sight`, which `index.ts` builds once and hands every method (`RecordDeps.sight`).
 *
 * THE READ HALF (Slice 3, `readSight`). ONE QUESTION, ASKED IN BATCHES. `rowAdmitted` read each row again through
 * `list`, filtered on its own `seq` and the caller's rule, so a log walk of 500 lines asked 500 statements. `admitted`
 * asks the kernel's `admittedIds` once per list per 500 rows, with the same rule `list` reads under (`kernel.scope`: the
 * grant's `where` and the rows kept private from the viewer), so a row a reader is shown one way is the row they are
 * shown every other way. The reads that write their own SQL take the grant here too: `inScope` (the brief),
 * `backlinks` and a search's count. Each is handed the caller's `wheres` and viewer, so none of them is a second copy
 * of who may see what.
 *
 * THE WRITE HALF (Slice 4, `writeSight`). Today's grants feed it: the write predicate on a list is the caller's read
 * scope there (`kernel.scope`), because one rule per list per person says both what a member reads and what they write.
 * BEFORE THE WRITE (`writable`): a row outside the predicate (`mayWrite`) is answered exactly as a row that is not
 * there, the same code and sentence as the method gives for a missing one, so no refusal proves a row exists; a delete
 * asks the delete capability; a hidden field in a patch is a field the list does not have; and a writer whose predicate
 * on the list is conditional may not change a gate field, the fields some grant's condition reads, so no grantee can
 * move a row into another grantee's view. AFTER IT (`within`): the kernel runs the same clause again in the write's
 * transaction and unwinds a create outside it or an edit that moves the row out (`WriteContext.within`).
 */

import type { Entry, Json, Kernel, Wheres } from '@braindog/kernel';
import { PRIVATE_NOTE, viewerOfRead, whereFor } from '@braindog/kernel';
import type { Refusal, Sql } from '@braindog/ports';

import type { CallContext } from './index.ts';

/* ── the read half ───────────────────────────────────────────────────────── */

export type Sighted = {
  principal: { kind: string; id: string; person?: string };
  wheres?: Readonly<Wheres> | undefined;
  outbound?: true | undefined;
};

/** A log line as the walk hands it: its target says which row it is about, when it is about one. */
type Line = { target: string | null; target_kind?: string | null };

/**
 * The fields a rule reads, or `null` when it cannot be told: a sentence, or a hop to another list (`pointed`), whose
 * answer moves when a row of that other list is written.
 */
export function ruleFields(rule: unknown): Set<string> | null {
  const out = new Set<string>();
  const walk = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.every(walk);
    if (node === null || typeof node !== 'object') return true;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'pointed') return false;
      if (key === 'field') {
        if (typeof value !== 'string') return false;
        out.add(value);
      } else if (typeof value === 'object' && value !== null && !walk(value)) return false;
    }
    return true;
  };
  if (typeof rule === 'string' || !walk(rule)) return null;
  return out;
}

/** The rows a batch of log lines is about, read once, and which of them this caller is shown. */
export type LineSight = { row: (id: string) => Entry | null; admits: (row: Entry) => boolean };

export function readSight(kernel: Kernel) {
  const viewer = (ctx: Sighted): string | undefined => viewerOfRead(ctx);

  /** Whether this caller reads every row of a list: no rule of their own on it. Private rows are still left out by `viewer`. */
  const whole = (ctx: Sighted, register: string): boolean => whereFor(ctx.wheres, register) === undefined;

  /** Which of these rows of one list the caller is shown: one statement per 500, none when nothing is held back. */
  const admitted = (ctx: Sighted, register: string, ids: readonly string[]): Set<string> =>
    ids.length === 0 ? new Set() : kernel.scope(ctx, register) === undefined ? new Set(ids) : kernel.admittedIds(register, ids, ctx.wheres, viewer(ctx));

  /** Whether the caller is shown one row: `admitted` of one. */
  const admits = (ctx: Sighted, row: { id: string; register: string } | null): boolean => row !== null && admitted(ctx, row.register, [row.id]).has(row.id);

  /** These rows less the ones the caller is not shown, in their order, asked once per list. */
  const rows = <T extends { id: string; register: string }>(ctx: Sighted, list: readonly T[]): T[] => {
    const by = new Map<string, string[]>();
    for (const r of list) by.set(r.register, by.get(r.register)?.concat(r.id) ?? [r.id]);
    const shown = new Set<string>();
    for (const [register, ids] of by) for (const id of admitted(ctx, register, ids)) shown.add(id);
    return list.filter((r) => shown.has(r.id));
  };

  /**
   * The rows a batch of log lines is about, each read once, and which of them the caller is shown, asked once per list
   * for the whole batch (sharing plan §2.13: one query per list per 500 lines). Deleted rows are read too, since a
   * deleted row's lines are still shown.
   */
  const lines = (ctx: Sighted, batch: readonly Line[]): LineSight => {
    const read = new Map<string, Entry | null>();
    const by = new Map<string, string[]>();
    for (const e of batch) {
      const target = e.target ?? '';
      const colon = target.indexOf(':');
      const kind = e.target_kind ?? (colon > 0 ? target.slice(0, colon) : null);
      if (kind !== 'entry') continue;
      const id = colon > 0 ? target.slice(colon + 1) : target;
      if (read.has(id)) continue;
      const row = kernel.get(id, { includeDeleted: true });
      read.set(id, row);
      if (!row) continue;
      const ids = by.get(row.register);
      if (ids) ids.push(row.id);
      else by.set(row.register, [row.id]);
    }
    const shown = new Set<string>();
    for (const [register, ids] of by) for (const id of admitted(ctx, register, ids)) shown.add(id);
    return {
      row: (id) => (read.has(id) ? read.get(id)! : kernel.get(id, { includeDeleted: true })),
      admits: (row) => (read.has(row.id) ? shown.has(row.id) : admits(ctx, row)),
    };
  };

  /** The clause a list's rows meet for this caller, for a reader that counts in its own SQL, or `null` for every row. */
  const clause = (ctx: Sighted, register: string) => kernel.admitClause(register, ctx.wheres, viewer(ctx));

  /** The rows that apply in one project, and those inherited from everywhere, as this caller is shown them. */
  const inScope = (ctx: Sighted, register: string, project: string | null, opts: { limit?: number; open?: boolean } = {}) =>
    kernel.inScope(register, project, { ...opts, grant: ctx.wheres, viewer: viewer(ctx) });

  /** What points at one row, the row itself and every row pointing at it held to the caller's grant and private rows. */
  const backlinks = (ctx: Sighted, q: Omit<Parameters<Kernel['backlinks']>[0], 'viewer' | 'grant'>) =>
    kernel.backlinks({ ...q, viewer: viewer(ctx), grant: ctx.wheres });

  /** A search, its hits and `matched` both the rows the caller is shown. */
  const searchMatched = (ctx: Sighted, q: string, opts: { registers?: readonly string[] | undefined; limit?: number } = {}) =>
    kernel.searchMatched(q, { ...opts, viewer: viewer(ctx), grant: ctx.wheres });

  /**
   * Whether one write can change which OLDER lines of the log this caller is shown, which is when a remembered version
   * poll may not be kept across it (`versionFor`, leak matrix G6): a row kept private or shared again, and a write to a
   * field a rule of hers reads on that row's list, which can move the row, and every line about it, into or out of her
   * sight. A rule that cannot be read for its fields (`ruleFields`) makes every row write one.
   */
  const moves = (ctx: Sighted, e: Line & { kind: string; field: string | null }, seen: LineSight): boolean => {
    if (e.kind === 'note' && e.field === PRIVATE_NOTE) return true;
    const rules = Object.values(ctx.wheres ?? {});
    if (rules.length === 0) return false;
    const fields = rules.map(ruleFields);
    if (fields.some((f) => f === null)) return true;
    const target = e.target ?? '';
    const row = seen.row(target.slice(target.indexOf(':') + 1));
    if (row === null) return true;
    const rule = whereFor(ctx.wheres, row.register);
    return rule !== undefined && (e.field === null || ruleFields(rule)!.has(e.field));
  };

  return { whole, admitted, admits, rows, lines, moves, clause, inScope, backlinks, searchMatched };
}

/* ── the write half ──────────────────────────────────────────────────────── */

const NONE: ReadonlySet<string> = new Set();

/** A list's name as one of its rows, "task" for Tasks, enough for a sentence about a row. */
const one = (name: string): string => {
  const w = name.trim().toLowerCase();
  if (/ies$/u.test(w)) return `${w.slice(0, -3)}y`;
  if (/(?:s|x|ch|sh)es$/u.test(w)) return w.slice(0, -2);
  if (/[^s]s$/u.test(w)) return w.slice(0, -1);
  return w;
};

export function writeSight(deps: SightDeps) {
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
  const mayWrite = (ctx: CallContext, register: string, id: string): boolean => {
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
    if (row !== null && !mayWrite(ctx, register, row.id)) return missing;
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

  return { added, within, mayWrite, gateFields, hiddenFields, writable };
}

/** What `sight` is built from: the kernel and the database, a list's name for a sentence, and whether a caller reads a list. */
export type SightDeps = { kernel: Kernel; sql: Sql; listName: (list: string) => string; reads: (ctx: CallContext, register: string) => boolean };

/** The sight module whole: the read half and the write half, one object. */
export function sight(deps: SightDeps) {
  return { ...readSight(deps.kernel), ...writeSight(deps) };
}

export type Sight = ReturnType<typeof sight>;
