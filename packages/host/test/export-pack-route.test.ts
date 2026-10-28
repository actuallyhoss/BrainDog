/**
 * `exportPack`, an add-on made from what a person made: one READ+ row that writes nothing, taking the
 * ticks and the example rows as JSON and the title, id and version as text, in the shape `router-groups` reads.
 *
 * THE GROUP IS WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): READ+, since the method's first statement is
 * `guard(ctx, 'read')`, so the table's READ+ rows grow by exactly this one and nothing that writes grows at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES } from '../src/index.ts';
import { ROUTES as OWN } from '../src/routes/export-pack.ts';
import { methods } from '../../record/src/methods/export-pack.ts';

test('EXPORT PACK IS ONE READ+ READ, written once in its file, taking what the method takes, with a plain sentence', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['exportPack', 'READ+', false]]);
  assert.deepEqual(OWN[0]!.takes, { declarations: 'json', rows: 'json', title: 'text', id: 'text', version: 'text', summary: 'text' });
  assert.equal(OWN[0]!.postRead, undefined, 'an ordinary read');
  const what = OWN[0]!.what;
  assert.match(what, /changes nothing/u);
  assert.doesNotMatch(what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b|\{\{/u, 'the sentence names things as a person does');
});

test('THE ROW NAMES THE RECORD METHOD OF THE SAME NAME, and the table serves it at most once', () => {
  const made = methods({} as never);
  assert.deepEqual(Object.keys(made), ['exportPack'], 'the method file answers the one name the row routes');
  /* Until `routes/index.ts` spreads this file the table has no such row; once it does, exactly one. */
  assert.ok(ROUTES.filter((r) => r.name === 'exportPack').length <= 1);
});
