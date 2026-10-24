/**
 * The sidebar's last list of projects, kept on this device, so every screen draws it at once (scope 2026-10-24 E1).
 *
 * THE SIDEBAR SHOWED ONLY THE WORD "Projects" on 35 of 51 screens on his record at 1512: it reads its own list
 * (`side-read.ts`), and while that read was out, or after it was cut off by the screen moving on (the look logged 92
 * aborted reads), it had nothing to draw. Now the last list it drew is kept here and drawn while the record is asked,
 * and the record's answer replaces it.
 *
 * ONLY WHAT THE ROWS DRAW IS KEPT: each project's name, mark, colour, lane and address, and the lanes' words. Nothing of
 * its week (late work, money), which is read again. ONE ENTRY, FOR ONE RECORD AND ONE PERSON, and only beside the shell
 * this browser keeps for the same record and person (`boot-copy.ts`): that copy is dropped on a sign-out, a refusal and
 * a record switch, and this one is never drawn without it, so it never outlives the reason to draw it.
 *
 * PURE, AND NODE LOADS IT: the store is handed in, as `boot-copy.ts` takes one.
 */

import { readCopy } from '../record/boot-copy.ts';
import type { SideProject } from './side.ts';

export const SIDE_COPY_KEY = 'braindog.side-copy';
/** Bump when the kept shape changes: a copy of another version is not drawn. */
export const SIDE_COPY_VERSION = 1;

/** A project's row as the sidebar draws it before its week. */
export type SideCopyRow = Omit<SideProject, 'late' | 'moved' | 'working' | 'pinned'> & { seq: number };

/** What is kept: the projects list, its rows, its lanes' values, its finished states and their words. */
export type SideCopy = { list: string; rows: SideCopyRow[]; values: string[]; done: string[]; labels: Record<string, string> };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Entry = SideCopy & { v: number; base: string; person: string };

const here = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Who the shell this browser keeps for `base` was read for, or `null` where it keeps none. */
const personOf = (base: string, now: number, store: Store): string | null => readCopy(base, now, store)?.me?.person ?? null;

/** Keep the list the sidebar just drew for the record at `base`, beside the shell kept for it. */
export function keepSide(base: string, copy: SideCopy, now: number = Date.now(), store: Store | null = here()): void {
  if (!store) return;
  try {
    const person = personOf(base, now, store);
    if (person === null) return;
    const entry: Entry = { v: SIDE_COPY_VERSION, base, person, ...copy };
    store.setItem(SIDE_COPY_KEY, JSON.stringify(entry));
  } catch {
    /* full or blocked storage: the sidebar waits for its read, as before */
  }
}

/** The list last kept for `base`, while the shell kept beside it is for the same person; else `null`. */
export function keptSide(base: string, now: number = Date.now(), store: Store | null = here()): SideCopy | null {
  if (!store) return null;
  try {
    const raw = store.getItem(SIDE_COPY_KEY);
    if (raw === null) return null;
    const e = JSON.parse(raw) as Partial<Entry> | null;
    if (!e || e.v !== SIDE_COPY_VERSION || e.base !== base || typeof e.list !== 'string' || !Array.isArray(e.rows)) return null;
    const person = personOf(base, now, store);
    if (person === null || person !== e.person) {
      store.removeItem(SIDE_COPY_KEY);
      return null;
    }
    const words = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    const labels = Object.fromEntries(Object.entries(e.labels ?? {}).filter((kv): kv is [string, string] => typeof kv[1] === 'string'));
    const rows = e.rows.filter((r): r is SideCopyRow => typeof r?.key === 'string' && typeof r.name === 'string' && typeof r.href === 'string' && typeof r.seq === 'number');
    return { list: e.list, rows, values: words(e.values), done: words(e.done), labels };
  } catch {
    return null;
  }
}
