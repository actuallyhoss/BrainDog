/**
 * Work's Overview drawing one ticket under two headings.
 *
 * `loop/research-usability-2026-09-21.md` finding 15 measured this on the team pack's Home, where
 * `Blocked` and `Due this week` overlap by construction and the team lead's first reading is that
 * the board is double-counting. The same overlap is in the Work pack's own Overview, and it is
 * bigger: driven at 390 and at 1440 against the sample record, `/p/work` drew 21 rows and four
 * tickets appeared under more than one heading. `Chase Halden on 2026-041` and `Reconcile the
 * Fenwick invoice against services` were each drawn three times.
 *
 * WHAT THIS HOLDS AND WHAT IT DOES NOT. `Waiting on you` is the queue a person works from and
 * `Due soon` is what is due: two questions about the same tickets, one above the other, and a
 * ticket in both is counted twice by anybody reading down the page. Those two are held apart here.
 * `With an agent` further down is NOT: it answers a different question — which of these an agent
 * took and where that agent is with it — and it is the page's answer to "what are my agents doing"
 * (`loop/DIRECTION.md` §3). A row there is the answer rather than a second count of the work.
 *
 * AND THE DUE DAY HAS TO SURVIVE THE FIX, which is the second test. Taking what waits on you out of
 * `Due soon` would otherwise take a blocked ticket's date off the screen altogether: `Waiting on
 * you` drew Status, Agent, Why and Changed by, and no date at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { NOW, installSeed } from '../src/index.ts';

function openSqlite(): Sql & { close(): void } {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
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

async function overview(): Promise<{ page: PageResult; sql: Sql & { close(): void } }> {
  const sql = openSqlite();
  const k: Kernel = await openRecord(sql, { now: () => NOW });
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const out = k.page('work');
  assert.ok(out.ok, sayOf(out));
  return { page: out.value, sql };
}

const block = (page: PageResult, heading: string) => {
  const found = page.blocks.find((b) => b.heading === heading);
  assert.ok(found, `Work's Overview has no block headed ${heading}`);
  assert.deepEqual(found.refusals, [], `${heading} refused`);
  return found;
};

test('NO TICKET IS DRAWN UNDER BOTH OF WORK’S TWO QUEUES, because a person reading down the page counts it twice', async () => {
  const { page, sql } = await overview();

  const waiting = block(page, 'Waiting on you');
  const due = block(page, 'Due soon');
  assert.ok(waiting.rows.length > 0 && due.rows.length > 0, 'the sample needs rows in both for this to bite');

  const above = new Set(waiting.rows.map((r) => r.id));
  const twice = due.rows.filter((r) => above.has(r.id)).map((r) => String(r.fields.what));
  assert.deepEqual(twice, [], 'drawn under Waiting on you and again under Due soon');
  sql.close();
});

test('and the queue says when each of them is due, so holding it back from Due soon does not lose the date', async () => {
  const { page, sql } = await overview();

  const waiting = block(page, 'Waiting on you');
  const columns = (waiting.columns ?? []).map((c) => String(c.field));
  assert.ok(columns.includes('by'), `Waiting on you draws ${columns.join(', ')} and no due day`);

  /* AND THE ROWS CARRY ONE. A column over a field every row left empty is a column of dashes. */
  const dated = waiting.rows.filter((r) => r.fields.by !== null && r.fields.by !== undefined);
  assert.ok(dated.length > 0, 'nothing in the queue has a due day, so the column says nothing');
  sql.close();
});
