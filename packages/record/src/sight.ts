/**
 * THE SIGHT MODULE: what a caller is shown of the rows they read, and which rows they
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
 * THE WRITE HALF (Slice 4, `writeSight`). The write predicate on a list is a share's narrower write rule where the lens
 * gave one (`ctx.writes`, `kernel.writeScope`), else the caller's read scope there (`kernel.scope`).
 * BEFORE THE WRITE (`writable`): a row outside the predicate (`mayWrite`) is answered exactly as a row that is not
 * there, the same code and sentence as the method gives for a missing one, so no refusal proves a row exists; a delete
 * asks the delete capability; a hidden field in a patch is a field the list does not have; and a writer whose predicate
 * on the list is conditional may not change a gate field, the fields some grant's condition reads, so no grantee can
 * move a row into another grantee's view. AFTER IT (`within`): the kernel runs the same clause again in the write's
 * transaction and unwinds a create outside it or an edit that moves the row out (`WriteContext.within`).
 *
 * THE FIELDS (Slice 6, `mask` and `firewall`). A share may hide fields of a list from its grantee (`ctx.hides`, the
 * union over every share covering the list). `mask` takes them off whatever a method answers: a row's `fields`, a log
 * line about one (a line about a hidden field is dropped, and a create line's `to` loses the hidden keys), and a row's
 * mirrored state when its state field is hidden. `firewall` is the doors' safety net, the same strip on any row left in
 * an answer, which a door raises as a fault, so a path that forgot to mask is found and never leaks.
 *
 * AND THE AMOUNTS WRITTEN IN TEXT (`maskMoney`). Hiding a money field kept its value off every answer, and "Paid £923.47
 * for clay" in the same row's notes, a comment or a line of the log still said it. Once any money field is hidden from a
 * caller (`amountsHidden`, a share's "Hide amounts" among them), every amount written in the text she is answered is
 * taken out, its currency kept (`maskMoneyText`), and a text field holding one is hers to read and not to change, so
 * what she saves never writes "£…" over the amount.
 */

import type { Entry, Json, Kernel, Wheres } from '@braindog/kernel';
import { PRIVATE_NOTE, maskMoneyText, viewerOfRead, whereFor } from '@braindog/kernel';
import type { Refusal, Sql } from '@braindog/ports';

import type { CallContext } from './index.ts';

/* ── the read half ───────────────────────────────────────────────────────── */

export type Sighted = {
  principal: { kind: string; id: string; person?: string };
  wheres?: Readonly<Wheres> | undefined;
  hides?: Readonly<Record<string, readonly string[]>> | undefined;
  outbound?: true | undefined;
};

const NONE: ReadonlySet<string> = new Set();

/** The fields of one list hidden from this caller, none for almost everybody. */
export const hiddenOf = (ctx: Pick<Sighted, 'hides'>, register: string): ReadonlySet<string> => {
  const fields = ctx.hides?.[register];
  return fields === undefined || fields.length === 0 ? NONE : new Set(fields);
};

/** Whether any field of any list is hidden from this caller. */
export const hidesAny = (ctx: Pick<Sighted, 'hides'>): boolean => Object.values(ctx.hides ?? {}).some((f) => f.length > 0);

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Whether amounts are hidden from this caller: some money field of some list is, by a share's "Hide amounts" or by one
 * naming the field. Read off the lens and the declarations, never off a flag a host could leave out.
 */
export const amountsHiddenIn = (kernel: Pick<Kernel, 'register'>, ctx: Pick<Sighted, 'hides'>): boolean =>
  Object.entries(ctx.hides ?? {}).some(([register, fields]) => fields.length > 0 && (kernel.register(register)?.fields ?? []).some((f) => f.type === 'money' && fields.includes(f.id)));

/** A plain object or array, the only things an answer is walked into: a byte array or a date is handed on as it is. */
const plain = (v: object): boolean => Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null;

/**
 * An answer with every amount written in its text taken out (`maskMoneyText`): each string in it, at any depth, the
 * same answer when none held one. Keys are names and are left as they are.
 */
export function moneyMasked<T>(answer: T): T {
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return maskMoneyText(v);
    if (v === null || typeof v !== 'object' || depth > 64 || !plain(v)) return v;
    if (Array.isArray(v)) {
      const out = v.map((x) => walk(x, depth + 1));
      return out.some((x, i) => x !== v[i]) ? out : v;
    }
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const y = walk(x, depth + 1);
      if (y !== x) changed = true;
      next[k] = y;
    }
    return changed ? next : v;
  };
  return walk(answer, 0) as T;
}

/** A row as any answer carries one: a list's id beside the row's `fields`. */
const isRow = (v: Record<string, unknown>): v is { register: string; fields: Record<string, unknown> } => typeof v.register === 'string' && isObj(v.fields);

/** A row as the MCP door shapes one: its spoken id, `tasks#3` or `TK3`, beside its `fields`. */
const isSpoken = (v: Record<string, unknown>): v is { spoken: string; fields: Record<string, unknown> } => typeof v.register !== 'string' && typeof v.spoken === 'string' && isObj(v.fields);

/** An object less some keys, the same object when it holds none of them. */
const without = <T extends Record<string, unknown>>(o: T, keys: ReadonlySet<string>): T => {
  if (!Object.keys(o).some((k) => keys.has(k))) return o;
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.has(k))) as T;
};

/** The fault a door raises when `firewall` took a hidden field off an answer, its cause `lens.firewall#<method>`. */
export const FIREWALL_FAULT = 'lens.firewall';

/**
 * THE DOORS' SAFETY NET: every row left in an answer with a field hidden from its caller, the
 * field taken off, and which `list.field` were found. A pure walk, the same at `/api` and `/mcp`; the door that finds
 * one raises fault `lens.firewall` naming the method. Never the main control: every method masks its own answer, and a
 * strip here is a path that did not. `listOf` names the list of a row the MCP door shapes by its spoken id alone, and
 * `money` asks, only of a caller something is hidden from, whether amounts are, so those written in the answer's text
 * come out too.
 */
export function firewall<T>(ctx: unknown, answer: T, listOf?: (spoken: string) => string | null, money?: () => boolean): { answer: T; stripped: string[] } {
  const hides = isObj(ctx) && isObj(ctx.hides) ? (ctx.hides as Record<string, readonly string[]>) : undefined;
  if (hides === undefined || !hidesAny({ hides })) return { answer, stripped: [] };
  const stripped = new Set<string>();
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 64) return v;
    if (Array.isArray(v)) {
      const out = v.map((x) => walk(x, depth + 1));
      return out.some((x, i) => x !== v[i]) ? out : v;
    }
    if (!isObj(v)) return v;
    let o: Record<string, unknown> = v;
    const register = isRow(o) ? o.register : isSpoken(o) ? (listOf?.(o.spoken) ?? null) : null;
    if (register !== null) {
      const fields = o.fields as Record<string, unknown>;
      const hidden = hiddenOf({ hides }, register);
      const found = Object.keys(fields).filter((k) => hidden.has(k));
      if (found.length > 0) {
        for (const k of found) stripped.add(`${register}.${k}`);
        o = { ...o, fields: without(fields, hidden) };
      }
    }
    let changed = o !== v;
    const next: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) {
      const y = k === 'fields' && register !== null ? x : walk(x, depth + 1);
      if (y !== x) changed = true;
      next[k] = y;
    }
    return changed ? next : v;
  };
  const walked = walk(answer, 0) as T;
  /* AND THE AMOUNTS WRITTEN IN TEXT, when the door knows amounts are hidden from her (`money`, the record's
     `moneyHidden`): a path that forgot to mask them is found here as one that forgot a field is. */
  const out = money?.() === true ? moneyMasked(walked) : walked;
  if (out !== walked) stripped.add('amounts written in text');
  return { answer: out, stripped: [...stripped].sort() };
}

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

  /**
   * Whether this caller reads the whole of a list: every row, no rule of their own on it, and every field, none hidden,
   * which is who a figure over it is answered to. Private rows are still left out by `viewer`.
   */
  const whole = (ctx: Sighted, register: string): boolean => whereFor(ctx.wheres, register) === undefined && hiddenOf(ctx, register).size === 0;

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
   * for the whole batch (one query per list per 500 lines). Deleted rows are read too, since a
   * deleted row's lines are still shown.
   */
  const lines = (ctx: Sighted, batch: readonly Line[]): LineSight => {
    const read = new Map<string, Entry | null>();
    const by = new Map<string, string[]>();
    const about: string[] = [];
    for (const e of batch) {
      const target = e.target ?? '';
      const colon = target.indexOf(':');
      const kind = e.target_kind ?? (colon > 0 ? target.slice(0, colon) : null);
      if (kind === 'entry') about.push(colon > 0 ? target.slice(colon + 1) : target);
    }
    /* EVERY ROW THE BATCH NAMES IN ONE READ (`getEach`): one a line was 400 reads for Today's news. */
    const held = kernel.getEach(about, { includeDeleted: true });
    for (const id of about) {
      if (read.has(id)) continue;
      const row = held.get(id) ?? null;
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

  /**
   * What points at one row, the row itself and every row pointing at it held to the caller's grant and private rows, by
   * the refs she is shown, each row masked.
   */
  const backlinks = (ctx: Sighted, q: Omit<Parameters<Kernel['backlinks']>[0], 'viewer' | 'grant' | 'hide'>) =>
    mask(ctx, kernel.backlinks({ ...q, viewer: viewer(ctx), grant: ctx.wheres, hide: ctx.hides }));

  /** A search, its hits and `matched` both the rows the caller is shown, by the fields she is shown. */
  const searchMatched = (ctx: Sighted, q: string, opts: { registers?: readonly string[] | undefined; limit?: number; perList?: number | undefined } = {}) =>
    kernel.searchMatched(q, { ...opts, viewer: viewer(ctx), grant: ctx.wheres, hide: ctx.hides, ...(amountsHidden(ctx) ? { maskMoney: true } : {}) });

  /**
   * The lists a search does not ask by meaning for this caller: one with a searchable field hidden from her, which
   * `searchMatched` asks by `contains` and never of the index, and which a vector of the whole row would answer by what
   * that field says.
   */
  const unmeant = (ctx: Sighted): Set<string> => {
    const out = new Set<string>();
    for (const [register, fields] of Object.entries(ctx.hides ?? {})) {
      const decl = kernel.register(register);
      if (decl && decl.fields.some((f) => fields.includes(f.id) && (f as { search?: boolean }).search === true)) out.add(register);
    }
    return out;
  };

  /** A row as this caller is shown it: less the fields hidden from her, and its state when the state field is one. */
  const maskRow = <T extends { register: string; fields: Record<string, unknown> }>(ctx: Sighted, row: T): T => {
    const hidden = hiddenOf(ctx, row.register);
    if (hidden.size === 0) return row;
    const state = kernel.register(row.register)?.state;
    const fields = without(row.fields, hidden);
    const out = fields === row.fields ? row : { ...row, fields };
    return state !== undefined && hidden.has(state) && (out as { state?: unknown }).state != null ? { ...out, state: null } : out;
  };

  /**
   * A line of the log about a row of `register` as this caller is shown it, or `null`: a line about a field hidden from
   * her is dropped, and the values a line carries whole (a create's `to`, a restore's) lose the hidden keys.
   */
  const maskLine = <T extends { kind?: unknown; field?: unknown; from?: unknown; to?: unknown }>(ctx: Sighted, register: string, line: T): T | null => {
    const hidden = hiddenOf(ctx, register);
    if (hidden.size === 0) return line;
    if (typeof line.field === 'string' && hidden.has(line.field)) return null;
    const state = kernel.register(register)?.state;
    if (line.kind === 'state' && state !== undefined && hidden.has(state)) return null;
    const from = isObj(line.from) ? without(line.from, hidden) : line.from;
    const to = isObj(line.to) ? without(line.to, hidden) : line.to;
    return from === line.from && to === line.to ? line : { ...line, from, to };
  };

  /**
   * An answer as this caller is shown it: every row in it masked (`maskRow`), and every log line in
   * it that names its list (`maskLine`) masked or dropped. A walk of the whole answer, asked only of a caller from whom
   * something is hidden, so everybody else is handed the answer as it was.
   */
  const mask = <T>(ctx: Sighted, answer: T): T => {
    if (!hidesAny(ctx)) return answer;
    /* AND A REFUSAL'S `allowed` NAMES NO HIDDEN FIELD: a block or a lint naming a field nobody declared was answered with
       every field of the list as the choices, the hidden ones among them. Every list's hidden names are taken off, so a
       name hidden on one list is never offered on another either. */
    const unnamed = new Set(Object.values(ctx.hides ?? {}).flat());
    const DROP = Symbol('drop');
    const walk = (v: unknown, depth: number): unknown => {
      if (depth > 64) return v;
      if (Array.isArray(v)) {
        const out = v.map((x) => walk(x, depth + 1)).filter((x) => x !== DROP);
        return out.length === v.length && out.every((x, i) => x === v[i]) ? v : out;
      }
      if (!isObj(v)) return v;
      let o: Record<string, unknown> = v;
      if (typeof o.code === 'string' && Array.isArray(o.allowed) && o.allowed.some((x) => typeof x === 'string' && unnamed.has(x)))
        o = { ...o, allowed: o.allowed.filter((x) => !(typeof x === 'string' && unnamed.has(x))) };
      if (isRow(o)) o = maskRow(ctx, o);
      else if (typeof o.register === 'string' && typeof o.kind === 'string' && ('to' in o || 'from' in o)) {
        const line = maskLine(ctx, o.register, o);
        if (line === null) return DROP;
        o = line;
      }
      let changed = o !== v;
      const next: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) {
        const y = k === 'fields' && isRow(o) ? x : walk(x, depth + 1);
        if (y !== x) changed = true;
        next[k] = y === DROP ? null : y;
      }
      return changed ? next : v;
    };
    /* AND THE AMOUNTS WRITTEN IN ITS TEXT, when amounts are hidden from her (`maskMoney`). */
    return maskMoney(ctx, walk(answer, 0) as T);
  };

  /** Whether amounts are hidden from this caller (`amountsHiddenIn`). */
  const amountsHidden = (ctx: Sighted): boolean => amountsHiddenIn(kernel, ctx);

  /** An answer as this caller is shown it, less every amount written in its text when amounts are hidden from her. */
  const maskMoney = <T>(ctx: Sighted, answer: T): T => (amountsHidden(ctx) ? moneyMasked(answer) : answer);

  /**
   * Whether one write can change which OLDER lines of the log this caller is shown, which is when a remembered version
   * poll may not be kept across it (`versionFor`, leak matrix G6): a row kept private or shared again, and a write to a
   * field a rule of hers reads on that row's list, which can move the row, and every line about it, into or out of her
   * sight. A rule that cannot be read for its fields (`ruleFields`) makes every row write one.
   */
  const moves = (ctx: Sighted, e: Line & { kind: string; field: string | null }, seen: LineSight): boolean => {
    if (e.kind === 'note' && e.field === PRIVATE_NOTE) return true;
    /* A ROW'S FIRST LINE HAS NO OLDER LINE ABOUT THAT ROW TO MOVE: a row made outside her rule is a line she is not shown,
       and nothing before it changes, so a poll across a run of creates keeps what it remembered. */
    if (e.kind === 'create') return false;
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

  return { whole, admitted, admits, rows, lines, moves, clause, inScope, backlinks, searchMatched, unmeant, hidden: hiddenOf, maskRow, maskLine, mask, amountsHidden, maskMoney };
}

/* ── the write half ──────────────────────────────────────────────────────── */

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
   * `undefined` for any row. An appender who reads nothing still adds, inside her rule. A share's narrower write rule
   * holds her adds too (`writeScope`), so a view of the whole list and an edit of some of it add only to that part.
   */
  const added = (ctx: CallContext, register: string): Json | undefined => kernel.writeScope(ctx, register);

  /**
   * The rows of one list already there this caller may write (the write predicate), as the scope the kernel's write
   * takes: `undefined` for every row, and `null` for none, when she cannot read the list at all, since the write
   * predicate includes read.
   */
  const within = (ctx: CallContext, register: string): Json | undefined => (reads(ctx, register) ? kernel.writeScope(ctx, register) : null);

  /** Whether one row is inside what this caller may write on its list, deleted or not. One query, by id. */
  const mayWrite = (ctx: CallContext, register: string, id: string): boolean => {
    const rule = within(ctx, register);
    return rule === undefined || kernel.admits(register, rule, id);
  };

  /**
   * THE GATE FIELDS OF A LIST: every field some active grant's condition on it reads, a member's `row_where` and a
   * share's condition, and the scope field of a list a project share covers (§2.6), so changing one changes who sees
   * the row.
   */
  const gateFields = (register: string): ReadonlySet<string> => {
    const rules = sql.all<{ row_where: string }>(
      `SELECT DISTINCT m.row_where FROM member m JOIN person p ON p.id = m.person_id
        WHERE m.register = ? AND m.row_where IS NOT NULL AND p.suspended_at IS NULL`,
      register,
    );
    const shared = kernel.gateFields(register);
    if (rules.length === 0 && shared.length === 0) return NONE;
    const out = new Set<string>(shared);
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

  /** The fields of a list hidden from this caller: a patch naming one names a field the list lacks. */
  const hiddenFields = (ctx: CallContext, register: string): ReadonlySet<string> => hiddenOf(ctx, register);

  /**
   * Whether this caller may delete or restore rows of a list: the write rung carries delete unless a share switched it
   * off there (`ctx.nots`, a share's `caps: { delete: false }`).
   */
  const mayDelete = (ctx: CallContext, register: string): Refusal | null =>
    ctx.nots?.[register]?.includes('delete') === true
      ? { code: 'FORBIDDEN', fix: `You can change ${listName(register)}, and not delete or bring back what is in it. Ask ${kernel.ownerName() ?? 'the owner'}.`, at: 'deleted_at' }
      : null;

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
    /* A TEXT FIELD HOLDING AN AMOUNT HIDDEN FROM HER IS HERS TO READ AND NOT TO CHANGE: she reads "Paid £… for clay", and
       saving it back, even as she was shown it, would write that over the amount. */
    if (row !== null && amountsHiddenIn(kernel, ctx))
      for (const key of Object.keys(sent)) {
        const held = row.fields[key];
        if (typeof held !== 'string' || maskMoneyText(held) === held || sent[key] === held) continue;
        const label = kernel.register(register)?.fields.find((f) => f.id === key)?.label ?? key;
        return {
          code: 'FORBIDDEN',
          fix: `${label} on this ${one(listName(register))} holds an amount hidden from you, so only ${kernel.ownerName() ?? 'the owner'} or an Admin can change it.`,
          at: key,
        };
      }
    /* A CONDITIONAL WRITER LEAVES THE GATE FIELDS AS THEY ARE. Whole-list writers, and creates, are not asked here: the
       kernel holds a create to the predicate after it is made. */
    const conditional = (ctx.wheres !== undefined && Object.hasOwn(ctx.wheres, register)) || (ctx.writes !== undefined && Object.hasOwn(ctx.writes, register));
    if (row === null || !conditional) return null;
    /**
     * HER OWN GATES, AND NOT EVERYBODY'S, SINCE THE HOUSEHOLD SHARE (round 1030). Every field any grant's condition named
     * was held still for every conditional writer, so one account shared with a partner (`account is ...` on the Ledger)
     * stopped a Member kept to one project from moving any line of that project to another account. A writer is held
     * to the fields HER conditions read, which is what keeps a row inside what she may write; the write is still held
     * to her predicate after it is made. Moving a line onto a shared account shows it to whoever that account is shared
     * with, as it would when an owner moves it.
     */
    const gates = new Set<string>();
    for (const rule of [ctx.wheres?.[register], ctx.writes?.[register]]) if (rule !== undefined && rule !== null) for (const f of kernel.ruleFields(register, rule)) gates.add(f);
    if (gates.size === 0) for (const f of gateFields(register)) gates.add(f);
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
