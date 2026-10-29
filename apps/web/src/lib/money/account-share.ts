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
import type { RegisterDecl } from '../record/schema.ts';
import { ledgerAmong } from './ledger.ts';

export type Rung = 'view' | 'edit';
export type Who = { kind: 'person' | 'group' | 'email'; id: string };

/** The most payees one share names by row: past it the rest show by the words on the line, as payees are written. */
export const PAYEES_MOST = 200;

/**
 * THE LISTS A SHARE REACHES INTO, READ OFF THE DECLARATIONS AND NEVER OFF A NAME (`ledger.ts`): the account list and
 * the ledger whose required link points at it; the categories the ledger files a line under, with the amounts kept on
 * a category (its budget and what carried over) hidden; the book, the list the account and its lines both link to;
 * and the payees, the list the ledger links to that declares itself the organisations (`org:`, the kernel's `roles.ts`).
 * A record whose organisations say no `org:` (People before the role keys) shares no payee by row, and a guest reads
 * the words on the line, as past `PAYEES_MOST`.
 */
export type ShareLists = {
  account: string;
  ledger: string;
  /** The ledger's link to its account. */
  on: string;
  categories: { list: string; hide: readonly string[] } | null;
  book: { list: string; field: string } | null;
  payees: { list: string; field: string } | null;
};

const live = (f: { retired?: boolean }): boolean => f.retired !== true;

/** The share's lists on this record, or `null` where it keeps no ledger. */
export function shareListsOf(decls: readonly RegisterDecl[]): ShareLists | null {
  const ledger = ledgerAmong(decls);
  if (!ledger) return null;
  const byId = new Map(decls.map((d) => [d.id, d]));
  const own = byId.get(ledger.list);
  if (!own || !byId.has(ledger.account.list)) return null;
  const refs = (d: RegisterDecl) => d.fields.filter((f) => live(f) && f.type === 'ref' && typeof f.to === 'string' && f.to !== d.id);
  const cat = ledger.category ? byId.get(ledger.category.list) : undefined;
  const taken = new Set([ledger.list, ledger.account.list, ledger.category?.list, ledger.book?.list]);
  const payeeF = refs(own).find((f) => !taken.has(f.to) && byId.get(f.to!)?.org !== undefined);
  return {
    account: ledger.account.list,
    ledger: ledger.list,
    on: ledger.account.field,
    categories: cat ? { list: cat.id, hide: cat.fields.filter((f) => live(f) && f.type === 'money').map((f) => f.id) } : null,
    book: ledger.book ? { list: ledger.book.list, field: ledger.book.field } : null,
    payees: payeeF ? { list: payeeF.to!, field: payeeF.id } : null,
  };
}

export type AccountShareArgs = {
  who: Who;
  account: string;
  can: Rung;
  /** The account's book, when it is in one. */
  book: string | null;
  /** The payees (organisations) its lines name. */
  payees: readonly string[];
  /** The lists the share reaches into (`shareListsOf`). */
  lists: ShareLists;
};

/** The shares one account is shared as: the account first, so the bundle is said as "Sam can view Joint account." */
export function accountShares(a: AccountShareArgs): Share[] {
  const l = a.lists;
  const out: Share[] = [
    { effect: 'allow', who: a.who, what: { list: l.account, rows: [a.account] }, can: a.can, ...(a.can === 'edit' ? { caps: { delete: false } } : {}) },
    { effect: 'allow', who: a.who, what: { list: l.ledger, where: { field: l.on, is: a.account } }, can: a.can },
  ];
  if (l.categories) out.push({ effect: 'allow', who: a.who, what: { lists: [l.categories.list] }, can: 'view', ...(l.categories.hide.length > 0 ? { hide: { [l.categories.list]: [...l.categories.hide] } } : {}) });
  if (a.book && l.book) out.push({ effect: 'allow', who: a.who, what: { list: l.book.list, rows: [a.book] }, can: 'view' });
  const payees = [...new Set(a.payees.filter((p) => typeof p === 'string' && p !== ''))].slice(0, PAYEES_MOST);
  if (payees.length > 0 && l.payees) out.push({ effect: 'allow', who: a.who, what: { list: l.payees.list, rows: payees }, can: 'view' });
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

/** Whether a share is this account's own: the one row of the account list. */
const isAccount = (what: unknown, list: string, account: string): boolean => {
  const w = what as { list?: unknown; rows?: unknown } | null;
  return w !== null && typeof w === 'object' && w.list === list && Array.isArray(w.rows) && w.rows.length === 1 && w.rows[0] === account;
};

/** Who holds this account now, each with the shares of their bundle, from the record's live shares. */
export function holdersOf(kept: readonly Kept[], list: string, account: string): Holder[] {
  const live = kept.filter((k) => k.ended_at === null);
  const out: Holder[] = [];
  for (const head of live) {
    if (head.effect !== 'allow' || !isAccount(head.what, list, account)) continue;
    const ids = head.bundle === null ? [head.id] : live.filter((k) => k.bundle === head.bundle).map((k) => k.id);
    out.push({ who: head.who_name ?? head.who.id, edit: head.can === 'edit', ids: [head.id, ...ids.filter((i) => i !== head.id)] });
  }
  return out;
}

type Refused = { ok: false; code: string; fix: string; at: string | undefined };
const refused = (out: { ok: false } & ({ refusal: { code: string; fix: string; at?: string } } | object)): Refused =>
  'refusal' in out ? { ok: false, code: out.refusal.code, fix: out.refusal.fix, at: out.refusal.at } : { ok: false, code: 'VERSION_STALE', fix: '', at: undefined };

/** The record's reads and writes for the sheet: the account, the payees its lines name, who holds it, and Stop. */
export function accountShareApi(base: string, lists: ShareLists, io?: Fetch) {
  const c = createClient({ base, ...(io ? { fetch: io } : {}) });
  return {
    /** The account's id and book, by its number. */
    async account(seq: number): Promise<{ id: string; book: string | null } | null> {
      const out = await c.get(lists.account, seq);
      if (!out.ok) return null;
      const row = out.value as { id?: unknown; fields?: Record<string, unknown> };
      const book = lists.book ? row.fields?.[lists.book.field] : undefined;
      return typeof row.id === 'string' ? { id: row.id, book: typeof book === 'string' && book !== '' ? book : null } : null;
    },
    /** The payees the account's lines name, by id, in one count. */
    async payees(account: string): Promise<string[]> {
      if (!lists.payees) return [];
      const out = await c.countBy({ register: lists.ledger, by: lists.payees.field, where: { field: lists.on, is: account } }).catch(() => null);
      if (!out || !out.ok) return [];
      return out.value.counts.map((x) => x.value).filter((v): v is string => typeof v === 'string' && v !== '');
    },
    async holders(account: string): Promise<Holder[]> {
      const out = await c.call<Kept[]>('sharing');
      return out.ok ? holdersOf(out.value, lists.account, account) : [];
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
