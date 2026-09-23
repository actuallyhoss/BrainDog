/**
 * One bank's wordings as a pack of their own (`packs/bank-hsbc-eg.ts`), and money-core without them.
 *
 * WHY THIS FILE EXISTS. money-core 1.7.0 declared sixteen ingests and twelve of them read one bank in one country:
 * `From HSBC:` lines, InstaPay transfers, a credit card alert that prints `*** 6180`. Every record set up as Personal,
 * Founder or Small business therefore carried them (`loop/research-shell-seed.md` M2), which is what
 * `loop/DIRECTION.md` section 22 says the core must not ship. The tests below hold the three things the move has to
 * get right at once: money-core stops declaring them, the pack declares exactly them, and a record that already had
 * them from money-core reaches the same readings through the update and one install, with nothing refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY, FIRST_PARTY_VERSIONS, NOW, firstPartyDocument } from '../src/index.ts';
import { BANK_HSBC_EG_VERSION, HSBC_EG_INGESTS, HSBC_EG_SMS_INGESTS, MONEY_CORE_HANDS, bankHsbcEgPack } from '../src/packs/bank-hsbc-eg.ts';
import { SAME_MOVEMENT, type SeedIngest } from '../src/modules/money.ts';
import { USE_CASES, useCaseDocument } from '../src/usecases/index.ts';
import { asMoneyCore180 } from './money-core-earlier.ts';

type Body = Record<string, unknown>;
type Doc = { pack: string; version: string; requires: { packs: Record<string, string> }; declarations: Body[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * THE TWELVE IDS ARE SPELLED OUT, for the reason `seed.test.ts` gives for its own list: a test that reads what it expects
 * from the constant the pack is built from passes when both lose the same pattern.
 */
const HSBC = [
  'ingest.bank-card-used', 'ingest.bank-card-used-sms', 'ingest.bank-from-in', 'ingest.bank-from-in-sms',
  'ingest.bank-from-out', 'ingest.bank-from-out-sms', 'ingest.bank-from-unsure', 'ingest.bank-from-unsure-sms',
  'ingest.bank-ipn-in', 'ingest.bank-ipn-in-sms', 'ingest.bank-ipn-out', 'ingest.bank-ipn-out-sms',
];
/** The two generic card wordings (`card ending 4471 was debited`) and their twins, which stay in money-core. */
const GENERIC = ['ingest.bank-card-in', 'ingest.bank-card-in-sms', 'ingest.bank-card-out', 'ingest.bank-card-out-sms'];

const ingestsOf = (doc: unknown): string[] =>
  ((doc as Doc).declarations ?? []).filter((d) => typeof d.ingest === 'string').map((d) => `ingest.${d.ingest}`).sort();

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

/** `used` is what the record says it has put to work; absent, as from a caller that cannot say, the plan hands everything. */
const stateOf = (k: Kernel, used?: readonly string[]): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  ...(used === undefined ? {} : { used }),
});

async function planOf(k: Kernel, doc: unknown, used?: readonly string[]): Promise<{ pack: Pack; diff: Diff }> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  return { pack, diff: await plan(pack, stateOf(k, used)) };
}

async function put(k: Kernel, doc: unknown, used?: readonly string[]): Promise<Diff> {
  const { pack, diff } = await planOf(k, doc, used);
  value(await install(pack, diff, hostFor(k), diff.planHash));
  return diff;
}

/**
 * money-core AS 1.7.0 SHIPPED IT: 1.8.0's document with the twelve wordings put back under `pack: 'money-core'`. Built
 * rather than read from a fixture because the only thing the two versions differ by is those twelve, and
 * `pack-versions.test.ts` holds 1.7.0's own fingerprint.
 *
 * FROM 1.8.0 (`asMoneyCore180`) AND NOT FROM TODAY'S FILE, because today's is 2.0.0 and has no `holdings`, which every
 * money-core from 1.5.0 carried. Built from today's, the record below was a 1.7.0 nobody ever had, and the update to
 * 2.0.0 never met the list it hands away.
 */
/**
 * One of the twelve as 1.7.0 declared it. `bank-card-used` has read the card's available limit into `available` and
 * compared it since bank-hsbc-eg 1.2.0, a field `register.transactions` holds only from money-core 2.1.0, so the body as
 * it is today, planted under a 1.7.0 whose transactions lack the field, sent the one alert below to `review` as
 * `transactions has no field called available`, measured when the field landed. 1.7.0 read neither.
 */
const asRead170 = (i: SeedIngest): SeedIngest => {
  if (i.extract?.available === undefined) return i;
  const { available: _limit, ...extract } = i.extract;
  return { ...i, extract, dedupe: SAME_MOVEMENT };
};

const v170 = (): Doc => {
  const d = asMoneyCore180(firstPartyDocument('money-core')) as unknown as Doc;
  d.version = '1.7.0';
  /* 1.7.0 handed nothing: the twelve were its own. */
  delete (d as { hands?: unknown }).hands;
  const hsbc = [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)].map((i) => asRead170({ ...structuredClone(i), pack: 'money-core' }));
  d.declarations = [...d.declarations.filter((x) => !HSBC.includes(`ingest.${String(x.ingest)}`)), ...(hsbc as unknown as Body[])];
  return d;
};

test('MONEY-CORE DECLARES ONLY THE TWO GENERIC CARD WORDINGS, and still hands the twelve at 2.0.0', () => {
  assert.deepEqual(ingestsOf(firstPartyDocument('money-core')), GENERIC);
  /* THE TWELVE LEFT AT 1.8.0, a minor step by `first-party.ts`'s own rule, since no list and no field moved;
     `pack-versions.test.ts` holds that version's fingerprint. 2.0.0 is the major step `holdings` leaving took, which is
     `holdings-pack.test.ts`'s to hold. */
  assert.equal(FIRST_PARTY_VERSIONS['money-core'].split('.')[0], '2');
  /* AND IT STILL HANDS THE TWELVE TO THE BANK PACK rather than retiring them, so a token minted for one survives the move
     even on a record that goes from 1.7.0 to 2.0.0 in one step. Beside them it hands one list, and nothing else. */
  const hands = firstPartyDocument('money-core')!.hands as Record<string, string>;
  assert.deepEqual(Object.fromEntries(Object.entries(hands).filter(([id]) => id.startsWith('ingest.'))), MONEY_CORE_HANDS);
  assert.deepEqual(Object.fromEntries(Object.entries(hands).filter(([id]) => !id.startsWith('ingest.'))), { 'register.holdings': 'holdings' });
});

test('THE PACK DECLARES EXACTLY THE TWELVE, needs money-core 1.8.0 or later before 3.0.0, and is not a first-party module', async () => {
  const doc = bankHsbcEgPack() as unknown as Doc;
  assert.equal(doc.pack, 'bank-hsbc-eg');
  assert.equal(doc.version, BANK_HSBC_EG_VERSION);
  assert.deepEqual(ingestsOf(doc), HSBC);
  /* `>=1.8.0 <3.0.0` SINCE 1.0.1: the caret it had at 1.0.0 admits no 2.0.0 (`bank-hsbc-eg.ts`). The floor is unmoved. */
  assert.deepEqual(doc.requires.packs, { 'money-core': '>=1.8.0 <3.0.0' });
  for (const d of doc.declarations) assert.equal(d.pack, 'bank-hsbc-eg', `${String(d.ingest)} still says it is money-core's`);
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  assert.deepEqual([...pack.manifest.provides].sort(), HSBC);
  assert.ok(!(FIRST_PARTY as readonly string[]).includes('bank-hsbc-eg'));
});

test('NO STARTER USE CASE INSTALLS IT: not one of them carries a `From HSBC:` pattern any more', () => {
  for (const u of USE_CASES) {
    const doc = JSON.stringify(useCaseDocument(u.usecase));
    assert.ok(!doc.includes('bank-hsbc-eg'), `${u.usecase} names the bank pack`);
    for (const m of u.modules) assert.deepEqual(ingestsOf(firstPartyDocument(m)).filter((i) => HSBC.includes(i)), [], `${u.usecase} installs ${m} with an HSBC wording`);
  }
});

test('A RECORD ON 1.7.0 UPDATES WITHOUT A REFUSAL, then takes the pack, and ends with the same sixteen doors', async () => {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, id === 'money-core' ? v170() : firstPartyDocument(id));
  const before = k.declarations().filter((d) => d.kind === 'ingest').map((d) => d.id).sort();
  assert.deepEqual(before, [...GENERIC, ...HSBC].sort());

  /* THE PACK FIRST IS REFUSED: beside 1.7.0 its twelve ids are money-core's. The conflict alone does not say what to do,
     so the plan also has to carry the missing step, which is what the floor of 1.8.0 is for. */
  const early = (await planOf(k, bankHsbcEgPack())).diff;
  assert.deepEqual(early.conflicts.map((c) => c.id).sort(), HSBC);
  assert.deepEqual(early.requires.packs, [{ id: 'money-core', range: '>=1.8.0 <3.0.0', installed: '1.7.0', ok: false }]);

  /* THE UPDATE HANDS THE TWELVE TO THE BANK PACK AND IS NOT REFUSED. An ingest has no rows, so nothing is orphaned. The
     update is today's 2.0.0, straight from 1.7.0, so it also hands `holdings` on: this plan names no `used`, and a plan
     that cannot say what is used hands everything, the empty list with it. */
  const update = await put(k, firstPartyDocument('money-core'));
  assert.deepEqual(update.conflicts, []);
  assert.deepEqual(update.retires.map((r) => r.id).sort(), [...HSBC, 'register.holdings'].sort());
  for (const r of update.retires) assert.equal(r.to, r.id === 'register.holdings' ? 'holdings' : 'bank-hsbc-eg', `${r.id} is handed, not retired`);
  assert.equal(update.orphans, 0);

  const bank = await put(k, bankHsbcEgPack());
  assert.deepEqual(bank.conflicts, []);
  assert.deepEqual(bank.adds.map((a) => a.id).sort(), HSBC);

  const after = k.declarations().filter((d) => d.kind === 'ingest');
  assert.deepEqual(after.map((d) => d.id).sort(), before);
  for (const d of after) assert.equal(d.pack_id, HSBC.includes(d.id) ? 'bank-hsbc-eg' : 'money-core', d.id);

  /* AND A LINE FROM THE BANK IS STILL CLAIMED BY ITS PATTERN, which is what the owner notices if this goes wrong. */
  const out = value<{ ingest: string | null }>(
    k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example' }, body: 'From HSBC: 16AUG26 ATM Cash Withdrawal from 042-118***-327 EGP 2500.00- Your available balance is EGP 31,040.25', sha256: 'bank-pack-1' }),
  );
  assert.equal(out.ingest, 'bank-from-out');
  sql.close();
});

/**
 * WHICH OF THE TWELVE THE RECORD HAS PUT TO WORK, as the record would say it: every ingest that has filed an arrival
 * (`ingest_receipt`), and whichever doors hold a token, which live in the record's own store and are named here.
 */
const usedOf = (sql: NodeSql, tokens: readonly string[] = []): string[] =>
  [...new Set([...sql.all<{ ingest_id: string }>('SELECT DISTINCT ingest_id FROM ingest_receipt').map((r) => `ingest.${r.ingest_id}`), ...tokens])].sort();

/**
 * money-core 1.8.0 HANDED ALL TWELVE ON EVERY RECORD THAT UPDATED, used or not (`loop/research-batch-thirty-four-audit.md`
 * §8). Measured by the audit's `hands.mts phantom`: after the update all twelve were live under `bank-hsbc-eg`, a pack
 * the owner never installed, `packStates` listed it as on at version `null`, a token minted for one of its doors, and a
 * fresh record on the same version had none of them. What the handover is for is a door somebody uses: a token his
 * Shortcut already posts to, or a pattern that has filed his money. A door nobody used has nothing to keep.
 */
test('A RECORD THAT NEVER USED THE TWELVE RETIRES THEM ON THE UPDATE, and holds no pack it never chose', async () => {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, id === 'money-core' ? v170() : firstPartyDocument(id));
  assert.deepEqual(usedOf(sql), []);

  /* AND THE EMPTY `holdings` WITH THEM: 2.0.0 hands the list, but nothing is written in it and `used` does not name it. */
  const update = await put(k, firstPartyDocument('money-core'), usedOf(sql));
  assert.deepEqual(update.retires.map((r) => [r.id, r.to]).sort(), [...HSBC, 'register.holdings'].sort().map((id) => [id, undefined]));
  assert.equal(update.orphans, 0);
  assert.deepEqual(k.declarations().filter((d) => HSBC.includes(d.id)), [], 'a door nobody used is still live');
  assert.deepEqual(k.packStates().filter((s) => s.id === 'bank-hsbc-eg'), [], 'the record reports a pack nobody installed');

  /* AND THE PACK STILL INSTALLS LATER, as twelve new doors rather than twelve taken over. */
  const bank = await put(k, bankHsbcEgPack(), usedOf(sql));
  assert.deepEqual(bank.conflicts, []);
  assert.deepEqual(bank.adds.map((a) => [a.id, a.handed ?? false]).sort(), HSBC.map((id) => [id, false]));
  sql.close();
});

/* AND THE DOOR A HANDED PATTERN NAMES GOES WITH IT. `bank-ipn-in-sms` names `door: bank-from-out-sms`, which filed
   nothing and holds no token, so `used` does not name it; retired, the pattern arrived under `bank-hsbc-eg` naming a
   door that was gone (`declare/test/door-follows-patterns.test.ts`). */
test('A DOOR THE RECORD USES IS HANDED, WITH THE DOOR IT NAMES, AND NOTHING ELSE: a pattern that filed a row, and a twin with a token', async () => {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, id === 'money-core' ? v170() : firstPartyDocument(id));
  /* THE ACCOUNT THE LINE NAMES, so the arrival files a row. Without it the line waits in review and has filed nothing. */
  value(k.create('accounts', { name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: '2026-08-01', liquid: false, last4: '6180' }, { actor: 'p_seed' }));
  const out = value<{ ingest: string | null; state: string; reason?: string }>(
    k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'HSBC' }, body: 'Your Credit Card ending with *** 6180 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP 23,715.50', sha256: 'bank-pack-used-1' }),
  );
  assert.deepEqual([out.ingest, out.state], ['bank-card-used', 'matched'], out.reason);
  const used = usedOf(sql, ['ingest.bank-ipn-in-sms']);
  assert.deepEqual(used, ['ingest.bank-card-used', 'ingest.bank-ipn-in-sms']);

  const handed = [...used, 'ingest.bank-from-out-sms'].sort();

  const update = await put(k, firstPartyDocument('money-core'), used);
  assert.deepEqual(
    update.retires.filter((r) => r.to !== undefined).map((r) => [r.id, r.to]),
    handed.map((id) => [id, 'bank-hsbc-eg']),
  );
  /* THE OTHER NINE RETIRE, and so does the empty `holdings` 2.0.0 hands, for the test above's reason. */
  assert.deepEqual(update.retires.filter((r) => r.to === undefined).map((r) => r.id).sort(), [...HSBC.filter((id) => !handed.includes(id)), 'register.holdings'].sort());
  assert.deepEqual(k.declarations().filter((d) => HSBC.includes(d.id)).map((d) => [d.id, d.pack_id]), handed.map((id) => [id, 'bank-hsbc-eg']));

  const bank = await put(k, bankHsbcEgPack(), usedOf(sql, ['ingest.bank-ipn-in-sms']));
  assert.deepEqual(bank.conflicts, []);
  assert.deepEqual(bank.adds.filter((a) => a.handed).map((a) => a.id).sort(), handed);
  assert.deepEqual([...new Set(k.declarations().filter((d) => HSBC.includes(d.id)).map((d) => d.pack_id))], ['bank-hsbc-eg']);
  sql.close();
});

/**
 * A HANDED LIST IS USED WHEN IT HAS ROWS, WHATEVER `used` NAMES, since `used` names doors and patterns and a list is put
 * to work by what is written in it. The two tests above hand only ingests, so the plan's `rows > 0` could be taken out
 * with every test in `declare` and `seed` still green, and a record whose `used` was empty then planned its gold as an
 * orphan of the giver's update. Built on money-core because it is the pack with a list that can be handed.
 */
test('A HANDED LIST WITH ROWS IS HANDED THOUGH `used` NAMES NOTHING, and an empty one is retired', async () => {
  const handing = (): Doc => {
    const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc & { hands?: Record<string, string> };
    d.version = '2.0.0';
    d.declarations = d.declarations.filter((x) => x.register !== 'holdings');
    d.hands = { ...(d.hands ?? {}), 'register.holdings': 'holdings-pack' };
    return d;
  };
  for (const rows of [0, 1]) {
    const { k, sql } = await record();
    /* ON 1.8.0, THE LAST money-core THAT DECLARES THE LIST. On today's the record has no `holdings`, and the 0-row case
       read `[undefined, undefined]` on 23 September because there was no retire to read. */
    for (const id of FIRST_PARTY) await put(k, id === 'money-core' ? asMoneyCore180(firstPartyDocument(id)) : firstPartyDocument(id));
    for (let i = 0; i < rows; i++)
      value(k.create('holdings', { label: 'Gold', kind: 'gold', qty: 1, unit_cost: { amount: 480000, currency: 'EGP' } }, { actor: 'p_seed' }));
    const { diff } = await planOf(k, handing(), []);
    const retire = diff.retires.find((r) => r.id === 'register.holdings');
    assert.deepEqual([retire?.rows, retire?.to], [rows, rows === 0 ? undefined : 'holdings-pack'], `${rows} rows`);
    assert.equal(diff.orphans, 0, `${rows} rows`);
    sql.close();
  }
});
