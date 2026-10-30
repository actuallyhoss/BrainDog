/**
 * What "Import a statement" reads from the record and writes to it. A route-only module, like `cash-count-live.ts`: only
 * the import screen imports it, so the client stays out of every other entry.
 *
 * READS: the ledger and its accounts, found from the declarations the tab holds as the quick-add sheet finds them
 * (`read.ts` `findLedger`), and the account's own lines over the days the file covers, a day either side, for the dedupe.
 *
 * WRITES: one ordinary `create` a line, a few at a time, as the first run writes a file it was pointed at.
 */

import { createClient, type Client } from '@braindog/client';

import { REGISTERS } from '../record/held.ts';
import type { RecordRow } from '../record/remote.ts';
import type { Ledger } from './ledger.ts';
import { findLedger } from './read.ts';
import { balanceFieldOf, dayPlus, heldOf, spanOf, type Held, type Line } from './statement.ts';

type Listed = { id: string; kernel?: true };

/** One open account to import into. */
export type Into = { id: string; seq: number; name: string; currency: string };

export type Loaded = { ledger: Ledger; balance: string | null; accounts: Into[] };

/** The lines one write sends at once: enough to be quick, few enough to leave the record room for anybody else. */
const AT_ONCE = 4;
/** The Ledger lines read for the dedupe, at most. */
const HELD_MOST = 5000;

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

async function every(client: Client, register: string, where: unknown, most: number): Promise<RecordRow[] | null> {
  const out: RecordRow[] = [];
  let cursor: string | null = null;
  do {
    const got = await client.list({ register, limit: 500, ...(where === null ? {} : { where }), ...(cursor === null ? {} : { cursor }) });
    if (!got.ok) return null;
    out.push(...(got.value.rows as RecordRow[]));
    cursor = got.value.cursor;
  } while (cursor !== null && out.length < most);
  return out;
}

/** The ledger, where a running balance goes, and the open accounts, by name. */
export async function loadStatement(base: string, lists: readonly Listed[]): Promise<{ ok: true; value: Loaded } | { ok: false; fix: string }> {
  const ledger = await findLedger(base, lists);
  if (ledger === null) return { ok: false, fix: 'This record keeps no ledger to import into.' };
  const a = ledger.account;
  const rows = await every(createClient({ base }), a.list, null, 1000);
  if (rows === null) return { ok: false, fix: 'The accounts could not be read.' };
  const accounts: Into[] = [];
  for (const r of rows) {
    if (r.seq === null || (a.state && a.done.includes(text(r.fields[a.state])))) continue;
    const money = a.money ? (r.fields[a.money] as { currency?: unknown } | null) : null;
    if (typeof money?.currency !== 'string') continue;
    accounts.push({ id: r.id, seq: r.seq, name: text(r.fields[a.title]) || 'No name', currency: money.currency });
  }
  accounts.sort((x, y) => x.name.localeCompare(y.name));
  return { ok: true, value: { ledger, balance: balanceFieldOf(REGISTERS[ledger.list]?.fields ?? [], ledger.amount), accounts } };
}

/**
 * The account's Ledger lines over the days the file covers, three days either side, as the dedupe reads them: an alert
 * is dated the day the money moved, and the statement the day the bank posted it.
 */
export async function heldFor(base: string, ledger: Ledger, account: string, lines: readonly Line[], balance: string | null = null): Promise<Held[] | null> {
  const span = spanOf(lines);
  if (span === null) return [];
  const where = {
    all: [
      { field: ledger.account.field, is: account },
      { field: ledger.day, gte: dayPlus(span.from, -3) },
      { field: ledger.day, lte: dayPlus(span.to, 3) },
    ],
  };
  const rows = await every(createClient({ base }), ledger.list, where, HELD_MOST);
  if (rows === null) return null;
  return rows.map((r) => heldOf(r.fields, ledger, balance)).filter((h): h is Held => h !== null);
}

/** What the write came to: how many went in, how many the record refused, and its first sentence why. */
export type Added = { added: number; missed: number; why: string };

/** Write each line, a few at a time, saying how far it has got. */
export async function addLines(base: string, list: string, rows: readonly Record<string, unknown>[], progress: (done: number) => void): Promise<Added> {
  const client = createClient({ base });
  const queue = [...rows];
  let done = 0;
  let missed = 0;
  let why = '';
  const worker = async (): Promise<void> => {
    for (let fields = queue.shift(); fields !== undefined; fields = queue.shift()) {
      const out = await client.create({ register: list, fields }).catch(() => null);
      if (!out?.ok) {
        missed++;
        const fix = (out as { refusal?: { fix?: string } } | null)?.refusal?.fix;
        if (why === '' && fix) why = fix;
      }
      progress(++done);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  return { added: rows.length - missed, missed, why };
}
