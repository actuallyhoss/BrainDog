/**
 * The declarations, and the record's own row, are read once while neither moves (`held-declarations.ts`), and read again
 * the moment anything could have moved them: a write the kernel sends, a write made on the connection past it, a write
 * taken back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Param, Row, Sql } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 10, 24, 12);
const LIVE = 'SELECT id, version, kind, pack_id, body, checksum FROM declaration WHERE superseded_at IS NULL AND retired = 0 ORDER BY id';

const list = (id: string): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
});

/** A record over a port that counts how often each statement reached SQLite. */
async function record(): Promise<{ k: Kernel; sql: NodeSql; asked: (text: string) => number }> {
  const sql = openSqlite();
  const seen = new Map<string, number>();
  const count = (text: string) => void seen.set(text, (seen.get(text) ?? 0) + 1);
  const port: Sql = {
    exec: (text: string, ...params: Param[]) => sql.exec(text, ...params),
    all: <T = Row>(text: string, ...params: Param[]) => (count(text), sql.all<T>(text, ...params)),
    one: <T = Row>(text: string, ...params: Param[]) => (count(text), sql.one<T>(text, ...params)),
    transactionSync: <T>(fn: () => T) => sql.transactionSync(fn),
  };
  const k = await openRecord(port, fixedClock(NOW));
  const done = await k.install([list('obligations'), list('trips'), list('kilns')]);
  assert.ok(done.ok, JSON.stringify(done));
  return { k, sql, asked: (text) => seen.get(text) ?? 0 };
}

const ids = (k: Kernel) => k.declarations().map((d) => d.id);

test('THE LIVE DECLARATIONS ARE READ ONCE WHILE NONE MOVES, and again after an install', async () => {
  const { k, asked } = await record();
  ids(k);
  const once = asked(LIVE);
  ids(k);
  ids(k);
  assert.equal(asked(LIVE), once, 'a second read with nothing written went to SQLite');
  assert.ok((await k.install([list('studios')])).ok);
  assert.ok(ids(k).includes('register.studios'), 'the list installed is missing from the declarations');
  assert.ok(asked(LIVE) > once);
});

test('A WRITE MADE PAST THE KERNEL IS SEEN, alone or between two of its own', async () => {
  const { k, sql } = await record();
  assert.ok(ids(k).includes('register.trips'));
  sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'register.trips'");
  assert.ok(!ids(k).includes('register.trips'), 'a declaration retired past the kernel was still answered live');

  /* A write past the kernel and then one of the kernel's own before the next read, here one that reads nothing first:
     the kernel's write must not vouch for both. */
  sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'register.obligations'");
  k.setPref('p_1', 'look', 'plain');
  assert.ok(!ids(k).includes('register.obligations'), 'a write past the kernel, followed by one of its own, was not seen');
  sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'register.kilns'");
  const made = k.create('trips', { what: 'Cairo' }, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(!ids(k).includes('register.kilns'));
  sql.close();
});

test('A WRITE TAKEN BACK LETS WHAT WAS READ INSIDE IT GO', async () => {
  const { k, sql } = await record();
  assert.throws(() =>
    k.transaction(() => {
      assert.ok(k.retire(['register.trips']).ok);
      assert.ok(!ids(k).includes('register.trips'));
      throw new Error('taken back');
    }),
  );
  assert.ok(ids(k).includes('register.trips'), 'a retire that was rolled back was still answered');
  sql.close();
});

test('EACH ANSWER IS THE CALLER’S OWN: a list sorted, emptied or a row changed changes nothing for the next', async () => {
  const { k, sql } = await record();
  const first = k.declarations();
  const before = first.map((d) => d.id);
  first[0]!.id = 'changed';
  first.reverse();
  first.length = 0;
  assert.deepEqual(ids(k), before);
  sql.close();
});
