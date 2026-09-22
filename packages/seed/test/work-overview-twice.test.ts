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
 * WHAT THIS HOLDS. Since work 1.6.0 the Overview draws what is in play as lists that tick, one heading per
 * question: Today, This week, After this week, No due day, Waiting on you, With an agent and Later. EVERY ONE IS HELD
 * APART FROM EVERY OTHER here, `With an agent` included. Under 1.5.0 it was not, on the argument that a row there
 * answered a different question; that argument held for a table and does not hold for a list a person ticks down,
 * where one task under two headings is two ticks for one piece of work.
 *
 * THE SAMPLE ALONE DOES NOT BITE ON THE CORNERS, so the first test adds the tasks that would land under two
 * headings, or under none, if one predicate drifted: handed back by an agent and due today, taken by an agent and due
 * today, kept for later with a date this week, and one of yours on each side of the two day lines, due today,
 * tomorrow, in seven days and in eight. THE DAY LINES WERE MISSED AT FIRST: with only the first three, widening
 * Today to `by before +2d` drew nothing twice on the sample and the test passed, because the sample has no task of
 * yours due tomorrow.
 *
 * AND UNDER NONE WAS NOT ASKED AT ALL until a task of yours with no due day was added: at 1.6.0 it matched no list, and
 * the test passed, because every corner had a date or an agent. So the lists are now read against the whole register,
 * every task in play must be under exactly one of them, and No due day is the seventh list that holds it.
 *
 * AND WHAT WAS GIVEN UP, said here because a test that stops asking a question should say so. 1.5.0 put the due day on
 * `Waiting on you` so that holding a ticket back from `Due soon` did not take its date off the screen. A `todo` draws
 * two cells, the task and one detail, and the brief gives that detail to the reason it waits, the note. The queue is
 * still in the order it falls due, which the second test holds.
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

const GROUPS = ['Today', 'This week', 'After this week', 'No due day', 'Waiting on you', 'With an agent', 'Later'];

test('NO TASK IS DRAWN UNDER TWO OF WORK’S LISTS AND NONE IS LEFT OUT, because a person ticking down the page would tick it twice or never', async () => {
  const { page: sample, sql: first } = await overview();
  for (const heading of ['Today', 'This week', 'Waiting on you', 'With an agent']) assert.ok(block(sample, heading).rows.length > 0, `the sample draws nothing under ${heading}, so this does not bite`);
  first.close();

  const sql = openSqlite();
  const k: Kernel = await openRecord(sql, { now: () => NOW });
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const today = new Date(NOW).toISOString().slice(0, 10);
  const on = (days: number) => new Date(NOW + days * 86_400_000).toISOString().slice(0, 10);
  const corners = [
    { what: 'Handed back by an agent, due today', state: 'review', agent: 'claude', by: today },
    { what: 'Taken by an agent, due today', state: 'doing', agent: 'claude', by: today },
    { what: 'Kept for later, dated this week', state: 'backlog', by: on(3) },
    { what: 'Yours, due today', state: 'open', by: today },
    { what: 'Yours, due tomorrow', state: 'open', by: on(1) },
    { what: 'Yours, due in seven days', state: 'open', by: on(7) },
    { what: 'Yours, due in eight days', state: 'open', by: on(8) },
    { what: 'Yours, with no day', state: 'open' },
    { what: 'Taken by an agent, with no day', state: 'doing', agent: 'codex' },
    { what: 'Kept for later, with no day', state: 'backlog' },
  ];
  for (const c of corners) assert.ok(k.create('tasks', c, { actor: 'p_1' }).ok, c.what);
  const out = k.page('work');
  assert.ok(out.ok, sayOf(out));

  /* EVERY LIST ON THE PAGE THAT TICKS, and not only the ones named here, so a list added later is held apart too. */
  const lists = out.value.blocks.filter((b) => b.kind === 'todo');
  const where = new Map<string, string[]>();
  for (const b of lists) {
    assert.deepEqual(b.refusals, [], `${String(b.heading)} refused`);
    /* A list cut short by its limit would hide what it matched, and a task hidden that way is left out too. */
    assert.equal(b.rows.length, b.matched, `${String(b.heading)} matched ${String(b.matched)} and drew ${b.rows.length}, so this cannot see the rest`);
    for (const r of b.rows) where.set(String(r.fields.what), [...(where.get(String(r.fields.what)) ?? []), String(b.heading)]);
  }
  const twice = [...where].filter(([, hs]) => hs.length > 1).map(([what, hs]) => `${what}: ${hs.join(' and ')}`);
  assert.deepEqual(twice, [], 'drawn under two headings');

  /* AND EVERY TASK IN PLAY IS UNDER ONE OF THEM, asked of the record and not of the corners above, so a task of a shape
     nobody thought to add is still found. */
  const all = k.list({ register: 'tasks', limit: 200 });
  assert.ok(all.ok, sayOf(all));
  const left = all.value.rows
    .filter((r) => !['done', 'dropped'].includes(String(r.fields.state)) && !where.has(String(r.fields.what)))
    .map((r) => `${String(r.fields.what)} (${String(r.fields.state)}, ${String(r.fields.agent ?? 'no agent')}, ${String(r.fields.by ?? 'no day')})`);
  assert.deepEqual(left, [], 'in play and under none of the lists');

  assert.deepEqual(lists.map((b) => String(b.heading)).sort(), [...GROUPS].sort(), 'the lists that tick are not the ones this names');
  assert.deepEqual(
    corners.map((c) => where.get(c.what)),
    [['Waiting on you'], ['With an agent'], ['Later'], ['Today'], ['This week'], ['This week'], ['After this week'], ['No due day'], ['With an agent'], ['Later']],
    'each corner is drawn once, under the heading that answers it',
  );
  sql.close();
});

test('and the queue says why each task waits, in the order they fall due', async () => {
  const { page, sql } = await overview();

  const waiting = block(page, 'Waiting on you');
  const columns = (waiting.columns ?? []).map((c) => String(c.field));
  assert.deepEqual(columns, ['what', 'note', 'by', 'changed'], `Waiting on you draws ${columns.join(', ')}`);

  const days = waiting.rows.map((r) => String(r.fields.by));
  assert.ok(days.length > 1, 'the sample needs two waiting tasks for the order to mean anything');
  assert.deepEqual(days, [...days].sort(), 'the queue is not in the order it falls due');
  sql.close();
});
