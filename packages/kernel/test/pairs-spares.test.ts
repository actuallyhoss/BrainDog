/**
 * Which legs of a set are left over when the counts differ, held to every matching counted by hand.
 *
 * `sparesOf` in `src/pairs.ts` decides which leg of a split move and its neighbours stays counted, so it decides a
 * figure. The first attempt counted only the matchings taken first with first, and the account rule forbids some of
 * those: outs from x and y and ins into x, y and z on one day have three matchings of no days, each leaving a different
 * in over, and it found one and paired four rows. Here every injective matching of a few hundred small sets is listed,
 * the ones of least cost are kept, and the answer is the legs they leave over when they all leave the same ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sparesOf } from '../src/pairs.ts';

const DAY = 86_400_000;

/** Every matching of each `few` leg to its own `many` leg that `can` allows, by brute force. */
function byHand(few: readonly number[], many: readonly number[], can: (i: number, j: number) => boolean): Set<number> | null {
  let least = Infinity;
  const over = new Set<string>();
  const walk = (i: number, used: number[], cost: number): void => {
    if (i === few.length) {
      const left = JSON.stringify([...many.keys()].filter((j) => !used.includes(j)));
      if (cost < least) {
        least = cost;
        over.clear();
      }
      if (cost === least) over.add(left);
      return;
    }
    for (let j = 0; j < many.length; j++)
      if (!used.includes(j) && can(i, j)) walk(i + 1, [...used, j], cost + Math.abs(few[i]! - many[j]!) / DAY);
  };
  walk(0, [], 0);
  return over.size === 1 ? new Set(JSON.parse([...over][0]!) as number[]) : null;
}

const show = (s: Set<number> | null) => (s === null ? null : [...s].sort());

test('E BY HAND: outs from x and y against ins into x, y and z on one day leave any of the three over, so none is chosen', () => {
  const outs = ['x', 'y'];
  const ins = ['x', 'y', 'z'];
  assert.equal(
    sparesOf([0, 0], [0, 0, 0], (i, j) => outs[i] !== ins[j]),
    null,
  );
  /* Z two days later is over in the one matching of least cost. */
  assert.deepEqual(show(sparesOf([0, 0], [0, 0, 2 * DAY], (i, j) => outs[i] !== ins[j])), [2]);
});

test('EQUAL COUNTS LEAVE NOTHING OVER, whichever of their matchings is taken, since each hides the same money', () => {
  assert.deepEqual(show(sparesOf([0, 0], [0, 0], () => true)), []);
});

test('EVERY SMALL SET: the legs left over are the ones every matching of least cost leaves, or none is chosen', () => {
  /* A fixed stream, so a failure names the same case every run. */
  let seed = 63;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  let chosen = 0;
  let refused = 0;
  for (let run = 0; run < 600; run++) {
    const n = 1 + Math.floor(next() * 4);
    const m = n + Math.floor(next() * 3);
    const few = Array.from({ length: n }, () => Math.floor(next() * 5) * DAY);
    const many = Array.from({ length: m }, () => Math.floor(next() * 5) * DAY);
    const allowed = Array.from({ length: n }, () => Array.from({ length: m }, () => next() < 0.7));
    const can = (i: number, j: number) => allowed[i]![j]!;
    const want = n === m ? new Set<number>() : byHand(few, many, can);
    const got = sparesOf(few, many, can);
    assert.deepEqual(show(got), show(want), JSON.stringify({ few: few.map((x) => x / DAY), many: many.map((x) => x / DAY), allowed }));
    if (got === null) refused++;
    else chosen++;
  }
  /* BOTH ANSWERS ARE EXERCISED, or a function that always refused would pass. */
  assert.ok(chosen > 100 && refused > 100, `${chosen} chosen, ${refused} refused`);
});
