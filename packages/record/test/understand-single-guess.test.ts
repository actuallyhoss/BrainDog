/**
 * A run question with one guess is asked, not dropped (`loop/research-understanding-judge.md`, change 2): "Is that
 * Lantern?" with Yes and No, and a yes places the quiet runs in the places asked about and lists the remote on the
 * project, in one batch of the walk. Undo can then be held to one row of that batch (`undo({ row })`), and anything
 * else at `row` is refused there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, UndoPlan } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 2);
const HOUR = 3_600_000;
const OWNER = { actor: 'p_1' };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const PROJECTS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** One project listing `lantern` by its bare name, and two quiet runs in one checkout of it. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * HOUR);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([PROJECTS]));
  const k = api.kernel;
  const run = (doing: string) =>
    value<Entry>(k.create('session', { doing, agent: 'claude', state: 'done', remote: 'git@github.com:sam/lantern.git', repo: 'lantern' }, { ...OWNER, stamp: { project: '' } }));
  const runs = [run('Fix the retry'), run('Ship the cards')];
  const lantern = value<Entry>(k.create('things', { name: 'Lantern', repos: ['lantern'] }, OWNER));
  clock.set(NOW);
  return { api, sql, runs, lantern };
}

const open = (sql: NodeSql) =>
  sql.all<{ id: string; body: string; q: string }>(
    "SELECT s.id AS id, s.body AS body, e.to_v AS q FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest' WHERE s.status = 'open' AND s.body_kind = 'options'",
  );

test('ONE GUESS IS ASKED AS "Is that Lantern?", AND A YES PLACES THE RUNS AND LISTS THE REMOTE', async () => {
  const { api, sql, runs, lantern } = await record();
  await api.slashTick();
  const asked = open(sql).find((q) => q.q.includes('Is that Lantern?'));
  assert.ok(asked, open(sql).map((q) => q.q).join(' / '));
  const body = JSON.parse(asked.body) as { options: { id: string; label: string }[] };
  assert.deepEqual(
    body.options.map((o) => o.label),
    ['Yes', 'No'],
  );
  value(await api.decide({ id: asked.id, decide: { option: 'p1', reason: '' } }, owner));
  const spoken = api.kernel.nameOf(lantern.id);
  for (const r of runs) assert.equal(api.kernel.get(r.id)?.fields.project, spoken);
  assert.deepEqual(api.kernel.get(lantern.id)?.fields.repos, ['lantern', 'git@github.com:sam/lantern.git']);

  /* UNDO HELD TO ONE ROW OF THE BATCH puts back that run alone. */
  const batch = sql.one<{ batch: string }>("SELECT batch FROM event WHERE target = ? AND field = 'project' ORDER BY rowid DESC LIMIT 1", `entry:${runs[0]!.id}`)!.batch;
  const row = { register: 'session', seq: runs[0]!.seq! };
  const plan = value<UndoPlan>(await api.undo({ batch, row, dry: true }, owner));
  assert.deepEqual(plan.lines, ['Take Fix the retry out of Lantern']);
  value(await api.undo({ batch, row, hash: plan.hash }, owner));
  assert.equal(api.kernel.get(runs[0]!.id)?.fields.project ?? null, null);
  assert.equal(api.kernel.get(runs[1]!.id)?.fields.project, spoken);
  assert.deepEqual(api.kernel.get(lantern.id)?.fields.repos, ['lantern', 'git@github.com:sam/lantern.git']);
  /* THE REST OF THE BATCH IS STILL PUT BACK WHOLE LATER. */
  const rest = value<UndoPlan>(await api.undo({ batch, dry: true }, owner));
  value(await api.undo({ batch, hash: rest.hash }, owner));
  assert.equal(api.kernel.get(runs[1]!.id)?.fields.project ?? null, null);
  assert.deepEqual(api.kernel.get(lantern.id)?.fields.repos, ['lantern']);
  sql.close();
});

test('A NO PLACES NOTHING, AND IS NOT ASKED AGAIN', async () => {
  const { api, sql, runs } = await record();
  await api.slashTick();
  const asked = open(sql).find((q) => q.q.includes('Is that Lantern?'))!;
  value(await api.decide({ id: asked.id, decide: { option: 'none', reason: '' } }, owner));
  for (const r of runs) assert.equal(api.kernel.get(r.id)?.fields.project, '');
  api.kernel.setPref('slash', 'slash.last', null);
  await api.slashTick();
  assert.equal(open(sql).filter((q) => q.q.includes('Is that Lantern?')).length, 0);
  sql.close();
});

test('UNDO REFUSES A row THAT IS NOT A LIST AND A NUMBER, AT row', async () => {
  const { api, sql } = await record();
  for (const row of ['session#1', { register: 'session' }, { register: 'session', seq: 1.5 }, { register: '', seq: 1 }, { register: 'session', seq: 1, extra: true }]) {
    const out = (await api.undo({ batch: 'B1', row, dry: true }, owner)) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED', JSON.stringify(row));
    assert.equal(out.refusal?.at, 'row');
  }
  sql.close();
});
