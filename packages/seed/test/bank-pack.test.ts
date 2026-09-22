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
import { USE_CASES, useCaseDocument } from '../src/usecases/index.ts';

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

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
});

async function planOf(k: Kernel, doc: unknown): Promise<{ pack: Pack; diff: Diff }> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  return { pack, diff: await plan(pack, stateOf(k)) };
}

async function put(k: Kernel, doc: unknown): Promise<Diff> {
  const { pack, diff } = await planOf(k, doc);
  value(await install(pack, diff, hostFor(k), diff.planHash));
  return diff;
}

/**
 * money-core AS 1.7.0 SHIPPED IT: today's document with the twelve wordings put back under `pack: 'money-core'`. Built
 * rather than read from a fixture because the only thing the two versions differ by is those twelve, and
 * `pack-versions.test.ts` holds 1.7.0's own fingerprint.
 */
const v170 = (): Doc => {
  const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  d.version = '1.7.0';
  /* 1.7.0 handed nothing: the twelve were its own. */
  delete (d as { hands?: unknown }).hands;
  const hsbc = [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)].map((i) => ({ ...structuredClone(i), pack: 'money-core' }));
  d.declarations = [...d.declarations.filter((x) => !HSBC.includes(`ingest.${String(x.ingest)}`)), ...(hsbc as unknown as Body[])];
  return d;
};

test('MONEY-CORE DECLARES ONLY THE TWO GENERIC CARD WORDINGS, a minor step above 1.7.0', () => {
  assert.deepEqual(ingestsOf(firstPartyDocument('money-core')), GENERIC);
  /* MINOR BY `first-party.ts`'s OWN RULE, which asks a major step for a list or a field taken away. No list and no field
     moves: every register the patterns write stays, and 1.4.0 already took two figures away as a minor step. */
  assert.equal(FIRST_PARTY_VERSIONS['money-core'], '1.8.0');
  /* AND IT HANDS THE TWELVE TO THE BANK PACK rather than retiring them, so a token minted for one survives the move. */
  assert.deepEqual(firstPartyDocument('money-core')!.hands, MONEY_CORE_HANDS);
});

test('THE PACK DECLARES EXACTLY THE TWELVE, needs money-core 1.8.0, and is not a first-party module', async () => {
  const doc = bankHsbcEgPack() as unknown as Doc;
  assert.equal(doc.pack, 'bank-hsbc-eg');
  assert.equal(doc.version, BANK_HSBC_EG_VERSION);
  assert.deepEqual(ingestsOf(doc), HSBC);
  assert.deepEqual(doc.requires.packs, { 'money-core': '^1.8.0' });
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
     so the plan also has to carry the missing step, which is what `^1.8.0` is for. */
  const early = (await planOf(k, bankHsbcEgPack())).diff;
  assert.deepEqual(early.conflicts.map((c) => c.id).sort(), HSBC);
  assert.deepEqual(early.requires.packs, [{ id: 'money-core', range: '^1.8.0', installed: '1.7.0', ok: false }]);

  /* THE UPDATE HANDS THE TWELVE TO THE BANK PACK AND IS NOT REFUSED. An ingest has no rows, so nothing is orphaned. */
  const update = await put(k, firstPartyDocument('money-core'));
  assert.deepEqual(update.conflicts, []);
  assert.deepEqual(update.retires.map((r) => r.id).sort(), HSBC);
  for (const r of update.retires) assert.equal(r.to, 'bank-hsbc-eg', `${r.id} is handed, not retired`);
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
