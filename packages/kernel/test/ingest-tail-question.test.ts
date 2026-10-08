/**
 * One question per door, list and digits (REC-A02): "Which account is the card ending 1234?"
 *
 * MEASURED ON THE OWNER'S RECORD: about seventeen of his twenty-five questions were one bank text each, every one
 * "bank-card-used-sms could not read account out of this one", none asking which account, and Accept refused because the
 * Ledger requires one. Here twenty texts printing one card's digits at five shops are one question that asks which
 * account, says how many wait and what they come to, and quotes the newest message.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD, CASH, bodyOf, cash, openQuestions, record, text, used } from './ingest-tail-kit.test.ts';

const SHOPS = ['CORNER SHOP', 'NILE BOOKS', 'HALDEN COFFEE', 'CEDAR LANE BAKERY', 'ORCHARD PRINTS'];

test('TWENTY TEXTS FOR ONE CARD AT FIVE SHOPS ARE ONE QUESTION, which asks which account, in his words', async () => {
  const r = await record();
  const held = Array.from({ length: 20 }, (_, i) => text(r.k, used('1234', SHOPS[i % 5]!, `${10 + i}.00`)));

  const asked = openQuestions(r.sql);
  assert.equal(asked.length, 1, `${asked.length} questions for one card`);
  const [q] = asked;
  assert.equal(q!.body_kind, 'options');
  assert.equal(r.k.question(q!.id), 'Which account is the card ending 1234?');
  for (const out of held) {
    assert.equal(out.state, 'review');
    assert.equal(out.suggestion, q!.id);
    /* THE REASON IN HIS WORDS: the field by its label, and no pattern's id and no list's id. */
    assert.equal(out.reason, 'No account has 1234 in Digits the bank prints. It waits for you to say which account it is.');
    assert.doesNotMatch(out.reason ?? '', /bank-sms|transactions|accounts|last4/u);
  }
  assert.equal(r.k.count('transactions'), 0, 'a text was filed to an account nobody named');

  const body = bodyOf(r.sql, q!.id) as {
    cause: string;
    count: number;
    totals: Record<string, number>;
    sample: string;
    context: string;
    options: { id: string; label: string; because: string; recommended?: boolean }[];
  };
  assert.equal(body.cause, 'tail:bank-sms:accounts:1234', 'the cause is kept on the question, as no column holds it yet');
  assert.equal(body.count, 20);
  /* ONE SUM PER CURRENCY, in minor units: 10.00 to 29.00 is 390.00. */
  assert.deepEqual(body.totals, { EGP: 39_000 });
  assert.equal(body.context, '20 messages wait for this, EGP 390.00 in all.');
  /* THE NEWEST MESSAGE'S OWN WORDS, replaced as each one joins. */
  assert.equal(body.sample, used('1234', SHOPS[19 % 5]!, '29.00'));
  /* THE FILTER'S ROWS AND NO OTHER: a card text never offers the current account, and "None of these" is last. */
  assert.deepEqual(
    body.options.map((o) => [o.id, o.label]),
    [
      [r.card, 'Credit Card'],
      ['none', 'None of these'],
    ],
  );
  assert.equal(body.options[0]!.because, 'Nothing is in its Digits the bank prints yet.');

  /* EACH ONE THAT JOINED IS IN THE LOG, so a question that grew never grew in silence. */
  const joins = r.sql.all<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ? AND field = 'rows' ORDER BY rowid", `suggestion:${q!.id}`);
  assert.equal(joins.length, 19);
  assert.equal(joins.at(-1)!.to_v, '20');
  r.sql.close();
});

test('ONE QUESTION PER DOOR, LIST AND DIGITS: two cards are two questions, and two patterns at one door share one', async () => {
  const r = await record(CARD(), CASH);
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('9876', 'CORNER SHOP', '12.00'));
  const withdrawn = text(r.k, cash('1234', '500.00'));
  const asked = openQuestions(r.sql);
  assert.equal(asked.length, 2);
  assert.deepEqual(
    asked.map((q) => r.k.question(q.id)),
    ['Which account is the card ending 1234?', 'Which account is the card ending 9876?'],
  );
  /* THE CASH PATTERN READS AT THE SAME DOOR, so its text joins the card's question for the same digits. */
  assert.equal(withdrawn.suggestion, asked[0]!.id);
  assert.equal((bodyOf(r.sql, asked[0]!.id) as { count: number }).count, 2);
  r.sql.close();
});

test('A LOOKUP THAT SAYS NOTHING OF WHAT IT READS ASKS ABOUT AN ACCOUNT, and bare digits are not a tail without it', async () => {
  const plain = await record(CARD({}, { says: undefined, where: undefined }));
  text(plain.k, used('1234', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(plain.sql);
  assert.equal(plain.k.question(q!.id), 'Which account is the account ending 1234?');
  /* WITH NO FILTER BOTH ACCOUNTS ARE OFFERED, those with no digits first and then by their number. */
  assert.deepEqual(
    (bodyOf(plain.sql, q!.id) as { options: { label: string }[] }).options.map((o) => o.label),
    ['Current account', 'Credit Card', 'None of these'],
  );
  plain.sql.close();

  /* NO STARS AND NO `says`: a bare number is a figure as often as not, so the message keeps the question it had. */
  const bare = await record(CARD({ match: { all: [{ field: 'body', contains: 'was used' }] }, extract: { ...(CARD().body as { extract: object }).extract, account: { lookup: { register: 'accounts', by: 'last4', after: 'card ending ' } } } }));
  const out = text(bare.k, 'Your card ending 1234 was used for EGP 12.00 on 05/10/2026 at CORNER SHOP.');
  assert.equal(out.state, 'review');
  assert.equal(bare.sql.one<{ body_kind: string }>('SELECT body_kind FROM suggestion WHERE id = ?', out.suggestion!)!.body_kind, 'rowset');
  bare.sql.close();
});

test('A MESSAGE THAT PRINTS NO DIGITS KEEPS ITS QUESTION, joined by door and what was missed and not by shop', async () => {
  const r = await record(CARD({}, { between: ['card ', ' has been'] }));
  const first = text(r.k, 'Your Credit Card has been used for EGP 12.00 on 05/10/2026 at CORNER SHOP.');
  const second = text(r.k, 'Your Credit Card has been used for EGP 40.00 on 05/10/2026 at NILE BOOKS.');
  assert.equal(first.state, 'review');
  assert.equal(r.sql.one<{ body_kind: string }>('SELECT body_kind FROM suggestion WHERE id = ?', first.suggestion!)!.body_kind, 'rowset');
  assert.equal(second.suggestion, first.suggestion, 'a second shop was asked again for the same missing account');
  assert.equal(r.k.question(first.suggestion!), 'Add this message from Bank texts to Transactions? Its account could not be read.');
  r.sql.close();
});

test('DIGITS AN AGENT WROTE ARE CONFIRMED ONCE, in one question per account and digits; a person’s file straight away', async () => {
  const r = await record();
  const put = r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'S42' });
  assert.ok(put.ok, JSON.stringify(put));
  const held = [text(r.k, used('1234', 'CORNER SHOP', '12.00')), text(r.k, used('1234', 'NILE BOOKS', '40.00'))];
  assert.equal(r.k.count('transactions'), 0, 'an agent’s digits filed money before anybody said they were right');
  const asked = openQuestions(r.sql);
  assert.equal(asked.length, 1, 'one question per text');
  assert.equal(r.k.question(asked[0]!.id), 'Which account is the card ending 1234?');
  assert.equal(held[0]!.reason, 'Credit Card has 1234 in Digits the bank prints, put there by an agent, so it waits for you to confirm it once.');
  const body = bodyOf(r.sql, asked[0]!.id) as { options: { id: string; recommended?: boolean }[]; context: string };
  assert.deepEqual(
    body.options.filter((o) => o.recommended).map((o) => o.id),
    [r.card],
    'the account the agent named is the one suggested',
  );
  assert.match(body.context, /^An agent put 1234 on Credit Card\. 2 messages wait for this/u);
  r.sql.close();

  const typed = await record();
  assert.ok(typed.k.write('accounts', typed.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const filed = text(typed.k, used('1234', 'CORNER SHOP', '12.00'));
  assert.equal(filed.state, 'matched', filed.reason);
  assert.equal(openQuestions(typed.sql).length, 0);
  typed.sql.close();
});
