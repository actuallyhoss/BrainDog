/**
 * A use case as a file: what it must say, the refusals at the path that is wrong, and its voice kept as
 * the settings of the pack it carries (`loop/research-spark.md` §2.1, §2.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VOICE_KEYS, labelKeyOf, labelSetting, labelsOf, speakingPack, voiceWhenAdding, voiceWrites, normalise, normaliseUseCase, useCasePack, voiceOf, type UseCase } from '../src/index.ts';

const DOC = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  usecase: 'reading',
  version: '1.0.0',
  title: 'Reader',
  summary: 'The books you are reading and what you thought of them.',
  author: 'Halden',
  license: 'MIT',
  audience: 'individual',
  tone: 'quiet',
  signals: ['books', 'reading list'],
  modules: [],
  voice: { home: 'Shelf', needs_you: 'Up next' },
  pack: {
    pack: 'usecase-reading',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
  },
  skills: [{ name: 'book-notes', trigger: 'when a book is finished' }],
  ...over,
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};
const refused = (r: { ok: boolean }) => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as unknown as { refusal: { code: string; at?: string } }).refusal;
};

test('A USE CASE READS BACK AS WHAT IT SAYS', () => {
  const u = value<UseCase>(normaliseUseCase(DOC()));
  assert.equal(u.usecase, 'reading');
  assert.deepEqual(u.voice, { home: 'Shelf', needs_you: 'Up next' });
  assert.deepEqual(u.skills, [{ name: 'book-notes', trigger: 'when a book is finished' }]);
});

test('EACH WRONG PART IS REFUSED AT ITS OWN PATH', () => {
  const cases: [Record<string, unknown>, string, string][] = [
    [{ usecase: 'Reading' }, 'PACK_MALFORMED', 'usecase'],
    [{ version: 'one' }, 'PACK_MALFORMED', 'version'],
    [{ tone: '' }, 'PACK_MALFORMED', 'tone'],
    [{ audience: 'everyone' }, 'VALUE_MALFORMED', 'audience'],
    [{ signals: ['Books'] }, 'VALUE_MALFORMED', 'signals'],
    [{ signals: ['books', 'books'] }, 'VALUE_MALFORMED', 'signals'],
    [{ modules: ['library'] }, 'VALUE_MALFORMED', 'modules'],
    [{ voice: { footer: 'Bye' } }, 'FIELD_UNKNOWN', 'voice.footer'],
    [{ voice: { home: 'x'.repeat(81) } }, 'VALUE_MALFORMED', 'voice.home'],
    [{ pack: { pack: 'reading', declarations: [] } }, 'PACK_MALFORMED', 'pack.pack'],
    [{ pack: { pack: 'usecase-reading', config: {}, declarations: [] } }, 'PACK_MALFORMED', 'pack.config'],
    [{ pack: null }, 'PACK_MALFORMED', 'voice'],
    [{ skills: [{ name: 'Notes', trigger: 'x' }] }, 'VALUE_MALFORMED', 'skills'],
    [{ colour: 'red' }, 'FIELD_UNKNOWN', 'colour'],
    [{ labels: { 'Books': 'Shelf' } }, 'VALUE_MALFORMED', 'labels.Books'],
    [{ labels: { 'books.state.read.twice': 'x' } }, 'VALUE_MALFORMED', 'labels.books.state.read.twice'],
    [{ labels: { books: '' } }, 'VALUE_MALFORMED', 'labels.books'],
    [{ labels: 'Shelf' }, 'PACK_MALFORMED', 'labels'],
    [{ voice: undefined, pack: null, labels: { books: 'Shelf' } }, 'PACK_MALFORMED', 'labels'],
    [{ labels: Object.fromEntries(Array.from({ length: 63 }, (_, i) => [`list${i}`, 'x'])) }, 'VALUE_MALFORMED', 'labels'],
  ];
  for (const [over, code, at] of cases) {
    const r = refused(normaliseUseCase(DOC(over)));
    assert.equal(r.code, code, JSON.stringify(over));
    assert.equal(r.at, at, JSON.stringify(over));
  }
});

test('A USE CASE WITH NO VOICE MAY CARRY NO PACK', () => {
  const u = value<UseCase>(normaliseUseCase(DOC({ voice: undefined, pack: null })));
  assert.equal(useCasePack(u), null);
});

test('THE VOICE IS KEPT AS THE PACK\'S SETTINGS, AND READ BACK FROM THEM', async () => {
  const u = value<UseCase>(normaliseUseCase(DOC()));
  const doc = useCasePack(u)!;
  const pack = value<{ manifest: { pack: string; version: string; summary: string; config?: Record<string, { type: string; default?: unknown }> } }>(await normalise(doc));
  assert.equal(pack.manifest.pack, 'usecase-reading');
  assert.equal(pack.manifest.summary, u.summary);
  assert.deepEqual(Object.keys(pack.manifest.config ?? {}).sort(), ['shared_version', 'speaks', 'voice_home', 'voice_needs_you']);
  const defaults = Object.fromEntries(Object.entries(pack.manifest.config ?? {}).map(([k, c]) => [k, c.default]));
  assert.deepEqual(voiceOf(defaults), u.voice);
  assert.deepEqual(voiceOf({ voice_home: '  ', voice_lists: 3, other: 'x' }), {});
});

test('EVERY VOICE KEY FITS A SETTING NAME', () => {
  for (const key of VOICE_KEYS) assert.match(`voice_${key}`, /^[a-z][a-z0-9_]{0,31}$/);
});

test('LABELS ARE KEPT AS THE PACK SETTINGS, BESIDE THE VOICE, AND READ BACK BY KEY (S8)', async () => {
  const labels = { books: 'Shelf', 'books.state': 'Where it is', 'books.state.to_read': 'Up next', people: 'Readers' };
  const u = value<UseCase>(normaliseUseCase(DOC({ labels })));
  assert.deepEqual(u.labels, labels);
  const doc = useCasePack(u)!;
  const pack = value<{ manifest: { config?: Record<string, { type: string; default?: unknown; label?: string }> } }>(await normalise(doc));
  const config = pack.manifest.config ?? {};
  assert.deepEqual(Object.keys(config).sort(), ['label_books', 'label_books__state', 'label_books__state__to_read', 'label_people', 'shared_version', 'speaks', 'voice_home', 'voice_needs_you']);
  assert.equal(config.label_books__state__to_read?.label, 'Label: books, state, to read');
  const defaults = Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]));
  assert.deepEqual(labelsOf(defaults), labels);
  assert.deepEqual(voiceOf(defaults), u.voice);
  assert.equal(labelSetting('people.role.collaborator'), 'label_people__role__collaborator');
  assert.deepEqual(labelsOf({ label_books: ' ', label_people: 3, voice_home: 'x', label_: 'y' }), {});
  assert.deepEqual(value<UseCase>(normaliseUseCase(DOC())).labels, {});
});

test('A LABEL WHOSE SETTING NAME WOULD BE TOO LONG IS KEPT BY ITS HASH, AND READ BACK THROUGH ITS TITLE', async () => {
  const labels = { 'obligations.category.client_work': 'Pay', 'obligations.category.premises': 'Home', books: 'Shelf', 'a_very_long_list_name_for_books:holds': 'what is kept' };
  const u = value<UseCase>(normaliseUseCase(DOC({ labels })));
  const pack = value<{ manifest: { config?: Record<string, { default?: unknown; label?: string }> } }>(await normalise(useCasePack(u)!));
  const config = pack.manifest.config ?? {};
  const long = labelSetting('obligations.category.client_work');
  assert.match(long, /^lk_[0-9a-f]{8}$/);
  assert.notEqual(long, labelSetting('obligations.category.premises'));
  assert.equal(labelSetting('books'), 'label_books', 'a name that fits keeps its form, so nothing a record holds is renamed');
  assert.equal(config[long]?.label, 'Label: obligations, category, client work');
  const defaults = Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]));
  assert.deepEqual(labelsOf(defaults, config), labels);
  assert.deepEqual(labelsOf(defaults), { books: 'Shelf' }, 'without the declared settings a hashed label is left out');
  assert.equal(labelKeyOf(long, 'Label: obligations, category, premises'), null, 'a title that is not the hashed key is not read');
});

test("A LIST'S SINGULAR AND ITS DESCRIPTION LINE ARE LABELS TOO, as one_<list> and holds_<list>", async () => {
  const labels = { books: 'Shelf', 'books:one': 'volume', 'books:holds': 'every volume on the shelf and where each one is' };
  const u = value<UseCase>(normaliseUseCase(DOC({ labels })));
  const pack = value<{ manifest: { config?: Record<string, { default?: unknown; label?: string }> } }>(await normalise(useCasePack(u)!));
  const config = pack.manifest.config ?? {};
  assert.equal(config.one_books?.default, 'volume');
  assert.equal(config.one_books?.label, 'Label: one of books');
  assert.equal(config.holds_books?.label, 'Label: what books holds');
  assert.equal(labelSetting('books:holds'), 'holds_books');
  assert.deepEqual(labelsOf(Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]))), labels);
  const long = 'a line about what is kept here, '.repeat(6);
  assert.equal(refused(normaliseUseCase(DOC({ labels: { 'books:one': long } }))).at, 'labels.books:one', 'a singular is a word');
  assert.ok(normaliseUseCase(DOC({ labels: { 'books:holds': long.slice(0, 180) } })).ok, 'a description is a line');
  assert.equal(refused(normaliseUseCase(DOC({ labels: { 'books:many': 'x' } }))).code, 'VALUE_MALFORMED');
});

test('THE VOICE RULE: a use case added goes beside the one speaking, or takes the voice when its id sorts first', () => {
  const on = (...ids: string[]) => ids.map((id) => ({ id, disabled_at: null }));
  assert.equal(voiceWhenAdding([], 'student'), 'speaks', 'nothing speaks yet');
  assert.equal(voiceWhenAdding(on('usecase-personal', 'work'), 'student'), 'beside');
  assert.equal(voiceWhenAdding(on('usecase-student'), 'personal'), 'speaks');
  assert.equal(voiceWhenAdding(on('usecase-student'), 'usecase-student'), 'speaks', 'the one speaking still speaks');
  assert.equal(voiceWhenAdding([{ id: 'usecase-founder', disabled_at: '2026-09-17' }, ...on('usecase-team')], 'guide'), 'speaks', 'a pack switched off does not speak');
  assert.equal(speakingPack([...on('usecase-team', 'usecase-personal')]), 'usecase-personal');
  /* A PERSON'S CHOICE LEADS THE RULE: set to speak, or set not to. */
  assert.equal(speakingPack([{ id: 'usecase-personal', disabled_at: null, speaks: false }, ...on('usecase-student')]), 'usecase-student');
  assert.equal(speakingPack([...on('usecase-personal'), { id: 'usecase-student', disabled_at: null, speaks: true }]), 'usecase-student');
  assert.equal(voiceWhenAdding([...on('usecase-student'), { id: 'usecase-personal', disabled_at: null, speaks: false }], 'team'), 'beside');
  /* UNASKED, ONE A PERSON CHOSE TO SPEAK KEEPS THE VOICE, however the added id sorts. */
  assert.equal(voiceWhenAdding([{ id: 'usecase-student', disabled_at: null, speaks: true }], 'personal'), 'beside');
  const carried = useCasePack({ ...(normaliseUseCase(DOC({})) as { value: UseCase }).value });
  assert.deepEqual((carried?.config as Record<string, unknown>)?.speaks, { type: 'bool', label: 'Speaks for this BrainDog' });
});

test('THE VOICE WRITTEN DOWN: exactly one use case on speaks, and no id sorting first moves it afterwards', () => {
  const three = [
    { id: 'usecase-personal', disabled_at: null },
    { id: 'usecase-student', disabled_at: null, speaks: true },
    { id: 'usecase-team', disabled_at: null, speaks: false },
    { id: 'usecase-guide', disabled_at: '2026-09-17', speaks: true },
  ];
  assert.deepEqual(voiceWrites(three, 'usecase-team'), [
    { id: 'usecase-student', speaks: false },
    { id: 'usecase-team', speaks: true },
    { id: 'usecase-personal', speaks: false },
  ].sort((a, b) => three.findIndex((p) => p.id === a.id) - three.findIndex((p) => p.id === b.id)));
  const after = three.map((p) => ({ ...p, ...(voiceWrites(three, 'usecase-team').find((w) => w.id === p.id) ?? {}) }));
  assert.equal(speakingPack(after), 'usecase-team');
  assert.equal(speakingPack([...after, { id: 'usecase-art', disabled_at: null }]), 'usecase-team', 'a use case added later took the voice');
  assert.deepEqual(voiceWrites(after, 'usecase-team'), [], 'written twice');
  assert.deepEqual(voiceWrites([{ id: 'usecase-personal', disabled_at: null }], 'usecase-personal'), [], 'one alone is not written');
  assert.deepEqual(voiceWrites(three, 'usecase-guide'), [], 'a use case switched off is never made to speak');
});
