/**
 * The first-party modules and the lists each one owns, kept in one table.
 *
 * THE SAME FACT WAS WRITTEN TWICE, AND THE TWO COPIES DISAGREED. `FIRST_PARTY_LISTS` in `index.ts` held fifteen lists and
 * `MODULE_LISTS` in `usecase.ts` held the same fifteen plus Agents' four. The first is what `readPackFile` reads to stop a
 * shared add-on declaring a module's list, so an add-on declaring `skills` or `credentials` answered `{"ok":true}` where a
 * shared use case declaring the same list was refused `PROVIDES_CONFLICT` by `readShared`. The add-on then collided at
 * install on any record with Agents. Each copy was held to the seed by its own test, and neither test compared the two.
 *
 * SO `MODULE_LISTS` IS THE TABLE AND `FIRST_PARTY_LISTS` IS READ OFF IT. The tests here hold the derivation, and the two
 * doors (an add-on file and a use-case file) to one answer for every list a module owns.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_PARTY_LISTS, MODULES, MODULE_LISTS, exportUseCase, readShared } from '../src/index.ts';
import { readPackFile } from '../src/catalogue.ts';

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const addOn = (register: string) => ({
  pack: 'studio-extras',
  version: '1.0.0',
  summary: 'A list of our own.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register, name: 'Mine', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
});

test('AN ADD-ON DECLARING AN AGENTS LIST IS REFUSED, naming the Agents module', async () => {
  /* WHAT A PROBE MEASURED BEFORE: `skills` and `credentials` answered ok, `holdings` did not. */
  for (const list of ['skills', 'credentials', 'learnings', 'tools']) {
    const r = (await readPackFile(addOn(list))) as Out;
    assert.equal(r.ok, false, `an add-on declaring ${list} was read as fine`);
    assert.equal(`${r.refusal?.code} at ${r.refusal?.at}`, `PROVIDES_CONFLICT at register.${list}`);
    assert.match(r.refusal!.fix, /belongs to BrainDog's Agents module/u);
  }
  /* `holdings` WAS THE ONE THE PROBE FOUND REFUSED, as Money's. Since money-core 2.0.0 it is a pack of its own and in no
     module (`MODULE_LISTS` in `usecase.ts`), so an add-on declaring it is read as its own list, exactly as `gold_lots`
     is; the collision with the holdings pack, on a record that has it, is the install's `PROVIDES_CONFLICT`. */
  for (const list of ['holdings', 'gold_lots'])
    assert.equal(((await readPackFile(addOn(list))) as Out).ok, true, `an add-on declaring ${list}, which no module owns, was refused`);
  assert.equal(FIRST_PARTY_LISTS.get('holdings'), undefined, 'holdings is back in a module');
  /* AND MONEY'S OWN LISTS ARE STILL MONEY'S, so turning `holdings` round did not turn the refusal off for the module. */
  const accounts = (await readPackFile(addOn('accounts'))) as Out;
  assert.match(accounts.refusal?.fix ?? '', /belongs to BrainDog's Money module/u);
});

test('FIRST_PARTY_LISTS IS MODULE_LISTS READ BY LIST, every module and every list, the Agents module among them', () => {
  const byList = MODULES.flatMap((m) => MODULE_LISTS[m].lists.map((l): [string, string] => [l, m]));
  assert.deepEqual([...FIRST_PARTY_LISTS].sort(), byList.sort());
  assert.equal(FIRST_PARTY_LISTS.get('skills'), 'agents');
  /* NO LIST IS OWNED TWICE, or the map would keep whichever module came last and the refusal would name the wrong one. */
  assert.equal(FIRST_PARTY_LISTS.size, byList.length);
});

test('THE TWO DOORS ANSWER THE SAME for every list a module owns: an add-on file and a use-case file', async () => {
  const PARTS = {
    usecase: 'studio',
    version: '1.0.0',
    title: 'Studio',
    summary: 'A small studio.',
    author: 'Halden',
    license: 'MIT',
    audience: 'team' as const,
    tone: 'plain',
    modules: [],
    voice: {},
    labels: {},
  };
  for (const module of MODULES)
    for (const list of MODULE_LISTS[module].lists) {
      const decl = { register: list, name: 'Mine', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
      const doc = exportUseCase({ ...PARTS, declarations: [decl], examples: [] }) as Out;
      assert.ok(doc.ok, JSON.stringify(doc));
      const shared = (await readShared(JSON.stringify(doc.value))) as Out;
      const pack = (await readPackFile(addOn(list))) as Out;
      assert.equal(shared.refusal?.code, 'PROVIDES_CONFLICT', `a use case declaring ${list}`);
      assert.equal(pack.refusal?.code, 'PROVIDES_CONFLICT', `an add-on declaring ${list}`);
      assert.match(pack.refusal!.fix, new RegExp(`${MODULE_LISTS[module].name} module`, 'u'), list);
    }
});
