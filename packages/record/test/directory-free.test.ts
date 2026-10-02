/**
 * Free, the plan a record made without paying is on (DIRECTION §35): the Directory names it, meters it and holds it to
 * its own allowance, and every record already there keeps the plan it had.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALLOWANCE, PLANS, createDirectory, type AccountUsage, type Named } from '../src/directory.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const SEPT = Date.UTC(2026, 8, 15, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

function ledger() {
  const sql = openSqlite();
  const d = createDirectory(sql, { now: () => SEPT });
  value(d.person$('ada@example.com', 'Ada'));
  return { d, sql };
}

test('FREE IS A PLAN WITH ITS OWN ALLOWANCE, smaller than Cloud on every meter', () => {
  assert.ok((PLANS as readonly string[]).includes('free'));
  const free = ALLOWANCE.free!;
  const hosted = ALLOWANCE.hosted!;
  assert.deepEqual(free, { runs: 1_000, requests: 10_000, bytes: 100_000_000, ms: 5 * 3_600_000 });
  for (const key of Object.keys(free) as (keyof typeof free)[]) assert.ok(free[key] < hosted[key], `Free's ${key} is not below Cloud's`);
});

test('A RECORD MADE WITH NO PLAN IS STILL HOSTED, and one put on free is metered and held as free', () => {
  const { d, sql } = ledger();
  const made = value<Named>(d.provision({ slug: 'the-studio', email: 'ada@example.com' }));
  const owner = sql.one<{ owner: string }>('SELECT owner FROM dir_record WHERE id = ?', made.record)!.owner;
  const plan = () => value<AccountUsage>(d.usage(owner, { from: '2026-09-01', to: '2026-09-30' })).records[0]!;
  assert.equal(plan().plan, 'hosted', 'a record provisioned with no plan moved off the plan every record already had');

  value(d.setPlan(made.record, 'free'));
  assert.equal(plan().plan, 'free');
  assert.deepEqual(plan().month.allowance, ALLOWANCE.free);

  sql.exec("INSERT INTO dir_usage_day (record, day, scope, action, runs) VALUES (?, '2026-09-02', 'global', 'backfill', ?)", made.record, ALLOWANCE.free!.runs);
  assert.deepEqual(d.mayRun(made.record, 'npm downloads'), {
    until: Date.UTC(2026, 9, 1),
    say: 'npm downloads is waiting until 1 October. This record has used its 1,000 runs for September.',
  });

  /* Upgraded, the same month's runs are well inside Cloud's, and it runs again. */
  value(d.setPlan(made.record, 'hosted'));
  assert.equal(d.mayRun(made.record, 'npm downloads'), null);
  sql.close();
});

test('A RECORD CAN BE MADE ON FREE in the one provision', () => {
  const { d, sql } = ledger();
  const made = value<Named>(d.provision({ slug: 'ada', email: 'ada@example.com', plan: 'free' }));
  assert.equal(sql.one<{ plan: string }>('SELECT plan FROM dir_record WHERE id = ?', made.record)?.plan, 'free');
  sql.close();
});
