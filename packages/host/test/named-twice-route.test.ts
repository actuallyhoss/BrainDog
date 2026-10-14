/**
 * `namedTwice` and `askNamedSame` (`src/routes/named-twice.ts`): the organisations and projects that may be on the
 * record twice, and his press that puts one pair to Decide.
 *
 * THE GROUPS ARE WHAT `router-groups` COUNTS (`docs/30-BLUEPRINT.md` §5): `namedTwice` is READ+ and writes nothing, since
 * the method's first statement is `scoped(ctx, 'read')`; `askNamedSame` is DATA and writes a question, since its first
 * statement is `guard(ctx, 'write', ...)`. The rows are read from their own file; serving them is the routes index's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES as OWN } from '../src/routes/named-twice.ts';

test('NAMED TWICE IS ONE READ+ READ taking a limit, and ASK NAMED SAME ONE DATA PRESS taking the pair', () => {
  assert.deepEqual(OWN.map((r) => [r.name, r.group, r.writes]), [['namedTwice', 'READ+', false], ['askNamedSame', 'DATA', true]]);
  assert.deepEqual(OWN[0]!.takes, { limit: 'integer' });
  assert.deepEqual(OWN[1]!.takes, { pair: 'text' });
});

test('EACH SAYS WHAT IT DOES IN PLAIN WORDS: the read changes nothing, the press is a person\'s, and neither names an id', () => {
  assert.match(OWN[0]!.what, /changes nothing/u);
  assert.match(OWN[1]!.what, /asked by a person and never by an agent/u);
  for (const r of OWN) assert.doesNotMatch(r.what, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|\blist item\b|\bULIDs?\b|\{\{/u, `${r.name} names things as a person does not`);
});
