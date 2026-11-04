/**
 * `holdings` as a pack of its own (`packs/holdings/holdings.pack.json`), and a record that held it under money-core getting there.
 *
 * WHY THIS FILE EXISTS. What a person holds is not what everybody's Money is for, and `gold` among its kinds was one
 * person's use case by name. So the list leaves
 * money-core for a pack of its own, which shipped without `gold` until 2.0.0 (below). `packages/declare/test/handover.test.ts` drives the
 * handover over one gold row and a pack body made up for that test; this file drives it with the pack this product ships
 * and the rows an imported record holds, which is the case that has to be true before anything else.
 *
 * WHAT A RECORD THAT HELD GOLD KEEPS. The pack cannot see a row, so the handover keeps everything the record's list had
 * that the pack does not declare, as the record's own addition: where rows were written under it, `gold` stays a kind,
 * every lot keeps it, and nobody is asked to relabel a row. Until 2.0.0 a record that never held the list was offered no `gold`.
 *
 * THE PACK IS ITS FILE, AT 1.1.0, AND THE HANDOVER IS THE ONE THAT SHIPPED. The builder that made 1.0.0 left `src`
 * and the import now resolves `holdings` from the catalogue, which offers the file (`pack-files.ts`).
 * money-core stopped handing the list under 2.4.0 (`money-core-names-no-pack.test.ts`), so the update a record on 1.8.0
 * took is today's money-core with the `hands` it carried until then, and the last test drives the update it gets now.
 *
 * THE FILE IS 1.3.0 NOW: 1.2.0 gave `holdings-value` `sellable: true`, then the catalogue generator raised it
 * again to 1.3.0 once the add-on carried its own `title` and its cost script opened with a comment saying what it
 * does (`from-packs.mjs`'s own `changes` line on the file says so); nothing the pack writes moved with either step.
 *
 * AND 1.4.0 SINCE BATCH 64, the next version after the released 1.3.0, which is frozen in `fixtures/released/` and is
 * not touched: a holding has a price ("Worth each now"), the day it was priced and what it is worth now, the value
 * reads in no currency named by the file, and two figures count the holdings that stand at what they cost.
 *
 * AND 2.0.0, INVESTMENTS AND GOLD. The add-on is where a use case belongs, so `gold` comes back as a kind of the pack's
 * own, beside funds and shares, appended after the four 1.x kinds so a record that kept `gold` as its own addition
 * holds the same word in the same place. A record that held gold before now finds the pack declaring it and keeps
 * nothing of its own; a fresh record is offered it. Two lists join the one (`holding_buys`, `gold_rates`), with a page
 * a holding and the figures over them, and `packs/holdings/holdings.test.ts` holds what they do.
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

/**
 * What the file adds beside the list since 1.1.0: a rule and the script it starts, three figures and a page; four more
 * figures since 1.4.0, and a second script, the one that asks about an account and a holding of one name; and since
 * 2.0.0 the buys and the gold rates, the two rules that hear them, eleven figures and a page a holding.
 */
const BESIDE = [
  'metric.gold-grams', 'metric.gold-held', 'metric.gold-rate-on', 'metric.gold-rates-current', 'metric.gold-rates-old', 'metric.holding-buys',
  'metric.holdings-at-cost', 'metric.holdings-by-kind', 'metric.holdings-cost', 'metric.holdings-costed', 'metric.holdings-count', 'metric.holdings-gain',
  'metric.holdings-gain-pct', 'metric.holdings-gained', 'metric.holdings-priced-on', 'metric.holdings-stale', 'metric.holdings-uncosted', 'metric.holdings-unpriced', 'metric.holdings-unvalued', 'metric.holdings-value', 'metric.holdings-worth-costed',
  'page.holding', 'page.holdings', 'register.gold_rates', 'register.holding_buys',
  'rule.gold_rate_old', 'rule.holdings_buy', 'rule.holdings_cost', 'rule.holdings_price_old', 'rule.holdings_rate', 'script.holdings_cost', 'script.holdings_twin',
  /* AND SINCE 3.2.0 THE GOLD FEED, the nightly script that writes a world gold rate, off until a source is picked. */
  'script.holdings_gold_feed',
];

/** The pack's kinds since 2.0.0: the four 1.x kinds, then gold, funds and shares, appended so no old word moves. */
const KINDS = ['certificate', 'policy', 'commodity', 'other', 'gold', 'fund', 'stock'];

/** What a row is and what happened to it, as bytes, so "untouched" is a comparison and not a reading. */
const snapshot = (k: Kernel, ids: readonly string[]): string[] => ids.map((id) => JSON.stringify([k.get(id), k.history(id)]));

test('THE PACK DECLARES ITS LIST UNDER ITS OWN NAME, with the four 1.x kinds first and gold, funds and shares after them', async () => {
  const doc = holdingsFile() as unknown as Doc;
  assert.equal(doc.pack, 'holdings');
  /* 3.3.0 SINCE round 1030: gold valued from the newest rate of any karat, and the rate box beside the gold rates. 3.7.2
     SINCE 3 November (3ea2e541c), through what has no price or no cost left out of the figures (d60db4101, 1767124b5). */
  assert.equal(doc.version, '3.7.2');
  const lists = doc.declarations.filter((d) => typeof d.register === 'string' && d.rule === undefined);
  assert.deepEqual(lists.map((d) => [d.register, d.pack]), [['holdings', 'holdings'], ['holding_buys', 'holdings'], ['gold_rates', 'holdings']]);
  const kind = (lists[0]!.fields as Field[]).find((f) => f.id === 'kind')!;
  assert.deepEqual(kind.values, KINDS);
  /* EVERY FIELD 1.0.0 DECLARED, WHICH A RECORD ON money-core 2.0.0 WAS FIRST OFFERED, IS STILL ONE, of the same type. */
  const now = lists[0]!.fields as Field[];
  for (const f of holdings100().declarations[0]!.fields as Field[]) assert.equal(now.find((g) => g.id === f.id)?.type, f.type, `${f.id} went or changed type`);
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

  /* THE PACK TAKES OVER WHAT IS ALREADY ITS OWN, AND SINCE 2.0.0 IT SHIPS GOLD ITSELF, so the record keeps no word of its own. */
  const take = await put(k, holdingsFile());
  assert.deepEqual(take.conflicts, []);
  assert.deepEqual(take.adds.map((a) => [a.id, a.handed ?? false]).sort(), [['register.holdings', true], ...BESIDE.map((id) => [id, false])].sort());
  assert.deepEqual(take.kept.map((x) => [x.id, x.adds]), []);

  assert.deepEqual(kinds(k), KINDS);
  assert.deepEqual(snapshot(k, ids), before, 'a row, its id or its history moved');
  assert.equal(k.count('holdings'), 14);
  const packs = k.packs().filter((p) => p.id === 'holdings' || p.id === 'money-core').map((p) => [p.id, p.version]);
  assert.deepEqual(packs, [['holdings', '3.7.2'], ['money-core', FIRST_PARTY_VERSIONS['money-core']]]);

  /* AND THE RECORD GOES ON TAKING GOLD, now the pack's word, and every 1.x kind. */
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
  assert.deepEqual(kinds(k), KINDS);
  assert.deepEqual(snapshot(k, ids), before);
  sql.close();
});

test('A RECORD THAT NEVER HELD THE LIST IS OFFERED GOLD BY THE PACK, and a lot of it goes in as gold', async () => {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, firstPartyDocument(id));
  assert.equal(k.register('holdings'), undefined, 'money-core still brings the list');
  await put(k, holdingsFile());

  assert.deepEqual(kinds(k), KINDS);
  const gold = k.create('holdings', { ...HELD_AT_1_8_0[1]! } as never, { actor: 'p_1' });
  assert.ok(gold.ok, sayOf(gold));
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
  assert.deepEqual(kinds(k), KINDS);
  sql.close();
});

/**
 * AN EMPTY LIST IS NOT HANDED WHEN THE RECORD CAN SAY SO. A handover keeps what somebody relies on, and a list with no
 * rows in it holds nothing to keep (`declare`'s plan, `inUse`). So a record that fills `used` has it retired by the
 * update, and the pack installs it afresh: the pack's own kinds and nothing kept of 1.8.0's.
 */
test('AN EMPTY HOLDINGS WITH `used` FILLED IS RETIRED, NOT HANDED, and the pack then declares it afresh with its own kinds', async () => {
  const { k, sql } = await on180(0);
  const update = await put(k, shippedUpdate(), []);
  assert.deepEqual(update.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 0, to: undefined }]);
  assert.equal(k.register('holdings'), undefined, 'the empty list outlived the update');

  const take = await put(k, holdingsFile());
  assert.deepEqual(take.adds.filter((a) => a.id === 'register.holdings').map((a) => [a.id, a.handed ?? false]), [['register.holdings', false]]);
  assert.deepEqual(take.kept, []);
  assert.deepEqual(kinds(k), KINDS);
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
