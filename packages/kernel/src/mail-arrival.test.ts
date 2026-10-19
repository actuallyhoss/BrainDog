/**
 * Forwarded mail no pattern took is read for who and what. A known vendor's bill with its amount and day read cleanly
 * files itself with BrainDog's mark; a new vendor waits in To review; an amount that did not read asks in Needs you.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from './index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);

const reg = (id: string, name: string, body: Record<string, unknown>): Declaration => ({ id: `register.${id}`, kind: 'register', body: { id, name, ...body } as never });

const DECLS: Declaration[] = [
  reg('hubs', 'Hubs', { title: 'name', scopes: { repos: 'repos', folders: 'folders' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }, { id: 'folders', type: 'list', of: 'text' }] }),
  reg('folk', 'Folk', {
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'folk' },
    ],
    meets: { name: 'name', email: 'email', handles: 'handles', met: 'met', merged_into: 'merged_into', aliases: 'aliases' },
  }),
  reg('dues', 'Dues', {
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', deadline: true, required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], default: 'open', required: true },
    ],
  }),
  reg('estate', 'Estate', {
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'renews', type: 'day', deadline: true },
      { id: 'cost', type: 'money' },
      { id: 'cycle', type: 'enum', values: ['monthly', 'yearly'], required: true },
    ],
  }),
];

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const done = await k.install(DECLS);
  assert.ok(done.ok, JSON.stringify(done));
  return { k, sql };
}

let n = 0;
function mail(k: Kernel, from: string, subject: string, body: string): { state: string; suggestion?: string } {
  n += 1;
  const r = k.arrive({ channel: 'email', headers: { from, to: 'tok@in.example', subject }, body, sha256: `mail-arrival-${String(n)}` }) as { ok: boolean; value: { state: string; suggestion?: string } };
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
}

const bill = (due = '14 November 2026', total = 'GBP 48.00'): string => `Invoice INV-9\nAmount due: ${total}\nPayment due by ${due}\n`;

/** A vendor the record holds and one earlier bill from them, which is what makes a vendor known to file for. */
function known(k: Kernel): void {
  assert.ok(k.create('folk', { name: 'Loomhouse', email: 'billing@loomhouse.example' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('dues', { what: 'Loomhouse invoice INV-1', direction: 'owed_by_me', amount: { amount: 4000, currency: 'GBP' }, due: '2026-10-01' }, { actor: 'p_1' }).ok);
}

test('A NEW VENDOR BILL WAITS IN TO REVIEW, and the sender is met from the mail', async () => {
  const { k, sql } = await record();
  const got = mail(k, 'Loomhouse <billing@loomhouse.example>', 'Your invoice', bill());
  assert.equal(got.state, 'review');
  assert.equal(k.count('dues'), 0);
  const review = k.governance('suggestion', { status: 'open', review: 'only' });
  assert.ok(review.ok && review.value.length === 1);
  assert.ok(k.count('folk') >= 1, 'the sender was met');
  sql.close();
});

test('A KNOWN VENDOR BILL FILES ITSELF with the mark, once an earlier bill is in', async () => {
  const { k, sql } = await record();
  known(k);
  const got = mail(k, 'Loomhouse <billing@loomhouse.example>', 'Your invoice', bill());
  assert.equal(got.state, 'matched');
  assert.equal(k.count('dues'), 2);
  const d = sql.one<{ question: string; decided_by: string }>('SELECT question, decided_by FROM decision ORDER BY rowid DESC LIMIT 1');
  assert.equal(d?.decided_by, 'rule:handled');
  assert.match(d?.question ?? '', /^Filed by BrainDog: Loomhouse invoice INV-9/);
  sql.close();
});

test('THE SAME BILL FORWARDED AGAIN IS NOT FILED TWICE', async () => {
  const { k, sql } = await record();
  known(k);
  assert.ok(k.create('dues', { what: 'Loomhouse invoice INV-9', direction: 'owed_by_me', amount: { amount: 4800, currency: 'GBP' }, due: '2026-11-14' }, { actor: 'p_1' }).ok);
  const got = mail(k, 'Loomhouse <billing@loomhouse.example>', 'Your invoice', bill());
  assert.equal(got.state, 'skipped');
  assert.equal(k.count('dues'), 2);
  sql.close();
});

test('AN AMOUNT NOT READ CLEANLY STILL ASKS IN NEEDS YOU, even from a known vendor', async () => {
  const { k, sql } = await record();
  known(k);
  const got = mail(k, 'Loomhouse <billing@loomhouse.example>', 'Your invoice', bill('14 November 2026', '$48.00'));
  assert.equal(got.state, 'review');
  assert.equal(k.count('dues'), 1);
  const open = k.openSuggestions();
  assert.ok(open.ok && open.value.length === 1, 'asked in Needs you');
  const review = k.governance('suggestion', { status: 'open', review: 'only' });
  assert.ok(review.ok && review.value.length === 0);
  sql.close();
});

test('A RENEWAL NOTICE MOVES THE MATCHING SERVICE RENEWAL DAY by itself', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('folk', { name: 'Nordhaven', email: 'noreply@nordhaven.example' }, { actor: 'p_1' }).ok);
  const made = k.create('estate', { name: 'kiln.example', renews: '2026-12-01', cost: { amount: 1400, currency: 'GBP' }, cycle: 'yearly' }, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
  const got = mail(k, 'Nordhaven <noreply@nordhaven.example>', 'kiln.example renews soon', 'Your domain kiln.example will renew on 3 March 2027.\nRenewal price: GBP 14.00');
  assert.equal(got.state, 'matched');
  const row = sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'estate'");
  assert.equal((JSON.parse(row?.fields ?? '{}') as { renews?: string }).renews, '2027-03-03');
  sql.close();
});

test('A SHIPPING MAIL IS LEFT AS IT WAS WHEN THERE IS NO TASK LIST', async () => {
  const { k, sql } = await record();
  const got = mail(k, 'Parcels <shop@parcels.example>', 'Your order has shipped', 'Estimated delivery: 2026-11-02');
  assert.equal(got.state, 'untriaged');
  sql.close();
});
