/**
 * A pack's plan says which host each script key goes to, from the record's keychain, as a proposal's approval line does.
 *
 * THE LINE NAMED THE ORIGINS AND THE KEYS AS TWO LISTS. The host sends a key only where its keychain entry opens
 * (`keyRefused` in `@braindog/host`), so a script with two origins and one key was approved without the owner being told
 * which origin gets the key. The kernel's `scriptEgress` now says it beside each key when it is handed what a label
 * opens; `plan` hands it `Installed.opensOf`, and a record that cannot say still gets a line saying where the answer is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { egressOf, normalise, plan, type Installed, type Pack } from '../src/index.ts';

const GOLD = {
  script: 'gold-rate',
  title: 'Gold price',
  runs: { every: '1h' },
  egress: ['https://api.goldapi.io', 'https://metals.example.org'],
  keys: ['goldapi'],
  reads: [],
  writes: ['gold_egp'],
  source: 'export default async function run(ctx) {}',
};

const DOC = (script: Record<string, unknown>) => ({
  pack: 'gold-feed',
  version: '1.0.0',
  summary: 'A gold price, hourly.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'gold_egp', name: 'Gold', title: 'at', fields: [{ id: 'at', type: 'text' }] }, script],
  seeds: [],
});

const EMPTY: Installed = { format: 1, primitives: 1, record_version: 7, packs: [], declarations: [], rows: {} };
const opensOf = (label: string) => (label === 'goldapi' ? 'api.goldapi.io' : null);

const packOf = async (doc: unknown): Promise<Pack> => {
  const pack = await normalise(doc);
  assert.ok(pack.ok, JSON.stringify(pack));
  return pack.value as Pack;
};

test('THE WRAPPER HANDS WHAT A KEY OPENS THROUGH, and says where to look without it', () => {
  assert.equal(
    egressOf({ kind: 'script', body: GOLD }, undefined, opensOf)?.line,
    'CALLS OUT api.goldapi.io and metals.example.org · every 1h · key "goldapi" to api.goldapi.io',
  );
  assert.equal(
    egressOf({ kind: 'script', body: GOLD })?.line,
    'CALLS OUT api.goldapi.io and metals.example.org · every 1h · key "goldapi" to the host its keychain entry opens',
  );
});

test("A PACK'S PLAN NAMES THE HOST THE RECORD'S KEYCHAIN ENTRY OPENS, and approves that line", async () => {
  const diff = await plan(await packOf(DOC(GOLD)), { ...EMPTY, opensOf });
  const line = 'CALLS OUT api.goldapi.io and metals.example.org · every 1h · key "goldapi" to api.goldapi.io';
  assert.deepEqual(diff.calls_out.map((c) => c.line), [line]);
  assert.ok(diff.approve.includes(line), `the approval lines were ${JSON.stringify(diff.approve)}`);
});

test('THE INSTALLED SCRIPT IS READ WITH THE SAME KEYCHAIN, so an update that changes nothing it sends asks nothing again', async () => {
  const pack = await packOf(DOC(GOLD));
  const script = pack.declarations.find((d) => d.kind === 'script')!;
  const held: Installed = {
    ...EMPTY,
    packs: [{ id: 'gold-feed', version: '1.0.0' }],
    declarations: [{ id: script.id, kind: 'script', version: 1, pack_id: 'gold-feed', body: script.canonical, checksum: '' }],
    opensOf,
  };
  const diff = await plan(await packOf({ ...DOC({ ...GOLD, title: 'Gold, 24k' }), version: '1.0.1' }), held);
  assert.deepEqual(diff.calls_out.map((c) => [c.ingest, c.change]), [['gold-rate', 'same']]);
});

test("A PACK'S DIGEST THAT POSTS OUT IS IN THE PLAN, with its key, and is approved like any call out", async () => {
  const NOTES = { register: 'notes', name: 'Notes', title: 'title', fields: [{ id: 'title', type: 'text' }] };
  const DIGEST = {
    digest: 'weekly-notes',
    title: 'Notes, weekly',
    schedule: { at: '08:00' },
    channels: ['webhook'],
    webhook: { url: 'https://collector.example.org/in', grant: 'signing' },
    sections: [{ source: 'register.notes' }],
  };
  const doc = { ...DOC(GOLD), declarations: [NOTES, DIGEST] };
  const diff = await plan(await packOf(doc), EMPTY);
  const line = 'CALLS OUT collector.example.org · daily at 08:00 · a table of register.notes · grant "signing"';
  assert.deepEqual(diff.calls_out.map((c) => c.line), [line]);
  assert.ok(diff.approve.includes(line), JSON.stringify(diff.approve));
});
