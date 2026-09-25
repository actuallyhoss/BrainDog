/**
 * money-core 2.0.0: `holdings` leaves for a pack of its own, and the two packs that require money-core still install.
 *
 * WHY A MAJOR STEP. `first-party.ts` asks a major step for a list taken away, and `holdings` is one, so the version moves
 * from 1.8.0 to 2.0.0 (`loop/research-seed-roles.md` Brief H). The list is handed, not dropped (`hands`), so a record
 * that holds rows in it keeps them; `holdings-pack.test.ts` drives that. What this file holds is the rest of the step.
 *
 * R5 MEASURED THE COST OF THE STEP BEFORE IT WAS TAKEN, AND THIS FILE DRIVES IT. Two shipped packs required money-core
 * with a caret on 1.x, `bank-hsbc-eg` at `^1.8.0` and every Mercury pack at `^1.0.0`, and the range grammar has no `||`.
 * So at 2.0.0 neither installs, and the owner's own import proposes the bank pack. Both ranges are widened to
 * `>=1.x.0 <3.0.0` in the same change, each with a version step of its own, and both are planned here on a record at
 * 1.8.0 and on one at 2.0.0. The upper bound stays: 3.0.0 is another list taken away, and whether these two still read
 * right beside it is a question for that step rather than something to admit in advance.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { satisfies } from '@braindog/declare';

import { BANK_HSBC_EG_VERSION, FIRST_PARTY, FIRST_PARTY_VERSIONS, bankHsbcEgPack, firstPartyDocument } from '../src/index.ts';
import { asMoneyCore180, asMoneyCore200, attempt, planOf, put, record, type Doc } from './money-core-earlier.ts';

/**
 * The Mercury pack as it ships, with the marks that say what a person fills taken off.
 *
 * THE FILE AND NOT A BUILDER, SINCE THE BUILDER IS GONE. Mercury was a function in `src/packs/mercury.ts` until
 * September 24th (`loop/research-m3-dynamic.md` B7), and this test asked it for a document. What is planned below is
 * now the file a person installs, `packs/mercury/mercury.pack.json`, so the range and version asserted here are the
 * ones a record is actually handed. Its fill changes the names, the host and the key label and never the range or the
 * version, so the file as it ships answers every question this test asks.
 */
const mercuryFile = (): Record<string, unknown> => {
  const { fill: _marks, ...doc } = JSON.parse(readFileSync(new URL('../../../packs/mercury/mercury.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  return doc;
};

/** `pack-versions.test.ts`'s fingerprint, asked of a document built here. */
const fingerprint = (d: Doc): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null }))
    .digest('hex')
    .slice(0, 16);

/** A record holding every first-party pack, with money-core at the version the builder gives. */
async function onMoney(build: (doc: unknown) => Doc) {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, id === 'money-core' ? build(firstPartyDocument('money-core')) : firstPartyDocument(id));
  return { k, sql };
}

test('money-core IS ON 2.x, DECLARES NO HOLDINGS, AND HANDS THE LIST to the pack of that name', () => {
  const doc = firstPartyDocument('money-core') as unknown as Doc;
  /* ON 2.x AND NOT PINNED TO 2.0.0, since 2.1.0 added `available` to `register.transactions`: a minor step takes
     nothing away, so the holdings half of this test is as true of it as of 2.0.0. */
  assert.match(FIRST_PARTY_VERSIONS['money-core'], /^2\.\d+\.\d+$/u);
  assert.equal(doc.version, FIRST_PARTY_VERSIONS['money-core']);
  assert.deepEqual(
    doc.declarations.filter((d) => d.register === 'holdings').map((d) => (d.fields as { id: string; values?: string[] }[]).find((f) => f.id === 'kind')?.values),
    [],
    'money-core still declares register.holdings, with these kinds',
  );
  assert.equal(doc.hands?.['register.holdings'], 'holdings');
});

/**
 * NO FIRST-PARTY PACK SAYS GOLD, which is what `loop/DIRECTION.md` section 22 measured against the tree: a `holdings`
 * register with gold in its kinds, shipped to every record set up with Money. Asked of the documents a record installs,
 * so a word in a comment is not counted and a word in a `holds:` sentence is.
 */
test('NOTHING A FIRST-PARTY PACK SHIPS SAYS GOLD, in a kind or in the sentence over a list', () => {
  for (const id of FIRST_PARTY) assert.doesNotMatch(JSON.stringify(firstPartyDocument(id)), /gold/iu, id);
});

test('THE 1.8.0 THIS FILE BUILDS IS THE 1.8.0 THAT SHIPPED, by the fingerprint `pack-versions.test.ts` recorded for it', () => {
  assert.equal(fingerprint(asMoneyCore180(firstPartyDocument('money-core', { seeds: [] }))), '8bcd20187c61cf1b');
});

test('bank-hsbc-eg AND MERCURY PLAN CLEAN AND INSTALL on money-core 1.8.0 and on 2.0.0', async () => {
  for (const [at, build] of [['1.8.0', asMoneyCore180], ['2.0.0', asMoneyCore200]] as const) {
    for (const [name, doc] of [['bank-hsbc-eg', bankHsbcEgPack()], ['mercury', mercuryFile()]] as const) {
      const { k, sql } = await onMoney(build);
      const { diff } = await planOf(k, doc);
      assert.deepEqual(diff.requires.packs.filter((p) => !p.ok), [], `${name} on money-core ${at}`);
      assert.deepEqual(diff.conflicts, [], `${name} on money-core ${at}`);
      const { out } = await attempt(k, doc);
      assert.equal(out.ok, true, `${name} on money-core ${at}: ${out.refusal?.code} ${out.refusal?.fix}`);
      sql.close();
    }
  }
});

test('EACH RANGE MOVED WITH A VERSION OF ITS OWN, and neither admits a money-core 3.0.0 nobody has read them against', () => {
  /* MERCURY'S WIDER RANGE WAS A PATCH STEP, 1.0.1, AND THE REASON IS WHAT A RECORD HOLDS. Not one of its declarations
     moved: the bytes a record stages are the bytes it staged, and only which Money they may sit beside is wider.
     `first-party.ts`'s rule asks a minor step for something added and a major one for something taken away, and this
     is neither. It is 1.1.0 now by that same rule, because parity B4 (`e6d73bbd`) added to it: a ledger script that
     files Mercury's transactions, and a `mercury_id` field it `extends` transactions with. That is something added, so
     minor, and the range did not move with it, which is what the loop below still holds. bank-hsbc-eg is a minor step
     instead, 1.1.0, because its five twin doors gained `door:` on top of the wider range (one door, several patterns;
     wave forty-two), and 1.2.0 since `bank-card-used` reads and compares the limit its alert prints; the range did not
     move with it. */
  assert.equal(BANK_HSBC_EG_VERSION, '1.3.0');
  assert.equal(bankHsbcEgPack().version, '1.3.0');
  assert.equal(mercuryFile().version, '1.1.0');
  for (const [name, doc] of [['bank-hsbc-eg', bankHsbcEgPack()], ['mercury', mercuryFile()]] as const) {
    const range = (doc.requires as { packs: Record<string, string> }).packs['money-core']!;
    assert.deepEqual(['1.7.0', '1.8.0', '2.0.0', '2.9.0', '3.0.0'].filter((v) => satisfies(v, range)), name === 'mercury' ? ['1.7.0', '1.8.0', '2.0.0', '2.9.0'] : ['1.8.0', '2.0.0', '2.9.0'], name);
  }
});

/**
 * THE HALF OF R5 THAT WAS READ AND NOT DRIVEN, DRIVEN, AND NOW CLOSED. Only the installing pack's own `requires` was
 * checked (`packages/declare/src/index.ts`, `needs`), so a record already holding a pack that requires money-core
 * `^1.8.0` took money-core 2.0.0 without a word and was left holding a pack whose requirement was no longer met.
 *
 * MEASURED 23 SEPTEMBER: the update installed, nothing in its plan named `bank-hsbc-eg`, and `^1.8.0` was false of the
 * version the record then held. `f507cff5` taught `plan` the held packs' ranges (`dependents`), and it still installed
 * here, because this plan is built from `kernel.packs()` as the record builds it, and that answered each pack's id and
 * version and no `requires` (audit forty-two, finding 1). With `packs()` reading each range off the stored manifest, the
 * plan names the dependent it would strand and the update is refused before anything lands.
 */
test('THE HOLE R5 READ IS CLOSED: a record holding a pack on ^1.8.0 is refused money-core 2.0.0, naming that pack', async () => {
  const { k, sql } = await onMoney(asMoneyCore180);
  const old = { ...bankHsbcEgPack(), version: '1.0.0', requires: { format: 1, primitives: 1, packs: { 'money-core': '^1.8.0' } } };
  await put(k, old);
  const { diff, out } = await attempt(k, asMoneyCore200(firstPartyDocument('money-core')));
  assert.deepEqual(diff.dependents, [{ id: 'bank-hsbc-eg', version: '1.0.0', range: '^1.8.0', ok: false, was: true }], 'the plan does not name the dependent it strands');
  assert.equal(out.ok, false, 'money-core 2.0.0 installed under a pack that asks for ^1.8.0');
  assert.equal(out.refusal?.code, 'PACK_REQUIRED');
  assert.match(out.refusal?.fix ?? '', /bank-hsbc-eg/);
  assert.equal(k.packs().find((p) => p.id === 'bank-hsbc-eg')?.version, '1.0.0');
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, '1.8.0', 'the refused update moved money-core');

  /* AND THE SHIPPED PACK, INSTALLED BEFORE THE SAME UPDATE, STILL HAS WHAT IT ASKS FOR AFTER IT. */
  const { k: k2, sql: sql2 } = await onMoney(asMoneyCore180);
  await put(k2, bankHsbcEgPack());
  await put(k2, asMoneyCore200(firstPartyDocument('money-core')));
  const wants = (bankHsbcEgPack() as unknown as Doc).requires.packs['money-core']!;
  assert.equal(satisfies(k2.packs().find((p) => p.id === 'money-core')?.version ?? null, wants), true);
  sql.close();
  sql2.close();
});
