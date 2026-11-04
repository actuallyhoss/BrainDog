/**
 * The mail door's question about an arrival is settled with the arrival (audit 31 Oct k, AK12): filing or setting the
 * mail aside closes it, an undo of the filing or a put back asks it again, and a mail saying somebody paid one of our
 * invoices offers to mark that invoice paid, never a new bill with its amount unread.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from './index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const PERSON = { actor: 'p_1' };

const reg = (id: string, name: string, body: Record<string, unknown>): Declaration => ({ id: `register.${id}`, kind: 'register', body: { id, name, ...body } as never });

const DECLS: Declaration[] = [
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
  reg('notes', 'Notes', { title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }),
];

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const done = await k.install(DECLS);
  assert.ok(done.ok, JSON.stringify(done));
  return { k, sql };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { ok: true; value: T }).value;
};

let n = 0;
function mail(k: Kernel, from: string, subject: string, body: string): { raw: string; state: string; suggestion?: string } {
  n += 1;
  return value(k.arrive({ channel: 'email', headers: { from, to: 'tok@in.example', subject }, body, sha256: `mail-settle-${String(n)}` }) as Result<{ raw: string; state: string; suggestion?: string }>);
}

/** A new vendor's bill: the door asks about it in To review, with the arrival as the question's one mail. */
const asked = (k: Kernel): { raw: string; question: string } => {
  const got = mail(k, 'Loomhouse <billing@loomhouse.example>', 'Your invoice', 'Invoice INV-9\nAmount due: GBP 48.00\nPayment due by 14 November 2026\n');
  assert.equal(got.state, 'review');
  assert.ok(got.suggestion, 'the door asked nothing');
  return { raw: got.raw, question: got.suggestion };
};

const statusOf = (sql: NodeSql, id: string) => ({ ...sql.one<{ status: string; resolved_as: string | null }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', id) });
const stateOf = (sql: NodeSql, raw: string): string | undefined => sql.one<{ state: string }>('SELECT state FROM inbox_raw WHERE id = ?', raw)?.state;
const lastStateBatch = (sql: NodeSql, raw: string): string =>
  sql.one<{ batch: string }>("SELECT batch FROM event WHERE target = ? AND kind = 'state' ORDER BY rowid DESC LIMIT 1", `inbox_raw:${raw}`)!.batch;

test('FILING THE MAIL CLOSES THE DOOR’S QUESTION ABOUT IT, in the same batch', async () => {
  const { k, sql } = await record();
  const { raw, question } = asked(k);
  assert.equal(statusOf(sql, question)?.status, 'open');

  value(k.fileArrival(raw, 'notes', null, PERSON));
  assert.equal(stateOf(sql, raw), 'matched');
  assert.deepEqual(statusOf(sql, question), { status: 'resolved', resolved_as: 'moot' });
  const closed = sql.one<{ note: string; batch: string }>("SELECT note, batch FROM event WHERE target = ? AND kind = 'resolve' ORDER BY rowid DESC LIMIT 1", `suggestion:${question}`);
  assert.equal(closed?.note, 'Settled by filing the mail in Notes.');
  assert.equal(closed?.batch, lastStateBatch(sql, raw), 'the question closed in a batch of its own');
  sql.close();
});

test('UNDOING THE FILING PUTS THE MAIL BACK IN THE INBOX AND ASKS THE QUESTION AGAIN', async () => {
  const { k, sql } = await record();
  const { raw, question } = asked(k);
  value(k.fileArrival(raw, 'notes', null, PERSON));
  assert.equal(k.count('notes'), 1);

  const batch = lastStateBatch(sql, raw);
  const plan = value(k.undoPlan({ batch }));
  value(k.undoApply({ batch }, plan.hash, 'p_1'));

  assert.equal(k.count('notes'), 0, 'the row it was filed as is still there');
  assert.equal(stateOf(sql, raw), 'review', 'the inbox still says filed');
  assert.equal(statusOf(sql, question)?.status, 'open', 'the door’s question stayed closed');
  sql.close();
});

test('SETTING THE MAIL ASIDE CLOSES THE QUESTION TOO, and putting it back asks it again', async () => {
  const { k, sql } = await record();
  const { raw, question } = asked(k);

  value(k.archiveArrival(raw, 'p_1'));
  assert.deepEqual(statusOf(sql, question), { status: 'resolved', resolved_as: 'moot' });
  const closed = sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'resolve' ORDER BY rowid DESC LIMIT 1", `suggestion:${question}`);
  assert.equal(closed?.note, 'Settled by setting the mail aside.');

  value(k.returnArrival(raw, 999, PERSON));
  assert.equal(statusOf(sql, question)?.status, 'open');
  const again = sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'suggest' ORDER BY rowid DESC LIMIT 1", `suggestion:${question}`);
  assert.equal(again?.note, 'Asked again: the mail is back in the inbox.');
  sql.close();
});

test('A MAIL SAYING THEY PAID OUR INVOICE OFFERS TO MARK IT PAID, and makes no bill', async () => {
  const { k, sql } = await record();
  const owed = value(
    k.create('dues', { what: 'Priya Nair invoice INV-2026-041', direction: 'owed_to_me', amount: { amount: 120000, currency: 'GBP' }, due: '2026-10-15' }, PERSON),
  );
  const got = mail(k, 'Priya Nair <priya@nairdesign.example>', 'Payment for invoice INV-2026-041', 'Hi,\nWe have paid invoice INV-2026-041 today.\nAmount: GBP 1,200.00\nPriya\n');

  assert.equal(got.state, 'review');
  assert.equal(k.count('dues'), 1, 'a remittance was offered as a new bill');
  assert.ok(got.suggestion);
  const said = sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'suggest' ORDER BY rowid LIMIT 1", `suggestion:${got.suggestion}`);
  assert.equal(said?.note, 'Mark invoice INV-2026-041 paid?');
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', got.suggestion)!.body) as { rows: { at: string; patch: Record<string, unknown> }[]; review?: boolean };
  assert.deepEqual(body.rows.map((r) => [r.at, r.patch]), [[owed.id, { state: 'paid' }]]);
  /* MARKING MONEY PAID IS HIS WORD: asked in Needs you, never filed alone and never in To review. */
  assert.equal(body.review, undefined);
  const open = k.openSuggestions();
  assert.ok(open.ok && open.value.some((s) => s.id === got.suggestion), 'not asked in Needs you');
  sql.close();
});

test('A REMITTANCE FOR AN INVOICE ALREADY PAID OFFERS NOTHING', async () => {
  const { k, sql } = await record();
  value(k.create('dues', { what: 'Priya Nair invoice INV-2026-042', direction: 'owed_to_me', amount: { amount: 50000, currency: 'GBP' }, due: '2026-10-15', state: 'paid' }, PERSON));
  const got = mail(k, 'Priya Nair <priya@nairdesign.example>', 'Payment for invoice INV-2026-042', 'We have paid invoice INV-2026-042.\nAmount: GBP 500.00\n');
  assert.equal(got.state, 'skipped');
  assert.equal(got.suggestion, undefined);
  sql.close();
});

test('A REMINDER ABOUT A BILL HE OWES OFFERS NOTHING TO MARK PAID (RL3)', async () => {
  const { k, sql } = await record();
  value(k.create('dues', { what: 'Halden invoice INV-204', direction: 'owed_by_me', amount: { amount: 120000, currency: 'GBP' }, due: '2026-10-15' }, PERSON));
  const got = mail(k, 'Halden <accounts@halden.example>', 'Payment for invoice INV-204', 'We have sent the payment for INV-204? Not yet, it seems.\nPlease send remittance.\n');
  if (got.suggestion) {
    const said = sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'suggest' ORDER BY rowid LIMIT 1", `suggestion:${got.suggestion}`);
    assert.notEqual(said?.note, 'Mark invoice INV-204 paid?');
  }
  assert.equal(k.count('dues'), 1);
  sql.close();
});

test('A REMITTANCE FROM ANOTHER ADDRESS AT A FREE MAIL HOST OFFERS NOTHING (RM3)', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const folk = reg('folk', 'Folk', {
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'folk' },
    ],
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' },
  });
  const dues = DECLS[0]!;
  const body = dues.body as unknown as { fields: object[] };
  const withParty: Declaration = { ...dues, body: { ...body, fields: [...body.fields, { id: 'party', type: 'ref', to: 'folk' }] } as never };
  const put = await k.install([folk, withParty, DECLS[1]!]);
  assert.ok(put.ok, JSON.stringify(put));
  const omar = value(k.create('folk', { name: 'Omar', email: 'omar@gmail.com' }, PERSON)) as { id: string };
  value(k.create('dues', { what: 'Omar INV-7', direction: 'owed_to_me', amount: { amount: 50000, currency: 'GBP' }, due: '2026-10-15', party: omar.id }, PERSON));
  const got = mail(k, 'Sam <sam@gmail.com>', 'Paid', 'We have paid your invoice INV-7.\n');
  if (got.suggestion) {
    const said = sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'suggest' ORDER BY rowid LIMIT 1", `suggestion:${got.suggestion}`);
    assert.notEqual(said?.note, 'Mark invoice INV-7 paid?');
  }
  const own = mail(k, 'Omar <omar@gmail.com>', 'Paid', 'We have paid your invoice INV-7.\n');
  assert.ok(own.suggestion);
  const asks = sql.one<{ note: string }>("SELECT note FROM event WHERE target = ? AND kind = 'suggest' ORDER BY rowid LIMIT 1", `suggestion:${own.suggestion}`);
  assert.equal(asks?.note, 'Mark invoice INV-7 paid?');
  sql.close();
});

test('FILING ONE MAIL OUT OF A QUESTION WHOSE ROWS AND MAILS DO NOT LINE UP ASKS ABOUT THE REST ON THEIR OWN (RM4)', async () => {
  const { k, sql } = await record();
  const bill = (ref: string, amount: string) => mail(k, 'Loomhouse <billing@loomhouse.example>', 'Your invoice', `Invoice ${ref}\nAmount due: GBP ${amount}\nPayment due by 14 November 2026\n`);
  const [a, b, c] = [bill('INV-9', '48.00'), bill('INV-10', '52.00'), bill('INV-11', '60.00')];
  const q = a.suggestion!;
  /* ONE QUESTION HOLDING ALL THREE MAILS AND ONE ROW, the shape `settleAsked` cannot line up. */
  for (const other of [b.suggestion, c.suggestion]) if (other && other !== q) sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'moot' WHERE id = ?", other);
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', q)!.body) as Record<string, unknown>;
  sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ ...body, raws: [a.raw, b.raw, c.raw] }), q);

  value(k.fileArrival(b.raw, 'notes', null, PERSON));
  assert.deepEqual(statusOf(sql, q), { status: 'resolved', resolved_as: 'moot' });
  const held = (raw: string) =>
    sql.one<{ id: string }>(
      "SELECT id FROM suggestion WHERE status = 'open' AND body_kind = 'rowset' AND EXISTS (SELECT 1 FROM json_each(suggestion.body, '$.raws') WHERE value = ?)",
      raw,
    )?.id;
  for (const raw of [a.raw, c.raw]) {
    assert.ok(held(raw), 'a mail left in the inbox has nothing asking about it');
    assert.notEqual(held(raw), q);
    assert.equal(stateOf(sql, raw), 'review');
  }
  assert.equal(held(b.raw), undefined, 'the filed mail is asked about again');
  sql.close();
});
