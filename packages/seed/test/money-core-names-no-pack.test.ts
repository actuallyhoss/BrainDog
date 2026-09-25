/**
 * money-core, the pack every Money record holds, names no other pack (`loop/research-legacy-parity.md` brief B1,
 * `loop/DIRECTION.md` sections 22 and 27).
 *
 * WHY THIS FILE EXISTS. From 1.8.0 to 2.4.0 money-core's document carried `hands`, naming `bank-hsbc-eg` for twelve
 * ingests and `holdings` for one list, so the core pack every person installs knew one person's bank and one person's
 * kind of list by id. Both packs are files in `packs/` now and the the old tool import resolves them from the catalogue
 * by id, so nothing is left that needs the core to know them. A handover is still something a pack can declare; this
 * holds that money-core does not.
 *
 * WHERE A PACK CAN NAME ANOTHER, READ STRUCTURALLY AND NOT AS TEXT. `requires.packs` (what it needs underneath),
 * `hands` (who takes what it stops declaring) and the `pack` a declaration's body says it belongs to. A text search of
 * the document would not do: `people` is a pack id and also the list money-core's `who` points at.
 *
 * RED FIRST, MEASURED ON 25 SEPTEMBER against the tree before the handover was dropped: `hands` named `bank-hsbc-eg`
 * twelve times and `holdings` once, and the test failed on exactly those two ids.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { normalise, type Pack } from '@braindog/declare';

import { AGENTS_PACK, FIRST_PARTY, firstPartyDocument } from '../src/index.ts';

/** Every pack id this tree ships: the first-party five, the agents pack, and each file under `packs/`. */
function everyPackId(): string[] {
  const root = new URL('../../../packs/', import.meta.url);
  const files = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(new URL(`${d.name}/`, root)).filter((f) => f === `${d.name}.pack.json`).map((f) => new URL(`${d.name}/${f}`, root)));
  const ids = files.map((f) => String((JSON.parse(readFileSync(f, 'utf8')) as { pack: unknown }).pack));
  return [...new Set([...FIRST_PARTY, AGENTS_PACK.manifest.id, ...ids])].sort();
}

test("money-core's manifest names no other pack's id", async () => {
  const doc = firstPartyDocument('money-core') as Record<string, unknown> & { declarations: Record<string, unknown>[] };
  const read = (await normalise(doc, { kind: 'local' })) as { ok: boolean; value: Pack; refusal?: { fix: string } };
  assert.ok(read.ok, read.refusal?.fix);
  const { manifest } = read.value;

  const others = new Set(everyPackId().filter((id) => id !== 'money-core'));
  /* THE LIST IS READ FROM THE TREE, so it is asked of the two packs that left and of any pack added later. */
  for (const id of ['bank-hsbc-eg', 'holdings', 'people']) assert.ok(others.has(id), `${id} is not among the ids this test looks for`);

  const named = [
    ...Object.keys(manifest.requires.packs ?? {}),
    ...Object.values(manifest.hands ?? {}),
    ...doc.declarations.map((d) => d.pack).filter((p): p is string => typeof p === 'string'),
  ];
  assert.deepEqual([...new Set(named.filter((id) => others.has(id)))].sort(), [], 'money-core names another pack');
  assert.equal(doc.hands, undefined, 'money-core still hands something on');
});
