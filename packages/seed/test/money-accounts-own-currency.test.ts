/**
 * MONEY'S ACCOUNTS TILE READS EACH ACCOUNT IN ITS OWN CURRENCY (REC-B23 job 1): on a record kept in pounds, a dollar
 * account is a part in dollars beside the pound account, never turned into pounds. Cash now itself is still one figure
 * in pounds, the dollars converted at the record's rate.
 *
 * HIS WORDS: "i want the headlines to be the money i have, not the money im due/owed" (`loop/scope/area-record-b.md`:
 * 1755-1760). `cash-by-account` groups by the name each account is called, a text that names no currency, so before
 * this every account was read in the home currency. A test only: no seed source moves, so money-core's fingerprint
 * stands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { BANKS } from '../../../fixtures/names.ts';
import { METRICS, NOW, day, firstPartyDocument } from '../src/index.ts';

const OWNER = { actor: 'p_test' };

type Group = { key: string; label?: string; value: number | null; parts?: { currency: string; amount: number }[] };
type Read = { value: number | null; unit: string | null; groups?: Group[] };
type Drawn = { kind: string; heading?: string; drawn?: boolean; refusals: readonly unknown[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};
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

/** A record holding money-core and what it points at, as its document says them, with no example entries. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }) as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

const POUNDS = `${BANKS[0]} current account`;
const DOLLARS = `${BANKS[1]} dollar account`;

test('A DOLLAR ACCOUNT IS A PART IN DOLLARS on Money’s Accounts tile, and Cash now is still one figure in pounds', async () => {
  const k = await fresh();
  value(k.setPackConfig('money-core', { home_currency: 'GBP' }, OWNER));
  /* EIGHTY PENCE A DOLLAR, a rate stated before the balances it converts. */
  value(k.create('fx', { currency: 'USD', base: 'GBP', rate: 0.8, as_of: day(-30) } as never, OWNER));
  value(k.create('accounts', { name: POUNDS, kind: 'bank', balance: { amount: 250_000, currency: 'GBP' }, as_of: day(0), liquid: true } as never, OWNER));
  value(k.create('accounts', { name: DOLLARS, kind: 'bank', balance: { amount: 294_795, currency: 'USD' }, as_of: day(0), liquid: true } as never, OWNER));

  const by = value<Read>(k.metric(METRICS['cash-by-account'] as never));
  const parts = Object.fromEntries((by.groups ?? []).map((g) => [g.label ?? g.key, { value: g.value, parts: g.parts }]));
  assert.deepEqual(parts, {
    [POUNDS]: { value: null, parts: [{ currency: 'GBP', amount: 250_000 }] },
    [DOLLARS]: { value: null, parts: [{ currency: 'USD', amount: 294_795 }] },
  });

  /* CASH NOW ADDS THEM UP IN POUNDS: $2,947.95 at eighty pence is £2,358.36. */
  const now = value<Read>(k.metric(METRICS['cash-now'] as never));
  assert.deepEqual([now.value, now.unit], [250_000 + 235_836, 'GBP']);
  assert.deepEqual([by.value, by.unit], [now.value, now.unit], 'the parts no longer cut the headline they stand under');

  /* THE TILE IS DRAWN, AND READ WITH NO REFUSAL. */
  const tile = value<{ blocks: Drawn[] }>(k.page('money')).blocks.find((b) => b.heading === 'Accounts');
  assert.ok(tile, 'Money draws no Accounts tile');
  assert.deepEqual(tile.refusals, []);
  assert.notEqual(tile.drawn, false, 'the Accounts tile is shut with cash in two accounts');
});
