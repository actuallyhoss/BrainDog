/**
 * A founder's record holds its Estate (`founder.ts`).
 *
 * AN IMPORTED RECORD'S 23 DOMAINS AND THE HOSTING BEHIND THEM HAD NOWHERE TO GO. Solo founder installed Projects, People, Money
 * and Work, so a founder record held no `services` list, and the importer left every domain out in one skip line that
 * was read once. A founder running several companies holds domains, hosting and subscriptions, which is what Estate
 * is, so Estate is one of the modules a founder's record is made with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handedOf, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';
import { FOUNDER_SHIPPED_1_3_2, FOUNDER_SHIPPED_1_4_0, FOUNDER_SHIPPED_1_5_0, shippedFingerprint } from './founder-shipped.ts';
import { peopleBefore3 } from './people-before-3.ts';

const TODAY = dayOf(NOW);

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

/** Each record's own database, so a plan is told what its installed packs hand on, as the record tells it. */
const sqlOf = new WeakMap<Kernel, NodeSql>();

async function opened(): Promise<Kernel> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  sqlOf.set(k, sql);
  return k;
}

/* `handed` AS THE RECORD READS IT (`packages/record/src/index.ts`), off the stored manifests, so Founder handing its
   organisations to the People the record already holds plans as a handover and not as a retire. */
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

/** A founder record made the way onboarding makes one: each module in order, People for the person, then the use case's pack. */
async function founder(): Promise<Kernel> {
  const k = await opened();
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: true }));
  return k;
}

test('A FRESH FOUNDER RECORD CARRIES THE SERVICES REGISTER, so a domain has a list to arrive in', async () => {
  assert.ok(useCase('founder')!.modules.includes('estate'), 'Solo founder names Estate among its modules');
  const k = await founder();
  assert.ok(held(k).includes('services'), `a founder record holds ${held(k).join(', ')} and no services`);
});

type Drawn = { kind: string; heading?: string; cells?: { label: string }[]; refusals?: { code: string; fix: string }[] };
const OWNER = { actor: 'p_1' };

/** Every block of a page, with the headings of any that were refused. */
function drawn(k: Kernel, slug: string): Drawn[] {
  const blocks = value<{ blocks: Drawn[] }>(k.page(slug)).blocks;
  const refused = blocks.filter((b) => (b.refusals ?? []).length > 0).map((b) => `${b.heading}: ${b.refusals!.map((r) => r.code).join(', ')}`);
  assert.deepEqual(refused, [], `${slug} refused a block`);
  return blocks;
}

test("HOME, THE DASHBOARD, AN ORGANISATION AND ESTATE'S OWN PAGE ALL READ with Estate in, and Home still speaks as a founder", async () => {
  const k = await founder();
  const home = drawn(k, 'home-founder');
  /* A LINE OF THE CASH THERE IS SINCE founder 1.11.0, where a tile of four figures stood. */
  const line = home[0] as { kind?: string; lead?: boolean; body?: string };
  assert.deepEqual([line.kind, line.lead], ['note', true], "Home leads with the founder's money, not Estate's page");
  assert.match(String(line.body), /\{\{cash-now\}\}/u);
  drawn(k, 'dashboard');
  drawn(k, 'estate');
  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const org = pages.find((p) => p.title === 'Northwind Labs Ltd');
  assert.ok(org, 'the example organisation has its page');
  drawn(k, org.slug);
});

test("A FOUNDER'S PROJECT DRAWS WHAT IT RUNS ON: a domain pointed at it is on its page, with what it costs a year", async () => {
  const k = await founder();
  const project = value<{ id: string }>(k.create('things', { name: 'Harbour app', lane: 'building' }, OWNER));
  value(k.create('services', { name: 'harbour.example', provider: 'Cove Domains', kind: 'domain', cycle: 'yearly', state: 'live', thing: project.id }, OWNER));
  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const page = pages.find((p) => p.title === 'Harbour app');
  assert.ok(page, 'a project has its own page');
  const blocks = drawn(k, page.slug) as (Drawn & { rows?: { fields: Record<string, unknown> }[] })[];
  const glance = blocks.find((b) => b.heading === 'At a glance');
  assert.deepEqual((glance?.cells ?? []).map((c) => c.label), ['Open', 'Still to come in', 'Costs a year', 'Done this week'], 'the cost tile is back now the services are held');
  const alive = blocks.find((b) => b.heading === 'Services');
  assert.ok(alive, `no services block among ${blocks.map((b) => b.heading).join(', ')}`);
  assert.deepEqual(alive.rows?.map((r) => r.fields.name), ['harbour.example']);
  assert.ok(blocks.some((b) => b.heading === 'Send numbers here'), 'the founder half of the page is still under it');
});

type Body = Record<string, unknown>;

/**
 * A RECORD MADE ON 1.3.2, REBUILT: the four modules it named, and its pack as it shipped. `founder-shipped.ts` holds
 * what each old version's pack actually was, read off the commit that raised it rather than rebuilt by hand over
 * `founder.ts`'s current diff.
 *
 * A MUTATION OVER TODAY'S DOCUMENT COULD NOT STAY THE REBUILD FOR LONG. `projectTemplate` (`modules/portfolio.ts`)
 * and `DUE_THIS_WEEK` (`modules/money.ts`) both moved under Founder's pages more than once without founder.ts's own
 * version changing (the same drift `usecase-versions.test.ts` calls out for `projectTemplate`), so undoing only
 * founder.ts's own diff from today's document stopped landing on what 1.5.0 or 1.3.2 actually shipped the moment
 * either dependency moved again. Each constant in `founder-shipped.ts` is checked there against the fingerprint
 * `usecase-versions.test.ts`'s DECLARED table pins for that version, so this file trusts them rather than
 * re-deriving them, and a constant that drifts from what shipped is caught at its own assertion, not here.
 */
/**
 * PROJECTS AS IT WAS BEFORE IT TOOK NUMBERS OVER (portfolio 1.19.0): the same document without Numbers, Key numbers and
 * the two figures over them, at the version before, so a founder's own Numbers is the founder's, as on a record of then.
 */
const portfolioBeforeNumbers = (doc: Body): Body => ({
  ...doc,
  version: '1.18.0',
  /* AND NUMBERS' OWN PAGE (portfolio 1.22.0), which reads the readings this version does not hold. */
  declarations: (doc.declarations as Body[]).filter((d) => !['datapoints', 'kpis'].includes(String(d.register)) && !['kpis-held', 'readings-held', 'kpi-stale'].includes(String(d.metric)) && d.page !== 'all-numbers'),
  ...(Array.isArray(doc.seeds) ? { seeds: (doc.seeds as Body[]).filter((s) => !['datapoints', 'kpis'].includes(String(s.register))) } : {}),
});

async function onEarlier(): Promise<{ k: Kernel; before: Record<string, unknown> }> {
  const u = useCase('founder')!;
  assert.equal(shippedFingerprint(FOUNDER_SHIPPED_1_5_0), 'b3550baded7ee204', 'founder-shipped.ts’s 1.5.0 is not the 1.5.0 that shipped');
  assert.equal(shippedFingerprint(FOUNDER_SHIPPED_1_4_0), '15c1f37be2561258', 'founder-shipped.ts’s 1.4.0 is not the 1.4.0 that shipped');
  assert.equal(shippedFingerprint(FOUNDER_SHIPPED_1_3_2), '3e4927061f959b6d', 'founder-shipped.ts’s 1.3.2 is not the 1.3.2 that shipped');
  const before = FOUNDER_SHIPPED_1_3_2 as Record<string, unknown>;

  const k = await opened();
  for (const m of ['portfolio', 'people', 'money-core', 'work']) {
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    const doc = moduleDocument(u, m, { today: TODAY, holds, examples: true });
    await put(k, m === 'people' ? peopleBefore3(doc as Body) : m === 'portfolio' ? portfolioBeforeNumbers(doc as Body) : doc);
  }
  await put(k, before);
  assert.ok(!held(k).includes('services'), 'a record on 1.3.2 holds no services');
  return { k, before };
}

/**
 * WHAT THE RECORD IS OFFERED IS THE VERSION THIS BUILD SHIPS, NOT 1.4.0. The update sends the current document, so since
 * 1.5.0 a record on 1.3.2 lands on 1.5.0 in the same step, and the pin that read '1.4.0' failed with '1.5.0' the moment
 * the version moved. It reads the use case's own version now, and Home is held to draw the two tables 1.5.0 added.
 */
/* A TODO, NOT A PASS, UNTIL A LIST CAN BE TAKEN FROM A PACK WHOSE NEXT VERSION HANDS IT. The record now says what its
   packs hand on (`Installed.handed`), and that was half of it. The other half, measured here on October 6th: Founder
   2.0.0 and People 3.0.0 each need the other in first. People first is `PROVIDES_CONFLICT` at `register.organisations`,
   Founder 1.x's still, even with Founder 2.0.0's `hands` in `handed`, because `plan` reads `handed` only for a list
   already under the receiver's name. Founder first is `PAGE_UNKNOWN` at `adds.page.relation`, and without its `adds`
   `FIELD_UNKNOWN` at `page.dashboard`, which reads `merged_into` on the organisations as only People 3.0.0 lays it. The
   test runs and says what it meets. */
test('A RECORD ON 1.3.2 IS OFFERED ESTATE THEN THE CURRENT VERSION, and neither loses a row or a page of what it held', async () => {
  const { k } = await onEarlier();
  const org = value<{ id: string }>(k.create('organisations', { name: 'Harbour Studio', kind: 'company', currency: 'GBP' }, OWNER));
  value(k.create('datapoints', { name: 'Sign-ups', value: 12, organisation: org.id, source: 'reported', at: new Date(NOW).toISOString() }, OWNER));
  const u = useCase('founder')!;
  const next = useCaseDocument('founder', TODAY, held(k));

  /* THE PACK ALONE DOES NOT PLAN, AND THAT IS WHY THE ORDER IS THE PLAN'S. Its project page and, since 1.5.0, its Home
     require services, which the record does not hold yet, so an update that sent only the use case's pack would be
     refused rather than half made. */
  const alone = value<Pack>(await normalise(next, { kind: 'local' }));
  const refused = await plan(alone, stateOf(k));
  assert.deepEqual(refused.unresolved.map((x) => x.register), ['services'], 'the new project page and Home ask for the list Estate brings');

  /* THE ORDER `planFile` TAKES: each module the use case names and the record lacks, then the use case's own pack. */
  const lacking = modulesFor(u, u.modules).filter((m) => !k.packs().some((p) => p.id === m));
  /* CORE IS EVERY RECORD'S, so a record made before it lacks it beside Estate. */
  assert.deepEqual(lacking, ['core', 'estate'], 'the step offers core and the one module');
  const holds = new Set([...held(k), 'services']);
  await put(k, moduleDocument(u, 'estate', { today: TODAY, holds, examples: true }));
  /* AND SINCE FOUNDER 2.0.0, People 3.0.0 FIRST, told what the use case is about to hand it (`hands`), which is the
     order the record plans a use case in: its modules, then its own pack. The use case adds its numbers to People's page
     for an organisation, which only People 3.0.0 declares, and its Dashboard reads the organisations as People 3.0.0
     lays them, so it cannot go first. */
  const hands = (next as { hands?: Record<string, string> }).hands ?? {};
  /* AND PROJECTS, TOLD THE SAME, SINCE founder 3.0.0: Portfolio 1.19.0 takes Numbers over, which the use case hands it. */
  for (const m of ['portfolio', 'people']) {
    const module = value<Pack>(await normalise(moduleDocument(u, m, { today: TODAY, holds: new Set(held(k)), examples: false }), { kind: 'local' }));
    const state = stateOf(k);
    const diff = await plan(module, { ...state, handed: { ...state.handed, ...hands } });
    value(await install(module, diff, hostFor(k), diff.planHash));
  }
  await put(k, next);

  assert.equal(k.packs().find((p) => p.id === 'usecase-founder')?.version, u.version);
  assert.ok(held(k).includes('services'));
  assert.equal(k.count('organisations'), 2, 'the example organisation and his own, both kept');
  assert.equal(k.count('datapoints'), 2, 'the example number and his own, both kept');
  const home = drawn(k, 'home-founder').map((b) => b.heading);
  assert.ok(home.includes('Due this week') && home.includes('Lapsing'), `the updated Home draws ${home.join(', ')}`);
  drawn(k, 'dashboard');
  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const project = pages.find((p) => p.title === 'Northwind app');
  assert.ok(project, 'the example project kept its page');
  assert.ok(drawn(k, project.slug).some((b) => b.heading === 'Services'), 'and the page now draws what it runs on');
});
