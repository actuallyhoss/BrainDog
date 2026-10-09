/**
 * `bundle` and `refusals` read their numbers off `ledger.json` (PRF-B03 jobs 3 and 4).
 *
 *   node --test tools/gates/test/ledger-debt.test.mjs
 *
 * `bundle` fails above the entry script's debt plus the noise band and prints the budget, what is owed and the newest
 * reason. `refusals` holds the codes outside `30 §6` to the four deviations the ledger names, so a fifth is red by its
 * own name. Each rule is asked of the exported function on the real ledger, or a copy changed in one place.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { debtLine, entryDebt, readLedger } from '../bundle.mjs';
import { outsideTheLedger, refusalDeviations } from '../refusals.mjs';
import { readPaths } from '../self-test.mjs';

const gates = join(import.meta.dirname, '..');
const repo = join(gates, '..', '..');
const BOOK = JSON.parse(readFileSync(join(gates, 'ledger.json'), 'utf8'));
const BUDGETS = JSON.parse(readFileSync(join(gates, 'budgets.json'), 'utf8'));
const FOUR = ['DECLARATION_INVALID', 'INTERNAL', 'NOPE', 'SOMETHING_NOBODY_MAPPED'];

/** The walk as the real tree has it: each named deviation raised somewhere. */
const walk = (...codes) => new Map(codes.map((code) => [code, [`packages/somewhere/${code.toLowerCase()}.ts`]]));

test('the entry script fails above the ledger debt, and the reason is the line that set it', () => {
  const debt = entryDebt(BOOK);
  assert.ok(!(debt instanceof Error), debt.message);
  assert.equal(debt.at, BOOK.debts['bundle.mainJsBrotli'].lines.at(-1).at);
  /* The ledger's opening line restates the number on 2026-10-09; the reason is 6 October's, which set it. */
  assert.equal(debt.on, '2026-10-06');
  assert.equal(debt.owes, 'experience');
});

test("bundle's line prints the budget, what is owed, and the newest reason", () => {
  const line = debtLine(BUDGETS.bundle, entryDebt(BOOK));
  assert.match(line, /a budget of 30,720 with 3,080 owed by experience/u);
  assert.match(line, /failing above 33,864\./u);
  assert.match(line, /Newest reason, 2026-10-06: Measured at 33655/u);
});

test('a debt that falls is read at its new number, with the new reason', () => {
  const book = structuredClone(BOOK);
  book.debts['bundle.mainJsBrotli'].lines.push({ at: 33500, on: '2026-10-12', why: 'A route came out of the entry.' });
  const debt = entryDebt(book);
  assert.equal(debt.at, 33500);
  assert.equal(debt.why, 'A route came out of the entry.');
  assert.match(debtLine(BUDGETS.bundle, debt), /2,780 owed/u);
});

test('no debt, a line with no number, or no ledger is an Error in the gate, never a pass', () => {
  const none = structuredClone(BOOK);
  delete none.debts['bundle.mainJsBrotli'];
  assert.ok(entryDebt(none) instanceof Error);
  const blank = structuredClone(BOOK);
  blank.debts['bundle.mainJsBrotli'].lines.push({ on: '2026-10-12', why: 'no number' });
  assert.ok(entryDebt(blank) instanceof Error);
  assert.ok(readLedger(join(gates, 'no-such-ledger.json')) instanceof Error);
});

test('bundle reads mainJsBaseline while budgets.json still holds it, so the dead-key check stays green', () => {
  const source = readFileSync(join(gates, 'bundle.mjs'), 'utf8');
  if ('mainJsBaseline' in BUDGETS.bundle) assert.ok(readPaths(source).has('bundle.mainJsBaseline'));
  assert.ok(readPaths(source).has('bundle.mainJsNoise'));
});

test('the ledger names four refusal deviations, each by the code it stands for', () => {
  const named = refusalDeviations(BOOK);
  assert.ok(Array.isArray(named), named.message);
  assert.deepEqual(named.map((d) => d.id).sort(), FOUR);
});

test('the four named codes, raised, are green', () => {
  assert.deepEqual(outsideTheLedger(walk(...FOUR), refusalDeviations(BOOK)), []);
});

test('a fifth code outside the registry is red and names itself with its site', () => {
  const findings = outsideTheLedger(walk(...FOUR, 'MADE_UP_TODAY'), refusalDeviations(BOOK));
  assert.ok(findings.length > 0);
  const named = findings.find((f) => f.includes('`MADE_UP_TODAY`'));
  assert.ok(named, findings.join('\n'));
  assert.match(named, /no named deviation: packages\/somewhere\/made_up_today\.ts/u);
  assert.ok(!findings.some((f) => FOUR.some((code) => f.includes(`\`${code}\``))), 'only the fifth is named');
});

test('a named deviation nothing raises any more is red until its line leaves the ledger', () => {
  const findings = outsideTheLedger(walk('DECLARATION_INVALID', 'INTERNAL', 'NOPE'), refusalDeviations(BOOK));
  assert.equal(findings.length, 1);
  assert.match(findings[0], /`SOMETHING_NOBODY_MAPPED` is a named deviation.*Delete its line there/u);
});

test('a deviation with no code, or no list at all, is an Error', () => {
  const book = structuredClone(BOOK);
  book.deviations.refusals.push({ id: 'not a code', what: 'x', why: 'y', until: 'z' });
  assert.ok(refusalDeviations(book) instanceof Error);
  delete book.deviations.refusals;
  assert.ok(refusalDeviations(book) instanceof Error);
});

test('refusals is green on the repository, each code outside the registry a named deviation', () => {
  const run = spawnSync(process.execPath, [join(gates, 'refusals.mjs')], { cwd: repo, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /each a named deviation in the ledger \(DECLARATION_INVALID, INTERNAL, NOPE, SOMETHING_NOBODY_MAPPED\)/u);
});
