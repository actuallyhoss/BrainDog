/**
 * Settings > Words and money: the speaking use case's settings sorted into lists, tabs and lines, what Save and Undo
 * send, and which add-on keeps the home currency.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { PackConfig, PackState } from '../../../lib/record/packs.ts';
import { AREAS, DEFAULT_GROUPS } from './place.ts';
import { HOME_CURRENCY, changesOf, currencyIn, currencyPackOf, oneFor, undoOf, wordsOf, type Read } from './words-money.ts';

const team: PackConfig = {
  id: 'usecase-team',
  version: '1.0.0',
  config: {
    voice_home: { type: 'text', label: 'What Home is called', default: 'Board' },
    voice_needs_you: { type: 'text', label: 'The heading over what needs you', default: 'Waiting on you' },
    voice_nothing_due: { type: 'text', label: 'The line when nothing falls due soon', default: 'Nothing due' },
    label_tasks: { type: 'text', label: 'Label: tasks', default: 'Tickets' },
    one_tasks: { type: 'text', label: 'Label: one of tasks', default: 'ticket' },
    holds_tasks: { type: 'text', label: 'Label: what tasks holds', default: 'every piece of work' },
    label_people__role: { type: 'text', label: 'Label: people, role', default: 'Teammate' },
    shared_version: { type: 'text', label: 'Last shared as' },
    speaks: { type: 'bool', label: 'Speaks for this BrainDog' },
  },
  values: { voice_home: 'Board', label_tasks: 'Tickets', one_tasks: 'ticket' },
};

test('a use case is read as its lists, its tabs and its other lines, and nothing else', () => {
  const s = wordsOf(team);
  assert.deepEqual(
    s.lists.map((l) => [l.list, l.name?.value, l.one?.value]),
    [['tasks', 'Tickets', 'ticket']],
  );
  assert.deepEqual(s.tabs.map((w) => [w.setting, w.title, w.value]), [['voice_home', 'What Home is called', 'Board']]);
  /* In the house voice's order, a line left unset reading its default. */
  assert.deepEqual(s.lines.map((w) => [w.setting, w.value]), [['voice_needs_you', 'Waiting on you'], ['voice_nothing_due', 'Nothing due']]);
});

test('a long label kept by its hash lands on its list', () => {
  const s = wordsOf({ id: 'usecase-x', version: null, config: { lk_00000000: { type: 'text', label: 'Label: one of tasks' } }, values: {} });
  /* The hash is checked against the title, so a made-up one reads as nothing. */
  assert.equal(s.lists.length, 0);
});

test("Save sends only what moved, and a cleared box or the use case's own word puts the default back", () => {
  const all = (() => {
    const s = wordsOf(team);
    return [...s.lists.flatMap((l) => [l.name!, l.one!]), ...s.tabs, ...s.lines];
  })();
  assert.deepEqual(changesOf(all, {}), {});
  assert.deepEqual(changesOf(all, { label_tasks: ' Bakes ', one_tasks: 'bake' }), { label_tasks: 'Bakes', one_tasks: 'bake' });
  assert.deepEqual(changesOf(all, { voice_home: 'Board' }), {});
  const renamed: PackConfig = { ...team, values: { ...team.values, label_tasks: 'Bakes' } };
  const now = wordsOf(renamed).lists[0]!.name!;
  assert.deepEqual(changesOf([now], { label_tasks: '' }), { label_tasks: null });
  assert.deepEqual(changesOf([now], { label_tasks: 'Tickets' }), { label_tasks: null });
});

test('Undo sends each word as it was held, and null where it held its default', () => {
  const renamed: PackConfig = { ...team, values: { ...team.values, voice_home: 'Shop' } };
  const s = wordsOf(renamed);
  const all = [...s.lists.flatMap((l) => [l.name!, l.one!]), ...s.tabs];
  assert.deepEqual(undoOf(all, { label_tasks: 'Bakes', voice_home: 'Ovens' }), { label_tasks: null, voice_home: 'Shop' });
});

test('renaming a list offers its singular', () => {
  assert.equal(oneFor('Bakes '), 'bake');
  assert.equal(oneFor('Deliveries'), 'delivery');
});

const state = (id: string, off = false): PackState => ({ id, version: '1.0.0', disabled_at: off ? '2026-10-01' : null, registers: [] });
const keeps = (id: string, code?: string): Read => ({
  state: state(id),
  settings: { id, version: '1.0.0', config: { [HOME_CURRENCY]: { type: 'text' } }, values: code === undefined ? {} : { [HOME_CURRENCY]: code } },
});

test('the home currency is written where the kernel reads it: the first pack on, by id, that holds one, else the first that declares it', () => {
  assert.equal(currencyPackOf([]), null);
  assert.equal(currencyPackOf([{ state: state('people'), settings: { id: 'people', version: null, config: {}, values: {} } }]), null);
  assert.equal(currencyPackOf([keeps('zeta'), keeps('money-core')])?.id, 'money-core');
  assert.equal(currencyPackOf([keeps('money-core'), keeps('zeta', 'egp')])?.id, 'zeta');
  assert.equal(currencyPackOf([{ ...keeps('a', 'USD'), state: state('a', true) }, keeps('b')])?.id, 'b');
  assert.equal(currencyIn(keeps('z', ' egp ').settings), 'EGP');
  assert.equal(currencyIn(keeps('z', 'pounds').settings), '');
  assert.equal(currencyIn(null), '');
});

test('the area is on the index, in the record\'s group, with a mark of its own, and the page draws it', () => {
  assert.equal(AREAS.get('words')?.label, 'Words and money');
  assert.ok(DEFAULT_GROUPS.find((g) => g.title === 'This record')?.areas.some((a) => a.id === 'words'));
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /area === 'words'\}\s*<Words \{shell\} \{area\} \/>/u);
});

test('a member is drawn the words with no control, and the words never say row or list item', () => {
  const src = readFileSync(new URL('./areas/Words.svelte', import.meta.url), 'utf8');
  const markup = src.slice(src.indexOf('</script>'));
  const memberArm = markup.slice(markup.indexOf('{:else}\n      {#if spoken.lists.length'));
  assert.ok(memberArm.length > 0);
  assert.doesNotMatch(memberArm.slice(0, memberArm.indexOf('<!-- Always')), /<input|<select|type="submit"/u);
  const own = src.slice(src.indexOf('const words = {'), src.indexOf('} as const;'));
  const said = [...own.matchAll(/[`']([^`']*\s[^`']*)[`']/gu)].map((m) => m[1]!);
  assert.ok(said.length > 5);
  for (const s of said) assert.doesNotMatch(s, /\brows?\b|list item|entity/iu, `Words says "${s}"`);
});
