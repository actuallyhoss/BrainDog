/**
 * The boot probe: a SQLite that cannot host a record opens as a refusal (`30 §13`, `37 §5.1` step 4, W60-3).
 *
 * MEASURED BEFORE THIS FILE EXISTED, 24 September 2026, over the kernel's own `openSqlite()`: an adapter that refuses
 * `USING fts5` made `applyMigrations` throw `no such module: fts5` out of migration 1, so `openRecord` and everything
 * above it threw instead of answering. And an adapter that opened a file whose migrations were already applied, and
 * refused only reads of `entry_fts`, opened clean: `applyMigrations` never touches `entry_fts` once it is built, so the
 * record answered every method until the first search, and then failed there with a driver sentence and no code. The
 * second is the one a self-hoster meets, because a `.brain` file written on one machine is opened on another.
 *
 * `RECORD_UNAVAILABLE` IS THE CODE because `30 §6` maps it to 503, and a 503 says the one thing that is true here: the
 * caller's request was fine and a deploy (a Node that bundles FTS5) fixes it. The adapter's own `NO_SUCH_MODULE` never
 * reaches a caller (`37 §6`); this is the refusal it becomes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Param, Sql } from '@braindog/ports';

import { applyMigrations } from '../src/migrate.ts';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const clock = fixedClock(Date.UTC(2026, 8, 24, 12));

/** `base`, with every statement whose text matches `when` refused in the driver's own words. */
const refusing = (base: NodeSql, when: RegExp, said: string): Sql => {
  const check = (text: string) => {
    if (when.test(text)) throw new Error(said);
  };
  return {
    exec: (text: string, ...params: Param[]) => (check(text), base.exec(text, ...params)),
    all: <T>(text: string, ...params: Param[]) => (check(text), base.all<T>(text, ...params)),
    one: <T>(text: string, ...params: Param[]) => (check(text), base.one<T>(text, ...params)),
    transactionSync: <T>(fn: () => T) => base.transactionSync(fn),
  };
};

const version = (base: NodeSql) => String(base.one<{ v: string }>('SELECT sqlite_version() AS v')?.v);

test('A SQLITE WITHOUT FTS5 OPENS AS A REFUSAL, NOT A THROW', async () => {
  /* A NEW FILE: migration 1 is where `entry_fts` is created, so that is where the module is missing. */
  const fresh = openSqlite();
  const { result, state } = await applyMigrations(refusing(fresh, /USING fts5/i, 'no such module: fts5'), clock);
  assert.equal(result.ok, false);
  assert.equal(state.refusal?.code, 'RECORD_UNAVAILABLE');
  assert.equal(state.refusal?.at, 'sqlite.fts5');
  assert.ok(state.refusal?.fix.includes(`SQLite ${version(fresh)}`), `the fix names the SQLite it measured: ${state.refusal?.fix}`);
  assert.deepEqual(state.applied, []);
  /* AND NOTHING WAS HALF-BUILT: migration 1 runs in one transaction, so the refusal left no table behind it. */
  assert.deepEqual(fresh.all("SELECT name FROM sqlite_master WHERE name IN ('entry', 'declaration', 'record')"), []);
  fresh.close();

  /* A FILE THAT ALREADY HAS ITS SCHEMA, opened by a SQLite that cannot read its search index. Every migration is
     applied, so only the probe's read of `entry_fts` can find this out. */
  const existing = openSqlite();
  assert.ok((await applyMigrations(existing, clock)).result.ok);
  const blind = refusing(existing, /\bentry_fts\b/, 'no such module: fts5');
  const again = await applyMigrations(blind, clock);
  assert.equal(again.state.refusal?.code, 'RECORD_UNAVAILABLE');
  assert.equal(again.state.applied.length, 18, 'the ledger it read is still reported');

  const kernel = await openRecord(blind, clock);
  const created = kernel.createRecord({
    id: 'rec_probe',
    slug: 'probe',
    name: 'Probe',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' },
  });
  assert.ok(!created.ok && 'refusal' in created);
  assert.equal(created.refusal.code, 'RECORD_UNAVAILABLE', 'the refusal is sticky, like SCHEMA_NEWER');
  assert.match(created.refusal.fix, /^SQLite \d+\.\d+\.\d+ has no fts5, /);
  existing.close();
});

test('A SQLITE WITHOUT JSON IS REFUSED BEFORE A MIGRATION RUNS', async () => {
  const fresh = openSqlite();
  const { state } = await applyMigrations(refusing(fresh, /\bjson\(/, 'no such function: json'), clock);
  assert.equal(state.refusal?.code, 'RECORD_UNAVAILABLE');
  assert.equal(state.refusal?.at, 'sqlite.json');
  assert.deepEqual(fresh.all('SELECT version FROM migration'), [], 'the ledger exists and holds nothing');
  fresh.close();
});

test('A FAILURE THAT IS NOT A MISSING MODULE IS NOT REFUSED AS ONE', async () => {
  /* The probe names one fact. A disk that fails the same read is a different fact and keeps its own sentence, the
     line `measureCaps` in `@braindog/ports` draws for the same reason. */
  const existing = openSqlite();
  await applyMigrations(existing, clock);
  await assert.rejects(applyMigrations(refusing(existing, /\bentry_fts\b/, 'disk I/O error'), clock), { message: 'disk I/O error' });
  const fresh = openSqlite();
  await assert.rejects(applyMigrations(refusing(fresh, /USING fts5/i, 'database or disk is full'), clock), {
    message: 'database or disk is full',
  });
  existing.close();
  fresh.close();
});

test('A SQLITE WITH BOTH OPENS AS BEFORE, AND THE PROBE WRITES NOTHING', async () => {
  const sql = openSqlite();
  const first = await applyMigrations(sql, clock);
  assert.equal(first.state.refusal, null);
  const tables = () => sql.all<{ name: string }>('SELECT name FROM sqlite_master ORDER BY name').map((r) => r.name);
  const before = tables();
  const second = await applyMigrations(sql, clock);
  assert.equal(second.state.refusal, null);
  assert.deepEqual(tables(), before);
  sql.close();
});
