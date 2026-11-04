/**
 * Personal 2.4.0 hands the count of budgets set to Money (budgets-set-73).
 *
 * WHY THERE IS A HAND-OVER AT ALL. money-core 3.17.0 declares `metric.budgets-set` itself, so its Budgets tile has the
 * count on a record with no use case, and Personal 2.3.1 declared the same id. Two packs cannot own one declaration, so
 * with both in the tree Personal could not be installed beside Money (`PROVIDES_CONFLICT`). Personal 2.4.0 stops
 * declaring the figure and says where it went (`hands`), as Founder 2.0.0 did with its organisations.
 *
 * WHAT THIS HOLDS: that a record on what brain.dog serves today (commit 63423720: Personal 2.3.1 over money-core 3.16.0,
 * people 3.3.0 and portfolio 1.16.0) can take the update, in which order, and what it meets in the other order. The
 * three modules are the frozen documents (`fixtures/released/`). There is no frozen file for a use case, so Personal
 * 2.3.1 is this build's document with the hand-over undone, held to the fingerprint `usecase-versions.test.ts` records
 * for the 2.3.1 that shipped, so a rebuild that drifts from what a record holds fails at its own line and not later.
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
import { useCase, useCaseDocument } from '../src/usecases/index.ts';
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

test('PERSONAL 2.4.0 DECLARES NO budgets-set AND HANDS IT TO MONEY, which declares the count Personal 2.3.1 did, to the letter', async () => {
  const doc = useCaseDocument('personal', TODAY) as Body;
  assert.deepEqual(doc.hands, { [FIGURE]: 'money-core' });
  assert.ok(!(doc.declarations as Body[]).some((d) => d.metric === 'budgets-set'), 'Personal still declares the count');
  const was = (personal231().declarations as Body[]).find((d) => d.metric === 'budgets-set')!;
  const now = (documentFor(await openRecord(openSqlite(), fixedClock(NOW)), 'money-core').declarations as Body[]).find((d) => d.metric === 'budgets-set');
  assert.ok(now, 'Money does not declare the count Personal hands it');
  for (const key of ['source', 'where', 'value', 'format'] as const) assert.deepEqual(now[key], was[key], `Money counts by another ${key} than Personal did`);
});

test('MONEY FIRST, BY ITSELF, IS REFUSED AT THE COUNT, and the record is left as it was', async () => {
  const { k, sql } = await onReleased();
  const money = value<Pack>(await normalise(documentFor(k, 'money-core'), { kind: 'local' }));
  const diff = await plan(money, stateOf(k, sql));
  assert.deepEqual(diff.conflicts.map((c) => [c.id, c.pack]), [[FIGURE, 'usecase-personal']], 'the one thing in the way is the count Personal 2.3.1 holds');
  const refused = (await install(money, diff, hostFor(k), diff.planHash)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.code, 'PROVIDES_CONFLICT');
  assert.equal(k.packs().find((p) => p.id === 'money-core')?.version, '3.16.0', 'a refused update moved Money');
  assert.equal(ownerOf(k), 'usecase-personal');
  assert.equal(k.count('categories'), 1);
  sql.close();
});

test('PERSONAL FIRST, THEN MONEY: each goes in by itself, the count moves with its id, and Home still draws Budget left', async () => {
  const { k, sql } = await onReleased();
  await put(k, sql, { ...(useCaseDocument('personal', TODAY) as Body), seeds: [] });
  /* BETWEEN THE TWO the count is live under Money's name, on a Money that does not declare it yet, and Home reads it. */
  assert.equal(k.packs().find((p) => p.id === 'usecase-personal')?.version, useCase('personal')!.version);
  assert.equal(ownerOf(k), 'money-core', 'the count was retired or kept, and not handed');
  const between = value<{ blocks: Drawn[] }>(k.page(homePageOf('personal'))).blocks;
  for (const b of between) assert.deepEqual(b.refusals ?? [], [], `between the two updates ${b.heading} was refused`);
  assert.ok(between.some((b) => b.heading === 'Budget left'), 'between the two updates Home lost Budget left');

  for (const m of ['portfolio', 'people', 'money-core']) await put(k, sql, documentFor(k, m));
  settled(k, 'Personal first');
  sql.close();
});

test('BOTH IN ONE PLAN, as a use case is planned: Money first, told what Personal is about to hand it, then Personal', async () => {
  const { k, sql } = await onReleased();
  const next = { ...(useCaseDocument('personal', TODAY) as Body), seeds: [] };
  const hands = (next as { hands?: Record<string, string> }).hands ?? {};
  for (const m of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(documentFor(k, m), { kind: 'local' }));
    const state = stateOf(k, sql);
    const diff = await plan(pack, { ...state, handed: { ...state.handed, ...hands } });
    assert.deepEqual(diff.conflicts, [], `${m}: ${JSON.stringify(diff.conflicts)}`);
    if (m === 'money-core') assert.ok(diff.changes.some((c) => c.id === FIGURE && c.from === 'usecase-personal'), 'Money does not take the count over from Personal');
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  await put(k, sql, next);
  settled(k, 'one plan');
  sql.close();
});

test('THE NIGHT TAKES ONE: Money waits for Personal to hand the count on, then follows the same night, with nothing asked', async () => {
  const { k, sql } = await onReleased();
  const port = portOf(k, sql);

  /* WHAT STANDS IN THE WAY WHEN THE NIGHT FIRST PLANS MONEY, before Personal: the count, which no yes could move, so it
     is refused and never asked about (`night-one-pass.test.ts` holds what is said when Personal does not go in). */
  const before = value<Diff>(await port.plan(documentFor(k, 'money-core')));
  assert.deepEqual(before.conflicts.map((c) => [c.id, c.pack]), [[FIGURE, 'usecase-personal']]);

  const night = await updateFirstParty(port);
  assert.equal(night.find((s) => s.pack === 'usecase-personal')?.did, 'updated', JSON.stringify(night));
  /* ONE STEP FOR MONEY, the update: the refusal it met first is not left in what the record is told of the night. */
  assert.deepEqual(night.filter((s) => s.pack === 'money-core' && s.from === '3.16.0'), [{ pack: 'money-core', from: '3.16.0', to: FIRST_PARTY_VERSIONS['money-core'], did: 'updated' }], JSON.stringify(night));
  assert.deepEqual(night.filter((s) => s.did === 'refused'), [], JSON.stringify(night));
  assert.deepEqual(port.asked, [], 'nothing is lost by either update, so nothing is asked');
  settled(k, 'one night');

  assert.deepEqual(await updateFirstParty(port), [], 'the next night found something left to do');
  sql.close();
});
