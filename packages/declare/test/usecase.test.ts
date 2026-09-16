/**
 * A use case as a file: what it must say, the refusals at the path that is wrong, and its voice kept as
 * the settings of the pack it carries (`loop/research-spark.md` §2.1, §2.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VOICE_KEYS, normalise, normaliseUseCase, useCasePack, voiceOf, type UseCase } from '../src/index.ts';

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
  assert.deepEqual(Object.keys(pack.manifest.config ?? {}).sort(), ['voice_home', 'voice_needs_you']);
  const defaults = Object.fromEntries(Object.entries(pack.manifest.config ?? {}).map(([k, c]) => [k, c.default]));
  assert.deepEqual(voiceOf(defaults), u.voice);
  assert.deepEqual(voiceOf({ voice_home: '  ', voice_lists: 3, other: 'x' }), {});
});

test('EVERY VOICE KEY FITS A SETTING NAME', () => {
  for (const key of VOICE_KEYS) assert.match(`voice_${key}`, /^[a-z][a-z0-9_]{0,31}$/);
});
