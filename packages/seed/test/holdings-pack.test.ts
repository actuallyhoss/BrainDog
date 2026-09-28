/**
 * `holdings` as a pack of its own (`packs/holdings/holdings.pack.json`), and a record that held it under money-core getting there.
 *
 * WHY THIS FILE EXISTS. What a person holds is not what everybody's Money is for, and `gold` among its kinds was the one
 * use case §22 named by name (`loop/DIRECTION.md` section 22, `loop/research-seed-roles.md` Brief H). So the list leaves
 * money-core for a pack of its own, and ships without `gold`. `packages/declare/test/handover.test.ts` drives the
 * handover over one gold row and a pack body made up for that test; this file drives it with the pack this product ships
 * and the rows an imported record holds, which is the case the brief asks to be true before anything else.
 *
 * WHAT A RECORD THAT HELD GOLD KEEPS. The pack cannot see a row, so the handover keeps everything the record's list had
 * that the pack does not declare, as the record's own addition: where rows were written under it, `gold` stays a kind,
 * every lot keeps it, and nobody is asked to relabel a row. A record that never held the list is offered no `gold`.
 *
 * THE PACK IS ITS FILE, AT 1.1.0, AND THE HANDOVER IS THE ONE THAT SHIPPED. The builder that made 1.0.0 left `src` on
 * 25 September and the import now resolves `holdings` from the catalogue, which offers the file (`pack-files.ts`).
 * money-core stopped handing the list under 2.4.0 (`money-core-names-no-pack.test.ts`), so the update a record on 1.8.0
 * took is today's money-core with the `hands` it carried until then, and the last test drives the update it gets now.
 *
 * THE FILE IS 1.3.0 NOW: 1.2.0 gave `holdings-value` `sellable: true` (MOD-20), then the catalogue generator raised it
 * again to 1.3.0 once the add-on carried its own `title` and its cost script opened with a comment saying what it
 * does (`from-packs.mjs`'s own `changes` line on the file says so); nothing the pack writes moved with either step.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Pack } from '@braindog/declare';
import { readPackFile } from '@braindog/declare/catalogue';
import type { Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';

import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } from '../src/index.ts';
import { HELD_AT_1_8_0, asMoneyCore180, attempt, put, record, value, type Doc } from './money-core-earlier.ts';
import { handingAsShipped, holdings100, holdingsFile } from './pack-files.ts';

type Field = { id: string; type: string; values?: string[] };

const live = (k: Kernel, id: string) => k.declarations().find((d) => d.id === id);
const kinds = (k: Kernel): string[] => (JSON.parse(live(k, 'register.holdings')!.body) as { fields: Field[] }).fields.find((f) => f.id === 'kind')?.values ?? [];

/** Every first-party pack installed with money-core at 1.8.0, and the export's rows written into its `holdings`. */
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

/** money-core as a record on 1.8.0 was offered it from 2.0.0 until 2.4.0 stopped handing: today's, with the `hands` it shipped. */
const shippedUpdate = () => handingAsShipped(firstPartyDocument('money-core'));

/** What the file adds beside the list since 1.1.0: a rule and the script it starts, three figures and a page. */
const BESIDE = ['metric.holdings-costed', 'metric.holdings-count', 'metric.holdings-value', 'page.holdings', 'rule.holdings_cost', 'script.holdings_cost'];

/** What a row is and what happened to it, as bytes, so "untouched" is a comparison and not a reading. */
const snapshot = (k: Kernel, ids: readonly string[]): string[] => ids.map((id) => JSON.stringify([k.get(id), k.history(id)]));

test('THE PACK DECLARES ONE LIST, UNDER ITS OWN NAME, AND NO GOLD: four kinds, commodity among them', async () => {
  const doc = holdingsFile() as unknown as Doc;
  assert.equal(doc.pack, 'holdings');
  assert.equal(doc.version, '1.3.0');
  const lists = doc.declarations.filter((d) => typeof d.register === 'string');
  assert.deepEqual(lists.map((d) => [d.register, d.pack]), [['holdings', 'holdings']]);
  const kind = (lists[0]!.fields as Field[]).find((f) => f.id === 'kind')!;
  assert.deepEqual(kind.values, ['certificate', 'policy', 'commodity', 'other']);
  assert.doesNotMatch(JSON.stringify(doc), /gold/iu, 'the pack still ships the word');
  /* THE LIST IS THE ONE 1.0.0 DECLARED, WHICH A RECORD ON money-core 2.0.0 WAS FIRST OFFERED, with `cost` after `unit_cost`. */
  assert.deepEqual(
    (lists[0]!.fields as Field[]).map((f) => f.id),
    (holdings100().declarations[0]!.fields as Field[]).map((f) => f.id).flatMap((id) => (id === 'unit_cost' ? ['unit_cost', 'cost'] : [id])),
  );
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  assert.deepEqual([...pack.manifest.provides].sort(), ['register.holdings', ...BESIDE].sort());
  assert.ok(!(FIRST_PARTY as readonly string[]).includes('holdings'), 'holdings became a first-party module, which every Money record would get');
});

test('A RECORD ON 1.8.0 HOLDING ROWS UPDATES TO 2.0.0 AND TAKES THE PACK, every row as it was and gold its own', async () => {
  const { k, sql, ids } = await on180();
  const before = snapshot(k, ids);

  /* THE UPDATE HANDS THE LIST, AND THE PLAN SAYS WHERE IT GOES. It has rows, so it is used whatever `used` says. */
  const update = await put(k, shippedUpdate(), []);
  assert.deepEqual(update.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 14, to: 'holdings' }]);
  assert.equal(update.orphans, 0);
  assert.deepEqual(snapshot(k, ids), before, 'the update touched a row');

  /* THE PACK TAKES OVER WHAT IS ALREADY ITS OWN, AND KEEPS THE ONE WORD IT DOES NOT SHIP. */
  const take = await put(k, holdingsFile());
  assert.deepEqual(take.conflicts, []);
  assert.deepEqual(take.adds.map((a) => [a.id, a.handed ?? false]).sort(), [['register.holdings', true], ...BESIDE.map((id) => [id, false])].sort());
  assert.deepEqual(take.kept.map((x) => [x.id, x.adds]), [['register.holdings', ['kind.gold']]]);

  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other', 'gold']);
  assert.deepEqual(snapshot(k, ids), before, 'a row, its id or its history moved');
  assert.equal(k.count('holdings'), 14);
  const packs = k.packs().filter((p) => p.id === 'holdings' || p.id === 'money-core').map((p) => [p.id, p.version]);
  assert.deepEqual(packs, [['holdings', '1.3.0'], ['money-core', FIRST_PARTY_VERSIONS['money-core']]]);

  /* AND THE RECORD GOES ON TAKING BOTH WORDS: its own for the next lot, and the pack's for anything new. */
  assert.ok(k.create('holdings', { kind: 'gold', label: 'Gold 21c', qty: 1, unit_cost: { amount: 480_000, currency: 'EGP' } } as never, { actor: 'p_1' }).ok);
  assert.ok(k.create('holdings', { kind: 'commodity', label: 'Silver', qty: 2, unit_cost: { amount: 9_000, currency: 'EGP' } } as never, { actor: 'p_1' }).ok);
  sql.close();
});

test('THE OTHER ORDER IS REFUSED BY NAMING THE UPDATE, and after the update it ends where the first order did', async () => {
  const { k, sql, ids } = await on180();
  const before = snapshot(k, ids);

  const early = await attempt(k, holdingsFile());
  assert.deepEqual(early.diff.conflicts.map((c) => [c.id, c.pack]), [['register.holdings', 'money-core']]);
  assert.equal(early.out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.match(early.out.refusal?.fix ?? '', /Update money-core first, then install holdings\./u);
  assert.deepEqual(snapshot(k, ids), before, 'the refused install touched a row');

  await put(k, shippedUpdate(), []);
  await put(k, holdingsFile());
  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other', 'gold']);
  assert.deepEqual(snapshot(k, ids), before);
  sql.close();
});

test('A RECORD THAT NEVER HELD THE LIST IS OFFERED NO GOLD, and a lot of it goes in as a commodity', async () => {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, firstPartyDocument(id));
  assert.equal(k.register('holdings'), undefined, 'money-core still brings the list');
  await put(k, holdingsFile());

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
  await put(k, holdingsFile());
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
  const update = await put(k, shippedUpdate(), []);
  assert.deepEqual(update.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 0, to: undefined }]);
  assert.equal(k.register('holdings'), undefined, 'the empty list outlived the update');

  const take = await put(k, holdingsFile());
  assert.deepEqual(take.adds.filter((a) => a.id === 'register.holdings').map((a) => [a.id, a.handed ?? false]), [['register.holdings', false]]);
  assert.deepEqual(take.kept, []);
  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other']);
  sql.close();
});

/**
 * WHAT A RECORD ON 1.8.0 HOLDING ROWS GETS NOW THAT money-core HANDS NOTHING. The tests above drive the update as it
 * shipped from 2.0.0 until 2.4.0; this drives today's. Without `hands` the list is a retire with rows in it, which
 * `declare` refuses rather than orphaning, so the record keeps money-core 1.8.0 and every holding exactly as it was.
 * That is the case `first-party.ts` records under 2.4.0: nothing is lost, and the update does not land.
 */
test('money-core AS IT SHIPS NOW IS REFUSED ON A 1.8.0 RECORD HOLDING ROWS, and every row stays where it was', async () => {
  const { k, sql, ids } = await on180();
  const before = snapshot(k, ids);
  const { diff, out } = await attempt(k, firstPartyDocument('money-core'), []);
  assert.deepEqual(diff.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 14, to: undefined }]);
  assert.equal(diff.orphans, 14);
  assert.equal(out.refusal?.code, 'WOULD_ORPHAN', JSON.stringify(out.refusal));
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, '1.8.0', 'the refused update moved money-core');
  assert.deepEqual(snapshot(k, ids), before, 'the refused update touched a row');
  sql.close();
});
