/**
 * What the cash counter reads from the record, and the one write it makes.
 *
 * A ROUTE-ONLY MODULE, like `rows-write.ts`: only the counter imports it, so the client stays out of every other entry.
 *
 * THE EXPECTED BALANCE IS THE RECORD'S OWN ROLL. Cash now by account (`cash-by-account`) is the figure the count script
 * compares a count with, the newest thing anybody said the account held plus every cleared move after it, so what the
 * counter shows as expected is what the difference will be written against. An account that figure does not name (it is
 * not counted as cash, or is closed) falls back to the balance typed on it and says so.
 *
 * THE WRITE IS THE RECORD'S USUAL ONE: `rowWriter.create` on `cash_counts`, the same call a list's capture line makes.
 */

import { createClient, type Client } from '@braindog/client';

import { learn, type RecordRow } from '../record/remote.ts';
import { REGISTERS } from '../record/held.ts';
import { rowWriter, type Wrote } from '../record/rows-write.ts';
import { recordToday } from '../record/zone.ts';
import { recordNow } from '../record/boot-live.ts';
import { findLedger } from './read.ts';

/** One account to count: the row, its currency and what the record expects it to hold, in hundredths. */
export type Counted = {
  id: string;
  seq: number;
  name: string;
  currency: string;
  /** What the record rolls the account to today, or the balance typed on it where the roll does not name it. */
  expected: number | null;
  /** Whether `expected` is the typed balance and not the record's roll. */
  typed: boolean;
};

export type Loaded = { accounts: Counted[]; categories: string[]; today: string };

type Money = { amount: number; currency: string };
const isMoney = (v: unknown): v is Money => typeof v === 'object' && v !== null && typeof (v as Money).amount === 'number' && typeof (v as Money).currency === 'string';
const where = (text: string): unknown => ({ toJSON: () => text });
const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');

type Group = { key: string; value: number | null; parts?: { currency: string; amount: number }[] };
type Reading = { value: number | null; unit: string | null; groups?: Group[] };

async function rows(client: Client, register: string, filter: string | null): Promise<RecordRow[] | null> {
  const out: RecordRow[] = [];
  let cursor: string | null = null;
  do {
    const got = await client.list({ register, limit: 500, ...(filter === null ? {} : { where: where(filter) }), ...(cursor === null ? {} : { cursor }) } as never);
    if (!got.ok) return null;
    out.push(...(got.value.rows as RecordRow[]));
    cursor = got.value.cursor;
  } while (cursor !== null);
  return out;
}

/**
 * The cash accounts to count, with what each is expected to hold, the category names, and the record's day.
 *
 * WHICH LISTS HOLD THE ACCOUNTS AND THE CATEGORIES IS THE LEDGER'S TO SAY (`ledger.ts`), read off the declarations of the
 * lists the tab holds, as the quick-add sheet reads them, and never off a list's name.
 */
export async function loadCounter(base: string, lists: readonly { id: string; kernel?: true }[]): Promise<{ ok: true; value: Loaded } | { ok: false; fix: string }> {
  const client = createClient({ base });
  const ledger = await findLedger(base, lists);
  if (ledger === null) return { ok: false, fix: 'This record keeps no ledger, so there is no account to count.' };
  const [accounts, categories, byAccount] = await Promise.all([
    rows(client, ledger.account.list, 'kind is cash, state is not closed'),
    ledger.category === null ? Promise.resolve([]) : rows(client, ledger.category.list, null),
    client.metric('cash-by-account').catch(() => null),
    learn(client.schema, 'cash_counts', new Map()).catch(() => undefined),
  ]);
  if (accounts === null) return { ok: false, fix: 'The accounts could not be read.' };
  const reading = byAccount !== null && byAccount.ok ? (byAccount.value as Reading) : null;
  const groups = reading?.groups ?? [];
  const list: Counted[] = [];
  for (const row of accounts) {
    const balance = row.fields.balance;
    if (row.seq === null) continue;
    if (!isMoney(balance)) continue;
    const name = textOf(row.fields.name);
    const group = groups.find((g) => g.key === name);
    /* A GROUP IN ONE CURRENCY IS ITS VALUE UNDER THE READING'S UNIT; a group in several is its parts. The part in this
       account's own currency is the one a count in that currency is compared with. */
    const rolled = group ? (group.parts?.find((p) => p.currency === balance.currency)?.amount ?? (reading?.unit === balance.currency && typeof group.value === 'number' ? Math.round(group.value) : null)) : null;
    list.push({ id: row.id, seq: row.seq, name, currency: balance.currency, expected: rolled ?? balance.amount, typed: rolled === null });
  }
  const names = (categories ?? []).map((c) => textOf(c.fields.name)).filter((n) => n !== '');
  return { ok: true, value: { accounts: list, categories: names, today: recordToday(recordNow()) } };
}

/** Write one count. The record's sentence comes back where it refuses. */
export async function writeCount(base: string, fields: Record<string, unknown>): Promise<Wrote> {
  /* THE WRITER SPELLS A VALUE BY THE LIST'S DECLARATION, so the list is learnt before it is written to. */
  if (REGISTERS.cash_counts === undefined) await learn((id) => createClient({ base }).schema(id), 'cash_counts', new Map());
  return rowWriter(base).create('cash_counts', fields as never);
}
