/**
 * What the owner's agent asked and he never got to settles itself on the next sweep, and lands in Handled today with
 * the decision one Undo puts back (DIRECTION d3; live 20 Oct: none of 71 open questions ever settled).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const HOUR = 3_600_000;
const START = Date.UTC(2026, 9, 20, 7);

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

test('HIS AGENT\'S "MARK … DONE?" SETTLES ON THE NEXT SWEEP, ONE LINE IN HANDLED TODAY, AND UNDO PUTS IT BACK', async () => {
  const sql = openSqlite();
  let now = START;
  const api = await createRecordApi({ sql, clock: { now: () => now } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const ship = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Ship the build' } }, owner));
  const out = value<Asked>(await api.update({ register: 'tasks', seq: ship.seq, patch: { state: 'done' } } as never, claude));
  assert.equal(out.asked.question, 'Mark Ship the build done?');
  assert.equal(value<{ rows: unknown[] }>(await api.handled({}, owner)).rows.length, 0);

  now = START + 2 * HOUR;
  api.kernel.purge();

  const handled = value<{ rows: { decision: string; line: string; why: string }[] }>(await api.handled({}, owner));
  assert.equal(handled.rows.length, 1);
  assert.equal(handled.rows[0]!.line, 'Mark Ship the build done');
  assert.equal(api.kernel.get(`tasks#${ship.seq}`)?.state, 'done');
  const decision = handled.rows[0]!.decision;
  const plan = value<{ hash: string }>(api.kernel.undoPlan({ decision }));
  value(api.kernel.undoApply({ decision }, plan.hash, 'p_1'));
  assert.equal(api.kernel.get(`tasks#${ship.seq}`)?.state, 'open');
  assert.equal(value<{ rows: unknown[] }>(await api.handled({}, owner)).rows.length, 0, 'a line put back leaves the list');
  sql.close();
});
