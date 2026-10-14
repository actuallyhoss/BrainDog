/**
 * `listGovernance` with `order: 'wait'` reads the open questions in the order Decide shows them (AGT-C08 step 4).
 *
 * NEWEST FIRST HANDED AN AGENT THE WRONG QUESTION. One opened a minute ago that only rewords a note sat on top, while
 * one opened yesterday that moves money waited under it, so the agent picked up the plain one and the person, on Decide,
 * looked at the other. By wait, the rank is `weigh.ts`'s own (`WAIT_RANK_SQL`), ties newest first, closed ones last.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listGovernance } from '../src/govern.ts';
import { openRecord, waitOf, waitRows, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const MINUTE = 60_000;
const DAY = 86_400_000;

type Row = Record<string, unknown>;

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'due', type: 'day', deadline: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const rowset = (question: string, rows: Row[]) => ({ question, body_kind: 'rowset' as const, body: { register: 'bills', rows } });

/**
 * Four open questions, each opened at its own time: one moving money yesterday, one plain four days ago, one plain a
 * minute ago, and one a minute and a half ago that rewords a bill falling due tomorrow (soon by the row, not the body).
 */
async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock>; ids: Record<'money' | 'old' | 'plain' | 'due', string> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 5 * DAY);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([BILLS])).ok);
  const rent = value<{ id: string }>(k.create('bills', { what: 'Rent', note: 'monthly' }, { actor: 'p_1' })).id;
  const water = value<{ id: string }>(k.create('bills', { what: 'Water', note: 'quarterly', due: '2026-10-14' }, { actor: 'p_1' })).id;
  const ask = (at: number, question: string, rows: Row[]): string => {
    clock.set(at);
    return value<{ id: string }>(k.propose(rowset(question, rows), 'p_1')).id;
  };
  const old = ask(NOW - 4 * DAY, 'Reword the rent note?', [{ at: rent, version: 1, patch: { note: 'on the first' } }]);
  const money = ask(NOW - DAY, 'File the gas bill?', [{ what: 'Gas', amount: { amount: 4200, currency: 'GBP' } }]);
  const due = ask(NOW - 1.5 * MINUTE, 'Reword the water note?', [{ at: water, version: 1, patch: { note: 'every three months' } }]);
  const plain = ask(NOW - MINUTE, 'Reword the rent note again?', [{ at: rent, version: 1, patch: { note: 'on the second' } }]);
  clock.set(NOW);
  return { k, sql, clock, ids: { money, old, plain, due } };
}

const ids = (rows: Row[]): string[] => rows.map((r) => String(r.id));

test('BY WAIT, A QUESTION OPENED YESTERDAY THAT MOVES MONEY OUTRANKS ONE OPENED A MINUTE AGO THAT IS PLAIN', async () => {
  const { sql, ids: q } = await record();
  const rows = value<Row[]>(listGovernance({ sql, nowMs: NOW }, 'suggestion', { order: 'wait' }));
  /* soon first, newest first among them (the bill due tomorrow, then the money); then old; then new. */
  assert.deepEqual(ids(rows), [q.due, q.money, q.old, q.plain]);
  assert.deepEqual(rows.map((r) => r.waits), ['soon', 'soon', 'old', 'new']);
  sql.close();
});

test('THE WAIT EACH QUESTION SAYS IS THE ONE waitOf GIVES, with the record read, so the agent and Decide agree', async () => {
  const { sql } = await record();
  const rows = value<Row[]>(listGovernance({ sql, nowMs: NOW }, 'suggestion', { order: 'wait' }));
  for (const r of rows) assert.equal(r.waits, waitOf({ body_kind: String(r.body_kind), body: r.body, opened_at: String(r.opened_at) }, NOW, waitRows(sql)), String(r.id));
  sql.close();
});

test('THE DEFAULT ORDER IS UNCHANGED: newest first, and no wait is said', async () => {
  const { sql, k, ids: q } = await record();
  const rows = value<Row[]>(listGovernance({ sql, nowMs: NOW }, 'suggestion', {}));
  assert.deepEqual(ids(rows), [q.plain, q.due, q.money, q.old]);
  assert.ok(rows.every((r) => !Object.hasOwn(r, 'waits')));
  assert.deepEqual(ids(value<Row[]>(k.governance('suggestion'))), ids(rows));
  sql.close();
});

test('A PAGE AT A TIME BY WAIT WALKS THE SAME ORDER, each question once', async () => {
  const { sql, ids: q } = await record();
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 6; i++) {
    const page = value<Row[]>(listGovernance({ sql, nowMs: NOW }, 'suggestion', { order: 'wait', limit: 1, ...(cursor === undefined ? {} : { cursor }) }));
    if (page.length === 0) break;
    seen.push(...ids(page));
    cursor = String(page.at(-1)?.id);
  }
  assert.deepEqual(seen, [q.due, q.money, q.old, q.plain]);
  sql.close();
});

test('A CLOSED QUESTION KEEPS ITS ORDER, after every open one', async () => {
  const { sql, k, ids: q } = await record();
  value(k.decide(q.money, { decide: { option: 'reject', reason: 'The gas bill is already filed.' } }, 'p_2'));
  const all = value<Row[]>(listGovernance({ sql, nowMs: NOW }, 'suggestion', { status: 'all', order: 'wait' }));
  assert.deepEqual(ids(all), [q.due, q.old, q.plain, q.money]);
  assert.ok(!Object.hasOwn(all.at(-1)!, 'waits'), 'a closed question has nothing left to wait for');
  /* and the open ones alone are by wait still, the money one gone from them */
  assert.deepEqual(ids(value<Row[]>(listGovernance({ sql, nowMs: NOW }, 'suggestion', { order: 'wait' }))), [q.due, q.old, q.plain]);
  sql.close();
});

test('A DECISION READ ASKING BY WAIT IS READ AS ALWAYS: the order is for questions only', async () => {
  const { sql, k, ids: q } = await record();
  value(k.decide(q.old, { decide: { option: 'reject', reason: 'The note is right as it is.' } }, 'p_2'));
  const plain = value<Row[]>(listGovernance({ sql, nowMs: NOW }, 'decision', {}));
  assert.deepEqual(value<Row[]>(listGovernance({ sql, nowMs: NOW }, 'decision', { order: 'wait' })), plain);
  sql.close();
});
