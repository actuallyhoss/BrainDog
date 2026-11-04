/**
 * ONE NIGHT TAKES BOTH (night-one-pass-75, closing "THE NIGHT TAKES TWO PASSES" of batch 73).
 *
 * WHY. The night plans the five modules before the use cases, and money-core 3.17.0 declares a count that Personal 2.3.1
 * holds, so on a record as brain.dog serves it Money was refused, Personal went in and handed the count on, and Money
 * followed a whole night later. Nothing was in the way by then but the order, so the night now plans a module again once
 * the pack that held what was in its way has gone in, and says the one thing that happened to it.
 *
 * AND ONLY THEN. A module refused for any other reason is planned once, and so is one whose holder did not go in.
 *
 * The record and its port are `personal-budgets-hand.test.ts`'s, copied because they are local to that file: the three
 * modules are the frozen documents (`fixtures/released/`), and Personal 2.3.1 is this build's document with the
 * hand-over undone, held to the fingerprint of the 2.3.1 that shipped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { handedOf, install, normalise, plan, type Diff, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { updateFirstParty, type QuietPort, type QuietQuestion } from '@braindog/seed/packs/quiet';
import type { Result } from '@braindog/ports';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY_VERSIONS, NOW, firstPartyManifest } from '../src/index.ts';
import { useCase } from '../src/usecases/index.ts';
import { dayOf, homePageOf, moduleDocument } from '../src/usecases/install.ts';

type Body = Record<string, unknown>;
const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };
const FIGURE = 'metric.budgets-set';

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

/** `handed` as the record reads it, off the manifests it holds (`packages/record/src/index.ts`). */
const stateOf = (k: Kernel, sql: NodeSql): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
  detached: Object.fromEntries(k.detached().map((d) => [d.id, { was: d.was, body: d.body }])),
  handed: handedOf(sql.all<{ manifest: string }>('SELECT manifest FROM pack').map((r) => r.manifest)),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function put(k: Kernel, sql: NodeSql, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k, sql));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** A module as this build would put it into this record now, with no example rows. */
const documentFor = (k: Kernel, id: string): Body =>
  moduleDocument(null, id, { today: TODAY, holds: new Set([...held(k), ...firstPartyManifest(id as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]) }) as Body;

/** A module as brain.dog serves it, the frozen document, with no example rows. */
const released = (file: string): Body => ({ ...(JSON.parse(readFileSync(new URL(`./fixtures/released/${file}.json`, import.meta.url), 'utf8')) as Body), seeds: [] });

/** What `usecase-versions.test.ts` fingerprints: what reaches a record that already holds the use case. */
const fingerprint = (d: Body): string =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: d.declarations, config: d.config ?? null, ...(d.extends === undefined ? {} : { extends: d.extends }), ...(d.adds === undefined ? {} : { adds: d.adds }), ...(d.hands === undefined ? {} : { hands: d.hands }) }))
    .digest('hex')
    .slice(0, 16);

/** The fingerprint `usecase-versions.test.ts` records for the Personal 2.3.1 that shipped. */
const RELEASED_2_3_1 = '268bbef9b5df127a';

/** Personal 2.3.1 as the commit before 7e791810a held it: the document it shipped, with no example rows. It was rebuilt here by undoing each later version, and went red on 2.9.1. */
const personal231 = (): Body => ({ ...(JSON.parse(readFileSync(new URL('./fixtures/personal-2.3.1.json', import.meta.url), 'utf8')) as Body), seeds: [] });

/** A record on what is deployed: the three modules as released, then Personal 2.3.1, and a budget and a goal of its own. */
async function onReleased(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const file of ['portfolio-1.16.0', 'people-3.3.0', 'money-core-3.16.0']) await put(k, sql, released(file));
  const before = personal231();
  assert.equal(fingerprint(before), RELEASED_2_3_1, 'the frozen Personal is not the 2.3.1 that shipped');
  await put(k, sql, before);
  assert.equal(k.packs().find((p) => p.id === 'usecase-personal')?.version, '2.3.1');
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, '3.16.0');
  assert.equal(ownerOf(k), 'usecase-personal', 'on 2.3.1 the count is Personal’s');
  value(k.create('categories', { name: 'Groceries', direction: 'out', budget: { amount: 40_000, currency: 'GBP' } }, OWNER));
  value(k.create('goals', { what: 'Run a hundred kilometres', kind: 'goal', target: 100, unit: 'km' }, OWNER));
  return { k, sql };
}

/** The pack the live `budgets-set` is under, or `null` when the record holds none. */
const ownerOf = (k: Kernel): string | null => (k.declarations() as { id: string; pack_id: string | null }[]).find((d) => d.id === FIGURE)?.pack_id ?? null;

type Drawn = { heading?: string; refusals?: unknown[] };

/** The record after both updates, whichever way they came: one figure, Money's, and nothing a person had is gone. */
function settled(k: Kernel, how: string): void {
  assert.equal(k.packs().find((p) => p.id === 'usecase-personal')?.version, useCase('personal')!.version, how);
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, FIRST_PARTY_VERSIONS['money-core'], how);
  assert.equal((k.declarations() as { id: string }[]).filter((d) => d.id === FIGURE).length, 1, `${how}: the count is declared once`);
  assert.equal(ownerOf(k), 'money-core', `${how}: the count is Money's`);
  assert.ok(!k.packClaims('usecase-personal').includes(FIGURE), `${how}: Personal still claims the count`);
  assert.equal(k.count('categories'), 1, `${how}: the budget is kept`);
  assert.equal(k.count('goals'), 1, `${how}: the goal is kept`);
  const home = value<{ blocks: Drawn[] }>(k.page(homePageOf('personal'))).blocks;
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${how}: ${b.heading} was refused`);
  assert.ok(home.some((b) => b.heading === 'Budget left'), `${how}: Home draws ${home.map((b) => b.heading).join(', ')}, and no Budget left`);
  const money = value<{ blocks: Drawn[] }>(k.page('money')).blocks;
  for (const b of money) assert.deepEqual(b.refusals ?? [], [], `${how}: Money's ${b.heading} was refused`);
}

/** The port as a record lends it to the night's update: its own plan and install, and Decide. */
function portOf(k: Kernel, sql: NodeSql): QuietPort & { asked: QuietQuestion[] } {
  const asked: QuietQuestion[] = [];
  return {
    asked,
    held: () => k.packs().map((p) => ({ id: p.id, version: p.version, on: true })),
    document: (id) => documentFor(k, id),
    plan: async (doc): Promise<Result<Diff>> => {
      const pack = await normalise(doc, { kind: 'local' });
      if (!pack.ok) return pack as never;
      return { ok: true, value: await plan(pack.value, stateOf(k, sql)) };
    },
    install: async (doc, planHash) => {
      const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
      return install(pack, await plan(pack, stateOf(k, sql)), hostFor(k), planHash);
    },
    asking: (id) => value<{ body_kind: string; body: { install?: unknown } }[]>(k.openSuggestions()).some((q) => q.body_kind === 'pack' && q.body.install === id),
    propose: (q) => {
      asked.push(q);
      return k.propose(q, 'p_1');
    },
  };
}

test('ONE NIGHT: Money is planned again once Personal has handed the count on, and the night says one thing of it', async () => {
  const { k, sql } = await onReleased();
  const port = portOf(k, sql);

  const steps = await updateFirstParty(port);
  const money = steps.filter((s) => s.pack === 'money-core' && s.from === '3.16.0');
  /* ONE STEP, AND IT IS WHAT HAPPENED: the refusal the first plan met is not left beside the update that followed. */
  assert.deepEqual(money, [{ pack: 'money-core', from: '3.16.0', to: FIRST_PARTY_VERSIONS['money-core'], did: 'updated' }], JSON.stringify(steps));
  assert.deepEqual(steps.filter((s) => s.did === 'refused'), [], 'a refused step is left in the night');
  assert.equal(steps.find((s) => s.pack === 'usecase-personal')?.did, 'updated', JSON.stringify(steps));
  /* IN ITS OWN PLACE, where the five are said, before the use case that let it in. */
  assert.ok(steps.findIndex((s) => s.pack === 'money-core') < steps.findIndex((s) => s.pack === 'usecase-personal'), JSON.stringify(steps));
  assert.deepEqual(port.asked, [], 'nothing is lost by either update, so nothing is asked');
  settled(k, 'one night');

  /* AND THE NEXT NIGHT HAS NOTHING LEFT TO DO. */
  assert.deepEqual(await updateFirstParty(port), []);
  sql.close();
});

/** A plan that loses nothing and can go in, as far as the night reads one. */
const clean = (over: Partial<Diff> = {}): Diff =>
  ({
    requires: { format: { wanted: 1, has: 1, ok: true }, primitives: { wanted: 1, has: 1, ok: true }, packs: [] },
    dependents: [],
    adds: [],
    changes: [],
    retires: [],
    conflicts: [],
    retypes: [],
    newly_required: [],
    misreads: [],
    renames: [],
    unresolved: [],
    orphans: 0,
    approve: [],
    calls_out: [],
    planHash: 'h',
    ...over,
  }) as Diff;

const REFUSAL = { ok: false, refusal: { code: 'PACK_MALFORMED', fix: 'This document cannot be read.' } } as unknown as Result<Diff>;
const COUNT_HELD = { conflicts: [{ id: FIGURE, pack: 'usecase-personal' }] } as unknown as Partial<Diff>;
const RENAMED = { renames: [{ from: 'register.categories', to: 'register.envelopes' }] } as unknown as Partial<Diff>;

/**
 * A record that answers each plan as the test says, by pack and by how many times that pack was planned, and holds a
 * pack at the version this build ships once it is put in. Every pack named starts at 0.0.1. `planned` is how many times
 * each was planned before it went in.
 */
function scripted(plans: Record<string, (nth: number) => Result<Diff>>): QuietPort & { planned: Record<string, number>; asked: QuietQuestion[] } {
  const versions = new Map(Object.keys(plans).map((id) => [id, '0.0.1']));
  const planned: Record<string, number> = {};
  const asked: QuietQuestion[] = [];
  const idOf = (doc: Body): string => String(doc.pack);
  return {
    planned,
    asked,
    held: () => [...versions].map(([id, version]) => ({ id, version, on: true })),
    document: (id) => ({ pack: id, version: FIRST_PARTY_VERSIONS[id as keyof typeof FIRST_PARTY_VERSIONS] }),
    plan: async (doc) => {
      /* COUNTED WHILE IT IS STILL TO GO IN: at the version this build ships it is planned once more, for its links. */
      if (versions.get(idOf(doc)) === '0.0.1') planned[idOf(doc)] = (planned[idOf(doc)] ?? 0) + 1;
      return plans[idOf(doc)]!(planned[idOf(doc)]!);
    },
    install: async (doc) => {
      versions.set(idOf(doc), String(doc.version));
      return { ok: true, value: null };
    },
    asking: () => false,
    propose: (q) => {
      asked.push(q);
      return { ok: true, value: { id: 'q' } };
    },
  };
}

const ok = (over: Partial<Diff> = {}): Result<Diff> => ({ ok: true, value: clean(over) });
const WAITS = { pack: 'money-core', from: '0.0.1', to: FIRST_PARTY_VERSIONS['money-core'], did: 'refused', lose: ['take Budgets set from Personal'], why: 'It cannot go in over what is here now.' };

test('PLANNED AGAIN IN ITS OWN PLACE: the module whose holder went in is planned twice, and its one step is the later one', async () => {
  const port = scripted({ 'money-core': (nth) => (nth === 1 ? ok(COUNT_HELD) : ok()), 'usecase-personal': () => ok() });
  const steps = await updateFirstParty(port);
  assert.deepEqual(
    steps.map((s) => [s.pack, s.did]),
    [
      ['money-core', 'updated'],
      ['usecase-personal', 'updated'],
    ],
    JSON.stringify(steps),
  );
  assert.equal(port.planned['money-core'], 2);
  assert.deepEqual(port.asked, []);
});

test('REFUSED FOR ANOTHER REASON IS PLANNED ONCE: a rename, and a document that cannot be planned, wait for the next night', async () => {
  const port = scripted({ portfolio: () => REFUSAL, 'money-core': () => ok(RENAMED), 'usecase-personal': () => ok() });
  const steps = await updateFirstParty(port);
  assert.equal(steps.find((s) => s.pack === 'usecase-personal')?.did, 'updated', JSON.stringify(steps));
  assert.deepEqual(steps.find((s) => s.pack === 'portfolio'), { pack: 'portfolio', from: '0.0.1', to: FIRST_PARTY_VERSIONS.portfolio, did: 'refused', why: 'This document cannot be read.' });
  assert.equal(steps.find((s) => s.pack === 'money-core')?.did, 'refused', JSON.stringify(steps));
  assert.equal(steps.find((s) => s.pack === 'money-core')?.why, 'It cannot go in over what is here now.');
  assert.equal(port.planned.portfolio, 1, 'a document that could not be planned was planned again');
  assert.equal(port.planned['money-core'], 1, 'a rename no other pack holds was planned again');
});

test('A HOLDER THAT WAS REFUSED ITSELF LEAVES THE MODULE REFUSED, planned once, saying what it said', async () => {
  const port = scripted({ 'money-core': () => ok(COUNT_HELD), 'usecase-personal': () => ok(RENAMED) });
  const steps = await updateFirstParty(port);
  assert.equal(steps.find((s) => s.pack === 'usecase-personal')?.did, 'refused', JSON.stringify(steps));
  assert.deepEqual(steps.find((s) => s.pack === 'money-core'), WAITS, JSON.stringify(steps));
  assert.equal(port.planned['money-core'], 1, 'Money was planned again though Personal did not go in');
});

test('STILL IN THE WAY AFTER THE HOLDER WENT IN: planned twice and no more, and the later refusal is the one said', async () => {
  const port = scripted({ 'money-core': () => ok(COUNT_HELD), 'usecase-personal': () => ok() });
  const steps = await updateFirstParty(port);
  assert.deepEqual(steps.filter((s) => s.pack === 'money-core'), [WAITS], JSON.stringify(steps));
  assert.equal(steps.find((s) => s.pack === 'usecase-personal')?.did, 'updated', JSON.stringify(steps));
  assert.equal(port.planned['money-core'], 2);
});
