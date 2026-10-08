/**
 * Held texts run again from their stored bytes (REC-A02): oldest first and two hundred at a time when an answer frees
 * them, at the next text when digits reach an account by hand, and once when the pattern that held them is updated.
 *
 * BEFORE THIS, A HELD TEXT WAS NEVER READ AGAIN (`ingest.ts`'s own comment said so): a fix to a pattern reached only the
 * texts after it, and the ones that waited for it went on waiting.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rerunHeld } from '../src/ingest.ts';
import { CARD, answer, bodyOf, depsOf, openQuestions, record, text, used } from './ingest-tail-kit.ts';

test('MORE THAN TWO HUNDRED WAITING FILE OLDEST FIRST, in one batch that one Undo puts back', async () => {
  const r = await record();
  const n = 230;
  for (let i = 0; i < n; i++) text(r.k, used('1234', `SHOP ${String(i).padStart(3, '0')}`, `${1 + i}.00`));
  const [q] = openQuestions(r.sql);
  assert.equal((bodyOf(r.sql, q!.id) as { count: number }).count, n);

  const { said, decision } = answer(r, q!.id, r.card);
  assert.equal(said, `Filed ${n} to Credit Card.`);
  /* OLDEST FIRST: the rows are numbered in the order the texts came. */
  const order = r.sql.all<{ what: string }>("SELECT json_extract(fields, '$.what') AS what FROM entry WHERE register = 'transactions' ORDER BY seq").map((x) => x.what);
  assert.deepEqual(order, [...order].sort(), 'the texts were filed out of the order they came in');
  assert.equal(order.length, n);

  const plan = r.k.undoPlan({ decision: decision! });
  assert.ok(plan.ok, JSON.stringify(plan));
  assert.ok(r.k.undoApply({ decision: decision! }, plan.value.hash, 'p_1').ok);
  assert.equal(r.k.count('transactions'), 0);
  r.sql.close();
});

test('DIGITS PUT ON THE ACCOUNT BY HAND ANSWER THE OPEN QUESTION at the next text, which closes as filed and says so', async () => {
  const r = await record();
  text(r.k, used('1234', 'CORNER SHOP', '12.00'));
  text(r.k, used('1234', 'NILE BOOKS', '40.00'));
  const [q] = openQuestions(r.sql);
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const next = text(r.k, used('1234', 'HALDEN COFFEE', '7.00'));
  assert.equal(next.state, 'matched', next.reason);
  assert.equal(r.k.count('transactions'), 3);
  const closed = r.sql.one<{ status: string; resolved_as: string }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', q!.id)!;
  assert.deepEqual([closed.status, closed.resolved_as], ['resolved', 'filed']);
  assert.equal((bodyOf(r.sql, q!.id) as { said: string }).said, '1234 is on Credit Card now. Filed 2 to Credit Card.');
  r.sql.close();
});

test('WHEN A PATTERN IS UPDATED, WHAT IT HELD RUNS AGAIN ONCE, and the questions it asked close as filed', async () => {
  /* THE OLD VERSION READS THE AMOUNT AFTER A WORD THE BANK STOPPED PRINTING, so every text waits on the amount. */
  const broken = CARD({ extract: { ...(CARD().body as { extract: Record<string, unknown> }).extract, amount: { money: { after: 'charged ', currency: 'EGP' } } } });
  const r = await record(broken);
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const held = [text(r.k, used('1234', 'CORNER SHOP', '12.00')), text(r.k, used('1234', 'NILE BOOKS', '40.00'))];
  assert.ok(held.every((h) => h.state === 'review'));
  const asked = openQuestions(r.sql, 'rowset');
  assert.ok(asked.length >= 1);

  /* `install` runs what the older version held itself (index.ts), so the two file with the new version. */
  const fixed = await r.k.install([CARD()]);
  assert.ok(fixed.ok, JSON.stringify(fixed));
  assert.equal(r.k.count('transactions'), 2);
  for (const q of asked) {
    const closed = r.sql.one<{ status: string; resolved_as: string }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', q.id)!;
    assert.deepEqual([closed.status, closed.resolved_as], ['resolved', 'filed']);
  }
  /* ONCE: run again, nothing is held, so nothing is filed twice. */
  const again = r.k.transaction(() => rerunHeld(depsOf(r.k, r.sql, r.clock.now()), ['bank-sms']));
  assert.ok(again.ok);
  assert.equal(again.value.filed, 0);
  assert.equal(r.k.count('transactions'), 2);
  r.sql.close();
});

test('AND WITH NOTHING HANDED AN INSTALL, THE NEXT TEXT AT THE DOOR RUNS WHAT AN OLDER VERSION HELD, once', async () => {
  /* A PACK'S UPDATE LANDS ON MORE THAN ONE PATH, and a text its fix reads must not wait on which one it took. */
  const broken = CARD({ extract: { ...(CARD().body as { extract: Record<string, unknown> }).extract, amount: { money: { after: 'charged ', currency: 'EGP' } } } });
  const r = await record(broken);
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const held = [text(r.k, used('1234', 'CORNER SHOP', '12.00')), text(r.k, used('1234', 'NILE BOOKS', '40.00'))];
  assert.ok(held.every((h) => h.state === 'review'));
  const asked = openQuestions(r.sql, 'rowset');

  /* AN HOUR APART, as an update and the next text are: what the old version read is older than the new one. */
  r.clock.advance(3_600_000);
  assert.ok((await r.k.install([CARD()])).ok);
  r.clock.advance(60_000);
  const next = text(r.k, used('1234', 'HALDEN COFFEE', '7.00'));
  assert.equal(next.state, 'matched', next.reason);
  assert.equal(r.k.count('transactions'), 3, 'the texts the old version held were not read again');
  for (const q of asked) assert.equal(r.sql.one<{ resolved_as: string }>('SELECT resolved_as FROM suggestion WHERE id = ?', q.id)!.resolved_as, 'filed');

  /* ONCE: a text the new version holds too is not run again at every text after it. */
  const odd = text(r.k, 'Your Credit Card ending with *** 1234 has been used on 05/10/2026 at NOWHERE.');
  assert.equal(odd.state, 'review');
  const matches = (): number => r.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'match' AND target = ?", `inbox_raw:${odd.raw}`)!.n;
  const before = matches();
  r.clock.advance(60_000);
  text(r.k, used('1234', 'CEDAR LANE BAKERY', '9.00'));
  assert.equal(matches(), before, 'a text the live version already read was read again');
  r.sql.close();
});
