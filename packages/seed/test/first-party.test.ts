/**
 * The first-party packs one at a time (`packs/first-party.ts`): each is a legal pack, each needs what
 * its fields point at, the five with the project template are the starter exactly, and installed in
 * order on an empty record they make the record the starter does, less that one template.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY, NOW, crossPack, firstPartyDocument, firstPartyManifest, packDocument } from '../src/index.ts';

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
const idOf = (d: Body): string => (d.rule ? `rule.${d.rule}` : d.register ? `register.${d.register}` : d.page ? `page.${d.page}` : `metric.${d.metric}`);
const byId = (list: readonly Body[]): [string, string][] => list.map((d) => [idOf(d), JSON.stringify(d)] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]));

/* ── each one ───────────────────────────────────────────────────────────── */

test('EACH FIRST-PARTY PACK IS A LEGAL PACK, and needs what its fields, pages and figures point at', async () => {
  const requires = Object.fromEntries(FIRST_PARTY.map((id) => [id, firstPartyManifest(id).requires]));
  assert.deepEqual(requires, {
    portfolio: [],
    people: [],
    'money-core': ['register.people', 'register.things'],
    estate: ['register.things'],
    work: ['register.things'],
  });
  /* PEOPLE ONLY LINKS TO PROJECTS: "Met in" is left out of a record that holds none (`LINKS`). */
  assert.deepEqual(Object.fromEntries(FIRST_PARTY.map((id) => [id, firstPartyManifest(id).links])), {
    portfolio: [],
    people: ['register.things'],
    'money-core': [],
    estate: [],
    work: [],
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

test('THE FIVE AND THE PROJECT TEMPLATE ARE THE STARTER, and nothing is in two of them', () => {
  const starter = packDocument() as { declarations: Body[]; seeds: Body[] };
  const docs = FIRST_PARTY.map((id) => firstPartyDocument(id) as { declarations: Body[]; seeds?: Body[] });

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
  assert.deepEqual(shapes(one.k), shapes(whole.k));

  /* Each pack's claims are its own, so turning one off later retires only what it brought. */
  for (const id of FIRST_PARTY) assert.deepEqual([...one.k.packClaims(id)].sort(), firstPartyManifest(id).provides);

  /* And the example rows arrive marked, one per register the starter seeds. */
  for (const seed of (packDocument() as { seeds: { register: string }[] }).seeds) {
    assert.equal(one.k.count(seed.register), 1, `${seed.register} has no example row`);
    assert.deepEqual(one.k.get(`${seed.register}#1`)!.fields.tags, ['example']);
  }

  one.sql.close();
  whole.sql.close();
});
