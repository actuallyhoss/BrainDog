/**
 * Sharing in the app (sharing plan slice 10): the shares the record keeps, read and said the way Settings > Sharing
 * draws them, the calls that stop one or change a group, and what the person a share let in is told.
 *
 * THE RECORD SAYS EVERY SHARE, THE APP GROUPS THEM. `sharing` answers each share as one sentence with names in it
 * (`methods/sharing.ts`), and who it is with by name (`who_name`) and what it is about (`subject`), so nothing here
 * builds a sentence of its own from ids. What this file decides is where each one is drawn: Shared, Waiting (an
 * address nobody has accepted for yet) or Ended (the last 30 days), grouped by the person or group it is with.
 *
 * THE SHARE SHEET IS ANOTHER FILE'S (`ShareSheet.svelte`), AND THIS ONE ASKS FOR IT BY AN EVENT: `askSheet` sends
 * `braindog:share-sheet` on the window with the share to change, or nothing for a new one, and the sheet answers
 * `braindog:shared` once it kept one, which the Sharing page reads again on. See as is asked the same way
 * (`braindog:see-as`), so neither side imports the other.
 *
 * PLAIN TYPESCRIPT, SO NODE LOADS IT: `sharing.test.ts` drives the grouping and the ended handling without a browser.
 */

import { copy } from '../copy.ts';


/** Who a share is with, as the record keeps it: a person, a group, an address waiting for its person, or a link. */
export type Who = { kind: 'person' | 'group' | 'email' | 'link'; id: string };

/** When a share is on, as the grammar says it. */
export type When = { from?: string; until?: string; hours?: { days: number[]; from: string; to: string }; once?: true };

/** One share as `sharing` answers it (`SharingRow` in `packages/record/src/methods/sharing.ts`). */
export type SharingRow = {
  id: string;
  sentence: string;
  effect: 'allow' | 'deny';
  who: Who;
  who_name: string | null;
  subject: string;
  what: unknown;
  can: 'view' | 'comment' | 'edit' | 'manage';
  caps: Record<string, boolean> | null;
  hide: unknown;
  when: When | null;
  parent_id: string | null;
  bundle: string | null;
  template: string | null;
  note: string | null;
  version: number;
  made_by: string;
  made_at: string;
  ended_at: string | null;
};

/** One group as `groups` answers it: its name, its people by name, and how many live shares it holds. */
export type GroupRow = { id: string; name: string; people: { id: string; name: string | null }[]; shares: number };

/** One of the caller's own shares as `myShares` answers it, with who shared it and the line said to them. */
export type MyShare = { id: string; sentence: string; can: string; until: string | null; onward: boolean; live: boolean; by: string | null; welcome: string };

/** Where a share is drawn on the Sharing page. */
export type ShareState = 'live' | 'waiting' | 'ended';

/** How long an ended share stays on the page, in days (§3.2): the record answers the same window. */
export const ENDED_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Where one share is drawn now: ended when it was stopped or its last day has passed, waiting when it is with an address
 * nobody has accepted for yet, and live otherwise.
 */
export function stateOf(row: Pick<SharingRow, 'who' | 'when' | 'ended_at'>, now: number): ShareState {
  if (row.ended_at !== null) return 'ended';
  const until = row.when?.until === undefined ? NaN : Date.parse(row.when.until);
  if (Number.isFinite(until) && until <= now) return 'ended';
  return row.who.kind === 'email' ? 'waiting' : 'live';
}

/** When a share ended, as an instant: when it was stopped, else its last day. `null` for one still on. */
export function endedAt(row: Pick<SharingRow, 'when' | 'ended_at'>): string | null {
  return row.ended_at ?? row.when?.until ?? null;
}

/** The shares with one person, group or address, under their name. */
export type Bunch = { key: string; kind: Who['kind']; name: string; rows: SharingRow[] };

/** Who a share is with, by name and never by id: the record's name for them, an address as spelt, else Someone. */
export function whoSaid(row: Pick<SharingRow, 'who' | 'who_name'>): string {
  if (row.who_name !== null && row.who_name.trim() !== '') return row.who_name;
  return row.who.kind === 'email' ? row.who.id : copy.sharingSomeone;
}

/**
 * The page's three lists, each grouped by who the shares are with: Shared, Waiting and Ended. Groups come first, then
 * people, each by name; inside one, the newest share first, as the record answers them. Ended keeps only the last
 * `ENDED_DAYS`, newest ended first.
 */
export function sharingSections(rows: readonly SharingRow[], now: number): { shared: Bunch[]; waiting: Bunch[]; ended: Bunch[] } {
  const into = (list: readonly SharingRow[]): Bunch[] => {
    const by = new Map<string, Bunch>();
    for (const r of list) {
      const key = `${r.who.kind}:${r.who.id}`;
      const b = by.get(key) ?? { key, kind: r.who.kind, name: whoSaid(r), rows: [] };
      b.rows.push(r);
      by.set(key, b);
    }
    const rank = (k: Who['kind']): number => (k === 'group' ? 0 : k === 'person' ? 1 : 2);
    return [...by.values()].sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  };
  const since = now - ENDED_DAYS * DAY_MS;
  const ended = rows
    .filter((r) => stateOf(r, now) === 'ended')
    .filter((r) => {
      const at = Date.parse(endedAt(r) ?? '');
      return !Number.isFinite(at) || at >= since;
    })
    .sort((a, b) => Date.parse(endedAt(b) ?? '') - Date.parse(endedAt(a) ?? ''));
  return {
    shared: into(rows.filter((r) => stateOf(r, now) === 'live')),
    waiting: into(rows.filter((r) => stateOf(r, now) === 'waiting')),
    ended: into(ended),
  };
}

/** The question and the answer for Stop (§3.5): "Stop sharing Kiln with Priya?" then "Stopped. Priya can't see Kiln now." */
export function stopWords(row: Pick<SharingRow, 'who' | 'who_name' | 'subject'>): { ask: string; done: string; label: string } {
  const who = whoSaid(row);
  return { ask: copy.sharingStopAsk(row.subject, who), done: copy.sharingStopped(row.subject, who), label: copy.sharingStopLabel(row.subject, who) };
}

/**
 * The share whose first-open line the person a share let in has not been shown yet, newest first among the live ones,
 * or `null`. `seen` is the ids already shown on this device.
 */
export function welcomeOf(mine: readonly MyShare[], seen: ReadonlySet<string>): MyShare | null {
  return [...mine].reverse().find((s) => s.live && s.welcome.trim() !== '' && !seen.has(s.id)) ?? null;
}

/* ── the calls ────────────────────────────────────────────────────────────────────────────────────────────────── */

type Wire<T> = { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string; at?: string } } | { ok: false; conflict: unknown };
/** The client's `call`, which is all this file needs of it. */
export type Caller = { call: <T>(name: string, args?: Record<string, unknown>) => Promise<Wire<T>> };

/** An answer as a screen reads it: the value, or the record's sentence and its code. */
export type Got<T> = { ok: true; value: T } | { ok: false; code: string; fix: string };

async function got<T>(out: Promise<Wire<T>>): Promise<Got<T>> {
  try {
    const r = await out;
    if (r.ok) return r;
    return 'refusal' in r ? { ok: false, code: r.refusal.code, fix: r.refusal.fix } : { ok: false, code: 'VERSION_STALE', fix: copy.writeRaced };
  } catch {
    return { ok: false, code: 'UNREACHABLE', fix: copy.recordNotReached };
  }
}

const listOf = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Every share on the record, live and ended in the last 30 days. An owner's or an Admin's. */
export const readSharing = async (c: Caller): Promise<Got<SharingRow[]>> => {
  const out = await got(c.call<SharingRow[]>('sharing'));
  return out.ok ? { ok: true, value: listOf<SharingRow>(out.value) } : out;
};

/** Every live group, by name. An owner's or an Admin's. */
export const readGroups = async (c: Caller): Promise<Got<GroupRow[]>> => {
  const out = await got(c.call<GroupRow[]>('groups'));
  return out.ok ? { ok: true, value: listOf<GroupRow>(out.value) } : out;
};

/** What has been shared with the person asking. */
export const readMine = async (c: Caller): Promise<Got<MyShare[]>> => {
  const out = await got(c.call<MyShare[]>('myShares'));
  return out.ok ? { ok: true, value: listOf<MyShare>(out.value) } : out;
};

/** One line of "Seen and changed" (§2.10) as `shareActivity` says it: who, through which share, and what, in words. */
export type ActivityLine = { who: string; via: string; said: string };

/** What one person saw and changed in the last 30 days, a line for each share that let them. An owner's or an Admin's. */
export const readActivity = async (c: Caller, person: string): Promise<Got<ActivityLine[]>> => {
  const out = await got(c.call<{ lines: ActivityLine[] }>('shareActivity', { person }));
  return out.ok ? { ok: true, value: listOf<ActivityLine>(out.value?.lines) } : out;
};

/** Stop one share at once, and every share made onward from it. */
export const stopShare = (c: Caller, id: string): Promise<Got<{ ended: string[]; left: string[] }>> => got(c.call('unshare', { id }));

/** Make a group, or retire one, which stops everything it shares. */
export const makeGroup = (c: Caller, name: string): Promise<Got<GroupRow>> => got(c.call('groupPut', { name }));
export const retireGroup = (c: Caller, id: string): Promise<Got<GroupRow>> => got(c.call('groupPut', { id, retire: true }));

/** Put somebody in a group, or take them out, which ends the group's shares for them. */
export const groupMember = (c: Caller, group: string, person: string, on: boolean): Promise<Got<GroupRow>> => got(c.call('groupMember', { group, person, in: on }));

/* ── the Share sheet and See as, by event ──────────────────────────────────────────────────────────────────────── */

/** The event the Share sheet listens for: open it, on a share to change, or on nothing for a new one. */
export const SHEET_EVENT = 'braindog:share-sheet';
/** The event the Share sheet sends once it kept a share, which the Sharing page reads again on. */
export const SHARED_EVENT = 'braindog:shared';
/** The event See as listens for: see the record as this person (§3.3). */
export const SEE_AS_EVENT = 'braindog:see-as';

/** What the sheet is asked to open on: a share to change, else who to share with, else nothing. */
export type SheetAsk = { share?: SharingRow; who?: Who };
/** Who to see the record as, by id and by name. */
export type SeeAsAsk = { person: string; name: string };

type Target = { dispatchEvent(e: Event): boolean };
const windowOf = (): Target | null => (typeof globalThis.dispatchEvent === 'function' ? (globalThis as unknown as Target) : null);

/** Ask the Share sheet to open. `false` when there is no window to ask in. */
export function askSheet(ask: SheetAsk = {}, target: Target | null = windowOf()): boolean {
  if (target === null) return false;
  target.dispatchEvent(new CustomEvent<SheetAsk>(SHEET_EVENT, { detail: ask }));
  return true;
}

/** Ask See as to show the record as one person. `false` when there is no window to ask in. */
export function askSeeAs(ask: SeeAsAsk, target: Target | null = windowOf()): boolean {
  if (target === null) return false;
  target.dispatchEvent(new CustomEvent<SeeAsAsk>(SEE_AS_EVENT, { detail: ask }));
  return true;
}

/* ── the first-open line, shown once a share a device ─────────────────────────────────────────────────────────── */

type Strings = Pick<Storage, 'getItem' | 'setItem'>;
const strings = (): Strings | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const WELCOMED = 'braindog.welcomed';
const keyOf = (base: string): string => `${WELCOMED}:${base}`;

/** The shares whose first-open line this device has shown on `base`. */
export function welcomed(base: string, store: Strings | null = strings()): Set<string> {
  try {
    const raw = store?.getItem(keyOf(base));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Mark a share's first-open line shown on `base`, keeping the last fifty. */
export function markWelcomed(base: string, id: string, store: Strings | null = strings()): void {
  try {
    const ids = [...welcomed(base, store), id].slice(-50);
    store?.setItem(keyOf(base), JSON.stringify([...new Set(ids)]));
  } catch {
    /* blocked storage: the line shows again next open, which is the safe side */
  }
}
