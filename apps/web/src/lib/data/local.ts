/**
 * The local copy: what this person may read of this record, kept in the browser, so a screen draws at once on open.
 *
 * HOW IT STAYS CORRECT.
 * - ONE OWNER AT A TIME: a record, a person, the scope boot gave them and this build. Any other owner, or the record's
 *   own format moving, wipes it before anything is drawn or kept.
 * - A CURSOR IN THE RECORD'S CHANGE LOG, taken BEFORE the first answer is kept. On open and on every move the version
 *   poll hears, the copy asks `whatsNew({ cursor, everything })` for the lines since, and every answer read from a
 *   list a line touched is PATCHED IN PLACE or dropped (`patched`, below). A line it cannot place in the log at all (a
 *   declaration, an access change, a restore, a setup folded into one line, a kind it does not know), a capped walk or
 *   a refused cursor drops everything.
 * - AN ANSWER IS KEPT ONLY IF NO CATCH-UP CHANGED ANYTHING WHILE IT WAS OUT (`ticket`), so one read before a change it
 *   never saw cannot land after the change was applied. Kept answers may be newer than the cursor, never older.
 * - A KEPT ANSWER IS ONLY `current` once this tab has caught up to the newest version it heard, on the day it was kept;
 *   otherwise it is drawn marked possibly-stale and the record is asked behind it. An answer kept `always` is never
 *   current: it holds reads no line names (figures, the log itself), so it is only ever drawn while it is asked again.
 *
 * PATCHING, AND WHEN IT GIVES UP. An answer says where its rows are (`Spot`): the list, the path to its rows, and the
 * fields its question was asked by. A line is placed on a row by its number when it is an `edit`, `state`, `tag` or
 * `untag` of a plain field (text, a day, a number, an enum, a flag, a list of words), its value is not redacted, and
 * the field is not one the question filtered, sorted or counted by. A `note` changes no row. Each write placed moves the
 * row's `version` on by one, as the record's compare-and-set does, so a write from the patched row is not refused.
 * A line already in the answer (the value it set is there, not the one it replaced) is skipped, and changes nothing.
 * Anything else drops the answer, as before: a create, a delete, a link, a ref or a money field, a derived field, a
 * row the answer does not hold whose change could bring it in, a write half in the answer and half not. A list the
 * answer only names rows of is patched by nothing and dropped only when a line could change a name it shows.
 * The compare-and-set is the backstop: a version patched wrong is a refused write and a re-read, never a lost one.
 *
 * THE LAST READER, SIGNED (`local-mark.ts`). A live boot leaves a marker naming who read; a cold open before the shell
 * has claimed the copy, and a boot nobody answered (offline), draws only for that person, and only to read. Offline the
 * layout draws the last shell copy marked `offline` (or the refusal, where none is kept) with the error page's offline
 * line, and the screens below draw what the copy holds and keep it on screen through the record's UNREACHABLE.
 *
 * WHO DRAWS FROM IT. Work and a list's first page are patched and, when current, skip the record. Today, a row's page
 * (row, history, what points at it), declared pages (People, Money and the rest under `/p/`) and Needs you are kept
 * `always`: drawn at once, and asked again every time. Needs you and a row's page offer no write while they are the
 * copy's; anywhere else a write from a drawn copy meets the record's compare-and-set like any other. Anything drawn
 * from the copy and not yet answered holds up the quiet mark over the work (`copy-mark.svelte.ts`).
 *
 * WHAT IT NEVER STORES: a refusal; anything not a plain JSON value; a list whose declaration is unknown to this tab or
 * declares a `secret` field; the vault and the kernel's `session` list; any key named like a credential (`SECRET_KEY`).
 * It never stores a write either: writes always go to the record.
 *
 * PURE, AND NODE LOADS IT. The store is handed in (`local-db.ts` is the browser's IndexedDB, `memoryStore` a test's),
 * and so is the record's log, so `local.test.ts` drives every rule without a browser or a socket.
 */

/** Bump when what is stored changes shape: a copy of another format is wiped. */
export const LOCAL_FORMAT = 1;
/** How old a kept answer may be and still be drawn. A week, as the shell copy and the offline copy. */
export const LOCAL_MS = 7 * 24 * 3_600_000;
/** The most answers kept; past it the oldest go. */
export const LOCAL_MOST = 120;

/** Where the copy's reader stands in the log, as the record handed it: a rowid to an owner, an opaque string to others. */
export type Cursor = number | string;

/** Whose copy this is. `scope` is a fingerprint of what boot said they may read (`scopeOf`). */
export type Owner = { base: string; person: string; scope: string };

export type Meta = {
  format: number;
  /** The app build that wrote it. */
  build: string;
  owner: Owner;
  /** The record's own format, kernel and primitives as the poll last heard them; `null` until it has. */
  record: string | null;
  cursor: Cursor | null;
  /** The id of the line the cursor names: `whatsNew` answers it again, and it is not news. */
  cursorId: string | null;
};

/**
 * Where an answer holds rows of a list, so a line can be placed on them instead of dropping the answer.
 *
 * `at` is the path from the answer to an array of rows (`{ seq, fields, version }`). `by` is every field the question
 * was asked by, its filter, sort and counts, or `null` when a search or anything else means every field. `newest`: the
 * rows are in the record's own order, last changed first, so a placed write moves its row to the head. `moved` is the
 * path to a `{ [seq]: instant }` of when each row last changed, set from the line.
 */
export type Spot = { list: string; at: readonly (string | number)[]; by: readonly string[] | null; newest?: boolean; moved?: readonly (string | number)[] };

/**
 * One kept answer. `lists` are the lists it was read from; `decls` their declarations, for a tab that has not learnt
 * them; `spots` where its rows are, when it can be patched; `always` when it is never current (asked on every draw).
 */
export type Stored = {
  at: string;
  name: string;
  key: string;
  lists: string[];
  decls: Record<string, unknown>;
  value: unknown;
  kept: number;
  spots?: Spot[];
  always?: boolean;
};

/** Where the copy lives. Every method may reject: the copy then behaves as if empty. */
export type Store = {
  meta(): Promise<Meta | null>;
  setMeta(meta: Meta): Promise<void>;
  get(at: string): Promise<Stored | null>;
  put(row: Stored): Promise<void>;
  /** Drop every answer read from any of `lists`, or every answer when `lists` is `null`. Meta stays. */
  drop(lists: ReadonlySet<string> | null): Promise<void>;
  /** Hand every answer read from any of `lists` to `fn`, in one pass: what it returns replaces it, `null` drops it. */
  rewrite(lists: ReadonlySet<string>, fn: (row: Stored) => Stored | null): Promise<void>;
  /** Keep the newest `most`. */
  prune(most: number): Promise<void>;
  /** Everything, meta included. */
  clear(): Promise<void>;
};

/** One line of the log as much as the copy reads of it (`EventLine` in `@braindog/client`). */
export type Line = {
  id: string;
  kind: string;
  register: string | null;
  rowid?: number;
  steps?: Line[];
  ts?: string;
  seq?: number | null;
  field?: string | null;
  from?: unknown;
  to?: unknown;
  batch?: string | null;
};

type Said<T> = { ok: true; value: T } | { ok: false; refusal?: { code: string } } | { ok: false; conflict: unknown };

/** The two reads the copy asks the record. */
export type Log = {
  /** `whatsNew({ cursor, everything: true })`. */
  since(cursor: Cursor): Promise<Said<{ events: Line[]; upTo: Cursor | null; sinceCapped: boolean }>>;
  /** `recentHistory({ limit: 1, everything: true })`: the newest line this person is shown. */
  newest(): Promise<Said<{ events: Line[] }>>;
};

/** Lists never kept, whatever their declaration: the vault, and the kernel's own runs, which the sweep stamps. */
export const NEVER_KEPT: ReadonlySet<string> = new Set(['vault', 'session']);

/** A key named like a credential, compared with case and punctuation taken out, as `@braindog/declare`'s scrub does. */
export const SECRET_KEY = /^(?:[a-z0-9]*(?:token|secret|password|passphrase|apikey|credentials?)|bearer|authorization)$/u;

/** Row writes: they touch the list they name and nothing else. */
const ROW = new Set(['create', 'edit', 'state', 'link', 'tag', 'untag', 'delete', 'restore', 'purge', 'note']);
/** Lines that move no row a list answers: the row writes they cause are lines of their own. */
const QUIET = new Set([
  'grant.add', 'grant.read', 'grant.rotate', 'grant.revoke', 'grant.bind',
  'arrive', 'match', 'extract', 'pull',
  'export',
]);

/**
 * THE QUESTIONS WAITING ON SOMEBODY ARE NO LIST, and Today and Needs you hold them: these lines touch `QUESTIONS`, a
 * name no declared list can have, which an answer holding questions names among its lists.
 */
export const QUESTIONS = ':questions';
const ASKING = new Set(['decide', 'supersede', 'suggest', 'resolve', 'predict', 'score', 'propose']);

/** A name for what an answer holds that is not a declared list (`QUESTIONS`, a page's figures): it starts with a colon. */
export const isPseudo = (list: string): boolean => list.startsWith(':');

/** What a run of lines touched: the lists, or everything (`all`). */
export function touched(lines: readonly Line[], skip: string | null = null): { all: boolean; lists: Set<string> } {
  const lists = new Set<string>();
  const walk = (ls: readonly Line[]): boolean => {
    for (const l of ls) {
      if (l.id === skip) continue;
      /* A PASS OF BRAINDOG'S OWN UPDATE IS ONE LINE WITH ITS STEPS UNDER IT: the steps are what moved. */
      if (Array.isArray(l.steps) && l.steps.length > 0) {
        if (walk(l.steps)) return true;
        continue;
      }
      if (ROW.has(l.kind)) {
        if (l.register === null) return true;
        lists.add(l.register);
        continue;
      }
      if (ASKING.has(l.kind)) {
        lists.add(QUESTIONS);
        continue;
      }
      if (QUIET.has(l.kind)) continue;
      return true;
    }
    return false;
  };
  return walk(lines) ? { all: true, lists } : { all: false, lists };
}

/** A fingerprint of what boot says this person may read: a change of it is a change of what the copy may hold. */
export function scopeOf(me: { level: string; owner: boolean; lists: readonly string[] | null; levels?: Readonly<Record<string, string>> | undefined }): string {
  const levels = me.levels ? Object.entries(me.levels).sort(([a], [b]) => a.localeCompare(b)) : null;
  return JSON.stringify([me.level, me.owner, me.lists ? [...me.lists].sort() : null, levels]);
}

export const sameOwner = (a: Owner, b: Owner): boolean => a.base === b.base && a.person === b.person && a.scope === b.scope;

/** The cursor a line is pointed at by, said as the record says it: its rowid to whoever is handed one, else `e.<id>`. */
export const cursorAt = (line: Line): Cursor => (typeof line.rowid === 'number' ? line.rowid : `e.${line.id}`);

/** Whether a declaration holds a secret field. A list with one is never kept. */
const holdsSecret = (decl: unknown): boolean => {
  const fields = (decl as { fields?: unknown } | null)?.fields;
  if (!Array.isArray(fields)) return true;
  return fields.some((f) => (f as { type?: unknown })?.type === 'secret' || (f as { of?: unknown })?.of === 'secret');
};

/**
 * Whether an answer read from `lists` may be kept. The first list is the one whose rows it holds and must be declared
 * to this tab; the rest (lists it names rows of) are checked when their declaration is known.
 */
export function keepable(lists: readonly string[], decls: Record<string, unknown>): boolean {
  if (lists.length === 0) return false;
  if (lists.some((l) => NEVER_KEPT.has(l))) return false;
  /* A PSEUDO LIST FIRST holds no rows of a declared list, so there is no declaration to ask for. */
  if (!isPseudo(lists[0]!) && decls[lists[0]!] === undefined) return false;
  return lists.every((l) => decls[l] === undefined || !holdsSecret(decls[l]));
}

/**
 * A plain JSON copy of `value` with every credential-named key left out, or `undefined` when it holds anything that is
 * not plain JSON (a Map, a Date, a class), which the copy will not guess how to bring back.
 */
export function scrubbed(value: unknown): unknown {
  const bare = (k: string) => k.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');
  const BAD = Symbol('bad');
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : BAD;
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      for (const x of v) {
        const y = walk(x);
        if (y === BAD) return BAD;
        out.push(y);
      }
      return out;
    }
    if (typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (x === undefined) continue;
        if (SECRET_KEY.test(bare(k))) continue;
        const y = walk(x);
        if (y === BAD) return BAD;
        out[k] = y;
      }
      return out;
    }
    return BAD;
  };
  const out = walk(value);
  return out === BAD ? undefined : out;
}

/** What the kernel logs in place of a redacted value (`REDACTED` in `@braindog/kernel`): a line holding it cannot be placed. */
export const REDACTED = '--redacted--';

/** The lines since the cursor, oldest first, a pass's steps in their place, the cursor's own line left out. */
export function inOrder(lines: readonly Line[], skip: string | null = null): Line[] {
  const out: Line[] = [];
  const walk = (ls: readonly Line[]): void => {
    for (const l of ls) {
      if (l.id === skip) continue;
      if (Array.isArray(l.steps) && l.steps.length > 0) walk(l.steps);
      else out.push(l);
    }
  };
  walk(lines);
  return out.reverse();
}

/** The lists one line touches, as `touched` reads them; `null` when it touches what no list can say. */
function linesLists(l: Line): string[] | null {
  if (ROW.has(l.kind)) return l.register === null ? null : [l.register];
  if (ASKING.has(l.kind)) return [QUESTIONS];
  return QUIET.has(l.kind) ? [] : null;
}

type FieldLike = { id?: unknown; type?: unknown; of?: unknown; derive?: unknown; derived?: unknown };
const fieldsOf = (decl: unknown): FieldLike[] => {
  const fs = (decl as { fields?: unknown } | null)?.fields;
  return Array.isArray(fs) ? (fs as FieldLike[]) : [];
};

/** Field types whose logged value is the value a row holds, untouched by any lookup. */
const PLAIN = new Set(['text', 'day', 'instant', 'int', 'decimal', 'enum', 'bool', 'duration', 'url', 'email']);

/**
 * How a line's field is placed on a row: its value, its words added or taken (`tags`), or `null` when it cannot be. A
 * list with a derived field cannot be patched at all, since a write there moves a value no line says.
 */
function placing(decl: unknown, field: string): 'value' | 'tags' | null {
  const fs = fieldsOf(decl);
  if (fs.some((f) => f.derive !== undefined || f.derived === true)) return null;
  const f = fs.find((x) => x.id === field);
  if (!f) return null;
  if (f.type === 'list') return f.of === 'text' ? 'tags' : null;
  return typeof f.type === 'string' && PLAIN.has(f.type) ? 'value' : null;
}

/** The fields whose values a row's name is drawn from: its title and its mark. */
function nameFields(decl: unknown): Set<string> {
  const d = decl as { title?: unknown; identity?: { mark?: unknown; accent?: unknown } } | null;
  return new Set([d?.title, d?.identity?.mark, d?.identity?.accent].filter((x): x is string => typeof x === 'string'));
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const VALUES = new Set(['edit', 'state', 'tag', 'untag']);

type Row = { seq: number; fields: Record<string, unknown>; version: number };
const isRow = (r: unknown): r is Row =>
  typeof r === 'object' && r !== null && typeof (r as Row).seq === 'number' && typeof (r as Row).fields === 'object' && (r as Row).fields !== null;

/** The value at `path` inside `v`, or `undefined`. */
function dig(v: unknown, path: readonly (string | number)[]): unknown {
  let at = v;
  for (const k of path) {
    if (typeof at !== 'object' || at === null) return undefined;
    at = (at as Record<string | number, unknown>)[k];
  }
  return at;
}

/**
 * `row`'s answer with `lines` (oldest first, as `inOrder` gives them) placed on it, or `undefined` when one cannot be
 * placed and the answer must go. The rules are the design note's, top of this file. Lines about lists the answer was
 * not read from are not its business and pass by.
 */
export function patched(row: Stored, lines: readonly Line[]): unknown {
  const spots = row.spots ?? [];
  const value: unknown = structuredClone(row.value);
  /* Each write on a row is one `version`: placed once, or found already in. A write that is both is not one answer's. */
  const writes = new Map<string, 'placed' | 'in'>();

  for (const l of lines) {
    const lists = linesLists(l);
    if (lists === null) return undefined;
    const mine = lists.filter((x) => row.lists.includes(x));
    if (mine.length === 0) continue;
    if (mine.some(isPseudo)) return undefined;
    const list = mine[0]!;
    const decl = row.decls[list];
    if (decl === undefined) return undefined;
    const held = spots.filter((s) => s.list === list);

    /* A LIST THE ANSWER ONLY NAMES ROWS OF: nothing on it is patched, and only a name it might show is news. */
    if (held.length === 0) {
      if (l.kind === 'note') continue;
      if (!VALUES.has(l.kind) || typeof l.field !== 'string' || nameFields(decl).has(l.field)) return undefined;
      continue;
    }

    if (l.kind === 'note') continue;
    if (!VALUES.has(l.kind) || typeof l.seq !== 'number' || typeof l.field !== 'string') return undefined;
    const how = placing(decl, l.field);
    if (how === null) return undefined;
    if ((how === 'value') !== (l.kind === 'edit' || l.kind === 'state')) return undefined;
    const set = l.kind === 'tag' ? l.to : l.kind === 'untag' ? l.from : l.to;
    if (set === undefined || set === REDACTED || l.from === REDACTED) return undefined;

    for (const spot of held) {
      const rows = dig(value, spot.at);
      if (!Array.isArray(rows)) return undefined;
      const at = rows.findIndex((r) => isRow(r) && r.seq === l.seq);
      const asked = spot.by === null || spot.by.includes(l.field);
      /* A ROW THE ANSWER DOES NOT HOLD stays out of it, unless the field could bring it in or move it to the head. */
      if (at === -1) {
        if (asked || spot.newest) return undefined;
        continue;
      }
      if (asked) return undefined;
      const r = rows[at] as Row;
      const now = r.fields[l.field];
      let did: 'placed' | 'in';
      if (how === 'value') {
        if (same(now, l.to)) did = 'in';
        else if (same(now, l.from)) {
          r.fields[l.field] = l.to;
          did = 'placed';
        } else return undefined;
      } else {
        const words = Array.isArray(now) ? now.map(String) : now === undefined || now === null ? [] : null;
        if (words === null || typeof set !== 'string') return undefined;
        const has = words.includes(set);
        if (l.kind === 'tag' ? has : !has) did = 'in';
        else {
          r.fields[l.field] = l.kind === 'tag' ? [...words, set] : words.filter((w) => w !== set);
          did = 'placed';
        }
      }
      const write = `${spot.at.join('.')} ${l.seq} ${l.batch ?? l.id}`;
      const was = writes.get(write);
      if (was !== undefined && was !== did) return undefined;
      if (was === undefined) {
        writes.set(write, did);
        if (did === 'placed' && typeof r.version === 'number') r.version += 1;
      }
      if (did === 'placed') {
        if (spot.newest && at > 0) rows.unshift(...rows.splice(at, 1));
        const moved = spot.moved ? dig(value, spot.moved) : undefined;
        if (typeof moved === 'object' && moved !== null && typeof l.ts === 'string') (moved as Record<number, string>)[l.seq] = l.ts;
      }
    }
  }
  return value;
}

const sameDay = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString();

/** What a screen is handed back. `current`: caught up to the newest version heard, kept today. */
export type Near<T> = { value: T; decls: Record<string, unknown>; current: boolean };

export type LocalCopy = {
  /** This tab's reader, as a live boot names them. Wipes on any other owner; then catches up, or takes a cursor. */
  claim(owner: Owner): Promise<void>;
  /** The record's version moved: ask the log what changed. Serialised; a call while one is out runs once after it. */
  heard(): Promise<void>;
  /** The record's own format as the poll heard it. A different one drops every answer and takes a new cursor. */
  stamp(record: string): Promise<void>;
  /** The kept answer for `name` and `key`, if it belongs to `base` and to whoever this tab is (`person`, when known). */
  answer<T>(name: string, key: string, base: string, person: string | null): Promise<Near<T> | null>;
  /** The mark an answer is asked under: hand it to `put`. */
  ticket(): number;
  /** Keep an answer, if no catch-up changed anything since `ticket` and it may be kept. `true` when it was. */
  put(
    name: string,
    key: string,
    lists: readonly string[],
    decls: Record<string, unknown>,
    value: unknown,
    ticket: number,
    how?: { spots?: readonly Spot[]; always?: boolean },
  ): Promise<boolean>;
  /** Wipe everything: a sign-out, a refusal. */
  wipe(): Promise<void>;
};

const atOf = (name: string, key: string) => `${name} ${key}`;

export function localCopy(store: Store, log: (base: string) => Log, opts: { build: string; now?: () => number }): LocalCopy {
  const now = opts.now ?? Date.now;
  /* The owner this tab claimed, and the meta as last read or written. Nothing is kept before a claim in this tab. */
  let claimed: Owner | null = null;
  let meta: Meta | null = null;
  let loaded: Promise<Meta | null> | null = null;
  /* Moves on every drop, wipe and claim: an answer asked under an older one is not kept. */
  let epoch = 0;
  /* How many moves were heard, and how many the copy has caught up to. `current` needs the two equal. */
  let asked = 0;
  let caught = -1;
  let chain: Promise<void> = Promise.resolve();

  const load = (): Promise<Meta | null> =>
    (loaded ??= store.meta().then(
      (m) => (meta = m && m.format === LOCAL_FORMAT && m.build === opts.build ? m : null),
      () => null,
    ));

  const write = async (m: Meta): Promise<void> => {
    meta = m;
    loaded = Promise.resolve(m);
    await store.setMeta(m).catch(() => undefined);
  };

  const dropAll = async (): Promise<void> => {
    epoch += 1;
    await store.drop(null).catch(() => undefined);
  };

  /** Take the newest line as the cursor. With none to take, the copy keeps nothing. */
  const rebase = async (m: Meta): Promise<void> => {
    epoch += 1;
    const got = await log(m.owner.base).newest().catch(() => null);
    if (meta !== m) return;
    const line = got?.ok ? got.value.events[0] : undefined;
    const top = line?.steps?.[0] ?? line;
    await write({ ...m, cursor: top ? cursorAt(top) : null, cursorId: top?.id ?? null });
    /* AND AGAIN ONCE IT IS TAKEN: an answer asked while the newest line was being read may be older than it. */
    epoch += 1;
  };

  async function catchUp(mark: number): Promise<void> {
    const m = meta;
    if (claimed === null || m === null || !sameOwner(m.owner, claimed)) return;
    if (m.cursor === null) {
      await dropAll();
      await rebase(m);
      if (meta?.cursor !== null) caught = mark;
      return;
    }
    const got = await log(m.owner.base).since(m.cursor).catch(() => null);
    if (meta !== m) return;
    if (got === null || !got.ok) {
      /* A CURSOR THE RECORD WILL NOT TAKE (a restart past a sealed one, a restore, another reader) STARTS OVER. Offline
         is not that: the copy stays as it is, drawn possibly-stale, until the record answers. */
      if (got !== null && 'refusal' in got && got.refusal?.code === 'VALUE_MALFORMED') {
        await dropAll();
        await rebase(m);
      }
      return;
    }
    const { events, upTo, sinceCapped } = got.value;
    const hit = touched(events, m.cursorId);
    if (sinceCapped || hit.all) await dropAll();
    else if (hit.lists.size > 0) {
      /* EACH ANSWER THE LINES TOUCH IS PATCHED WHERE IT CAN BE, and dropped where it cannot (`patched`). */
      epoch += 1;
      const order = inOrder(events, m.cursorId);
      await store
        .rewrite(hit.lists, (row) => {
          const value = row.spots && row.spots.length > 0 ? patched(row, order) : undefined;
          return value === undefined ? null : { ...row, value };
        })
        .catch(() => store.drop(hit.lists).catch(() => undefined));
    }
    const top = events[0];
    if (top && meta === m) await write({ ...m, cursor: upTo ?? cursorAt(top), cursorId: top.id });
    caught = mark;
  }

  const queue = (fn: () => Promise<void>): Promise<void> => (chain = chain.then(fn, fn).catch(() => undefined));

  return {
    claim(owner) {
      return queue(async () => {
        const m = await load();
        if (claimed !== null && sameOwner(claimed, owner) && m !== null) return;
        claimed = owner;
        if (m === null || !sameOwner(m.owner, owner)) {
          epoch += 1;
          await store.clear().catch(() => undefined);
          await write({ format: LOCAL_FORMAT, build: opts.build, owner, record: null, cursor: null, cursorId: null });
        }
        asked += 1;
        await catchUp(asked);
      });
    },
    heard() {
      asked += 1;
      const mark = asked;
      return queue(() => (caught >= mark ? Promise.resolve() : catchUp(asked)));
    },
    stamp(record) {
      return queue(async () => {
        const m = meta ?? (await load());
        if (m === null || claimed === null || !sameOwner(m.owner, claimed) || m.record === record) return;
        const first = m.record === null;
        await write({ ...m, record });
        if (first) return;
        await dropAll();
        await rebase(meta!);
      });
    },
    async answer<T>(name: string, key: string, base: string, person: string | null): Promise<Near<T> | null> {
      const m = meta ?? (await load());
      if (m === null || m.owner.base !== base) return null;
      if (claimed !== null ? !sameOwner(m.owner, claimed) : person !== m.owner.person) return null;
      const row = await store.get(atOf(name, key)).catch(() => null);
      const t = now();
      if (row === null || t < row.kept || t - row.kept >= LOCAL_MS) return null;
      return { value: row.value as T, decls: row.decls, current: claimed !== null && !row.always && caught === asked && sameDay(row.kept, t) };
    },
    ticket: () => epoch,
    async put(name, key, lists, decls, value, ticket, how = {}) {
      const m = meta;
      if (ticket !== epoch || claimed === null || m === null || !sameOwner(m.owner, claimed) || m.cursor === null) return false;
      if (!keepable(lists, decls)) return false;
      const clean = scrubbed(value);
      if (clean === undefined) return false;
      const held: Record<string, unknown> = {};
      for (const l of lists) if (decls[l] !== undefined) held[l] = scrubbed(decls[l]);
      /* Checked again after the copy: a catch-up may have landed while the value was walked. */
      if (ticket !== epoch) return false;
      try {
        const spots = how.spots?.filter((s) => lists.includes(s.list)).map((s) => ({ ...s }));
        await store.put({
          at: atOf(name, key),
          name,
          key,
          lists: [...lists],
          decls: held,
          value: clean,
          kept: now(),
          ...(spots && spots.length > 0 ? { spots } : {}),
          ...(how.always ? { always: true } : {}),
        });
        await store.prune(LOCAL_MOST);
        return true;
      } catch {
        return false;
      }
    },
    wipe() {
      epoch += 1;
      claimed = null;
      meta = null;
      loaded = Promise.resolve(null);
      caught = -1;
      return queue(() => store.clear().catch(() => undefined));
    },
  };
}

/** A store in memory, for a test and for a browser with no IndexedDB (where it lasts as long as the tab). */
export function memoryStore(): Store & { rows: Map<string, Stored>; saved: Meta | null } {
  const rows = new Map<string, Stored>();
  const self = {
    rows,
    saved: null as Meta | null,
    meta: async () => self.saved,
    setMeta: async (m: Meta) => void (self.saved = structuredClone(m)),
    get: async (at: string) => rows.get(at) ?? null,
    put: async (r: Stored) => void rows.set(r.at, structuredClone(r)),
    drop: async (lists: ReadonlySet<string> | null) => {
      for (const [at, r] of rows) if (lists === null || r.lists.some((l) => lists.has(l))) rows.delete(at);
    },
    rewrite: async (lists: ReadonlySet<string>, fn: (row: Stored) => Stored | null) => {
      for (const [at, r] of rows) {
        if (!r.lists.some((l) => lists.has(l))) continue;
        const next = fn(structuredClone(r));
        if (next === null) rows.delete(at);
        else rows.set(at, structuredClone(next));
      }
    },
    prune: async (most: number) => {
      const old = [...rows.values()].sort((a, b) => a.kept - b.kept);
      for (const r of old.slice(0, Math.max(0, old.length - most))) rows.delete(r.at);
    },
    clear: async () => {
      rows.clear();
      self.saved = null;
    },
  };
  return self;
}
