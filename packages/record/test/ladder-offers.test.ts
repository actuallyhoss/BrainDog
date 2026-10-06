/**
 * A waiting rung offer is withdrawn when the ladder drops the kind it offers (research-audit-20 M2): "you kept them all"
 * stops being true at the drop, and a yes to it afterwards would set the rung the drop took away.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

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
      { id: 'cost', type: 'money' },
    ],
  } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** An agent on a write grant the record holds, in one app, as a host hands it over. */
const agent = (app = 'claude-code', client = 'c1'): CallContext => ({
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: client, client: app, host: 'mac', repo: 'braindog' },
});

async function record(at = NOW) {
  const sql = openSqlite();
  const clock = { now: () => at };
  const api = await createRecordApi({ sql, clock: clock as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS, PEOPLE]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  return { api, sql, clock };
}

const rung = (sql: NodeSql, kind: string): string | null =>
  sql.one<{ rung: string; dropped_at: string | null }>('SELECT rung, dropped_at FROM ladder WHERE agent = ? AND kind = ?', 't_claude', kind)?.rung ?? null;
const open = (sql: NodeSql) => sql.all<{ id: string; opened_by: string; body_kind: string }>("SELECT id, opened_by, body_kind FROM suggestion WHERE status = 'open' ORDER BY rowid");

test('A DROP WITHDRAWS THE OFFER WAITING FOR THAT KIND, so a yes to it can never set the rung', async () => {
  const { api, sql } = await record();
  for (let i = 0; i < 10; i += 1) {
    value<Asked>(await api.create({ register: 'tasks', fields: { name: `Task ${i}` } }, agent()));
    const id = open(sql).find((q) => q.body_kind === 'rowset')!.id;
    value(await api.decide({ id, decide: { option: 'accept', reason: 'fine' } }, owner));
  }
  const offer = open(sql).find((q) => q.opened_by === 'rule:ladder');
  assert.ok(offer, 'the next rung is offered');
  /* THREE DECLINES IN A ROW OF THE SAME KIND TAKE IT BACK TO ASK. */
  for (let i = 0; i < 3; i += 1) {
    const filed = value<{ id: string }>(await api.propose({ question: `Add ${i}?`, body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: `No ${i}` }] } }, agent()));
    value(await api.decide({ id: filed.id, resolved_as: 'wont-fix', reason: 'no' }, owner));
  }
  assert.equal(open(sql).some((q) => q.id === offer.id), false, 'the offer no longer waits');
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM pref WHERE person_id = 'ladder:offers'")?.n, 0);
  const late = (await api.decide({ id: offer.id, decide: { option: 'yes', reason: '' } }, owner)) as { ok: boolean };
  assert.equal(late.ok, false, 'a settled offer cannot be answered yes');
  assert.equal(rung(sql, 'tasks:add'), 'ask');
  sql.close();
});
