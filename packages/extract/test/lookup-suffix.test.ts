/**
 * `lookup`'s one rule that `enum` does not share: DIGITS PRINTED BEHIND STARS ARE THE TAIL OF A LONGER VALUE.
 *
 * WHY THIS FILE EXISTS. `loop/research-bank-real.md`, *The three that did not read*, item 3: his bank prints one
 * EGP account two ways, as stars and four digits in the InstaPay messages and as a branch code, three stars and the
 * last three of those four in the `From HSBC:` lines. `lookup` answered only the row whose value is a WHOLE TOKEN
 * in the slice, so whichever `last4` he typed, one family of his messages went to review with the account unread.
 *
 * THE STARS ARE THE BANK SAYING THE DIGITS ARE A TAIL, and nothing else is. A bare `518` is not a suffix of
 * anything here, because a slice that ran past its anchor holds figures (`EGP 900.00`), and `00` ends a great many
 * account numbers. And more than one row ending in the printed digits is a person's question, never the first row
 * found: the declaration cannot know which of two accounts the bank meant.
 *
 * EVERY VALUE BELOW IS INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, matchLiterals, run, type Form, type Json } from '../src/extractors.ts';

const SAVINGS = { id: 'a_savings', value: '6518' };
const CURRENT = { id: 'a_current', value: '327' };
const DEPOSIT = { id: 'a_deposit', value: '7518' };

const table = (...rows: { id: string; value: string }[]): [string, Json][] => rows.map((r) => [r.value, r.id]);

/** One lookup form run through the package's own evaluator, the path `extract()` and `testAgainst` take. */
function read(form: Form, text: string, rows: { id: string; value: string }[]) {
  return run(form, text, fold(text), { currencies: { EGP: { exponent: 2 } }, lookup: () => rows }, 'extract.account');
}

test('STARS AND THREE DIGITS ARE THE ONE ROW WHOSE LONGER VALUE ENDS IN THEM', () => {
  assert.deepEqual(matchLiterals('042-118***518', table(SAVINGS, CURRENT), 'lookup'), ['a_savings']);
  /* The `From HSBC:` shape, where a hyphen stands between the stars and the digits. */
  assert.deepEqual(matchLiterals('042-118***-518', table(SAVINGS, CURRENT), 'lookup'), ['a_savings']);
});

test('TWO ROWS ENDING IN THE PRINTED DIGITS IS AMBIGUOUS, and not whichever row came first', () => {
  assert.equal(matchLiterals('***-518', table(SAVINGS, DEPOSIT), 'lookup'), 'ambiguous');
  assert.equal(matchLiterals('***-518', table(DEPOSIT, SAVINGS), 'lookup'), 'ambiguous');
});

test('A WHOLE TOKEN STILL WINS, so the suffix rule is only ever asked when nothing matched outright', () => {
  /* `327` is a whole token after the stars, and `6518` is not asked about at all. */
  assert.deepEqual(matchLiterals('********327', table(SAVINGS, CURRENT, { id: 'a_long', value: '9327' }), 'lookup'), ['a_current']);
  assert.deepEqual(matchLiterals('********6518', table(SAVINGS, DEPOSIT), 'lookup'), ['a_savings']);
});

test('DIGITS WITH NO STARS ARE NOT A TAIL, so a figure in the slice never names an account', () => {
  assert.deepEqual(matchLiterals('518', table(SAVINGS), 'lookup'), []);
  assert.deepEqual(matchLiterals('EGP 900.00 at 518 Nile St', table({ id: 'a_hundreds', value: '1900' }, SAVINGS), 'lookup'), []);
  /* Stars followed by a letter are a masked word, not a masked number. */
  assert.deepEqual(matchLiterals('***x518', table(SAVINGS), 'lookup'), []);
  /* And digits running on into letters are not a tail either. */
  assert.deepEqual(matchLiterals('***518B', table(SAVINGS), 'lookup'), []);
});

test('`enum` NEVER PICKS UP THE SUFFIX RULE, with the form named or left out', () => {
  assert.deepEqual(matchLiterals('***518', table(SAVINGS), 'enum'), []);
  assert.deepEqual(matchLiterals('***518', table(SAVINGS)), []);
});

test('THE PACKAGE\'S OWN `lookup` READS A MASK ITS ANCHOR SWALLOWED, because the anchor is where the stars were', () => {
  const line = 'From HSBC: 03AUG26 ATM Cash Withdrawal from 042-118***-518 EGP 900.00- Your available balance is EGP 4,100.00';
  const form: Form = { lookup: { register: 'accounts', by: 'last4', between: ['***-', ' '] } };
  assert.deepEqual(read(form, line, [SAVINGS, CURRENT]), { values: ['a_savings'], note: 'exact' });
  assert.equal(read(form, line, [SAVINGS, DEPOSIT]), 'ambiguous');
  /* An anchor with no stars behind it hands over bare digits, which stay unread. */
  const bare: Form = { lookup: { register: 'accounts', by: 'last4', between: ['account ', ' '] } };
  assert.deepEqual(read(bare, 'your account 518 was debited', [SAVINGS]), { values: [], note: 'exact' });
});

/* `loop/research-batch-twenty-one-audit.md` findings 1 and 2. The card patterns read `after: 'ending '` with no end, so
   the slice is the rest of the message, and a star in a merchant descriptor, a footer or a reference named an account.
   Measured red before the repair: P1 to P3 answered `studio`, `company` and `tax` at `exact`, and the two short tails
   answered the one row ending in them. */
const STUDIO = { id: 'a_studio', value: '2044' };
const COMPANY = { id: 'a_company', value: '4471' };
const TAX = { id: 'a_tax', value: '7730' };

test('A STAR PAST THE SLICE\'S FIRST TOKEN IS PROSE, and an unregistered card names no account through it', () => {
  const card: Form = { lookup: { register: 'accounts', by: 'last4', after: 'ending ' } };
  const rows = [STUDIO, COMPANY, TAX];
  for (const line of [
    'Your card ending 9012 was debited EGP 120.00 at SUMUP *44 KIOSK on 18/09/26.',
    'Your card ending 9012 was debited EGP 120.00 at FENWICK on 18/09/26. *** 1 of 2 ***',
    'Your card ending 9012 was debited EGP 120.00 at FENWICK on 18/09/26. Ref ***-30',
  ])
    assert.deepEqual(read(card, line, rows), { values: [], note: 'exact' }, line);
});

test('A TAIL OF FEWER THAN THREE DIGITS IS NOT A TAIL', () => {
  assert.deepEqual(matchLiterals('***-8', table(SAVINGS), 'lookup'), []);
  assert.deepEqual(matchLiterals('***27', table(CURRENT), 'lookup'), []);
  assert.deepEqual(matchLiterals('***327', table({ id: 'a_long', value: '10327' }), 'lookup'), ['a_long']);
});
