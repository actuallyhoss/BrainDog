/**
 * A service's numbers, on Renewals: "Server and provider numbers" (REC-C12 steps 2 and 3).
 *
 * WHY THIS FILE EXISTS. An imported record held seventeen readings about two servers and the providers behind them, how
 * full a disk was and what a provider had billed so far, and each sat in Numbers with no project and nothing saying
 * which service it was about. Numbers had no field for one, so the readings were on no page: not on a project's, since
 * they had no project, and not on Renewals, which read Services and nothing else.
 *
 * FOUR THINGS ARE HELD HERE. Numbers has a Service, a link to Services, after its Organisation and never required. A
 * number with a service set is drawn on Renewals under "Server and provider numbers", six at most. A record with no
 * such number is drawn no block. And Renewals stays Estate's own page: the block is laid on it by the pack that
 * declares Numbers, so Estate still goes in on a record that holds no Numbers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handedOf, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { ESTATE_PAGES, SERVICE_NUMBERS, SERVICE_NUMBERS_SHOWN } from '../src/modules/estate.ts';
import { modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };
const HEADING = 'Server and provider numbers';
/** The most blocks a page holds (`BLOCK_CEILING` in `packages/kernel/src/declare.ts`). */
const CEILING = 24;

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

const sqlOf = new WeakMap<Kernel, NodeSql>();

async function opened(): Promise<Kernel> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  sqlOf.set(k, sql);
  return k;
}

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
  handed: handedOf((sqlOf.get(k)?.all<{ manifest: string }>('SELECT manifest FROM pack') ?? []).map((r) => r.manifest)),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** A founder record made the way onboarding makes one, with no example rows: its modules in order, then its own pack. */
async function founder(): Promise<Kernel> {
  const k = await opened();
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: false }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: false }));
  return k;
}

/** The same record before the use case's own pack is in: Estate and the other modules, and no Numbers. */
async function modulesOnly(): Promise<Kernel> {
  const k = await opened();
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: false }));
  }
  return k;
}

type Field = { id: string; label?: string; type: string; to?: string; required?: boolean };
type Line = { name: string; now: (number | null)[] };
type Latest = { measure: string; value: number };
type Drawn = { kind: string; heading?: string; drawn?: boolean; limit?: number; measures?: Line[]; latest?: Latest[]; refusals?: { code: string; fix: string }[] };

/** Every block of Renewals, none of them refused. */
function renewals(k: Kernel): Drawn[] {
  const blocks = value<{ blocks: Drawn[] }>(k.page('estate')).blocks;
  const refused = blocks.filter((b) => (b.refusals ?? []).length > 0).map((b) => `${b.heading}: ${b.refusals!.map((r) => `${r.code} ${r.fix}`).join(', ')}`);
  assert.deepEqual(refused, [], 'Renewals refused a block');
  return blocks;
}

/** The block, when Renewals draws it: absent and switched off both read as not drawn. */
const numbersOn = (k: Kernel): Drawn | undefined => renewals(k).find((b) => b.heading === HEADING && b.drawn !== false);

const DAY = 86_400_000;
const at = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();

/** What the figure that switches the block on counts (`service-numbers`, said by the founder pack). */
const counted = (k: Kernel): number | null => value<{ value: number | null }>(k.metric(k.metricDecl(SERVICE_NUMBERS_SHOWN)!)).value;

/** What the block holds once drawn: every measure it draws as a line, then every one it says as a number. */
const shown = (k: Kernel): string[] => {
  const block = numbersOn(k);
  return [...(block?.measures ?? []).map((m) => m.name), ...(block?.latest ?? []).map((l) => l.measure)];
};

const server = (k: Kernel, name: string): string =>
  value<{ id: string }>(k.create('services', { name, provider: 'Fenwick Cloud', kind: 'server', cycle: 'monthly', state: 'live' }, OWNER)).id;

/* LAID BY THE FOUNDER ON PORTFOLIO'S NUMBERS SINCE founder 3.0.0, which handed the list to Projects and keeps the two
   links it holds the figures and blocks of (`extends`). */
test('NUMBERS HAS A SERVICE, a link to Services after its Organisation, and a number need not say one', () => {
  const doc = useCaseDocument('founder', TODAY) as { extends?: Record<string, { fields?: Field[] }> };
  const fields = doc.extends?.['register.datapoints']?.fields ?? [];
  const service = fields.find((f) => f.id === 'about_service');
  assert.ok(service, `Numbers holds ${fields.map((f) => f.id).join(', ')} and no service`);
  assert.deepEqual([service.label, service.type, service.to], ['Service', 'ref', 'services']);
  assert.notEqual(service.required, true, 'a number about a project says no service');
  assert.equal(fields[fields.indexOf(service) - 1]?.id, 'organisation', 'Service comes after Organisation');
});

test('A NUMBER WITH A SERVICE SET IS DRAWN ON RENEWALS under Server and provider numbers, as a line once it is read twice', async () => {
  const k = await founder();
  const box = server(k, 'Build box');
  for (let d = 0; d < 5; d += 1) value(k.create('datapoints', { name: 'Disk used', value: 60 + d, unit: '%', about_service: box, source: 'polled', at: at(d) }, OWNER));
  value(k.create('datapoints', { name: 'Memory used', value: 41, unit: '%', about_service: box, source: 'polled', at: at(1) }, OWNER));
  const block = numbersOn(k);
  assert.ok(block, `Renewals draws ${renewals(k).filter((b) => b.drawn !== false).map((b) => b.heading ?? b.kind).join(', ')} and no ${HEADING}`);
  assert.equal(block.kind, 'lines');
  assert.deepEqual(block.measures?.map((m) => m.name), ['Disk used'], 'the measure read five times is a line');
  assert.equal(block.measures?.[0]?.now.at(-1), 60, "today's reading ends the line");
  assert.deepEqual(block.latest?.map((l) => [l.measure, l.value]), [['Memory used', 41]], 'the measure read once is said as a number');
  const blocks = renewals(k);
  const after = blocks.findIndex((b) => b.heading === 'Next ninety days');
  assert.equal(blocks[after + 1]?.heading, HEADING, 'it stands under what renews, above everything folded shut');
});

test('A NUMBER TYPED BY HAND, WITH NO SOURCE SAID, IS DRAWN: only the example is left out (audit 61, claim 5)', async () => {
  const k = await founder();
  const box = server(k, 'Build box');
  /* `source is not example` over a reading that says no source at all, which is what a typed or imported one is. */
  value(k.create('datapoints', { name: 'Disk used', value: 60, unit: '%', about_service: box, at: at(1) }, OWNER));
  const block = numbersOn(k);
  assert.ok(block, `a reading with no source drew no ${HEADING}`);
  assert.deepEqual(block.latest?.map((l) => [l.measure, l.value]), [['Disk used', 60]]);
});

test('A NUMBER WITH NO SOURCE COUNTS AS WELL AS DRAWS: the figure and the block read the same readings (audit 61, claim 5)', async () => {
  const k = await founder();
  const box = server(k, 'Build box');
  assert.equal(counted(k), 0, 'a record with no reading counts some');
  value(k.create('datapoints', { name: 'Disk used', value: 60, unit: '%', about_service: box, at: at(1) }, OWNER));
  assert.equal(counted(k), 1, 'a reading that says no source is not counted');
  assert.deepEqual(shown(k), ['Disk used']);
});

test('A NUMBER DATED AFTER TODAY NEITHER COUNTS NOR DRAWS THE HEADING: nothing is headed over no reading (audit 61, claim 5)', async () => {
  const k = await founder();
  const box = server(k, 'Build box');
  /* What an import or a mistyped year writes: a reading the block's ninety days never reach, tomorrow's and next year's. */
  value(k.create('datapoints', { name: 'Disk used', value: 60, unit: '%', about_service: box, source: 'polled', at: at(-1) }, OWNER));
  value(k.create('datapoints', { name: 'Billed so far', value: 12, about_service: box, source: 'polled', at: at(-400) }, OWNER));
  assert.equal(counted(k), 0, 'a reading dated after today is counted');
  assert.equal(numbersOn(k), undefined, `${HEADING} stands over no reading`);
  /* AND IT IS NOT A MEASURE'S LATEST FIGURE: read yesterday and dated again tomorrow, the number said is yesterday's. */
  value(k.create('datapoints', { name: 'Disk used', value: 55, unit: '%', about_service: box, source: 'polled', at: at(1) }, OWNER));
  assert.equal(counted(k), 1);
  assert.deepEqual(numbersOn(k)?.latest?.map((l) => [l.measure, l.value]), [['Disk used', 55]]);
});

test('NINETY DAYS, AND THE SAME NINETY FOR BOTH: a reading 91 days old is out, and each day inside counts exactly when it draws', async () => {
  const k = await founder();
  const box = server(k, 'Build box');
  value(k.create('datapoints', { name: 'Disk used', value: 60, unit: '%', about_service: box, source: 'polled', at: at(91) }, OWNER));
  assert.equal(counted(k), 0, 'a reading 91 days old is counted');
  assert.equal(numbersOn(k), undefined, `${HEADING} stands over a reading 91 days old`);
  /* The two edges of the window, one record each, so neither answers for the other. */
  for (const days of [90, 89, 0]) {
    const one = await founder();
    value(one.create('datapoints', { name: 'Disk used', value: 60, unit: '%', about_service: server(one, 'Build box'), source: 'polled', at: at(days) }, OWNER));
    assert.equal(counted(one) === 1, shown(one).length === 1, `a reading ${days} days old: counted ${counted(one)}, drawn ${shown(one).length}`);
  }
  const edge = await founder();
  value(edge.create('datapoints', { name: 'Disk used', value: 60, unit: '%', about_service: server(edge, 'Build box'), source: 'polled', at: at(89) }, OWNER));
  assert.deepEqual(shown(edge), ['Disk used'], 'the ninetieth day back, today being the first, is in');
});

test('SIX AT MOST: eight measures about one server draw six', async () => {
  const k = await founder();
  const box = server(k, 'Build box');
  for (let n = 0; n < 8; n += 1) value(k.create('datapoints', { name: `Measure ${n + 1}`, value: n, about_service: box, source: 'polled', at: at(n) }, OWNER));
  const block = numbersOn(k);
  assert.ok(block, `no ${HEADING}`);
  assert.equal(block.latest?.length, 6);
  assert.ok((block.measures?.length ?? 0) <= 6);
});

test('A RECORD WITH NO NUMBER ABOUT A SERVICE DRAWS NO BLOCK, whatever its projects report and whatever the example says', async () => {
  const k = await founder();
  assert.equal(numbersOn(k), undefined, 'a fresh record draws it');
  const box = server(k, 'Build box');
  const project = value<{ id: string }>(k.create('things', { name: 'Harbour app', lane: 'building' }, OWNER));
  value(k.create('datapoints', { name: 'Sign-ups', value: 12, thing: project.id, source: 'reported', at: at(1) }, OWNER));
  assert.equal(numbersOn(k), undefined, "a project's number drew it");
  value(k.create('datapoints', { name: 'Disk used', value: 60, unit: '%', about_service: box, source: 'example', at: at(1) }, OWNER));
  assert.equal(numbersOn(k), undefined, 'an example drew it');
});

test('RENEWALS IS STILL ESTATE\'S OWN PAGE: it reads on a record with no Numbers, gave up no block, and stays under the ceiling', async () => {
  const k = await modulesOnly();
  /* NUMBERS IS PROJECTS' SINCE portfolio 1.19.0, and says no service until the founder lays one. */
  const numbers = (k.declarations() as { id: string; body: string }[]).find((d) => d.id === 'register.datapoints');
  assert.ok(!numbers || !(JSON.parse(numbers.body) as { fields: Field[] }).fields.some((f) => f.id === 'about_service'), "this record's Numbers says no service");
  assert.equal(renewals(k).some((b) => b.heading === HEADING), false);
  const own = ESTATE_PAGES.estate!.blocks as { heading?: string }[];
  assert.equal(own.length, 11, 'Renewals holds the eleven blocks it held');
  assert.ok(own.length + 1 <= CEILING, `Renewals with the block laid on it is ${own.length + 1} blocks, over ${CEILING}`);
  assert.equal(SERVICE_NUMBERS.page, 'page.estate');
  assert.equal(SERVICE_NUMBERS.block.heading, HEADING);
  assert.equal(SERVICE_NUMBERS.block.limit, 6);
});
