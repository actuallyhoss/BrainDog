/**
 * Two ids minted in one millisecond say nothing about how many were minted between them.
 *
 * THE TAIL WAS A COUNTER. Measured: a member invited to one list reading two of her lines minted in one millisecond:
 * the tails differed by 2, 4, 8 and 22 for 0, 1, 3 and 10 hidden diary writes between them, because the minter added
 * one to the tail inside a millisecond and every `create` mints twice. `(diff - 2) / 2` was the exact count of what she
 * was not shown. The fixed clock every test here runs on is the worst case, and a rule cascade, an import or an
 * accepted rowset reaches it under a real clock too.
 *
 * AND THE ORDER STAYS. `list` pages on `(updated_at, id)` and K10 is the promise that two rows written in one
 * transaction sort the way they were written, so the step is random but never zero.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ulids } from '../src/ids.ts';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The 80-bit tail, the sixteen characters after the timestamp, as a number. */
const tail = (id: string): bigint => {
  let n = 0n;
  for (const c of id.slice(10)) n = n * 32n + BigInt(ALPHABET.indexOf(c));
  return n;
};

/** The tail difference between two ids with `n` minted between them, all in one millisecond. */
const gap = (n: number): bigint => {
  const mint = ulids(() => 1_758_000_000_000);
  const a = mint();
  for (let i = 0; i < n; i++) mint();
  return tail(mint()) - tail(a);
};

test('the tail difference across n hidden mints is not a function of n', () => {
  const TRIALS = 200;
  const none = Array.from({ length: TRIALS }, () => gap(0));
  const three = Array.from({ length: TRIALS }, () => gap(3));

  /* ONE n, MANY ANSWERS. The counter answered 1 for n = 0 every time, which is what made it a count. */
  assert.ok(new Set(none).size > TRIALS / 2, `n = 0 gave ${new Set(none).size} distinct differences in ${TRIALS}`);
  assert.ok(new Set(three).size > TRIALS / 2, `n = 3 gave ${new Set(three).size} distinct differences in ${TRIALS}`);

  /* AND THE ANSWERS OVERLAP. Some pair with nothing between them is further apart than some pair with three, so no
     difference names the n it came from. */
  const maxNone = none.reduce((m, d) => (d > m ? d : m));
  const minThree = three.reduce((m, d) => (d < m ? d : m));
  assert.ok(maxNone > minThree, `every n = 0 difference (max ${maxNone}) sat below every n = 3 one (min ${minThree})`);
});

test('ids stay strictly increasing inside one millisecond and across the next', () => {
  let ms = 1_758_000_000_000;
  const mint = ulids(() => ms);
  let last = '';
  for (let i = 0; i < 50_000; i++) {
    if (i === 25_000) ms += 1;
    const id = mint();
    assert.equal(id.length, 26);
    assert.ok(id > last, `mint ${i} gave ${id}, not after ${last}`);
    last = id;
  }
});
