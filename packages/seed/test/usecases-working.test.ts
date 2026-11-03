/**
 * The three use cases that draw the agents working now (Solo founder, Small business, Team board) read the record's
 * own working runs, and none of them keeps a clause of its own (agents 1.9.0).
 *
 * EIGHT READERS WORKED OUT "WORKING" EIGHT WAYS. These three read the Agents add-on's clause, active and heard from
 * today, so the founder's Home on the owner's record listed four agents at work over last-seen times of 11 minutes, 35
 * minutes, 2 hours and 4 hours. The record now answers once (`sessions.working`, counted by the built-in
 * `runs-working`, both over `workingRuns` in `packages/kernel/src/presence.ts`), and a page names that source and no
 * `where:`, so no page can count working its own way again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, homePageOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);

/** The three use cases, and the page of each that draws the agents working now. */
const READERS = [
  { id: 'founder', page: homePageOf('founder') },
  { id: 'business', page: homePageOf('business') },
  { id: 'team', page: 'agent-work' },
] as const;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

type Block = { kind?: string; heading?: string; source?: string; where?: unknown; when?: { metric?: string }; body?: string; blocks?: Block[] };

/** Every block a document's pages hold, a section's own blocks included. */
const blocksOf = (doc: unknown): Block[] => {
  const pages = ((doc as { declarations?: { page?: string; blocks?: Block[] }[] }).declarations ?? []).filter((d) => d.page !== undefined);
  const walk = (blocks: Block[]): Block[] => blocks.flatMap((b) => [b, ...walk(b.blocks ?? [])]);
  return walk(pages.flatMap((p) => p.blocks ?? []));
};

/* ── the documents ───────────────────────────────────────────────────────── */

test('EACH USE CASE BUILDS WITH NO CLAUSE OF ITS OWN for who is working', async () => {
  for (const { id } of READERS) {
    const doc = carriedDocument(useCase(id)!, TODAY, null, { examples: true });
    assert.ok(doc, `${id} carries no pack`);
    value<Pack>(await normalise(doc, { kind: 'local' }));
    const blocks = blocksOf(doc);
    const working = blocks.filter((b) => b.heading === 'Working now');
    assert.equal(working.length, 1, `${id} draws the agents working now ${working.length} times`);
    assert.equal(working[0]!.source, 'sessions.working', `${id} reads working runs from ${working[0]!.source}`);
    assert.equal(working[0]!.where, undefined, `${id} narrows the working runs with a clause of its own`);
    /* AND NO OTHER BLOCK ASKS THE LIVE RUNS WHICH ARE WORKING. */
    for (const b of blocks.filter((x) => x.source === 'sessions.live'))
      assert.doesNotMatch(JSON.stringify(b.where ?? ''), /state is active|last_seen/u, `${id}: ${b.heading} works out working by itself`);
    assert.doesNotMatch(JSON.stringify(doc), /agents-working/u, `${id} reads the add-on's old figure`);
  }
});

test("THE FOUNDER'S HOME SAYS NO LINE OF HOW MANY AGENTS WORK NOW SINCE Founder 3.10.0: the table of them is the count", () => {
  /* "2 agent(s) are working now." went on 3 Nov ("i dont like those briefs at all, remove them"): it counted what the
     rail, the Agents page and Working now under it count. The table and its fold are held above. */
  const doc = carriedDocument(useCase('founder')!, TODAY, null, { examples: true });
  assert.equal(blocksOf(doc).find((b) => b.kind === 'note' && /working now/u.test(b.body ?? '')), undefined, 'the founder still has a line for the agents working now');
  assert.equal(blocksOf(doc).some((b) => /\{\{runs-working\}\}/u.test(b.body ?? '')), false);
});

/* ── on a record ─────────────────────────────────────────────────────────── */

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
  config: k.packSettings(),
});

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

/** A record made the way onboarding makes one, as `usecase-install.test.ts` makes it. */
async function made(id: string): Promise<{ k: Kernel; sql: NodeSql }> {
  const u = useCase(id)!;
  const { k, sql } = await record();
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  const carried = carriedDocument(u, TODAY, null, { examples: true });
  if (carried) await put(k, carried);
  return { k, sql };
}

type Drawn = { heading?: string; kind: string; drawn?: boolean; rows?: { fields: Record<string, unknown> }[]; refusals?: unknown[] };

test('ON A RECORD, EACH DRAWS ONLY THE RUN HEARD FROM INSIDE FIFTEEN MINUTES', async () => {
  const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
  for (const { id, page } of READERS) {
    const { k, sql } = await made(id);
    /* STAMPED AS THE RECORD STAMPS A RUN: one typing now, one quiet for twenty minutes, one left open since yesterday. */
    const run = (doing: string, minutes: number) =>
      value(k.create('session', { doing, agent: 'claude', state: 'active' } as never, { actor: 'p_seed', stamp: { last_seen: ago(minutes) } }));
    run('Typing now', 3);
    run('Quiet for twenty minutes', 20);
    run('Left open since yesterday', 26 * 60);
    const blocks = value<{ blocks: Drawn[] }>(k.page(page)).blocks;
    for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${id}: ${b.heading} was refused`);
    const working = blocks.find((b) => b.heading === 'Working now');
    assert.ok(working && working.drawn !== false, `${id} does not draw the agents working now`);
    assert.deepEqual(working.rows?.map((r) => r.fields.doing), ['Typing now'], `${id} lists a quiet run as working`);
    const read = k.metric(k.metricDecl('runs-working')!);
    assert.ok(read.ok, JSON.stringify(read));
    assert.equal(read.value.value, 1, `${id}: the record's count is not the runs the page draws`);
    sql.close();
  }
});
