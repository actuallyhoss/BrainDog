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

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';
import { FOUNDER_SHIPPED_1_3_2, FOUNDER_SHIPPED_1_4_0, FOUNDER_SHIPPED_1_5_0, shippedFingerprint } from './founder-shipped.ts';

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

/** A founder record made the way onboarding makes one: each module in order, People for the person, then the use case's pack. */
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
  assert.deepEqual((glance?.cells ?? []).map((c) => c.label), ['Open', 'Owed to you', 'Costs a year'], 'the cost tile is back now the services are held');
  const alive = blocks.find((b) => b.heading === 'Keeping it alive');
  assert.ok(alive, `no services block among ${blocks.map((b) => b.heading).join(', ')}`);
  assert.deepEqual(alive.rows?.map((r) => r.fields.name), ['harbour.example']);
  assert.ok(blocks.some((b) => b.heading === 'Send numbers here'), 'the founder half of the page is still under it');
});

type Body = Record<string, unknown>;

/**
 * PEOPLE AS IT WAS BEFORE 3.0.0, NEAR 2.7.0 AND NOT BYTE FOR BYTE: today's document with the organisations, and the
 * parts of a person that name one, taken out. A record on Founder 1.x held `organisations` as Founder's own list, and
 * the People it held declared none, so a rebuild with today's People would have two packs claiming one list before
 * the update under test began.
 */
function peopleBefore3(doc: Body): Body {
  const later = new Set(['org', 'keys', 'aliases', 'self']);
  const declarations = (doc.declarations as Body[])
    .filter((d) => d.register !== 'organisations' && d.page !== 'relation' && d.metric !== 'organisations-count')
    .map((d) => {
      if (d.register === 'people')
        return {
          ...d,
          fields: (d.fields as Body[]).filter((f) => !later.has(String(f.id))),
          meets: Object.fromEntries(Object.entries(d.meets as Body).filter(([part]) => !later.has(part))),
        };
      if (d.page === 'people' || d.page === 'someone')
        return {
          ...d,
          requires: ['register.people'],
          blocks: (d.blocks as Body[])
            .filter((b) => b.heading !== 'Organisations' && b.heading !== 'Known by')
            .map((b) => (Array.isArray(b.columns) ? { ...b, columns: (b.columns as Body[]).filter((c) => c.field !== 'org') } : b)),
        };
      return d;
    });
  const { seeds: all, ...rest } = doc;
  const seeds = ((all as Body[] | undefined) ?? []).filter((x) => x.register !== 'organisations');
  return { ...rest, version: '2.7.0', declarations, ...(seeds.length > 0 ? { seeds } : {}) };
}

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
async function onEarlier(): Promise<{ k: Kernel; before: Record<string, unknown> }> {
  const u = useCase('founder')!;
  assert.equal(shippedFingerprint(FOUNDER_SHIPPED_1_5_0), 'b3550baded7ee204', 'founder-shipped.ts’s 1.5.0 is not the 1.5.0 that shipped');
  assert.equal(shippedFingerprint(FOUNDER_SHIPPED_1_4_0), '15c1f37be2561258', 'founder-shipped.ts’s 1.4.0 is not the 1.4.0 that shipped');
  assert.equal(shippedFingerprint(FOUNDER_SHIPPED_1_3_2), '3e4927061f959b6d', 'founder-shipped.ts’s 1.3.2 is not the 1.3.2 that shipped');
  const before = FOUNDER_SHIPPED_1_3_2 as Record<string, unknown>;

  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const m of ['portfolio', 'people', 'money-core', 'work']) {
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    const doc = moduleDocument(u, m, { today: TODAY, holds, examples: true });
    await put(k, m === 'people' ? peopleBefore3(doc as Body) : doc);
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
/* A TODO, NOT A PASS, UNTIL `@braindog/declare` HANDS A LIST TO A PACK THE RECORD ALREADY HAS. Founder 2.0.0 hands
   `register.organisations` to People (`hands`), and the plan only hands to a pack the record does not hold yet, so on
   a record with People it retires the list instead and the use case's own pages lose it (`REGISTER_UNRESOLVED` at
   `register.datapoints.fields.organisation.to`); People 3.0.0 planned first is `PROVIDES_CONFLICT`, the list being
   Founder's. Measured here on October 6th. The test runs and says what it meets. */
test('A RECORD ON 1.3.2 IS OFFERED ESTATE THEN THE CURRENT VERSION, and neither loses a row or a page of what it held', { todo: 'needs a handover to an installed pack in @braindog/declare' }, async () => {
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
  const lacking = modulesFor(u).filter((m) => !k.packs().some((p) => p.id === m));
  assert.deepEqual(lacking, ['estate'], 'the step offers exactly one module');
  const holds = new Set([...held(k), 'services']);
  await put(k, moduleDocument(u, 'estate', { today: TODAY, holds, examples: true }));
  /* AND SINCE FOUNDER 2.0.0, People 3.0.0 AFTER IT: the use case hands its organisations to People (`hands`), and adds
     its numbers to People's page for one, which only People 3.0.0 declares. */
  await put(k, next);
  await put(k, moduleDocument(u, 'people', { today: TODAY, holds: new Set(held(k)), examples: false }));

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
  assert.ok(drawn(k, project.slug).some((b) => b.heading === 'Keeping it alive'), 'and the page now draws what it runs on');
});
