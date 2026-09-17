/**
 * A use case as a file: what it must say, the refusals at the path that is wrong, and its voice kept as
 * the settings of the pack it carries (`loop/research-spark.md` §2.1, §2.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VOICE_KEYS, labelSetting, labelsOf, normalise, normaliseUseCase, useCasePack, voiceOf, type UseCase } from '../src/index.ts';

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
    [{ labels: { 'books.reading_status.finished_reading': 'Done' } }, 'VALUE_MALFORMED', 'labels.books.reading_status.finished_reading'],
    [{ labels: { books: '' } }, 'VALUE_MALFORMED', 'labels.books'],
    [{ labels: 'Shelf' }, 'PACK_MALFORMED', 'labels'],
    [{ voice: undefined, pack: null, labels: { books: 'Shelf' } }, 'PACK_MALFORMED', 'labels'],
    [{ labels: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`list${i}`, 'x'])) }, 'VALUE_MALFORMED', 'labels'],
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
  assert.deepEqual(Object.keys(pack.manifest.config ?? {}).sort(), ['shared_version', 'voice_home', 'voice_needs_you']);
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
  assert.deepEqual(Object.keys(config).sort(), ['label_books', 'label_books__state', 'label_books__state__to_read', 'label_people', 'shared_version', 'voice_home', 'voice_needs_you']);
  assert.equal(config.label_books__state__to_read?.label, 'Label: books, state, to read');
  const defaults = Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]));
  assert.deepEqual(labelsOf(defaults), labels);
  assert.deepEqual(voiceOf(defaults), u.voice);
  assert.equal(labelSetting('people.role.collaborator'), 'label_people__role__collaborator');
  assert.deepEqual(labelsOf({ label_books: ' ', label_people: 3, voice_home: 'x', label_: 'y' }), {});
  assert.deepEqual(value<UseCase>(normaliseUseCase(DOC())).labels, {});
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
