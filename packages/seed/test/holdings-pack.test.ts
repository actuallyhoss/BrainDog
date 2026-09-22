/**
 * `holdings` as a pack of its own (`packs/holdings.ts`), and a record that held it under money-core getting there.
 *
 * WHY THIS FILE EXISTS. What a person holds is not what everybody's Money is for, and `gold` among its kinds was the one
 * use case §22 named by name (`loop/DIRECTION.md` section 22, `loop/research-seed-roles.md` Brief H). So the list leaves
 * money-core for a pack of its own, and ships without `gold`. `packages/declare/test/handover.test.ts` drives the
 * handover over one gold row and a pack body made up for that test; this file drives it with the pack this product ships
 * and the fourteen rows a real record holds, which is the case the brief asks to be true before anything else.
 *
 * WHAT A RECORD THAT HELD GOLD KEEPS. The pack cannot see a row, so the handover keeps everything the record's list had
 * that the pack does not declare, as the record's own addition: on his record `gold` stays a kind, every lot keeps it,
 * and nobody is asked to relabel eleven rows. A record that never held the list is offered no `gold` at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Pack } from '@braindog/declare';
import { readPackFile } from '@braindog/declare/catalogue';
import type { Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';

import { FIRST_PARTY, FIRST_PARTY_VERSIONS, HOLDINGS, HOLDINGS_VERSION, firstPartyDocument, holdingsPack } from '../src/index.ts';
import { HELD_AT_1_8_0, asMoneyCore180, attempt, put, record, value, type Doc } from './money-core-earlier.ts';

type Field = { id: string; type: string; values?: string[] };

const live = (k: Kernel, id: string) => k.declarations().find((d) => d.id === id);
const kinds = (k: Kernel): string[] => (JSON.parse(live(k, 'register.holdings')!.body) as { fields: Field[] }).fields.find((f) => f.id === 'kind')?.values ?? [];

/** Every first-party pack installed with money-core at 1.8.0, and the fourteen rows written into its `holdings`. */
async function on180(rows: number = HELD_AT_1_8_0.length) {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, id === 'money-core' ? asMoneyCore180(firstPartyDocument('money-core')) : firstPartyDocument(id));
  const ids = HELD_AT_1_8_0.slice(0, rows).map((row) => {
    const out = k.create('holdings', row as never, { actor: 'p_1' });
    assert.ok(out.ok, `${row.label}: ${sayOf(out)}`);
    return out.value.id;
  });
  return { k, sql, ids };
}

/** What a row is and what happened to it, as bytes, so "untouched" is a comparison and not a reading. */
const snapshot = (k: Kernel, ids: readonly string[]): string[] => ids.map((id) => JSON.stringify([k.get(id), k.history(id)]));

test('THE PACK DECLARES ONE LIST, UNDER ITS OWN NAME, AND NO GOLD: four kinds, commodity among them', async () => {
  const doc = holdingsPack() as unknown as Doc;
  assert.equal(doc.pack, 'holdings');
  assert.equal(doc.version, HOLDINGS_VERSION);
  assert.equal(HOLDINGS_VERSION, '1.0.0');
  assert.deepEqual(doc.declarations.map((d) => [d.register, d.pack]), [['holdings', 'holdings']]);
  const kind = (doc.declarations[0]!.fields as Field[]).find((f) => f.id === 'kind')!;
  assert.deepEqual(kind.values, ['certificate', 'policy', 'commodity', 'other']);
  assert.doesNotMatch(JSON.stringify(doc), /gold/iu, 'the pack still ships the word');
  /* THE LIST IS `HOLDINGS`, the body `holdingsDeclarations()` installs too, and the document is it with `tags` added. */
  assert.equal(HOLDINGS.pack, 'holdings');
  assert.deepEqual(
    (doc.declarations[0]!.fields as Field[]).map((f) => f.id),
    [...HOLDINGS.fields.map((f) => f.id), 'tags'],
  );
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  assert.deepEqual([...pack.manifest.provides], ['register.holdings']);
  assert.ok(!(FIRST_PARTY as readonly string[]).includes('holdings'), 'holdings became a first-party module, which every Money record would get');
});

test('A RECORD ON 1.8.0 HOLDING FOURTEEN ROWS UPDATES TO 2.0.0 AND TAKES THE PACK, every row as it was and gold its own', async () => {
  const { k, sql, ids } = await on180();
  const before = snapshot(k, ids);

  /* THE UPDATE HANDS THE LIST, AND THE PLAN SAYS WHERE IT GOES. Fourteen rows, so it is used whatever `used` says. */
  const update = await put(k, firstPartyDocument('money-core'), []);
  assert.deepEqual(update.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 14, to: 'holdings' }]);
  assert.equal(update.orphans, 0);
  assert.deepEqual(snapshot(k, ids), before, 'the update touched a row');

  /* THE PACK TAKES OVER WHAT IS ALREADY ITS OWN, AND KEEPS THE ONE WORD IT DOES NOT SHIP. */
  const take = await put(k, holdingsPack());
  assert.deepEqual(take.conflicts, []);
  assert.deepEqual(take.adds.map((a) => [a.id, a.handed]), [['register.holdings', true]]);
  assert.deepEqual(take.kept.map((x) => [x.id, x.adds]), [['register.holdings', ['kind.gold']]]);

  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other', 'gold']);
  assert.deepEqual(snapshot(k, ids), before, 'a row, its id or its history moved');
  assert.equal(k.count('holdings'), 14);
  const packs = k.packs().filter((p) => p.id === 'holdings' || p.id === 'money-core').map((p) => [p.id, p.version]);
  assert.deepEqual(packs, [['holdings', HOLDINGS_VERSION], ['money-core', FIRST_PARTY_VERSIONS['money-core']]]);

  /* AND THE RECORD GOES ON TAKING BOTH WORDS: its own for the next lot, and the pack's for anything new. */
  assert.ok(k.create('holdings', { kind: 'gold', label: 'Gold 21c', qty: 1, unit_cost: { amount: 480_000, currency: 'EGP' } } as never, { actor: 'p_1' }).ok);
  assert.ok(k.create('holdings', { kind: 'commodity', label: 'Silver', qty: 2, unit_cost: { amount: 9_000, currency: 'EGP' } } as never, { actor: 'p_1' }).ok);
  sql.close();
});

test('THE OTHER ORDER IS REFUSED BY NAMING THE UPDATE, and after the update it ends where the first order did', async () => {
  const { k, sql, ids } = await on180();
  const before = snapshot(k, ids);

  const early = await attempt(k, holdingsPack());
  assert.deepEqual(early.diff.conflicts.map((c) => [c.id, c.pack]), [['register.holdings', 'money-core']]);
  assert.equal(early.out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.match(early.out.refusal?.fix ?? '', /Update money-core first, then install holdings\./u);
  assert.deepEqual(snapshot(k, ids), before, 'the refused install touched a row');

  await put(k, firstPartyDocument('money-core'), []);
  await put(k, holdingsPack());
  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other', 'gold']);
  assert.deepEqual(snapshot(k, ids), before);
  sql.close();
});

test('A RECORD THAT NEVER HELD THE LIST IS OFFERED NO GOLD, and a lot of it goes in as a commodity', async () => {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, firstPartyDocument(id));
  assert.equal(k.register('holdings'), undefined, 'money-core still brings the list');
  await put(k, holdingsPack());

  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other']);
  const gold = k.create('holdings', { ...HELD_AT_1_8_0[1]! } as never, { actor: 'p_1' });
  assert.equal(gold.ok, false, 'a fresh record took gold as a kind');
  const lot = k.create('holdings', { ...HELD_AT_1_8_0[1]!, kind: 'commodity' } as never, { actor: 'p_1' });
  assert.ok(lot.ok, sayOf(lot));
  sql.close();
});

/**
 * A STRANGER'S LIST CALLED `holdings` IS NO LONGER MONEY'S TO REFUSE, AND IS STILL NOT THIS PACK'S TO LOSE. `MODULE_LISTS`
 * in `@braindog/declare` dropped `holdings` from Money with the move, so an add-on file declaring one is read as its own
 * list, the way one called `gold_lots` always was. On a record that has this pack, installing it is the conflict two packs
 * owning one declaration always meet, and the pack's list is left as it was.
 */
test('AN ADD-ON DECLARING ITS OWN holdings READS AS ITS OWN, and beside the pack it is a conflict that changes nothing', async () => {
  const addOn = {
    pack: 'studio-extras',
    version: '1.0.0',
    summary: 'A list of our own.',
    author: 'Halden',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ register: 'holdings', name: 'Mine', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
  };
  const read = (await readPackFile(addOn)) as { ok: boolean; refusal?: { fix: string } };
  assert.equal(read.ok, true, read.refusal?.fix);

  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, firstPartyDocument(id));
  await put(k, holdingsPack());
  const clash = await attempt(k, addOn);
  assert.equal(clash.out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.equal(clash.out.refusal?.fix, 'register.holdings belongs to holdings, and two packs cannot own one declaration.');
  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other']);
  sql.close();
});

/**
 * AN EMPTY LIST IS NOT HANDED WHEN THE RECORD CAN SAY SO. A handover keeps what somebody relies on, and a list with no
 * rows in it holds nothing to keep (`declare`'s plan, `inUse`). So a record that fills `used` has it retired by the
 * update, and the pack installs it afresh: the pack's four kinds and nothing of 1.8.0's, `gold` included.
 */
test('AN EMPTY HOLDINGS WITH `used` FILLED IS RETIRED, NOT HANDED, and the pack then declares it afresh without gold', async () => {
  const { k, sql } = await on180(0);
  const update = await put(k, firstPartyDocument('money-core'), []);
  assert.deepEqual(update.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 0, to: undefined }]);
  assert.equal(k.register('holdings'), undefined, 'the empty list outlived the update');

  const take = await put(k, holdingsPack());
  assert.deepEqual(take.adds.map((a) => [a.id, a.handed ?? false]), [['register.holdings', false]]);
  assert.deepEqual(take.kept, []);
  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other']);
  sql.close();
});
