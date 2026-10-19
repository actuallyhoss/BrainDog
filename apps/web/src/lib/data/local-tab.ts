/**
 * The local copy for this tab (`local.ts`): one, over IndexedDB, or over memory where the browser has none.
 *
 * THE SHELL CLAIMS IT AND THE POLL MOVES IT. The layout calls `claimLocal` with the reader a live boot names, the
 * version poll calls `heardLocal` on every move and `stampLocal` with the record's format, and sign-out, a 401 and a
 * refused boot call `wipeLocal`. Screens only ask `nearLocal` and hand answers to `keepLocal`.
 *
 * `@braindog/client` IS IMPORTED WHEN THE LOG IS FIRST ASKED, for `live.svelte.ts`'s reason: this file is reached from
 * the layout, and the client carries the route table.
 */

import { version as build } from '$app/environment';

import { REGISTERS } from '../record/held.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { readCopy } from '../record/boot-copy.ts';
import { idbStore } from './local-db.ts';
import { localCopy, memoryStore, scopeOf, type LocalCopy, type Log, type Near } from './local.ts';

/** How long a screen waits for the copy before it asks the record without it. */
const NEAR_MS = 60;

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

/** The reader a live boot named. Call only with a shell the record answered, never a drawn copy or a refusal. */
export function claimLocal(base: string, me: { person: string; level: string; owner: boolean; lists: string[] | null; levels?: Readonly<Record<string, string>> | undefined }): void {
  void tab().claim({ base, person: me.person, scope: scopeOf(me) });
}

/** The record moved. */
export function heardLocal(): void {
  if (copy) void copy.heard();
}

/** The record's own format, kernel and primitives, as `version` answers them. */
export function stampLocal(v: { format: number; kernel: number; primitives: number }): void {
  if (copy) void copy.stamp(`${v.format}.${v.kernel}.${v.primitives}`);
}

/** Sign-out, a 401, a refused boot: nothing kept outlives the reason it was kept. */
export function wipeLocal(): Promise<void> {
  return tab().wipe().catch(() => undefined);
}

/**
 * The kept answer for this question on this record, or `null`, never waiting past `NEAR_MS`.
 *
 * BEFORE THE SHELL HAS CLAIMED IT, the copy answers only the person the last shell copy names, so a cold open draws at
 * once and a browser somebody else signed in to draws nothing of the last reader's. The declarations it was read
 * under are put back for a tab that has not learnt them, so a screen drawn from it reads its lists as the record said.
 */
export async function nearLocal<T>(name: string, key: string, base: string): Promise<Near<T> | null> {
  const person = readCopy(base)?.me.person ?? null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), NEAR_MS)));
  try {
    const near = await Promise.race([tab().answer<T>(name, key, base, person).catch(() => null), late]);
    if (near) for (const [id, decl] of Object.entries(near.decls)) REGISTERS[id] ??= decl as RegisterDecl;
    return near;
  } finally {
    clearTimeout(timer);
  }
}

/** The mark to ask under, taken before the call goes out. */
export const localTicket = (): number => tab().ticket();

/** Keep an answer read from `lists`, with the declarations this tab holds for them, and any the screen read itself. */
export function keepLocal(name: string, key: string, lists: readonly string[], value: unknown, ticket: number, known: Record<string, unknown> = {}): void {
  const decls: Record<string, unknown> = { ...known };
  for (const l of lists) if (decls[l] === undefined && REGISTERS[l] !== undefined) decls[l] = REGISTERS[l];
  void tab().put(name, key, lists, decls, value, ticket).catch(() => false);
}
