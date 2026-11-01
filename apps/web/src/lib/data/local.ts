/**
 * The local copy: what this person may read of this record, kept in the browser, so a screen draws at once on open.
 *
 * HOW IT STAYS CORRECT.
 * - ONE OWNER AT A TIME: a record, a person and the scope boot gave them. Any other owner, or the record's own format
 *   moving, wipes it before anything is drawn or kept.
 * - A NEW BUILD KEEPS IT, AS DRAWN BEFORE AND NEVER AS CURRENT. A deploy wiped the copy, so the first open of every
 *   screen after one waited for the record as if nothing had ever been kept, on a day of several deploys. An answer
 *   another build kept is drawn at once and always asked again (`current` false), until this build keeps it anew.
 *   What is stored changing shape is `LOCAL_FORMAT`, which still wipes.
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
 * Anything else drops the answer, as before: a link, a ref or a money field, a derived field, a row the answer does not
 * hold whose change could bring it in, a write half in the answer and half not. A list the answer only names rows of
 * is patched by nothing and dropped only when a line could change a name it shows. An answer that reads more than it
 * can name (Today's money and reminders, a card's rows on Decide) lists `EVERY`: every catch-up hands it to the patch,
 * and a line on any list it holds no spot for drops it.
 * The compare-and-set is the backstop: a version patched wrong is a refused write and a re-read, never a lost one.
 *
 * CREATES AND DELETES, ONLY WHERE THE SPOT SAYS HOW (`Lands`). A spot that carries the question's filter as the
 * record's tree, its sort, and where its count, its pills' counts and its next page are, takes both:
 * - A DELETE takes its row out and its counts down by one. A row it does not hold is not news when every row the
 *   question answers is held, and drops the answer when there are more pages, or pills a filter does not narrow alike.
 * - A CREATE lands only when the browser can answer the question about it the way the record would: `@braindog/where`'s
 *   `evaluate` over the line's fields, and only for a filter of plain fields with literal values (no ref, no relative
 *   day, no hop, no search). A row it takes goes where the sort puts it (empties last, the newest first among equals,
 *   as the record breaks ties by id), or nowhere past a page boundary, and is counted either way. A row it does not
 *   take is not news when the filter is the whole question (`exact`), else the answer goes. A REF IS AN ID IN THE LOG
 *   AND A NUMBER ON SCREEN: it is drawn as the number of the row it points at when the answer holds that row's id
 *   (`Lands.ids`, the ids the list's ref walk read, `Names.ids`), and drops the answer when it does not. A redacted value
 *   drops it too, and so do pills over a narrowed question, which count rows the filter leaves out.
 * - A ROW IT TAKES SAYS WHO MADE IT: `by` is the line's actor, and it is `mine` when that is the person the copy is
 *   kept for (the reader boot named), so it is not drawn blank until the record answers. A run's actor is not `mine`
 *   here, since only the record can say whose token a run holds.
 * - A RESTORE (an Undo bringing a row back) carries no fields, so it lands only a row a delete this copy placed took
 *   out: kept beside the answer (`gone`, the last `GONE_MOST`), put back where the question puts it, one version on.
 *   A row deleted before the answer was kept drops it, as before.
 * - A create or a restore already in the answer is skipped. A create, delete or restore with no `Lands` drops it.
 *
 * THE QUESTIONS WAITING (`Asks`), on Today and Needs you, by their ids. AN ANSWER OR A WITHDRAWAL (`resolve`) takes its
 * card out and the count down; a decision (`decide`) adds nothing to wait on. Each drops instead where the browser cannot
 * say what follows: one the answer counts but does not draw would take the place (Today draws three), a page that also
 * draws what was decided (only a withdrawal decides nothing), counts over the cards it cannot move (Decide's `waiting`,
 * taken out), a card id named otherwise than the line names it. A question asked, reopened or replaced always drops it:
 * the browser can neither draw its card nor say where it ranks.
 *
 * ROWS A SCREEN DRAWS ITS OWN WAY (`Shown`), Today's tasks. A held row's drawn field takes the logged value (its title),
 * a field it neither draws nor was asked by moves only its version, and done or dropped takes it out of every read. A
 * row not held stays out. A create, a field the reads asked by (the day, the priority, the state otherwise, the
 * project), or a task leaving while a read came back at its limit (`full`) drops it.
 *
 * THE LAST READER, SIGNED (`local-mark.ts`). A live boot leaves a marker naming who read; a cold open before the shell
 * has claimed the copy, and a boot nobody answered (offline), draws only for that person, and only to read. Offline the
 * layout draws the last shell copy marked `offline` (or the refusal, where none is kept) with the error page's offline
 * line, and the screens below draw what the copy holds and keep it on screen through the record's UNREACHABLE. Where no
 * shell copy is kept, the rail is drawn from the copy itself (`railOf`): the lists its answers were read from, by name,
 * a count only where an unnarrowed list kept one, and the declared pages it holds where their nav put them.
 *
 * WHO DRAWS FROM IT. The classic Work screen and a list's first page are patched and, when current, skip the record.
 * A LIST IS KEPT WHOLE PAST ITS FIRST PAGE: when it is opened, the list unfiltered in its order is walked a page at a
 * time when the browser is idle (`walkWhole` in `kept-list.ts`), up to `LIST_ROWS_MOST` rows, under the ticket its
 * first page was asked with, and kept marked `whole` (`RegisterWhole`, by list and order) only when the count still
 * matches the rows walked; once a day, the log keeping it right between. A search, the chips, or both over a list kept
 * whole are answered from it in the browser (`searchKept`): the chips asked as the record would (`answersHere`: no ref,
 * no relative day), every word typed a part of a word in the fields the register marks searchable, as the record's box
 * asks it (`contains`, run by the same `evaluate`); a searchable ref is the record's, which reads it by its id. It is drawn
 * one page of it, in the order the record's answer will have, with a line saying it was found on this device; the line's
 * room is held while the search stands, so the record's answer replacing it moves no row. Money is the record's to search.
 * TODAY AND NEEDS YOU ARE PATCHED AND FOLLOW THE LOG: on open they draw the copy and ask the record once, quietly; on a
 * move of the record they wait for the copy to catch up (`settledLocal`) and draw its answer if it is still current,
 * and ask only where it was dropped. Today keeps who is working and what changed since the mark from the screen, never
 * from the copy (`follow`), so what changed since the mark is not followed between opens: the next open says it.
 * A row's page (row, history, what points at it) and declared pages (People, Money and the rest under `/p/`, and the
 * live Work page, under the same key `/p/work` keeps) are kept `always`: drawn at once, and asked again every time.
 * Needs you and a row's page offer no write while they are the copy's; anywhere else a write from a drawn copy meets
 * the record's compare-and-set like any other. Anything drawn from the copy and not yet answered holds up the quiet mark
 * over the work (`copy-mark.svelte.ts`).
 *
 * EVICTED BY USE. Each answer says when a screen last opened it (`opened`, written at most hourly) and about how much it
 * takes (`bytes`). Past `LOCAL_MOST` answers or `LOCAL_BYTES_MOST` the least recently opened go first, never the one
 * just kept; an answer bigger than the whole budget is not kept. Only answers are evicted: the owner, the cursor and the
 * signed marker's key (the `meta` store) and the last shell (`boot-copy.ts`, not in this database) never are.
 *
 * OPENED BESIDE BOOT. The layout starts the database opening before it waits on anything (`warmLocal`), and the store
 * and the marker's key share one connection, so a screen's 60 ms wait (`NEAR_MS`) meets an open database rather than a
 * cold one, and no paint ever waits on it. A copy later than the wait is handed to the screen when it lands
 * (`nearLocal`'s `late`), and drawn only while nothing is: never over the record's answer, nor over a refusal. It fills
 * the screen's own waiting frame, so the layout does not move, only its content arrives.
 *
 * MEASURED BY HAND (`timing.ts`). With `localStorage['braindog.timing']` at `1`, each screen logs to the console how
 * long it took from open (the navigation, or the page load) to its first paint from the copy, from memory and from the
 * network, against the targets: 0.3 s, 0.1 s and 1 s. Off by default, and it only logs.
 * THE PLAN, on the owner's record in a desktop browser and on a phone, each with the hook on and the copy warm (a day's
 * use) and then cold (forgotten in Settings): open Today, Needs you, a list of a few rows, a list past one page, a row
 * and Work, five times each, cold load and navigation both; then a search and a filter on the big list once it has been
 * kept whole. Note each screen's `copy` and `network` times and how many record calls a version move makes on Today and
 * Needs you (none when the copy follows it). The copy is done when every `copy` paint is under 0.3 s, every revisit
 * under 0.1 s, every cold open under 1 s, and a search on a list kept whole paints before the record answers.
 *
 * FORGOTTEN ON ASKING. Settings > Sessions says how much is kept here and forgets it (`forgetLocal`): the copy, its
 * signed marker, the last shell and the offline cache. A live open keeps it again, as after a sign-out.
 *
 * WHAT IT NEVER STORES: a refusal; anything not a plain JSON value; a list whose declaration is unknown to this tab or
 * declares a `secret` field; the Keychain and the kernel's `session` list; any key named like a credential (`SECRET_KEY`).
 * It never stores a write either: writes always go to the record.
 *
 * PURE, AND NODE LOADS IT. The store is handed in (`local-db.ts` is the browser's IndexedDB, `memoryStore` a test's),
 * and so is the record's log, so `local.test.ts` drives every rule without a browser or a socket.
 */

import { evaluate, type FieldSpec, type Predicate, type Schema } from '@braindog/where';

/** Bump when what is stored changes shape: a copy of another format is wiped. 2: answers carry `opened` and `bytes`. */
export const LOCAL_FORMAT = 2;
/** How old a kept answer may be and still be drawn. A week, as the shell copy and the offline copy. */
export const LOCAL_MS = 7 * 24 * 3_600_000;
/** The most answers kept; past it the least recently opened go. */
export const LOCAL_MOST = 120;
/**
 * The most a record's copy may take, as JSON. Past it the least recently opened answers go. 20 MB is far under any
 * browser's quota for a site, and an answer that size still reads back from IndexedDB in well under a frame budget's
 * worth of a phone's time per open, which is the whole point of keeping it.
 */
export const LOCAL_BYTES_MOST = 20 * 1024 * 1024;
/**
 * The most rows a list is kept whole with, walked page by page in the background. Past 5,000 (25 of the record's pages)
 * a walk is more requests than an idle open should spend, and a search over that many rows is the record's to answer.
 */
export const LIST_ROWS_MOST = 5_000;
/** How long an answer's `opened` may lag before a read writes it again: an hour orders eviction well enough, for a write. */
const TOUCH_MS = 3_600_000;
/** The rows a delete took out kept for an Undo to bring back. Fifty: an Undo comes soon, and past it the record answers. */
export const GONE_MOST = 50;

/** Where the copy's reader stands in the log, as the record handed it: a rowid to an owner, an opaque string to others. */
export type Cursor = number | string;

/**
 * Whose copy this is. `scope` is a fingerprint of what boot said they may read (`scopeOf`). `guest` is there when shares
 * made their access, with when the last one ends, and holds the copy to a day (`keptUntil`).
 */
export type Owner = { base: string; person: string; scope: string; guest?: { until: string | null } };

export type Meta = {
  format: number;
  /** The app build that last claimed it. */
  build: string;
  owner: Owner;
  /** The record's own format, kernel and primitives as the poll last heard them; `null` until it has. */
  record: string | null;
  cursor: Cursor | null;
  /** The id of the line the cursor names: `whatsNew` answers it again, and it is not news. */
  cursorId: string | null;
  /** When a live boot last claimed it, for a guest's copy, which is drawn a day past it at most (`keptUntil`). */
  live?: number;
};

/**
 * Where an answer holds rows of a list, so a line can be placed on them instead of dropping the answer.
 *
 * `at` is the path from the answer to an array of rows (`{ seq, fields, version }`). `by` is every field the question
 * was asked by, its filter, sort and counts, or `null` when a search or anything else means every field. `newest`: the
 * rows are in the record's own order, last changed first, so a placed write moves its row to the head. `moved` is the
 * path to a `{ [seq]: instant }` of when each row last changed, set from the line.
 */
export type Spot = {
  list: string;
  at: Path;
  by: readonly string[] | null;
  newest?: boolean;
  moved?: Path;
  lands?: Lands;
  /** The questions waiting on somebody, held at `at` by their `id` (`list` is `QUESTIONS`). */
  questions?: Asks;
  /** Rows drawn in a shape of the screen's own (Today's tasks), held at `at` by their `seq`. */
  shown?: Shown;
};

type Path = readonly (string | number)[];

/**
 * Where an answer holds the questions waiting (`QUESTIONS`). `total` is the path to how many wait in all, of which the
 * answer may hold only the first few. `decided`: the answer also holds what was decided, which an answer adds to and the
 * browser cannot. `drops` are counts over the questions the browser cannot move, taken out when one goes.
 */
export type Asks = { total?: Path; decided?: boolean; drops?: Path[] };

/**
 * Rows of a list drawn in the screen's own shape. `says`: each list field the row draws as it was logged, by the key it
 * is drawn under. `asks`: the fields the screen's reads were asked by or draw in a way of their own, which a line on
 * drops the answer. `leaves`: a value of a field that takes a row out of every read. `full`: some read came back at its
 * limit, so a row taken out lets in one the answer does not hold.
 */
export type Shown = {
  says: Readonly<Record<string, string>>;
  asks: readonly string[];
  leaves?: { field: string; values: readonly string[] };
  full?: boolean;
};

/**
 * How a create or a delete is placed on a spot's rows; absent, either drops the answer.
 *
 * `where` is the question's filter as the record's tree, `null` when nothing narrows it. `exact`: the filter is the
 * whole question, so a row it does not take is not in the answer. `sort` orders a new row (absent: the head when
 * `newest`, else the end, for a screen that orders its rows itself). `more` is the path to the next page's cursor,
 * `count` to how many rows the question matched, `tally` to the pills' counts as `[field, [value, n][]][]`.
 */
export type Lands = {
  where: Predicate | null;
  exact: boolean;
  sort?: { field: string; dir: 'asc' | 'desc' };
  more?: Path;
  count?: Path;
  tally?: Path;
  /** The path to `[<list> <id>, seq][]`: each row a ref may point at, so a create's ref is drawn as the number a row holds. */
  ids?: Path;
};

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
  /** When a screen last read it, which eviction goes by; `kept` until one has. */
  opened?: number;
  /** About how much it takes, as JSON, measured when it was kept. */
  bytes?: number;
  /** Rows deletes took out, by the spot path they were held at, for a restore to put back. */
  gone?: Gone[];
  /** The app build that kept it: one kept by another build is never current. Absent on answers kept before it was said. */
  build?: string;
};

type Gone = { at: string; row: Row & Record<string, unknown> };

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
  /**
   * Drop the least recently opened answers until at most `most` are left and they take at most `bytes`, never `keep`.
   * Only answers: the meta row (the owner, the cursor) and the marker's key beside it are never evicted, and the shell
   * copy is not in this store at all (`boot-copy.ts`).
   */
  prune(most: number, bytes: number, keep: string | null): Promise<void>;
  /** Say the answer at `at` was opened `when`. */
  touch(at: string, when: number): Promise<void>;
  /** Everything, meta included. */
  clear(): Promise<void>;
  /** Every answer, for the rail drawn offline and the size Settings says. */
  list(): Promise<Stored[]>;
};

/** One line of the log as much as the copy reads of it (`EventLine` in `@braindog/client`). */
export type Line = {
  id: string;
  kind: string;
  register: string | null;
  rowid?: number;
  /** The row a row write is about, `entry:<id>` as the log names it. */
  target?: string | null;
  steps?: Line[];
  ts?: string;
  seq?: number | null;
  field?: string | null;
  from?: unknown;
  to?: unknown;
  batch?: string | null;
  /** Who wrote it: a person's `p_` id, or a run's. */
  actor?: string;
};

type Said<T> = { ok: true; value: T } | { ok: false; refusal?: { code: string } } | { ok: false; conflict: unknown };

/** The two reads the copy asks the record. */
export type Log = {
  /** `whatsNew({ cursor, everything: true })`. */
  since(cursor: Cursor): Promise<Said<{ events: Line[]; upTo: Cursor | null; sinceCapped: boolean }>>;
  /** `recentHistory({ limit: 1, everything: true })`: the newest line this person is shown. */
  newest(): Promise<Said<{ events: Line[] }>>;
};

/** Lists never kept, whatever their declaration: the Keychain, and the kernel's own runs, which the sweep stamps. */
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

/**
 * AN ANSWER THAT READS MORE THAN IT CAN NAME (Today's money, its reminders) names `EVERY` among its lists: every catch-up
 * that touches anything hands it to the patch, and a line on a list it holds no spot for drops it.
 */
export const EVERY = ':every';

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

/**
 * A fingerprint of what boot says this person may read: a change of it is a change of what the copy may hold.
 *
 * AND WHERE SHARES MADE IT, THE ACCESS EPOCH AND WHAT THEY NARROW (sharing plan slice 10). `grant.epoch` moves with every
 * change to who holds what, and `lens` is the record's fingerprint of the rows and fields a share narrows them to
 * (`wheres`, `writes`, `hides`), so a share changed, a rule narrowed or a field hidden is a new owner and the copy is
 * wiped before it is drawn from. Somebody who holds no share and is narrowed by nothing keeps the fingerprint they had.
 */
export function scopeOf(me: {
  level: string | null;
  owner: boolean;
  lists: readonly string[] | null;
  levels?: Readonly<Record<string, string>> | undefined;
  grant?: { epoch: number } | undefined;
  lens?: string | undefined;
}): string {
  const levels = me.levels ? Object.entries(me.levels).sort(([a], [b]) => a.localeCompare(b)) : null;
  const base = [me.level, me.owner, me.lists ? [...me.lists].sort() : null, levels];
  return JSON.stringify(me.grant === undefined && me.lens === undefined ? base : [...base, me.grant?.epoch ?? null, me.lens ?? null]);
}

/**
 * How long a guest's copy may be drawn: a day after it was kept and after the last live open, and
 * never past the end of their last share. Somebody a share let in reads it offline for a day at most.
 */
export const GUEST_MS = 24 * 3_600_000;

/** Until when an answer kept at `kept` may be drawn for this owner, in milliseconds: a week, or a guest's day. */
export function keptUntil(m: { owner: Owner; live?: number | undefined }, kept: number): number {
  let end = kept + LOCAL_MS;
  const guest = m.owner.guest;
  if (guest === undefined) return end;
  end = Math.min(end, kept + GUEST_MS, (m.live ?? kept) + GUEST_MS);
  const until = guest.until === null ? NaN : Date.parse(guest.until);
  return Number.isFinite(until) ? Math.min(end, until) : end;
}

export const sameOwner = (a: Owner, b: Owner): boolean => a.base === b.base && a.person === b.person && a.scope === b.scope;

/** The cursor a line is pointed at by, said as the record says it: its rowid to whoever is handed one, else `e.<id>`. */
export const cursorAt = (line: Line): Cursor => (typeof line.rowid === 'number' ? line.rowid : `e.${line.id}`);

/** Whether a declaration holds a secret field. A list with one is never kept. */
export const holdsSecret = (decl: unknown): boolean => {
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

/* ── creates and deletes (`Lands`) ───────────────────────────────────────── */

/** The declared field `id`, with the `tags` every list has whether it declares it or not (`withTags` in the kernel). */
function fieldOf(decl: unknown, id: string): FieldLike | undefined {
  const f = fieldsOf(decl).find((x) => x.id === id);
  return f ?? (id === 'tags' ? { id: 'tags', type: 'list', of: 'text' } : undefined);
}

const worksOut = (decl: unknown): boolean => fieldsOf(decl).some((f) => f.derive !== undefined || f.derived === true);

/** The list as `@braindog/where` reads it, from the declaration the answer was kept with (`schemaOf` in `where.ts`). */
function schemaFrom(list: string, decl: unknown): Schema {
  const fields: Record<string, FieldSpec> = {};
  for (const f of fieldsOf(decl)) {
    if (typeof f.id !== 'string' || typeof f.type !== 'string' || (f as { retired?: unknown }).retired === true) continue;
    const values = (f as { values?: unknown }).values;
    fields[f.id] = {
      type: f.type,
      ...(typeof f.of === 'string' ? { of: f.of } : {}),
      ...(Array.isArray(values) ? { values: values.map(String) } : {}),
    };
  }
  if (!Object.hasOwn(fields, 'tags')) fields['tags'] = { type: 'list', of: 'text' };
  const state = (decl as { state?: unknown } | null)?.state;
  return { register: list, fields, ...(typeof state === 'string' ? { state } : {}) };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/u;
const LEAF_OPS = new Set(['is', 'not', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'between', 'contains', 'starts', 'ends', 'empty', 'present', 'has', 'lacks']);

/** Whether a value is one the browser compares as the record does, for a field of `type`. */
function literal(type: string, v: unknown): boolean {
  if (type === 'int' || type === 'decimal' || type === 'duration') return typeof v === 'number' && Number.isFinite(v);
  if (type === 'day' || type === 'instant') return typeof v === 'string' && ISO_DAY.test(v);
  if (type === 'bool') return typeof v === 'boolean' || v === 'true' || v === 'false';
  return typeof v === 'string';
}

/**
 * Whether the browser answers `where` about a row as the record would: groups of leaves over plain declared fields,
 * each value a literal of the field's type. A relative day (`today`), a ref (an id in the log, a number on screen), a
 * hop, a `via` or a search over the text index are the record's to answer.
 */
export function localWhere(where: unknown, decl: unknown): boolean {
  const walk = (n: unknown, depth: number): boolean => {
    if (depth > 16 || typeof n !== 'object' || n === null || Array.isArray(n)) return false;
    const node = n as Record<string, unknown>;
    for (const q of ['all', 'any', 'none'])
      if (q in node) return Object.keys(node).length === 1 && Array.isArray(node[q]) && (node[q] as unknown[]).every((c) => walk(c, depth + 1));
    if ('pointed' in node || 'via' in node || typeof node.field !== 'string') return false;
    const f = fieldOf(decl, node.field);
    if (!f || f.derive !== undefined || f.derived === true || typeof f.type !== 'string') return false;
    const list = f.type === 'list';
    const type = list ? (f.of === 'text' ? 'text' : null) : PLAIN.has(f.type) ? f.type : null;
    if (type === null) return false;
    const ops = Object.keys(node).filter((k) => k !== 'field');
    if (ops.length === 0) return false;
    return ops.every((op) => {
      if (!LEAF_OPS.has(op)) return false;
      /* A list is asked `has`, `lacks`, `empty` or `present`; a plain field anything but the first two. */
      if (list ? !['has', 'lacks', 'empty', 'present'].includes(op) : op === 'has' || op === 'lacks') return false;
      const v = node[op];
      if (op === 'empty' || op === 'present') return v === true;
      if (op === 'in' || op === 'not_in' || op === 'between') return Array.isArray(v) && v.length > 0 && v.every((x) => literal(type, x));
      return literal(type, v);
    });
  };
  return walk(where, 0);
}

/** Whether rows past those held answer the question: a next page's cursor is there. */
const beyond = (value: unknown, lands: Lands): boolean => {
  if (!lands.more) return false;
  const c = dig(value, lands.more);
  return c !== undefined && c !== null && c !== '';
};

/** Move the count at `path` by `by`; `false` when the answer holds something there that is not a number. */
function recount(value: unknown, path: Path | undefined, by: number): boolean {
  if (!path || path.length === 0) return true;
  const at = dig(value, path.slice(0, -1));
  const k = path[path.length - 1]!;
  if (typeof at !== 'object' || at === null) return true;
  const n = (at as Record<string | number, unknown>)[k];
  if (n === undefined || n === null) return true;
  if (typeof n !== 'number') return false;
  (at as Record<string | number, unknown>)[k] = Math.max(0, n + by);
  return true;
}

/** Move each pill's count by `by` for the row's value; `false` when a value has no pill to move. */
function retally(value: unknown, lands: Lands, fields: Record<string, unknown>, by: number): boolean {
  const pills = lands.tally ? dig(value, lands.tally) : undefined;
  if (pills === undefined || pills === null) return true;
  if (!Array.isArray(pills)) return false;
  for (const pill of pills) {
    if (!Array.isArray(pill) || typeof pill[0] !== 'string' || !Array.isArray(pill[1])) return false;
    const v = fields[pill[0]];
    if (v === undefined || v === null || v === '') continue;
    const bucket = (pill[1] as unknown[]).find((b) => Array.isArray(b) && b[0] === v) as [string, number] | undefined;
    if (!bucket || typeof bucket[1] !== 'number') return false;
    bucket[1] = Math.max(0, bucket[1] + by);
  }
  return true;
}

const SORTED = new Set(['int', 'decimal', 'duration', 'day', 'instant', 'enum']);

/**
 * Where a new row goes among `rows` under the record's order: its index, `rows.length` past the last, or `null` when
 * the order is not one the browser can say. EMPTIES LAST BOTH WAYS and AMONG EQUALS THE NEWEST ID FIRST, as the
 * kernel's `ORDER BY ... IS NULL, ..., id DESC` has it; an enum by its declared place, as the kernel's `CASE` does.
 */
function placeOf(rows: readonly unknown[], fields: Record<string, unknown>, sort: NonNullable<Lands['sort']>, decl: unknown): number | null {
  const f = fieldOf(decl, sort.field);
  if (!f || typeof f.type !== 'string' || !SORTED.has(f.type) || f.derive !== undefined || f.derived === true) return null;
  const values = (f as { values?: unknown }).values;
  const order = Array.isArray(values) ? values.map(String) : [];
  const key = (v: unknown): number | string | null => {
    if (v === undefined || v === null || v === '') return null;
    if (f.type === 'enum') {
      const i = order.indexOf(String(v));
      return i === -1 ? order.length : i;
    }
    if (f.type === 'day' || f.type === 'instant') return typeof v === 'string' ? v : NaN;
    return typeof v === 'number' ? v : NaN;
  };
  const mine = key(fields[sort.field]);
  if (typeof mine === 'number' && Number.isNaN(mine)) return null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!isRow(r)) return null;
    const theirs = key(r.fields[sort.field]);
    if (typeof theirs === 'number' && Number.isNaN(theirs)) return null;
    /* Equal keys, the new row first: its id is the newest. An empty one goes before the first empty held. */
    if (theirs === null) return i;
    if (mine === null) continue;
    if (typeof mine !== typeof theirs) return null;
    if (mine === theirs || (sort.dir === 'asc' ? mine < theirs : mine > theirs)) return i;
  }
  return rows.length;
}

/** The id a ref is logged with, `entry:` taken off, or `null` when it is not one. */
const refId = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v.replace(/^entry:/u, '') : null);

/** The rows a spot's answer may point at, `<list> <id>` to the number a row holds, from `Lands.ids`. */
function idsOf(value: unknown, lands: Lands): Map<string, number> | null {
  if (!lands.ids) return null;
  const pairs = dig(value, lands.ids);
  if (!Array.isArray(pairs)) return null;
  const out = new Map<string, number>();
  for (const p of pairs) if (Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'number') out.set(p[0], p[1]);
  return out;
}

/**
 * A create's fields as a row holds them, or `null` when one cannot be drawn as the log says it. A REF IS AN ID IN THE
 * LOG AND A NUMBER ON SCREEN, so it is drawn only when `ids` names the row it points at; any other ref drops the answer.
 */
function createdFields(decl: unknown, to: unknown, ids: ReadonlyMap<string, number> | null = null): Record<string, unknown> | null {
  if (typeof to !== 'object' || to === null || Array.isArray(to) || worksOut(decl)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(to as Record<string, unknown>)) {
    if (v === REDACTED) return null;
    if (v === undefined || v === null) continue;
    const f = fieldOf(decl, k);
    if (!f || typeof f.type !== 'string') return null;
    if (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) {
      const target = (f as { to?: unknown }).to;
      if (typeof target !== 'string' || ids === null) return null;
      const seqOf = (x: unknown): number | undefined => {
        const id = refId(x);
        return id === null ? undefined : ids.get(`${target} ${id}`);
      };
      if (f.type === 'ref') {
        const seq = seqOf(v);
        if (seq === undefined) return null;
        out[k] = seq;
      } else {
        if (!Array.isArray(v)) return null;
        const seqs = v.map(seqOf);
        if (seqs.some((s) => s === undefined)) return null;
        out[k] = seqs;
      }
      continue;
    }
    if (f.type === 'list') {
      if (f.of !== 'text' || !Array.isArray(v) || !v.every((x) => typeof x === 'string')) return null;
    } else if (!PLAIN.has(f.type)) return null;
    out[k] = v;
  }
  /* AND WHAT THE RECORD FILLS IN ON A CREATE, as it does: a field the line left out that declares a default (a list's
     state above all, `live`, `open`). A row placed without its state was counted as open, so a list kept in this tab
     said "16 open" over sixteen live categories once a create had landed in it (1 Nov). */
  const fields = (decl as { fields?: unknown } | null)?.fields;
  if (Array.isArray(fields))
    for (const f of fields as { id?: unknown; type?: unknown; default?: unknown; retired?: unknown }[]) {
      if (typeof f.id !== 'string' || f.id in out || f.retired === true || f.default === undefined || f.default === null) continue;
      if (typeof f.type === 'string' && PLAIN.has(f.type) && typeof f.default !== 'object') out[f.id] = f.default;
    }
  return out;
}

/**
 * Put a row the answer does not hold where the question would: asked of the filter, placed by the sort, counted. A
 * create and a restore both come here. `false` drops the answer; `true` with nothing placed is a row the question
 * leaves out, or one past the page held.
 */
function land(value: unknown, spot: Spot, decl: unknown, fields: Record<string, unknown>, made: () => Record<string, unknown>, l: Line): boolean {
  const lands = spot.lands!;
  const rows = dig(value, spot.at) as unknown[];
  if (lands.where !== null) {
    if (!localWhere(lands.where, decl)) return false;
    let takes: boolean;
    try {
      takes = evaluate(lands.where, fields, schemaFrom(spot.list, decl));
    } catch {
      return false;
    }
    if (!takes) return lands.exact;
    /* PILLS COUNT ROWS THE OTHER CHIPS TAKE, which a narrowed question cannot say from its filter whole. */
    const pills = lands.tally ? dig(value, lands.tally) : undefined;
    if (pills !== undefined && pills !== null) return false;
  } else if (!retally(value, lands, fields, 1)) return false;
  let at: number | null;
  if (lands.sort) at = placeOf(rows, fields, lands.sort, decl);
  else if (spot.newest) at = 0;
  else at = beyond(value, lands) ? null : rows.length;
  if (at === null) return false;
  if (!recount(value, lands.count, 1)) return false;
  /* PAST THE LAST ROW HELD, with more pages, it is on a later page: counted, not drawn. */
  if (at < rows.length || !beyond(value, lands)) {
    rows.splice(at, 0, made());
    const moved = spot.moved ? dig(value, spot.moved) : undefined;
    if (typeof moved === 'object' && moved !== null && typeof l.ts === 'string' && typeof l.seq === 'number') (moved as Record<number, string>)[l.seq] = l.ts;
  }
  return true;
}

/** Place a create on one spot of `value`; `false` drops the answer. */
function landCreate(value: unknown, spot: Spot, decl: unknown, l: Line, writes: Map<string, 'placed' | 'in'>, me: string | null): boolean {
  const lands = spot.lands;
  if (!lands || typeof l.seq !== 'number') return false;
  const rows = dig(value, spot.at);
  if (!Array.isArray(rows)) return false;
  const write = `${spot.at.join('.')} ${l.seq} ${l.batch ?? l.id}`;
  /* KEPT AFTER THE CREATE, the row is in already. */
  if (rows.some((r) => isRow(r) && r.seq === l.seq)) {
    writes.set(write, writes.get(write) ?? 'in');
    return true;
  }
  const fields = createdFields(decl, l.to, idsOf(value, lands));
  if (fields === null) return false;
  const seq = l.seq;
  const made = () => {
    const id = refId(l.target);
    /* WHO MADE IT, from the line and the reader the copy is kept for, so the row is not drawn blank until the record answers. */
    const by = typeof l.actor === 'string' ? l.actor : '';
    return { ...(id ? { id } : {}), seq, fields, version: 1, created: l.ts ?? '', by, ...(me !== null && by === me ? { mine: true } : {}) };
  };
  if (!land(value, spot, decl, fields, made, l)) return false;
  /* The rest of the same write (a rule's edit of the row it made) is that one version, as an edit's lines are. */
  writes.set(write, 'placed');
  return true;
}

/**
 * Bring a restored row back to one spot of `value`: only one a delete this copy placed took out (`gone`), as it was,
 * one version on. A restore carries no fields, so a row deleted before the answer was kept drops it, as before.
 */
function landRestore(value: unknown, spot: Spot, decl: unknown, l: Line, writes: Map<string, 'placed' | 'in'>, gone: Gone[]): boolean {
  const lands = spot.lands;
  if (!lands || typeof l.seq !== 'number') return false;
  const rows = dig(value, spot.at);
  if (!Array.isArray(rows)) return false;
  const write = `${spot.at.join('.')} ${l.seq} ${l.batch ?? l.id}`;
  /* KEPT AFTER THE RESTORE, the row is in already. */
  if (rows.some((r) => isRow(r) && r.seq === l.seq)) {
    writes.set(write, writes.get(write) ?? 'in');
    return true;
  }
  const path = spot.at.join('.');
  const i = gone.findIndex((g) => g.at === path && g.row.seq === l.seq);
  if (i === -1) return false;
  const [was] = gone.splice(i, 1);
  const back = { ...was!.row, version: (typeof was!.row.version === 'number' ? was!.row.version : 0) + 1 };
  if (!land(value, spot, decl, back.fields, () => back, l)) return false;
  writes.set(write, 'placed');
  return true;
}

/** Take a deleted row off one spot of `value`, kept in `gone` for a restore; `false` drops the answer. */
function landDelete(value: unknown, spot: Spot, l: Line, gone: Gone[]): boolean {
  const lands = spot.lands;
  if (!lands || typeof l.seq !== 'number') return false;
  const rows = dig(value, spot.at);
  if (!Array.isArray(rows)) return false;
  const at = rows.findIndex((r) => isRow(r) && r.seq === l.seq);
  if (at === -1) {
    /* NOT HELD: on a later page, or counted by a pill the chips leave it out of, it moves a number nobody can see. */
    if (beyond(value, lands)) return false;
    const pills = lands.tally ? dig(value, lands.tally) : undefined;
    return lands.where === null || pills === undefined || pills === null;
  }
  const [out] = rows.splice(at, 1) as (Row & Record<string, unknown>)[];
  gone.push({ at: spot.at.join('.'), row: out! });
  if (gone.length > GONE_MOST) gone.splice(0, gone.length - GONE_MOST);
  const moved = spot.moved ? dig(value, spot.moved) : undefined;
  if (typeof moved === 'object' && moved !== null) delete (moved as Record<number, string>)[l.seq];
  return recount(value, lands.count, -1) && retally(value, lands, out!.fields, -1);
}

/* ── the questions waiting, and rows a screen draws its own way ─────────────── */

/** A question's id as a handle (`q.<id>`, `d.<id>`) or as the record's own number: a line and a card must say the same. */
const formOf = (id: unknown): string | null => (typeof id !== 'string' ? null : /^[qd]\./u.test(id) ? 'handle' : 'number');

/**
 * Place a line about the questions on every spot holding them. AN ANSWER OR A WITHDRAWAL (`resolve`) takes its question
 * out and the count down, unless one the answer does not hold would take its place. A DECISION (`decide`) adds nothing
 * to wait on, and drops only an answer that holds what was decided. A QUESTION ASKED, reopened or replaced drops it: the
 * browser cannot draw its card or say where it ranks. `false` drops the answer.
 */
function placeQuestion(value: unknown, spots: readonly Spot[], l: Line): boolean {
  if (l.kind === 'decide') return !spots.some((s) => s.questions!.decided === true);
  if (l.kind !== 'resolve') return false;
  const target = typeof l.target === 'string' ? l.target : '';
  const id = target.startsWith('suggestion:') ? target.slice('suggestion:'.length) : '';
  if (id === '') return false;
  for (const s of spots) {
    const asks = s.questions!;
    /* WHAT WAS DECIDED IS HELD TOO: a withdrawal decides nothing, every other close does. */
    if (asks.decided === true && l.to !== 'withdrawn') return false;
    const rows = dig(value, s.at);
    if (!Array.isArray(rows)) return false;
    const total = asks.total ? dig(value, asks.total) : rows.length;
    const all = total === undefined || total === null ? rows.length : total;
    if (typeof all !== 'number') return false;
    const at = rows.findIndex((r) => typeof r === 'object' && r !== null && (r as { id?: unknown }).id === id);
    if (at === -1) {
      /* NOT HELD, BY AN ANSWER HOLDING EVERY ONE IT COUNTS and naming them as the line does: never one of them. */
      if (all > rows.length || rows.some((r) => formOf((r as { id?: unknown } | null)?.id) !== formOf(id))) return false;
      continue;
    }
    /* ONE IT COUNTS AND DOES NOT DRAW would come up into the place this one leaves. */
    if (all > rows.length) return false;
    rows.splice(at, 1);
    if (!recount(value, asks.total, -1)) return false;
    for (const p of asks.drops ?? []) {
      const parent = dig(value, p.slice(0, -1));
      if (typeof parent === 'object' && parent !== null) delete (parent as Record<string | number, unknown>)[p[p.length - 1]!];
    }
  }
  return true;
}

/**
 * Place a row write on rows a screen draws its own way (`Shown`). A held row's drawn field takes the value logged; a
 * field it neither draws nor was asked by moves only its version; a value that takes it out of every read takes it off,
 * unless a read was full. A row not held stays out. A create, a restore, a link, or a field it was asked by drops it.
 */
function placeShown(value: unknown, spots: readonly Spot[], l: Line, writes: Map<string, 'placed' | 'in'>): boolean {
  if (l.kind === 'note') return true;
  if (typeof l.seq !== 'number') return false;
  const seq = l.seq;
  const find = (rows: unknown[]) => rows.findIndex((r) => typeof r === 'object' && r !== null && (r as { seq?: unknown }).seq === seq);
  if (l.kind === 'delete') {
    for (const s of spots) {
      const rows = dig(value, s.at);
      if (!Array.isArray(rows)) return false;
      const at = find(rows);
      if (at === -1) continue;
      if (s.shown!.full === true) return false;
      rows.splice(at, 1);
    }
    return true;
  }
  if (!VALUES.has(l.kind) || typeof l.field !== 'string' || l.to === REDACTED || l.from === REDACTED) return false;
  for (const s of spots) {
    const sh = s.shown!;
    const rows = dig(value, s.at);
    if (!Array.isArray(rows)) return false;
    const at = find(rows);
    const leaving = sh.leaves !== undefined && sh.leaves.field === l.field && (l.kind === 'edit' || l.kind === 'state') && sh.leaves.values.includes(String(l.to));
    if (leaving) {
      if (at === -1) continue;
      if (sh.full === true) return false;
      rows.splice(at, 1);
      continue;
    }
    if (sh.asks.includes(l.field)) return false;
    if (at === -1) continue;
    const r = rows[at] as Record<string, unknown>;
    const key = sh.says[l.field];
    let did: 'placed' | 'in' = 'placed';
    if (key !== undefined) {
      /* EMPTIED, a drawn field is the screen's own fallback ("Untitled task"), which is the record's to say. */
      if (l.kind !== 'edit' || typeof l.to !== 'string' || l.to.trim() === '') return false;
      if (r[key] === l.to.trim()) did = 'in';
      else r[key] = l.to.trim();
    }
    const write = `${s.at.join('.')} ${seq} ${l.batch ?? l.id}`;
    const was = writes.get(write);
    if (key !== undefined && was !== undefined && was !== did) return false;
    if (was === undefined) {
      writes.set(write, did);
      if (did === 'placed' && typeof r.version === 'number') r.version += 1;
    }
  }
  return true;
}

/**
 * `row`'s answer with `lines` (oldest first, as `inOrder` gives them) placed on it, and the rows deletes took out, or
 * `undefined` when one cannot be placed and the answer must go. The rules are the design note's, top of this file.
 * Lines about lists the answer was not read from are not its business and pass by, unless it reads `EVERY`. `me` is the
 * person the copy is kept for: a row they made is `mine`.
 */
function patch(row: Stored, lines: readonly Line[], me: string | null): { value: unknown; gone: Gone[] } | undefined {
  const spots = row.spots ?? [];
  const value: unknown = structuredClone(row.value);
  const gone: Gone[] = structuredClone(row.gone ?? []);
  const every = row.lists.includes(EVERY);
  /* Each write on a row is one `version`: placed once, or found already in. A write that is both is not one answer's. */
  const writes = new Map<string, 'placed' | 'in'>();

  for (const l of lines) {
    const lists = linesLists(l);
    if (lists === null) return undefined;
    const mine = lists.filter((x) => row.lists.includes(x));
    if (mine.length === 0) {
      if (every && lists.length > 0) return undefined;
      continue;
    }
    const list = mine[0]!;
    if (list === QUESTIONS) {
      const asks = spots.filter((s) => s.list === QUESTIONS && s.questions !== undefined);
      if (asks.length === 0 || !placeQuestion(value, asks, l)) return undefined;
      continue;
    }
    if (isPseudo(list)) return undefined;
    const decl = row.decls[list];
    if (decl === undefined) return undefined;
    const drawn = spots.filter((s) => s.list === list && s.shown !== undefined);
    const held = spots.filter((s) => s.list === list && s.shown === undefined && s.questions === undefined);
    if (drawn.length > 0 && !placeShown(value, drawn, l, writes)) return undefined;
    if (drawn.length > 0 && held.length === 0) continue;

    /* A LIST THE ANSWER ONLY NAMES ROWS OF: nothing on it is patched, and only a name it might show is news. */
    if (held.length === 0) {
      if (l.kind === 'note') continue;
      if (!VALUES.has(l.kind) || typeof l.field !== 'string' || nameFields(decl).has(l.field)) return undefined;
      continue;
    }

    if (l.kind === 'note') continue;
    if (l.kind === 'create' || l.kind === 'delete' || l.kind === 'restore') {
      for (const spot of held) {
        const ok =
          l.kind === 'create' ? landCreate(value, spot, decl, l, writes, me) : l.kind === 'delete' ? landDelete(value, spot, l, gone) : landRestore(value, spot, decl, l, writes, gone);
        if (!ok) return undefined;
      }
      continue;
    }
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
  return { value, gone };
}

/** `row`'s answer with `lines` placed on it, or `undefined` when it must go (`patch`). */
export function patched(row: Stored, lines: readonly Line[], me: string | null = null): unknown {
  return patch(row, lines, me)?.value;
}

/** The stored answer with `lines` placed on it and the rows its deletes took out kept beside it, or `null` to drop it. */
export function patchedRow(row: Stored, lines: readonly Line[], me: string | null = null): Stored | null {
  const out = patch(row, lines, me);
  if (out === undefined) return null;
  const rest: Stored = { ...row };
  delete rest.gone;
  return out.gone.length > 0 ? { ...rest, value: out.value, gone: out.gone } : { ...rest, value: out.value };
}

/**
 * Whether a row answers `where` here as the record would (`localWhere`, then `@braindog/where`'s `evaluate`), for a
 * screen asking a filter of rows it keeps. `false` for a question the browser cannot answer.
 */
export function answersHere(list: string, decl: unknown, where: Predicate, fields: Record<string, unknown>): boolean {
  if (!localWhere(where, decl)) return false;
  try {
    return evaluate(where, fields, schemaFrom(list, decl));
  } catch {
    return false;
  }
}

const sameDay = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString();

/** What a screen is handed back. `current`: caught up to the newest version heard, kept today. `kept`: when it was. */
export type Near<T> = { value: T; decls: Record<string, unknown>; current: boolean; kept: number };

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
  /** Every answer kept for `base` and whoever this tab is, by `answer`'s rule, still young enough to draw. */
  held(base: string, person: string | null): Promise<Stored[]>;
  /** How much is kept: answers, and about how many bytes they take as JSON. */
  size(): Promise<{ answers: number; bytes: number }>;
  /** Wipe everything: a sign-out, a refusal. */
  wipe(): Promise<void>;
  /** When every catch-up asked so far has landed: a screen reads the copy after it, to draw what the log moved. */
  settled(): Promise<void>;
  /**
   * What the log says about `list` (or about the declarations, with no list) since this tab claimed the copy: a token
   * that moves when a catch-up touched the list, and for every list when one dropped everything (a declaration, an access
   * change, a line it cannot place, a capped walk, a refused cursor, a new owner, a new format). `null` while the copy
   * cannot vouch for it: not claimed, no cursor, or not caught up to the newest move heard. Read it after `settled`.
   */
  revision(list?: string): string | null;
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
  /* WHAT `revision` SAYS: how many times everything was dropped, and how many catch-ups touched each list since. */
  let drops = 0;
  const moved = new Map<string, number>();
  const droppedAll = (): void => {
    drops += 1;
    moved.clear();
  };

  const load = (): Promise<Meta | null> =>
    (loaded ??= store.meta().then(
      (m) => (meta = m && m.format === LOCAL_FORMAT ? m : null),
      () => null,
    ));

  const write = async (m: Meta): Promise<void> => {
    meta = m;
    loaded = Promise.resolve(m);
    await store.setMeta(m).catch(() => undefined);
  };

  const dropAll = async (): Promise<void> => {
    epoch += 1;
    droppedAll();
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
      for (const l of hit.lists) moved.set(l, (moved.get(l) ?? 0) + 1);
      const order = inOrder(events, m.cursorId);
      /* AND EVERY ANSWER THAT READS MORE THAN IT NAMES (`EVERY`), which the patch drops on a list it holds no spot for. */
      const lists = new Set([...hit.lists, EVERY]);
      await store
        .rewrite(lists, (row) => (row.spots && row.spots.length > 0 ? patchedRow(row, order, m.owner.person) : null))
        .catch(() => store.drop(lists).catch(() => undefined));
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
        /* A GUEST'S LIVE OPEN IS WRITTEN DOWN, since their copy is drawn a day past the last one at most (`keptUntil`). */
        const live = owner.guest === undefined ? {} : { live: now() };
        if (claimed !== null && sameOwner(claimed, owner) && m !== null) {
          if (owner.guest !== undefined) await write({ ...m, owner, ...live });
          return;
        }
        /* THE BUILD THAT CLAIMS IT IS SAID ON IT, and what an older one kept stays, drawn as it was and asked again. */
        const built = m !== null && m.build !== opts.build ? { build: opts.build } : {};
        claimed = owner;
        droppedAll();
        if (m === null || !sameOwner(m.owner, owner)) {
          epoch += 1;
          await store.clear().catch(() => undefined);
          await write({ format: LOCAL_FORMAT, build: opts.build, owner, record: null, cursor: null, cursorId: null, ...live });
        } else if (owner.guest !== undefined || built.build !== undefined) await write({ ...m, owner, ...live, ...built });
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
      if (row === null || t < row.kept || t >= keptUntil(m, row.kept)) return null;
      /* OPENED NOW, for eviction, written at most once an hour an answer: a read that writes on every draw costs a write. */
      if (claimed !== null && t - (row.opened ?? row.kept) >= TOUCH_MS) void store.touch(row.at, t).catch(() => undefined);
      return { value: row.value as T, decls: row.decls, current: claimed !== null && !row.always && row.build === opts.build && caught === asked && sameDay(row.kept, t), kept: row.kept };
    },
    async held(base, person) {
      const m = meta ?? (await load());
      if (m === null || m.owner.base !== base) return [];
      if (claimed !== null ? !sameOwner(m.owner, claimed) : person !== m.owner.person) return [];
      const t = now();
      const rows = await store.list().catch(() => [] as Stored[]);
      return rows.filter((r) => t >= r.kept && t < keptUntil(m, r.kept));
    },
    async size() {
      const rows = await store.list().catch(() => [] as Stored[]);
      return { answers: rows.length, bytes: rows.reduce((n, r) => n + JSON.stringify(r).length, 0) };
    },
    settled: () => chain,
    revision(list) {
      if (claimed === null || meta === null || meta.cursor === null || caught !== asked) return null;
      return list === undefined ? `${drops}` : `${drops}.${moved.get(list) ?? 0}`;
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
        const t = now();
        const row: Stored = {
          at: atOf(name, key),
          name,
          key,
          lists: [...lists],
          decls: held,
          value: clean,
          kept: t,
          opened: t,
          ...(spots && spots.length > 0 ? { spots } : {}),
          ...(how.always ? { always: true } : {}),
          build: opts.build,
        };
        row.bytes = JSON.stringify(row).length;
        /* AN ANSWER BIGGER THAN THE WHOLE BUDGET is never kept: it would evict everything and still be over. */
        if (row.bytes > LOCAL_BYTES_MOST) return false;
        await store.put(row);
        await store.prune(LOCAL_MOST, LOCAL_BYTES_MOST, row.at);
        return true;
      } catch {
        return false;
      }
    },
    wipe() {
      epoch += 1;
      droppedAll();
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
    prune: async (most: number, bytes: number, keep: string | null) => {
      /* THE LEAST RECENTLY OPENED FIRST, as the IndexedDB store walks its `opened` index. */
      const old = [...rows.values()].sort((a, b) => (a.opened ?? a.kept) - (b.opened ?? b.kept));
      let n = old.length;
      let size = old.reduce((s, r) => s + (r.bytes ?? 0), 0);
      for (const r of old) {
        if (n <= most && size <= bytes) break;
        if (r.at === keep) continue;
        rows.delete(r.at);
        n -= 1;
        size -= r.bytes ?? 0;
      }
    },
    touch: async (at: string, when: number) => {
      const r = rows.get(at);
      if (r) r.opened = when;
    },
    clear: async () => {
      rows.clear();
      self.saved = null;
    },
    list: async () => [...rows.values()].map((r) => structuredClone(r)),
  };
  return self;
}

/** The name declared pages are kept under (`/p/<slug>` and Work), with `pageKey`'s `[base, slug, choice]` as the key. */
export const PAGE_ANSWERS = 'Page';

/** The rail as the copy can draw it: names only, and a count only where an unnarrowed list said one. */
export type Rail = {
  lists: { id: string; name: string; icon: string | null; count: number | null }[];
  pages: { slug: string; title: string; icon: string | null; section: string | null; order: number }[];
};

/**
 * THE RAIL OFFLINE WITH NO SHELL COPY, from what the copy holds: every list an answer was read from, by the name its
 * declaration gives, and every declared page kept, by its title and where its nav puts it. Nothing it does not hold.
 */
export function railOf(rows: readonly Stored[]): Rail {
  const lists = new Map<string, Rail['lists'][number]>();
  const pages = new Map<string, Rail['pages'][number]>();
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
  for (const r of rows) {
    for (const id of r.lists) {
      if (isPseudo(id) || NEVER_KEPT.has(id)) continue;
      const d = r.decls[id] as { name?: unknown; icon?: unknown } | undefined;
      if (d === undefined) continue;
      /* A COUNT ONLY FROM AN ANSWER THAT COUNTED THE WHOLE LIST: no filter, no search. */
      const whole = r.spots?.find((s) => s.list === id && s.by !== null && s.lands?.where === null && s.lands.count);
      const n = whole?.lands?.count ? dig(r.value, whole.lands.count) : undefined;
      const was = lists.get(id);
      lists.set(id, {
        id,
        name: text(d.name) ?? was?.name ?? id,
        icon: text(d.icon) ?? was?.icon ?? null,
        count: typeof n === 'number' ? n : (was?.count ?? null),
      });
    }
    if (r.name !== PAGE_ANSWERS) continue;
    let slug: unknown = null;
    try {
      slug = (JSON.parse(r.key) as unknown[])[1];
    } catch {
      continue;
    }
    const decl = (r.value as { from?: unknown; page?: { page?: { title?: unknown; icon?: unknown; nav?: { section?: unknown; order?: unknown } } } } | null)?.page?.page;
    if (typeof slug !== 'string' || slug === '' || (r.value as { from?: unknown }).from !== 'live' || !decl) continue;
    pages.set(slug, {
      slug,
      title: text(decl.title) ?? slug,
      icon: text(decl.icon),
      section: text(decl.nav?.section),
      order: typeof decl.nav?.order === 'number' ? decl.nav.order : 0,
    });
  }
  return { lists: [...lists.values()], pages: [...pages.values()] };
}
