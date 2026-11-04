/**
 * `@braindog/seed/packs`: the first-party declarations the app ships, by the door the app is allowed to use.
 *
 * THE ROOT IS THE SAMPLE, and `tools/gates/no-fixtures.mjs` refuses a shipped file that names it. Three shipped files read
 * the root for things that are product and not sample (the modules' figures, the documents Install sends, the Agents
 * pack), and they sat on the gate's waiting list until this subpath existed. What this file holds is the two halves of
 * that bargain: the subpath carries everything those three read, as the very values the root carries, and it exports
 * no name that is only the sample, so a later export cannot turn it into a second root. (Its module graph still reaches
 * the sample's rows through `packs/first-party.ts`; `packs-entry.ts` says what was measured.)
 *
 * IMPORTED BY ITS PACKAGE NAME, not by `../src/packs-entry.ts`, because the name is what the app resolves: an entry file
 * that exists with no line in `package.json` passes an import by path and fails every build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as packs from '@braindog/seed/packs';
import * as root from '../src/index.ts';

/** What the three shipped files read, and nothing more. A new export here is a decision, so it is a red test first. */
const CARRIED = [
  'AGENTS_PACK',
  'FIRST_PARTY',
  'FIRST_PARTY_VERSIONS',
  'METRICS',
  'SEED_WIDGETS',
  'agentsPackDocument',
  'firstPartyDocument',
  'firstPartyManifest',
];

test('the subpath carries what the app reads from the seed, and nothing else', () => {
  assert.deepEqual(Object.keys(packs).sort(), [...CARRIED].sort());
});

test("every value is the root's own, so the two doors cannot say different things", () => {
  for (const name of CARRIED)
    assert.equal(packs[name as keyof typeof packs], root[name as keyof typeof root], `${name} is a different value through the subpath`);
  assert.ok(Object.keys(packs.METRICS).length > 0);
});

test("none of the sample's own names is reachable through it", () => {
  for (const name of ['REGISTERS', 'ROWS', 'NOW', 'installSeed', 'packDocument', 'LEARNINGS', 'TRANSACTIONS', 'PEOPLE'])
    assert.equal(name in packs, false, `${name} is exported by @braindog/seed/packs`);
});

test('the documents it sends are the ones Install sends', () => {
  assert.equal(packs.agentsPackDocument().pack, packs.AGENTS_PACK.manifest.id);
  for (const id of packs.FIRST_PARTY) {
    const doc = packs.firstPartyDocument(id, { seeds: [] });
    assert.equal(doc?.pack, id);
    assert.equal(doc?.version, packs.FIRST_PARTY_VERSIONS[id]);
    assert.equal('seeds' in (doc ?? {}), false, `${id} carried example rows when it was given none`);
  }
});
