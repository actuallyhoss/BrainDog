/**
 * Things here twice are not things gone stale (audit 25 October, Y4): Settings said "32 things went stale" over the one
 * line "32 keys are here twice", while Health said 9 things needed a look. A list's twins are their own heading, each list
 * a line that opens where they fold, and the stale count is only what went stale.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { staleLine, staleRows, twiceHeading, twiceOf } from './stale.ts';

const answer = (lines: unknown) => ({ ok: true as const, value: { lines, count: 0 } });

const SPOOLS = { kind: 'rows-same', said: '12 spools are here twice', count: 12, clear: 'See them, and the one press that folds them, at /r/spools?twice=1' };
const KILNS = { kind: 'rows-same', said: '1 kiln is here twice', count: 1, clear: 'See them, and the one press that folds them, at /r/kilns?twice=1' };
const STEPS = { kind: 'steps', said: '2 steps were left earlier and nobody took them', count: 2, clear: 'handoff with drop S3 and why' };

test('TWINS ARE NOT STALE: the stale line counts only what went stale, and none at all says nothing', () => {
  const rows = staleRows(answer([SPOOLS, KILNS, STEPS]));
  assert.equal(staleLine(rows), '2 things went stale');
  assert.equal(staleLine(staleRows(answer([SPOOLS]))), null);
});

test('EVERY LIST HELD TWICE IS A LINE OF ITS OWN, opening where its twins fold, and no call reaches the screen', () => {
  const twice = twiceOf(staleRows(answer([SPOOLS, KILNS, STEPS])));
  assert.deepEqual(
    twice.map((r) => [r.said, r.count, r.href]),
    [
      ['12 spools are here twice', 12, '/r/spools?twice=1'],
      ['1 kiln is here twice', 1, '/r/kilns?twice=1'],
    ],
  );
  /* A LINE WHOSE PLACE CANNOT BE READ IS WORDS, never a link somewhere else. */
  const odd = twiceOf(staleRows(answer([{ ...SPOOLS, clear: 'fold them at https://elsewhere.test/r/x' }])));
  assert.equal(odd[0]!.href, null);
  for (const r of twice) assert.doesNotMatch(r.said, /See them|press/u);
});

test('THE TWINS HEADING SAYS WHAT THEY ARE, with how many', () => {
  const twice = twiceOf(staleRows(answer([SPOOLS, KILNS])));
  assert.equal(twiceHeading(twice), '13 things are here twice');
  assert.equal(twiceHeading(twiceOf(staleRows(answer([KILNS])))), '1 thing is here twice');
  assert.equal(twiceHeading([]), null);
});

test('THE PART DRAWS THE TWINS UNDER THEIR OWN HEADING, apart from what went stale', () => {
  const part = readFileSync(new URL('./Stale.svelte', import.meta.url), 'utf8');
  assert.match(part, /twiceHeading\(/u);
  assert.match(part, /data-stale-twice/u);
});
