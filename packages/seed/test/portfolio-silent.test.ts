/**
 * An earning project that went silent, and the numbers a project sent this week (REC-C08 step 9, REC-C16 part b; founder
 * 2.5.0).
 *
 * HIS NINE EARNING PROJECTS HELD THREE PRODUCTS, TWO PIECES OF CLIENT WORK AND FOUR PIECES OF INFRASTRUCTURE, and nothing
 * on any page said which of them had earned. `projects-earning-silent` counts a project marked Earning with no cleared
 * money in on the Ledger and no number sent in 90 days, by two hops backwards along `thing` (`pointed`), and Projects
 * names them. The after-an-import skill reads the same figure to propose a lane, and nothing moves without his yes.
 *
 * AND A FOUNDER'S PROJECT SAYS HOW MANY NUMBERS IT SENT THIS WEEK under Where it stands, while nobody has said where it
 * stands, beside what changed and when it was last worked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel, type MetricDecl, type PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const DAY = 86_400_000;
const OWNER = { actor: 'p_1' };

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

/** A founder's record as sign-up makes it, the use case's examples in. */
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

/** One of the founder pack's own declarations, by its figure or page id. */
const declared = (id: string): Record<string, unknown> => {
  const found = (useCase('founder')!.pack!.declarations as Record<string, unknown>[]).find((d) => d.metric === id || d.page === id);
  assert.ok(found, `founder declares no ${id}`);
  return found;
};

const ago = (days: number): string => new Date(NOW - days * DAY).toISOString().slice(0, 10);

type Drawn = PageResult['blocks'][number] & { key?: string; body?: string; values?: Record<string, unknown>; readings?: { metric: string; reading: { value: unknown } | null }[] };

test('A FOUNDER PROJECT SAYS THE NUMBERS IT SENT THIS WEEK under Where it stands, the example and last week left out', async () => {
  const cells = ((declared('project').blocks as { key?: string; cells?: { metric: string }[] }[]).find((b) => b.key === 'stands-figures')?.cells ?? []).map((c) => c.metric);
  assert.deepEqual(cells, ['project-moved-7d:{{name}}', 'project-last-worked:{{name}}', 'project-numbers-7d:{{name}}']);

  const k = await founder();
  const harbour = value<{ id: string }>(k.create('things', { name: 'Harbour', lane: 'building' }, OWNER));
  value(k.create('tasks', { what: 'Ship the first build', thing: harbour.id, state: 'open' }, OWNER));
  for (const [d, source] of [[0, 'reported'], [2, 'polled'], [6, 'typed'], [1, 'example'], [9, 'reported']] as const)
    value(k.create('datapoints', { name: 'Sign-ups', value: 10, thing: harbour.id, source, at: new Date(NOW - d * DAY).toISOString() }, OWNER));

  const page = (k.pages() as unknown as { slug: string; title: string }[]).find((p) => p.title === 'Harbour');
  assert.ok(page, 'Harbour has no page');
  const stands = value<PageResult>(k.page(page.slug)).blocks.filter((b) => b.heading === 'Where it stands') as Drawn[];
  const figures = stands.find((b) => b.kind === 'stat')!;
  assert.notEqual(figures.drawn, false, 'nobody has said where it stands, so the figures speak');
  assert.deepEqual(figures.refusals ?? [], [], JSON.stringify(figures.refusals));
  const read = (m: string) => figures.readings?.find((r) => r.metric.startsWith(m))?.reading?.value;
  assert.equal(read('project-numbers-7d'), 3, 'three numbers sent this week');
  assert.equal(read('project-last-worked'), 0, 'its task was written today');
});

test('AN EARNING PROJECT WITH NO MONEY IN AND NO NUMBER IN 90 DAYS IS SILENT, and Projects names it', async () => {
  const k = await founder();
  const account = value<{ id: string }>(k.create('accounts', { name: 'Current', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: TODAY, liquid: true }, OWNER));
  const project = (name: string, lane = 'earning'): string => value<{ id: string }>(k.create('things', { name, lane }, OWNER)).id;
  const paid = (thing: string, on: number, more: Record<string, unknown> = {}) =>
    value(k.create('transactions', { what: 'Payment', on: ago(on), direction: 'in', amount: { amount: 50_000, currency: 'GBP' }, account: account.id, thing, state: 'cleared', ...more }, OWNER));
  const sent = (thing: string, on: number, source = 'reported') =>
    value(k.create('datapoints', { name: 'Sign-ups', value: 4, thing, source, at: new Date(NOW - on * DAY).toISOString() }, OWNER));

  project('Quiet');
  paid(project('Paid'), 30);
  paid(project('Paid long ago'), 120);
  paid(project('Moved in'), 10, { transfer: true });
  paid(project('Not cleared'), 10, { state: 'pending' });
  paid(project('Paid out'), 10, { direction: 'out' });
  sent(project('Reporting'), 10);
  sent(project('Example only'), 10, 'example');
  /* NOT EARNING, so never silent here, however quiet. */
  project('Still building', 'building');

  const silent = declared('projects-earning-silent');
  const reading = value<{ value: number; refusals: unknown[] }>(k.metric(silent as unknown as MetricDecl));
  assert.deepEqual(reading.refusals, []);
  /* THE FOUNDER'S EXAMPLE, Northwind app, IS EARNING AND SILENT TOO: its one number is the example. */
  const names = value<{ rows: { fields: Record<string, unknown> }[] }>(k.list({ register: 'things', where: silent.where as never, limit: 50 }))
    .rows.map((r) => r.fields.name)
    .sort();
  assert.deepEqual(names, ['Example only', 'Moved in', 'Northwind app', 'Not cleared', 'Paid long ago', 'Paid out', 'Quiet']);
  assert.equal(reading.value, names.length);

  const projects = value<PageResult>(k.page('portfolio')).blocks as Drawn[];
  const line = projects.find((b) => b.key === 'earning-silent');
  assert.ok(line, 'Projects has no line for the silent ones');
  assert.notEqual(line.drawn, false);
  assert.deepEqual(line.refusals ?? [], [], JSON.stringify(line.refusals));
  assert.equal(line.body, '{{projects-earning-silent.names}}: marked Earning, but no money in and no number sent in 90 days');
  const said = String(Object.values(line.values ?? {})[0] ?? '');
  /* TWO BY NAME AND HOW MANY MORE (`.names`), each of them one of the silent seven, and none that was heard from. */
  const named = said.replace(/ and \d+ more$/u, '').split(', ');
  assert.equal(named.length, 2, said);
  for (const name of named) assert.ok(names.includes(name), `the line names ${name}, which is not silent: ${said}`);
  assert.match(said, / and 5 more$/u);
});

test('WITH EVERY EARNING PROJECT HEARD FROM, PROJECTS SAYS NOTHING about it', async () => {
  const k = await founder();
  const rows = value<{ rows: { id: string; fields: Record<string, unknown> }[] }>(k.list({ register: 'things', limit: 50 })).rows;
  for (const r of rows.filter((x) => x.fields.lane === 'earning'))
    value(k.create('datapoints', { name: 'Sign-ups', value: 1, thing: r.id, source: 'reported', at: new Date(NOW).toISOString() }, OWNER));
  assert.equal(value<{ value: number }>(k.metric(declared('projects-earning-silent') as unknown as MetricDecl)).value, 0);
  const line = (value<PageResult>(k.page('portfolio')).blocks as Drawn[]).find((b) => b.key === 'earning-silent');
  assert.equal(line?.drawn, false, 'the line is drawn over none');
});
