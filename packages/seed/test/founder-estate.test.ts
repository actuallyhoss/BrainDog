/**
 * A founder's record holds its Estate (`founder.ts`, `loop/research-switch.md` section 3, ranked gap 5).
 *
 * THE OWNER'S 23 DOMAINS AND THE HOSTING BEHIND THEM HAD NOWHERE TO GO. Solo founder installed Projects, People, Money
 * and Work, so a founder record held no `services` list, and the importer left every domain out in one skip line that
 * was read once. A founder running several companies holds domains, hosting and subscriptions, which is what Estate
 * is, so Estate is one of the modules a founder's record is made with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { projectTemplate } from '../src/modules/portfolio.ts';
import { modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

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
    await put(k, moduleDocument(u, m, { today: TODAY, holds }));
  }
  await put(k, carriedDocument(u, TODAY));
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
  assert.equal(home[0]!.heading, 'The numbers', "Home's first heading is the founder's voice, not Estate's");
  assert.deepEqual(home[0]!.cells?.map((c) => c.label), ['Cash now', 'Owed to you, 30 days', 'Owed by you, 30 days', 'Reported, 30 days']);
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
  assert.deepEqual((blocks[0]!.cells ?? []).map((c) => c.label), ['Open', 'Owed to you', 'Costs a year'], 'the cost tile is back now the services are held');
  const alive = blocks.find((b) => b.heading === 'Keeping it alive');
  assert.ok(alive, `no services block among ${blocks.map((b) => b.heading).join(', ')}`);
  assert.deepEqual(alive.rows?.map((r) => r.fields.name), ['harbour.example']);
  assert.ok(blocks.some((b) => b.heading === 'Send numbers here'), 'the founder half of the page is still under it');
});

/**
 * A RECORD MADE ON 1.3.2, REBUILT: the four modules it named, and its pack as it shipped. The project page is the one
 * thing 1.4.0 moved, so the current document with that page taken from Portfolio's template without services is 1.3.2,
 * and its fingerprint is checked against the one `usecase-versions.test.ts` recorded for 1.3.2 so that the rebuild is
 * held to what shipped rather than to what this file believes shipped.
 */
async function onEarlier(): Promise<{ k: Kernel; before: Record<string, unknown> }> {
  const u = useCase('founder')!;
  const now = useCaseDocument('founder', TODAY) as { declarations: Record<string, unknown>[]; version: string; config?: unknown };
  const withServices = projectTemplate(['things', 'tasks', 'obligations', 'services']).blocks as unknown[];
  const without = projectTemplate(['things', 'tasks', 'obligations']);
  const before = {
    ...now,
    version: '1.3.2',
    declarations: now.declarations.map((d) =>
      d.page !== 'project'
        ? d
        : { ...d, requires: (d.requires as string[]).filter((r) => r !== 'register.services'), blocks: [...(without.blocks as unknown[]), ...(d.blocks as unknown[]).slice(withServices.length)] },
    ),
  };
  const printed = createHash('sha256').update(JSON.stringify({ declarations: before.declarations, config: before.config ?? null })).digest('hex').slice(0, 16);
  assert.equal(printed, '3e4927061f959b6d', 'the rebuilt 1.3.2 is not the 1.3.2 that shipped');

  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const m of ['portfolio', 'people', 'money-core', 'work']) {
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds }));
  }
  await put(k, before);
  assert.ok(!held(k).includes('services'), 'a record on 1.3.2 holds no services');
  return { k, before };
}

test('A RECORD ON 1.3.2 IS OFFERED ESTATE THEN 1.4.0, and neither loses a row or a page of what it held', async () => {
  const { k } = await onEarlier();
  const org = value<{ id: string }>(k.create('organisations', { name: 'Harbour Studio', kind: 'company', currency: 'GBP' }, OWNER));
  value(k.create('datapoints', { name: 'Sign-ups', value: 12, organisation: org.id, source: 'reported', at: new Date(NOW).toISOString() }, OWNER));
  const u = useCase('founder')!;
  const next = useCaseDocument('founder', TODAY, held(k));

  /* THE PACK ALONE DOES NOT PLAN, AND THAT IS WHY THE ORDER IS THE PLAN'S. Its project page requires services, which the
     record does not hold yet, so an update that sent only the use case's pack would be refused rather than half made. */
  const alone = value<Pack>(await normalise(next, { kind: 'local' }));
  const refused = await plan(alone, stateOf(k));
  assert.deepEqual(refused.unresolved.map((x) => x.register), ['services'], 'the new project page asks for the list Estate brings');

  /* THE ORDER `planFile` TAKES: each module the use case names and the record lacks, then the use case's own pack. */
  const lacking = modulesFor(u).filter((m) => !k.packs().some((p) => p.id === m));
  assert.deepEqual(lacking, ['estate'], 'the step offers exactly one module');
  const holds = new Set([...held(k), 'services']);
  await put(k, moduleDocument(u, 'estate', { today: TODAY, holds }));
  await put(k, next);

  assert.equal(k.packs().find((p) => p.id === 'usecase-founder')?.version, '1.4.0');
  assert.ok(held(k).includes('services'));
  assert.equal(k.count('organisations'), 2, 'the example organisation and his own, both kept');
  assert.equal(k.count('datapoints'), 2, 'the example number and his own, both kept');
  drawn(k, 'home-founder');
  drawn(k, 'dashboard');
  const pages = k.pages() as unknown as { slug: string; title: string }[];
  const project = pages.find((p) => p.title === 'Northwind app');
  assert.ok(project, 'the example project kept its page');
  assert.ok(drawn(k, project.slug).some((b) => b.heading === 'Keeping it alive'), 'and the page now draws what it runs on');
});
