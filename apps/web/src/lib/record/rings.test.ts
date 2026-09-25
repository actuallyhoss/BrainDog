/**
 * How far along a project is, from the steps under it, in the two engines.
 *
 * A list may say its rows are steps of a project (`steps: { of, done }`), and a card whose ring reads a field nobody filled
 * draws the share of those steps done. The record works it out and this app draws what it answered; the sample works it
 * out the same way. Both must draw the same ring, and a number somebody typed must win in both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import { NOW, installSeed } from '@braindog/seed';

import { page } from './fixtures/readers.ts';
import { ROWS } from './data.ts';
import { REGISTERS } from './data.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      db.exec('BEGIN');
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as Sql;
}

const MILESTONES = {
  id: 'milestones',
  name: 'Milestones',
  one: 'milestone',
  title: 'what',
  mobile: ['what', 'thing', 'done'],
  steps: { of: 'thing', done: 'done' },
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'thing', type: 'ref', to: 'things' },
    { id: 'done', type: 'bool' },
  ],
};
const SAID = [true, false, false, false];

/** Each card's title and ring cell, as the renderer is handed them. */
const rings = (block: Parameters<typeof toSegments>[0]): string => JSON.stringify(toSegments(block));

test('A PROJECT WITH NO NUMBER TYPED IS AS FAR ALONG AS ITS STEPS, AND BOTH ENGINES DRAW THE SAME RING', async () => {
  /* THE RECORD: Portage's number cleared, four milestones on it, one done. */
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  assert.ok((await k.install([{ id: 'register.milestones', kind: 'register', body: MILESTONES as never }])).ok);
  const portage = (k.list({ register: 'things', where: 'name is Portage', limit: 1 }) as { value: { rows: { id: string; seq: number }[] } }).value.rows[0]!;
  assert.ok(k.update('things', `things#${portage.seq}`, { progress: null }, { actor: 'p_owner' }).ok);
  SAID.forEach((done, i) => assert.ok(k.create('milestones', { what: `Milestone ${i + 1}`, thing: portage.id, done }, { actor: 'p_owner' }).ok));
  const answered = (k.page('portfolio') as { value: { blocks: Record<string, unknown>[] } }).value.blocks.find((b) => b.heading === 'In play')!;
  assert.deepEqual(answered.rings, [null, null, 25]);
  const live = rings(blockOf(answered as never, new Map(), NOW));

  /* THE SAMPLE: the same list, the same four, and Portage's number cleared. */
  (REGISTERS as Record<string, unknown>).milestones = MILESTONES;
  const things = ROWS.things!;
  const at = things.findIndex((e) => e.fields.name === 'Portage');
  things[at] = { ...things[at]!, fields: { ...things[at]!.fields, progress: null } };
  ROWS.milestones = SAID.map((done, i) => ({ ...things[at]!, id: `m_${i}`, seq: i + 1, fields: { what: `Milestone ${i + 1}`, thing: things[at]!.seq, done } }));
  const sample = rings(page('portfolio')!.blocks.find((b) => b.heading === 'In play')!);

  assert.match(live, /25%/u, live);
  assert.match(sample, /25%/u, sample);
  for (const typed of ['60%', '85%']) {
    assert.ok(live.includes(typed), `the record's ${typed} was drawn over`);
    assert.ok(sample.includes(typed), `the sample's ${typed} was drawn over`);
  }
});
