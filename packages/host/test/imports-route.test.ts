/**
 * `imports` and `importAdopt`: one READ+ read that writes nothing and takes nothing, and one ADMIN write, the
 * owner's press, each with a sentence a person reads. The rows are asked of `routes/imports.ts` itself, so they hold
 * before the integrator spreads them into `routes/index.ts`; once spread, each is routed once and the counts move by one
 * READ+ and one ADMIN and nothing else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES } from '../src/routes/imports.ts';
import { EXTRA_ROUTES } from '../src/routes/index.ts';

const row = (name: string) => {
  const found = ROUTES.filter((r) => r.name === name);
  assert.equal(found.length, 1, `${name} is one row`);
  return found[0]!;
};
const plain = (what: string) => assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bS\d+\b/u, 'the sentence names things as a person does');

test('IMPORTS IS ONE READ+ READ, taking nothing, said for the owner', () => {
  const r = row('imports');
  assert.deepEqual([r.group, r.writes, r.takes], ['READ+', false, {}]);
  assert.equal(r.what, 'Every import made into this record, what each brought in, and whether you said it is your own. Only the owner reads it.');
  plain(r.what);
});

test('IMPORT ADOPT IS ONE ADMIN WRITE, taking the run and yes or no', () => {
  const r = row('importAdopt');
  assert.deepEqual([r.group, r.writes, r.takes], ['ADMIN', true, { run: 'text', yes: 'json' }]);
  assert.equal(r.what, 'Say an import is your own, or treat it as outside text, so an agent that reads it asks first.');
  plain(r.what);
});

test('THE TWO ROWS ARE ALL THE FILE HOLDS, and once spread each is routed once', (t) => {
  assert.deepEqual(ROUTES.map((r) => r.name), ['imports', 'importAdopt']);
  const spread = EXTRA_ROUTES.filter((r) => r.name === 'imports' || r.name === 'importAdopt');
  if (spread.length === 0) return t.skip('routes/index.ts does not spread these rows yet, so only the file is checked');
  assert.deepEqual(spread.map((r) => [r.name, r.group]), [['imports', 'READ+'], ['importAdopt', 'ADMIN']]);
});
