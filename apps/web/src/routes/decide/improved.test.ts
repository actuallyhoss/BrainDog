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
import { changeLine, declarationName, firstPartyUpdates, ledBy, readFirst } from './improved.ts';
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

test('Decide and Add-ons read what waits from one place', () => {
  const addons = source('../packs/+page.svelte');
  assert.match(addons, /import \{ declarationName, firstPartyUpdates \} from '\.\.\/decide\/improved\.ts';/u, 'Add-ons reads its own list of what waits again');
  const from = addons.indexOf('async function updatesOf(');
  const to = addons.indexOf("/** The record's plan for one update");
  assert.ok(from >= 0 && to > from, 'the Updates tab no longer reads the way this test assumes');
  const updatesOf = addons.slice(from, to);
  assert.match(updatesOf, /firstPartyUpdates\(held\)/u, 'the Updates tab builds its first-party half without the card’s source');
  assert.doesNotMatch(updatesOf, /listingsOf\(/u, 'the Updates tab keeps a second spelling of what waits');

  const decide = source('./+page.svelte');
  assert.match(decide, /import\('\.\/improved\.ts'\)/u, 'Decide does not read what waits');
  assert.match(decide, /import\('\.\/Improved\.svelte'\)/u, 'Decide does not draw the card');
});
