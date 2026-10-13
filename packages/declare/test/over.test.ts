/**
 * What a use case lays over the add-ons it stands on (SHL-A09): the file's `over`, by add-on id.
 *
 * IT WAS CODE. A use case renamed a module's lists and set its targets through functions that knew each module, so a
 * stranger's use case could do neither and a stranger's add-on could be laid over by nobody. The file says it now:
 * `over: { work: { words, config, hide } }`. Words become the use case's own label settings, config goes in with the
 * add-on's install as values somebody chose, and `hide` names the add-on's pages the use case leaves off the rail.
 *
 * ALL THREE ARE THE PERSON'S CHOICES ONCE THEY ARE IN, which is the whole of why a later update of the add-on keeps
 * them, and why a word the person types afterwards is newer and wins over the file's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, labelSetting, normalise, normaliseUseCase, overHidden, overSettings, plan, useCasePack, type Host, type Installed, type Pack, type UseCase } from '../src/index.ts';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown): NonNullable<Out['refusal']> => {
  const x = r as Out;
  assert.equal(x.ok, false, 'this file should have been refused');
  return x.refusal!;
};

/** A made-up add-on with one list, one page and two settings, one of them read by the list's name. */
const ADDON = (version: string, more: Record<string, unknown> = {}): Record<string, unknown> => ({
  pack: 'sample-bakes',
  version,
  summary: 'A made-up baking add-on for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  words: { bakes: { name: 'Bakes', one: 'bake' } },
  config: {
    target: { type: 'text', default: '10', label: 'Loaves a week' },
    oven: { type: 'enum', values: ['deck', 'rack'], default: 'deck', label: 'Oven' },
  },
  declarations: [
    { register: 'bakes', name: 'Bakes', one: 'bake', title: 'what', fields: [{ id: 'what', type: 'text', label: 'Aim for {{config:target}}' }] },
    { page: 'bake-board', title: 'Bake board', requires: ['register.bakes'], blocks: [{ kind: 'table', span: 12, source: 'register.bakes' }] },
  ],
  ...more,
});

const USECASE = (version: string, over: unknown, more: Record<string, unknown> = {}): Record<string, unknown> => ({
  usecase: 'bakery',
  version,
  title: 'Bakery',
  summary: 'A made-up bakery for tests.',
  author: 'Test Author',
  license: 'MIT',
  audience: 'a bakery',
  tone: 'plain and warm',
  modules: ['sample-bakes'],
  pack: { pack: 'usecase-bakery', declarations: [{ register: 'ovens', name: 'Ovens', one: 'oven', title: 'what', fields: [{ id: 'what', type: 'text' }] }] },
  ...(over === undefined ? {} : { over }),
  ...more,
});

const OVER = { 'sample-bakes': { words: { bakes: { name: 'Loaves', one: 'loaf' } }, config: { target: '40' }, hide: ['bake-board'] } };

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, fields as never, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

const packOf = async (doc: unknown): Promise<Pack> => value<Pack>(await normalise(doc, { kind: 'local' }));
const useCase = (version: string, over: unknown = OVER): UseCase => value<UseCase>(normaliseUseCase(USECASE(version, over)));
const defaults = (u: UseCase, words?: Parameters<typeof useCasePack>[1]): Record<string, unknown> =>
  Object.fromEntries(Object.entries((useCasePack(u, words)!.config ?? {}) as Record<string, { default?: string }>).map(([k, s]) => [k, s.default]));

test('OVER IS READ BY ADD-ON ID: its words, its config values and the pages it hides', () => {
  const u = useCase('1.0.0');
  assert.deepEqual(u.over, OVER);
  assert.deepEqual(overSettings(u, 'sample-bakes'), { target: '40' });
  assert.deepEqual(overSettings(u, 'somebody-else'), {});
  assert.deepEqual(overHidden(u), ['/p/bake-board']);
  assert.deepEqual(useCase('1.0.0', null).over, {});
});

test('ITS WORDS ARE THE USE CASE\'S OWN LABEL SETTINGS, so an add-on a stranger wrote can be renamed like a module', () => {
  const said = defaults(useCase('1.0.0'));
  assert.equal(said[labelSetting('bakes')], 'Loaves');
  assert.equal(said[labelSetting('bakes:one')], 'loaf');
});

test('ITS CONFIG GOES IN WITH THE INSTALL AND SURVIVES THE ADD-ON\'S UPDATE, as a value somebody chose', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('1.0.0');
  const first = await packOf(ADDON('1.0.0'));
  const diff = await plan(first, stateOf(k), { settings: overSettings(u, 'sample-bakes', stateOf(k).config?.['sample-bakes']) });
  assert.deepEqual(diff.config.map((c) => [c.key, c.value, c.from]), [['target', '40', 'given'], ['oven', 'deck', 'default']]);
  value(await install(first, diff, hostFor(k), diff.planHash));

  /* THE ADD-ON'S NEXT VERSION CHANGES ITS OWN DEFAULT AND ITS OWN WORDS, and is planned as an update is: with nothing sent. */
  const next = await packOf(ADDON('1.1.0', { words: { bakes: { name: 'Batches', one: 'batch' } }, config: { target: { type: 'text', default: '12', label: 'Loaves a week' }, oven: { type: 'enum', values: ['deck', 'rack'], default: 'rack', label: 'Oven' } } }));
  const update = await plan(next, stateOf(k));
  assert.deepEqual(update.config.map((c) => [c.key, c.value, c.from]), [['target', '40', 'kept'], ['oven', 'rack', 'default']]);
  value(await install(next, update, hostFor(k), update.planHash));
  assert.equal((k.packSettings()['sample-bakes'] as Record<string, unknown>).target, '40');
  /* AND THE USE CASE'S WORD FOR THE LIST IS ITS OWN SETTING, which the add-on's new word never touches. */
  assert.equal(defaults(u)[labelSetting('bakes')], 'Loaves');
});

test('A PERSON\'S LATER RENAME IS NEWER AND WINS, over the file\'s word and over its next version\'s', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const carried = await packOf(useCasePack(useCase('1.0.0')));
  const diff = await plan(carried, stateOf(k));
  value(await install(carried, diff, hostFor(k), diff.planHash));

  /* THE PERSON TYPES THEIR OWN WORD, and the use case's next version says a third. */
  const renamed: Installed = { ...stateOf(k), config: { 'usecase-bakery': { [labelSetting('bakes')]: 'Sourdoughs' } } };
  const later = useCase('1.1.0', { 'sample-bakes': { ...OVER['sample-bakes'], words: { bakes: { name: 'Buns', one: 'bun' } }, config: { target: '60' } } });
  const update = await plan(await packOf(useCasePack(later)), renamed);
  const word = update.config.find((c) => c.key === labelSetting('bakes'))!;
  assert.deepEqual([word.value, word.from], ['Sourdoughs', 'kept']);
  /* The singular nobody typed takes the file's new word, as any default does. */
  assert.equal(update.config.find((c) => c.key === labelSetting('bakes:one'))!.value, 'bun');

  /* AND A SETTING THE PERSON CHOSE ON THE ADD-ON IS NOT SENT AGAIN when the use case is applied a second time. */
  assert.deepEqual(overSettings(later, 'sample-bakes', { target: '25' }), {});
  assert.deepEqual(overSettings(later, 'sample-bakes', { oven: 'rack' }), { target: '60' });
});

test('THE FILE IS HELD TO WHAT IT STANDS ON, at the key that is wrong', () => {
  const stranger = refusal(normaliseUseCase(USECASE('1.0.0', { 'not-installed': { hide: ['a-page'] } })));
  assert.deepEqual([stranger.code, stranger.at], ['VALUE_MALFORMED', 'over.not-installed']);

  const stray = refusal(normaliseUseCase(USECASE('1.0.0', { 'sample-bakes': { rename: {} } })));
  assert.deepEqual([stray.code, stray.at], ['FIELD_UNKNOWN', 'over.sample-bakes.rename']);

  const empty = refusal(normaliseUseCase(USECASE('1.0.0', { 'sample-bakes': { words: { bakes: {} } } })));
  assert.deepEqual([empty.code, empty.at], ['VALUE_MALFORMED', 'over.sample-bakes.words.bakes']);

  const twice = refusal(normaliseUseCase(USECASE('1.0.0', OVER, { labels: { bakes: 'Rolls' } })));
  assert.deepEqual([twice.code, twice.at], ['VALUE_MALFORMED', 'over.sample-bakes.words.bakes']);

  const hidden = refusal(normaliseUseCase(USECASE('1.0.0', { 'sample-bakes': { hide: ['bake-board', 'bake-board'] } })));
  assert.deepEqual([hidden.code, hidden.at], ['VALUE_MALFORMED', 'over.sample-bakes.hide']);

  const moduleList = refusal(normaliseUseCase(USECASE('1.0.0', { work: { words: { invoices: { name: 'Jobs' } } } }, { modules: ['work'] })));
  assert.deepEqual([moduleList.code, moduleList.at], ['FIELD_UNKNOWN', 'over.work.words.invoices']);
});

test('A USE CASE FILE SAYS ITS OWN CHANGES, and they travel on the pack it carries', async () => {
  const u = value<UseCase>(normaliseUseCase(USECASE('1.1.0', OVER, { changes: 'Loaves a week starts at forty.' })));
  assert.equal(u.changes, 'Loaves a week starts at forty.');
  const carried = await packOf(useCasePack(u));
  assert.equal(carried.manifest.changes, 'Loaves a week starts at forty.');
  /* A NOTE IS NOT THE PACK: the same file with another note is the same pack. */
  const other = await packOf(useCasePack(value<UseCase>(normaliseUseCase(USECASE('1.1.0', OVER, { changes: 'Another note.' })))));
  assert.equal(other.checksum, carried.checksum);
  assert.equal(refusal(normaliseUseCase(USECASE('1.1.0', OVER, { changes: 7 }))).at, 'changes');
});

test('AN ADD-ON SAYS WHAT A PERSON CALLS EACH OF ITS LISTS, one and many, and the use case starts from those words', async () => {
  const addon = await packOf(ADDON('1.0.0'));
  assert.deepEqual(addon.manifest.words, { bakes: { name: 'Bakes', one: 'bake' } });
  /* Handed in by whoever holds the add-on's manifest, by add-on id. */
  const plain = defaults(useCase('1.0.0', {}), { 'sample-bakes': addon.manifest.words ?? {} });
  assert.equal(plain[labelSetting('bakes')], 'Bakes');
  assert.equal(plain[labelSetting('bakes:one')], 'bake');

  const notMine = refusal(await normalise(ADDON('1.0.0', { words: { tasks: { name: 'Tasks', one: 'task' } } })));
  assert.deepEqual([notMine.code, notMine.at], ['FIELD_UNKNOWN', 'words.tasks']);
  const half = refusal(await normalise(ADDON('1.0.0', { words: { bakes: { name: 'Bakes' } } })));
  assert.deepEqual([half.code, half.at], ['VALUE_MALFORMED', 'words.bakes']);
});
