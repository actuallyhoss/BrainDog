/**
 * The ten extractors and three combinators, row by row from `43 §9.1`.
 *
 * ONE INVENTED MESSAGE CARRIES NEARLY ALL OF IT, on purpose: a real arrival is one string that every field
 * reads at once, and a form that works in isolation over a string written for it proves very little. `M1`
 * holds two amounts, a date, a reference number, a card number and a merchant, so every extractor has
 * something nearby to get wrong.
 *
 * No provider's real wording appears here (`43 §9`).
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, normalise, run, type Form, type Json, type RunCtx } from '../src/extractors.ts';
import type { CurrencyTable } from '../src/money.ts';

const TABLE: CurrencyTable = {
  EGP: { exponent: 2 },
  USD: { exponent: 2, symbol: '$' },
  CAD: { exponent: 2, symbol: '$' },
  EUR: { exponent: 2, symbol: '€' },
  JPY: { exponent: 0, symbol: '¥' },
  KWD: { exponent: 3 },
};

const M1 = 'Card 1234 debited EGP 1,250.00 at BEANS COFFEE on 29/08/26. Ref 88213. Balance EGP 3,020.15.';

const ACCOUNTS = [
  { id: 'e1', value: '1234' },
  { id: 'e2', value: '4471' },
];

const ctx = (rows: { id: string; value: string }[] = ACCOUNTS): RunCtx => ({
  currencies: TABLE,
  lookup: () => rows,
});

/** Run one form over one text and report what a field would get: the first value, or how it failed. */
function one(form: Form, text: string, rows?: { id: string; value: string }[]) {
  const got = run(form, text, fold(text), ctx(rows), 'extract.f');
  if (got === 'ambiguous') return { outcome: 'ambiguous' as const };
  if (got.values.length === 0) return { outcome: 'missing' as const };
  return { outcome: got.note, value: got.values[0] as Json };
}

type Row = [label: string, form: Form, text: string, want: ReturnType<typeof one>];

const rows: Row[] = [
  ['after', { after: 'Ref ' }, M1, { outcome: 'exact', value: '88213. Balance EGP 3,020.15.' }],
  ['before', { before: ' at' }, M1, { outcome: 'exact', value: 'Card 1234 debited EGP 1,250.00' }],
  ['between', { between: ['at ', ' on'] }, M1, { outcome: 'exact', value: 'BEANS COFFEE' }],
  ['between with no close', { between: ['at ', ' zz'] }, M1, { outcome: 'missing' }],
  ['text collapses', { text: { between: ['at ', ' on'] } }, 'paid at  BEANS\tCOFFEE  on 1/1', { outcome: 'exact', value: 'BEANS COFFEE' }],
  ['money anchored', { money: { after: 'debited' } }, M1, { outcome: 'exact', value: { amount: 125000, currency: 'EGP' } }],
  ['money unanchored skips the card number', { money: {} }, M1, { outcome: 'exact', value: { amount: 125000, currency: 'EGP' } }],
  ['money with a declared currency does not', { money: { currency: 'EGP' } }, M1, { outcome: 'exact', value: { amount: 123400, currency: 'EGP' } }],
  ['date', { date: { format: 'DD/MM/YY' } }, M1, { outcome: 'exact', value: '2026-08-29' }],
  ['int anchored', { int: { after: 'Ref ' } }, M1, { outcome: 'exact', value: 88213 }],
  ['int unanchored', { int: {} }, M1, { outcome: 'exact', value: 1234 }],
  ['decimal', { decimal: { after: 'Balance EGP ' } }, M1, { outcome: 'exact', value: 3020.15 }],
  ['enum', { enum: { map: { debited: 'debit', credited: 'credit' } } }, M1, { outcome: 'exact', value: 'debit' }],
  ['enum, two of equal length', { enum: { map: { sent: 'debit', recv: 'credit' } } }, 'sent 5 recv 5', { outcome: 'ambiguous' }],
  ['enum, not a whole token', { enum: { map: { in: 'credit' } } }, 'coin', { outcome: 'missing' }],
  ['lookup', { lookup: { register: 'accounts', by: 'last4' } }, M1, { outcome: 'exact', value: 'e1' }],
  ['lookup, two rows match', { lookup: { register: 'accounts', by: 'last4' } }, 'cards 1234 and 4471', { outcome: 'ambiguous' }],
  ['first, the first form wins', { first: [{ between: ['at ', ' on'] }, { between: ['to ', ' on'] }] }, M1, { outcome: 'exact', value: 'BEANS COFFEE' }],
  ['first, the second form wins', { first: [{ between: ['at ', ' on'] }, { between: ['to ', ' on'] }] }, 'paid to ACME on 1/1', { outcome: 'exact', value: 'ACME' }],
  ['first, both yielded', { first: [{ between: ['at ', ' on'] }, { between: ['to ', ' on'] }] }, 'at X on 1/1 and to Y on 2/2', { outcome: 'chosen', value: 'X' }],
  ['nth', { nth: { n: 2, of: { money: {} } } }, M1, { outcome: 'exact', value: { amount: 302015, currency: 'EGP' } }],
  ['nth past the end', { nth: { n: 3, of: { money: {} } } }, M1, { outcome: 'missing' }],
  ['default fills an absence', { default: { value: 'unknown', of: { between: ['at ', ' on'] } } }, 'no anchor here', { outcome: 'defaulted', value: 'unknown' }],
  ['default never covers ambiguity', { default: { value: 'x', of: { enum: { map: { sent: 'a', recv: 'b' } } } } }, 'sent recv', { outcome: 'ambiguous' }],
];

for (const [label, form, text, want] of rows)
  test(`form: ${label}`, () => {
    assert.deepEqual(one(form, text), want);
  });

test('AN UNKNOWN KEY IS REFUSED AT FIRST USE, naming the field and the thirteen forms', () => {
  /* `declare` lints this at install, so reaching it here means a declaration arrived another way — an
     imported pack, a hand-edited record. Defence in depth, and the refusal still has to be readable
     (`43 §5.3`). */
  assert.throws(
    () => run({ regex: 'a+' } as unknown as Form, M1, fold(M1), ctx(), 'extract.f'),
    (err: unknown) => {
      const e = err as { code?: string; at?: string; fix?: string };
      assert.equal(e.code, 'EXTRACTOR_UNKNOWN');
      assert.equal(e.at, 'extract.f');
      assert.ok(e.fix?.includes('money'), 'the refusal lists the forms that do exist');
      return true;
    },
  );
});

test('A ZERO-WIDTH CHARACTER CANNOT HIDE A WORD FROM AN ANCHOR', () => {
  /* Invisible on screen and visible to indexOf: without the strip, a provider writing `deb<zwsp>ited`
     walks past the anchor, the enum literal and `match:` alike, and the arrival lands in review with no
     explanation a person can see by reading it. */
  assert.equal(normalise('a\r\nb  c​d'), 'a\nb cd');
  const sneaky = normalise('Card 1234 deb​ited EGP 1,250.00 at X on 1/1');
  assert.deepEqual(one({ enum: { map: { debited: 'debit' } } }, sneaky), { outcome: 'exact', value: 'debit' });
});

test('A DIRECTION MARK GOES WHERE IT TOUCHES AN AMOUNT AND STAYS INSIDE A WORD', () => {
  const RLM = '‏';
  const LRM = '‎';
  const ALM = '؜';
  /* Between a number and its code (he-IL), between a minus and its digits (ar-EG), between a sign and a code (fa-IR):
     all three go, so the anchor and the money reader see what a person saw. */
  assert.equal(normalise(`Paid 12.50 ${RLM}EGP`), 'Paid 12.50 EGP');
  assert.equal(normalise(`${ALM}-${RLM}١٢ EGP`), '-١٢ EGP');
  assert.equal(normalise(`${LRM}−${LRM}EGP 5`), '−EGP 5');
  assert.equal(normalise(`total ${RLM}€5`), 'total €5');
  /* Inside a word they set the order a right-to-left name is shown in, and a text field is shown to a person. */
  assert.equal(normalise(`תל${RLM}-אביב`), `תל${RLM}-אביב`);
  assert.equal(normalise(`at שלום${RLM} cafe`), `at שלום${RLM} cafe`);
  /* And the anchor after a code finds its number. */
  assert.deepEqual(one({ decimal: { after: 'EGP ' } }, normalise(`EGP ${RLM}3,020.15`)), { outcome: 'exact', value: 3020.15 });
  assert.deepEqual(one({ money: {} }, normalise(`-1,234.50 ${RLM}EGP`)), { outcome: 'exact', value: { amount: -123450, currency: 'EGP' } });
});

test('matching folds case and slicing does not', () => {
  /* The anchor is found whatever case the provider used, and the value comes back as it was written,
     because a merchant name is a merchant name and not a lowercase one. */
  assert.deepEqual(one({ between: ['AT ', ' ON'] }, 'paid at BEANS Coffee on 1/1'), {
    outcome: 'exact',
    value: 'BEANS Coffee',
  });
});

test('three levels of nesting are allowed and a fourth is not', () => {
  /* `43 §4.3` caps nesting at three, counting the outermost form as one. The first version of the
     cap refused the third, which is a limit the specification does not have: an author following
     the document would have written a declaration that installs and throws. The ceiling itself is
     `declare`'s to lint; this is defence in depth, so it has to be the same ceiling. */
  const three: Form = { first: [{ nth: { n: 1, of: { money: {} } } }, { money: { currency: 'EGP' } }] };
  /* `chosen` and not `exact`: both branches yield over M1, which is the combinator reporting that
     the list decided rather than the message. */
  assert.deepEqual(one(three, M1), { outcome: 'chosen', value: { amount: 125000, currency: 'EGP' } });

  const four: Form = { first: [{ nth: { n: 1, of: { first: [{ money: {} }, { int: {} }] } } }, { int: {} }] };
  assert.throws(
    () => run(four, M1, fold(M1), ctx(), 'extract.f'),
    (err: unknown) => (err as { code?: string }).code === 'EXTRACTOR_UNKNOWN',
  );
});

test('THE ANCHOR ADVANCES PAST THE WHOLE LITERAL, NOT PAST ONE CHARACTER (`43 §5.3` step 1)', () => {
  /* Verbatim: "Each occurrence of the anchor literal (`indexOf` over `folded`, advancing past every
     hit) yields one slice." Advancing past a two-character hit means the next scan starts two
     characters later, not one. `aaaa` holds `aa` at index 0 and index 2 only — those are the
     occurrences, and a `+length` walk finds exactly them: `['aa', '']`. A `+1` walk also catches the
     OVERLAPPING match at index 1, which is not a second occurrence of a whole hit that was already
     consumed, and yields a spurious third candidate: `['aa', 'a', '']`. */
  const text = 'aaaa';
  const got = run({ after: 'aa' }, text, fold(text), ctx(), 'extract.f');
  if (got === 'ambiguous') throw new Error('unexpected ambiguous');
  assert.deepEqual(got.values, ['aa', '']);
});

test('AN EMPTY LITERAL IS NOT AN ANCHOR, AND WALKING ONE CANNOT HANG THE PROCESS (`43 §4.3`)', () => {
  /* `43 §4.3`: an anchor literal is at least one character, and `declare` refuses a shorter one at
     install — this is the defence-in-depth check for a form that reaches here another way. Treated
     as no anchor at all, the same as the kernel's own `slices()` treats it (`ingest.ts`).
     `indexOf('')` hits at every index, so an unguarded `+length` walk over an empty literal advances
     by zero and never ends — a real infinite loop, not a slow scan — so this runs the case in a
     child process the parent can kill on a timeout rather than an await nothing could resolve. */
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./empty-anchor-child.ts', import.meta.url))],
    { encoding: 'utf8', timeout: 5_000 },
  );
  assert.equal(child.signal, null, `the child was killed (${child.signal}): the empty-literal walk hung`);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { values: ['hello world'], note: 'exact' });
});

test('A NOTE IS DATA, NOT PART OF THE FORM, AND IS IGNORED AT EVERY DEPTH (`42 §4`)', () => {
  /* `42-SPEC-DECLARE.md` line 205, verbatim: "a note is data, not a YAML comment. Legal on every
     declaration, field, block, section and action below." `declare.ts` filters `note` out of an
     extractor's keys in three places so `{ note: '...', money: { after: 'EGP' } }` installs clean —
     which makes a form `run` refuses at read time, over `EXTRACTOR_UNKNOWN`'s "one object with
     exactly one key", the worst of the three states: accepted at install, fatal on arrival. A key
     whose only job is to be ignored has to be ignored everywhere this file reads a form, not just
     where `declare` counts keys. Tried both ways round, because the kernel's matching bug was a note
     BEFORE the extractor key silently becoming the spec — a different failure, but the same reason
     to check both orders here. */
  const noted: Form = { note: 'the SMS one', money: { after: 'debited' } } as unknown as Form;
  assert.deepEqual(one(noted, M1), { outcome: 'exact', value: { amount: 125000, currency: 'EGP' } });

  const notedAfter: Form = { money: { after: 'debited' }, note: 'the SMS one' } as unknown as Form;
  assert.deepEqual(one(notedAfter, M1), { outcome: 'exact', value: { amount: 125000, currency: 'EGP' } });

  const notedNested: Form = {
    first: [{ note: 'x', between: ['zz ', ' zz'] } as unknown as Form, { between: ['at ', ' on'] }],
  };
  assert.deepEqual(one(notedNested, M1), { outcome: 'exact', value: 'BEANS COFFEE' });
});
