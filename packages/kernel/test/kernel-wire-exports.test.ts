/**
 * The lines batch 43 lands in the kernel's index, each checked so it fails by itself when its line is taken out: the
 * exports other packages reach through `@braindog/kernel`, one press of a rule as one batch, and a list of values bound
 * as one JSON array rather than a parameter each (a Durable Object refuses more than 100).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixOf, guarded } from '@braindog/ports';
import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

/* TWO HUNDRED, twice the Durable Object's 100 parameter cap, which `guarded` (the port's own guard) holds here. */
const VALUES = Array.from({ length: 200 }, (_, i) => `v${i}`);
const things = (values: string[], of: 'enum' | 'list' = 'enum'): Declaration => ({
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Things',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      of === 'enum' ? { id: 'pick', type: 'enum', values } : { id: 'pick', type: 'list', of: 'enum', values },
      { id: 'note', type: 'text' },
    ],
  },
} as never);

test('THE KERNEL LOADS, and every name batch 43 sends through it is there', async () => {
  const k = (await import('../src/index.ts')) as Record<string, unknown>;
  /* 1, kernel-signs-43: the quiet sign moved into signs.ts. */
  assert.equal(typeof k.quietSign, 'function', 'quietSign');
  /* 2, kernel-pages-43: what a withheld block is, and the census. */
  assert.ok(k.WITHHELD_CODES, 'WITHHELD_CODES');
  assert.equal(typeof k.whollyWithheld, 'function', 'whollyWithheld');
  assert.equal(typeof k.pathsOf, 'function', 'pathsOf');
  assert.equal(typeof k.censusOf, 'function', 'censusOf');
  /* 5, batch 42 kernel-shape. */
  for (const name of ['SHAPE_MARK', 'Scrambler', 'isShape', 'shapeBrainl']) assert.ok(k[name] !== undefined, name);
  /* 6, batch 41 kernel-faults and kernel-grants. */
  for (const name of ['readDeclaredSigns', 'shapeGrant', 'AGENTS_KEY', 'agentCap', 'agentsFull', 'liveAgents']) assert.ok(k[name] !== undefined, name);
});

test('ONE PRESS IS ONE BATCH: applying a rule carries the batch it was given to every write it makes', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([things(['open', 'shut'])])).ok);
  for (const what of ['a', 'b', 'c']) assert.ok(k.create('things', { what, pick: 'open' }, { actor: 'p_1' }).ok);
  const rule = { rule: 'tag', register: 'things', when: 'pick is open', then: [{ set: { field: 'note', to: 'seen' } }] };
  assert.ok((await k.install([{ id: 'rule.tag', kind: 'rule', body: rule as never }])).ok);

  const done = k.applyRule('tag', { batch: 'press-1' });
  assert.ok(done.ok, fixOf(done));
  assert.equal(done.value.applied, 3);
  const batches = sql.all<{ batch: string | null }>("SELECT DISTINCT batch FROM event WHERE field = 'note' AND to_v IS NOT NULL");
  assert.deepEqual(batches.map((b) => b.batch), ['press-1'], 'the rule wrote outside the batch it was handed');
  sql.close();
});

for (const shape of ['enum', 'list'] as const)
  test(`AN ${shape === 'enum' ? 'ENUM' : 'ENUM LIST'} OF 200 VALUES NARROWS UNDER THE 100 PARAMETER CAP, and a value a row holds is still refused`, async () => {
    const sql = openSqlite();
    const k = await openRecord(guarded(sql), fixedClock(NOW));
    const put = await k.install([things(VALUES, shape)]);
    assert.ok(put.ok, fixOf(put));
    assert.ok(k.create('things', { what: 'held', pick: shape === 'enum' ? 'v0' : ['v0', 'v1'] }, { actor: 'p_1' }).ok);

    const kept = await k.install([things(VALUES.slice(0, 190), shape)]);
    assert.ok(kept.ok, fixOf(kept));
    const narrowed = await k.install([things(VALUES.slice(1, 190), shape)]);
    assert.ok(!narrowed.ok, 'dropping a value a row holds was taken');
    assert.match(fixOf(narrowed), /would no longer take v0/);
    sql.close();
  });

test('THE DECLARATIONS BY KIND are read through one JSON array, never a parameter per kind', () => {
  const at = SRC.indexOf('function heldRows(');
  assert.ok(at > 0, 'heldRows is gone');
  const body = SRC.slice(at, SRC.indexOf('\n  }\n', at));
  assert.match(body, /kind IN \(SELECT value FROM json_each\(\?\)\)/);
  assert.doesNotMatch(body, /kinds\.map\(\(\) => '\?'\)/);
});
