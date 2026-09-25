/**
 * A `capture` block in the two engines: the record's, over the sample installed into a real kernel, and this app's
 * sample engine, which draws the demo. They must fill a new row with the same values for the same `where:`, or a
 * line typed on the demo adds a task no real record would, and the other way round.
 *
 * THE SAMPLE'S ANSWER IS `inheritedFrom`, the register grid's own add, so the page kind and the grid cannot drift
 * apart either: one function says what a line under a filter inherits, and this holds the kernel to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import { readBlock } from './api.ts';
import type { PageBlock } from './schema.ts';
/* THE SAMPLE'S ROW NAMES, which a live tab learns from the record and this test asks the mirror about by name. */
import './fixtures/fill.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
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
  } as unknown as Sql;
}

const kernel = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  return k;
})();

const capture = (where?: string) => ({ kind: 'capture', heading: 'What needs doing?', register: 'tasks', ...(where === undefined ? {} : { where }) });

/* Each a filter a page over tasks is written with today, and one of each exclusion `inheritedFrom` makes. */
const WHERES: (string | undefined)[] = [
  undefined,
  'state is open',
  'state is Later',
  'state is open, agent is claude',
  'state is review or blocked',
  'state is not done or dropped',
  'by before +7d',
  'what is Rent',
  'thing is Kiln',
  /* ONE WRITTEN-OUT DAY AND ONE RELATIVE WORD, which `compile` puts in order at a clock. The sample's engine matches at
     the seed's 3 September and the kernel here is opened there too; `captureBlock` compiled at the wall clock once
     `compile` stopped reading `NOW`, and on 25 September refused this as "today is past 2026-09-20" while the kernel
     filled the task. */
  'by between today and 2026-09-20',
];

for (const where of WHERES)
  test(`A CAPTURE UNDER ${JSON.stringify(where ?? 'no filter')} FILLS A NEW TASK WITH THE SAME VALUES IN BOTH ENGINES`, async () => {
    const k = await kernel;
    const record = k.block(capture(where) as never);
    const sample = readBlock(capture(where) as unknown as PageBlock);
    assert.deepEqual(record.refusals, [], JSON.stringify(record.refusals));
    assert.deepEqual(sample.refusals, []);
    assert.deepEqual(sample.fills, record.fills);
    assert.equal(sample.register, 'tasks');
    assert.deepEqual(sample.rows, [], 'a capture reads no rows');
  });

test('AND WHAT IT FILLS IS THE STORED VALUE, on both: Later is backlog, and a set or a link is never guessed at', async () => {
  const k = await kernel;
  assert.deepEqual(k.block(capture('state is Later, agent is claude') as never).fills, { state: 'backlog', agent: 'claude' });
  assert.deepEqual(readBlock(capture('state is Later, agent is claude') as unknown as PageBlock).fills, { state: 'backlog', agent: 'claude' });
  assert.deepEqual(readBlock(capture('state is review or blocked') as unknown as PageBlock).fills, {});
  assert.deepEqual(readBlock(capture('thing is Kiln') as unknown as PageBlock).fills, {});
});

test('A CAPTURE INTO NO LIST, OR UNDER A FILTER THE LIST CANNOT READ, IS REFUSED BY BOTH, and fills nothing', async () => {
  const k = await kernel;
  for (const block of [{ kind: 'capture', register: 'nowhere' }, { kind: 'capture', register: 'tasks', where: 'colour is red' }, { kind: 'capture' }]) {
    const record = k.block(block as never);
    const sample = readBlock(block as unknown as PageBlock);
    assert.ok(record.refusals.length > 0, JSON.stringify(block));
    assert.ok(sample.refusals.length > 0, JSON.stringify(block));
    assert.equal(sample.fills, undefined);
    assert.equal(record.fills, undefined);
  }
});
