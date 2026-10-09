/**
 * `ledger`: a budget never rises and a held list only shrinks (PRF-B03).
 *
 *   node --test tools/gates/test/ledger.test.mjs
 *
 * Each of the five rules is asked of `judge` on a copy of the real ledger and budgets, changed in one place, so a rule
 * that stops holding is red here by itself. The two planted trees are run as `self-test` runs them, and the gate is run
 * once on the repository, which is the scope's "green on master, with the entry script's budget and debt printed".
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { heldExportsIn, judge, literalsIn, numbersOf, quotesOwner, sizeOf } from '../ledger.mjs';

const gates = join(import.meta.dirname, '..');
const repo = join(gates, '..', '..');
const BOOK = JSON.parse(readFileSync(join(gates, 'ledger.json'), 'utf8'));
const BUDGETS = JSON.parse(readFileSync(join(gates, 'budgets.json'), 'utf8'));
const fresh = () => ({ book: structuredClone(BOOK), budgets: structuredClone(BUDGETS) });

/** Every held list read at its newest line, every gate file at its debt: the ledger as it stands, measured as it says. */
function measuredAsWritten(book) {
  const held = new Map(Object.entries(book.held).map(([name, e]) => [name, { size: e.lines.at(-1).count }]));
  const literals = new Map(
    Object.values(book.debts)
      .filter((d) => d.file)
      .map((d) => [d.file, d.lines.at(-1).at]),
  );
  return { held, literals };
}
const run = (book, budgets, measured = measuredAsWritten(book), direction = '') => judge(book, budgets, measured, direction);
const day = '2026-10-10';

test('the ledger as written is green, and the entry script prints its budget, what is owed and the newest reason', () => {
  const { book, budgets } = fresh();
  const { findings, said } = run(book, budgets);
  assert.deepEqual(findings, []);
  const entry = said.find((l) => l.includes('bundle.mainJsBrotli'));
  assert.match(entry, /a budget of 30720, 3080 owed by experience\. Newest reason, 2026-10-06:/u);
});

test('every number in budgets.json has a line, and the entry script carries its thirteen dated lines and the opening day', () => {
  const numbers = numbersOf(BUDGETS).map(([path]) => path);
  const covered = new Set([...Object.keys(BOOK.budgets), ...Object.values(BOOK.debts).map((d) => d.key).filter(Boolean)]);
  assert.deepEqual(numbers.filter((p) => !covered.has(p)), []);
  const lines = BOOK.debts['bundle.mainJsBrotli'].lines;
  assert.equal(lines[0].at, 31744);
  assert.equal(lines.at(-1).at, BUDGETS.bundle.mainJsBaseline);
  assert.equal(lines.length, 14);
  assert.deepEqual([lines.at(-2).on, lines.at(-1).on, lines.at(-1).at], ['2026-10-06', BOOK.opened, 33800]);
});

test('a rise dated into the history is red: an entry older than the ledger has a line on the day it began', () => {
  const { book, budgets } = fresh();
  budgets.bundle.mainJsBaseline = 33900;
  book.debts['bundle.mainJsBrotli'].lines.push({ at: 33900, on: '2026-10-07', why: 'Backdated.' });
  assert.match(run(book, budgets).findings.join('\n'), /line 15 is dated before the line above it/u);
  const { book: bare } = fresh();
  bare.budgets['bundle.mainJsNoise'].lines.pop();
  assert.match(run(bare, BUDGETS).findings.join('\n'), /bundle\.mainJsNoise has lines from before 2026-10-09 and none on 2026-10-09/u);
});

test('the day the ledger began does not move', () => {
  const { book, budgets } = fresh();
  book.opened = '2026-12-01';
  assert.match(run(book, budgets).findings.join('\n'), /ledger\.json opens on 2026-12-01, and the ledger began on 2026-10-09/u);
});

test('the recorded number set to 33900 with no ledger line is red', () => {
  const { book, budgets } = fresh();
  budgets.bundle.mainJsBaseline = 33900;
  const { findings } = run(book, budgets);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /bundle\.mainJsBaseline is 33900 in budgets\.json, and its newest line says 33800/u);
});

test('the recorded number set to 33900 with a ledger line is red too: a debt only falls', () => {
  const { book, budgets } = fresh();
  budgets.bundle.mainJsBaseline = 33900;
  book.debts['bundle.mainJsBrotli'].lines.push({ at: 33900, on: day, why: 'Re-recorded with a reason.' });
  const { findings } = run(book, budgets);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /the debt rose from 33800 to 33900 on 2026-10-10/u);
});

test('a debt that falls is green, and the rises before `opened` are history', () => {
  const { book, budgets } = fresh();
  budgets.bundle.mainJsBaseline = 33700;
  book.debts['bundle.mainJsBrotli'].lines.push({ at: 33700, on: day, why: 'Paid down.' });
  assert.deepEqual(run(book, budgets).findings, []);
});

test('a ceiling that rises is red unless `by` quotes the owner, word for word', () => {
  const { book, budgets } = fresh();
  budgets.bundle.mainCssBrotli = 13000;
  const lines = book.budgets['bundle.mainCssBrotli'].lines;
  lines.push({ at: 13000, on: day, why: 'More rules.', by: 'the builder' });
  assert.match(run(book, budgets).findings.join('\n'), /the ceiling moved from 12288 to 13000/u);
  lines.at(-1).by = 'HD.900: "let the stylesheet grow"';
  const direction = 'He said: let the stylesheet grow, once.';
  assert.deepEqual(run(book, budgets, undefined, direction).findings, []);
  assert.equal(quotesOwner('"let the stylesheet grow"', 'nothing like it'), false);
  assert.equal(quotesOwner('"grow"', direction), false, 'one word is not a quote');
  assert.equal(quotesOwner('He said "the gate"', 'run the gate twice'), false, 'two common words are not his sentence');
});

test('a floor that falls is red, and a setting moves with a line and no quote', () => {
  const { book, budgets } = fresh();
  budgets.layout.fullWidthShare = 0.7;
  book.budgets['layout.fullWidthShare'].lines.push({ at: 0.7, on: day, why: 'Narrower.', by: 'the builder' });
  assert.match(run(book, budgets).findings.join('\n'), /the floor moved from 0\.85 to 0\.7/u);
  const again = fresh();
  again.budgets.layout.settleMs = 80;
  again.book.budgets['layout.settleMs'].lines.push({ at: 80, on: day, why: 'A slower runner.', by: 'the builder' });
  assert.deepEqual(run(again.book, again.budgets).findings, []);
});

test('a number in budgets.json with no line, and a line with no number, are each red', () => {
  const { book, budgets } = fresh();
  budgets.bundle.newBudget = 4096;
  delete budgets.flags.maxDays;
  const said = run(book, budgets).findings.join('\n');
  assert.match(said, /bundle\.newBudget is 4096 in budgets\.json and has no line/u);
  assert.match(said, /flags\.maxDays has lines in ledger\.json and no number in budgets\.json/u);
});

test('a held list larger than its line is red, smaller is red until a line records the fall, and a line may not rise', () => {
  const { book, budgets } = fresh();
  const m = measuredAsWritten(book);
  m.held.set('web-lists.HELD', { size: 44 });
  assert.match(run(book, budgets, m).findings.join('\n'), /web-lists\.HELD holds 44, and its newest line says 43\. A held list only shrinks/u);
  m.held.set('web-lists.HELD', { size: 42 });
  assert.match(run(book, budgets, m).findings.join('\n'), /Write a line that records the fall/u);
  book.held['web-lists.HELD'].lines.push({ count: 42, on: day, why: 'One file stopped naming a list.' });
  assert.deepEqual(run(book, budgets, m).findings, []);
  book.held['web-lists.HELD'].lines.push({ count: 45, on: day, why: 'Grew.' });
  m.held.set('web-lists.HELD', { size: 45 });
  assert.match(run(book, budgets, m).findings.join('\n'), /its line rose from 42 to 45/u);
});

test('a held list a gate exports and the ledger has no line for is red, and the export is found in the text', () => {
  const { book, budgets } = fresh();
  delete book.held['one-clock.ALLOWED'];
  const m = { ...measuredAsWritten(book), exported: ['one-clock.ALLOWED'] };
  assert.match(run(book, budgets, m).findings.join('\n'), /one-clock\.ALLOWED is exported by its gate and has no line/u);
  assert.deepEqual(heldExportsIn("export const HELD = {};\nconst SKIPPED = [];\nexport { SKIPPED as UNCOVERED };\nexport const ALLOWED_SPELLING = 'x';"), ['HELD', 'UNCOVERED']);
});

test('a list not exported yet is said and counted as a debt, never red; a module that throws is red', () => {
  const { book, budgets } = fresh();
  const m = measuredAsWritten(book);
  m.held.set('keys.SKIPPED', { missing: true });
  const { findings, said, owing } = run(book, budgets, m);
  assert.deepEqual(findings, []);
  assert.ok(said.some((l) => /keys\.SKIPPED: not exported yet, held at 37/u.test(l)));
  assert.equal(owing, run(book, budgets).owing + 1);
  m.held.set('keys.SKIPPED', { error: 'Cannot find package' });
  assert.match(run(book, budgets, m).findings.join('\n'), /keys\.SKIPPED could not be read/u);
});

test('a number above 1 written in a gate file: over its debt is red, under is said, a file with no debt is red', () => {
  const { book, budgets } = fresh();
  const m = measuredAsWritten(book);
  const file = 'tools/gates/bundle.mjs';
  const owed = m.literals.get(file);
  m.literals.set(file, owed + 1);
  assert.match(run(book, budgets, m).findings.join('\n'), new RegExp(`${file} writes ${owed + 1} numbers above 1, and its debt allows ${owed}`, 'u'));
  m.literals.set(file, owed - 1);
  const under = run(book, budgets, m);
  assert.deepEqual(under.findings, []);
  assert.ok(under.said.some((l) => l.includes(`Lower its line to ${owed - 1}`)));
  m.literals.set(file, owed);
  m.literals.set('tools/gates/new-gate.mjs', 3);
  assert.match(run(book, budgets, m).findings.join('\n'), /new-gate\.mjs writes 3 number\(s\) above 1 and the ledger holds no debt/u);
});

test('literalsIn counts numbers above 1 in code and nothing in a string, a comment, a regex or an index', () => {
  const source = [
    '// 99 in a comment',
    'const a = 30720; const b = 0.5; const c = 1; const d = 0;',
    "const s = '4096'; const t = `${'7'} 12`; const r = /\\d{8}/u;",
    'const e = m[2]; const f = list.slice(0, 30);',
  ].join('\n');
  assert.equal(literalsIn(source), 2);
});

test('sizeOf reads a count, a list, a map, a set or an object, and nothing else', () => {
  assert.equal(sizeOf(37), 37);
  assert.equal(sizeOf(['a', 'b']), 2);
  assert.equal(sizeOf(new Map([['a', 1]])), 1);
  assert.equal(sizeOf(new Set(['a', 'b', 'c'])), 3);
  assert.equal(sizeOf({ a: 1, b: 2 }), 2);
  assert.equal(sizeOf('six'), undefined);
});

test("refusals' four deviations are named, and a deviation missing its reason or written twice is red", () => {
  assert.deepEqual(BOOK.deviations.refusals.map((d) => d.id).sort(), ['DECLARATION_INVALID', 'INTERNAL', 'NOPE', 'SOMETHING_NOBODY_MAPPED']);
  const { book, budgets } = fresh();
  book.deviations.refusals[0].why = '';
  book.deviations.refusals.push({ ...book.deviations.refusals[1] });
  const said = run(book, budgets).findings.join('\n');
  assert.match(said, /DECLARATION_INVALID gives no why/u);
  assert.match(said, /INTERNAL is written twice/u);
});

test('a line out of date order, or with no reason, is red', () => {
  const { book, budgets } = fresh();
  const lines = book.debts['bundle.mainJsBrotli'].lines;
  lines.splice(1, 0, { at: 31800, on: '2026-09-01', why: '' });
  const said = run(book, budgets).findings.join('\n');
  assert.match(said, /line 2 gives no `why`/u);
  assert.match(said, /line 2 is dated before the line above it/u);
});

/** A planted tree, run as `self-test` runs it. */
function planted(tree) {
  const at = join(gates, 'negative', tree);
  const r = spawnSync(process.execPath, [join(gates, 'ledger.mjs')], { cwd: at, encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: at } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('the planted trees are red, each for its one fault', () => {
  const raised = planted('ledger-raised');
  assert.equal(raised.status, 1);
  assert.match(raised.out, /bundle\.mainJsBrotli: the debt rose from 33800 to 33900/u);
  assert.match(raised.out, /\b1 finding\(s\)/u);
  const grew = planted('ledger-held-grew');
  assert.equal(grew.status, 1);
  assert.match(grew.out, /web-lists\.HELD holds 3, and its newest line says 2/u);
  assert.match(grew.out, /\b1 finding\(s\)/u);
});

test('on the repository the gate is green and prints the entry script as a budget of 30720 with 3080 owed', () => {
  const r = spawnSync(process.execPath, [join(gates, 'ledger.mjs'), repo], { encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: '' } });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /bundle\.mainJsBrotli: a budget of 30720, 3080 owed by experience\. Newest reason, 2026-10-06/u);
});
