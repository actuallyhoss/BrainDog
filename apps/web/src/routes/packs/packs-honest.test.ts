/**
 * `/packs` on a live record lists only add-ons this build can install, and the sample keeps its illustration.
 *
 * TWO ADD-ONS NOBODY WROTE WERE OFFERED ON HIS RECORD. `Freelancer UK` by `k.marsh`, 214 stars, and `Type foundry` by
 * `a.brandt`, 37 stars, are the sample's picture of a catalogue (`lib/record/data.ts`), and Browse drew them on every
 * live record too, beside the real modules and under the same Install button (the direction survey of 23 September).
 * Nothing ships a document for either, so Install could only toast that it was not installable, and the star counts
 * are counts of nothing: no install or rating is recorded anywhere. The sample may keep them, because the sample is a
 * picture and says so on every write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PACKS } from '../../lib/record/data.ts';
import { packDocument, type PackState } from '../../lib/record/packs.ts';
import { browseable } from './browseable.ts';

const held = (id: string): PackState => ({ id, version: '1.0.0', disabled_at: null, registers: [] });

test('on a live record, Browse lists only add-ons this build ships a document for', async () => {
  const listed = browseable(PACKS, true, [held('portfolio')]);
  const unreal: string[] = [];
  for (const pack of listed) if ((await packDocument(pack.id, [held('portfolio')])) === null) unreal.push(pack.id);
  assert.deepEqual(unreal, [], 'these would be offered with an Install that can only say they cannot be installed');
});

test('on a live record, no entry Browse lists carries a star count', () => {
  const starred = browseable(PACKS, true, []).filter((p) => p.stars !== undefined).map((p) => `${p.id} (${p.stars})`);
  assert.deepEqual(starred, []);
});

test('on a live record, a real module the record does not hold is still offered', () => {
  const ids = browseable(PACKS, true, [held('portfolio'), held('people')]).map((p) => p.id);
  assert.ok(ids.includes('money-core'), `Money should be offered, got ${ids.join(', ')}`);
  assert.ok(!ids.includes('portfolio') && !ids.includes('people'), 'what the record holds is not offered again');
});

test('the sample keeps its illustration: both pictured add-ons, with their stars', () => {
  const listed = browseable(PACKS, false, []);
  assert.deepEqual(
    listed.map((p) => [p.id, p.stars]),
    [['freelancer-uk', 214], ['type-foundry', 37]],
  );
});
