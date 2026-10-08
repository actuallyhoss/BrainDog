/**
 * `withdraw`: an agent takes back a question it asked (AGT-C07, `src/methods/withdraw.ts`). Only the run that asked it,
 * or a later run on the same key, may; anybody else is told so with the fix, and answers it in Decide instead.
 *
 * Through the real record and the kernel's own rule (`govern.ts`'s `withdraw`), with two agent keys and the owner, and
 * the door's own shape (what it takes, what it hands the kernel) over the method file alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok, type Refusal, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, ONLY_THE_ASKER } from '../src/methods/withdraw.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const claude: CallContext = {
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c1', client: 'claude-code', host: 'mac', repo: 'braindog' },
};
const codex: CallContext = {
  principal: { kind: 'token', id: 't_codex', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'x1', client: 'codex', host: 'mac', repo: 'braindog' },
};

const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await api.kernel.install([TASKS])).ok);
  for (const [id, label] of [['t_claude', 'Claude Code'], ['t_codex', 'Codex']] as const)
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, 'p_1', ?, 'write', ?, '2026-10-01T00:00:00.000Z')", id, `h_${id}`, label);
  return { api, sql };
}

const state = (sql: NodeSql, id: string) => sql.one<{ status: string; resolved_as: string | null }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', id);

test('ONLY THE RUN THAT ASKED TAKES IT BACK: another agent and the owner are told the fix, and the asker closes it', async () => {
  const { api, sql } = await record();
  const filed = await api.propose({ question: 'Add Ship?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: 'Ship' }] } }, claude);
  assert.ok(filed.ok, JSON.stringify(filed));
  const id = (filed.value as { id: string }).id;
  assert.match(id, /^SG\d+$/u);

  for (const who of [codex, owner]) {
    const out = await api.withdraw({ id }, who);
    assert.equal(out.ok, false, 'only the asker');
    assert.equal(refusal(out).code, 'FORBIDDEN');
    assert.equal(refusal(out).fix, ONLY_THE_ASKER);
    assert.equal(state(sql, id)?.status, 'open');
  }

  const out = await api.withdraw({ id }, claude);
  assert.deepEqual(out, { ok: true, value: { id, state: 'withdrawn' } });
  assert.deepEqual({ ...state(sql, id) }, { status: 'resolved', resolved_as: 'withdrawn' });
  assert.equal(refusal(await api.withdraw({ id }, claude)).code, 'TRANSITION_ILLEGAL', 'a closed question has nothing to take back');
  sql.close();
});

test('THE DOOR TAKES ONE QUESTION BY NAME, hands the kernel the caller as a token and its hints, and opens no run', async () => {
  const handed: unknown[] = [];
  const kernel = {
    withdraw: (w: unknown, a: { id: string }) =>
      (handed.push(w),
      a.id === 'SG2'
        ? no('FORBIDDEN', 'SG2 was asked by another agent.', { at: 'id' })
        : a.id === 'SG3'
          ? no('FORBIDDEN', 'S7 is a run another key opened.', { at: 'session' })
          : ok({ id: a.id, state: 'withdrawn' as const })),
  };
  const deps = { kernel, guard: () => null, no, tail: async <T>(o: T) => o } as unknown as RecordDeps;
  const api = methods(deps);
  assert.equal(refusal(await api.withdraw({}, claude)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.withdraw({ id: 'SG 1' }, claude)).code, 'VALUE_MALFORMED');
  assert.equal(handed.length, 0, 'nothing malformed reached the kernel');
  assert.deepEqual(await api.withdraw({ id: 'SG1' }, claude), { ok: true, value: { id: 'SG1', state: 'withdrawn' } });
  assert.deepEqual(handed[0], { actor: 'agent:claude', principal: { kind: 'token', token: 't_claude' }, session: claude.session });
  const theirs = await api.withdraw({ id: 'SG2' }, claude);
  assert.equal(refusal(theirs).fix, ONLY_THE_ASKER);
  assert.equal(refusal(theirs).at, 'id');
  const foreign = await api.withdraw({ id: 'SG3' }, claude);
  assert.equal(refusal(foreign).fix, 'S7 is a run another key opened.', 'a refusal about the run keeps its own fix');

  const older = methods({ ...deps, kernel: {} } as unknown as RecordDeps);
  assert.equal(refusal(await older.withdraw({ id: 'SG1' }, claude)).code, 'NOT_IN_THIS_BUILD');
});
