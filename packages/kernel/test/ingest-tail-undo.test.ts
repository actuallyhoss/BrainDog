/**
 * An answered tail question carried out once, and an Undo that lets it be answered again (REC-A02).
 *
 * EVERY VALUE IS INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { answer, bodyOf, depsOf, openQuestions, record, text, used } from './ingest-tail-kit.ts';
import { offerAgain, reopenedTail } from '../src/ingest.ts';

const held = (r: { sql: { one<T>(q: string): T | undefined } }): number =>
  r.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM inbox_raw WHERE state IN ('review', 'proposed')")!.n;

test('TWO ANSWERS THE RECORD DID NOT CARRY OUT ARE EACH CARRIED OUT ONCE at the next text, and keep their closing lines', async () => {
  const r = await record();
  const other = r.k.create('accounts', { name: 'Travel card', kind: 'card', balance: { amount: 0, currency: 'EGP' } }, { actor: 'p_1' });
  assert.ok(other.ok);
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  text(r.k, used('5678', 'HALDEN COFFEE', '7.00'));
  const [a, b] = openQuestions(r.sql);
  assert.ok(a && b);
  assert.ok(r.k.decide(a.id, { decide: { option: r.card, reason: 'my card' } }, 'p_1').ok);
  assert.ok(r.k.decide(b.id, { decide: { option: other.value.id, reason: 'the other' } }, 'p_1').ok);

  const next = text(r.k, used('1234', 'ORCHARD PRINTS', '1.00'));
  assert.equal(next.state, 'matched', next.reason);
  assert.equal(r.k.count('transactions'), 4);
  assert.equal((bodyOf(r.sql, a.id) as { said?: string }).said, 'Filed 2 to Credit Card.');
  assert.equal((bodyOf(r.sql, b.id) as { said?: string }).said, 'Filed 1 to Travel card.');
  const notes = r.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'note' AND target IN (?, ?)", `suggestion:${a.id}`, `suggestion:${b.id}`)!.n;
  assert.equal(notes, 2, 'an answer was carried out twice');
  r.sql.close();
});

/** Twenty-odd texts made into one answered question, and the answer undone. */
async function undone(): Promise<{ r: Awaited<ReturnType<typeof record>>; q: string }> {
  const r = await record();
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  const [q] = openQuestions(r.sql);
  const { decision } = answer(r, q!.id, r.card);
  assert.equal(r.k.count('transactions'), 2);
  const plan = r.k.undoPlan({ decision: decision! });
  assert.ok(plan.ok, JSON.stringify(plan));
  assert.ok(r.k.undoApply({ decision: decision! }, plan.value.hash, 'p_1').ok);
  assert.equal(r.k.count('transactions'), 0);
  assert.deepEqual(openQuestions(r.sql).map((o) => o.id), [q!.id], 'the undo did not put the question back in Decide');
  return { r, q: q!.id };
}

test('AFTER AN UNDO A SECOND ANSWER FILES THE TEXTS AGAIN, though the first was carried out', async () => {
  const { r, q } = await undone();
  const again = answer(r, q, r.card);
  assert.equal(again.said, 'Filed 2 to Credit Card.');
  assert.equal(r.k.count('transactions'), 2);
  assert.equal(held(r), 0);
  r.sql.close();
});

test('AFTER AN UNDO THE TEXTS WAIT AGAIN under the question, when the Undo says so and at the next text when it does not', async () => {
  /* `undo.ts` calls `reopenedTail` itself on reopening the question, so the texts wait at once. */
  const told = await undone();
  assert.equal(held(told.r), 2);
  const body = bodyOf(told.r.sql, told.q);
  assert.equal(body.applied, undefined, 'the question still says it was carried out');
  assert.equal(body.said, undefined, 'the question still says what its undone answer filed');
  assert.equal(reopenedTail(told.r.sql, told.q), 0, 'a second call held them twice');
  told.r.sql.close();

  const untold = await undone();
  const next = text(untold.r.k, used('1234', 'HALDEN COFFEE', '7.00'));
  assert.equal(next.suggestion, untold.q, 'the next text did not join the question the undo put back');
  assert.equal(held(untold.r), 3);
  assert.equal((bodyOf(untold.r.sql, untold.q) as { count: number }).count, 3);
  assert.equal(answer(untold.r, untold.q, untold.r.card).said, 'Filed 3 to Credit Card.');
  untold.r.sql.close();
});

test('AN ACCOUNT ADDED AND PICKED AT ONCE OUTLIVES AN UNDO OF THE ANSWER, which takes back what the answer filed', async () => {
  const r = await record();
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  /* "No account could be it yet; add it, and it is offered here": he adds it and presses it in the same minute. */
  const made = r.k.create('accounts', { name: 'Travel card', kind: 'card', balance: { amount: 0, currency: 'EGP' } }, { actor: 'p_1' });
  assert.ok(made.ok);
  const [q] = openQuestions(r.sql);
  /* `create` offers it itself (index.ts): the account is offered without waiting for the next text. */
  assert.ok((bodyOf(r.sql, q!.id) as { options: { id: string }[] }).options.some((o) => o.id === made.value.id), 'the account added is not offered');
  assert.equal(offerAgain(depsOf(r.k, r.sql, r.clock.now()), 'accounts'), 0, 'offered again with nothing new');
  const { decision } = answer(r, q!.id, made.value.id);
  assert.equal(r.k.count('transactions'), 2);
  const plan = r.k.undoPlan({ decision: decision! });
  assert.ok(plan.ok, JSON.stringify(plan));
  assert.ok(r.k.undoApply({ decision: decision! }, plan.value.hash, 'p_1').ok);
  assert.equal(r.k.count('transactions'), 0);
  assert.ok(r.k.get(made.value.id), 'the undo of the answer took away the account he had just added');
  r.sql.close();
});
