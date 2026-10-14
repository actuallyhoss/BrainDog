/**
 * `two-spellings`: one currency written two ways in one part of a page, or one amount with and without its minor
 * digits there, is a finding; every amount written the one writer's way is clean (EXP-B06).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LINT_RULES, lintHtml, lintPage, lintText, writeAmount } from './index.ts';

const SAID = 'Money is written two ways here. Write every amount the same way.';
const found = (fs: { rule: string }[]): boolean => fs.some((f) => f.rule === 'two-spellings');

test('the rule is on the list, with a sentence and no em dash', () => {
  const rule = LINT_RULES.find((r) => r.rule === 'two-spellings');
  assert.ok(rule);
  assert.match(rule.says, /^[A-Z].*\.$/u);
  assert.doesNotMatch(rule.says, /—/u);
});

test('a sign and a code for one currency in one part: found, once, in its own sentence', () => {
  const fs = lintText('Rent £12 is due.\nThe deposit was GBP 4.', { name: 'Bills' });
  const f = fs.find((x) => x.rule === 'two-spellings');
  assert.deepEqual(f, { rule: 'two-spellings', part: 'Bills', said: SAID });
  /* The pound of a currency written by its code, as a drawer once drew it beside the writer's figure. */
  assert.ok(found(lintText('Cash E£1,086,213. In the bank EGP 1,238,407.62.')));
  /* The sign with its code after, beside the sign alone, and beside the code in front. */
  assert.ok(found(lintText('Paid £12 and £4 GBP.')));
  assert.ok(found(lintText('Owed GBP 4 and £9 GBP.')));
  assert.ok(found(lintText('Paid $12 and USD 40.')));
});

test('one amount with and without its minor digits beside each other: found', () => {
  assert.ok(found(lintText('Fern Lane rent £12. Due again: £12.00.')));
  assert.ok(found(lintText('EGP 1,200 then EGP 1,200.00')));
});

test('a drawn code in its own quiet span is read with its figure', () => {
  const html = '<p>Cash <span class="amount"><span class="amount-code">EGP</span> 1,200</span> and E£300 more.</p>';
  assert.ok(found(lintHtml(html)));
});

test('one spelling a currency is clean, in the writer\'s own words', () => {
  const home = 'GBP';
  const w = (minor: number, currency: string, setting: 'exact' | 'read' = 'read'): string => writeAmount({ minor, currency }, home, setting)!.text;
  const text = [
    `Rent ${w(120000, 'GBP')} is due, and ${w(1250, 'GBP')} for the meter.`,
    `Abroad: ${w(480000, 'USD')} and ${w(70000, 'CAD')}, and ${w(5818554, 'EGP')} besides.`,
    `Owed ${w(-49726, 'EGP')} and ${w(1234, 'KWD')}.`,
  ].join('\n');
  assert.equal(found(lintText(text)), false, text);
  /* A bare dollar is the US dollar's; the Canadian one carries its code. Two currencies, each one way. */
  assert.equal(found(lintText('Paid $12 here and $4 CAD there.')), false);
  /* A rounded headline beside its exact figure is two amounts, each written one way. */
  assert.equal(found(lintText('£1,086,213 in all, £1,086,213.41 to the penny.')), false);
  /* Two different amounts, one with pence that are not round: nothing written twice. */
  assert.equal(found(lintText('£12 and £12.50')), false);
  /* Three capitals that are not money, and a ledger written exact throughout. */
  assert.equal(found(lintText('THE 100 steps, USB 3 ports, £4 each.')), false);
  assert.equal(found(lintText(`${w(1200, 'GBP', 'exact')}\n${w(400, 'GBP', 'exact')}`)), false);
});

test('each part is read on its own, and a note of his own only in its figures', () => {
  const page = lintPage({ name: 'Money', parts: [{ name: 'Rent', text: 'Rent £12.' }, { name: 'Deposit', text: 'Deposit GBP 4.' }] });
  assert.equal(found(page), false, 'one way in each part');
  assert.equal(found(lintText('I paid £12, the bank says GBP 12.', { name: 'A note', theirs: true })), false);
  const figures = '<p><span class="num">£12</span> and <span class="num">GBP 4</span></p>';
  assert.ok(found(lintHtml(figures, { name: 'A note', theirs: true })));
});

test('a whole screen is read for one currency two ways, not for the writer\'s two settings', () => {
  /* A note says the amount short and the progress row beside it keeps its cents: two parts, each the writer's way. */
  const screen = 'Eating out is $16 over its budget.\nEating out\n$96.00\n$80.00\n$16.00 over';
  assert.ok(found(lintText(screen)), 'one part: found');
  assert.equal(found(lintText(screen, { name: 'Budgets', screen: true })), false);
  /* One currency by its sign and by its code is still a finding anywhere on a screen. */
  assert.ok(found(lintText('Kiln\nEarning GBP 18,400.00 in the last twelve months.\n£4,050', { name: 'Kiln', screen: true })));
});
