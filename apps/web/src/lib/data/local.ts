/**
 * The local copy: what this person may read of this record, kept in the browser, so a screen draws at once on open.
 *
 * HOW IT STAYS CORRECT.
 * - ONE OWNER AT A TIME: a record, a person, the scope boot gave them and this build. Any other owner, or the record's
 *   own format moving, wipes it before anything is drawn or kept.
 * - A CURSOR IN THE RECORD'S CHANGE LOG, taken BEFORE the first answer is kept. On open and on every move the version
 *   poll hears, the copy asks `whatsNew({ cursor, everything })` for the lines since, and drops every answer read from
 *   a list a line touched. A line it cannot place (a declaration, an access change, a restore, a setup folded into one
 *   line, a kind it does not know), a capped walk or a refused cursor drops everything.
 * - AN ANSWER IS KEPT ONLY IF NO CATCH-UP DROPPED ANYTHING WHILE IT WAS OUT (`ticket`), so one read before a change it
 *   never saw cannot land after the change was applied. Kept answers may be newer than the cursor, never older.
 * - A KEPT ANSWER IS ONLY `current` once this tab has caught up to the newest version it heard, on the day it was kept;
 *   otherwise it is drawn marked possibly-stale and the record is asked behind it.
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

/** One kept answer. `lists` are the lists it was read from; `decls` their declarations, for a tab that has not learnt them. */
export type Stored = { at: string; name: string; key: string; lists: string[]; decls: Record<string, unknown>; value: unknown; kept: number };

/** Where the copy lives. Every method may reject: the copy then behaves as if empty. */
export type Store = {
  meta(): Promise<Meta | null>;
  setMeta(meta: Meta): Promise<void>;
  get(at: string): Promise<Stored | null>;
  put(row: Stored): Promise<void>;
  /** Drop every answer read from any of `lists`, or every answer when `lists` is `null`. Meta stays. */
  drop(lists: ReadonlySet<string> | null): Promise<void>;
  /** Keep the newest `most`. */
  prune(most: number): Promise<void>;
  /** Everything, meta included. */
  clear(): Promise<void>;
};

/** One line of the log as much as the copy reads of it (`EventLine` in `@braindog/client`). */
export type Line = { id: string; kind: string; register: string | null; rowid?: number; steps?: Line[] };

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
  'decide', 'supersede', 'suggest', 'resolve', 'predict', 'score',
  'grant.add', 'grant.read', 'grant.rotate', 'grant.revoke', 'grant.bind',
  'arrive', 'match', 'extract', 'propose', 'pull',
  'export',
]);

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
  if (decls[lists[0]!] === undefined) return false;
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
  /** Keep an answer, if no catch-up dropped anything since `ticket` and it may be kept. `true` when it was. */
  put(name: string, key: string, lists: readonly string[], decls: Record<string, unknown>, value: unknown, ticket: number): Promise<boolean>;
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
      epoch += 1;
      await store.drop(hit.lists).catch(() => undefined);
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
      return { value: row.value as T, decls: row.decls, current: claimed !== null && caught === asked && sameDay(row.kept, t) };
    },
    ticket: () => epoch,
    async put(name, key, lists, decls, value, ticket) {
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
        await store.put({ at: atOf(name, key), name, key, lists: [...lists], decls: held, value: clean, kept: now() });
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
