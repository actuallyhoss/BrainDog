/**
 * The picker's currency list, against the list the record actually accepts.
 *
 * ONE MEMBERSHIP LIST OR THE PICKER OFFERS WHAT THE WRITE REFUSES. `02 §3` rule 1 names
 * `Intl.supportedValuesOf('currency')` as the single answer to whether three letters are a currency, and `coerce.ts`
 * refuses `money` against it with `CURRENCY_UNKNOWN`. A second list typed out by hand drifts: before this file existed
 * the picker held 155 codes and the runtime held 162, and `XCG`, the Caribbean guilder that became the tender of
 * Curaçao and Sint Maarten in 2025, was in the runtime's list and not in the picker's. A person whose books are in it
 * could not choose it, and the record would have taken it.
 *
 * SO THE ASSERTIONS HERE ARE RELATIVE, NOT TYPED OUT, for the same reason. A test that lists the codes it expects is
 * the thing that drifted; every check below is written against `Intl` and holds on a runtime whose tender list has
 * moved on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMMON_CURRENCIES, OFFERED_CURRENCIES, OTHER_CURRENCIES, currencyChoices, currencyLabel, currencyOptions } from './currencies.ts';

const TENDER: readonly string[] = Intl.supportedValuesOf('currency');

test('EVERY CODE THE PICKER OFFERS IS ONE THE RECORD WOULD ACCEPT, so nothing on the list is refused at the write', () => {
  const known = new Set(TENDER);
  for (const c of OFFERED_CURRENCIES)
    assert.ok(known.has(c), `${c} is offered by the picker and is not a currency the runtime lists, so a money value in it is refused CURRENCY_UNKNOWN`);
  /* The common ones are typed out, so they are the one part of the list that can rot without the runtime saying so. */
  for (const c of COMMON_CURRENCIES) assert.ok(known.has(c), `${c} is offered first and is no longer a currency the runtime lists`);
});

test('THE PICKER DROPS ONLY CODES THE RUNTIME STILL LISTS, and every code it does not drop is offered', () => {
  /* PINNED BY DIFFERENCE AND NOT BY LENGTH, which is what makes this catch the next `XCG` rather than the last one:
     a currency the runtime adds shows up here as a name this list does not have, and the failure says which. The six
     are argued for one by one in `NOT_OFFERED`, and a code the runtime retires drops out of both sides at once, which
     leaves a dead entry rather than a wrong one. */
  const dropped = TENDER.filter((c) => !OFFERED_CURRENCIES.includes(c));
  assert.deepEqual(
    dropped,
    ['CUC', 'HRK', 'SLL', 'XDR', 'XSU', 'ZWL'],
    'the codes the picker withholds from the runtime’s tender list are no longer the six NOT_OFFERED argues for',
  );
});

test('THE COMMON CURRENCIES COME FIRST, then every other offered code once, in code order', () => {
  /* IN THE RUNTIME'S ORDER AND NOT ONE PERSON'S. This pinned `EGP, USD, GBP, EUR` first until the order became the
     record's to set (`currencyChoices`, `shell-defaults.test.ts`). The common ones are now filtered out of the runtime's
     list, so a common code the runtime stops listing would drop out of the group without a word; eleven holds it. */
  assert.deepEqual([...COMMON_CURRENCIES].sort(), [...COMMON_CURRENCIES]);
  assert.equal(COMMON_CURRENCIES.length, 11);
  assert.equal(new Set(OFFERED_CURRENCIES).size, OFFERED_CURRENCIES.length);
  assert.deepEqual([...OFFERED_CURRENCIES].sort(), [...OFFERED_CURRENCIES]);
  assert.equal(COMMON_CURRENCIES.length + OTHER_CURRENCIES.length, OFFERED_CURRENCIES.length);
});

test('EGP IS NOT ONE OF THE COMMON ONES, and a record whose home currency it is still leads with it', () => {
  /* THE ELEVEN ARE THE CURRENCIES MOST PEOPLE HOLD, AND EGP WAS IN THEM BECAUSE ONE PERSON HOLDS IT. It was the
     twelfth, the last trace of the list that led with it, and `shell-words` exempted this file by name for it.
     Taken out, a person at EGP loses nothing: `currencyChoices` puts a held code the picker offers at the
     head of the common group whatever group it came from, so their own money is still the first option, once. */
  assert.equal(COMMON_CURRENCIES.includes('EGP'), false, 'EGP is offered among the common currencies');
  assert.equal(OTHER_CURRENCIES.includes('EGP'), true, 'EGP is not offered at all');
  const { common, other } = currencyChoices('EGP');
  assert.equal(common[0], 'EGP', `a record at EGP was offered ${common[0]} first`);
  assert.equal(other.includes('EGP'), false, 'EGP is offered in both groups, two options with one value');
  assert.deepEqual(common.slice(1), COMMON_CURRENCIES, 'leading with EGP moved or dropped a common code');
});

test('A CODE THE PICKER DOES NOT OFFER IS STILL DRAWN WHEN THE SETTING HOLDS IT, and it is drawn first', () => {
  /* Both kinds: a code the runtime never listed, and one it lists that the picker withholds on purpose. The second is
     the case asking `Intl` here would have broken, and it breaks silently, as a blank on a settings screen. */
  assert.equal(currencyChoices('xau').other[0], 'XAU');
  assert.equal(currencyChoices('hrk').other[0], 'HRK');
  assert.equal(currencyChoices('gbp').other, OTHER_CURRENCIES);
  assert.equal(currencyChoices('').other, OTHER_CURRENCIES);
  assert.equal(currencyChoices('not a code').other, OTHER_CURRENCIES);
});

test('a currency is named as a person says it, with its symbol where it has one (audit 2 B3)', () => {
  assert.equal(currencyLabel('GBP'), 'British pound, £');
  assert.equal(currencyLabel('eur'), 'Euro, €');
  assert.equal(currencyLabel('AED'), 'UAE dirham');
  assert.equal(currencyLabel('QQQ'), 'QQQ');
});

test('the picker leads with the held currency and names the rest in name order', () => {
  const { common, other } = currencyOptions('GBP');
  assert.equal(common[0]?.code, 'GBP');
  const rest = common.slice(1).map((o) => o.label);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, 'en-GB')));
  assert.equal(other.length, OTHER_CURRENCIES.length);
  assert.ok(other.every((o) => o.label !== ''));
});
