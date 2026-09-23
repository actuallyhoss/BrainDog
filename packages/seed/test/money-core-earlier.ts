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
 * THE FOURTEEN ROWS THE OLD TOOL'S `money.assets` HOLDS, as a record on money-core 1.8.0 took them: eleven lots of gold
 * under the kind `gold`, a certificate and two policies. Read live on 2026-09-21 through `money_overview`.
 *
 * ONE ROW A LOT AND NOT ONE ROW A METAL, because that is what the source says and because the lots were bought at nine
 * different prices between May 2025 and July 2026: EGP 5,373.00 a unit on the first and EGP 8,336.00 on the dearest.
 * Adding them into "80 units of gold" loses the only thing that makes a cost a cost, which is the day it was paid.
 */
export const HELD_AT_1_8_0: readonly Held[] = [
  { kind: 'certificate', label: 'Saving Certificate', qty: 1, unit_cost: egp(10_000_000), acquired_on: '2025-11-05', matures_on: '2028-11-05', note: 'Three years.' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(537_300), acquired_on: '2025-05-02' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(529_000), acquired_on: '2025-05-14' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(558_000), acquired_on: '2025-06-18' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(558_500), acquired_on: '2025-06-18' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(794_800), acquired_on: '2026-03-27' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(827_800), acquired_on: '2026-04-02' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(833_600), acquired_on: '2026-04-08' },
  { kind: 'gold', label: 'Gold 24c', qty: 10, unit_cost: egp(691_000), acquired_on: '2026-07-30' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(691_000), acquired_on: '2026-07-30' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(691_000), acquired_on: '2026-07-30' },
  { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost: egp(691_000), acquired_on: '2026-07-30' },
  { kind: 'policy', label: 'Northwind 5820614', qty: 1, unit_cost: usd(20_210), acquired_on: '2025-11-25', matures_on: '2052-11-25', note: 'Your Way For Protection Investment. USD 48,000.00 sum assured.' },
  { kind: 'policy', label: 'Northwind 5836271', qty: 1, unit_cost: usd(10_105), acquired_on: '2025-12-07', matures_on: '2062-12-07', note: 'Your Way For Protection Investment. USD 24,000.00 sum assured.' },
];

/**
 * Today's money-core document less what 2.1.0 added, which is `available` on `register.transactions`, so the two rebuilds
 * below stay the releases they name. Without it the 1.8.0 rebuild's fingerprint moved off the one `pack-versions.test.ts`
 * recorded for 1.8.0, measured when the field landed.
 */
function asShipped(doc: unknown): Doc {
  const d = structuredClone(doc) as Doc;
  d.declarations = d.declarations.map((x) =>
    x.register === 'transactions' && Array.isArray(x.fields) ? { ...x, fields: (x.fields as Body[]).filter((f) => f.id !== 'available') } : x,
  );
  return d;
}

/** A money-core document as 1.8.0: `holdings` back after `accounts`, where 1.8.0 carried it, and not handed anywhere. */
export function asMoneyCore180(doc: unknown): Doc {
  const d = asShipped(doc);
  d.version = '1.8.0';
  const rest = d.declarations.filter((x) => x.register !== 'holdings');
  const at = rest.findIndex((x) => x.register === 'accounts') + 1;
  assert.ok(at > 0, 'money-core no longer declares accounts, so there is nowhere to put holdings back');
  d.declarations = [...rest.slice(0, at), structuredClone(HOLDINGS_1_8_0), ...rest.slice(at)];
  if (d.hands) delete d.hands['register.holdings'];
  return d;
}

/**
 * A money-core document as 2.0.0: `holdings` out and handed to the pack of that name. Today's document already is one,
 * and this changes nothing in it; it exists so the same test reads the same record against the tree before the move.
 */
export function asMoneyCore200(doc: unknown): Doc {
  const d = asShipped(doc);
  d.version = '2.0.0';
  d.declarations = d.declarations.filter((x) => x.register !== 'holdings');
  d.hands = { ...(d.hands ?? {}), 'register.holdings': 'holdings' };
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
