/**
 * What an add-on uses of yours (`src/uses.ts`): every list, figure, page and view of the whole record its file names
 * and does not own, read from the file as written; a file that says `uses` is held to it by `normalise`; and the
 * Kennel holds every submission to it, saying none or not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise } from '../src/index.ts';
import { usesFault, usesOf, usesSaid } from '../src/uses.ts';

const base = {
  pack: 'shelf',
  version: '1.0.0',
  title: 'Shelf',
  summary: 'Books on a shelf.',
  author: 'Ada',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
};
const books = { register: 'books', name: 'Books', fields: [{ id: 'title', type: 'text' }, { id: 'bought_with', type: 'ref', to: 'transactions' }] };

test('its own list is not a use; a ref, a page source, a figure, a rule, a script and a view are', () => {
  const doc = {
    ...base,
    declarations: [
      books,
      { page: 'shelf', title: 'Shelf', blocks: [{ kind: 'table', source: 'register.books' }, { kind: 'stat', source: 'metric.cash-now' }, { kind: 'feed', source: 'activity' }] },
      { rule: 'tag-spend', register: 'transactions', then: [{ create: { register: 'books' } }] },
      { script: 'match', reads: ['accounts'], writes: ['categories'], source: 'export default () => {}' },
    ],
  };
  assert.deepEqual(
    usesOf(doc).map((u) => `${u.id}${u.writes ? '*' : ''}`),
    ['register.transactions*', 'metric.cash-now', 'activity', 'register.accounts', 'register.categories*'],
  );
});

test('fields laid on a list and a block added to a page change them', () => {
  const doc = { ...base, extends: { 'register.people': { fields: [{ id: 'shelf', type: 'text' }] } }, adds: [{ page: 'page.project', block: { kind: 'table', source: 'register.tasks' } }] };
  assert.deepEqual(
    usesOf(doc).map((u) => `${u.id}${u.writes ? '*' : ''}`),
    ['register.people*', 'page.project*', 'register.tasks'],
  );
});

test('a file that says no uses is asked nothing unless strict, as the Kennel is', () => {
  const doc = { ...base, declarations: [books] };
  assert.equal(usesFault(doc), null);
  assert.equal(usesFault(doc, true)?.code, 'PACK_MALFORMED');
  assert.match(usesFault(doc, true)?.fix ?? '', /register\.transactions/u);
  assert.equal(usesFault({ ...doc, uses: ['register.transactions'] }, true), null);
});

test('uses is a list of ids, read', () => {
  assert.deepEqual(usesSaid({ uses: ['register.a', 'register.a', 'activity'] }), { ok: true, value: ['register.a', 'activity'] });
  assert.equal(usesSaid({ uses: 'register.a' }).ok, false);
  assert.equal(usesSaid({ uses: ['Transactions!'] }).ok, false);
});

test('normalise holds a file that says uses to it, and keeps it in the manifest', async () => {
  const short = await normalise({ ...base, uses: [], declarations: [books] }, { kind: 'local' });
  assert.equal(short.ok, false);
  const said = await normalise({ ...base, uses: ['register.transactions'], declarations: [books] }, { kind: 'local' });
  assert.ok(said.ok);
  if (said.ok) assert.deepEqual(said.value.manifest.uses, ['register.transactions']);
});

test('a place filled from a setting is refused where uses is held, and a row quoting the trigger is no place', () => {
  const filled = { ...base, uses: [], config: { list: { type: 'text', default: 'register.transactions' } }, declarations: [books, { page: 'any', title: 'Any', blocks: [{ kind: 'table', source: '{{config:list}}' }] }] };
  assert.match(usesFault(filled)?.fix ?? '', /from a setting/u);
  const quoted = { ...base, uses: ['register.transactions'], declarations: [books, { rule: 'note', register: 'books', then: [{ create: { register: 'books', fields: { title: 'x' }, source: 'mail from {{trigger.body.from}}' } }] }] };
  assert.equal(usesFault(quoted), null);
});
