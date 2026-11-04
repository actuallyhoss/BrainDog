/**
 * What a record starts with is what its use case cannot stand without, and what the person named.
 *
 * BEFORE: `modulesFor` installed every module a use case names, whatever was said, so a founder had five add-ons on day 0
 * and a record never grew into anything because it already held everything. A use case's `needs` is the part of its
 * modules it starts with (`standsOn`); a module the person names comes in beside it, and the rest wait for their moment.
 *
 * ITS OWN PAGES GO IN ON THAT SMALLER RECORD because a block that reads a list the record does not hold says so
 * (`when: { holds }`), and the plan takes the block out and the list out of the page's `requires` with it
 * (`packages/declare/src/when.ts`). A block that does not say so is still refused: that is what cutting a use case's
 * pages to fit (`fitted`) is for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, normaliseUseCase, plan, useCasePack, type Host, type Installed, type Pack, type UseCase } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { MODULE_ORDER, USE_CASES, modulesFor, standsOn, useCase } from '../src/usecases/index.ts';
import { dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const HOME = (blocks: Record<string, unknown>[]) => ({
  page: 'home-pottery',
  title: 'Studio',
  requires: ['register.pieces', 'register.people', 'register.tasks'],
  blocks: [{ kind: 'table', heading: 'On the shelf', source: 'register.pieces', columns: [{ field: 'name' }] }, ...blocks],
});
const WAITING = [
  { kind: 'table', heading: 'Buyers', source: 'register.people', columns: [{ field: 'name' }], when: { holds: ['people'] } },
  { kind: 'table', heading: 'Commissions', source: 'register.tasks', columns: [{ field: 'title' }], when: { holds: ['tasks'] } },
];

/** An invented use case that stands on three modules and cannot stand without one of them. */
const pottery = (over: Record<string, unknown> = {}, blocks: Record<string, unknown>[] = WAITING): UseCase =>
  value<UseCase>(
    normaliseUseCase({
      usecase: 'pottery',
      version: '1.0.0',
      title: 'Potter',
      summary: 'The pieces on the shelf, who bought them and what they sold for.',
      author: 'Brindle Kiln',
      license: 'MIT',
      audience: 'individual',
      tone: 'quiet',
      signals: ['pottery'],
      modules: ['portfolio', 'people', 'money-core'],
      needs: ['money-core'],
      pack: {
        pack: 'usecase-pottery',
        requires: { format: 1, primitives: 1, packs: {} },
        declarations: [{ register: 'pieces', name: 'Pieces', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }, HOME(blocks)],
      },
      skills: [],
      ...over,
    }),
  );

test('A USE CASE STANDS ON ITS NEEDS, and on all of its modules when it says none', () => {
  assert.deepEqual(standsOn(pottery()), ['money-core']);
  const { needs: _, ...without } = pottery();
  assert.deepEqual(standsOn(without as UseCase), ['portfolio', 'people', 'money-core']);
  /* FOUNDER 2.7.0 AND PERSONAL 2.6.0 SAY THEIR NEEDS, Projects and Money; a built-in that says none
     installs what it did before this. */
  assert.deepEqual(useCase('founder')!.needs, ['portfolio', 'money-core']);
  assert.deepEqual(useCase('personal')!.needs, ['people', 'money-core']);
  for (const u of USE_CASES) {
    const first: readonly string[] = MODULE_ORDER;
    const stands = u.needs ?? u.modules;
    assert.deepEqual(modulesFor(u), ['core', ...first.filter((m) => stands.includes(m)), ...stands.filter((m) => !first.includes(m))], u.usecase);
  }
});

test('MODULES FOR A USE CASE ARE ITS NEEDS AND WHAT WAS NAMED, in install order', () => {
  const u = pottery();
  /* CORE IS FIRST ON EVERY RECORD: the pages that are no add-on's. */
  assert.deepEqual(modulesFor(u), ['core', 'money-core'], 'said nothing: core and only what it cannot stand without');
  assert.deepEqual(modulesFor(u, ['people']), ['core', 'people', 'money-core'], 'People named comes in, and before Money, which points at it');
  assert.deepEqual(modulesFor(u, ['work', 'people']), ['core', 'people', 'money-core', 'work'], 'a module it does not name, named, comes in too');
  assert.deepEqual(modulesFor(u, ['money-core']), ['core', 'money-core'], 'named twice is once');
  /* A CATALOGUE PACK THAT IS NOT FIRST-PARTY STILL GOES AFTER THE FIRST-PARTY ONES. */
  assert.deepEqual(modulesFor(u, ['tide-tables', 'portfolio']), ['core', 'portfolio', 'money-core', 'tide-tables']);
});

/* ── on a record ──────────────────────────────────────────────────────── */

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

async function put(k: Kernel, doc: unknown): Promise<{ ok: boolean }> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  return (await install(pack, diff, hostFor(k), diff.planHash)) as { ok: boolean };
}

/**
 * What `modulesFor` gives with every first-party module each one leans on, in install order, as onboarding closes it
 * (`closeOver` in `apps/web/src/lib/shape.ts`): Money points its bills at projects, so it brings Projects.
 */
function leanedOn(ids: readonly string[]): string[] {
  const want = new Set(ids);
  const owner = (list: string) => MODULE_ORDER.find((m) => m !== 'agents' && firstPartyManifest(m).provides.includes(list));
  for (let moved = true; moved; ) {
    moved = false;
    for (const m of [...want]) {
      if (!(MODULE_ORDER as readonly string[]).includes(m) || m === 'agents') continue;
      for (const r of firstPartyManifest(m as never).requires) {
        const o = owner(r);
        if (o !== undefined && !want.has(o)) (want.add(o), (moved = true));
      }
    }
  }
  return MODULE_ORDER.filter((m) => want.has(m));
}

/** A record made the way onboarding makes one: what `modulesFor` gives and what it leans on, in order, then the use case's own pack. */
async function made(u: UseCase, named: readonly string[] = []): Promise<{ k: Kernel; own: { ok: boolean } }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const m of leanedOn(modulesFor(u, named))) {
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    value(await put(k, moduleDocument(u, m, { today: TODAY, holds })));
  }
  return { k, own: await put(k, useCasePack(u)) };
}

type Page = { requires?: string[]; blocks: { heading?: string; refusals?: unknown[] }[] };
const homeOf = (k: Kernel): Page => {
  const decl = k.declarations().find((d) => d.id === 'page.home-pottery');
  assert.ok(decl, 'the use case has its Home');
  return JSON.parse(decl.body) as Page;
};

test('ON A RECORD HOLDING ONLY WHAT IT NEEDS, ITS PAGES GO IN without the blocks over lists it does not hold', async () => {
  const { k, own } = await made(pottery());
  value(own);
  /* MONEY BRINGS NOTHING SINCE 4b137c806 (31 October): which project a bill is for is a link, cut where Projects is not held. */
  assert.deepEqual(leanedOn(modulesFor(pottery())), ['money-core'], 'Money brought something it only links to');
  assert.ok(held(k).includes('transactions') && !held(k).includes('people') && !held(k).includes('tasks'), `the record holds ${held(k).join(', ')}`);
  const home = homeOf(k);
  assert.deepEqual(home.requires, ['register.pieces'], 'the lists it does not hold leave the page with the blocks that read them');
  assert.deepEqual(home.blocks.map((b) => b.heading), ['On the shelf']);
  const drawn = value<Page>(k.page('home-pottery'));
  assert.deepEqual(drawn.blocks.filter((b) => (b.refusals ?? []).length > 0), [], 'Home draws with nothing refused');
});

test('PEOPLE NAMED COMES IN, and the page keeps the block that reads it', async () => {
  const { k, own } = await made(pottery(), ['people']);
  value(own);
  assert.ok(held(k).includes('people') && !held(k).includes('tasks'), `the record holds ${held(k).join(', ')}`);
  const home = homeOf(k);
  assert.deepEqual(home.requires, ['register.pieces', 'register.people']);
  assert.deepEqual(home.blocks.map((b) => b.heading), ['On the shelf', 'Buyers']);
});

test('A BLOCK THAT DOES NOT SAY WHAT IT WAITS ON IS STILL REFUSED on the smaller record, which is what fitting a page is for', async () => {
  const bare = WAITING.map(({ when: _, ...b }) => b);
  const { k, own } = await made(pottery({}, bare), []);
  assert.equal(own.ok, false, 'a page requiring a list the record does not hold is refused');
  const refusal = (own as unknown as { refusal: { code: string; at?: string; fix: string } }).refusal;
  assert.deepEqual([refusal.code, refusal.at], ['REGISTER_UNRESOLVED', 'page.home-pottery.requires']);
  assert.ok(!held(k).includes('pieces'), 'and nothing of the use case went in');
});
