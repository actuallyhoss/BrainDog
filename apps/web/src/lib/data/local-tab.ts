/**
 * The local copy for this tab (`local.ts`): one, over IndexedDB, or over memory where the browser has none.
 *
 * THE SHELL CLAIMS IT AND THE POLL MOVES IT. The layout calls `claimLocal` with the reader a live boot names, the
 * version poll calls `heardLocal` on every move and `stampLocal` with the record's format, and sign-out, a 401 and a
 * refused boot call `wipeLocal`. Screens only ask `nearLocal` and hand answers to `keepLocal`.
 *
 * THE CLAIM SIGNS THE LAST READER (`local-mark.ts`), and the wipe drops it, so a cold open and an offline boot find the
 * same person the copy was kept for, or nobody.
 *
 * OFF WHILE THE RECORD IS SEEN AS SOMEBODY (`see-as.svelte.ts`): nothing read as them is kept, nothing kept is drawn for
 * them, and the copy is not claimed for them, so the owner's copy is as he left it when he exits.
 *
 * `@braindog/client` IS IMPORTED WHEN THE LOG IS FIRST ASKED, for `live.svelte.ts`'s reason: this file is reached from
 * the layout, and the client carries the route table.
 */

import { REGISTERS } from '../record/held.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { dropCopy, readCopy } from '../record/boot-copy.ts';
import { dropAllOut } from '../record/answers-out.ts';
import { forgetSignedOut } from '../record/signed-out.ts';
import { idbKey, idbStore, openEarly } from './local-db.ts';
import { MARK_KEY, dropMark, memoryKey, readMark, writeMark, type MarkDeps } from './local-mark.ts';
import { localCopy, memoryStore, railOf, scopeOf, type LocalCopy, type Log, type Near, type Rail, type Spot } from './local.ts';
import { forget as forgetOffline, markGuest } from './offline.ts';
import { seeingAs } from '../sharing/see-as.svelte.ts';
import { inIosApp } from '../shell.ts';

/* THE BUILD, READ OFF KIT'S OWN `define` RATHER THAN `$app/environment`. That module lives in the entry, and naming its
   `version` from this lazy file made the build stamp a chunk the entry has to import on every visit (`bundle` gate).
   Kit folds the same constant into `version` there; `''` where nothing defines it, as in Node. */
const build = typeof __SVELTEKIT_APP_VERSION__ === 'string' ? __SVELTEKIT_APP_VERSION__ : '';

/** How long a screen waits for the copy before it asks the record without it. */
const NEAR_MS = 60;
/* IN THE APP native covers a pushed screen for longer than that, so the copy is waited for more. */
const NEAR_APP_MS = 200;
/* OFFLINE THE RECORD ANSWERS NOTHING, so a slow copy is still the first thing drawn: it is waited for this long. */
const OFFLINE_MS = 1_500;
let patient = false;

/** The boot reached nobody: screens wait longer for the copy, since the record will not answer before it. */
export function offlineLocal(on: boolean): void {
  patient = on;
}

/**
 * Open the copy and verify the last reader before any screen asks, so the first `nearLocal` is inside its wait. The
 * layout calls it before it waits on anything, so the database opens beside `boot` and never in front of a paint.
 */
export function warmLocal(base: string): void {
  if (seeingAs() !== null) return;
  openEarly();
  void lastReader(base)
    .then((person) => tab().answer('', '', base, person))
    .catch(() => undefined);
}

let copy: LocalCopy | null = null;

function log(base: string): Log {
  let client: Promise<import('@braindog/client').Client> | null = null;
  const c = () =>
    (client ??= import('@braindog/client').then(({ createClient, followDeclarations }) => {
      /* FROM THE FIRST CATCH-UP ON, A KEPT SCHEMA IS KEPT BY WHAT THE LOG SAYS OF THE DECLARATIONS (`revisionLocal`), and
         not dropped on every move of the record's version. */
      followDeclarations(() => revisionLocal());
      return createClient({ base });
    }));
  return {
    since: async (cursor) => (await c()).whatsNew(cursor, { everything: true }) as never,
    newest: async () => (await c()).recentHistory({ limit: 1, everything: true }) as never,
  };
}

const tab = (): LocalCopy => (copy ??= localCopy(idbStore() ?? memoryStore(), log, { build }));

const strings = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

let marks: MarkDeps | null = null;
const markDeps = (): MarkDeps => {
  if (marks) return marks;
  const subtle = globalThis.crypto?.subtle ?? null;
  const idb = (() => {
    try {
      return globalThis.indexedDB ?? null;
    } catch {
      return null;
    }
  })();
  marks = { store: strings(), subtle, key: idb ? idbKey(subtle, idb) : subtle ? memoryKey(subtle) : async () => null };
  return marks;
};

/* THE MARKER AS THIS TAB LAST VERIFIED IT, by record: a verify is a crypto call, and every screen asks on open. */
const verified = new Map<string, Promise<string | null>>();

/** Who the copy may be drawn for on `base` before a claim: the signed last reader, else the last shell's person. */
export function lastReader(base: string): Promise<string | null> {
  let said = verified.get(base);
  if (!said) {
    said = readMark(base, markDeps()).then((marked) => {
      const shell = readCopy(base)?.me.person ?? null;
      /* TWO NAMES THAT DISAGREE NAME NOBODY: one of them is somebody this browser no longer reads for. */
      if (marked !== null && shell !== null && shell !== '' && marked !== shell) return null;
      return marked ?? (shell === '' ? null : shell);
    });
    verified.set(base, said);
  }
  return said;
}

/** Whether what this browser holds was kept for somebody other than `person`, by the marker as it stands. */
function keptForOther(person: string): boolean {
  try {
    const was = (JSON.parse(strings()?.getItem(MARK_KEY) ?? 'null') as { person?: unknown } | null)?.person;
    return typeof was === 'string' && was !== '' && person !== '' && was !== person;
  } catch {
    return false;
  }
}

/** The reader a live boot named. Call only with a shell the record answered, never a drawn copy or a refusal. */
export function claimLocal(
  base: string,
  me: {
    person: string;
    level: string;
    owner: boolean;
    lists: string[] | null;
    levels?: Readonly<Record<string, string>> | undefined;
    grant?: { epoch: number; until: string | null } | undefined;
    lens?: string | undefined;
  },
): void {
  if (seeingAs() !== null) return;
  /* ANOTHER PERSON THAN THE ONE THIS BROWSER KEPT FOR, with no sign-out between (a mailed link opened where somebody was signed
     in, on any way in, which is why it is here and not only on the sign-in screen): the claim below clears the copy, and the
     worker's copy with Today's picture and the keys kept beside it go with it. Today's picture is keyed by the address alone,
     so a colleague on the same BrainDog would be painted it. */
  const other = keptForOther(me.person);
  const cleared = other ? forgetOffline().catch(() => undefined) : Promise.resolve();
  if (other) forgetSignedOut();
  /* SOMEBODY ONLY SHARES LET IN (a grant, and no role on the whole record) IS A GUEST HERE, whose copy is drawn a day at
     most and never past their last share's end, in the local copy and in the worker's (`markGuest`). */
  const guest = me.grant !== undefined && !me.owner && me.lists !== null ? { until: me.grant.until } : null;
  void cleared.then(() => markGuest(guest)).catch(() => undefined);
  void tab()
    .claim({ base, person: me.person, scope: scopeOf(me), ...(guest === null ? {} : { guest }) })
    /* AFTER THE CLAIM, which clears the key with the copy when the owner changed: the marker is signed with the new one. */
    .then(() => writeMark(base, me.person, markDeps()))
    .then(() => void verified.delete(base))
    .catch(() => undefined);
}

/* THE RECORD'S VERSION AS THE POLL LAST HEARD IT MOVE, for a read kept by version where the copy cannot vouch. */
let version: number | null = null;

/** The record moved. */
export function heardLocal(at: number | null = null): void {
  version = at;
  if (copy) void copy.heard();
}

/** The token a read is kept under where the copy cannot vouch: the version the poll last heard move, as `keptToken` says it. */
export const versionKept = (): string => `v ${version}`;
/** The version the poll last heard the record move to, or `null` before it has heard one. */
export const versionHeard = (): number | null => version;

/** When the copy has caught up to every move heard so far: a screen following the log reads it after this. */
export const settledLocal = (): Promise<void> => (copy ? copy.settled() : Promise.resolve());

/**
 * What the log says of `list`, or of the declarations with none, once the copy has caught up (`LocalCopy.revision`):
 * a token that moves only when something the answer could hold moved. `null` where the copy cannot vouch.
 */
export async function revisionLocal(list?: string): Promise<string | null> {
  if (!copy) return null;
  await copy.settled();
  return copy.revision(list);
}

/**
 * The token a tab-wide read is kept under: the log's word on its lists where the copy can vouch for every one of them,
 * else the version the poll last heard move. `''` lists asks only about the declarations.
 */
export async function keptToken(lists: readonly string[]): Promise<string> {
  const said = await Promise.all((lists.length === 0 ? [undefined] : lists).map((l) => revisionLocal(l)));
  return said.every((s) => s !== null) ? `log ${said.join(' ')}` : `v ${version}`;
}

/** The record's own format, kernel and primitives, as `version` answers them. */
export function stampLocal(v: { format: number; kernel: number; primitives: number }): void {
  if (copy) void copy.stamp(`${v.format}.${v.kernel}.${v.primitives}`);
}

/** Sign-out, a 401, a refused boot: nothing kept outlives the reason it was kept. */
export function wipeLocal(): Promise<void> {
  dropMark(strings());
  dropAllOut();
  verified.clear();
  return tab().wipe().catch(() => undefined);
}

/**
 * The kept answer for this question on this record, or `null`, never waiting past `NEAR_MS`.
 *
 * BEFORE THE SHELL HAS CLAIMED IT, the copy answers only the last reader (`lastReader`), so a cold open draws at once
 * and a browser somebody else signed in to draws nothing of the last reader's. The declarations it was read under are
 * put back for a tab that has not learnt them, so a screen drawn from it reads its lists as the record said.
 *
 * A COPY LATER THAN THE WAIT IS HANDED TO `late` WHEN IT LANDS: the screen draws it only if the record has not answered
 * yet, so a slow database still beats a slower record and never replaces what the record said.
 */
export async function nearLocal<T>(name: string, key: string, base: string, late?: (near: Near<T>) => void): Promise<Near<T> | null> {
  if (seeingAs() !== null) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waited = false;
  const learn = (near: Near<T>): Near<T> => {
    for (const [id, decl] of Object.entries(near.decls)) REGISTERS[id] ??= decl as RegisterDecl;
    return near;
  };
  const wait = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      waited = true;
      resolve(null);
    }, patient ? OFFLINE_MS : inIosApp ? NEAR_APP_MS : NEAR_MS);
  });
  const asked = lastReader(base).then((person) => tab().answer<T>(name, key, base, person)).catch(() => null);
  const near = await Promise.race([asked, wait]);
  clearTimeout(timer);
  if (near) return learn(near);
  if (waited && late) void asked.then((got) => got && late(learn(got)), () => undefined);
  return null;
}

/** The rail the copy can draw for `person` on `base` (`railOf`): for an offline open with no shell copy. */
export async function railLocal(base: string, person: string): Promise<Rail> {
  return railOf(await tab().held(base, person).catch(() => []));
}

/** How much this browser keeps of the record, for Settings. */
export const localSize = (): Promise<{ answers: number; bytes: number }> => tab().size().catch(() => ({ answers: 0, bytes: 0 }));

/**
 * FORGET THIS DEVICE'S COPY, from Settings: the local copy and its signed marker, the last shell and the offline cache,
 * so an offline open here draws nothing of the record until a live one keeps it again.
 */
export async function forgetLocal(): Promise<void> {
  dropCopy();
  await Promise.all([wipeLocal(), forgetOffline().catch(() => undefined)]);
}

/** The mark to ask under, taken before the call goes out. */
export const localTicket = (): number => tab().ticket();

/** How an answer is kept: where its rows are, so a change can be placed on them, and whether it is asked on every draw. */
export type KeepHow = { spots?: readonly Spot[]; always?: boolean };

/** Keep an answer read from `lists`, with the declarations this tab holds for them, and any the screen read itself. */
export function keepLocal(name: string, key: string, lists: readonly string[], value: unknown, ticket: number, known: Record<string, unknown> = {}, how: KeepHow = {}): void {
  if (seeingAs() !== null) return;
  const decls: Record<string, unknown> = { ...known };
  for (const l of lists) if (decls[l] === undefined && REGISTERS[l] !== undefined) decls[l] = REGISTERS[l];
  void tab().put(name, key, lists, decls, value, ticket, how).catch(() => false);
}
