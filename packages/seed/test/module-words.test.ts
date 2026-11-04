/**
 * `MODULE_WORDS` in `@braindog/declare` against the modules' own manifests, name and singular both.
 *
 * THE WORDS A USE CASE'S `label_<list>` AND `one_<list>` SETTINGS START FROM ARE A COPY of what each first-party list
 * declares as `name:` and `one:`, because `@braindog/declare` cannot read this package. A copy that drifts puts one word
 * on Settings › Words and another on the list itself, and the only test of the table checked its keys.
 * So the two are held equal here, as `MODULE_LISTS` is in `first-party.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULE_LISTS, MODULE_WORDS } from '@braindog/declare';

import { AGENTS_PACK, FIRST_PARTY, firstPartyDocument } from '../src/index.ts';

type Words = { name: string; one: string };

/** What every first-party list declares a person calls it, and one of it, by list, read off the manifests. */
function declared(): Map<string, Words> {
  const out = new Map<string, Words>();
  for (const id of FIRST_PARTY)
    for (const d of (firstPartyDocument(id) as { declarations: Record<string, unknown>[] }).declarations)
      /* A RULE NAMES THE LIST IT WATCHES as `register:` too, and a declaration of the list is the one that is nothing else. */
      if (typeof d.register === 'string' && !('rule' in d)) out.set(d.register, { name: String(d.name), one: String(d.one) });
  for (const [list, r] of Object.entries(AGENTS_PACK.registers as Record<string, { name?: unknown; one?: unknown }>))
    out.set(list, { name: String(r.name), one: String(r.one) });
  return out;
}

test("MODULE_WORDS SAYS WHAT EACH MODULE'S LIST CALLS ITSELF, its name and one of it, as the manifest declares them", () => {
  const manifests = declared();
  for (const [list, words] of Object.entries(MODULE_WORDS)) {
    const own = manifests.get(list);
    assert.ok(own, `${list} is in MODULE_WORDS and in no module`);
    assert.deepEqual(words, own, list);
  }
});

test('EVERY MODULE LIST WITHOUT WORDS IS ONE NOBODY RENAMES, and every list with words is one a module provides', () => {
  const manifests = declared();
  const lists = Object.values(MODULE_LISTS).flatMap((m) => m.lists);
  assert.deepEqual(lists.filter((l) => !manifests.has(l)), [], 'MODULE_LISTS names a list no manifest declares');
  /* `organisations` SINCE People 3.0.0, which took it from Founder: words for it would give every use case holding People
     two more settings, and each of them a version, for a list no use case has asked to rename. */
  /* AND `filing_rules` SINCE money-core 3.17.0 (filing-list-56): a list a person keeps and no use case renames, for the same reason. */
  /* AND `payee_names` SINCE money-core 3.34.0: the bank's words to names, kept by Money's script, and no use case renames it. */
  /* AND `plans` SINCE plans-list-66 (the unreleased money-core 3.17.0): made by Money's script from the name its parts share. */
  /* AND `kpis` SINCE portfolio 1.19.0, each project's key numbers: words for it would give every use case holding Projects
     two more settings, and each a version, for a list no use case has asked to rename. */
  assert.deepEqual(lists.filter((l) => !Object.hasOwn(MODULE_WORDS, l)).sort(), ['balances', 'filing_rules', 'fx', 'kpis', 'organisations', 'payee_names', 'plans', 'snapshots']);
});
