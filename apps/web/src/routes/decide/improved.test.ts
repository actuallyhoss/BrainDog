/**
 * BRAINDOG'S OWN PAGE UPDATES ON DECIDE: which wait, what each changes, when one is read before it goes in, and that
 * Decide and Add-ons read them from one place.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MODULE_CHANGES } from '@braindog/seed/packs/changelog';
import { firstPartyModules } from '@braindog/seed/packs/modules';
import { USE_CASES } from '@braindog/seed/usecases';

import { compareVersion } from '../../lib/market/listing.ts';
import { cardLines, cardNotes, changeLine, declarationName, firstPartyUpdates, inTurn, ledBy, ordered, readFirst, readInOrder, type Improved } from './improved.ts';
import { words } from './words.ts';

const shipped = (id: string): string => {
  const m = firstPartyModules().find((x) => x.id === id);
  assert.ok(m, `this build ships no module called ${id}`);
  return m.version;
};
const held = (id: string, version: string | null, off = false) => ({ id, version, disabled_at: off ? '2026-09-01T00:00:00Z' : null, registers: [] });

test('an update waits for a module the record holds, turned on, at an older version, and for nothing else', () => {
  const updates = firstPartyUpdates([
    held('portfolio', '1.10.0'),
    held('people', shipped('people')),
    held('money-core', '1.0.0', true),
  ]);
  assert.deepEqual(
    updates.map((u) => [u.key, u.from, u.to]),
    [['module:portfolio', '1.10.0', shipped('portfolio')]],
    'what waits is not the one module held at an older version and turned on',
  );
  /* NOTHING HELD, NOTHING WAITS: an install is not an update. */
  assert.deepEqual(firstPartyUpdates([]), []);
});

test('what changes is every note after the version held, newest first, up to the one offered', () => {
  const [u] = firstPartyUpdates([held('portfolio', '1.10.0')]);
  assert.ok(u);
  const expected = MODULE_CHANGES.portfolio.filter((c) => compareVersion(c.version, '1.10.0') > 0 && compareVersion(c.version, u.to) <= 0).map((c) => c.notes);
  assert.ok(expected.length > 0, 'the changelog holds no note after 1.10.0, so this test reads nothing');
  assert.deepEqual(u.notes, expected);
  assert.equal(changeLine(u), expected[0]);
  /* AN UPDATE THAT CARRIES NO NOTE SAYS ONE IS THERE, in plain words. */
  assert.equal(changeLine({ notes: [], title: 'Solo founder' }), words.improvedNewer('Solo founder'));
});

test('a line is led by its page’s name, said once where the line already opens with it', () => {
  assert.deepEqual(ledBy('Work', 'Work opens on the task that has been late longest.'), { name: '', said: 'Work opens on the task that has been late longest.' });
  assert.deepEqual(ledBy('Agents', 'Shows the runs, and who is working now.'), { name: 'Agents', said: 'Shows the runs, and who is working now.' });
  /* A WORD THAT ONLY STARTS WITH THE NAME IS NOT THE NAME: "Workshop" under Work is led by Work. */
  assert.equal(ledBy('Work', 'Workshop pages open faster.').name, 'Work');
  assert.equal(ledBy('Solo founder', words.improvedNewer('Solo founder')).name, '');
});

test('a use case is planned from its own file, as the Updates tab plans it', () => {
  const u = USE_CASES[0];
  assert.ok(u);
  const [one] = firstPartyUpdates([held(`usecase-${u.usecase}`, '0.0.1')]);
  assert.ok(one, 'a use case held at an older version does not wait');
  assert.equal(one.kind, 'usecase');
  assert.equal(one.to, u.version);
  assert.ok(one.file.text && JSON.parse(one.file.text), 'the use case carries no file to plan it from');
});

/** The record's `Diff` for one update, as `planPack` answers it, with `more` laid over it. */
const diff = (more: Record<string, unknown> = {}) => ({
  pack: { id: 'portfolio', version: '1.12.0', summary: '' },
  planHash: 'plan-1',
  installed_version: '1.10.0',
  direction: 'upgrade',
  changes: [{ id: 'page.projects', summary: 'Projects opens on which projects need a push.' }],
  ...more,
});
const named = (id: string) => declarationName(id, [], (x) => x);

test('a plan that only changes pages goes in on one press', () => {
  const out = readFirst([diff()], [], named);
  assert.equal(out.read, false);
  assert.ok(out.sheet);
  assert.equal(readFirst([diff(), diff({ pack: { id: 'people', version: '2.7.0' } })], [], named).read, false);
});

test('a plan that stops, calls out, takes away, moves or reads differently is read on its sheet first', () => {
  const cases: [string, ReturnType<typeof readFirst>][] = [
    ['takes a list away', readFirst([diff({ retires: [{ id: 'register.old_projects', rows: 3 }] })], [], named)],
    ['hands a list on', readFirst([diff({ retires: [{ id: 'register.old', to: 'register.projects', rows: 3 }] })], [], named)],
    ['changes what a field means', readFirst([diff({ retypes: [{ id: 'register.projects', field: 'stage', from: 'text', to: 'enum', rows: 9 }] })], [], named)],
    ['calls another service', readFirst([diff({ calls_out: [{ line: 'GET api.example.com/rates', change: 'new' }] })], [], named)],
    ['asks to approve a line', readFirst([diff()], ['GET api.example.com/rates'], named)],
    ['is stopped by a conflict', readFirst([diff({ conflicts: [{ id: 'page.home', pack: 'other' }] })], [], named)],
    ['cannot be read here', readFirst([{ nothing: true }], [], named)],
  ];
  for (const [what, out] of cases) assert.equal(out.read, true, `a plan that ${what} goes in on one press`);
  assert.equal(readFirst([{ nothing: true }], [], named).sheet, null);
  /* A LINE IT ALREADY CALLED, THE SAME AS BEFORE, asks nothing new. */
  assert.equal(readFirst([diff({ calls_out: [{ line: 'GET api.example.com/rates', change: 'same' }] })], [], named).read, false);
});

test('a plan names a list by the name the record gives it, and a pack by the caller’s name for it', () => {
  assert.equal(declarationName('register.bank_accounts', [], (x) => x), 'Bank accounts');
  assert.equal(declarationName('register.money', [{ id: 'money', name: 'Cash' }], (x) => x), 'Cash');
  assert.equal(declarationName('portfolio', [], () => 'Projects'), 'Projects');
});

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('Needs you and Add-ons read what waits from one place', () => {
  const addons = source('../addons/Installed.svelte');
  assert.match(addons, /import \{ declarationName, firstPartyUpdates \} from '\.\.\/decide\/improved\.ts';/u, 'Add-ons reads its own list of what waits again');
  const from = addons.indexOf('async function updatesOf(');
  const to = addons.indexOf("The record's plan for one update");
  assert.ok(from >= 0 && to > from, 'the Updates tab no longer reads the way this test assumes');
  const updatesOf = addons.slice(from, to);
  assert.match(updatesOf, /firstPartyUpdates\(held\)/u, 'the Updates tab builds its first-party half without the card’s source');
  assert.doesNotMatch(updatesOf, /listingsOf\(/u, 'the Updates tab keeps a second spelling of what waits');

  const decide = source('./+page.svelte');
  assert.match(decide, /import\('\.\/improved\.ts'\)/u, 'Needs you does not read what waits');
  assert.match(decide, /import\('\.\/Improved\.svelte'\)/u, 'Needs you does not draw the card');
});

/* ── one update waits on another (`lib/market/update-order.ts`) ───────────── */

/** Money and Personal as they wait when both are behind: Money's plan is refused at the figure Personal still holds. */
const waiting = (key: string, kind: 'module' | 'usecase', id: string, title: string, file: unknown = null): Improved => ({ key, kind, id, title, from: '1.0.0', to: '2.0.0', file: { doc: null, text: file === null ? null : JSON.stringify(file) }, notes: [] });
const moneyU = waiting('module:money-core', 'module', 'money-core', 'Money');
const personalU = waiting('usecase:personal', 'usecase', 'personal', 'Personal', { usecase: 'personal', pack: { pack: 'usecase-personal', hands: { 'metric.budgets-set': 'money-core' } } });
const workU = waiting('module:work', 'module', 'work', 'Work');
const moneyDiff = (more: Record<string, unknown> = {}) => diff({ pack: { id: 'money-core', version: '3.17.0', summary: '' }, installed_version: '3.16.0', conflicts: [{ id: 'metric.budgets-set', pack: 'usecase-personal' }], ...more });
const personalDiff = diff({ pack: { id: 'usecase-personal', version: '2.4.0', summary: '' }, installed_version: '2.3.0' });

test('the update that hands something on goes in before the one that takes it', () => {
  assert.deepEqual(ordered([moneyU, personalU]).map((u) => u.title), ['Personal', 'Money']);
  assert.deepEqual(ordered([workU, moneyU, personalU]).map((u) => u.title), ['Work', 'Personal', 'Money']);
  /* WITH NOBODY TO WAIT FOR, the order is the one they came in. */
  assert.deepEqual(ordered([moneyU, workU]).map((u) => u.title), ['Money', 'Work']);
});

test('this build’s own Money and Personal wait in that order when both are behind', () => {
  const both = firstPartyUpdates([held('money-core', '1.0.0'), held('usecase-personal', '0.0.1')]);
  const titles = both.map((u) => u.key);
  assert.deepEqual([...titles].sort(), ['module:money-core', 'usecase:personal'], 'Money and Personal do not both wait, so this test reads nothing');
  assert.deepEqual(ordered(both).map((u) => u.key), ['usecase:personal', 'module:money-core']);
});

test('a conflict the update before it clears is no stop, and the two go in on one press', () => {
  const run = [personalU, moneyU];
  const out = readInOrder(run, [personalDiff, moneyDiff()], [], named);
  assert.equal(out.read, false, 'Money waiting on Personal is read as a stop');
  assert.deepEqual(out.sheet?.stops, []);
  /* TAKEN ALONE, the same plan is a stop, as the record would refuse it. */
  assert.equal(readFirst([moneyDiff()], [], named).read, true);
  assert.equal(readInOrder([moneyU], [moneyDiff()], [], named).sheet?.stops.length, 1);
});

test('what else such a plan carries is still read first, and the sheet says what it goes in after', () => {
  const run = [personalU, moneyU];
  const takes = readInOrder(run, [personalDiff, moneyDiff({ retires: [{ id: 'register.old_budgets', rows: 3 }] })], [], named);
  assert.equal(takes.read, true);
  assert.deepEqual(takes.sheet?.stops, []);
  const worth = takes.sheet?.parts[1]?.sections.find((s) => s.key === 'worth');
  assert.ok(worth?.rows.some((r) => /goes in after/u.test(r.detail ?? '')), 'the sheet does not say Money goes in after Personal');
  /* A CONFLICT NO UPDATE HERE CLEARS STOPS IT, in the same run or not. */
  const own = readInOrder(run, [personalDiff, moneyDiff({ conflicts: [{ id: 'metric.budgets-set', pack: '(this record)' }] })], [], named);
  assert.equal(own.read, true);
  assert.equal(own.sheet?.stops.length, 1);
});

/** A run of the card's installs over plans that are only names, with what happened written down. */
async function run(order: readonly Improved[], more: { landed?: string[]; refuse?: string; asks?: Record<string, string[]> } = {}) {
  const log: string[] = [];
  const plans = order.map((u) => ({ u, p: `${u.title}@0` }));
  const out = await inTurn(plans, {
    replan: async (u) => (log.push(`plan ${u.title}`), { ok: true as const, planned: `${u.title}@1` }),
    asksOf: (p) => more.asks?.[p] ?? [],
    landed: (p) => (more.landed ?? []).includes(p),
    install: async (p) => (log.push(`install ${p}`), p === more.refuse ? { ok: false as const, fix: 'Refused.' } : { ok: true as const }),
    unread: words.improvedRead,
  });
  return { log, out };
}

test('Accept installs Personal first, and plans Money again once Personal has landed', async () => {
  const { log, out } = await run(ordered([moneyU, personalU]));
  assert.deepEqual(log, ['install Personal@0', 'plan Money', 'install Money@1']);
  assert.deepEqual(out, { done: 2, passed: 0, fix: '' });
});

test('an update the one before it already brought in is passed over, and a refusal stops the run where it is', async () => {
  const passed = await run([personalU, moneyU, workU], { landed: ['Money@1'] });
  assert.deepEqual(passed.log, ['install Personal@0', 'plan Money', 'plan Work', 'install Work@1']);
  assert.deepEqual(passed.out, { done: 2, passed: 1, fix: '' });
  const refused = await run([personalU, moneyU, workU], { refuse: 'Money@1' });
  assert.deepEqual(refused.log, ['install Personal@0', 'plan Money', 'install Money@1']);
  assert.deepEqual(refused.out, { done: 1, passed: 0, fix: 'Refused.' });
  /* A LINE NOBODY WAS SHOWN stops it too, before anything of that update goes in. */
  const unread = await run([personalU, moneyU], { asks: { 'Money@1': ['GET api.example.com/rates'] } });
  assert.deepEqual(unread.log, ['install Personal@0', 'plan Money']);
  assert.deepEqual(unread.out, { done: 1, passed: 0, fix: words.improvedRead });
});

test('the card orders what waits before it plans, and installs in turn', () => {
  const card = source('./Improved.svelte');
  const from = card.indexOf('async function accept(');
  const to = card.indexOf('async function installAll(');
  assert.ok(from >= 0 && to > from, 'the card no longer reads the way this test assumes');
  const accept = card.slice(from, to);
  assert.match(accept, /const run = ordered\(updates\);/u, 'Accept plans in the order the updates came in');
  assert.match(accept, /for \(const u of run\)/u);
  assert.match(accept, /readInOrder\(run, /u, 'Accept reads a conflict the run clears as a stop');
  assert.match(card.slice(to), /inTurn\(plans, /u, 'the card keeps its own loop of installs');
});

test('the card lists what waits in the order it goes in, Personal before the Money it hands to', () => {
  const money = { ...moneyU, notes: ['Budgets show what is left this month.', 'Bills due this week are listed first.'] };
  const personal = { ...personalU, notes: ['Sets a budget for each month.', 'Counts what was spent on the house.'] };
  assert.deepEqual(cardLines([money, personal]).map((l) => [l.key, l.name, l.said]), [
    ['usecase:personal', 'Personal', 'Sets a budget for each month.'],
    ['module:money-core', 'Money', 'Budgets show what is left this month.'],
  ]);
  /* EVERY CHANGE, FOLDED UNDER "See each change", in the same order, each update's notes kept together. */
  assert.deepEqual(cardNotes([money, personal]).map((l) => [l.name, l.said]), [
    ['Personal', 'Sets a budget for each month.'],
    ['Personal', 'Counts what was spent on the house.'],
    ['Money', 'Budgets show what is left this month.'],
    ['Money', 'Bills due this week are listed first.'],
  ]);
  assert.equal(new Set(cardNotes([money, personal]).map((l) => l.key)).size, 4, 'two folded lines share a key');
  /* WITH NOBODY TO WAIT FOR, the lines stay as they came in, and the name is still said once (`ledBy`). */
  assert.deepEqual(cardLines([money, workU]).map((l) => l.key), ['module:money-core', 'module:work']);
  assert.equal(cardLines([{ ...workU, notes: ['Work opens on the task that has been late longest.'] }])[0]?.name, '');
  /* THE CARD DRAWS THOSE, and never the updates as they came in. */
  const card = source('./Improved.svelte');
  assert.doesNotMatch(card, /\{#each updates as /u, 'the card draws its lines in the order the updates came in');
  assert.match(card, /\{#each cardLines\(updates\) as line \(line\.key\)\}/u);
  assert.match(card, /\{#each cardNotes\(updates\) as line \(line\.key\)\}/u);
});
