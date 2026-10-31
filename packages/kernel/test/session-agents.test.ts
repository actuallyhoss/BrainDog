/**
 * One run is one agent: a write that names no run joins its token's open run only when
 * both are the same kind of agent in the same app, and a name somebody gave a run is never taken for the record's.
 *
 * MEASURED BEFORE: every ChatGPT, VS Code and unknown run is `agent = 'other'`, and the ladder let `other` through, so a
 * ChatGPT call on a key Claude Code also held joined Claude's open run, and the run's app and name flipped with each
 * call after. And any "Claude in <words>" was the record's own name, so "Claude in the loop" became "Claude in braindog"
 * on the run's next call, with no line in its history.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type SessionHints, type WriteContext } from '../src/index.ts';
import { learned, recordNamed } from '../src/session.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const MIN = 60_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([TASKS]));
  return { k, sql, clock };
}

/** A write on the one key every app here shares, saying whatever its app says of itself. */
const on = (session: SessionHints): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session });

const write = (k: Kernel, what: string, session: SessionHints) => value(k.create('tasks', { what }, on(session)));

/** Each run as its app and its name, in order. */
const runs = (sql: NodeSql): string[] =>
  sql
    .all<{ client: string | null; doing: string | null }>(
      "SELECT json_extract(fields, '$.client') AS client, json_extract(fields, '$.doing') AS doing FROM entry WHERE register = 'session' ORDER BY seq",
    )
    .map((r) => `${r.client ?? '-'}: ${r.doing ?? '-'}`);

const CLAUDE = { client: 'claude-code', client_version: '2.1.4' };
const CHATGPT = { client: 'chatgpt', client_version: '1.2025.300', agent: 'other' };

test('A CHATGPT CALL ON CLAUDE’S KEY OPENS ITS OWN RUN, and Claude’s run keeps its app and its name', async () => {
  const { k, sql, clock } = await record();
  write(k, 'From Claude', CLAUDE);
  clock.advance(MIN);
  write(k, 'From ChatGPT', CHATGPT);
  clock.advance(MIN);
  write(k, 'From Claude again', CLAUDE);
  write(k, 'From ChatGPT again', CHATGPT);
  assert.deepEqual(runs(sql), ['claude-code: Claude Code run', 'chatgpt: ChatGPT run']);
  sql.close();
});

test('TWO APPS OF KIND OTHER ARE TWO RUNS, and one app spelled two ways is one', async () => {
  const { k, sql } = await record();
  write(k, 'a', CHATGPT);
  write(k, 'b', { client: 'Visual Studio Code', agent: 'other' });
  write(k, 'c', { client: 'ChatGPT ', agent: 'other' });
  write(k, 'd', { client: 'vscode' });
  assert.deepEqual(runs(sql), ['chatgpt: ChatGPT run', 'Visual Studio Code: VS Code run']);
  sql.close();
});

test('A RUN THAT SAYS NOTHING OF ITS APP IS STILL ADOPTED, and learns which agent it is; one that names another app is not', async () => {
  const { k, sql } = await record();
  /* A remote client that names no app and calls itself `other`: nothing says it is not the Claude that writes next. */
  write(k, 'a', { agent: 'other' });
  write(k, 'b', CLAUDE);
  assert.deepEqual(runs(sql), ['claude-code: Claude Code run']);
  assert.equal(k.get('S1')?.fields.agent, 'claude');

  /* An app the record does not know is still another app. */
  write(k, 'c', { client: 'Some Tool' });
  assert.deepEqual(runs(sql), ['claude-code: Claude Code run', 'Some Tool: Agent run']);

  /* An `other` run that names its app is that app's, and a Claude call never joins it. */
  const { k: k2, sql: sql2 } = await record();
  write(k2, 'a', CHATGPT);
  write(k2, 'b', { agent: 'claude' });
  assert.deepEqual(runs(sql2), ['chatgpt: ChatGPT run', '-: Claude run']);
  sql.close();
  sql2.close();
});

test('A RUN’S APP IS LEARNED ONCE, NEVER SWAPPED: another app naming the run leaves its app as it was', () => {
  const run = { fields: { agent: 'claude', client: 'claude-code', client_version: '2.1.4', doing: 'Claude Code run' }, created_at: '2026-10-06T12:00:00.000Z' };
  assert.deepEqual(learned(run, { client: 'chatgpt', client_version: '9' }, null), {});
  assert.deepEqual(learned(run, { client: 'claude-code', client_version: '2.1.5' }, null), { client_version: '2.1.5' });
  assert.deepEqual(learned({ ...run, fields: { doing: 'Agent run' } }, { client: 'chatgpt' }, null), { client: 'chatgpt', doing: 'ChatGPT' });
});

test('ONLY THE RECORD’S OWN NAMES ARE THE RECORD’S: "<Name> run", and "<Name> in" a project it knows or the run’s repository', () => {
  const run = (doing: string, more: Record<string, string> = {}) => ({ fields: { doing, ...more }, created_at: '2026-10-06T12:00:00.000Z' });
  assert.deepEqual(recordNamed(run('Claude run')), { name: 'Claude' });
  assert.deepEqual(recordNamed(run('Claude Code in BrainDog'), 'BrainDog'), { name: 'Claude Code' });
  assert.deepEqual(recordNamed(run('Claude in braindog', { repo: 'braindog' })), { name: 'Claude' });
  assert.deepEqual(recordNamed(run('Codex in Kiln'), 'BrainDog', ['BrainDog', 'Kiln']), { name: 'Codex' }, 'named in a project it has since left');

  /* A person's or an agent's words that only look like one. */
  assert.equal(recordNamed(run('Claude in the loop'), 'BrainDog', ['BrainDog', 'Kiln']), null);
  assert.equal(recordNamed(run('Cursor in dark mode', { repo: 'braindog' })), null);
  assert.equal(recordNamed(run('Claude Code in BrainDog')), null, 'a project nobody says the record knows');
  assert.equal(recordNamed(run('Claude in braindog today', { repo: 'braindog' })), null);
});

test('A NAME A PERSON GAVE THAT READS LIKE THE RECORD’S IS KEPT through the run’s next calls', async () => {
  const { k, sql, clock } = await record();
  value(k.runFor(on({ client_id: 'cc-1', ...CLAUDE, repo: 'braindog' })));
  assert.equal(k.get('S1')?.fields.doing, 'Claude Code in braindog');
  value(k.update('session', 'S1', { doing: 'Cursor in dark mode' }, { actor: 'p_owner' }));
  clock.advance(MIN);
  write(k, 'Next', { client_id: 'cc-1', ...CLAUDE });
  assert.equal(k.get('S1')?.fields.doing, 'Cursor in dark mode');
  sql.close();
});
