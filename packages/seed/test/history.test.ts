/**
 * The sample's history: written over a night and a morning on the sample's own day, not in one instant.
 *
 * Every line of every feed read "just now", because the seed wrote its rows, its questions and its rules' work at the
 * record's one clock reading, and the backup the night run missed sat under You as a question filed four weeks ago
 * (visual review 4). `HISTORY` says when each part happened, and the record writes each then (`kernel.backdate`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { byOf, openRecord } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { HISTORY, NOW, day, installSeed } from '../src/index.ts';

function openSqlite(): Sql & { close(): void; db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    db,
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

test('THE SAMPLE IS WRITTEN AS A HISTORY, oldest first and all on its own day, so a feed reads when each thing happened', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));

  const events = sql.all<{ ts: string; actor: string; kind: string; target: string | null }>('SELECT ts, actor, kind, target FROM event ORDER BY rowid');
  /* IN THE ORDER IT WAS WRITTEN, so a line written later never says it happened sooner. */
  for (let i = 1; i < events.length; i++) assert.ok(events[i]!.ts >= events[i - 1]!.ts, `${JSON.stringify(events[i])} is stamped before the line above it`);
  /* NOT ONE INSTANT, AND NOT ANOTHER DAY: a stamped day (a task done with no Done on) is the sample's day either way. */
  assert.ok(new Set(events.map((e) => e.ts)).size > 5, 'the sample is still written in one instant');
  assert.ok(events.every((e) => e.ts.slice(0, 10) === day(0) && Date.parse(e.ts) <= NOW), 'a line is stamped off the sample’s day or after its clock');
  assert.equal(events[0]!.ts, new Date(HISTORY.kept).toISOString());

  /* THE NIGHT'S FAILED BACKUP IS ASKED BY THE RECORD, AT THE NIGHT RUN, and its line is a rule's, not yours. */
  const backup = sql.one<{ id: string; opened_by: string; opened_at: string }>("SELECT id, opened_by, opened_at FROM suggestion WHERE id = 'SG7'")!;
  assert.deepEqual([backup.opened_by, backup.opened_at], ['system', new Date(HISTORY.asked.SG34!.opened).toISOString()]);
  const asked = events.find((e) => e.kind === 'suggest' && e.target === 'suggestion:SG7')!;
  assert.equal(byOf(asked.actor), 'rule');
  /* AND THE SEED'S OWN HAND IS THE RECORD'S, NEVER YOU. */
  assert.ok(events.every((e) => byOf(e.actor) !== 'you'), 'a line the sample wrote is filed under You');
  sql.close();
});
