/**
 * A filter on one of the record's own columns is not a scan an index would fix.
 *
 * AUDIT FIFTY-FIVE, FINDING 2. The MCP tools name a page's refs by reading each list they point into where `id` is in
 * them, and the record's `list` counted every such read as `query.scan` of `<list>.id`, because it asks the
 * declaration which fields are indexed and no declaration has a field called `id`. Measured through `handle` on the
 * seed: ten lists of tasks and ten of learnings counted `things.id 20, learnings.id 10, tasks.id 10, people.id 10,
 * tracks.id 10`, and a hundred of each made the weekly look draft "things.id was scanned 200 times in thirty days,
 * and an index would pay for itself". `id` is the primary key, `seq` is `UNIQUE (register, seq)` and `updated_at` is
 * `entry_live`, while `created_at` and `version` are names `declare` refuses as a field, so the `index: true` the
 * draft asks for can be installed on none of the five. `packages/mcp/test/names-cache.test.ts` drives the audit's
 * shape end to end; this file holds the kernel's half of it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KERNEL_FIELDS } from '@braindog/where';

import { findingsFrom, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'n', type: 'int' },
    ],
  } as never,
};

/** A record the governors let speak: thirty rows over five days, three weeks old. The shape `observe.test.ts` uses. */
async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 20 * DAY);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([NOTES])).ok);
  for (let i = 0; i < 30; i++) {
    clock.set(NOW - 20 * DAY + (i % 5) * DAY);
    assert.ok(k.create('notes', { what: `Row ${String(i)}`, n: i }, { actor: 'p_1' }).ok);
  }
  clock.set(NOW);
  return { k, sql };
}

const scans = (sql: NodeSql): string[] =>
  sql.all<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'query.scan' ORDER BY subject").map((r) => r.subject);

test('a scan of each of the five kernel columns is not counted, and a scan of a declared field still is', async () => {
  const { k, sql } = await record();
  const columns = Object.keys(KERNEL_FIELDS);
  assert.deepEqual(columns, ['id', 'seq', 'created_at', 'updated_at', 'version']);
  const said = k.observe([...columns, 'n'].map((field) => ({ kind: 'query.scan' as const, subject: `notes.${field}` })));
  assert.ok(said.ok);
  assert.deepEqual(scans(sql), ['notes.n']);
  /* THE COUNT IT ANSWERS IS THE ROWS IT WROTE, as it already was for an observation with no subject. */
  assert.equal(said.value, 1);
});

test('a scan of a kernel column that is only the start of a field name is still counted', async () => {
  /* `idle` STARTS WITH `id` AND IS NOT IT. The column is the whole name after the list's, or nothing. */
  const { k, sql } = await record();
  assert.ok(k.observe([{ kind: 'query.scan', subject: 'notes.idle' }, { kind: 'query.scan', subject: 'notes.seq_no' }]).ok);
  assert.deepEqual(scans(sql), ['notes.idle', 'notes.seq_no']);
});

test('the same subject under any other signal is still counted, since only a scan is what an index would fix', async () => {
  /* THE KIND CHECK HAD NO TEST. With it deleted every test above still passed, and a `search.empty` or `tool.retry`
     whose subject happens to read `notes.id` would have been dropped at the door with nothing said. */
  const { k, sql } = await record();
  assert.ok(k.observe([{ kind: 'search.empty', subject: 'notes.id' }, { kind: 'tool.retry', subject: 'notes.version' }]).ok);
  assert.deepEqual(
    sql
      .all<{ kind: string; subject: string }>("SELECT kind, subject FROM observation WHERE kind IN ('search.empty', 'tool.retry') ORDER BY kind")
      .map((r) => `${r.kind} ${r.subject}`),
    ['search.empty notes.id', 'tool.retry notes.version'],
  );
});

test('two hundred scans of things.id counted before this change draft nothing, and two hundred of a field still do', async () => {
  /* THE ROWS ALREADY WRITTEN. Every record the tools have named refs on since fe741dfa holds `<list>.id` rows for the
     next thirty days, so leaving them out at the door alone would still draft the false proposal once a week until
     they aged out. They are planted by SQL, the way they were written before. */
  const { k, sql } = await record();
  const day = new Date(NOW).toISOString().slice(0, 10);
  sql.exec("INSERT INTO observation (kind, subject, day, n) VALUES ('query.scan', 'things.id', ?, 200)", day);
  const looked = k.analyse();
  assert.equal(looked.suspended, null, `the governors held the look: ${String(looked.suspended)}`);
  assert.equal(looked.candidate, null, `the look proposed ${JSON.stringify(looked.candidate)}`);
  assert.deepEqual(sql.all("SELECT payload FROM outbox WHERE kind = 'infer.draft'"), []);

  /* AND THE DETECTOR STILL WORKS. A declared field with no index, scanned as often, is the finding it exists for. */
  sql.exec("INSERT INTO observation (kind, subject, day, n) VALUES ('query.scan', 'notes.n', ?, 200)", day);
  assert.equal(k.analyse().candidate?.subject, 'notes.n');
});

test('the screen that reads the same counts is told the same, since it asks findingsFrom', () => {
  const found = findingsFrom([
    { signal: 'query.scan', subject: 'things.id', total: 400, days: 30 },
    { signal: 'query.scan', subject: 'tasks.updated_at', total: 400, days: 30 },
    { signal: 'query.scan', subject: 'tasks.due', total: 400, days: 30 },
  ]);
  assert.deepEqual(found.map((f) => f.subject), ['tasks.due']);
  /* AND BELOW THE LINE LIKEWISE, which is where the one-in-ten exploration draws from. */
  const below = findingsFrom([{ signal: 'query.scan', subject: 'things.id', total: 150, days: 3 }], true);
  assert.deepEqual(below, []);
});
