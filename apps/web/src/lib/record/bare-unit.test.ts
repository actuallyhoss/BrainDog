/**
 * One mark for "and some of these carried no unit at all", in every module that spells it.
 *
 * IT WAS SPELLED IN THREE MODULES AND IS NOW SPELLED IN TWO. `metrics.ts` declared its own
 * `BARE = 'no unit'` beside `money.ts`'s and the kernel's, which is the arrangement that let the
 * sample print *"these rows are in GBP and no currency"* about the same two rows a live record
 * described as *"GBP and no unit"*. `metrics.ts` re-exports `money.ts`'s now, so the web has one
 * literal and the drift it used to be able to have is gone rather than guarded.
 *
 * THE KERNEL'S IS NOT IMPORTABLE, which is the one line this file exists to make good. `BARE_UNIT` is
 * module-private in `packages/kernel/src/metrics.ts` and `packages/kernel/src/index.ts` re-exports no
 * such name, so an import cannot close the last gap and something has to hold it instead.
 *
 * AND THE OBJECTION `money.test.ts` RAISES TO READING THE KERNEL'S SOURCE DOES NOT REACH THIS FILE.
 * Its note says a regex over the kernel *"could see the mark and not the clause around it, so the two
 * copies diverged on the clause one commit later with the assertions still green"*, and it is right:
 * the CLAUSE is held by driving a running record, which is what `money.test.ts` does and this does not
 * repeat. What is asserted here is the declaration of the MARK, a whole line with nothing around it to
 * miss, and the assertion fails if that line moves or is renamed rather than passing quietly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BARE as METRICS_BARE } from './metrics.ts';
import { BARE as MONEY_BARE } from './money.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

test('THE MARK IS ONE STRING IN THE WEB, because one of the two copies became a re-export', () => {
  assert.equal(METRICS_BARE, MONEY_BARE);
  /* AND THIS MODULE NO LONGER DECLARES ITS OWN, which is the half an equality cannot see: two modules
     declaring one string are equal right up until the day somebody edits one of them. */
  const mine = readFileSync(join(REPO, 'apps', 'web', 'src', 'lib', 'record', 'metrics.ts'), 'utf8');
  assert.equal(mine.includes("BARE = 'no unit'"), false, 'metrics.ts declares the mark again instead of re-exporting it');
  assert.match(mine, /^export \{ BARE \};$/mu, 'metrics.ts no longer passes on the one literal');
});

test('AND IT IS THE KERNEL’S WORD, which is the copy a paying customer reads', () => {
  const kernel = readFileSync(join(REPO, 'packages', 'kernel', 'src', 'metrics.ts'), 'utf8');
  const declared = [...kernel.matchAll(/^const BARE_UNIT = '([^']*)';$/gmu)].map((m) => m[1]);
  assert.deepEqual(declared, [MONEY_BARE], 'the kernel spells the mixed-unit mark differently, or no longer declares it here');

  /* THE MARK IS A UNIT AND NOT A CURRENCY, and the whole reason all three say `no unit` is that the
     set it joins is units: `GBP and no unit` is a list of two units, `GBP and no currency` is a list
     with a hole in it. A mark that passed `isCurrencyCode` would also be printable as a currency. */
  assert.equal(/^[A-Z]{3}$/u.test(MONEY_BARE), false, 'the mark reads as a currency code, so a sentence could print it as one');
});
