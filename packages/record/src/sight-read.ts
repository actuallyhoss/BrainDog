/**
 * What a caller is shown of the rows they read one at a time or in a batch (sharing plan §2.5 item 3, Slice 3): the
 * read half of the sight module. The write half (`writable`, `gateFields`) is Slice 4's.
 *
 * ONE QUESTION, ASKED IN BATCHES. `rowAdmitted` read each row again through `list`, filtered on its own `seq` and the
 * caller's rule, so a log walk of 500 lines asked 500 statements. `admitted` asks the kernel's `admittedIds` once per
 * list per 500 rows, with the same rule `list` reads under (`kernel.scope`: the grant's `where` and the rows kept
 * private from the viewer), so a row a reader is shown one way is the row they are shown every other way.
 *
 * THE READS THAT WRITE THEIR OWN SQL TAKE THE GRANT HERE TOO: `inScope` (the brief), `backlinks` and a search's count.
 * Each is handed the caller's `wheres` and viewer, so none of them is a second copy of who may see what.
 */

import type { Entry, Wheres } from '@braindog/kernel';
import { PRIVATE_NOTE, viewerOfRead, whereFor, type Kernel } from '@braindog/kernel';

/** What the sight module reads of a call: who is looking, their grant, and whether the read leaves the record. */
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

export type Sight = ReturnType<typeof readSight>;
