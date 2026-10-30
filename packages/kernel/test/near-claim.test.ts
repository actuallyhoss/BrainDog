/**
 * A near skip claims the row it keeps, and "It is a second one" takes the claim back (review of 30 October, R11, R12).
 *
 * R11, AS RUN: a statement line for a coffee is in the Ledger; the bank's alert for it (reference `aaaa`) meets the line
 * and is skipped; an alert for a second coffee of the same amount on the same day (reference `bbbb`) met the same line,
 * because the line never took `aaaa`, and was skipped too. The second coffee was never in the Ledger.
 *
 * R12, AS RUN: the skip wrote the alert's balance onto the line, and "It is a second one" left it there.
 *
 * `duplicate` IS A SMALL STAND-IN FOR `@braindog/extract`'s `nearMatch`, as `near-across.test.ts` has it. EVERY VALUE IS
 * INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { openRecord, type Declaration } from '../src/index.ts';
import { fileAsSecond, type Dedupe } from '../src/ingest.ts';
import { ACCOUNTS, NOW, OWNER, depsOf } from './ingest-tail-kit.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

type F = Record<string, unknown>;

const held = (x: F, f: string): boolean => x[f] !== undefined && x[f] !== null;
const days = (a: F, b: F): number => Math.abs(Date.parse(`${String(a.on)}T00:00:00Z`) - Date.parse(`${String(b.on)}T00:00:00Z`)) / 86_400_000;

function duplicate(a: F, b: F, key: Dedupe): boolean {
  let across = false;
  for (const f of (key as { near: { on: string[] } }).near.on) {
    if (held(a, f) !== held(b, f)) {
      if (f === 'amount') return false;
      across = true;
      continue;
    }
    if (!held(a, f)) return false;
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) return false;
  }
  return days(a, b) <= (across ? 3 : 1) && String(a.what).toLowerCase().slice(0, 12) === String(b.what).toLowerCase().slice(0, 12);
}

const LEDGER: Declaration = {
  id: 'register.transactions',
  kind: 'register',
  body: {
    id: 'transactions',
    name: 'Transactions',
    one: 'transaction',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'on', type: 'day' },
      { id: 'account', type: 'ref', to: 'accounts', required: true },
      { id: 'ref', type: 'text' },
      { id: 'available', type: 'money' },
    ],
  } as never,
};

/** The bank's alert, read by its reference: HSBC's InstaPay key. */
const ALERT: Declaration = {
  id: 'ingest.bank-alert',
  kind: 'ingest',
  body: {
    ingest: 'bank-alert',
    channel: 'webhook',
    verify: { kind: 'path' },
    description: 'Bank alerts',
    match: { all: [{ field: 'body', contains: 'used for' }] },
    extract: {
      what: { text: { between: [' at ', '.'] } },
      amount: { money: { after: 'used for ', currency: 'EGP' } },
      on: { date: { format: 'DD/MM/YYYY', after: ' on ' } },
      account: { lookup: { register: 'accounts', by: 'last4', between: ['*** ', ' used'], says: 'card' } },
      ref: { text: { between: ['Ref ', '.'] } },
      available: { money: { after: 'Available ', currency: 'EGP' } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: { near: { on: ['amount', 'account', 'ref'], day: 'on', prefix: { field: 'what', chars: 12 } } },
    on_conflict: 'skip',
  } as never,
};

const alert = (ref: string, available: string): string =>
  `Card *** 1234 used for EGP 3.40 on 07/10/2026 at COFFEE HOUSE. Ref ${ref}. Available EGP ${available}.`;

async function ledger(lines: number) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { duplicate: duplicate as never });
  assert.ok((await k.install([ACCOUNTS, LEDGER, ALERT])).ok);
  const card = k.create('accounts', { name: 'Card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, last4: '1234' }, OWNER);
  assert.ok(card.ok);
  /* THE STATEMENT'S LINES, written before the alerts, with no reference and no balance. */
  const ids: string[] = [];
  for (let i = 0; i < lines; i++) {
    const line = k.create('transactions', { what: 'COFFEE HOUSE', amount: { amount: 340, currency: 'EGP' }, on: '2026-10-07', account: card.value.id }, OWNER);
    assert.ok(line.ok);
    ids.push(line.value.id);
  }
  clock.advance(60 * 60_000);
  const post = (body: string) => {
    const r = k.arrive({ channel: 'webhook', ingest: 'bank-alert', body, sha256: `claim-${randomUUID()}`, verified: true });
    assert.ok(r.ok, JSON.stringify(r));
    return r.value;
  };
  const fields = (id: string): F => JSON.parse(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', id)!.fields) as F;
  return { k, sql, ids, post, fields };
}

test('R11: the line takes the first alert reference, so a second coffee of the same amount is written, not dropped', async () => {
  const r = await ledger(1);
  const a = r.post(alert('aaaa', '900.00'));
  assert.equal(a.state, 'skipped');
  assert.equal(r.fields(r.ids[0]!).ref, 'aaaa');
  const b = r.post(alert('bbbb', '896.60'));
  assert.equal(b.state, 'matched', 'the second coffee is its own row');
  assert.equal(r.k.count('transactions'), 2);
  /* AND THE FIRST ALERT AGAIN (another device, other bytes) is still a repeat of the line it claimed. */
  assert.equal(r.post(`${alert('aaaa', '900.00')} `).state, 'skipped');
  assert.equal(r.k.count('transactions'), 2);
  r.sql.close();
});

test('R12: one line, sure, takes the balance; of two free lines neither takes anything, and two alerts stay two rows', async () => {
  const one = await ledger(1);
  one.post(alert('aaaa', '900.00'));
  assert.deepEqual(one.fields(one.ids[0]!).available, { amount: 90_000, currency: 'EGP' });
  one.sql.close();

  const two = await ledger(2);
  assert.equal(two.post(alert('aaaa', '900.00')).state, 'skipped');
  for (const id of two.ids) {
    assert.equal(two.fields(id).available, undefined, 'which coffee this was cannot be told, so its balance is on neither');
    assert.equal(two.fields(id).ref, undefined);
  }
  /* THE SECOND ALERT IS THE OTHER LINE: two lines, two alerts, two rows. */
  assert.equal(two.post(alert('bbbb', '896.60')).state, 'skipped');
  assert.equal(two.k.count('transactions'), 2);
  two.sql.close();
});

test('R12: "It is a second one" takes back what the skip wrote onto the line', async () => {
  const r = await ledger(1);
  const a = r.post(alert('aaaa', '900.00'));
  assert.equal(a.state, 'skipped');
  assert.equal(r.fields(r.ids[0]!).ref, 'aaaa');
  const second = r.k.transaction(() => fileAsSecond(depsOf(r.k, r.sql), a.raw));
  assert.ok(second.ok, JSON.stringify(second));
  assert.equal(r.k.count('transactions'), 2);
  const line = r.fields(r.ids[0]!);
  assert.equal(line.ref, undefined);
  assert.equal(line.available, undefined);
  assert.equal(line.what, 'COFFEE HOUSE', 'what the line held of its own stays');
  r.sql.close();
});

test('R12: a field someone changed on the line since the skip is theirs, and stays', async () => {
  const r = await ledger(1);
  const a = r.post(alert('aaaa', '900.00'));
  assert.ok(r.k.write('transactions', r.ids[0]!, { ref: 'typed' } as never, OWNER).ok);
  assert.ok(r.k.transaction(() => fileAsSecond(depsOf(r.k, r.sql), a.raw)).ok);
  const line = r.fields(r.ids[0]!);
  assert.equal(line.ref, 'typed');
  assert.equal(line.available, undefined);
  r.sql.close();
});
