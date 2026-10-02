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
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: true }));
  return k;
}

type Series = { name: string; now: (number | null)[]; latest: { value: number } | null };
type Drawn = { kind: string; heading?: string; drawn?: boolean; rows?: { fields: Record<string, unknown> }[]; refusals?: { code: string; fix: string }[]; readings?: unknown[]; measures?: Series[]; matched?: number };
const OWNER = { actor: 'p_1' };

test('THE DASHBOARD AND AN ORGANISATION PAGE read every block, and the numbers a project sent are their rows', async () => {
  const k = await founder();
  const account = value<{ id: string }>(k.create('accounts', { name: 'Harbour current account', kind: 'bank', balance: { amount: 910_000, currency: 'GBP' }, as_of: TODAY }, OWNER));
  const org = value<{ id: string }>(k.create('organisations', { name: 'Harbour Studio', kind: 'company', currency: 'GBP', accounts: [account.id] }, OWNER));
  for (let d = 0; d < 40; d += 1)
    value(k.create('datapoints', { name: 'Sign-ups', value: 10 + d, organisation: org.id, source: 'reported', at: new Date(NOW - d * DAY).toISOString() }, OWNER));

  const dashboard = value<{ blocks: Drawn[] }>(k.page('dashboard')).blocks;
  assert.deepEqual(dashboard.map((b) => b.kind), ['note', 'note', 'stat', 'bar', 'stat', 'lines', 'table', 'table']);
  for (const b of dashboard) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  /* THE OPENING SENTENCE IS THE ONE THE NUMBERS ANSWER: forty were reported, so it counts them, and the one for a
     month with none does not draw. */
  assert.notEqual(dashboard[0]!.drawn, false, 'the sentence that counts the numbers is drawn');
  assert.equal(dashboard[1]!.drawn, false, 'and the one for no numbers is not');
  assert.equal(dashboard[4]!.readings, undefined, 'the numbers are series, not figures');
  assert.deepEqual(dashboard[4]!.measures?.map((m) => m.name), ['Sign-ups'], 'the example datapoint is in no tile');
  assert.deepEqual(dashboard[5]!.measures?.map((m) => m.name), ['Sign-ups'], 'and in no chart');
  assert.equal(dashboard[4]!.measures?.[0]?.now.at(-1), 10, 'today is the last day, and its reading the newest');
  assert.ok((dashboard[6]!.rows ?? []).some((r) => r.fields.source === 'example'), 'the latest numbers still list it, marked');
  assert.equal(dashboard[3]!.rows?.length, 2, 'the example organisation and Harbour Studio');

  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const harbour = pages.find((p) => p.title === 'Harbour Studio');
  assert.ok(harbour, 'an organisation has its own page');
  const own = value<{ blocks: Drawn[] }>(k.page(harbour.slug)).blocks;
  assert.deepEqual(own.map((b) => b.heading), ['Balance', 'The numbers', 'Thirty days against the thirty before', 'Projects', 'Latest numbers', 'Send numbers here']);
  for (const b of own) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.equal(own[0]!.rows?.length, 1, 'its balance reads its own row');
  assert.equal(own[1]!.matched, 40, 'only its own numbers, the example one left out');
});

test('A FOUNDER’S PROJECT HAS A PAGE, with Estate since founder 1.4.0: what is open, its money, the numbers it reports and where it sends them', async () => {
  const k = await founder();
  assert.ok(held(k).includes('services'), 'a founder keeps services since Estate joined Solo founder');
  const project = value<{ id: string }>(k.create('things', { name: 'Harbour app', lane: 'building' }, OWNER));
  value(k.create('datapoints', { name: 'Installs', value: 7, thing: project.id, source: 'reported', at: new Date(NOW).toISOString() }, OWNER));
  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const page = pages.find((p) => p.title === 'Harbour app');
  assert.ok(page, 'a project has its own page');
  const blocks = value<{ blocks: Drawn[] }>(k.page(page.slug)).blocks;
  assert.deepEqual(blocks.map((b) => b.heading), [
    'At a glance',
    /* THE TWO OPENING SENTENCES, which carry no heading: nothing is handed back, and nothing is open, so the second draws. */
    undefined,
    undefined,
    'Waiting on you',
    'Where it stands',
    /* THE TEMPLATE SINCE work 1.10.0: its finished work by the week, its dates as weeks, and this month's money. */
    'Done, by week',
    'Handed back or blocked',
    'What is open',
    'Agents',
    'What changed',
    'Dates',
    'The plan',
    'This month so far',
    'Money by month',
    'Money',
    'Keeping it alive',
    'Notes',
    'Runs on',
    'Keys',
    'Tools and servers',
    'Skills',
    'The numbers',
    'Thirty days against the thirty before',
    'Send numbers here',
  ]);
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  assert.deepEqual((blocks[0] as unknown as { cells: { label: string }[] }).cells.map((c) => c.label), ['Open', 'Owed to you', 'Costs a year'], 'with Estate present, what it costs a year takes the place the task figures held');
  assert.equal(blocks[1]!.drawn, false, 'nothing is handed back, so that sentence is not drawn');
  assert.notEqual(blocks[2]!.drawn, false, 'and nothing is open, so that one is');
  /* THE PROJECT'S NOTE, which is where an imported plan and its decisions are written, and which this example has none of. */
  /* FOUND BY HEADING, since the template's blocks move with each version and a place in the list says nothing. */
  const headed = (heading: string) => blocks.find((b) => b.heading === heading)!;
  assert.equal((headed('Notes') as unknown as { document?: boolean }).document, true);
  assert.deepEqual(headed('The numbers').measures?.map((m) => [m.name, m.latest?.value]), [['Installs', 7]]);
});
