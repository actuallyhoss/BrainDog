/**
 * The first-party packs one at a time (`packs/first-party.ts`): each is a legal pack, each needs what
 * its fields point at, the five with the project template are the starter exactly, and installed in
 * order on an empty record they make the record the starter does, less that one template.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULE_LISTS, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { AGENTS_PACK, FIRST_PARTY, NOW, crossPack, firstPartyDocument, firstPartyManifest, packDocument } from '../src/index.ts';
import { STARTER_CATEGORIES } from '../src/modules/money/lists/categories.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  return { k: await openRecord(sql, fixedClock(NOW)), sql };
}

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
});

async function put(k: Kernel, doc: unknown): Promise<unknown> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  return install(pack, diff, hostFor(k), diff.planHash);
}

type Body = Record<string, unknown>;
/* AN INGEST IS A DECLARATION TOO, and this helper did not know it. Ingests only joined the pack
   documents this week; before that every declaration was a rule, a register, a page or a metric, so
   the last arm was a safe default. With two ingests in money-core both answered `metric.undefined`,
   the duplicate check below read 83 distinct ids against 84 declarations and reported "a
   declaration is in two packs" about two declarations that are in one pack and are not the same. */
const idOf = (d: Body): string =>
  d.rule ? `rule.${d.rule}`
    : d.register ? `register.${d.register}`
      : d.page ? `page.${d.page}`
        : d.ingest ? `ingest.${d.ingest}`
          : /* AND A SCRIPT IS ONE, since Work 1.8.0 ships two: both answered `metric.undefined` here, and the check below
               read 91 distinct ids against 92 declarations, the same false "in two packs" the ingests once caused. */
            d.script ? `script.${d.script}`
            : `metric.${d.metric}`;
const byId = (list: readonly Body[]): [string, string][] => list.map((d) => [idOf(d), JSON.stringify(d)] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]));

/* ── each one ───────────────────────────────────────────────────────────── */

test('EACH FIRST-PARTY PACK IS A LEGAL PACK, and needs what its fields, pages and figures point at', async () => {
  const requires = Object.fromEntries(FIRST_PARTY.map((id) => [id, firstPartyManifest(id).requires]));
  assert.deepEqual(requires, {
    core: [],
    portfolio: [],
    people: [],
    /* ONLY LINKS TO PROJECTS SINCE 4b137c806 (31 October): which project a bill or a payment is for. */
    'money-core': [],
    estate: ['register.things'],
    work: [],
  });
  /* PEOPLE ONLY LINKS TO PROJECTS AND MONEY: "Met in" is left out of a record that holds no Projects (`LINKS`), and an
     organisation's page draws its projects and what moved with it only where the record holds those lists. */
  assert.deepEqual(Object.fromEntries(FIRST_PARTY.map((id) => [id, firstPartyManifest(id).links])), {
    core: [],
    portfolio: [],
    people: ['register.things', 'register.transactions'],
    /* MONEY ONLY LINKS TO PEOPLE'S LISTS since 3.0.0: who a row is with is left out of a record without them. A ledger
       row names an organisation since 3.10.0, and a bill still names a person. */
    'money-core': ['register.organisations', 'register.people', 'register.things'],
    estate: [],
    /* WORK ONLY LINKS TO PEOPLE AND PROJECTS: who holds a task and what it is for are left out of a record without them. */
    /* AND WHO A TASK IS FOR, AN ORGANISATION, SINCE 1.23.0. */
    work: ['register.organisations', 'register.people', 'register.things'],
  });

  for (const id of FIRST_PARTY) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id), { kind: 'local' }));
    assert.equal(pack.manifest.pack, id);
    assert.deepEqual([...pack.manifest.provides], firstPartyManifest(id).provides, `${id} provides something its manifest does not say`);
    for (const seed of pack.seeds) assert.ok(pack.manifest.provides.includes(`register.${seed.register}`));
  }
});

test('and every one needs only what a pack before it in the order provides', () => {
  const provided = new Set<string>();
  for (const id of FIRST_PARTY) {
    for (const want of firstPartyManifest(id).requires) assert.ok(provided.has(want), `${id} needs ${want} before anything provides it`);
    for (const p of firstPartyManifest(id).provides) provided.add(p);
  }
});

test('an id that is not one of the five has no document', () => {
  assert.equal(firstPartyDocument('agents'), null);
  assert.equal(firstPartyDocument('braindog-starter'), null);
  assert.equal(firstPartyDocument('constructor'), null);
});

/* ── all five ───────────────────────────────────────────────────────────── */

/* EVERY LIST THE STARTER HOLDS. A document asked for with no `holds` walks only its own pack's lists in a figure
   (`firstPartyDocument`, money-core 3.0.0), so the five are compared with the starter as documents for a record that
   holds all of them. */
const everyList = (): string[] => (packDocument() as { declarations: Body[] }).declarations.flatMap((d) => (typeof d.register === 'string' ? [d.register] : []));

/* A FIGURE'S LEGS OVER ANOTHER PACK'S LIST, left out: installed one at a time in order, Money comes before Estate, so its
   walk figures carry no `services` renews leg until Money is installed again for a record that holds Estate. */
const ownLegs = (body: string): string => {
  const d = JSON.parse(body) as Body;
  if (typeof d.page === 'string' && typeof d.pack === 'string') return ownBlocks(d, body);
  if (!Array.isArray(d.legs) || typeof d.pack !== 'string') return body;
  const own = new Set(firstPartyManifest(d.pack as never).provides);
  return JSON.stringify({ ...d, legs: (d.legs as Body[]).filter((l) => own.has(`register.${String(l.register)}`)) });
};

/* AND A PAGE'S BLOCKS OVER ANOTHER PACK'S LIST, left out the same way: People comes before Projects and Money, so an
   organisation's page carries no Projects or Money until People is installed again for a record that holds them. */
function ownBlocks(d: Body, body: string): string {
  const own = new Set(firstPartyManifest(d.pack as never).provides);
  const others = new Set(FIRST_PARTY.flatMap((id) => firstPartyManifest(id).provides).filter((p) => !own.has(p)));
  const kept = (r: unknown) => typeof r !== 'string' || !others.has(r);
  if (!Array.isArray(d.blocks)) return body;
  return JSON.stringify({
    ...d,
    ...(Array.isArray(d.requires) ? { requires: (d.requires as unknown[]).filter(kept) } : {}),
    blocks: (d.blocks as Body[]).filter((b) => kept(b.source)),
  });
}

test('THE FIVE AND THE PROJECT TEMPLATE ARE THE STARTER, and nothing is in two of them', () => {
  const starter = packDocument() as { declarations: Body[]; seeds: Body[] };
  const holds = everyList();
  const docs = FIRST_PARTY.map((id) => firstPartyDocument(id, { holds }) as { declarations: Body[]; seeds?: Body[] });

  const ids = docs.flatMap((d) => d.declarations.map(idOf));
  assert.equal(new Set(ids).size, ids.length, 'a declaration is in two packs');

  /* The project template reads tasks, money and services at once, so no one of those packs holds it. */
  assert.deepEqual(crossPack().map(idOf), ['page.project']);

  assert.deepEqual(byId([...docs.flatMap((d) => d.declarations), ...crossPack()]), byId(starter.declarations));
  const seeds = (list: readonly Body[]) => list.map((s) => JSON.stringify(s)).sort();
  assert.deepEqual(seeds(docs.flatMap((d) => d.seeds ?? [])), seeds(starter.seeds));
});

test('INSTALLED IN ORDER ON AN EMPTY RECORD, each through its own plan, they make the starter less the template', async () => {
  const one = await record();
  for (const id of FIRST_PARTY) value(await put(one.k, firstPartyDocument(id)));
  assert.deepEqual(one.k.packs().map((p) => p.id).sort(), [...FIRST_PARTY].sort());

  const whole = await record();
  value(await put(whole.k, packDocument()));

  const shapes = (k: Kernel) =>
    k
      .declarations()
      .filter((d) => d.kind !== 'theme' && d.id !== 'page.project')
      .map((d) => [d.id, d.body] as [string, string])
      .sort((a, b) => a[0].localeCompare(b[0]));
  const own = (list: [string, string][]) => list.map(([id, body]) => [id, ownLegs(body)]);
  assert.deepEqual(own(shapes(one.k)), own(shapes(whole.k)));
  /* And those legs and blocks are the only difference: every other declaration is the starter's byte for byte. */
  const differ = shapes(one.k).filter(([id, body]) => shapes(whole.k).find(([w]) => w === id)?.[1] !== body).map(([id]) => id);
  assert.deepEqual(differ, ['metric.arriving-30d', 'metric.in-ahead-by-month', 'metric.lasts-no-income', 'metric.leaving-30d', 'metric.out-ahead-by-month', 'metric.runs-out-on', 'metric.runway-days', 'page.relation']);

  /* Each pack's claims are its own, so turning one off later retires only what it brought. */
  for (const id of FIRST_PARTY) assert.deepEqual([...one.k.packClaims(id)].sort(), firstPartyManifest(id).provides);

  /* And the example rows arrive marked, one per register the starter seeds, and categories as their starter set
     (ruling 341), every one of them marked. */
  const seeded = new Map<string, number>();
  for (const seed of (packDocument() as { seeds: { register: string }[] }).seeds) seeded.set(seed.register, (seeded.get(seed.register) ?? 0) + 1);
  for (const [register, rows] of seeded) {
    assert.equal(rows, register === 'categories' ? STARTER_CATEGORIES.length : 1, `${register} is seeded ${rows} times`);
    assert.equal(one.k.count(register), rows, `${register} does not hold its example rows`);
    for (let n = 1; n <= rows; n++) assert.deepEqual(one.k.get(`${register}#${n}`)!.fields.tags, ['example'], `${register}#${n}`);
  }

  one.sql.close();
  whole.sql.close();
});

test("THE LISTS A SHARED USE CASE MAY NOT DECLARE ARE THE MODULES' OWN, as their manifests provide them", () => {
  /* `readShared` refuses a list a first-party module provides unless the use case installs that module, from
     `MODULE_LISTS` in `@braindog/declare`, which cannot read this package. So the two are held equal here. */
  /* BUT NUMBERS, PORTFOLIO'S SINCE 1.19.0 AND NOT IN THE TABLE, as `holdings` is in none: the add-ons that read and write
     it name it, and the core spells an add-on's name only on the owner's word (`tools/gates/core-names.mjs`). */
  /* AND ITS STAGES SINCE 1.23.0, for the same reason. */
  const unlisted: Partial<Record<string, readonly string[]>> = { portfolio: ['datapoints', 'stages'] };
  for (const id of FIRST_PARTY) {
    if (id === 'core') continue;
    const provided = firstPartyManifest(id).provides.filter((p) => p.startsWith('register.')).map((p) => p.slice('register.'.length));
    assert.deepEqual([...MODULE_LISTS[id].lists].sort(), provided.filter((l) => !(unlisted[id] ?? []).includes(l)).sort(), id);
  }
  assert.deepEqual([...MODULE_LISTS.agents.lists].sort(), Object.keys(AGENTS_PACK.registers).sort(), 'agents');
});
