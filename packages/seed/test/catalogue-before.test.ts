/**
 * `before` in `src/usecases/catalogue.ts`: which first-party modules have to be in before a pack that points at these
 * lists, in install order (`loop/research-batch-thirty-four-audit.md`, the note on `catalogue.ts:74`).
 *
 * IT THREW ON EVERY AGENTS LIST, AND NOTHING HAD ASKED IT ONE YET. `FIRST_PARTY_LISTS` answers `agents` for `skills`,
 * `credentials`, `learnings` and `tools`, and `before` then asked `firstPartyManifest('agents')`, which reads the five
 * modules `split()` builds from the starter and has no `agents` among them. Run against the tree on 22 September:
 * `TypeError: Cannot read properties of undefined (reading 'declarations')`. No first-party pack points at an agents
 * list today, so the catalogue built; the first one that did (a Work field naming who holds a task by skill, say) would
 * have taken the whole catalogue down with it, on both hosts, because `seedCatalogue()` runs this for every module.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENTS_PACK } from '../src/packs/agents.ts';
import { before, seedCatalogue } from '../src/usecases/catalogue.ts';

test('A LIST OF THE AGENTS MODULE names Agents and what Agents itself needs first, and does not throw', () => {
  for (const list of ['skills', 'credentials', 'learnings', 'tools'])
    assert.deepEqual(before([`register.${list}`]), ['portfolio', 'agents'], list);
});

test('WHAT AGENTS NEEDS is read off its own manifest, the one `seedCatalogue` already reads for its entry', () => {
  assert.deepEqual(AGENTS_PACK.manifest.requires, ['register.things']);
  const agents = seedCatalogue().find((e) => e.id === 'agents');
  assert.deepEqual(agents?.modules, ['portfolio']);
});

test('THE FIVE STARTER MODULES ARE ASKED AS BEFORE, and an agents list beside them lands in install order', () => {
  // money-core 3.0.0 links People softly (`LINKS['money-core'] = ['party']`), so Money no longer pulls People in.
  assert.deepEqual(before(['register.transactions']), ['portfolio', 'money-core']);
  assert.deepEqual(before(['register.tasks']), ['work']);
  assert.deepEqual(before(['register.tasks', 'register.skills']), ['portfolio', 'work', 'agents']);
  assert.deepEqual(before(['register.nosuch']), []);
});
