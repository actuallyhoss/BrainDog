/**
 * What the walk writes can be taken back, and what it answers is placed as the walk places (research-audit-20 H1, H2):
 * answering "which project?" places the quiet runs in exactly the places it asked about, in one batch signed by the walk,
 * which the owner's Undo and `understand({ undo: 'last' })` both put back; and `understandPlan` reads the walk's dry
 * slice for anybody who reads every list, and nobody else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, UndoPlan } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Understanding } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 2);
const HOUR = 3_600_000;
const OWNER = { actor: 'p_1' };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const register = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });

const PROJECTS = register({
  id: 'things',
  name: 'Projects',
  title: 'name',
  scopes: { repos: 'repos' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'repos', type: 'list', of: 'text' },
  ],
});

const ORGS = register({
  id: 'organisations',
  name: 'Organisations',
  title: 'name',
  org: { name: 'name', keys: 'keys', merged_into: 'merged_into' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'organisations' },
  ],
});

const LEDGER = register({
  id: 'transactions',
  name: 'Transactions',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'party', type: 'ref', to: 'organisations' },
    { id: 'note', type: 'text' },
  ],
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** Two projects both listing `tallow` by its bare name, and two quiet runs in one checkout of it, so the walk asks. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * HOUR);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([PROJECTS]));
  const k = api.kernel;
  const run = (fields: Record<string, unknown>) => value<Entry>(k.create('session', { doing: 'Work', agent: 'claude', state: 'done', ...fields }, { ...OWNER, stamp: { project: '' } })).id;
  const mine = [run({ remote: 'git@github.com:sam/tallow.git', repo: 'tallow' }), run({ remote: 'git@github.com:sam/tallow.git', repo: 'tallow' })];
  const tallow = value<Entry>(k.create('things', { name: 'Tallow', repos: ['tallow'] }, OWNER));
  value<Entry>(k.create('things', { name: 'Tallow Site', repos: ['tallow'] }, OWNER));
  clock.set(NOW);
  return { api, sql, clock, run, mine, tallow };
}

const asked = (sql: NodeSql, like: string) =>
  sql.one<{ id: string }>(
    "SELECT s.id AS id FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest' WHERE s.status = 'open' AND e.to_v LIKE ?",
    like,
  )?.id;

test('ANSWERING WHICH PROJECT PLACES ONLY THE QUIET RUNS IN THE PLACE ASKED ABOUT, as one batch of the walk', async () => {
  const { api, sql, clock, run, mine, tallow } = await record();
  assert.ok((await api.slashTick()).ran);
  const which = asked(sql, '%runs worked in tallow%');
  assert.ok(which, 'the walk asked which project');

  /* SOMEBODY ELSE'S tallow ON ANOTHER HOST, AND A RUN OF MINE STILL WORKING. */
  clock.set(NOW - 48 * HOUR);
  const theirs = run({ remote: 'https://gitlab.com/someone/tallow', repo: 'tallow' });
  clock.set(NOW);
  const working = value<Entry>(api.kernel.create('session', { doing: 'Now', agent: 'claude', state: 'active', remote: 'git@github.com:sam/tallow.git', repo: 'tallow' }, { ...OWNER, stamp: { project: '' } })).id;

  value(await api.decide({ id: which, decide: { option: 'p1', reason: '' } }, owner));
  const spoken = api.kernel.nameOf(tallow.id);
  for (const id of mine) assert.equal(api.kernel.get(id)?.fields.project, spoken);
  assert.equal(api.kernel.get(theirs)?.fields.project, '', 'a repository of the same name elsewhere stays where it is');
  assert.equal(api.kernel.get(working)?.fields.project, '', 'a run still working places itself');

  const lines = sql.all<{ batch: string; actor: string }>(
    `SELECT batch, actor FROM event WHERE target IN (${mine.map(() => '?').join(', ')}) AND kind = 'edit' AND field = 'project'`,
    ...mine.map((id) => `entry:${id}`),
  );
  assert.equal(new Set(lines.map((l) => l.batch)).size, 1, 'one batch');
  assert.deepEqual([...new Set(lines.map((l) => l.actor))], ['rule:backfill']);

  /* THE OWNER'S UNDO TAKES BOTH BACK, said in names. */
  const batch = lines[0]!.batch;
  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  /* AND THE REMOTE ASKED ABOUT IS LISTED ON THE PROJECT IN THE SAME BATCH, so later runs there place themselves; the
     other host's is not. */
  assert.deepEqual(api.kernel.get(tallow.id)?.fields.repos, ['tallow', 'git@github.com:sam/tallow.git']);
  assert.equal(plan.steps.length, 3);
  assert.deepEqual(plan.lines, ['Take Work out of Tallow', 'Take Work out of Tallow', 'Take the repository tallow off Tallow']);
  assert.doesNotMatch(JSON.stringify(plan.lines), /[0-9A-HJKMNP-TV-Z]{26}/u);
  value(await api.undo({ batch, hash: plan.hash }, owner));
  for (const id of mine) assert.equal(api.kernel.get(id)?.fields.project ?? null, null);
  assert.deepEqual(api.kernel.get(tallow.id)?.fields.repos, ['tallow']);
  sql.close();
});

test('THE LAST WALK IS KEPT WHERE UNDO FINDS IT', async () => {
  const { api, sql, mine } = await record();
  await api.slashTick();
  value(await api.decide({ id: asked(sql, '%runs worked in tallow%')!, decide: { option: 'p1', reason: '' } }, owner));
  const back = value<{ undone: number; said: string }>(await api.understand({ undo: 'last' }, owner));
  /* THE TWO RUNS AND THE REPOSITORY LISTED ON THE PROJECT. */
  assert.equal(back.undone, 3);
  assert.equal(back.said, 'Put back 3 changes the last walk made to Agent runs and Projects.');
  for (const id of mine) assert.equal(api.kernel.get(id)?.fields.project ?? null, null);
  /* AGAIN IS NOTHING. */
  assert.equal(value<{ undone: number }>(await api.understand({ undo: 'last' }, owner)).undone, 0);
  sql.close();
});

test('THE PLAN IS READ BY SOMEBODY WHO READS EVERY LIST, AND WRITES NOTHING', async () => {
  const { api, sql } = await record();
  const events = () => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')?.n);
  const before = events();
  const seen = value<Understanding>(await api.understandPlan({}, owner));
  assert.deepEqual(seen, value<Understanding>(await api.understand({ dry: true }, owner)));
  assert.ok(seen.questions.includes('2 runs worked in tallow. Is that Tallow or Tallow Site?'), seen.questions.join(' / '));
  const whole: CallContext = { principal: { kind: 'token', id: 't_whole', scope: 'propose', person: 'p_1', level: 'owner' }, credentialed: true };
  assert.deepEqual(value<Understanding>(await api.understandPlan({}, whole)), seen);
  assert.equal(events(), before, 'nothing written');

  /* A MEMBER INVITED TO ONE LIST IS TOLD WHY NOT. */
  const one: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['things'], credentialed: true };
  const refused = (await api.understandPlan({}, one)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(refused.refusal?.code, 'FORBIDDEN');
  assert.match(refused.refusal?.fix ?? '', /reads every list/u);
  sql.close();
});

test('A SLICE OF THE WALK IS PUT BACK BY UNDO ON ITS BATCH, a look and then a press', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([ORGS, LEDGER]));
  const lowry = value<Entry>(api.kernel.create('organisations', { name: 'Lowry St Studios' }, OWNER));
  for (const what of ['LOWRY ST STUDIOS RENT AUG', 'LOWRY ST STUDIOS RENT SEP']) value(api.kernel.create('transactions', { what, amount: { amount: -1_250, currency: 'GBP' } }, OWNER));
  const parties = () => sql.all<{ p: string | null }>("SELECT json_extract(fields, '$.party') AS p FROM entry WHERE register = 'transactions' ORDER BY rowid").map((r) => r.p);
  const done = value<Understanding>(await api.understand({}, owner));
  assert.deepEqual(parties(), [lowry.id, lowry.id]);
  const batch = done.undo![0]!;
  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  assert.ok(plan.lines.includes('Unlink LOWRY ST STUDIOS RENT AUG from Lowry St Studios'), plan.lines.join(' / '));
  value(await api.undo({ batch, hash: plan.hash }, owner));
  assert.deepEqual(parties(), [null, null]);
  assert.equal(value<UndoPlan>(await api.undo({ batch, dry: true }, owner)).already, true);
  sql.close();
});

test('AN ORGANISATION THE WALK MADE AND LINKED IN ONE SLICE IS SAID AS REMOVED, as Undo removes it', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([ORGS, LEDGER]));
  for (const n of [1, 2]) value(api.kernel.create('transactions', { what: `AMAZON ${n}`, note: 'Payee: Amazon Ltd.', amount: { amount: -1_250, currency: 'GBP' } }, OWNER));
  const done = value<Understanding>(await api.understand({}, owner));
  assert.ok(done.writes.includes('Added Amazon Ltd to Organisations'), done.writes.join(' / '));
  const batch = done.undo![0]!;
  const plan = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  assert.equal(plan.skipped.length, 0, plan.lines.join(' / '));
  assert.ok(plan.lines.includes('Remove Amazon Ltd from Organisations'), plan.lines.join(' / '));
  const put = value<{ put: number }>(await api.undo({ batch, hash: plan.hash }, owner));
  assert.equal(put.put, plan.steps.length, 'what was said is what was put back');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'organisations' AND deleted_at IS NULL")?.n, 0);
  sql.close();
});
