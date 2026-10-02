/**
 * Free is one person (DIRECTION §35): a free record takes nobody who is not on it already, and every other plan takes
 * anybody. Before this, `join` wrote `dir_member` for whoever an invitation named, on any plan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FREE_JOIN_REFUSED, createDirectory, type Named } from '../src/directory.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

function ledger() {
  const sql = openSqlite();
  const d = createDirectory(sql, { now: () => Date.UTC(2026, 9, 2, 9) });
  value(d.person$('ada@example.com', 'Ada'));
  const made = value<Named>(d.provision({ slug: 'ada', email: 'ada@example.com', plan: 'free' }));
  const owner = sql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', made.record)!.owner;
  const bo = value<{ id: string }>(d.person$('bo@example.com', 'Bo'));
  return { d, sql, record: made.record, owner, bo: bo.id };
}

test('A FREE RECORD TAKES NOBODY ELSE, in a sentence that says what to do, and writes no member row', () => {
  const { d, sql, record, bo } = ledger();
  assert.deepEqual(d.joinable(record, bo), { code: 'FORBIDDEN', fix: FREE_JOIN_REFUSED, at: 'plan' });
  const out = d.join(record, bo) as { ok: boolean; refusal?: { fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.fix, FREE_JOIN_REFUSED);
  assert.equal(d.reaches(record, bo), false);
  sql.close();
});

test('ITS OWNER IS ALREADY ON IT, so a join for them is still a yes', () => {
  const { d, sql, record, owner } = ledger();
  assert.equal(d.joinable(record, owner), null);
  value(d.join(record, owner));
  sql.close();
});

test('PAID FOR, IT TAKES ANYBODY, and the plan is read back as it is', () => {
  const { d, sql, record, bo } = ledger();
  assert.equal(d.planFor(record), 'free');
  value(d.setPlan(record, 'hosted'));
  assert.equal(d.planFor(record), 'hosted');
  assert.equal(d.joinable(record, bo), null);
  value(d.join(record, bo));
  assert.equal(d.reaches(record, bo), true);
  assert.equal(d.planFor('rec_unknown'), null);
  sql.close();
});
