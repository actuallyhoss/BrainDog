/**
 * money-core as earlier versions shipped it, and the pack path the tests beside it drive a record through.
 *
 * NOT A TEST FILE, AND THE NAME SAYS SO: the glob is `*.test.ts`, so this is read only by the two files that import it,
 * `money-core-major.test.ts` and `holdings-pack.test.ts`. Both need a record on money-core 1.8.0 AFTER money-core has
 * moved on, and the only way to have one is to build the 1.8.0 document back out of today's.
 *
 * BUILT, NOT A FIXTURE FILE, because 1.8.0 and 2.0.0 differ by one declaration. `register.holdings` below is the body
 * 1.8.0 shipped, read out of `firstPartyDocument('money-core')` on 23 September before `holdings` left, and
 * `money-core-major.test.ts` proves the rebuilt document is 1.8.0 rather than something near it: its fingerprint is
 * `8bcd20187c61cf1b`, the value `pack-versions.test.ts` recorded for `money-core@1.8.0`.
 */

import assert from 'node:assert/strict';

import { install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW } from '../src/index.ts';
import { handingAsShipped } from './pack-files.ts';

export type Body = Record<string, unknown>;
export type Doc = { pack: string; version: string; requires: { packs: Record<string, string> }; declarations: Body[]; hands?: Record<string, string>; config?: unknown };

export const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * `register.holdings` AS money-core 1.5.0 TO 1.8.0 DECLARED IT, with `gold` first among its kinds and money-core as its
 * pack. Written out whole: every key, in the order the document carried them, because the fingerprint below is a hash of
 * these bytes and a reordered key is a different document.
 */
export const HOLDINGS_1_8_0: Body = {
  register: 'holdings',
  name: 'Holdings',
  icon: 'money',
  one: 'holding',
  holds: 'what you hold rather than spend: gold, certificates and policies, with what each one cost and when it matures',
  title: 'label',
  mobile: ['label', 'qty', 'unit_cost'],
  pack: 'money-core',
  fields: [
    { id: 'label', label: 'Description', type: 'text', required: true, search: true },
    { id: 'kind', label: 'Type', type: 'enum', values: ['gold', 'certificate', 'policy', 'other'], index: true, required: true, search: true },
    { id: 'qty', label: 'How many', type: 'decimal', min: 0, required: true, qualifies: 'unit_cost' },
    { id: 'unit_cost', label: 'Cost each', type: 'money', required: true },
    { id: 'acquired_on', type: 'day', index: true },
    { id: 'matures_on', type: 'day', index: true },
    { id: 'note', type: 'text' },
    { id: 'tags', type: 'list', of: 'text' },
  ],
};

export type Held = { kind: string; label: string; qty: number; unit_cost: { amount: number; currency: string }; acquired_on: string; matures_on?: string; note?: string };

const egp = (minor: number): { amount: number; currency: string } => ({ amount: minor, currency: 'EGP' });
const usd = (minor: number): { amount: number; currency: string } => ({ amount: minor, currency: 'USD' });

/**
 * FOURTEEN ROWS OF THE SHAPE AN IMPORTED RECORD'S `holdings` TAKES ON money-core 1.8.0: eleven lots of gold under the
 * kind `gold`, a certificate and two policies. EVERY VALUE IS INVENTED. The first version of this list copied a real
 * record's holdings, lots, costs, dates, policy numbers and cover included, into a tree anybody can read, and it was
 * replaced on September 25th with rows of the same kinds, count and currencies, which is all the tests beside it read.
 *
 * ONE ROW A LOT AND NOT ONE ROW A METAL, because that is what an import writes and because lots are bought at different
 * prices on different days. Adding them into one "units of gold" row loses the only thing that makes a cost a cost,
 * which is the day it was paid.
 */
export const HELD_AT_1_8_0: readonly Held[] = [
  { kind: 'certificate', label: 'Term deposit certificate', qty: 1, unit_cost: egp(2_500_000), acquired_on: '2025-10-12', matures_on: '2027-10-12', note: 'Two years.' },
  { kind: 'gold', label: 'Gold 21c', qty: 2, unit_cost: egp(412_000), acquired_on: '2025-02-10' },
  { kind: 'gold', label: 'Gold 21c', qty: 3, unit_cost: egp(418_500), acquired_on: '2025-03-21' },
  { kind: 'gold', label: 'Gold 21c', qty: 1, unit_cost: egp(421_000), acquired_on: '2025-04-03' },
  { kind: 'gold', label: 'Gold 21c', qty: 4, unit_cost: egp(430_200), acquired_on: '2025-06-09' },
  { kind: 'gold', label: 'Gold 21c', qty: 2, unit_cost: egp(452_700), acquired_on: '2025-08-15' },
  { kind: 'gold', label: 'Gold 21c', qty: 6, unit_cost: egp(468_000), acquired_on: '2025-09-30' },
  { kind: 'gold', label: 'Gold 21c', qty: 2, unit_cost: egp(471_300), acquired_on: '2025-12-01' },
  { kind: 'gold', label: 'Gold 21c', qty: 3, unit_cost: egp(489_900), acquired_on: '2026-01-19' },
  { kind: 'gold', label: 'Gold 21c', qty: 1, unit_cost: egp(503_400), acquired_on: '2026-03-05' },
  { kind: 'gold', label: 'Gold 21c', qty: 2, unit_cost: egp(497_600), acquired_on: '2026-05-22' },
  { kind: 'gold', label: 'Gold 21c', qty: 4, unit_cost: egp(515_000), acquired_on: '2026-06-30' },
  { kind: 'policy', label: 'Life policy LP-40217', qty: 1, unit_cost: usd(15_000), acquired_on: '2025-08-01', matures_on: '2050-08-01', note: 'Whole-life cover. USD 30,000.00 sum assured.' },
  { kind: 'policy', label: 'Life policy LP-40388', qty: 1, unit_cost: usd(8_500), acquired_on: '2026-02-14', matures_on: '2046-02-14', note: 'Term cover. USD 20,000.00 sum assured.' },
];

/**
 * Today's money-core document less what 2.1.0 and 2.2.0 added, which is `available` and `pairs:` on
 * `register.transactions`, so the two rebuilds below stay the releases they name. Without either the 1.8.0 rebuild's
 * fingerprint moved off the one `pack-versions.test.ts` recorded for 1.8.0, measured when each landed: `pairs:` alone read
 * `7e991afc1e7d11aa` against `8bcd20187c61cf1b` on 24 September. `pairs:` is taken off whole, so its `where:` gaining
 * `party` and `settles` at 2.2.0, and `settles` loosened to `settles is empty or transfer is true` at 2.3.0, needs
 * nothing here: `money-core-major.test.ts` still read `8bcd20187c61cf1b` off the 1.8.0 rebuild after 2.3.0 landed. What
 * 2.4.0 added is taken off first, by `before240` below.
 */
function asShipped(doc: unknown): Doc {
  const d = before240(doc);
  d.declarations = d.declarations.map((x) => {
    if (x.register !== 'transactions' || !Array.isArray(x.fields)) return x;
    const { pairs: _pairs, ...earlier } = x;
    return { ...earlier, fields: (x.fields as Body[]).filter((f) => f.id !== 'available') };
  });
  return d;
}

/**
 * Today's money-core document less what 2.4.0 added: the `ends` field on `register.obligations`, and `ends: 'ends'` on
 * the obligations leg of each walk `page.money` draws. Every release before 2.4.0 is built on top of this.
 *
 * TAKEN OFF BY ID AND KEY, NOT BY POSITION, so the fields and the leg's keys keep the order the release carried them in,
 * which is what the fingerprint hashes. Measured on 24 September: `asMoneyCore230` read `8ad733c726f4fd0b` after 2.4.0
 * landed, the value `pack-versions.test.ts` holds for 2.3.0, and the 1.8.0 rebuild still read `8bcd20187c61cf1b`.
 */
function before240(doc: unknown): Doc {
  const d = structuredClone(doc) as Doc;
  d.declarations = d.declarations.map((x) => {
    if (x.register === 'obligations' && Array.isArray(x.fields)) return { ...x, fields: (x.fields as Body[]).filter((f) => f.id !== 'ends') };
    if (x.page !== 'money' || !Array.isArray(x.blocks)) return x;
    return {
      ...x,
      blocks: (x.blocks as Body[]).map((b) =>
        Array.isArray(b.from) ? { ...b, from: (b.from as Body[]).map((leg) => (leg.register === 'obligations' ? (({ ends: _ends, ...rest }) => rest)(leg) : leg)) } : b,
      ),
    };
  });
  return d;
}

/** A money-core document as 2.3.0, the release before `ends`, with the `hands` it shipped with: see `before240`. */
export function asMoneyCore230(doc: unknown): Doc {
  const d = handingAsShipped(before240(doc));
  d.version = '2.3.0';
  return d;
}

/**
 * A money-core document as 1.8.0: `holdings` back after `accounts`, where 1.8.0 carried it, and not handed anywhere.
 * The bank's twelve are handed, as 1.8.0 first handed them; today's document hands nothing (`pack-files.ts`).
 */
export function asMoneyCore180(doc: unknown): Doc {
  const d = handingAsShipped(asShipped(doc), { holdings: false });
  d.version = '1.8.0';
  const rest = d.declarations.filter((x) => x.register !== 'holdings');
  const at = rest.findIndex((x) => x.register === 'accounts') + 1;
  assert.ok(at > 0, 'money-core no longer declares accounts, so there is nowhere to put holdings back');
  d.declarations = [...rest.slice(0, at), structuredClone(HOLDINGS_1_8_0), ...rest.slice(at)];
  return d;
}

/**
 * A money-core document as 2.0.0: `holdings` out and handed to the pack of that name, beside the bank's twelve. Today's
 * document declares the same and hands nothing, so this puts back the `hands` 2.0.0 shipped with.
 */
export function asMoneyCore200(doc: unknown): Doc {
  const d = handingAsShipped(asShipped(doc));
  d.version = '2.0.0';
  d.declarations = d.declarations.filter((x) => x.register !== 'holdings');
  return d;
}

export async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
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

export async function planOf(k: Kernel, doc: unknown, used?: readonly string[]): Promise<{ pack: Pack; diff: Diff }> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  return { pack, diff: await plan(pack, stateOf(k, used)) };
}

/**
 * Plan and install, and the refusal as it came when there is one, so a test can read a refusal as well as a success.
 * Every line the plan asks to be approved is approved, as the owner pressing Install does: a Mercury pull calls a bank
 * and was measured `REQUIRED_MISSING` "calls other services" without it.
 */
export async function attempt(k: Kernel, doc: unknown, used?: readonly string[]): Promise<{ diff: Diff; out: { ok: boolean; refusal?: { code: string; fix: string; at?: string } } }> {
  const { pack, diff } = await planOf(k, doc, used);
  return { diff, out: (await install(pack, diff, hostFor(k), diff.planHash, diff.approve)) as never };
}

export async function put(k: Kernel, doc: unknown, used?: readonly string[]): Promise<Diff> {
  const { diff, out } = await attempt(k, doc, used);
  value(out);
  return diff;
}
