/**
 * A founder's project, polled (`founder-poll.ts`): the pack plans on a founder record with the host and the
 * interval in front of the owner, installs once approved, and the runner fills datapoints from a JSON answer.
 * The host is a stand-in, so nothing leaves the machine and no key is real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type ActionAnswer, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, pollPack, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const HOUR = 3_600_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
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

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function founder(): Promise<{ k: Kernel; clock: ReturnType<typeof fixedClock> }> {
  const clock = fixedClock(NOW);
  const k = await openRecord(openSqlite(), clock);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'northwind', name: 'Northwind', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'founder@example.test', name: 'Ada' } }).ok);
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    const pack = value<Pack>(await normalise(moduleDocument(u, m, { today: TODAY, holds, examples: true }), { kind: 'local' }));
    const diff = await plan(pack, stateOf(k));
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const pack = value<Pack>(await normalise(carriedDocument(u, TODAY, null, { examples: true }), { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
  return { k, clock };
}

const SPEC = {
  id: 'northwind',
  url: 'https://stats.northwind.example/v1/numbers.json',
  grant: 'northwind stats',
  every: '1h',
  project: 'things#1',
  measures: [
    { name: 'Monthly recurring revenue', path: 'data.mrr', unit: 'GBP' },
    { name: 'Active users', path: 'data.users', unit: 'users', type: 'int' as const },
  ],
};

test('THE POLL PACK IS ONE POLL PER ADDRESS, a map a measure, each writing a datapoint by paths', () => {
  const doc = pollPack(SPEC) as { pack: string; requires: { packs: Record<string, string> }; declarations: Record<string, unknown>[] };
  assert.equal(doc.pack, 'poll-northwind');
  assert.deepEqual(doc.requires.packs, { 'usecase-founder': '>=1.0.0 <3.0.0' });
  assert.equal(doc.declarations.length, 1);
  assert.deepEqual(doc.declarations[0], {
    ingest: 'poll_northwind',
    channel: 'poll',
    url: 'https://stats.northwind.example/v1/numbers.json',
    every: '1h',
    grant: 'northwind stats',
    project: 'things#1',
    map: [
      {
        name: { value: 'Monthly recurring revenue' },
        value: { path: 'data.mrr', type: 'decimal' },
        unit: { value: 'GBP' },
        thing: { value: 'things#1' },
        source: { value: 'polled' },
        at: { arrived: true },
      },
      {
        name: { value: 'Active users' },
        value: { path: 'data.users', type: 'int' },
        unit: { value: 'users' },
        thing: { value: 'things#1' },
        source: { value: 'polled' },
        at: { arrived: true },
      },
    ],
    writes: { register: 'datapoints' },
  });
  /* A PUBLIC ADDRESS NAMES NO KEY. */
  const { grant: _, ...open } = SPEC;
  assert.equal('grant' in (pollPack(open) as { declarations: Record<string, unknown>[] }).declarations[0]!, false);
});

test('ON A FOUNDER RECORD IT PLANS WITH THE HOST AND THE INTERVAL IN FRONT OF THE OWNER, installs once approved, and fills datapoints', async () => {
  const { k, clock } = await founder();
  const made = k.bindGrant({ label: 'northwind stats', opens: 'stats.northwind.example', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3, 4]), nonce: new Uint8Array([5, 6, 7, 8]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' }, 'p_1');
  assert.ok(made.ok);

  const pack = value<Pack>(await normalise(pollPack(SPEC), { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  /* THE OWNER'S APPROVAL AT INSTALL: the host, how often, the key, and the project it runs for, per measure. */
  assert.deepEqual(diff.approve, [
    'CALLS OUT stats.northwind.example · every 1h · grant "northwind stats"',
    `poll_northwind runs for the project things#1 and sends the key "northwind stats".`,
    /* AND WHAT A KEY REACHES, once at the end of the list rather than under each line (§2.7). */
    'Keys are not kept per project yet, so any action in this record can send any key it names.',
  ]);
  /* A RECORD NAMES THE PROJECT BY ITS TITLE, as a person reads it on Decide, and not by the row id or spoken id the declaration holds. */
  const title = k.titleOfRow('things#1');
  assert.ok(title, 'the example project has a title');
  const named = await plan(pack, { ...stateOf(k), nameOf: (ref) => k.titleOfRow(ref) });
  assert.equal(named.approve[1], `poll_northwind runs for the project ${title} and sends the key "northwind stats".`);
  const byId = k.get('things#1')!.id;
  assert.equal(k.titleOfRow(byId), title);
  /* NOT APPROVED IS NOT INSTALLED. */
  const unapproved = await install(pack, diff, hostFor(k), diff.planHash);
  assert.equal(unapproved.ok, false);
  value(await install(pack, diff, hostFor(k), diff.planHash, diff.approve));

  const before = k.count('datapoints');
  const answers: ActionAnswer[] = [{ status: 200, body: '{"data":{"mrr":4310.5,"users":128}}', bytes: 34, ms: 5, requests: 1 }];
  const seen: string[] = [];
  const run = await k.runActions(async (request) => {
    seen.push(request.url);
    return answers[0]!;
  });
  assert.equal(run.ran, 1, 'one address, one request');
  assert.deepEqual(seen, [SPEC.url]);
  assert.equal(k.count('datapoints'), before + 2);

  const rows = value<{ rows: { fields: Record<string, unknown> }[] }>(k.list({ register: 'datapoints', where: { field: 'source', is: 'polled' } as never, limit: 10 })).rows;
  const byName = Object.fromEntries(rows.map((r) => [r.fields.name, r.fields]));
  assert.equal(byName['Monthly recurring revenue']?.value, 4310.5);
  assert.equal(byName['Active users']?.value, 128);
  assert.equal(byName['Active users']?.unit, 'users');
  assert.equal(byName['Active users']?.at, new Date(NOW).toISOString());
  assert.match(String(byName['Active users']?.thing), /^[0-9A-HJKMNP-TV-Z]{26}$/u, 'the project is stored as the row it names');

  /* The same answer an interval later writes nothing. */
  clock.advance(2 * HOUR);
  await k.runActions(async () => answers[0]!);
  assert.equal(k.count('datapoints'), before + 2);
});

test('A PUBLIC ADDRESS IS POLLED WITH NO KEY IN THE VAULT, once approved, and never without approval', async () => {
  const { k } = await founder();
  const { grant: _, project: __, ...rest } = SPEC;
  const pack = value<Pack>(await normalise(pollPack({ ...rest, organisation: 'organisations#1' }), { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  assert.deepEqual(diff.approve, ['CALLS OUT stats.northwind.example · every 1h · grant "none"']);
  assert.equal((await install(pack, diff, hostFor(k), diff.planHash)).ok, false);
  value(await install(pack, diff, hostFor(k), diff.planHash, diff.approve));

  const before = k.count('datapoints');
  const grants: unknown[] = [];
  const run = await k.runActions(async (request) => (grants.push(request.grant), { status: 200, body: '{"data":{"mrr":12,"users":3}}', bytes: 28, ms: 3, requests: 1 }));
  assert.deepEqual({ ran: run.ran, paused: run.paused }, { ran: 1, paused: 0 });
  assert.deepEqual(grants, [null]);
  assert.equal(k.count('datapoints'), before + 2);
});
