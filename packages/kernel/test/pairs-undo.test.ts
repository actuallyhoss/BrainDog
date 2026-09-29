/**
 * A pair is a claim about two rows as they stand now, and it has to stop being made when they stop standing that way.
 *
 * The first form made a pair once and then kept it whatever happened: a leg corrected to another amount, retyped the
 * other way or deleted left its partner marked, so Spent hid GBP 900.00, 800.00 and 400.00 in the three measured cases.
 * A void or pending row was a candidate, so a real payment paired with a line that never happened. A person who
 * unmarked one leg left the other hidden, and a `false` he set was overwritten by the next bank line that matched. And
 * the first row to arrive took a leg that a later, nearer row was the real partner of.
 *
 * EVERY FIGURE HERE IS READ THE WAY THE LEDGER PAGE READS IT: `k.list` with Money's own `spent-30d` and `received-30d`
 * sentences minus the date window, over a register with money-core's shape (a positive amount, `direction` saying the
 * way, a `state` of pending, cleared or void, and a `bool` mark defaulting to false).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const PERSON = { actor: 'p_1' };
const BANK = { actor: 'ingest:bank' };

const BASE = { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'moved' };

const LEDGER = (pairs: unknown = BASE): Declaration => ({
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    state: 'state',
    done: ['cleared', 'void'],
    pairs,
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
      { id: 'moved', type: 'bool', default: false },
    ],
  } as never,
});

/** The rows that count, which is `state is cleared`: what the declaration says with `where:`. */
const CLEARED = { ...BASE, where: { field: 'state', is: 'cleared' } };

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const DAY = (n: number) => new Date(Date.UTC(2026, 8, 10 + n, 12)).toISOString().slice(0, 10);

async function record(decls: Declaration[] = [LEDGER()]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install(decls);
  assert.ok(out.ok, JSON.stringify(out));
  return { k, sql };
}

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const leg = (
  k: Kernel,
  what: string,
  on: string,
  direction: 'in' | 'out',
  amount: number,
  account: string,
  by: { actor: string } = PERSON,
  extra: Record<string, unknown> = {},
): Entry => made(k.create('ledger', { what, on, direction, amount: gbp(amount), account, ...extra }, by));

const now = (k: Kernel, id: string): Entry => k.get(id)!;

/** Money's `spent-30d` and `received-30d`, without the window, in pounds and pence as the page prints them. */
const total = (k: Kernel, direction: 'in' | 'out'): string => {
  const rows = made(k.list({ register: 'ledger', where: `state is cleared, moved is false, direction is ${direction}`, limit: 500 })) as unknown as {
    rows: Entry[];
  };
  const pence = rows.rows.reduce((sum, r) => sum + (r.fields.amount as { amount: number }).amount, 0);
  return (pence / 100).toFixed(2);
};
const spent = (k: Kernel) => total(k, 'out');
const received = (k: Kernel) => total(k, 'in');

const unpaired = (k: Kernel, id: string, why: string): void => {
  const row = now(k, id);
  assert.equal(row.fields._pair, undefined, `${why}: ${row.fields.what} still names ${String(row.fields._pair)}`);
  assert.equal(row.fields.moved, false, `${why}: ${row.fields.what} is still marked`);
};

/* ─────────────── a pair outlives an edit and a delete ─────────────── */

test('A LEG CORRECTED TO ANOTHER AMOUNT UNPAIRS BOTH, and Spent reads the 900.00 it was corrected to', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO RESERVE', DAY(0), 'out', 40_000, 'current');
  const back = leg(k, 'TRANSFER FROM CURRENT', DAY(1), 'in', 40_000, 'reserve');
  assert.equal(now(k, out.id).fields._pair, back.id);
  assert.equal(spent(k), '0.00');

  made(k.update('ledger', out.id, { amount: gbp(90_000) }, PERSON));
  assert.equal(spent(k), '900.00');
  unpaired(k, out.id, 'the corrected leg');
  unpaired(k, back.id, 'its old partner');
  assert.equal(received(k), '400.00');

  /* THE UNPAIRING IS IN THE HISTORY, as the pairing was: the survivor's mark back to false and its `_pair` cleared,
     in the batch of the write that caused it, so "why is this counted again" has an answer. */
  const said = sql.all<{ field: string; from_v: string | null; to_v: string | null }>(
    "SELECT field, from_v, to_v FROM event WHERE target = ? AND field IN ('moved', '_pair') ORDER BY rowid",
    `entry:${back.id}`,
  );
  assert.deepEqual(
    said.map((e) => [e.field, e.from_v, e.to_v]),
    [
      ['moved', 'false', 'true'],
      ['_pair', null, JSON.stringify(out.id)],
      ['moved', 'true', 'false'],
      ['_pair', JSON.stringify(out.id), null],
    ],
  );
  sql.close();
});

test('THE IN LEG RETYPED AS OUT UNPAIRS BOTH, and Spent reads the two payments, 800.00', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO RESERVE', DAY(0), 'out', 40_000, 'current');
  const back = leg(k, 'TRANSFER FROM CURRENT', DAY(1), 'in', 40_000, 'reserve');
  assert.equal(now(k, back.id).fields._pair, out.id);

  made(k.update('ledger', back.id, { direction: 'out' }, PERSON));
  assert.equal(spent(k), '800.00');
  unpaired(k, out.id, 'the untouched leg');
  unpaired(k, back.id, 'the retyped leg');
  sql.close();
});

test('A DELETED LEG UNPAIRS ITS PARTNER, and the leg written again pairs with it as the first one did', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO RESERVE', DAY(0), 'out', 40_000, 'current');
  const back = leg(k, 'TRANSFER FROM CURRENT', DAY(1), 'in', 40_000, 'reserve');

  made(k.update('ledger', back.id, { deleted_at: 'now' }, PERSON));
  assert.equal(spent(k), '400.00');
  unpaired(k, out.id, 'the survivor of a delete');

  /* THE SECOND HALF. A re-import writes the in leg again; the survivor named the deleted row, so it was nobody's
     candidate, the new leg landed unmarked, and Received counted 400.00 that was only moved. */
  const again = leg(k, 'TRANSFER FROM CURRENT', DAY(1), 'in', 40_000, 'reserve');
  assert.equal(now(k, again.id).fields._pair, out.id);
  assert.equal(now(k, out.id).fields._pair, again.id);
  assert.equal(spent(k), '0.00');
  assert.equal(received(k), '0.00');
  sql.close();
});

/* ─────────────── a void or pending row is somebody's partner ─────────────── */

test('A VOID OR PENDING ROW IS NOBODY’S PARTNER when the declaration says which rows count, and a pending row that clears is', async () => {
  const { k, sql } = await record([LEDGER(CLEARED)]);
  const paid = leg(k, 'CARD PAYMENT', DAY(0), 'out', 25_000, 'current');
  const voided = leg(k, 'CREDIT, VOIDED', DAY(1), 'in', 25_000, 'savings', BANK, { state: 'void' });
  unpaired(k, paid.id, 'a cleared payment beside a void credit');
  assert.equal(voided.fields._pair, undefined);
  assert.equal(spent(k), '250.00');

  const pending = leg(k, 'CREDIT, PENDING', DAY(1), 'in', 25_000, 'reserve', BANK, { state: 'pending' });
  unpaired(k, paid.id, 'a cleared payment beside a pending credit');
  assert.equal(pending.fields._pair, undefined);
  assert.equal(spent(k), '250.00');

  /* AND WHEN IT CLEARS IT IS ONE. The state is a field the declaration reads, so moving it looks again. */
  made(k.update('ledger', pending.id, { state: 'cleared' }, BANK));
  assert.equal(now(k, paid.id).fields._pair, pending.id);
  assert.equal(spent(k), '0.00');
  sql.close();
});

test('`where:` IS CHECKED AT INSTALL: a field it names is declared, and its words are the grammar’s', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const [where, code] of [
    [{ field: 'nowhere', is: 'cleared' }, 'FIELD_UNKNOWN'],
    ['state is cleared', 'DECLARATION_INVALID'],
  ] as const) {
    const out = (await k.install([LEDGER({ ...BASE, where })])) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
    assert.equal(out.ok, false, `${JSON.stringify(where)} installed`);
    assert.equal(out.refusal?.code, code, out.refusal?.fix);
    assert.equal(out.refusal?.at, 'pairs.where', out.refusal?.fix);
  }
});

/* ─────────────── a person can undo a pair ─────────────── */

test('UNMARKING ONE LEG UNPAIRS THE OTHER, and the person’s false holds against the next matching line', async () => {
  const { k, sql } = await record();
  const rent = leg(k, 'LOWRY STREET STUDIOS RENT', DAY(0), 'out', 100_000, 'current');
  const client = leg(k, 'HALDEN TYPE CO', DAY(1), 'in', 100_000, 'business', BANK);
  assert.equal(now(k, rent.id).fields._pair, client.id);

  made(k.update('ledger', rent.id, { moved: false }, PERSON));
  assert.equal(now(k, rent.id).fields.moved, false);
  assert.equal(now(k, rent.id).fields._pair, undefined, 'the rent still names the client payment');
  unpaired(k, client.id, 'the client payment, after the rent was unmarked');
  assert.equal(spent(k), '1000.00');
  assert.equal(received(k), '1000.00');

  /* THE PERSON SAID THIS IS SPEND, so a bank line that would have paired with it does not. */
  const later = leg(k, 'TRANSFER FROM CURRENT', DAY(0), 'in', 100_000, 'savings', BANK);
  assert.equal(now(k, rent.id).fields.moved, false, 'a bank line overwrote the person’s false');
  assert.equal(later.fields._pair, undefined);
  sql.close();
});

test('A FALSE A PERSON SETS BEFORE ANY PAIR IS NOT OVERWRITTEN BY THE NEXT BANK LINE, and a true he sets is not either', async () => {
  const { k, sql } = await record();
  const rent = leg(k, 'LOWRY STREET STUDIOS RENT', DAY(0), 'out', 100_000, 'current');
  made(k.update('ledger', rent.id, { moved: false }, PERSON));
  leg(k, 'HALDEN TYPE CO', DAY(1), 'in', 100_000, 'business', BANK);
  assert.equal(now(k, rent.id).fields.moved, false, 'the person’s false was overwritten');
  assert.equal(now(k, rent.id).fields._pair, undefined);
  assert.equal(spent(k), '1000.00');

  /* HIS TRUE IS PINNED THE SAME WAY. A card bill he marked by hand is not unmarked by the kernel for having no partner,
     and it does not take a partner from a row that might be somebody else's. */
  const card = leg(k, 'COMPANY CARD, AUGUST BILL', DAY(10), 'out', 9_640, 'current', PERSON, { moved: true });
  const refund = leg(k, 'REFUND', DAY(10), 'in', 9_640, 'reserve', BANK);
  assert.equal(now(k, card.id).fields.moved, true);
  assert.equal(now(k, card.id).fields._pair, undefined);
  assert.equal(refund.fields.moved, false);

  /* AND A MECHANISM'S FALSE IS NOT A PIN. The pinned rule is against machinery, as `41 §13 #5` says of step 2b. */
  const fee = leg(k, 'FEE', DAY(20), 'out', 1_200, 'current', BANK, { moved: false });
  const fed = leg(k, 'FEE BACK', DAY(21), 'in', 1_200, 'reserve', BANK);
  assert.equal(now(k, fee.id).fields._pair, fed.id);

  /* NOR IS IT AN UNDO. A bank line re-sent with `moved: false` over a paired row does not break the pair it
     contradicts, because the pair still stands on every count the declaration names; the mark goes back to true. */
  made(k.update('ledger', fee.id, { moved: false }, BANK));
  assert.equal(now(k, fee.id).fields.moved, true);
  assert.equal(now(k, fee.id).fields._pair, fed.id);
  assert.equal(now(k, fed.id).fields.moved, true);

  /* AND WHAT THE KERNEL WROTE IS SIGNED AS THE RECORD'S, never as the writer's: signed `p_1`, a mark the kernel set in
     his batch could not be told from one he set, and `markPinned` would have read every pair as his. */
  const signers = sql.all<{ actor: string }>("SELECT DISTINCT actor FROM event WHERE field = '_pair'").map((e) => e.actor);
  assert.deepEqual(signers, ['system']);
  sql.close();
});

/* ─────────────── first come, not nearest ─────────────── */

test('THE NEAREST LEG WINS WHATEVER ORDER THE BANK LISTS THEM IN, and the rent a credit took first is given back', async () => {
  const { k, sql } = await record();
  const rent = leg(k, 'LOWRY STREET STUDIOS RENT', DAY(0), 'out', 100_000, 'current', BANK);
  /* THE CREDIT IS LISTED BEFORE ITS DEBIT, as a bank export lists a same-day move, and the rent is the only candidate
     it has when it arrives. */
  const credit = leg(k, 'TRANSFER FROM CURRENT', DAY(2), 'in', 100_000, 'savings', BANK);
  const debit = leg(k, 'TRANSFER TO SAVINGS', DAY(2), 'out', 100_000, 'current', BANK);
  assert.equal(now(k, credit.id).fields._pair, debit.id, 'the credit kept the rent over its own debit, a day nearer');
  assert.equal(now(k, debit.id).fields._pair, credit.id);
  unpaired(k, rent.id, 'the rent');
  assert.equal(spent(k), '1000.00');
  sql.close();
});

test('A TIE IS NOT GUESSED: two credits equally near one debit leave all three unpaired, in either order', async () => {
  for (const order of [
    ['savings', 'out', 'reserve'],
    ['out', 'reserve', 'savings'],
  ]) {
    const { k, sql } = await record();
    const rows: Record<string, Entry> = {};
    for (const which of order)
      rows[which] =
        which === 'out'
          ? leg(k, 'TRANSFER OUT', DAY(1), 'out', 50_000, 'current', BANK)
          : leg(k, `TRANSFER TO ${which}`, which === 'savings' ? DAY(0) : DAY(2), 'in', 50_000, which, BANK);
    for (const which of order) unpaired(k, rows[which]!.id, `${order.join(', ')}: ${which}`);
    assert.equal(spent(k), '500.00');
    sql.close();
  }
});

test('A LEG MOVED OUT OF A TIE LETS THE TWO IT STOOD BETWEEN PAIR, though it was paired with neither', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER OUT', DAY(1), 'out', 50_000, 'current', BANK);
  const savings = leg(k, 'TRANSFER TO SAVINGS', DAY(0), 'in', 50_000, 'savings', BANK);
  const reserve = leg(k, 'TRANSFER TO RESERVE', DAY(2), 'in', 50_000, 'reserve', BANK);
  unpaired(k, out.id, 'the debit between two equal credits');

  /* THE ROWS THAT STOOD NEAR IT BEFORE ARE LOOKED AT AGAIN, and this is the only case that needs them. The savings
     credit held no `_pair` and is no candidate of anything where it now stands, so the rows it left are reached only
     through where it was: with `settle` seeded from the row as it is, the debit and the reserve credit stayed apart and
     Spent counted 500.00 that was only moved. Checked by taking `before` out of the seeds in `index.ts`. */
  made(k.update('ledger', savings.id, { on: DAY(20) }, PERSON));
  assert.equal(now(k, out.id).fields._pair, reserve.id);
  assert.equal(now(k, reserve.id).fields._pair, out.id);
  unpaired(k, savings.id, 'the credit moved away');
  assert.equal(spent(k), '0.00');
  sql.close();
});

/* ─────────────── a signed number across currencies ─────────────── */

test('A SIGNED NUMBER WHOSE `on` NAMES NO CURRENCY IS REFUSED AT INSTALL, because a bare number carries none', async () => {
  const postings = (on: string[], amount = 'int'): Declaration => ({
    id: 'register.postings',
    kind: 'register',
    body: {
      id: 'postings',
      name: 'Postings',
      title: 'what',
      pairs: { on, opposite: 'amount', across: 'account', within: '4d', mark: 'moved' },
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'booked', type: 'day', required: true },
        { id: 'amount', type: amount, required: true },
        { id: 'currency', type: 'text', required: true },
        { id: 'account', type: 'text', required: true },
        { id: 'moved', type: 'bool' },
      ],
    } as never,
  });
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = (await k.install([postings(['abs(amount)'])])) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  assert.equal(out.ok, false, 'EGP -1000 would pair with USD +1000');
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(out.refusal?.at, 'pairs.on');

  /* THE SAME DECLARATION OVER A MONEY INSTALLS, because a money compares the currency it carries. */
  const money = await k.install([postings(['abs(amount)'], 'money')]);
  assert.ok(money.ok, JSON.stringify(money));
  const named = await k.install([postings(['currency', 'abs(amount)'])]);
  assert.ok(named.ok, JSON.stringify(named));
});
