/**
 * Money is a folder, and `money.ts` is one line that exports it.
 *
 * THE CUT WAS A PURE MOVE, AND THIS IS WHAT KEEPS IT ONE. `money.ts` was 2,858 lines that every unit after it had to
 * edit at once. A part that grows back into it, or a part file that grows past what one person reads in a sitting, is
 * the same file again under another name, so both are refused here. That the move changed no byte of the document is
 * the pinned fingerprint's job (`money-core@3.14.0` in `pack-versions.test.ts`), not this file's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as money from '../src/modules/money.ts';

const MODULES = fileURLToPath(new URL('../src/modules/', import.meta.url));
const FOLDER = join(MODULES, 'money');

/** The longest a part may be. The biggest today is the sample, at about 430. */
const MOST_LINES = 600;

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));

test('MONEY.TS HOLDS ONLY THE LINE THAT EXPORTS THE FOLDER, so nothing grows back into it', () => {
  const lines = readFileSync(join(MODULES, 'money.ts'), 'utf8').split('\n').filter((l) => l.trim() !== '');
  assert.deepEqual(lines, ["export * from './money/index.ts';"]);
});

test('EVERY PART OF MONEY IS UNDER 600 LINES, so no part becomes the old file again', () => {
  const files = filesUnder(FOLDER);
  for (const part of ['index.ts', 'sample.ts', 'settings.ts', 'legs.ts', 'rules.ts', 'lists/index.ts', 'figures/index.ts', 'pages/index.ts', 'pages/money.ts', 'pages/book.ts']) {
    assert.ok(files.includes(join(FOLDER, part)), `money/${part} is missing`);
  }
  const long = files.map((f) => [relative(FOLDER, f), readFileSync(f, 'utf8').split('\n').length] as const).filter(([, n]) => n >= MOST_LINES);
  assert.deepEqual(long, [], `parts of ${MOST_LINES} lines or more: ${long.map(([f, n]) => `${f} (${n})`).join(', ')}`);
});

test('THE ONE LINE STILL EXPORTS EVERY NAME MONEY EXPORTED BEFORE THE CUT, so no importer had to change', () => {
  assert.deepEqual(Object.keys(money).sort(), [
    /* FILING_RULES BESIDE THE REST SINCE 3c699b60d, the sample's rules; every name before the cut is still here. */
    'ACCOUNTS', 'AVAILABLE', 'CATEGORIES', 'DUE_THIS_WEEK', 'FILING_RULES', 'INSTALLMENTS', 'MONEY_AUTOMATIONS', 'MONEY_HOME_SETTING',
    'MONEY_METRICS', 'MONEY_PAGES', 'MONEY_REGISTERS', 'MONEY_RULES', 'MONEY_TARGET_SETTINGS', 'OBLIGATIONS', 'RECURRING_ITEMS',
    'SNAPSHOTS', 'TARGET_NOTE', 'TRANSACTIONS', 'cashPoints', 'cashSeries', 'nightOf', 'snapshotRows', 'targetConfigOf',
    'withTargetSetting',
  ]);
});

test('AN ACCOUNT ASKS FOR THE DIGITS THE BANK PRINTS, under the id every bank pattern reads', () => {
  const last4 = money.MONEY_REGISTERS.accounts?.fields.find((f) => f.id === 'last4');
  assert.equal(last4?.label, 'Digits the bank prints');
});
