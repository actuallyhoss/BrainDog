/**
 * One account's digits across the doors that print them, and an answer that never moves digits in silence (audit-34
 * findings 5 to 8, and the bare number of 9).
 *
 * MEASURED ON THE OWNER'S RECORD: his card ending 7731 is printed by the bank's mail and by its texts, two doors, and the
 * cause named the door, so one card was two questions in Decide and one answer closed one of them. Here the mail and the
 * texts ask one question; two questions the doors asked before fold into one; and one answer files both.
 *
 * EVERY VALUE IS INVENTED: the shops, the amounts, the digits and the sixteen-digit number, which is a test number.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { matchLiterals } from '../../extract/src/extractors.ts';
import { openRecord, type Arrived, type Declaration, type Kernel } from '../src/index.ts';
import { confirmedTail } from '../src/ingest.ts';
import { ACCOUNTS, CARD, LEDGER, NOW, OWNER, answer, bodyOf, openQuestions, record, text, used, type Rec } from './ingest-tail-kit.test.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/** The bank's mail, at a door of its own, reading the same card by the same digits as the texts. */
const MAIL: Declaration = {
  id: 'ingest.bank-mail',
  kind: 'ingest',
  body: {
    ingest: 'bank-mail',
    channel: 'webhook',
    verify: { kind: 'path' },
    description: 'Bank mail',
    match: { all: [{ field: 'body', contains: 'was charged' }] },
    extract: {
      what: { text: { between: [' at ', '.'] } },
      amount: { money: { after: 'charged ', currency: 'EGP' } },
      on: { date: { format: 'DD/MM/YYYY', after: ' on ' } },
      account: { lookup: { register: 'accounts', by: 'last4', between: ['card ending ', ' was charged'], says: 'card', where: 'kind is card' } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: ['what', 'amount', 'on', 'account'],
    on_conflict: 'skip',
  } as never,
};

const charged = (digits: string, shop: string, amount: string, day = '07/10/2026'): string =>
  `Your card ending ${digits} was charged EGP ${amount} on ${day} at ${shop}.`;

/** One mail posted to the bank's mail door. */
function mail(k: Kernel, body: string): Arrived {
  const r = k.arrive({ channel: 'webhook', ingest: 'bank-mail', body, sha256: `mail-${randomUUID()}`, verified: true });
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
}

/** Another card on the record, made by the owner. */
function travelCard(r: Rec, fields: Record<string, unknown> = {}): string {
  const made = r.k.create('accounts', { name: 'Travel card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, ...fields }, OWNER);
  assert.ok(made.ok, JSON.stringify(made));
  return made.value.id;
}

const digitsOn = (r: Rec, id: string): unknown => r.k.get(id)?.fields.last4;

type Asked = { count: number; totals: Record<string, number>; context: string; raws: string[] };

test('THE MAIL AND THE TEXTS PRINT ONE CARD: one question for both doors, and one answer files both', async () => {
  const r = await record(CARD(), MAIL);
  const texted = text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  const mailed = mail(r.k, charged('1234', 'NILE BOOKS', '40.00'));
  assert.equal(mailed.state, 'review', mailed.reason);
  const asked = openQuestions(r.sql);
  assert.equal(asked.length, 1, `${asked.length} questions for one card's digits`);
  assert.equal(mailed.suggestion, texted.suggestion, 'the mail opened a question of its own');
  const body = bodyOf(r.sql, asked[0]!.id) as Asked;
  assert.equal(body.count, 2);
  assert.deepEqual(body.totals, { EGP: 5_200 });

  assert.equal(answer(r, asked[0]!.id, r.card).said, 'Filed 2 to Credit Card.');
  assert.equal(r.k.count('transactions'), 2);
  assert.equal(openQuestions(r.sql).length, 0, 'Decide still holds a question about the card');
  assert.equal(mail(r.k, charged('1234', 'HALDEN COFFEE', '7.00')).state, 'matched');
  r.sql.close();
});

/**
 * Two questions about one card, one per door, as the record holds them from before: the first one's digits are hidden
 * while the mail comes, so it opens its own, and both are then given the cause that named the door.
 */
async function twins(): Promise<{ r: Rec; texted: Arrived; mailed: Arrived }> {
  const r = await record(CARD(), MAIL);
  const texted = text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  /* ITS COLUMN CAUSE NAMES ITS DOOR, as migration 31 copied it from a body from before, so the mail's cause is free. */
  r.sql.exec("UPDATE suggestion SET body = json_set(body, '$.tail.digits', 'hidden'), cause = 'tail:bank-sms:accounts:1234' WHERE id = ?", texted.suggestion!);
  const mailed = mail(r.k, charged('1234', 'NILE BOOKS', '40.00'));
  assert.notEqual(mailed.suggestion, texted.suggestion);
  r.sql.exec("UPDATE suggestion SET body = json_set(body, '$.tail.digits', '1234', '$.cause', 'tail:bank-sms:accounts:1234') WHERE id = ?", texted.suggestion!);
  r.sql.exec("UPDATE suggestion SET body = json_set(body, '$.cause', 'tail:bank-mail:accounts:1234') WHERE id = ?", mailed.suggestion!);
  assert.equal(openQuestions(r.sql).length, 2);
  return { r, texted, mailed };
}

test('TWO QUESTIONS THE DOORS ASKED BEFORE ARE FOLDED INTO ONE at the next message, which counts and sums all three', async () => {
  const { r, texted, mailed } = await twins();
  const next = text(r.k, used('1234', 'HALDEN COFFEE', '7.00'));
  const open = openQuestions(r.sql);
  assert.deepEqual(
    open.map((q) => q.id),
    [texted.suggestion],
  );
  assert.equal(next.suggestion, texted.suggestion);
  const body = bodyOf(r.sql, texted.suggestion!) as Asked;
  assert.equal(body.count, 3);
  assert.deepEqual(body.totals, { EGP: 5_900 });
  assert.equal(body.context, '3 messages wait for this, EGP 59.00 in all.');
  assert.equal(r.sql.one<{ resolved_as: string }>('SELECT resolved_as FROM suggestion WHERE id = ?', mailed.suggestion!)!.resolved_as, 'asked-again');

  assert.equal(answer(r, texted.suggestion!, r.card).said, 'Filed 3 to Credit Card.');
  assert.equal(r.k.count('transactions'), 3);
  r.sql.close();
});

test('ONE ANSWER CLOSES THE OTHER DOOR’S QUESTION TOO, with nothing more arriving', async () => {
  const { r, texted, mailed } = await twins();
  answer(r, texted.suggestion!, r.card);
  assert.equal(r.k.count('transactions'), 2, 'the mail that waited at the other door was not filed');
  assert.equal(openQuestions(r.sql).length, 0);
  assert.equal(r.sql.one<{ resolved_as: string }>('SELECT resolved_as FROM suggestion WHERE id = ?', mailed.suggestion!)!.resolved_as, 'filed');
  r.sql.close();
});

test('AN ANSWER NEVER TAKES DIGITS A PERSON PUT ON ANOTHER ACCOUNT, OR WRITES OVER HIS: refused, naming it, and nothing moves', async () => {
  const r = await record();
  const travel = travelCard(r);
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(r.sql);
  /* HE PUTS THE DIGITS ON THE TRAVEL CARD BY HAND, then presses the Credit Card. */
  assert.ok(r.k.write('accounts', travel, { last4: '1234' } as never, OWNER).ok);
  const pressed = r.k.decide(q!.id, { decide: { option: r.card, reason: 'mine' } }, 'p_1');
  assert.equal(pressed.ok, false, 'the answer took his digits off the Travel card');
  assert.ok(!pressed.ok && 'refusal' in pressed);
  assert.equal(pressed.refusal.fix, 'Travel card already holds 1234. Take it off that account first, or pick it.');
  assert.equal(digitsOn(r, travel), '1234');
  assert.equal(digitsOn(r, r.card), undefined);
  assert.deepEqual(
    openQuestions(r.sql).map((o) => o.id),
    [q!.id],
    'the refused answer still closed the question',
  );
  r.sql.close();

  /* AND DIGITS HE PUT ON THE ACCOUNT PICKED ARE NOT WRITTEN OVER where the field holds one value. */
  const o = await record();
  text(o.k, used('1234', 'CORNER SHOP', '12.00'));
  const [p] = openQuestions(o.sql);
  assert.ok(o.k.write('accounts', o.card, { last4: '5555' } as never, OWNER).ok);
  const over = o.k.decide(p!.id, { decide: { option: o.card, reason: 'mine' } }, 'p_1');
  assert.ok(!over.ok && 'refusal' in over, 'his 5555 was written over');
  assert.equal(over.refusal.fix, 'Credit Card already holds 5555 in Digits the bank prints. Change it on the account first, or pick another.');
  assert.equal(digitsOn(o, o.card), '5555');
  o.sql.close();
});

test('DIGITS AN AGENT PUT ARE TAKEN OFF ITS ACCOUNT BY THE ANSWER, and the closing line says so', async () => {
  const r = await record();
  const travel = travelCard(r);
  assert.ok(r.k.write('accounts', travel, { last4: '1234' } as never, { actor: 'S7' }).ok);
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(r.sql);
  assert.equal(answer(r, q!.id, r.card).said, 'Filed 1 to Credit Card. 1234 was taken off Travel card, where an agent put it.');
  assert.equal(digitsOn(r, travel), undefined);
  assert.equal(digitsOn(r, r.card), '1234');
  r.sql.close();
});

test('ONE ANSWER THAT CANNOT BE CARRIED OUT NEVER STOPS THE DOOR: the next texts file, and the failure is said once', async () => {
  const r = await record();
  travelCard(r, { last4: '9876' });
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(r.sql);
  answer(r, q!.id, r.card);
  /* AS IF THE ANSWER HAD BEEN GIVEN WHERE NOTHING CARRIED IT OUT, and the account it names then went. */
  r.sql.exec("UPDATE suggestion SET body = json_remove(body, '$.applied') WHERE id = ?", q!.id);
  r.sql.exec("UPDATE entry SET deleted_at = '2026-10-08T13:00:00.000Z' WHERE id = ?", r.card);

  const first = text(r.k, used('9876', 'NILE BOOKS', '3.00'));
  assert.equal(first.state, 'matched', first.reason);
  const second = text(r.k, used('9876', 'HALDEN COFFEE', '4.00'));
  assert.equal(second.state, 'matched', second.reason);
  const notes = r.sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND target = ? AND note LIKE 'This answer could not%' ORDER BY rowid", `suggestion:${q!.id}`);
  assert.equal(notes.length, 1, 'the failure was not said, or was said at every text');
  assert.match(notes[0]!.note, /no longer there/u);
  r.sql.close();
});

test('A QUESTION ASKED AGAIN AFTER "NONE OF THESE" SUMS THE MESSAGES IT COUNTS, the ones that waited as well', async () => {
  const r = await record();
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  const [q] = openQuestions(r.sql);
  answer(r, q!.id, 'none');
  travelCard(r);
  const third = text(r.k, used('1234', 'HALDEN COFFEE', '7.00'));
  assert.ok(third.suggestion && third.suggestion !== q!.id);
  const body = bodyOf(r.sql, third.suggestion) as Asked;
  assert.equal(body.count, 3);
  /* INTEGER MINOR UNITS, ONE SUM PER CURRENCY: 12.00, 40.00 and 7.00. */
  assert.deepEqual(body.totals, { EGP: 5_900 });
  assert.equal(body.context, '3 messages wait for this, EGP 59.00 in all.');
  r.sql.close();
});

test('A WHOLE CARD NUMBER IN A TEXT IS KEPT BY ITS LAST FOUR, never stored whole as the digits', async () => {
  const PAN = '4111111111117731';
  /* THE RECORD AS PRODUCTION OPENS IT, with `@braindog/extract`'s literal rule handed down: the reverse tail is read there. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { literals: matchLiterals });
  assert.ok((await k.install([ACCOUNTS, LEDGER, CARD({}, { between: ['Credit Card ', ' has been'] })])).ok);
  const made = k.create('accounts', { name: 'Credit Card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, last4: '7731' }, OWNER);
  assert.ok(made.ok, JSON.stringify(made));
  const r = { k, sql, card: made.value.id };
  const out = text(r.k, `Your Credit Card ${PAN} has been used for EGP 12.00 on 05/10/2026 at CORNER SHOP.`);
  assert.equal(out.state, 'proposed', out.reason);
  assert.match(out.reason ?? '', /7731/u);
  assert.doesNotMatch(out.reason ?? '', new RegExp(PAN, 'u'));
  const body = bodyOf(r.sql, out.suggestion!) as { tails: { digits: string }[] };
  assert.deepEqual(
    body.tails.map((t) => t.digits),
    ['7731'],
  );
  /* SAID YES TO ONCE, the card is confirmed by its last four, and the next whole number files straight away. */
  const yes = r.k.decide(out.suggestion!, { decide: { option: 'accept', reason: 'my card' } }, 'p_1');
  assert.ok(yes.ok, JSON.stringify(yes));
  assert.ok(confirmedTail(r.sql, { digits: '7731', row: r.card }));
  assert.equal(text(r.k, `Your Credit Card ${PAN} has been used for EGP 30.00 on 06/10/2026 at NILE BOOKS.`).state, 'matched');
  assert.equal(r.sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion WHERE instr(body, ?) > 0', `"${PAN}"`)!.n, 0, 'the whole number was kept as digits');
  r.sql.close();
});

test('A MAIL WAITING UNDER A QUESTION OF ITS OWN IS FILED BY THE ANSWER TO THE TEXTS, with nothing more arriving at its door', async () => {
  /* A mail pattern that does not say what it reads: its bare digits are no tail, and the mail waits with its account empty. */
  const plain = structuredClone(MAIL) as Declaration & { body: { extract: { account: { lookup: Record<string, unknown> } } } };
  delete plain.body.extract.account.lookup.says;
  const r = await record(CARD(), plain);
  const mailed = mail(r.k, charged('1234', 'NILE BOOKS', '40.00'));
  assert.equal(mailed.state, 'review', mailed.reason);
  const texted = text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  assert.notEqual(texted.suggestion, mailed.suggestion);
  answer(r, texted.suggestion!, r.card);
  assert.equal(r.k.count('transactions'), 2, 'the mail waited for the next mail');
  assert.equal(openQuestions(r.sql).length, 0);
  r.sql.close();
});

test('TWIN QUESTIONS ARE FOLDED ONCE, and a message both held is summed once', async () => {
  /* AN ANSWER THE RECORD DID NOT CARRY OUT, to be carried out at the next text: it sweeps the doors itself first. */
  const r = await record(CARD(), MAIL);
  const other = text(r.k, used('9876', 'CORNER SHOP', '5.00'));
  answer(r, other.suggestion!, travelCard(r));
  const texted = text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  /* ITS COLUMN CAUSE NAMES ITS DOOR, as migration 31 copied it from a body from before, so the mail's cause is free. */
  r.sql.exec("UPDATE suggestion SET body = json_set(body, '$.tail.digits', 'hidden'), cause = 'tail:bank-sms:accounts:1234' WHERE id = ?", texted.suggestion!);
  const mailed = mail(r.k, charged('1234', 'NILE BOOKS', '40.00'));
  r.sql.exec("UPDATE suggestion SET body = json_set(body, '$.tail.digits', '1234') WHERE id = ?", texted.suggestion!);
  /* THE MAIL'S QUESTION ALSO HOLDS THE TEXT, and says its sum. */
  r.sql.exec(
    "UPDATE suggestion SET body = json_set(body, '$.raws', json(?), '$.totals', json('{\"EGP\":5200}')) WHERE id = ?",
    JSON.stringify([texted.raw, mailed.raw]),
    mailed.suggestion!,
  );
  r.sql.exec("UPDATE suggestion SET body = json_remove(body, '$.applied') WHERE id = ?", other.suggestion!);

  text(r.k, used('5555', 'HALDEN COFFEE', '7.00'));
  const body = bodyOf(r.sql, texted.suggestion!) as Asked;
  assert.equal(body.count, 2);
  assert.deepEqual(body.totals, { EGP: 5_200 }, 'the text both questions held was summed twice');
  assert.equal(body.context, '2 messages wait for this, EGP 52.00 in all.');
  const closed = r.sql.all<{ n: number }>("SELECT rowid AS n FROM event WHERE kind = 'resolve' AND to_v = 'asked-again' AND target = ?", `suggestion:${mailed.suggestion}`);
  assert.equal(closed.length, 1, 'the mail question was closed twice');
  r.sql.close();
});
