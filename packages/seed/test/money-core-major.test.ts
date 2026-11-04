/**
 * money-core 2.0.0: `holdings` leaves for a pack of its own, and the two packs that require money-core still install.
 *
 * WHY A MAJOR STEP. `first-party.ts` asks a major step for a list taken away, and `holdings` is one, so the version moves
 * from 1.8.0 to 2.0.0. The list is handed, not dropped (`hands`), so a record
 * that holds rows in it keeps them; `holdings-pack.test.ts` drives that. What this file holds is the rest of the step.
 *
 * THE COST OF THE STEP WAS MEASURED BEFORE IT WAS TAKEN, AND THIS FILE DRIVES IT. Two shipped packs required money-core
 * with a caret on 1.x, `bank-hsbc-eg` at `^1.8.0` and every Mercury pack at `^1.0.0`, and the range grammar has no `||`.
 * So at 2.0.0 neither installs, and an import may propose the bank pack. Both ranges are widened to
 * `>=1.x.0 <3.0.0` in the same change, each with a version step of its own, and both are planned here on a record at
 * 1.8.0 and on one at 2.0.0.
 *
 * AND AGAIN AT 3.0.0, WHICH ANSWERED THE QUESTION THE UPPER BOUND LEFT OPEN. 3.0.0 took two pages and the card wordings
 * away and kept every list, field and id the bank's pack and Mercury write, so each widened to `<4.0.0` in a patch step
 * of its own (bank-hsbc-eg 1.3.1, mercury-company 1.1.1, and count-cash 1.0.1 and stripe 1.0.1 beside them), and both are
 * planned here on the 3.0.0 the seed ships as well. The new upper bound stays for the same reason the old one did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { satisfies } from '@braindog/declare';

import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } from '../src/index.ts';
import { asMoneyCore180, asMoneyCore200, attempt, planOf, put, record, type Doc } from './money-core-earlier.ts';
import { bankHsbcEgFile, bankHsbcEgFile13 } from './pack-files.ts';

/**
 * The Mercury pack as it ships, with the marks that say what a person fills taken off.
 *
 * THE FILE AND NOT A BUILDER, SINCE THE BUILDER IS GONE. Mercury was a function in `src/packs/mercury.ts` once,
 * and this test asked it for a document. What is planned below is
 * now the file a person installs, `packs/mercury/mercury.pack.json`, so the range and version asserted here are the
 * ones a record is actually handed. Its fill changes the names, the host and the key label and never the range or the
 * version, so the file as it ships answers every question this test asks.
 */
const mercuryFile = (): Record<string, unknown> => {
  const { fill: _marks, ...doc } = JSON.parse(readFileSync(new URL('../../../packs/mercury/mercury.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  return doc;
};

/** A record holding every first-party pack, with money-core at the version the builder gives. */
async function onMoney(build: (doc: unknown) => Doc) {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, id === 'money-core' ? build(firstPartyDocument('money-core')) : firstPartyDocument(id));
  return { k, sql };
}

test('money-core IS ON 2.0.0 OR LATER AND DECLARES NO HOLDINGS, and the 2.0.0 that took it out handed the list to the pack of that name', () => {
  const doc = firstPartyDocument('money-core') as unknown as Doc;
  /* ON 2.0.0 OR LATER AND NOT PINNED TO 2.0.0, since 2.1.0 added `available` to `register.transactions`, and 3.0.0
     took pages and card wordings and gave no list back: the holdings half of this test is as true of each as of 2.0.0. */
  assert.equal(satisfies(FIRST_PARTY_VERSIONS['money-core'], '>=2.0.0'), true, FIRST_PARTY_VERSIONS['money-core']);
  assert.equal(doc.version, FIRST_PARTY_VERSIONS['money-core']);
  assert.deepEqual(
    doc.declarations.filter((d) => d.register === 'holdings').map((d) => (d.fields as { id: string; values?: string[] }[]).find((f) => f.id === 'kind')?.values),
    [],
    'money-core still declares register.holdings, with these kinds',
  );
  /* THE HANDOVER IS 2.0.0's AS IT SHIPPED, NOT TODAY'S DOCUMENT'S. money-core stopped naming other packs under 2.4.0
     (`money-core-names-no-pack.test.ts`), so the rebuilt 2.0.0 carries the `hands` it had, and today's carries none. */
  assert.equal(asMoneyCore200(doc).hands?.['register.holdings'], 'holdings');
  assert.equal(doc.hands, undefined);
});

/**
 * NO FIRST-PARTY PACK SAYS GOLD, which was measured against the tree: a `holdings`
 * register with gold in its kinds, shipped to every record set up with Money. Asked of the documents a record installs,
 * so a word in a comment is not counted and a word in a `holds:` sentence is.
 */
test('NOTHING A FIRST-PARTY PACK SHIPS SAYS GOLD, in a kind or in the sentence over a list', () => {
  /* BUT NET WORTH IN GRAMS OF GOLD, a unit and not a holding (money-core 3.31.0, the money-parity plan's "net worth in
     stable units"): Snapshots keeps `worth_gold` beside `worth_usd`, and it is the one word of gold a pack may ship. */
  const UNIT = '{"id":"worth_gold","label":"Net worth in grams of gold","type":"decimal"}';
  for (const id of FIRST_PARTY) assert.doesNotMatch(JSON.stringify(firstPartyDocument(id)).replace(UNIT, ''), /gold/iu, id);
});

/* NO FINGERPRINT TEST FOR THE REBUILT 1.8.0 ANY MORE. It held `asMoneyCore180` to `8bcd20187c61cf1b`, the value
   `pack-versions.test.ts` still records for `money-core@1.8.0`, until 3.0.0 took pages, card wordings, ingests and the
   money ceilings' defaults away, which the rebuild in `money-core-earlier.ts` cannot put back. The rebuilt 1.8.0 is now
   held to what the tests here ask of it (`holdings` back, the bank's twelve handed, the dependents planned), not to its
   bytes. */

/**
 * BANK-HSBC-EG MOVED ITS FLOOR TO MONEY-CORE 3.0.0 AT 1.4.0 (balance reading), and MERCURY TO 3.1.0 AT 1.3.0, so
 * neither shipped file plans clean on 1.8.0 or 2.0.0 any more. The frozen `bank-hsbc-eg-1.3.1.json` (its floor was
 * still 1.8.0) stands in for the bank pack on those two; Mercury has no such frozen file and is planned only on the
 * money-core the seed ships.
 */
test('bank-hsbc-eg PLANS CLEAN AND INSTALLS on money-core 1.8.0 and on 2.0.0 (frozen at 1.3.1); BOTH PACKS DO on the one the seed ships', async () => {
  const shipped = (doc: unknown): Doc => doc as Doc;
  for (const [at, build] of [['1.8.0', asMoneyCore180], ['2.0.0', asMoneyCore200]] as const) {
    const { k, sql } = await onMoney(build);
    const { diff } = await planOf(k, bankHsbcEgFile13());
    assert.deepEqual(diff.requires.packs.filter((p) => !p.ok), [], `bank-hsbc-eg on money-core ${at}`);
    assert.deepEqual(diff.conflicts, [], `bank-hsbc-eg on money-core ${at}`);
    const { out } = await attempt(k, bankHsbcEgFile13());
    assert.equal(out.ok, true, `bank-hsbc-eg on money-core ${at}: ${out.refusal?.code} ${out.refusal?.fix}`);
    sql.close();
  }
  for (const [name, doc] of [['bank-hsbc-eg', bankHsbcEgFile()], ['mercury', mercuryFile()]] as const) {
    const { k, sql } = await onMoney(shipped);
    const { diff } = await planOf(k, doc);
    assert.deepEqual(diff.requires.packs.filter((p) => !p.ok), [], `${name} on money-core ${FIRST_PARTY_VERSIONS['money-core']}`);
    assert.deepEqual(diff.conflicts, [], `${name} on money-core ${FIRST_PARTY_VERSIONS['money-core']}`);
    const { out } = await attempt(k, doc);
    assert.equal(out.ok, true, `${name} on money-core ${FIRST_PARTY_VERSIONS['money-core']}: ${out.refusal?.code} ${out.refusal?.fix}`);
    sql.close();
  }
});

test('EACH RANGE MOVED WITH A VERSION OF ITS OWN, and neither admits a money-core 4.0.0 nobody has read them against', () => {
  /* MERCURY'S WIDER RANGE WAS A PATCH STEP, 1.0.1, AND THE REASON IS WHAT A RECORD HOLDS. Not one of its declarations
     moved: the bytes a record stages are the bytes it staged, and only which Money they may sit beside is wider.
     `first-party.ts`'s rule asks a minor step for something added and a major one for something taken away, and this
     is neither. It is 1.1.0 now by that same rule, because `e6d73bbd` added to it: a ledger script that
     files Mercury's transactions, and a `mercury_id` field it `extends` transactions with. That is something added, so
     minor, and the range did not move with it, which is what the loop below still holds. bank-hsbc-eg is a minor step
     instead, 1.1.0, because its five twin doors gained `door:` on top of the wider range (one door, several patterns),
     and 1.2.0 since `bank-card-used` reads and compares the limit its alert prints; the range did not
     move with it. The widening to `<4.0.0` beside money-core 3.0.0 is a patch step on each, 1.3.1 and 1.1.1, by the
     same reason as Mercury's 1.0.1: no declaration moved.

     Mercury is 1.2.0, a minor step for its ledger script counting money once, and the range did not
     move with it. bank-hsbc-eg's FLOOR MOVES TO money-core 3.0.0 AT 1.4.0, because `bank-balance` and its webhook
     twin read balances and `balance_after`, which exist only from 3.0.0. Mercury's floor moves to 3.1.0 at 1.3.0 for
     the same reason, over the `book` setting money-core 3.1.0's books add. The file is `mercury` 1.0.0, a
     new id with the settings where its fill was, and the range it carried as mercury-company 1.3.0 carried over;
     1.0.1 rewords two comments in its ledger script and moves no range.

     bank-hsbc-eg IS 1.5.0 NOW, another minor step, because two new twin doors, `bank-ipn-out` and its
     `bank-ipn-out-sms` twin, gained `door: 'bank-from-out-sms'` beside the five already there; the range did not
     move with them either. */
  /* AND IN BATCH 17 EACH KEEPS THE PAYEE AS ITS SOURCE WROTE IT, bank-hsbc-eg 1.6.0 and mercury 1.1.0, minor steps. Both
     floors move to money-core 3.10.0, which declares `counterparty_text` on the ledger that each now writes: laid by
     each pack it was `PROVIDES_CONFLICT` against money-core and between any two of them. */
  assert.equal(bankHsbcEgFile().version, '1.7.3');
  /* AND MERCURY 1.2.0 (batch 42): its accounts met by name on first contact, a minor step of its own, with no
     floor of money-core moved. */
  /* AND MERCURY 1.3.0 (SHL-A23): it marks each account it keeps with money-core's `no_feed`, which 3.31.0 declares, so
     its floor moves there. */
  /* 1.3.1 SINCE 3 November (the plugin words, nothing else). */
  assert.equal(mercuryFile().version, '1.3.1');
  for (const [name, doc, held] of [['bank-hsbc-eg', bankHsbcEgFile(), ['3.10.0', '3.31.0']], ['mercury', mercuryFile(), ['3.31.0']]] as const) {
    const range = (doc.requires as { packs: Record<string, string> }).packs['money-core']!;
    assert.deepEqual(
      ['1.7.0', '1.8.0', '2.0.0', '2.9.0', '3.0.0', '3.9.0', '3.10.0', '3.31.0', '4.0.0'].filter((v) => satisfies(v, range)),
      [...held],
      name,
    );
  }
});

/**
 * THE HALF OF THE COST THAT WAS READ AND NOT DRIVEN, DRIVEN, AND NOW CLOSED. Only the installing pack's own `requires` was
 * checked (`packages/declare/src/index.ts`, `needs`), so a record already holding a pack that requires money-core
 * `^1.8.0` took money-core 2.0.0 without a word and was left holding a pack whose requirement was no longer met.
 *
 * MEASURED: the update installed, nothing in its plan named `bank-hsbc-eg`, and `^1.8.0` was false of the
 * version the record then held. `f507cff5` taught `plan` the held packs' ranges (`dependents`), and it still installed
 * here, because this plan is built from `kernel.packs()` as the record builds it, and that answered each pack's id and
 * version and no `requires`. With `packs()` reading each range off the stored manifest, the
 * plan names the dependent it would strand and the update is refused before anything lands.
 */
test('THE HOLE IN THE RANGE CHECK IS CLOSED: a record holding a pack on ^1.8.0 is refused money-core 2.0.0, naming that pack', async () => {
  const { k, sql } = await onMoney(asMoneyCore180);
  const old = { ...bankHsbcEgFile13(), version: '1.0.0', requires: { format: 1, primitives: 1, packs: { 'money-core': '^1.8.0' } } };
  await put(k, old);
  const { diff, out } = await attempt(k, asMoneyCore200(firstPartyDocument('money-core')));
  assert.deepEqual(diff.dependents, [{ id: 'bank-hsbc-eg', version: '1.0.0', range: '^1.8.0', ok: false, was: true }], 'the plan does not name the dependent it strands');
  assert.equal(out.ok, false, 'money-core 2.0.0 installed under a pack that asks for ^1.8.0');
  assert.equal(out.refusal?.code, 'PACK_REQUIRED');
  assert.match(out.refusal?.fix ?? '', /bank-hsbc-eg/);
  assert.equal(k.packs().find((p) => p.id === 'bank-hsbc-eg')?.version, '1.0.0');
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, '1.8.0', 'the refused update moved money-core');

  /* AND THE SHIPPED PACK, INSTALLED BEFORE THE SAME UPDATE, STILL HAS WHAT IT ASKS FOR AFTER IT. Frozen at 1.3.1,
     since the shipped 1.4.0 no longer plans clean on a 1.8.0 record (its floor moved to money-core 3.0.0). */
  const { k: k2, sql: sql2 } = await onMoney(asMoneyCore180);
  await put(k2, bankHsbcEgFile13());
  await put(k2, asMoneyCore200(firstPartyDocument('money-core')));
  const wants = (bankHsbcEgFile13() as unknown as Doc).requires.packs['money-core']!;
  assert.equal(satisfies(k2.packs().find((p) => p.id === 'money-core')?.version ?? null, wants), true);
  sql.close();
  sql2.close();
});
