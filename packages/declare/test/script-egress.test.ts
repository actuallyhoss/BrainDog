/**
 * A script's egress reaches the plan diff, as an action's does.
 *
 * THE KERNEL READ IT AND THE WRAPPER DROPPED IT. `egressOf` in the kernel returns a script's `CALLS OUT` line, and this
 * package's wrapper answered `null` for every kind but `ingest`, so a pack carrying a script that reaches an origin with
 * a vault key planned with no `calls_out` line, and the owner approved an install without seeing where it calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { egressOf, normalise, plan, type Installed, type Pack } from '../src/index.ts';

const GOLD = {
  script: 'gold-rate',
  title: 'Gold price',
  runs: { every: '1h' },
  egress: ['https://api.goldapi.io'],
  keys: ['goldapi'],
  reads: [],
  writes: ['gold_egp'],
  source: 'export default async function run(ctx) {}',
};

const EMPTY: Installed = { format: 1, primitives: 1, record_version: 7, packs: [], declarations: [], rows: {} };

test('A SCRIPT THAT FETCHES HAS EGRESS THROUGH THE WRAPPER, with its origin and its key', () => {
  const e = egressOf({ kind: 'script', body: GOLD });
  assert.ok(e, 'the wrapper dropped a script that calls out');
  assert.equal(e.channel, 'script');
  assert.equal(e.line, 'CALLS OUT api.goldapi.io · every 1h · key "goldapi"');
  assert.equal(egressOf({ kind: 'script', body: { ...GOLD, egress: [] } }), null);
  assert.equal(egressOf({ kind: 'register', body: GOLD }), null, 'only an ingest or a script calls out');
});

test('AND A PACK CARRYING ONE PLANS WITH ITS CALLS OUT LINE', async () => {
  const doc = {
    pack: 'gold-feed',
    version: '1.0.0',
    summary: 'A gold price, hourly.',
    author: 'Halden',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ register: 'gold_egp', name: 'Gold', title: 'at', fields: [{ id: 'at', type: 'text' }] }, GOLD],
    seeds: [],
  };
  const pack = await normalise(doc);
  assert.ok(pack.ok, JSON.stringify(pack));
  const diff = await plan(pack.value as Pack, EMPTY);
  assert.deepEqual(
    diff.calls_out.map((c) => [c.ingest, c.channel, c.line, c.change]),
    [['gold-rate', 'script', 'CALLS OUT api.goldapi.io · every 1h · key "goldapi"', 'new']],
  );
});
