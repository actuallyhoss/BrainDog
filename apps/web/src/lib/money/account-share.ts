/**
 * Sharing one money account, a household view: the shares that make it, the shares already kept for it, and the reads
 * and writes `AccountShare.svelte` makes. Plain TypeScript with relative imports, so a test loads it in Node.
 *
 * ONE BUNDLE A PERSON (`sheetApi.send`, which keeps more than one share under one bundle), so Stop ends all of it:
 *   1. the account itself, at view or edit, and edit never deletes it;
 *   2. every Ledger line on it, `account is <it>`, at the same rung, so a line added to it is theirs to see too;
 *   3. THE NAMES THOSE LINES NEED, at view only, so a guest never reads "unknown": every category (its amounts hidden,
 *      so a budget is not shown), the account's book, and the payees its lines name now.
 * The kernel's `rowGrantShares` (`packages/kernel/src/row-grants.ts`) is the same first two shares; the names are this
 * screen's, since what a line names is a fact about Money's lists, not about sharing.
 */

import { createClient } from '@braindog/client';
import type { Share } from '@braindog/kernel';

import type { Fetch } from '../record/boot-live.ts';

export type Rung = 'view' | 'edit';
export type Who = { kind: 'person' | 'group' | 'email'; id: string };

/** The most payees one share names by row: past it the rest show by the words on the line, as payees are written. */
export const PAYEES_MOST = 200;

export type AccountShareArgs = {
  who: Who;
  account: string;
  can: Rung;
  /** The account's book, when it is in one. */
  book: string | null;
  /** The payees (organisations) its lines name. */
  payees: readonly string[];
  /** The lists this record holds, so a name list it lacks is not shared. */
  lists: ReadonlySet<string>;
};

/** The shares one account is shared as: the account first, so the bundle is said as "Sam can view Joint account." */
export function accountShares(a: AccountShareArgs): Share[] {
  const out: Share[] = [
    { effect: 'allow', who: a.who, what: { list: 'accounts', rows: [a.account] }, can: a.can, ...(a.can === 'edit' ? { caps: { delete: false } } : {}) },
    { effect: 'allow', who: a.who, what: { list: 'transactions', where: { field: 'account', is: a.account } }, can: a.can },
  ];
  if (a.lists.has('categories')) out.push({ effect: 'allow', who: a.who, what: { lists: ['categories'] }, can: 'view', hide: { categories: ['budget', 'carried'] } });
  if (a.book && a.lists.has('books')) out.push({ effect: 'allow', who: a.who, what: { list: 'books', rows: [a.book] }, can: 'view' });
  const payees = [...new Set(a.payees.filter((p) => typeof p === 'string' && p !== ''))].slice(0, PAYEES_MOST);
  if (payees.length > 0 && a.lists.has('organisations')) out.push({ effect: 'allow', who: a.who, what: { list: 'organisations', rows: payees }, can: 'view' });
  return out;
}

/** One share as the record's `sharing` answers it, the part read here. */
export type Kept = {
  id: string;
  effect: string;
  who: Who | { kind: string; id: string };
  who_name: string | null;
  what: unknown;
  can: string;
  bundle: string | null;
  ended_at: string | null;
};

/** Somebody this account is shared with: who, whether they can edit, and every share to stop. */
export type Holder = { who: string; edit: boolean; ids: string[] };

/** Whether a share is this account's own: the one row of Accounts. */
const isAccount = (what: unknown, account: string): boolean => {
  const w = what as { list?: unknown; rows?: unknown } | null;
  return w !== null && typeof w === 'object' && w.list === 'accounts' && Array.isArray(w.rows) && w.rows.length === 1 && w.rows[0] === account;
};

/** Who holds this account now, each with the shares of their bundle, from the record's live shares. */
export function holdersOf(kept: readonly Kept[], account: string): Holder[] {
  const live = kept.filter((k) => k.ended_at === null);
  const out: Holder[] = [];
  for (const head of live) {
    if (head.effect !== 'allow' || !isAccount(head.what, account)) continue;
    const ids = head.bundle === null ? [head.id] : live.filter((k) => k.bundle === head.bundle).map((k) => k.id);
    out.push({ who: head.who_name ?? head.who.id, edit: head.can === 'edit', ids: [head.id, ...ids.filter((i) => i !== head.id)] });
  }
  return out;
}

type Refused = { ok: false; code: string; fix: string; at: string | undefined };
const refused = (out: { ok: false } & ({ refusal: { code: string; fix: string; at?: string } } | object)): Refused =>
  'refusal' in out ? { ok: false, code: out.refusal.code, fix: out.refusal.fix, at: out.refusal.at } : { ok: false, code: 'VERSION_STALE', fix: '', at: undefined };

/** The record's reads and writes for the sheet: the account, the payees its lines name, who holds it, and Stop. */
export function accountShareApi(base: string, io?: Fetch) {
  const c = createClient({ base, ...(io ? { fetch: io } : {}) });
  return {
    /** The account's id and book, by its number. */
    async account(seq: number): Promise<{ id: string; book: string | null } | null> {
      const out = await c.get('accounts', seq);
      if (!out.ok) return null;
      const row = out.value as { id?: unknown; fields?: { book?: unknown } };
      return typeof row.id === 'string' ? { id: row.id, book: typeof row.fields?.book === 'string' && row.fields.book !== '' ? row.fields.book : null } : null;
    },
    /** The payees the account's lines name, by id, in one count. */
    async payees(account: string): Promise<string[]> {
      const out = await c.countBy({ register: 'transactions', by: 'party', where: { field: 'account', is: account } }).catch(() => null);
      if (!out || !out.ok) return [];
      return out.value.counts.map((x) => x.value).filter((v): v is string => typeof v === 'string' && v !== '');
    },
    async holders(account: string): Promise<Holder[]> {
      const out = await c.call<Kept[]>('sharing');
      return out.ok ? holdersOf(out.value, account) : [];
    },
    /** Stop every share of one holder's bundle; the first refusal is answered. */
    async stop(ids: readonly string[]): Promise<{ ok: true } | Refused> {
      for (const id of ids) {
        const out = await c.call<unknown>('unshare', { id });
        if (!out.ok && !('refusal' in out && out.refusal.code === 'REF_UNKNOWN')) return refused(out);
      }
      return { ok: true };
    },
  };
}
