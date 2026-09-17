/**
 * A founder's dashboards (`founder.ts`): the whole portfolio on one page and one page an organisation, read on a
 * founder record made as onboarding makes one, with every block answered and none refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const DAY = 86_400_000;

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

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

async function founder(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds }));
  }
  await put(k, carriedDocument(u, TODAY));
  return k;
}

type Drawn = { kind: string; heading?: string; rows?: { fields: Record<string, unknown> }[]; refusals?: { code: string; fix: string }[]; readings?: unknown[] };
const OWNER = { actor: 'p_1' };

test('THE DASHBOARD AND AN ORGANISATION PAGE read every block, and the numbers a project sent are their rows', async () => {
  const k = await founder();
  const account = value<{ id: string }>(k.create('accounts', { name: 'Harbour current account', kind: 'bank', balance: { amount: 910_000, currency: 'GBP' }, as_of: TODAY }, OWNER));
  const org = value<{ id: string }>(k.create('organisations', { name: 'Harbour Studio', kind: 'company', currency: 'GBP', accounts: [account.id] }, OWNER));
  for (let d = 0; d < 40; d += 1)
    value(k.create('datapoints', { name: 'Sign-ups', value: 10 + d, organisation: org.id, source: 'reported', at: new Date(NOW - d * DAY).toISOString() }, OWNER));

  const dashboard = value<{ blocks: Drawn[] }>(k.page('dashboard')).blocks;
  assert.deepEqual(dashboard.map((b) => b.kind), ['stat', 'bar', 'stat', 'lines', 'table', 'table']);
  for (const b of dashboard) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(dashboard[2]!.readings, undefined, 'the numbers are rows, not figures');
  assert.ok((dashboard[2]!.rows?.length ?? 0) >= 40, 'the tiles read the rows of the last sixty days');
  assert.equal(dashboard[1]!.rows?.length, 2, 'the example organisation and Harbour Studio');

  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const harbour = pages.find((p) => p.title === 'Harbour Studio');
  assert.ok(harbour, 'an organisation has its own page');
  const own = value<{ blocks: Drawn[] }>(k.page(harbour.slug)).blocks;
  assert.deepEqual(own.map((b) => b.heading), ['Balance', 'The numbers', 'Thirty days against the thirty before', 'Latest numbers', 'Send numbers here']);
  for (const b of own) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(own[0]!.rows?.length, 1, 'its balance reads its own row');
  assert.equal(own[1]!.rows?.length, 40, 'only its own numbers, the example one left out');
});
