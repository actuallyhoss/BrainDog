/**
 * An account that holds the end of the digits the bank prints is that account, to the question and to its answer alike.
 *
 * MEASURED ON THE LIVE RECORD, 20 Oct: HSBC (EGP) held 826 in its last four, and the bank's texts print 5826. "Which
 * account is the account ending 5826?" said every account had nothing in its last four yet, and pressing HSBC was then
 * refused because it "already holds 826". The two sentences disagreed, and neither let the texts be filed.
 *
 * EVERY VALUE IS INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OWNER, answer, bodyOf, openQuestions, record, text, used } from './ingest-tail-kit.ts';

type Option = { id: string; label: string; because: string };

test('DIGITS KEPT SHORT ARE OFFERED AS THE END OF WHAT WAS PRINTED, and the answer takes them and keeps them whole', async () => {
  const r = await record();
  text(r.k, used('5826', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(r.sql);
  assert.ok(q, 'no question was asked about 5826');

  /* HE PUTS THREE OF THE FOUR ON THE CARD BY HAND, after the question was asked. */
  assert.ok(r.k.update('accounts', r.card, { last4: '826' } as never, OWNER).ok);
  const offered = (bodyOf(r.sql, q.id).options as Option[]).find((o) => o.id === r.card);
  assert.equal(offered?.because, 'Digits the bank prints: 826, the end of 5826.', 'the option still says the card holds nothing');

  const said = answer(r, q.id, r.card).said;
  assert.equal(said, 'Filed 1 to Credit Card. Credit Card held 826 in Digits the bank prints, the end of 5826; it holds 5826 now.');
  assert.equal(r.k.get(r.card)?.fields.last4, '5826');
  assert.equal(r.k.count('transactions'), 1);
  assert.equal(openQuestions(r.sql).length, 0);
  r.sql.close();
});

test('DIGITS THAT ARE NOT THE END OF WHAT WAS PRINTED ARE STILL HIS, and the option and the refusal say the same digits', async () => {
  const r = await record();
  text(r.k, used('5826', 'CORNER SHOP', '12.00'));
  const [q] = openQuestions(r.sql);
  assert.ok(r.k.update('accounts', r.card, { last4: '5555' } as never, OWNER).ok);
  const offered = (bodyOf(r.sql, q!.id).options as Option[]).find((o) => o.id === r.card);
  assert.equal(offered?.because, 'Digits the bank prints: 5555.');
  const pressed = r.k.decide(q!.id, { decide: { option: r.card, reason: 'mine' } }, 'p_1');
  assert.ok(!pressed.ok && 'refusal' in pressed);
  assert.equal(pressed.refusal.fix, 'Credit Card already holds 5555 in Digits the bank prints. Change it on the account first, or pick another.');
  assert.equal(r.k.get(r.card)?.fields.last4, '5555');
  r.sql.close();
});
