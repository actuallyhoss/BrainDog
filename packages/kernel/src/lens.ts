/**
 * What one caller holds right now: the lens. Pure functions, nothing here reads the store.
 *
 * A LENS IS COMPUTED ON EVERY CALL from the caller's role, their legacy per-list member rows, their shares and their
 * groups' shares, and a token's narrowing when an agent is calling. For each list and each capability it holds one
 * predicate: TRUE, FALSE, or a `where` tree (`34-GRAMMARS` §1) that a reader compiles as it compiles any filter.
 *
 *   pred[c][L] = (any allow covering L that grants c) AND NOT (any deny covering L that denies c)
 *
 * DENY BEATS ALLOW, and an owner is never the target of a share. Write, delete, history and propose are each held to
 * read, because you can't change or comment on what you can't see. A token is its person's lens ANDed with its narrowing.
 *
 * IT FAILS CLOSED. Anything malformed in what it is handed (a share that is not the grammar, a time that is not a time,
 * a narrowing that is not a target) answers `null`, the stranger's lens: a dropped allow would only hide rows, but a
 * dropped deny would show them. A condition that is well formed and no longer compiles (a field was retired) reaches no
 * row as an allow and every row as a deny, and its share is named in `stale` so the Sharing page can say so.
 */

import type { Refusal } from '@braindog/ports';
import { compile, evaluate, OPERATORS, type Compiled, type FieldSpec, type Json, type Predicate, type Schema } from '@braindog/where';

import { WHERE_MAX_CHARS, type Level } from './members.ts';
import type { ScopeDecl } from './scope.ts';

/* ------------------------------------------------------------------------------------------------ the grammar (§2.3) */

/** The four rungs a share is given at. */
export const RUNGS = ['view', 'comment', 'edit', 'manage'] as const;
export type Rung = (typeof RUNGS)[number];

/** What a predicate is held for, one per capability a reader or a writer asks about. */
export const CAPS = ['read', 'propose', 'append', 'write', 'delete', 'history'] as const;
export type Cap = (typeof CAPS)[number];

export const WHO_KINDS = ['person', 'group', 'email', 'link'] as const;
export type Who = { kind: (typeof WHO_KINDS)[number]; id: string };

/** A condition: the `where` grammar's tree, with ids, never names. */
export type Where = Predicate;

export type Target =
  | { record: true }
  | { lists: string[] }
  | { lists: { has: 'money' } }
  | { lists: { role: 'keys' | 'meets' } }
  | { project: string; lists?: string[] }
  | { list: string; where: Where; view?: string }
  | { list: string; rows: string[] };
export type Caps = { history?: boolean; delete?: boolean; create?: boolean; agents?: boolean; onward?: boolean };
export type Hide = { [list: string]: string[] } | { types: 'money'[] };
export type Hours = { days: number[]; from: string; to: string };
export type When = { from?: string; until?: string; hours?: Hours; once?: true };

/** One share as the grammar writes it. */
export type Share = { effect: 'allow' | 'deny'; who: Who; what: Target; can: Rung; caps?: Caps; hide?: Hide; when?: When };

/** One share as the record holds it: an id, and whether it was revoked or a once share first used. */
export type HeldShare = Share & { id: string; revoked_at?: string | null; first_used_at?: string | null };

/** What a token is narrowed to (`token_lens.narrow`): a target, or one of its person's shares by id. */
export type Narrow = Target | { share: string };

/* ---------------------------------------------------------------------------------------------- what the record has */

export type CatalogField = FieldSpec & { id: string; retired?: boolean; scope?: ScopeDecl; title?: boolean };

/**
 * One list, as the lens needs to know it. `role` marks the keychain's index list (`keys`), the meets list (`people`) and
 * the list whose rows are projects (`projects`). `ownerOnly` is a list a role never reaches; Keys and People are such
 * lists too, and like them it is reached only by a share that names it.
 */
export type CatalogList = {
  id: string;
  name: string;
  fields: CatalogField[];
  role?: 'keys' | 'meets' | 'projects';
  ownerOnly?: boolean;
  /**
   * A list the kernel declares itself (`pack_id` kernel): the runs, and what the owner tells his agents. THE OWNER'S, by
   * its declaration and never by a name: no role but owner reaches it, and no broad share does (the record, money
   * lists, a project). Only a share or a member row that names it reaches it.
   */
  kernel?: boolean;
  /**
   * A list declared `personal: true`: the owner's alone. No role, share, legacy grant, child key or key's narrowing
   * reaches it, even one naming it, so only the owner's own session and his own plain key read it (`42 §4.4`).
   */
  personal?: boolean;
  /** The field the record mirrors onto the `state` column, as `Schema.state` says. */
  state?: string;
};
export type Catalog = { lists: CatalogList[] };

/* ------------------------------------------------------------------------------------------------------- the lens */

/** A predicate after folding: every row, no row, or a condition. */
export type Pred = boolean | Where;

/** The levels a lens hands a reader: today's five, and `comment`, the new held level between read and write. */
export type LensLevel = Level | 'comment';

export type LensSources = {
  person: string;
  /** The `*` member row's level, or `null` for a guest with shares only. */
  role: Level | null;
  suspended?: boolean;
  /**
   * Legacy per-list member rows: on that list they replace the role. `where` is the rule as `invite` stored it, a tree or
   * a sentence, carried as one leaf for the reader to compile as it always has (`ruleOf`); `null` or anything else is a
   * rule the record could not read, which reaches no row.
   */
  lists?: { register: string; level: Level; where?: Json | null }[];
  /** The person's shares and their groups' shares, revoked ones included (they count for nothing). */
  shares: HeldShare[];
  /** The People rows whose address is the person's sign-in, for `$me`. None, and `$me` matches nothing. */
  me?: string[];
  /**
   * Present when an agent is calling: its narrowing, or `null` for a root token with none. `narrows` is a child key's
   * chain (its parent's narrowing, then its own, as `verifyToken` reads them), every link ANDed in beside `narrow`.
   * `child` says the key was minted under another, which reaches no personal list.
   */
  token?: { narrow: Narrow | null; narrows?: readonly Narrow[]; child?: boolean } | null;
  /** The access epoch, the `access` counter. */
  epoch?: number;
};

export type LensCtx = {
  level: LensLevel | null;
  registers: string[] | null;
  levels: Record<string, LensLevel>;
  wheres: Record<string, Where>;
  writes: Record<string, Where>;
  hides: Record<string, string[]>;
  nots: Record<string, ('history' | 'delete')[]>;
  grant: { epoch: number; until: string | null; via: string[]; agents: boolean };
};

export type Lens = {
  owner: boolean;
  pred: Record<Cap, Record<string, Pred>>;
  hides: Record<string, string[]>;
  /** The next instant the lens may change by the clock alone: a share starting, ending, its hours turning, a once share running out. */
  until: string | null;
  /** The live shares that reach something. */
  via: string[];
  /** Live shares with a condition that no longer compiles, which reach nothing. */
  stale: string[];
  ctx: LensCtx;
};

/* ---------------------------------------------------------------------------------------------------------- limits */

export const WHERE_MAX_DEPTH = 4;
export const WHERE_MAX_LEAVES = 20;
export const ROWS_MAX = 100;
/** Compiled SQL parameters per list across all of one person's shares; a Durable Object statement binds at most 100. */
export const PARAMS_MAX = 60;
export const ONCE_MS = 24 * 60 * 60 * 1000;

/** The kernel columns a condition may name besides a list's own fields. */
const KERNEL_LEAVES = ['state', 'created_at', 'updated_at', 'id', 'seq'] as const;
const BARRED_OPS = new Set(['matches', 'near']);
const ME = '$me';

const RUNG_CAPS: Record<Rung, readonly Cap[]> = {
  view: ['read', 'history'],
  comment: ['read', 'history', 'propose'],
  edit: ['read', 'history', 'propose', 'append', 'write', 'delete'],
  manage: ['read', 'history', 'propose', 'append', 'write', 'delete'],
};
/** What a deny with caps takes away above its rung: at most `can`, and the toggles it names on top. */
const ABOVE: Record<Rung, readonly Cap[]> = {
  view: ['propose', 'append', 'write', 'delete'],
  comment: ['append', 'write', 'delete'],
  edit: [],
  manage: [],
};
const LEVEL_CAPS: Record<Level, readonly Cap[]> = {
  read: ['read', 'history'],
  append: ['append'],
  write: CAPS,
  decide: CAPS,
  owner: CAPS,
};
const RANK: Record<Level, number> = { read: 1, append: 0, write: 3, decide: 4, owner: 5 };

/**
 * Whether a role reaches a list on its own, before any share: every list, as the ladder has always read it, except that
 * a record-wide "Adds only" stops at the owner's lists (Keys, People and any `owner_only` list), as the record's
 * `ownersListStop` says. A share still reaches Keys and People only by naming them (`coverOf`).
 */
const roleReaches = (role: Level, l: CatalogList): boolean => l.kernel !== true && l.personal !== true && (role !== 'append' || !isGated(l));

/** A legacy rule as the lens carries it: TRUE for none, the rule itself as one leaf, or FALSE when it cannot be read. */
const legacyCond = (where: Json | null | undefined): Expr =>
  where === undefined ? true : (typeof where === 'string' && where.trim() !== '') || isObj(where) ? (where as Where) : false;

/* ---------------------------------------------------------------------------------------------------------- folding */

/** A predicate under construction: constants and conditions inside groups. */
export type Expr = boolean | Where | { all: Expr[] } | { any: Expr[] } | { none: Expr[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const groupOf = (e: Expr): ['all' | 'any' | 'none', Expr[]] | null => {
  if (!isObj(e)) return null;
  const keys = Object.keys(e);
  if (keys.length !== 1) return null;
  const k = keys[0] as 'all' | 'any' | 'none';
  return (k === 'all' || k === 'any' || k === 'none') && Array.isArray((e as Record<string, unknown>)[k]) ? [k, (e as Record<string, unknown>)[k] as Expr[]] : null;
};
const dedupe = (xs: Where[]): Where[] => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const s = JSON.stringify(x);
    return seen.has(s) ? false : (seen.add(s), true);
  });
};

/**
 * TRUE and FALSE folded out of a predicate, so a reader sees a constant where there is one and a tree only where a
 * condition is left. `all` drops TRUE and is FALSE with any FALSE; `any` drops FALSE and is TRUE with any TRUE; `none`
 * is the negation of `any`. Same children are kept once, and a group of one is its child.
 *
 * AND IT FLATTENS: an `all` inside an `all`, and an `any` inside an `any` or a `none`, give their children to the group
 * around them. The `where` grammar nests three groups at most (`PREDICATE_TOO_DEEP`) and a lens wraps each share's
 * condition in two of its own, so a group saved is often the difference between a tree `compile` takes and one it
 * refuses. `compileLens` takes any depth.
 */
export function fold(e: Expr): Pred {
  if (typeof e === 'boolean') return e;
  const g = groupOf(e);
  if (!g) return e as Where;
  const [k, raw] = g;
  const kids = raw.map(fold);
  const flat = (xs: Pred[], inner: 'all' | 'any'): Pred[] =>
    xs.flatMap((x) => {
      const gx = typeof x === 'boolean' ? null : groupOf(x as Expr);
      return gx && gx[0] === inner ? (gx[1] as Pred[]) : [x];
    });
  if (k === 'all') {
    if (kids.includes(false)) return false;
    const left = dedupe(flat(kids, 'all').filter((x): x is Where => x !== true));
    return left.length === 0 ? true : left.length === 1 ? left[0]! : { all: left };
  }
  if (kids.includes(true)) return k === 'none' ? false : true;
  const left = dedupe(flat(kids, 'any').filter((x): x is Where => x !== false));
  if (k === 'any') return left.length === 0 ? false : left.length === 1 ? left[0]! : { any: left };
  return left.length === 0 ? true : { none: left };
}

/** How many groups deep a predicate nests, counting the outermost as the first; a leaf or a constant is 0. */
export function depthOf(p: Pred): number {
  if (typeof p === 'boolean') return 0;
  const g = groupOf(p as Expr);
  return g ? 1 + Math.max(0, ...g[1].map((k) => depthOf(k as Pred))) : 0;
}

/**
 * A lens predicate as SQL over `entry`, however deep it nests: the groups are joined here and each leaf is compiled by
 * `compile`, so a leaf means exactly what it means in a filter. A part that cannot be compiled makes the whole of it
 * `bad`, which `narrowed` (`members.ts`) turns into no row.
 */
export function compileLens(p: Pred, schema: Schema): Compiled {
  if (p === true) return { sql: '1 = 1', params: [], bad: [] };
  if (p === false) return { sql: '0 = 1', params: [], bad: [] };
  const g = groupOf(p as Expr);
  if (!g) return compile(p as Where, schema);
  const parts = g[1].map((k) => compileLens(k as Pred, schema));
  const bad = parts.flatMap((x) => x.bad);
  if (bad.length) return { sql: '0 = 1', params: [], bad };
  const params = parts.flatMap((x) => x.params);
  const or = parts.length ? parts.map((x) => `(${x.sql})`).join(' OR ') : '0 = 1';
  if (g[0] === 'all') return { sql: parts.length ? parts.map((x) => `(${x.sql})`).join(' AND ') : '1 = 1', params, bad: [] };
  return { sql: g[0] === 'any' ? or : `NOT (${or})`, params, bad: [] };
}

/** Whether a lens predicate admits one row already in memory: the answer `compileLens` gives in SQL. */
export function admits(p: Pred, fields: Record<string, unknown>, schema: Schema, row: Readonly<Record<string, unknown>>): boolean {
  if (typeof p === 'boolean') return p;
  const g = groupOf(p as Expr);
  if (!g) return evaluate(p as Where, fields, schema, row);
  const kids = g[1].map((k) => admits(k as Pred, fields, schema, row));
  return g[0] === 'all' ? kids.every(Boolean) : g[0] === 'any' ? kids.some(Boolean) : !kids.some(Boolean);
}

/* -------------------------------------------------------------------------------------------------------- the clock */

const FORMATS = new Map<string, Intl.DateTimeFormat>();
const formatOf = (tz: string): Intl.DateTimeFormat => {
  let f = FORMATS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
    });
    FORMATS.set(tz, f);
  }
  return f;
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall clock in `tz` at `ms`: the date, the weekday (0 is Sunday) and minutes past midnight. Throws on an unknown zone. */
export function wall(ms: number, tz: string): { y: number; m: number; d: number; day: number; minutes: number } {
  const parts = Object.fromEntries(formatOf(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), day: WEEKDAYS.indexOf(parts.weekday!), minutes: hour * 60 + Number(parts.minute) };
}

/** The instant a wall-clock time on a date in `tz` falls at. */
function instantOf(y: number, m: number, d: number, minutes: number, tz: string): number {
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const offset = (t: number) => {
    const w = wall(t, tz);
    return Date.UTC(w.y, w.m - 1, w.d, 0, w.minutes) - Math.floor(t / 60_000) * 60_000;
  };
  const first = naive - offset(naive);
  const second = naive - offset(first);
  return second;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (hhmm: string): number => {
  const m = HHMM.exec(hhmm);
  if (!m) throw new TypeError(`${hhmm} is not a time`);
  return Number(m[1]) * 60 + Number(m[2]);
};

function inHours(h: Hours, ms: number, tz: string): boolean {
  const w = wall(ms, tz);
  const from = minutesOf(h.from);
  const to = minutesOf(h.to);
  if (from < to) return h.days.includes(w.day) && w.minutes >= from && w.minutes < to;
  /* PAST MIDNIGHT: the window belongs to the day it opens on. */
  return (h.days.includes(w.day) && w.minutes >= from) || (h.days.includes((w.day + 6) % 7) && w.minutes < to);
}

const when = (ms: string | undefined): number => (ms === undefined ? NaN : Date.parse(ms));

/**
 * Whether a share is active at `nowMs` on the record's clock in `tz`: not revoked, `from` <= now < `until`, inside its
 * weekly hours, and for a once share, less than a day since it was first used. Anything unreadable is not active.
 */
export function activeAt(share: HeldShare, nowMs: number, tz = 'UTC'): boolean {
  try {
    if (share.revoked_at) return false;
    const w = share.when;
    if (w?.from !== undefined && !(when(w.from) <= nowMs)) return false;
    if (w?.until !== undefined && !(nowMs < when(w.until))) return false;
    if (w?.once === true && share.first_used_at && !(nowMs < Date.parse(share.first_used_at) + ONCE_MS)) return false;
    if (w?.hours !== undefined && !inHours(w.hours, nowMs, tz)) return false;
    return true;
  } catch {
    return false;
  }
}

/** The next instant after `nowMs` at which `activeAt` may turn for this share, or `null` for never. */
export function nextEdge(share: HeldShare, nowMs: number, tz = 'UTC'): number | null {
  if (share.revoked_at) return null;
  const w = share.when ?? {};
  const out: number[] = [when(w.from), when(w.until)];
  if (w.once === true && share.first_used_at) out.push(Date.parse(share.first_used_at) + ONCE_MS);
  if (w.hours) {
    const from = minutesOf(w.hours.from);
    const to = minutesOf(w.hours.to);
    const today = wall(nowMs, tz);
    for (let i = -1; i <= 8; i++) {
      const date = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
      if (!w.hours.days.includes(date.getUTCDay())) continue;
      const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
      out.push(instantOf(y, m, d, from, tz));
      out.push(from < to ? instantOf(y, m, d, to, tz) : instantOf(y, m, d + 1, to, tz));
    }
  }
  const later = out.filter((t) => Number.isFinite(t) && t > nowMs);
  return later.length ? Math.min(...later) : null;
}

/* ------------------------------------------------------------------------------------------------------ shape checks */

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);
const isInstant = (v: unknown): boolean => typeof v === 'string' && Number.isFinite(Date.parse(v));

const isScalar = (v: unknown): boolean =>
  typeof v === 'string' ||
  (typeof v === 'number' && Number.isFinite(v)) ||
  typeof v === 'boolean' ||
  (isObj(v) && ((typeof v.amount === 'number' && typeof v.currency === 'string') || (typeof v.value === 'number' && typeof v.unit === 'string')));

/**
 * Why a condition is not one a share may hold, by shape alone, or `null`: groups and leaves only, no `pointed` and no
 * `via`, every operator but `matches` and `near`, literal values or `$me`, at most four deep and twenty leaves, and
 * `WHERE_MAX_CHARS` characters of JSON.
 */
export function whereFault(where: unknown): string | null {
  let text: string;
  try {
    text = JSON.stringify(where);
  } catch {
    return 'A condition is plain data.';
  }
  if (text === undefined) return 'A condition is plain data.';
  if (text.length > WHERE_MAX_CHARS) return `A condition is at most ${WHERE_MAX_CHARS} characters, and this one is ${text.length}.`;
  let leaves = 0;
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > WHERE_MAX_DEPTH) return `A condition is at most ${WHERE_MAX_DEPTH} deep.`;
    if (!isObj(node)) return 'Each part of a condition is a group or a test of one field.';
    const g = groupOf(node as Expr);
    if (g) {
      for (const kid of g[1]) {
        const bad = walk(kid, depth + 1);
        if (bad) return bad;
      }
      return null;
    }
    if (Object.hasOwn(node, 'pointed')) return 'A share condition cannot look through another list.';
    if (Object.hasOwn(node, 'via')) return 'A share condition cannot follow a link to another list.';
    if (++leaves > WHERE_MAX_LEAVES) return `A condition has at most ${WHERE_MAX_LEAVES} tests.`;
    const ops = Object.keys(node).filter((k) => k !== 'field');
    if (ops.length !== 1) return 'Each test names one field and one way to compare it.';
    const op = ops[0]!;
    if (BARRED_OPS.has(op)) return `A share condition cannot use ${op}: it reads the text index.`;
    if (!(OPERATORS as readonly string[]).includes(op)) return `${op} is not a way to compare.`;
    if (!isText(node.field)) return 'Each test names a field.';
    const v = node[op];
    const values = Array.isArray(v) ? v : [v];
    if (op === 'empty' || op === 'present') return v === true || v === null || v === undefined ? null : `${op} takes no value.`;
    if ((op === 'in' || op === 'not_in' || op === 'between') !== Array.isArray(v)) return `${op} takes ${Array.isArray(v) ? 'one value' : 'a list of values'}.`;
    for (const x of values) {
      if (!isScalar(x)) return 'A test compares with a plain value.';
      if (typeof x === 'string' && x.startsWith('$') && x !== ME) return `${x} is not a value a share knows. Use $me, or a plain value.`;
      if (x === ME && !(op === 'is' || op === 'has' || op === 'in')) return '$me goes with is, has or in.';
    }
    return null;
  };
  return walk(where, 1);
}

const CAP_KEYS = new Set(['history', 'delete', 'create', 'agents', 'onward']);

/** Why a target is not the grammar, by shape alone, or `null`. */
function targetFault(t: unknown): string | null {
  if (!isObj(t)) return 'What is shared is a target.';
  const keys = Object.keys(t).sort().join(',');
  if (keys === 'record') return t.record === true ? null : 'record is true.';
  if (keys === 'lists') {
    const l = t.lists;
    if (isTexts(l)) return l.length ? null : 'Name at least one list.';
    if (isObj(l) && Object.keys(l).join() === 'has') return l.has === 'money' ? null : 'Lists are picked by has money.';
    if (isObj(l) && Object.keys(l).join() === 'role') return l.role === 'keys' || l.role === 'meets' ? null : 'The role is keys or meets.';
    return 'lists is ids, has money, or a role.';
  }
  if (keys === 'project' || keys === 'lists,project')
    return !isText(t.project) ? 'A project is its row id.' : t.lists !== undefined && !(isTexts(t.lists) && t.lists.length) ? 'Name at least one list.' : null;
  if (keys === 'list,where' || keys === 'list,view,where') {
    if (!isText(t.list)) return 'A condition is on one list, by id.';
    if (t.view !== undefined && !isText(t.view)) return 'A view is its id.';
    return whereFault(t.where);
  }
  if (keys === 'list,rows') {
    if (!isText(t.list)) return 'Rows are on one list, by id.';
    if (!isTexts(t.rows) || t.rows.length === 0) return 'Name at least one row.';
    return t.rows.length > ROWS_MAX ? `A share names at most ${ROWS_MAX} rows. Share a condition instead.` : null;
  }
  return 'What is shared is all of this BrainDog, lists, a project, a condition, or rows.';
}

function hideFault(h: unknown): string | null {
  if (!isObj(h)) return 'Hidden fields are a map from a list to its fields, or types money.';
  if (Object.keys(h).join() === 'types') return Array.isArray(h.types) && h.types.length > 0 && h.types.every((x) => x === 'money') ? null : 'The one type that can be hidden is money.';
  return Object.values(h).every(isTexts) ? null : 'Hidden fields are a map from a list to its fields.';
}

function whenFault(w: unknown): string | null {
  if (!isObj(w)) return 'When is from, until, hours and once.';
  for (const k of Object.keys(w)) if (!['from', 'until', 'hours', 'once'].includes(k)) return `${k} is not part of when.`;
  if (w.from !== undefined && !isInstant(w.from)) return 'from is a date.';
  if (w.until !== undefined && !isInstant(w.until)) return 'until is a date.';
  if (w.from !== undefined && w.until !== undefined && !(Date.parse(w.from as string) < Date.parse(w.until as string))) return 'until is after from.';
  if (w.once !== undefined && w.once !== true) return 'once is true, or left out.';
  if (w.hours !== undefined) {
    const h = w.hours;
    if (!isObj(h) || Object.keys(h).sort().join() !== 'days,from,to') return 'Hours are days, from and to.';
    if (!Array.isArray(h.days) || h.days.length === 0 || !h.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) || new Set(h.days).size !== h.days.length)
      return 'Hours are on days 0 (Sunday) to 6, each once.';
    if (typeof h.from !== 'string' || !HHMM.test(h.from) || typeof h.to !== 'string' || !HHMM.test(h.to)) return 'Hours are from and to as HH:MM.';
    if (h.from === h.to) return 'Hours end at a different time from when they start.';
  }
  return null;
}

/** Why a share is not the grammar, by shape alone, or `null`. The `at` is the path into the share. */
export function shareFault(s: unknown): { at: string; fix: string } | null {
  if (!isObj(s)) return { at: '', fix: 'A share is effect, who, what and can.' };
  if (s.effect !== 'allow' && s.effect !== 'deny') return { at: 'effect', fix: 'effect is allow or deny.' };
  const who = s.who;
  if (!isObj(who) || !(WHO_KINDS as readonly string[]).includes(who.kind as string) || !isText(who.id)) return { at: 'who', fix: 'who is a person, a group, an email or a link, by id.' };
  if (!(RUNGS as readonly string[]).includes(s.can as string)) return { at: 'can', fix: 'can is view, comment, edit or manage.' };
  const t = targetFault(s.what);
  if (t) return { at: 'what', fix: t };
  if (s.caps !== undefined && s.caps !== null) {
    if (!isObj(s.caps)) return { at: 'caps', fix: 'caps is a map of switches.' };
    for (const [k, v] of Object.entries(s.caps)) if (!CAP_KEYS.has(k) || typeof v !== 'boolean') return { at: `caps.${k}`, fix: `${k} is not a switch a share has.` };
  }
  if (s.hide !== undefined && s.hide !== null) {
    const h = hideFault(s.hide);
    if (h) return { at: 'hide', fix: h };
  }
  if (s.when !== undefined && s.when !== null) {
    const w = whenFault(s.when);
    if (w) return { at: 'when', fix: w };
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------- reading a target */

const isGated = (l: CatalogList): boolean => l.ownerOnly === true || l.kernel === true || l.personal === true || l.role === 'keys' || l.role === 'meets';
const hasMoney = (l: CatalogList): boolean => l.fields.some((f) => !f.retired && f.type === 'money');
/** Whether a target is "every list with money" (`{ lists: { has: 'money' } }`), as the templates' deny of money says it. */
const isMoneyDeny = (t: Target): boolean => 'lists' in t && !Array.isArray(t.lists) && 'has' in t.lists && t.lists.has === 'money';
const scopeField = (l: CatalogList): CatalogField | undefined => l.fields.find((f) => f.scope !== undefined && !f.retired);

/** The `where` package's schema for one list, so a condition compiles as a filter would. */
export function schemaOf(l: CatalogList): Schema {
  const fields: Record<string, FieldSpec> = {};
  for (const f of l.fields) {
    if (f.retired) continue;
    const { id: _id, retired: _r, scope: _s, title: _t, ...spec } = f;
    fields[f.id] = spec;
  }
  return { register: l.id, fields, ...(l.state !== undefined ? { state: l.state } : {}) };
}

/** Every leaf of a tree. */
function leavesOf(w: Where): Record<string, unknown>[] {
  const g = groupOf(w as Expr);
  if (g) return g[1].flatMap((k) => (typeof k === 'boolean' ? [] : leavesOf(k as Where)));
  return [w as Record<string, unknown>];
}

/** Why a leaf cannot be read against this list today, or `null`. */
function leafFault(leaf: Record<string, unknown>, l: CatalogList, schema: Schema): Refusal | null {
  const field = leaf.field as string;
  const own = l.fields.find((f) => f.id === field);
  const kernel = (KERNEL_LEAVES as readonly string[]).includes(field);
  if (!kernel && (!own || own.retired || own.derived))
    return { code: 'FIELD_UNKNOWN', fix: `${l.name} has no field a share can test called ${field}.`, at: field };
  if (field === 'state' && l.state === undefined && !own) return { code: 'FIELD_UNKNOWN', fix: `${l.name} has no state.`, at: field };
  const probe = JSON.parse(JSON.stringify(leaf).replaceAll(`"${ME}"`, '"me"')) as Where;
  const bad = compile(probe, schema).bad[0];
  return bad ? { code: bad.code, fix: bad.fix, ...(bad.at !== undefined ? { at: bad.at } : {}) } : null;
}

/** `$me` replaced by the People rows it means; none, and the test matches nothing. */
function withMe(w: Where, me: readonly string[]): Expr {
  const g = groupOf(w as Expr);
  if (g) return { [g[0]]: g[1].map((k) => (typeof k === 'boolean' ? k : withMe(k as Where, me))) } as Expr;
  const leaf = w as Record<string, unknown>;
  const field = leaf.field as string;
  if (leaf.is === ME) return me.length === 0 ? false : me.length === 1 ? { field, is: me[0] } : { field, in: [...me] };
  if (leaf.has === ME) return me.length === 0 ? false : { any: me.map((m) => ({ field, has: m })) };
  if (Array.isArray(leaf.in) && leaf.in.includes(ME)) {
    const vals = [...leaf.in.filter((x) => x !== ME), ...me];
    return vals.length === 0 ? false : { field, in: vals };
  }
  return w;
}

type Cover = { cond: Expr; only?: readonly Cap[] };

/**
 * What a target reaches on one list: TRUE, FALSE or a condition, and on the projects list for a project share, at most
 * view. Broad targets (the record, money lists) never reach Keys, People or an owner-only list; naming one does.
 */
function coverOf(t: Target, l: CatalogList, me: readonly string[]): Cover {
  /* A PERSONAL LIST IS COVERED BY NOTHING, a target naming it included: a share, a project and a key's narrowing alike. */
  if (l.personal === true) return { cond: false };
  if ('record' in t) return { cond: !isGated(l) };
  if ('project' in t) {
    if (l.role === 'projects') return { cond: { field: 'id', is: t.project }, only: RUNG_CAPS.view };
    if (t.lists ? !t.lists.includes(l.id) : isGated(l)) return { cond: false };
    const sf = scopeField(l);
    if (!sf) return { cond: false };
    return { cond: sf.scope?.links === true ? { field: sf.id, has: t.project } : { field: sf.id, is: t.project } };
  }
  if ('lists' in t) {
    const ls = t.lists;
    if (Array.isArray(ls)) return { cond: ls.includes(l.id) };
    if ('has' in ls) return { cond: hasMoney(l) && !isGated(l) };
    return { cond: l.role === ls.role };
  }
  if (t.list !== l.id) return { cond: false };
  if ('rows' in t) return { cond: { field: 'id', in: [...t.rows] } };
  return { cond: withMe(t.where, me) };
}

/** Whether a target reaches any row of one list at all, a condition counting as reaching it (`shares.ts`, a new list). */
export const targetReaches = (t: Target, l: CatalogList): boolean => coverOf(t, l, [ME]).cond !== false;

/** Whether a target reaches every row of one list, with no condition (an onward share may name that list whole). */
export const targetWhole = (t: Target, l: CatalogList): boolean => coverOf(t, l, [ME]).cond === true;

/** Whether a well-formed condition on this list still compiles against what the list has now. */
function compiles(t: Target, l: CatalogList): boolean {
  if (!('where' in t) || t.list !== l.id) return true;
  const schema = schemaOf(l);
  return leavesOf(t.where).every((leaf) => leafFault(leaf, l, schema) === null);
}

/** The capabilities a share grants (an allow) or takes away (a deny). */
function capsOf(s: Share): readonly Cap[] {
  const c = s.caps ?? {};
  if (s.effect === 'allow') {
    let out = [...RUNG_CAPS[s.can]];
    if (c.history === false) out = out.filter((x) => x !== 'history');
    if (c.delete === false) out = out.filter((x) => x !== 'delete');
    if (c.create === true && !out.includes('append')) out.push('append');
    return out;
  }
  /* A DENY WITH NO CAPS DENIES ALL, and `agents` or `onward` alone are not caps that narrow it. With history, delete or
     create named it holds the grantee to at most its rung, less the switches it turns on. */
  if (!('history' in c || 'delete' in c || 'create' in c)) return CAPS;
  const out = new Set<Cap>(ABOVE[s.can]);
  if (c.history === true) out.add('history');
  if (c.delete === true) out.add('delete');
  if (c.create === true) out.add('append');
  return [...out];
}

function hiddenOf(h: Hide | undefined, l: CatalogList): string[] {
  if (!h) return [];
  const title = new Set(l.fields.filter((f) => f.title).map((f) => f.id));
  const named = 'types' in h && Array.isArray(h.types) ? l.fields.filter((f) => !f.retired && f.type === 'money').map((f) => f.id) : ((h as Record<string, string[]>)[l.id] ?? []);
  return named.filter((f) => !title.has(f));
}

/** Why a token's narrowing is not a target or a share by id, by shape alone, or `null`. */
export function narrowFault(n: unknown): string | null {
  if (isObj(n) && Object.keys(n).join() === 'share') return isText(n.share) ? null : 'A narrowing by share names its id.';
  return targetFault(n);
}

/* ---------------------------------------------------------------------------------------------------------- lensOf */

const toWhere = (p: Pred): Where | null => (typeof p === 'boolean' ? null : p);
const same = (a: Pred, b: Pred): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * What one caller holds right now (§2.4), or `null` for nothing at all: suspended, or anything handed in malformed.
 *
 * `tz` is the record's time zone, for weekly hours. `nowMs` is the record's clock.
 */
export function lensOf(sources: LensSources, catalog: Catalog, nowMs: number, tz = 'UTC'): Lens | null {
  try {
    return lensOrThrow(sources, catalog, nowMs, tz);
  } catch {
    return null;
  }
}

function lensOrThrow(sources: LensSources, catalog: Catalog, nowMs: number, tz: string): Lens | null {
  if (!isObj(sources) || !isObj(catalog) || !Array.isArray(catalog.lists) || !Number.isFinite(nowMs)) return null;
  if (!isText(sources.person) || sources.suspended === true) return null;
  const role = sources.role;
  if (role !== null && !(role in RANK)) return null;
  wall(nowMs, tz); // an unknown zone throws, and the lens is none
  for (const l of catalog.lists) if (!isObj(l) || !isText(l.id) || !Array.isArray(l.fields)) return null;
  const me = sources.me ?? [];
  if (!Array.isArray(me) || !me.every(isText)) return null;
  const token = sources.token ?? null;
  if (token !== null && (!isObj(token) || (token.narrow !== null && narrowFault(token.narrow) !== null))) return null;
  const chain: Narrow[] = token === null ? [] : [...(token.narrow === null ? [] : [token.narrow]), ...(token.narrows ?? [])];
  if (token !== null && token.narrows !== undefined && (!Array.isArray(token.narrows) || token.narrows.some((n) => narrowFault(n) !== null))) return null;
  const epoch = sources.epoch ?? 0;
  if (!Number.isInteger(epoch)) return null;
  if (!Array.isArray(sources.shares)) return null;
  const owner = role === 'owner';
  if (!owner) {
    for (const s of sources.shares) {
      if (shareFault(s) !== null || !isText(s.id)) return null;
      if (s.first_used_at && !isInstant(s.first_used_at)) return null;
    }
    for (const r of sources.lists ?? []) if (!isObj(r) || !isText(r.register) || !(r.level in RANK)) return null;
  }

  /* THE TOKEN'S NARROWING, one condition per list per link of its chain, ANDed into everything. */
  const narrowOne = (n: Narrow, l: CatalogList): Expr => {
    if ('share' in n) {
      const s = sources.shares.find((x) => x.id === n.share && x.effect === 'allow');
      return s ? (compiles(s.what, l) ? coverOf(s.what, l, me).cond : false) : false;
    }
    return compiles(n, l) ? coverOf(n, l, me).cond : false;
  };
  /* A CHILD KEY REACHES NO PERSONAL LIST, narrowed or not: a narrowing never covers one (`coverOf`), and nor does none. */
  const unnarrowed = (l: CatalogList): Expr => token?.child !== true || l.personal !== true;
  const narrowOn = (l: CatalogList): Expr => (chain.length === 0 ? unnarrowed(l) : chain.length === 1 ? narrowOne(chain[0]!, l) : { all: chain.map((n) => narrowOne(n, l)) });

  const pred = Object.fromEntries(CAPS.map((c) => [c, {} as Record<string, Pred>])) as Record<Cap, Record<string, Pred>>;
  const hides: Record<string, string[]> = {};
  const via = new Set<string>();
  const stale = new Set<string>();

  const all = owner ? [] : sources.shares;
  /* AN AGENT DOES NOT CARRY AN ALLOW ITS PERSON SWITCHED AGENTS OFF FOR. A deny always comes along. */
  const carried = all.filter((s) => token === null || s.effect === 'deny' || s.caps?.agents !== false);
  const live = carried.filter((s) => activeAt(s, nowMs, tz));

  for (const l of catalog.lists) {
    const narrow = narrowOn(l);
    if (owner) {
      for (const c of CAPS) pred[c][l.id] = fold(narrow);
      continue;
    }
    /* A MEMBER ROW NAMING A PERSONAL LIST IS READ AS NO ROW: `invite` refuses one, and one written by hand opens nothing. */
    const legacy = l.personal === true ? undefined : (sources.lists ?? []).find((r) => r.register === l.id);
    const base: { level: Level; cond: Expr } | null = legacy
      ? { level: legacy.level, cond: legacyCond(legacy.where) }
      : role !== null && roleReaches(role, l)
        ? { level: role, cond: true }
        : null;

    const allows: Record<Cap, Expr[]> = Object.fromEntries(CAPS.map((c) => [c, [] as Expr[]])) as Record<Cap, Expr[]>;
    const denies: Record<Cap, Expr[]> = Object.fromEntries(CAPS.map((c) => [c, [] as Expr[]])) as Record<Cap, Expr[]>;
    if (base) for (const c of LEVEL_CAPS[base.level]) allows[c].push(base.cond);
    const hidden = new Set<string>();
    for (const s of live) {
      /* "NO MONEY" ON THE PROJECTS LIST HIDES ITS AMOUNTS, AND NEVER THE PROJECT (collab pass, 2 Nov). The projects list
         carries a money field or two (earned in a year), so the Contractor and Assistant templates' deny of every list
         with money took the project row itself away: a contractor shared Kiln could edit Kiln's tasks and was told "No
         page called kiln-website", and an Assistant on everything but money had no projects at all. A deny of money
         lists is read on that list as its money fields hidden, which is what "No money" says. */
      if (s.effect === 'deny' && l.role === 'projects' && isMoneyDeny(s.what)) {
        for (const f of l.fields) if (!f.retired && f.type === 'money') hidden.add(f.id);
        continue;
      }
      const cover = coverOf(s.what, l, me);
      if (cover.cond === false) continue;
      let cond: Expr = cover.cond;
      if (!compiles(s.what, l)) {
        stale.add(s.id);
        /* FAILS CLOSED: an allow that no longer compiles reaches no row, and a deny every row. */
        cond = s.effect === 'deny';
        if (cond === false) continue;
      }
      via.add(s.id);
      const caps = capsOf(s).filter((c) => !cover.only || cover.only.includes(c) || s.effect === 'deny');
      for (const c of caps) (s.effect === 'allow' ? allows : denies)[c].push(cond);
      for (const f of hiddenOf(s.hide, l)) hidden.add(f);
    }
    const p = {} as Record<Cap, Pred>;
    for (const c of CAPS) p[c] = fold({ all: [{ any: allows[c] }, { none: denies[c] }, narrow] });
    /* YOU CAN'T CHANGE, DELETE, COMMENT ON OR LOOK BACK AT WHAT YOU CAN'T SEE. */
    for (const c of ['write', 'delete', 'history', 'propose'] as const) p[c] = fold({ all: [p[c], p.read] });
    for (const c of CAPS) pred[c][l.id] = p[c];
    if (hidden.size && CAPS.some((c) => p[c] !== false)) hides[l.id] = [...hidden].sort();
  }

  const edges = carried.map((s) => nextEdge(s, nowMs, tz)).filter((t): t is number => t !== null);
  const until = edges.length ? new Date(Math.min(...edges)).toISOString() : null;
  const lens: Omit<Lens, 'ctx'> = { owner, pred, hides, until, via: [...via].sort(), stale: [...stale].sort() };
  return { ...lens, ctx: ctxOf(lens, sources, catalog, live) };
}

/** The lens as the fields every reader already honours (§2.4's table), a superset of today's ctx. */
function ctxOf(lens: Omit<Lens, 'ctx'>, sources: LensSources, catalog: Catalog, live: HeldShare[]): LensCtx {
  const role = sources.role;
  const { pred } = lens;
  const top = (l: string): LensLevel | null =>
    pred.write[l] !== false ? 'write' : pred.propose[l] !== false ? 'comment' : pred.read[l] !== false ? 'read' : pred.append[l] !== false ? 'append' : null;

  let level: LensLevel | null = role;
  if (role === null) {
    const whole = live.filter((s) => s.effect === 'allow' && 'record' in s.what).map((s) => s.can);
    level = whole.some((c) => c === 'edit' || c === 'manage') ? 'write' : whole.includes('comment') ? 'comment' : whole.includes('view') ? 'read' : null;
  }

  const reached = catalog.lists.filter((l) => CAPS.some((c) => pred[c][l.id] !== false)).map((l) => l.id);
  const whole =
    lens.owner
      ? catalog.lists.every((l) => CAPS.every((c) => pred[c][l.id] === true))
      : role !== null &&
        catalog.lists.every((l) => (roleReaches(role, l) ? LEVEL_CAPS[role].every((c) => pred[c][l.id] === true) : CAPS.every((c) => pred[c][l.id] === false)));
  /* A ROLE THAT STILL REACHES EVERY LIST KEEPS THE WHOLE RECORD AS ITS CEILING, as it did with only member rows: a member
     with a legacy row or a share on one list is held there by `levels` and `wheres`, never by a ceiling naming every
     list, which a list installed tomorrow would fall outside. */
  const ceiling = whole || (role !== null && !lens.owner && reached.length === catalog.lists.length);
  const ctx: LensCtx = {
    level,
    registers: ceiling ? null : reached,
    levels: {},
    wheres: {},
    writes: {},
    hides: lens.hides,
    nots: {},
    grant: { epoch: sources.epoch ?? 0, until: lens.until, via: lens.via, agents: live.some((s) => s.effect === 'allow' && s.caps?.agents !== false) },
  };
  if (lens.owner) {
    for (const l of reached) {
      const w = toWhere(pred.read[l]!);
      if (w) ctx.wheres[l] = w;
    }
    return ctx;
  }
  const byId = new Map(catalog.lists.map((x) => [x.id, x]));
  for (const l of reached) {
    /* A LEVEL ONLY WHERE THE LIST DIFFERS FROM WHAT THE ROLE GIVES, so an Admin's lists carry none. A list the role does
       not reach on its own (a kernel list) always carries its level, because a grant naming it is what lets a reader in. */
    const own = role !== null ? roleReaches(role, byId.get(l)!) : level !== null && !isGated(byId.get(l)!);
    const asRole = role !== null && own && CAPS.every((c) => (pred[c][l] !== false) === LEVEL_CAPS[role!].includes(c));
    /* A LEGACY ROW NO SHARE CHANGED KEEPS ITS OWN LEVEL, `decide` included, which the ladder of predicates cannot say. */
    const legacy = (sources.lists ?? []).find((r) => r.register === l);
    const asLegacy = legacy !== undefined && CAPS.every((c) => (pred[c][l] !== false) === LEVEL_CAPS[legacy.level].includes(c));
    const t = asLegacy ? legacy.level : top(l);
    if (t !== null && (!own || (t !== level && (asLegacy ? legacy.level !== role : !asRole)))) ctx.levels[l] = t;
    const r = pred.read[l]!;
    const w = toWhere(r);
    if (w) ctx.wheres[l] = w;
    const wr = pred.write[l]!;
    if (wr !== false && !same(wr, r)) {
      const ww = toWhere(wr);
      if (ww) ctx.writes[l] = ww;
    }
    const nots: ('history' | 'delete')[] = [];
    if (r !== false && pred.history[l] === false) nots.push('history');
    if (wr !== false && pred.delete[l] === false) nots.push('delete');
    if (nots.length) ctx.nots[l] = nots;
  }
  return ctx;
}

/* -------------------------------------------------------------------------------------------------------- via (§2.10) */

/**
 * What ONE allow reaches on one list for one capability, as a condition, TRUE, or FALSE: the share's own part of the
 * lens, for the audit's `via` (which share admitted a write or a read). A deny, a share whose condition no longer
 * compiles, and a capability its rung or its switches leave out reach nothing. The caller has asked whether it is active.
 */
export function shareReach(s: HeldShare, l: CatalogList, cap: Cap, me: readonly string[]): Pred {
  if (s.effect !== 'allow' || !compiles(s.what, l)) return false;
  const cover = coverOf(s.what, l, me);
  if (cover.cond === false) return false;
  const caps = capsOf(s).filter((c) => !cover.only || cover.only.includes(c));
  return caps.includes(cap) ? fold(cover.cond) : false;
}

/* ------------------------------------------------------------------------------------------------------ gate fields */

/**
 * The fields of a list a conditional writer may not change (§2.6): every field named by an active share condition on
 * it, anybody's, and its scope field when a project share covers it. Kernel columns nobody writes are left out.
 */
export function gateFields(shares: readonly HeldShare[], catalog: Catalog, list: string, nowMs: number, tz = 'UTC'): string[] {
  const l = catalog.lists.find((x) => x.id === list);
  if (!l) return [];
  const out = new Set<string>();
  for (const s of shares) {
    if (shareFault(s) !== null || !activeAt(s, nowMs, tz)) continue;
    const t = s.what;
    if ('where' in t && t.list === list) for (const leaf of leavesOf(t.where)) out.add(leaf.field as string);
    if ('project' in t && coverOf(t, l, []).cond !== false) {
      if (l.role === 'projects') continue;
      const sf = scopeField(l);
      if (sf) out.add(sf.id);
    }
  }
  for (const k of ['id', 'seq', 'created_at', 'updated_at']) out.delete(k);
  return [...out].sort();
}

/* ------------------------------------------------------------------------------------------------------ checkShare */

export type CheckOpts = {
  /** The record's owners, by person id: a share never targets one. */
  owners?: readonly string[];
  /** The grantee's other live shares, theirs and their groups', for the parameter budget. */
  others?: readonly Share[];
  /** The kernel's own reading of a rule against a list (`MemberDeps.readsRule`), when there is one. */
  readsRule?: (list: string, where: Json) => Refusal | null;
};

const refuse = (code: string, fix: string, at: string): Refusal => ({ code, fix, at });

/** The SQL parameters a share's condition costs on one list. Rows compile to one `json_each`, and so does `$me`. */
export function paramsOn(s: Share, l: CatalogList): number {
  const cover = coverOf(s.what, l, [ME]);
  if (typeof cover.cond === 'boolean') return 0;
  return paramsOf(cover.cond as Where, l);
}

/** The SQL parameters a condition costs on one list, compiled as a reader would compile it. */
export function paramsOf(w: Where, l: CatalogList): number {
  const schema = schemaOf(l);
  let n = 0;
  for (const leaf of leavesOf(w)) {
    if ((leaf.field === 'id' && Array.isArray(leaf.in)) || leaf.is === ME || leaf.has === ME || (Array.isArray(leaf.in) && leaf.in.includes(ME))) {
      n += 1;
      continue;
    }
    n += compile(leaf as Where, schema).params.length;
  }
  return n;
}

/**
 * Why a share cannot be saved, or `null` when it can (§2.3). Its shape is the grammar's; every list and row it names is
 * one the record has; a condition names declared, live, stored fields with an operator their type takes; the
 * grantee's shares together cost at most `PARAMS_MAX` parameters on any list; and it never targets an owner, never
 * gives `manage` on the whole record, and never shares by link yet.
 */
export function checkShare(share: Share, catalog: Catalog, opts: CheckOpts = {}): Refusal | null {
  const shape = shareFault(share);
  if (shape) return refuse('VALUE_MALFORMED', shape.fix, shape.at);
  const lists = new Map(catalog.lists.map((l) => [l.id, l]));
  const listOf = (id: string, at: string): CatalogList | Refusal => lists.get(id) ?? refuse('REGISTER_UNKNOWN', `There is no list called ${id}.`, at);
  const isRefusal = (x: unknown): x is Refusal => isObj(x) && typeof x.code === 'string' && typeof x.fix === 'string';
  /* A SHARE NEVER NAMES A PERSONAL LIST: it would reach nothing there, and saving it would tell its maker it did. */
  const personal = (l: CatalogList, at: string): Refusal | null =>
    l.personal === true ? refuse('FORBIDDEN', `${l.name} is personal: only the owner reads it, so it can't be shared.`, at) : null;

  if (share.who.kind === 'person' && (opts.owners ?? []).includes(share.who.id))
    return refuse('FORBIDDEN', 'An owner already sees everything. Share with someone else.', 'who');
  if (share.who.kind === 'link') return refuse('FORBIDDEN', 'Sharing by link is not on yet. Share with a person or a group.', 'who');
  if (share.who.kind === 'email' && (!share.who.id.includes('@') || share.who.id !== share.who.id.toLowerCase()))
    return refuse('VALUE_MALFORMED', 'An email is a lower-case address.', 'who');
  if (share.effect === 'allow' && share.can === 'manage' && 'record' in share.what)
    return refuse('FORBIDDEN', 'To let someone manage all of this BrainDog, make them an Admin.', 'can');
  if (share.caps?.onward === true && share.can !== 'manage') return refuse('VALUE_MALFORMED', 'Only someone who manages a share can share it on.', 'caps.onward');

  const t = share.what;
  if ('lists' in t && Array.isArray(t.lists) && !('project' in t))
    for (const [i, id] of t.lists.entries()) {
      const l = listOf(id, `what.lists.${i}`);
      if (isRefusal(l)) return l;
      const kept = personal(l, `what.lists.${i}`);
      if (kept) return kept;
    }
  if ('project' in t) {
    if (!catalog.lists.some((l) => l.role === 'projects')) return refuse('REGISTER_UNKNOWN', 'This BrainDog has no projects list.', 'what.project');
    for (const [i, id] of (t.lists ?? []).entries()) {
      const l = listOf(id, `what.lists.${i}`);
      if (isRefusal(l)) return l;
      const kept = personal(l, `what.lists.${i}`);
      if (kept) return kept;
      if (!scopeField(l)) return refuse('VALUE_MALFORMED', `${l.name} has no project field, so it can't be shared by project.`, `what.lists.${i}`);
    }
  }
  if ('list' in t) {
    const l = listOf(t.list, 'what.list');
    if (isRefusal(l)) return l;
    const kept = personal(l, 'what.list');
    if (kept) return kept;
    if ('where' in t) {
      const schema = schemaOf(l);
      for (const leaf of leavesOf(t.where)) {
        const bad = leafFault(leaf, l, schema);
        if (bad) return { ...bad, at: `what.where.${bad.at ?? leaf.field}` };
      }
      const said = opts.readsRule?.(t.list, t.where as Json) ?? null;
      if (said) return { ...said, at: 'what.where' };
    }
  }
  if (share.hide && !('types' in share.hide))
    for (const [id, fields] of Object.entries(share.hide)) {
      const l = listOf(id, `hide.${id}`);
      if (isRefusal(l)) return l;
      for (const f of fields as string[]) {
        const field = l.fields.find((x) => x.id === f && !x.retired);
        if (!field) return refuse('FIELD_UNKNOWN', `${l.name} has no field called ${f}.`, `hide.${id}`);
        if (field.title) return refuse('VALUE_MALFORMED', `The title of ${l.name} can't be hidden.`, `hide.${id}`);
      }
    }

  /* THE PARAMETER BUDGET, per list, over every share the grantee will hold. */
  for (const l of catalog.lists) {
    const mine = paramsOn(share, l);
    if (mine === 0) continue;
    const total = mine + (opts.others ?? []).filter((o) => shareFault(o) === null).reduce((n, o) => n + paramsOn(o, l), 0);
    if (total > PARAMS_MAX)
      return refuse('OUT_OF_BOUNDS', `Their shares on ${l.name} test too much at once (${total} values, at most ${PARAMS_MAX}). Combine some of them.`, 'what');
  }
  return null;
}
