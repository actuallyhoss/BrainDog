/**
 * The team pack's Home drawing one ticket under two headings.
 *
 * A usability pass measured this on `home-team`: `Blocked` is `state is blocked` and
 * `Due this week` is `state is not done or dropped, by before +8d`, so a blocked ticket with a date
 * inside the week is drawn twice and a team lead counting the board counts it twice. Driven on a
 * record made the way onboarding makes one, Home drew five rows and `Wait on the design for the
 * settings screen` was two of them. `79f17031` fixed the same construction on the Work pack's own
 * Overview an hour earlier.
 *
 * THE CAVEAT IS WHY THE CLAUSE IS THREE STATES AND NOT ONE. `In flight` above `Blocked` is
 * `state is doing or review` and overlaps `Due this week` by exactly the same construction. It does
 * not bite on the example rows, because the two tickets that are doing and in review carry no due
 * day at all, which is how the overlap survived every screenshot anybody took of this page. The
 * second test below plants the row the examples do not have rather than trusting that, because a
 * guard that passes only while the sample happens to be shaped a certain way is a guard that will
 * be green on the day somebody gives an in-progress ticket a deadline.
 *
 * AND THE DUE DAY HAS TO SURVIVE THE FIX, which is the third test. Holding what is in flight back
 * from `Due this week` takes that ticket's date off the screen unless `In flight` says it, because
 * `In flight` drew Ticket, Owner, Agent and Status and no date at all. `Blocked` already had its
 * own Due column and needed nothing.
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

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** The lists a record holds now, by register id. */
const held = (k: Kernel): string[] =>
  (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

/**
 * A TEAM'S RECORD AS ONBOARDING MAKES ONE: each module in order with People for the person, then the use case's own
 * pack. This is `usecase-install.test.ts`'s `made()`, spelt again here because that file owns its own helpers and a
 * second file reaching into them would tie two suites together for four lines.
 */
async function board(): Promise<{ k: Kernel; sql: NodeSql }> {
  const u = useCase('team')!;
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  const carried = carriedDocument(u, TODAY, null, { examples: true });
  if (carried) await put(k, carried);
  return { k, sql };
}

type Drawn = { heading?: string; rows?: { id: string; fields: Record<string, unknown> }[]; columns?: { field?: string }[]; refusals?: unknown[] };

const home = (k: Kernel): Drawn[] => value<{ blocks: Drawn[] }>(k.page(homePageOf('team'))).blocks;

const headed = (blocks: Drawn[], heading: string): Drawn => {
  const found = blocks.find((b) => b.heading === heading);
  assert.ok(found, `the team's Home has no block headed ${heading}`);
  assert.deepEqual(found.refusals ?? [], [], `${heading} refused`);
  return found;
};

const titles = (b: Drawn): string[] => (b.rows ?? []).map((r) => String(r.fields.what));

test('NO TICKET IS DRAWN UNDER BOTH BLOCKED AND DUE THIS WEEK, because a team lead reading down Home counts it twice', async () => {
  const { k, sql } = await board();
  const blocks = home(k);

  const blocked = headed(blocks, 'Blocked');
  const due = headed(blocks, 'Due this week');
  assert.ok(blocked.rows!.length > 0 && due.rows!.length > 0, 'the example tickets need rows under both for this to bite');

  const above = new Set(blocked.rows!.map((r) => r.id));
  assert.deepEqual(due.rows!.filter((r) => above.has(r.id)).map((r) => String(r.fields.what)), [], 'drawn under Blocked and again under Due this week');
  sql.close();
});

test('and none under both In flight and Due this week, which the example rows do not happen to show', async () => {
  const { k, sql } = await board();

  /*
   * THE ROW THE EXAMPLES DO NOT HAVE. Both in-flight example tickets carry no due day, so the overlap between
   * `state is doing or review` and `state is not done or dropped, by before +8d` is empty on a fresh record and a
   * screenshot of this page says nothing about it. Giving the in-progress ticket a deadline three days out is the
   * smallest thing a real team would do on its first morning, and it is what makes the second heading draw it again.
   */
  const tasks = value<{ rows: { id: string; fields: Record<string, unknown> }[] }>(k.list({ register: 'tasks', limit: 100 })).rows;
  const doing = tasks.find((r) => r.fields.state === 'doing');
  assert.ok(doing, 'the example tickets no longer hold one in progress, so this test is measuring nothing');
  value(k.update('tasks', doing.id, { by: dayOf(NOW + 3 * 86_400_000) }, { actor: 'p_seed' }));

  const blocks = home(k);
  const flight = headed(blocks, 'In flight');
  const due = headed(blocks, 'Due this week');
  const above = new Set(flight.rows!.map((r) => r.id));
  assert.ok(above.size > 0, 'nothing is in flight, so this test is measuring nothing');

  assert.deepEqual(due.rows!.filter((r) => above.has(r.id)).map((r) => String(r.fields.what)), [], 'drawn under In flight and again under Due this week');

  /* AND THE REST OF DUE THIS WEEK IS STILL THERE, so that the clause narrows the heading rather than emptying it. */
  assert.deepEqual(titles(due), ['Agree what goes in the next sprint']);
  sql.close();
});

test('and In flight says when each ticket is due, so holding it back from Due this week does not lose the date', async () => {
  const { k, sql } = await board();
  const flight = headed(home(k), 'In flight');
  const columns = (flight.columns ?? []).map((c) => String(c.field));
  assert.ok(columns.includes('by'), `In flight draws ${columns.join(', ')} and no due day`);
  sql.close();
});
