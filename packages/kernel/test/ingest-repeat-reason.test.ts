/**
 * A text skipped as a repeat keeps its reason and the row it repeats (REC-A03 step 3, the kernel half).
 *
 * BEFORE: "transactions#4 already says this.", a list's id and a number in front of a person, and nothing kept that a
 * screen could offer "It is a second one" on. A real bank sends two equal charges a day apart, and a skip with no way
 * back is a charge lost without a word (P.353: "silent skip with a reason").
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fileAsSecond } from '../src/ingest.ts';
import { CARD, depsOf, record, text, used } from './ingest-tail-kit.test.ts';

test('A REPEAT SAYS WHAT IT REPEATS, by its name, amount and day, and keeps the row', async () => {
  const r = await record(CARD({ dedupe: ['amount', 'account'] }));
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const first = text(r.k, used('1234', 'Corner Shop', '120.00', '07/10/2026'));
  assert.equal(first.state, 'matched');
  const again = text(r.k, used('1234', 'Corner Shop', '120.00', '08/10/2026'));
  assert.equal(again.state, 'skipped');
  assert.equal(again.reason, 'Looks like a repeat of Corner Shop, EGP 120.00, 7 Oct.');
  assert.equal(again.repeats, first.wrote[0]);
  assert.doesNotMatch(again.reason ?? '', /transactions|#\d/u);

  /* ON THE LOG TOO, beside the pattern that skipped it, for the inbox and the report. */
  const line = r.sql.one<{ actor: string; field: string; from_v: string; to_v: string }>(
    "SELECT actor, field, from_v, to_v FROM event WHERE kind = 'match' AND target = ? ORDER BY rowid DESC LIMIT 1",
    `inbox_raw:${again.raw}`,
  )!;
  assert.deepEqual({ ...line }, { actor: 'ingest:bank-sms', field: 'repeats', from_v: first.wrote[0], to_v: 'skipped' });

  /* "IT IS A SECOND ONE": one press files it beside the first. */
  const second = r.k.transaction(() => fileAsSecond(depsOf(r.k, r.sql), again.raw));
  assert.ok(second.ok, JSON.stringify(second));
  assert.equal(second.value.state, 'matched');
  assert.equal(r.k.count('transactions'), 2);
  /* AND ONLY A SKIPPED ONE. */
  const twice = r.k.transaction(() => fileAsSecond(depsOf(r.k, r.sql), again.raw));
  assert.equal(twice.ok, false);
  r.sql.close();
});

test('A TEXT THE SKIP LIST TURNS AWAY IS WRITTEN AGAINST ITS PATTERN, so what each pattern did can be counted', async () => {
  const r = await record(CARD({ skip: [{ when: { field: 'body', contains: 'declined' }, reason: 'A declined charge moved no money.' }] }));
  const out = text(r.k, `${used('1234', 'Corner Shop', '1.00')} It was declined.`);
  assert.equal(out.state, 'skipped');
  const line = r.sql.one<{ actor: string; to_v: string }>("SELECT actor, to_v FROM event WHERE kind = 'match' AND target = ?", `inbox_raw:${out.raw}`)!;
  assert.deepEqual({ ...line }, { actor: 'ingest:bank-sms', to_v: 'skipped' });
  r.sql.close();
});
