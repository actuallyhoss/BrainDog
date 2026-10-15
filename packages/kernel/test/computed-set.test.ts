/**
 * `computedSet` and `computedFor` (`src/computed-set.ts`): the kernel's computed sources served as data, each with the
 * kind it draws as, so the web asks for a forecast's source by its kind and never spells it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { computedFor, computedSet } from '../src/computed-set.ts';
import { WALK_SOURCE } from '../src/money-figures.ts';
import { SOURCE_MODULES, type Source } from '../src/sources/index.ts';

const PACKS = join(import.meta.dirname, '..', '..', '..', 'packs');

test("computedFor('forecast') answers the walk ahead", () => {
  assert.equal(computedFor('forecast'), WALK_SOURCE);
  assert.equal(computedSet().find((c) => c.source === WALK_SOURCE)?.drawsAs, 'forecast');
});

test('every source module is listed once, in the order the table holds them', () => {
  const set = computedSet();
  assert.deepEqual(set.map((c) => c.source), Object.keys(SOURCE_MODULES));
  assert.equal(new Set(set.map((c) => c.source)).size, set.length);
  assert.ok(set.every((c) => typeof c.drawsAs === 'string' && c.drawsAs !== ''));
});

test('a kind two sources draw as names neither, and a kind none draws as names nothing', () => {
  assert.equal(computedFor('queue'), null, 'what waits and what waits for later are both queues');
  assert.equal(computedFor('table'), null);
  assert.equal(computedFor('gauge'), null);
  assert.equal(computedFor('feed'), 'activity');
});

test('a source registered later is in the set with no line in it, and its own word for its kind wins', () => {
  const stub: Source & { drawsAs?: string } = { read: (_deps, _block, base) => base };
  const kinded: Source & { drawsAs?: string } = { read: (_deps, _block, base) => base, drawsAs: 'heat' };
  SOURCE_MODULES['stub.later'] = stub;
  SOURCE_MODULES['stub.kinded'] = kinded;
  try {
    const set = computedSet();
    assert.deepEqual(set.find((c) => c.source === 'stub.later'), { source: 'stub.later', drawsAs: 'table' });
    assert.equal(computedFor('heat', set), 'stub.kinded');
  } finally {
    delete SOURCE_MODULES['stub.later'];
    delete SOURCE_MODULES['stub.kinded'];
  }
});

test('the set names no add-on: no source is an id an add-on declares', () => {
  const ids = new Set(
    readdirSync(PACKS)
      .map((dir) => join(PACKS, dir, `${dir}.pack.json`))
      .filter((file) => existsSync(file))
      .map((file) => (JSON.parse(readFileSync(file, 'utf8')) as { pack: string }).pack),
  );
  assert.ok(ids.size > 0, 'no add-on was read');
  for (const c of computedSet()) {
    assert.ok(!ids.has(c.source), `${c.source} is an add-on's id`);
    assert.ok(!ids.has(c.source.split('.')[0]!), `${c.source} starts with an add-on's id`);
  }
});
