/**
 * An enum's label, spelled the ways a person writes it, in the two engines: the record's, over the seed installed into a
 * real kernel, and this app's sample engine, which draws the demo. Tasks label `backlog` as **Later** and `review` as
 * **To check**, and a sentence may say either label in any case, with an underscore for the space or two spaces for one.
 *
 * THREE READINGS OF ONE WORD, and each had its own matcher. `compile` and `matches` read the filter, `declaredValue`
 * turns the word into what a URL and the live reader carry, and `inheritedFrom` decides what a capture line under the
 * filter writes. Batch twenty-six's checkers found the last two disagreeing with the kernel: `declaredValue` never read
 * a label at all, and `inheritedFrom` folded case but not the kernel's runs of spaces and underscores, so `state is
 * to_check` filled `review` on a record and nothing on the demo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import { readBlock, ROWS } from './api.ts';
import type { PageBlock } from './schema.ts';
import { compile, declaredValue, matches } from './where.ts';

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

/* The word each spelling must come to, which is the kernel's answer and asserted as such below, not assumed. */
const SPELLINGS: [said: string, stored: string][] = [
  ['Later', 'backlog'],
  ['later', 'backlog'],
  ['LATER', 'backlog'],
  ['To check', 'review'],
  ['to check', 'review'],
  ['to_check', 'review'],
  ['To  check', 'review'],
  ['to__check', 'review'],
  ['backlog', 'backlog'],
  ['review', 'review'],
];

type KernelRow = { fields: Record<string, unknown> };
const titles = (rows: readonly { fields: Record<string, unknown> }[]): string[] => rows.map((r) => String(r.fields.title)).sort();

for (const [said, stored] of SPELLINGS) {
  const where = `state is ${said}`;

  test(`${JSON.stringify(where)} NAMES THE SAME TASKS IN BOTH ENGINES`, async () => {
    const k = await kernel;
    const out = k.list({ register: 'tasks', where, limit: 500 }) as { ok: boolean; value: { rows: KernelRow[] } };
    assert.ok(out.ok, JSON.stringify(out));
    const w = compile('tasks', where);
    assert.deepEqual(w.bad, []);
    const sample = (ROWS.tasks ?? []).filter((e) => matches(e, w, NOW));
    assert.ok(out.value.rows.length > 0, 'the seed keeps tasks in both states, so an empty answer proves nothing');
    assert.deepEqual(titles(sample), titles(out.value.rows));
  });

  test(`${JSON.stringify(said)} IS ${stored} TO declaredValue, AS IT IS TO THE KERNEL'S SENTENCE`, async () => {
    const k = await kernel;
    const bySentence = k.list({ register: 'tasks', where, limit: 500 }) as { value: { rows: KernelRow[] } };
    const byTree = k.list({ register: 'tasks', where: { field: 'state', is: stored }, limit: 500 }) as { value: { rows: KernelRow[] } };
    assert.deepEqual(titles(bySentence.value.rows), titles(byTree.value.rows), 'the kernel reads the spelling as the stored value');
    assert.equal(declaredValue('tasks', 'state', said), stored);
  });

  test(`A CAPTURE UNDER ${JSON.stringify(where)} FILLS ${stored} IN BOTH ENGINES`, async () => {
    const k = await kernel;
    const block = { kind: 'capture', heading: 'What needs doing?', register: 'tasks', where };
    const record = k.block(block as never);
    const sample = readBlock(block as unknown as PageBlock);
    assert.deepEqual(record.refusals, [], JSON.stringify(record.refusals));
    assert.deepEqual(record.fills, { state: stored });
    assert.deepEqual(sample.fills, record.fills);
  });
}

test('AND A WORD THAT IS NEITHER A VALUE NOR A LABEL STILL PASSES THROUGH declaredValue UNCHANGED, which a filter needs', () => {
  assert.equal(declaredValue('tasks', 'state', 'sideways'), 'sideways');
});
