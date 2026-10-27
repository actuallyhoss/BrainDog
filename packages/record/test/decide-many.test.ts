/**
 * One run's questions answered in one call: a cleanup run filed about twenty-five, and Approve all was
 * twenty-five `decide` calls. Now one call, one batch, and one Undo puts every one back; a refused member is named and
 * the rest stay written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const START = Date.UTC(2026, 9, 24, 7);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

type Many = { batch: string | null; decided: { id: string; decision: string | null }[]; refused: { id: string; fix: string }[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const claude: CallContext = {
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'cc-1', client: 'claude-code', host: 'mac', repo: 'braindog' },
};

async function asked(n: number) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => START } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const tasks: Entry[] = [];
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    const t = value<Entry>(await api.create({ register: 'tasks', fields: { name: `Tidy ${i}` } }, owner));
    tasks.push(t);
    ids.push(value<Asked>(await api.update({ register: 'tasks', seq: t.seq, patch: { state: 'done' } } as never, claude)).asked.id);
  }
  return { sql, api, tasks, ids };
}

const states = (api: Awaited<ReturnType<typeof asked>>['api'], tasks: Entry[]) => tasks.map((t) => api.kernel.get(`tasks#${t.seq}`)?.state);
/* THE RUN'S OWN QUESTIONS, open: the ladder's offer to stop asking, which twenty-four yeses earn, is not one of them. */
const open = (sql: Awaited<ReturnType<typeof asked>>['sql']) =>
  Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND opened_by <> 'rule:ladder'")?.n);

test('TWENTY-FOUR QUESTIONS FROM ONE RUN ANSWERED IN ONE CALL, ONE BATCH, AND ONE UNDO PUTS ALL OF THEM BACK', async () => {
  const { sql, api, tasks, ids } = await asked(24);
  assert.equal(open(sql), 24);
  const before = Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'decide'")?.n);

  const out = value<Many>(await api.decide({ ids, decide: { option: 'accept' } } as never, owner));
  assert.equal(out.decided.length, 24);
  assert.deepEqual(out.refused, []);
  assert.ok(out.batch !== null);
  assert.ok(states(api, tasks).every((s) => s === 'done'));
  assert.equal(open(sql), 0);
  /* ONE BATCH: every decision and its question's resolve wear it, so the log reads one change. */
  const batches = sql.all<{ b: string }>("SELECT DISTINCT batch AS b FROM event WHERE kind IN ('decide', 'resolve') AND rowid > ?", before).map((r) => r.b);
  assert.deepEqual(batches, [out.batch]);

  /* ONE UNDO, on any one of the decisions, puts every row back and asks every question again. */
  const decision = out.decided[0]!.decision!;
  const plan = value<{ hash: string }>(api.kernel.undoPlan({ decision }));
  value(api.kernel.undoApply({ decision }, plan.hash, 'p_1'));
  assert.ok(states(api, tasks).every((s) => s === 'open'), `not all put back: ${states(api, tasks).join()}`);
  assert.equal(open(sql), 24);
  sql.close();
});

test('A REFUSED MEMBER IS NAMED WITH ITS SENTENCE, AND THE REST STAY WRITTEN', async () => {
  const { sql, api, tasks, ids } = await asked(3);
  value(await api.decide({ id: ids[1]!, decide: { option: 'reject', reason: 'Not this one.' } } as never, owner));
  const out = value<Many>(await api.decide({ ids: [...ids, 'SG999'], decide: { option: 'accept' } } as never, owner));
  assert.deepEqual(out.decided.map((d) => d.id), [ids[0], ids[2]]);
  assert.deepEqual(out.refused.map((r) => r.id), [ids[1], 'SG999']);
  assert.match(out.refused[0]!.fix, /resolved|decision is made once/u);
  assert.match(out.refused[1]!.fix, /no suggestion called SG999/u);
  assert.deepEqual(states(api, tasks), ['done', 'open', 'done']);
  sql.close();
});

test('A GROUP IS ONE OPTION FOR ALL OF THEM, NEVER ROWS OR PARTS, AND NO TOKEN ANSWERS ONE', async () => {
  const { sql, api, ids } = await asked(2);
  const fixOf = (r: unknown) => (r as { refusal?: { at?: string } }).refusal?.at;
  assert.equal(fixOf(await api.decide({ ids: [], decide: { option: 'accept' } } as never, owner)), 'ids');
  assert.equal(fixOf(await api.decide({ ids: [ids[0], ids[0]], decide: { option: 'accept' } } as never, owner)), 'ids');
  assert.equal(fixOf(await api.decide({ ids, decide: { option: 'accept', rows: [0] } } as never, owner)), 'rows');
  assert.equal(fixOf(await api.decide({ ids, defer: { until: '2026-11-01', why: 'later' } } as never, owner)), 'decide');
  assert.equal(fixOf(await api.decide({ id: ids[0], ids, decide: { option: 'accept' } } as never, owner)), 'ids');
  const token = (await api.decide({ ids, decide: { option: 'accept' } } as never, claude)) as { ok: boolean };
  assert.equal(token.ok, false);
  assert.equal(open(sql), 2);
  sql.close();
});
