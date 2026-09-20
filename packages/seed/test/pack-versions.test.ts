/**
 * Each first-party pack's version against what it declares (`FIRST_PARTY_VERSIONS` in `packs/first-party.ts`).
 *
 * A RECORD IS OFFERED AN UPDATE ONLY WHEN A VERSION GOES UP, so a pack that changes without one strands every record that
 * installed it on the old declarations, and one that goes up without a change asks people to update for nothing. The
 * fingerprint is of what reaches a record that already holds the pack: its declarations and its settings, never its
 * example rows, which are planted only into an empty list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } from '../src/index.ts';

type Doc = { version: string; declarations: unknown[]; config?: unknown };

/** Every pack as 1.0.0 declared it, before any of them had a version of its own. */
export const RELEASED_1_0_0 = JSON.parse(readFileSync(new URL('./fixtures/first-party-1.0.0.json', import.meta.url), 'utf8')) as Record<string, Doc>;

const fingerprint = (d: Doc): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null }))
    .digest('hex')
    .slice(0, 16);

/**
 * WHAT EACH VERSION ABOVE 1.0.0 DECLARES. A version that has not been released yet may change: set its fingerprint again.
 * One that a record may already hold may not: raise the version and add a line for it.
 */
const DECLARED: Record<string, string> = {
  'portfolio@1.1.0': 'a51dab345b11594b',
  'portfolio@1.2.0': '5e42170296fe76b4',
  'portfolio@1.3.0': 'b43e0664aa176905',
  'money-core@1.1.0': '5cb37a57b9de3499',
  'money-core@1.2.0': '4f42a8e447293eaf',
  'money-core@1.3.0': '2ee211ae089dc1fb',
  'work@1.1.0': 'b49e051fe7c26ac5',
  'work@1.2.0': '49a30d2ef8c1d672',
  'work@1.3.0': 'fb82e66d80644e3d',
  'work@1.4.0': '0173aa61c9b3bc21',
  'estate@1.1.0': '90cc384470cccf30',
};

test('EACH FIRST-PARTY PACK DECLARES WHAT ITS VERSION SAYS, and one that changed has a version of its own', () => {
  const wrong: string[] = [];
  const check = (ok: boolean, said: string) => {
    if (!ok) wrong.push(said);
  };
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id, { seeds: [] }) as Doc;
    const version = FIRST_PARTY_VERSIONS[id];
    check(doc.version === version, `${id}: the document and the manifest disagree`);
    const now = fingerprint(doc);
    if (version === '1.0.0') {
      check(
        now === fingerprint(RELEASED_1_0_0[id]!),
        `${id} changed since 1.0.0 and is still 1.0.0, so a record that has it is never offered the change. Raise its version in FIRST_PARTY_VERSIONS and add '${id}@<version>': '${now}' to DECLARED here.`,
      );
    } else {
      check(
        DECLARED[`${id}@${version}`] === now,
        `${id}@${version} declares something else now. If ${version} has not been released, set its fingerprint to '${now}'; if it has, raise the version.`,
      );
      check(now !== fingerprint(RELEASED_1_0_0[id]!), `${id} is ${version} and declares what 1.0.0 did, so its records would be asked to update for nothing`);
    }
  }
  assert.deepEqual(wrong, []);
});
