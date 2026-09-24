/**
 * `/packs` lists only add-ons this build can install.
 *
 * TWO ADD-ONS NOBODY WROTE WERE OFFERED ON HIS RECORD. `Freelancer UK` by `k.marsh`, 214 stars, and `Type foundry` by
 * `a.brandt`, 37 stars, are the sample's picture of a catalogue (`lib/record/data.ts`), and Browse drew them on every
 * live record too, beside the real modules and under the same Install button (the direction survey of 23 September).
 * Nothing ships a document for either, so Install could only toast that it was not installable, and the star counts
 * are counts of nothing: no install or rating is recorded anywhere. The sample kept them as its picture until it went
 * (DIRECTION 26); `PACKS` is read here as test data, the catalogue those two still sit in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PACKS } from '../../lib/record/data.ts';
import { packDocument, type PackState } from '../../lib/record/packs.ts';
import { browseable } from './browseable.ts';

const held = (id: string): PackState => ({ id, version: '1.0.0', disabled_at: null, registers: [] });

test('Browse lists only add-ons this build ships a document for', async () => {
  const listed = browseable(PACKS, [held('portfolio')]);
  const unreal: string[] = [];
  for (const pack of listed) if ((await packDocument(pack.id, [held('portfolio')])) === null) unreal.push(pack.id);
  assert.deepEqual(unreal, [], 'these would be offered with an Install that can only say they cannot be installed');
});

test('no entry Browse lists carries a star count, the two pictured add-ons least of all', () => {
  const starred = browseable(PACKS, []).filter((p) => p.stars !== undefined).map((p) => `${p.id} (${p.stars})`);
  assert.deepEqual(starred, []);
});

test('a real module the record does not hold is still offered', () => {
  const ids = browseable(PACKS, [held('portfolio'), held('people')]).map((p) => p.id);
  assert.ok(ids.includes('money-core'), `Money should be offered, got ${ids.join(', ')}`);
  assert.ok(!ids.includes('portfolio') && !ids.includes('people'), 'what the record holds is not offered again');
});
