/**
 * An answer to a tail question, carried out (REC-A02): the digits on the account, the confirmation kept for every pattern,
 * every text that waited filed oldest first, and a closing line that says what happened, all under one Undo.
 *
 * THE SCOPE'S OWN TEST, on an invented record: twenty texts printing one card's digits at five shops are one question;
 * one press on the account files twenty rows on it, writes its digits, empties Decide, and a twenty-first text files with
 * no question. Undo takes the twenty rows and the digits back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD, CASH, answer, bodyOf, cash, depsOf, openQuestions, record, text, used } from './ingest-tail-kit.test.ts';
import { answerAsked } from '../src/ingest.ts';

const SHOPS = ['CORNER SHOP', 'NILE BOOKS', 'HALDEN COFFEE', 'CEDAR LANE BAKERY', 'ORCHARD PRINTS'];

const digitsOn = (r: { k: { get(id: string): { fields: Record<string, unknown> } | null } }, id: string): unknown => r.k.get(id)?.fields.last4;

test('ONE PRESS FILES THE TWENTY ON THE ACCOUNT, writes its digits, empties Decide, and the twenty-first files alone', async () => {
  const r = await record();
  for (let i = 0; i < 20; i++) text(r.k, used('1234', SHOPS[i % 5]!, `${10 + i}.00`, `${String(1 + (i % 9)).padStart(2, '0')}/10/2026`));
  const [q] = openQuestions(r.sql);
  assert.ok(q);

  const { said, decision } = answer(r, q.id, r.card);
  assert.equal(said, 'Filed 20 to Credit Card.');
  assert.equal(r.k.count('transactions'), 20);
  const rows = r.sql.all<{ account: string }>("SELECT json_extract(fields, '$.account') AS account FROM entry WHERE register = 'transactions' AND deleted_at IS NULL");
  assert.ok(rows.every((row) => row.account === r.card), 'a row was filed to another account');
  assert.equal(digitsOn(r, r.card), '1234', 'the digits were not kept on the account');
  assert.equal(openQuestions(r.sql).length, 0, 'Decide still holds a question about them');
  assert.equal(r.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM inbox_raw WHERE state IN ('review', 'proposed')")!.n, 0);
  /* THE CLOSING LINE IS ON THE QUESTION, for Decide to say what the press did. */
  assert.equal((bodyOf(r.sql, q.id) as { said?: string }).said, 'Filed 20 to Credit Card.');

  const next = text(r.k, used('1234', 'CORNER SHOP', '99.00', '09/10/2026'));
  assert.equal(next.state, 'matched', next.reason);
  assert.equal(openQuestions(r.sql).length, 0);

  /* ONE UNDO PUTS IT BACK: the twenty rows and the digits, from the decision alone. */
  const plan = r.k.undoPlan({ decision: decision! });
  assert.ok(plan.ok, JSON.stringify(plan));
  const undone = r.k.undoApply({ decision: decision! }, plan.value.hash, 'p_1');
  assert.ok(undone.ok, JSON.stringify(undone));
  assert.equal(r.k.count('transactions'), 1, 'the undo left rows the answer filed, or took the one filed after it');
  assert.equal(digitsOn(r, r.card), undefined, 'the undo left the digits on the account');
  r.sql.close();
});

test('A ROW ALREADY THERE IS SAID, and the answer is confirmed for every pattern at any door', async () => {
  const r = await record(CARD(), CASH);
  /* THE SAME CHARGE TYPED BY HAND while its text waited: the run again finds it and says so, rather than file it twice. */
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  assert.ok(r.k.create('transactions', { what: 'NILE BOOKS', amount: { amount: 4_000, currency: 'EGP' }, on: '2026-10-05', account: r.card }, { actor: 'p_1' }).ok);
  const [q] = openQuestions(r.sql);
  assert.equal(answer(r, q!.id, r.card).said, 'Filed 1 to Credit Card. 1 was already there.');

  /* ANOTHER PATTERN PRINTING THE SAME DIGITS FILES STRAIGHT AWAY: what he said is about the card, not the wording. */
  const withdrawn = text(r.k, cash('1234', '500.00'));
  assert.equal(withdrawn.state, 'matched', withdrawn.reason);
  r.sql.close();
});

test('"NONE OF THESE" KEEPS THEM WAITING AND STOPS THE ASKING, until an account is added', async () => {
  const r = await record();
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(r.sql);
  assert.equal(answer(r, q!.id, 'none').said, null);
  assert.equal(r.k.count('transactions'), 0);

  const again = text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  assert.equal(again.state, 'review');
  assert.equal(again.suggestion, undefined, 'the same digits were asked about again after "None of these"');
  assert.equal(openQuestions(r.sql).length, 0);
  assert.equal(again.reason, 'No account has 1234 in Digits the bank prints. You said it is none of the ones offered, so it waits until a new account is added.');
  /* THE WAITING ONES ARE STILL HELD ON THE ANSWERED QUESTION, so the next question carries them. */
  assert.equal((bodyOf(r.sql, q!.id) as { raws: string[] }).raws.length, 2);

  /* AN ACCOUNT ADDED OPENS IT AGAIN, and the new one is offered. */
  const added = r.k.create('accounts', { name: 'Travel card', kind: 'card', balance: { amount: 0, currency: 'EGP' } }, { actor: 'p_1' });
  assert.ok(added.ok);
  const third = text(r.k, used('1234', 'HALDEN COFFEE', '7.00'));
  assert.ok(third.suggestion, 'adding an account did not open the question again');
  const asked = bodyOf(r.sql, third.suggestion) as { options: { label: string }[]; count: number };
  assert.ok(asked.options.map((o) => o.label).includes('Travel card'), asked.options.map((o) => o.label).join(', '));
  /* AND IT CARRIES THE TWO THAT WAITED UNDER THE ANSWERED ONE. */
  assert.equal(asked.count, 3);
  r.sql.close();
});

test('A FIELD THAT SPLITS TAKES THE NEW DIGITS BESIDE ITS OLD ONES, for a replaced card that still sends both', async () => {
  const r = await record(CARD({}, { split: true }));
  assert.ok(r.k.write('accounts', r.card, { last4: '5555' } as never, { actor: 'p_1' }).ok);
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(r.sql);
  /* THE ACCOUNT WITH DIGITS IS STILL OFFERED, after the ones with none, and says what it holds. */
  const card = (bodyOf(r.sql, q!.id) as { options: { id: string; because: string }[] }).options.find((o) => o.id === r.card);
  assert.equal(card?.because, 'Digits the bank prints: 5555.');
  answer(r, q!.id, r.card);
  assert.equal(digitsOn(r, r.card), '5555, 1234');
  assert.equal(text(r.k, used('5555', 'NILE BOOKS', '3.00')).state, 'matched');
  assert.equal(text(r.k, used('1234', 'NILE BOOKS', '4.00')).state, 'matched');
  r.sql.close();
});

test('THE PRESS IN DECIDE FILES AT ONCE, and neither the next text nor a late hand-through carries it out twice', async () => {
  const r = await record();
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  const [q] = openQuestions(r.sql);
  /* THE PRESS ALONE: `decide` hands the answer to the inbox itself (index.ts), in the decision's transaction. */
  const pressed = r.k.decide(q!.id, { decide: { option: r.card, reason: 'my card' } }, 'p_1');
  assert.ok(pressed.ok, JSON.stringify(pressed));
  assert.equal(r.k.count('transactions'), 2);
  assert.equal((bodyOf(r.sql, q!.id) as { said?: string }).said, 'Filed 2 to Credit Card.');

  const next = text(r.k, used('1234', 'HALDEN COFFEE', '7.00'));
  assert.equal(next.state, 'matched', next.reason);
  assert.equal(r.k.count('transactions'), 3);

  /* AND THE HOOK, CALLED LATE, DOES NOTHING TWICE. */
  const late = r.k.transaction(() => answerAsked(depsOf(r.k, r.sql, r.clock.now()), { id: q!.id, option: r.card, actor: 'p_1', batch: null }));
  assert.ok(late.ok);
  assert.equal(late.value, null);
  assert.equal(r.k.count('transactions'), 3);
  r.sql.close();
});

test('A WRONG ANSWER: digits moved to another account within 30 days ask once to move what they filed', async () => {
  const r = await record(CARD({}, { where: undefined }));
  const other = r.k.create('accounts', { name: 'Travel card', kind: 'card', balance: { amount: 0, currency: 'EGP' } }, { actor: 'p_1' });
  assert.ok(other.ok);
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  const [q] = openQuestions(r.sql);
  answer(r, q!.id, r.card);
  assert.equal(r.k.count('transactions'), 2);

  /* HE PUTS THE DIGITS ON THE OTHER CARD BY HAND. */
  assert.ok(r.k.write('accounts', r.card, { last4: null } as never, { actor: 'p_1' }).ok);
  assert.ok(r.k.write('accounts', other.value.id, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const next = text(r.k, used('1234', 'HALDEN COFFEE', '7.00'));
  assert.equal(next.state, 'matched');
  assert.equal(r.k.get(next.wrote[0]!)?.fields.account, other.value.id);

  const asked = openQuestions(r.sql);
  assert.equal(asked.length, 1, 'no question offered to move what the wrong answer filed');
  assert.equal(r.k.question(asked[0]!.id), 'Move the 2 transactions the card ending 1234 filed to Travel card?');
  /* ASKED ONCE: another text does not ask it again. */
  text(r.k, used('1234', 'ORCHARD PRINTS', '1.00'));
  assert.equal(openQuestions(r.sql).length, 1);

  assert.equal(answer(r, asked[0]!.id, 'move').said, 'Moved 2 to Travel card.');
  const on = r.sql.all<{ account: string }>("SELECT json_extract(fields, '$.account') AS account FROM entry WHERE register = 'transactions' AND deleted_at IS NULL");
  assert.ok(on.every((row) => row.account === other.value.id), 'a row the wrong answer filed stayed on the first card');
  r.sql.close();
});

test('AN ANSWER FOR DIGITS ANOTHER ACCOUNT HELD TAKES THEM OFF IT, so the next text names one account', async () => {
  const r = await record();
  const other = r.k.create('accounts', { name: 'Travel card', kind: 'card', balance: { amount: 0, currency: 'EGP' } }, { actor: 'S7' });
  assert.ok(other.ok);
  /* AN AGENT PUT THE DIGITS ON THE TRAVEL CARD; he says they are the Credit Card's. */
  assert.ok(r.k.write('accounts', other.value.id, { last4: '1234' } as never, { actor: 'S7' }).ok);
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(r.sql);
  answer(r, q!.id, r.card);
  assert.equal(digitsOn(r, r.card), '1234');
  assert.equal(digitsOn(r, other.value.id), undefined);
  const next = text(r.k, used('1234', 'NILE BOOKS', '2.00'));
  assert.equal(r.k.get(next.wrote[0]!)?.fields.account, r.card);
  r.sql.close();
});
