/**
 * A use case's `needs` (USE-B08): the part of its modules it cannot stand without, so a record starts small and grows.
 *
 * A FILE SHARED BEFORE THE KEY READS THE SAME. Left out, `needs` is all of `modules`, and the normalised value carries no
 * `needs` key at all, so it is the same object it was and nothing fingerprinted from it moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, type UseCase } from '../src/index.ts';

const DOC = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  usecase: 'pottery',
  version: '1.0.0',
  title: 'Potter',
  summary: 'The pieces on the shelf and what they sold for.',
  author: 'Brindle Kiln',
  license: 'MIT',
  audience: 'individual',
  tone: 'quiet',
  signals: ['pottery', 'glazes'],
  modules: ['portfolio', 'people', 'money-core'],
  pack: {
    pack: 'usecase-pottery',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ register: 'pieces', name: 'Pieces', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
  },
  skills: [],
  ...over,
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};
const refused = (r: { ok: boolean }) => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as unknown as { refusal: { code: string; fix: string; at?: string; allowed?: string[] } }).refusal;
};

test('A FILE WITH NO NEEDS NORMALISES TO THE SAME OBJECT IT DID BEFORE, with no needs key written in', () => {
  const u = value<UseCase>(normaliseUseCase(DOC()));
  assert.equal(Object.hasOwn(u, 'needs'), false, 'an absent needs is never written as needs: undefined');
  /* THE OLD VALUE, as the normaliser made it before the key existed: the same keys in the same order. */
  const before = {
    usecase: 'pottery',
    version: '1.0.0',
    title: 'Potter',
    summary: 'The pieces on the shelf and what they sold for.',
    author: 'Brindle Kiln',
    license: 'MIT',
    audience: 'individual',
    tone: 'quiet',
    signals: ['pottery', 'glazes'],
    modules: ['portfolio', 'people', 'money-core'],
    voice: {},
    labels: {},
    pack: DOC().pack,
    skills: [],
    nav: [],
    links: [],
    over: {},
  };
  assert.deepEqual(u, before);
  assert.deepEqual(Object.keys(u), Object.keys(before), 'the keys come in the order they always did');
  /* READ BACK AGAIN IT IS STILL THE SAME, so a file exported from it and read in is unchanged. */
  assert.deepEqual(value<UseCase>(normaliseUseCase(JSON.parse(JSON.stringify(u)))), u);
});

test('A NEEDS THAT IS A PART OF MODULES IS KEPT, as said, beside them', () => {
  const u = value<UseCase>(normaliseUseCase(DOC({ needs: ['money-core'] })));
  assert.deepEqual(u.needs, ['money-core']);
  assert.deepEqual(u.modules, ['portfolio', 'people', 'money-core'], 'modules stay whole: they are what it grows into');
  assert.deepEqual(Object.keys(u).slice(9, 11), ['modules', 'needs'], 'needs sits beside modules');
  /* AN EMPTY NEEDS IS A USE CASE THAT STARTS WITH ONLY WHAT THE PERSON NAMED, and is kept as said. */
  assert.deepEqual(value<UseCase>(normaliseUseCase(DOC({ needs: [] }))).needs, []);
  /* ALL OF MODULES, SAID, IS KEPT AS SAID, so a file that writes it out reads back as it wrote it. */
  assert.deepEqual(value<UseCase>(normaliseUseCase(DOC({ needs: ['portfolio', 'people', 'money-core'] }))).needs, ['portfolio', 'people', 'money-core']);
});

test('A NEEDS THAT NAMES A MODULE OUTSIDE MODULES IS REFUSED, with the sentence, at needs, allowed the modules', () => {
  const r = refused(normaliseUseCase(DOC({ needs: ['money-core', 'work'] })));
  assert.equal(r.code, 'VALUE_MALFORMED');
  assert.equal(r.fix, 'needs names work, which this use case does not stand on. Add it to modules, or take it out of needs.');
  assert.equal(r.at, 'needs');
  assert.deepEqual(r.allowed, ['portfolio', 'people', 'money-core']);
});

test('A NEEDS THAT IS NOT A LIST OF PACK IDS IS REFUSED AT NEEDS', () => {
  for (const needs of ['money-core', [7], ['Money'], { money: true }, null, ['people', 'people']]) {
    const r = refused(normaliseUseCase(DOC({ needs })));
    assert.equal(r.code, 'VALUE_MALFORMED', `needs ${JSON.stringify(needs)}`);
    assert.equal(r.at, 'needs', `needs ${JSON.stringify(needs)}`);
  }
});
