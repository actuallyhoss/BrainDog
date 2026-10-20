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
 * `@braindog/client` IS IMPORTED WHEN THE LOG IS FIRST ASKED, for `live.svelte.ts`'s reason: this file is reached from
 * the layout, and the client carries the route table.
 */

import { version as build } from '$app/environment';

import { REGISTERS } from '../record/held.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { dropCopy, readCopy } from '../record/boot-copy.ts';
import { idbKey, idbStore, openEarly } from './local-db.ts';
import { dropMark, memoryKey, readMark, writeMark, type MarkDeps } from './local-mark.ts';
import { localCopy, memoryStore, railOf, scopeOf, type LocalCopy, type Log, type Near, type Rail, type Spot } from './local.ts';
import { forget as forgetOffline } from './offline.ts';

/** How long a screen waits for the copy before it asks the record without it. */
const NEAR_MS = 60;
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
  openEarly();
  void lastReader(base)
    .then((person) => tab().answer('', '', base, person))
    .catch(() => undefined);
}

let copy: LocalCopy | null = null;

function log(base: string): Log {
  let client: Promise<import('@braindog/client').Client> | null = null;
  const c = () => (client ??= import('@braindog/client').then(({ createClient }) => createClient({ base })));
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

/** The reader a live boot named. Call only with a shell the record answered, never a drawn copy or a refusal. */
export function claimLocal(base: string, me: { person: string; level: string; owner: boolean; lists: string[] | null; levels?: Readonly<Record<string, string>> | undefined }): void {
  void tab()
    .claim({ base, person: me.person, scope: scopeOf(me) })
    /* AFTER THE CLAIM, which clears the key with the copy when the owner changed: the marker is signed with the new one. */
    .then(() => writeMark(base, me.person, markDeps()))
    .then(() => void verified.delete(base))
    .catch(() => undefined);
}

/** The record moved. */
export function heardLocal(): void {
  if (copy) void copy.heard();
}

/** When the copy has caught up to every move heard so far: a screen following the log reads it after this. */
export const settledLocal = (): Promise<void> => (copy ? copy.settled() : Promise.resolve());

/** The record's own format, kernel and primitives, as `version` answers them. */
export function stampLocal(v: { format: number; kernel: number; primitives: number }): void {
  if (copy) void copy.stamp(`${v.format}.${v.kernel}.${v.primitives}`);
}

/** Sign-out, a 401, a refused boot: nothing kept outlives the reason it was kept. */
export function wipeLocal(): Promise<void> {
  dropMark(strings());
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
    }, patient ? OFFLINE_MS : NEAR_MS);
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
  const decls: Record<string, unknown> = { ...known };
  for (const l of lists) if (decls[l] === undefined && REGISTERS[l] !== undefined) decls[l] = REGISTERS[l];
  void tab().put(name, key, lists, decls, value, ticket, how).catch(() => false);
}
