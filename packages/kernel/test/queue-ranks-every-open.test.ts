/**
 * A queue ranks every open question, not the newest twenty, and says how many waited too long and how many are hard to
 * undo over every one it matched.
 *
 * MEASURED BEFORE: `openQuestions` read the twenty newest and ranked those, so an expensive question asked a month ago
 * under twenty-one newer cheap ones never reached a page, and Decide's "two of them for over two weeks" counted the
 * twenty it was handed (`loop/research-audit-11-13.md`, kernel-queue-walk).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type PageBlock } from '../src/index.ts';
import { STALE_DAYS } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const DAY = 86_400_000;
const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It helps.' }, { id: 'no', label: 'No', because: 'It does not.' }] };

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 40 * DAY);
  const k = await openRecord(sql, clock);
  value(await k.install([TASKS]));
  value(k.create('tasks', { what: 'Glaze test' }, OWNER));
  return { k, sql, clock };
}

const queue = (k: Awaited<ReturnType<typeof record>>['k'], more: Partial<PageBlock> = {}) =>
  k.block({ kind: 'queue', source: 'governance.open', ...more } as PageBlock) as ReturnType<typeof k.block> & {
    waiting?: { stale: number; hardToUndo: number };
  };

test('THE EXPENSIVE QUESTION A MONTH OLD LEADS, under twenty-five newer cheap ones, and the counts are of all of them', async () => {
  const { k, sql, clock } = await record();
  /* A month ago: one change to a row somebody has, which is hard to undo. */
  const old = value<{ id: string }>(
    k.propose({ question: 'Rename the glaze test?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: 'tasks#1', version: 1, patch: { what: 'Glaze test two' } }] } }, 'slash'),
  );
  /* Then twenty-five calls, the first five more than two weeks ago and the rest this week. */
  clock.set(NOW - 30 * DAY);
  for (let i = 0; i < 25; i += 1) {
    clock.set(i < 5 ? NOW - (20 - i) * DAY : NOW - (5 - i / 10) * DAY);
    value(k.propose({ question: `Question ${i}?`, body_kind: 'options', body: OPTIONS }, 'p_1'));
  }
  clock.set(NOW);

  const read = queue(k);
  assert.deepEqual(read.refusals, []);
  assert.equal(read.queue?.[0]?.id, old.id, 'the expensive question past the newest twenty did not lead');
  assert.equal(read.matched, 26);
  assert.deepEqual(read.waiting, { stale: 6, hardToUndo: 1 }, 'the counts were of what was drawn');

  /* A PREDICATE GOES TO THE RECORD, so the question it admits is found however old, and counted with the rest. */
  const slash = queue(k, { where: 'who is slash' });
  assert.deepEqual(slash.queue?.map((q) => q.id), [old.id]);
  assert.equal(slash.matched, 1);
  assert.deepEqual(slash.waiting, { stale: 1, hardToUndo: 1 });

  const calls = queue(k, { where: 'cost is call', limit: 2 });
  assert.equal(calls.queue?.length, 2);
  assert.equal(calls.matched, 25);
  assert.deepEqual(calls.waiting, { stale: 5, hardToUndo: 0 });
  /* Within a band the oldest leads. */
  assert.equal(calls.queue?.[0]?.question, 'Question 0?');
  sql.close();
});

test('A QUESTION PUT OFF IS NOT COUNTED as waiting, and one asked exactly two weeks ago has not waited past them', async () => {
  const { k, sql, clock } = await record();
  clock.set(NOW - STALE_DAYS * DAY);
  value(k.propose({ question: 'On the line?', body_kind: 'options', body: OPTIONS }, 'p_1'));
  clock.set(NOW - 30 * DAY);
  const later = value<{ id: string }>(k.propose({ question: 'Put off?', body_kind: 'options', body: OPTIONS }, 'p_1'));
  sql.exec('UPDATE suggestion SET defer_until = ? WHERE id = ?', new Date(NOW + DAY).toISOString(), later.id);
  clock.set(NOW);
  const read = queue(k);
  assert.equal(read.matched, 1);
  assert.deepEqual(read.waiting, { stale: 0, hardToUndo: 0 });
  clock.advance(1);
  assert.deepEqual(queue(k).waiting, { stale: 1, hardToUndo: 0 });
  sql.close();
});
