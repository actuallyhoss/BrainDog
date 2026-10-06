/**
 * A grant narrowed to some of a list's things (`wheres`) does not read every list (research-audit-22 H1, M5): a token at
 * `read` on the whole record held to one project's rows is refused `understandPlan`, which names payments, payees and
 * runs from everywhere; the question card does not hand it the run that asked or what the row holds now; and a key held
 * by somebody outside its rows is refused without naming them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Asked, type CallContext, type Understanding } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
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

const TASKS = register({
  id: 'tasks',
  name: 'Tasks',
  title: 'name',
  state: 'state',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['open', 'done'], labels: { open: 'Open', done: 'Done' }, default: 'open' },
    { id: 'cost', type: 'money', label: 'Cost' },
  ],
});

const PEOPLE = register({
  id: 'people',
  name: 'People',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'email', type: 'email', index: true },
    { id: 'merged_into', type: 'ref', to: 'people' },
  ],
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A token of the owner's at `read` on the whole record, held to the rows of one list `where` says. */
const narrowed = (list: string, where: Record<string, unknown>): CallContext => ({
  principal: { kind: 'token', id: 't_narrow', scope: 'read', person: 'p_1', level: 'owner' },
  wheres: { [list]: where } as never,
  credentialed: true,
});

test('A WHOLE-RECORD READ TOKEN NARROWED BY wheres IS REFUSED understandPlan, and its whole twin is answered', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * HOUR);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([PROJECTS]));
  for (const n of [1, 2]) value(api.kernel.create('session', { doing: `Work ${n}`, agent: 'claude', state: 'done', remote: 'git@github.com:sam/tallow.git', repo: 'tallow' }, { ...OWNER, stamp: { project: '' } }));
  value<Entry>(api.kernel.create('things', { name: 'Tallow', repos: ['tallow'] }, OWNER));
  value<Entry>(api.kernel.create('things', { name: 'Tallow Site', repos: ['tallow'] }, OWNER));
  clock.set(NOW);

  const whole: CallContext = { principal: { kind: 'token', id: 't_whole', scope: 'read', person: 'p_1', level: 'owner' }, credentialed: true };
  assert.ok(value<Understanding>(await api.understandPlan({}, whole)).questions.length > 0);

  const refused = (await api.understandPlan({}, narrowed('things', { field: 'name', op: 'eq', value: 'Tallow' }))) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.code, 'FORBIDDEN');
  assert.doesNotMatch(refused.refusal?.fix ?? '', /tallow|Tallow/u);
  sql.close();
});

test('THE QUESTION CARD HANDS A wheres-NARROWED READER NEITHER THE RUN NOR WHAT THE ROW HOLDS NOW', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const ship = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Ship' } }, owner));
  const agent: CallContext = {
    principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
    session: { client_id: 'c1', client: 'claude-code', host: 'mac', repo: 'braindog' },
  };
  /* MONEY IS ON THE FLOOR, SO THE AGENT'S CHANGE IS FILED AS A QUESTION. */
  const asked = value<Asked>(await api.update({ register: 'tasks', seq: ship.seq!, patch: { cost: { amount: 1_250, currency: 'GBP' }, state: 'done' } }, agent));
  type Facts = { run?: unknown; money?: unknown; changes?: unknown };
  const full = value<Facts>(await api.governance({ register: 'suggestion', id: asked.asked.id }, owner));
  assert.ok(full.run !== undefined && full.changes !== undefined, 'the owner reads every fact');

  /* AN AGENT HELD TO SHIP'S ROWS PROPOSES ON SHIP, AND IS ANSWERED THE CARD AS A READER OF ONE LIST IS. */
  const held: CallContext = { ...agent, wheres: { tasks: { field: 'name', op: 'eq', value: 'Ship' } } as never };
  const filed = value<Facts & { id: string }>(
    await api.propose({ question: 'Price Ship?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: `tasks#${ship.seq}`, version: ship.version, patch: { cost: { amount: 900, currency: 'EUR' } } }] } }, held),
  );
  assert.equal(filed.run, undefined);
  assert.equal(filed.changes, undefined);
  /* AND THE SAME PROPOSAL FROM THE WHOLE GRANT IS ANSWERED IN FULL. */
  const whole = value<Facts & { id: string }>(
    await api.propose({ question: 'Name Ship?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: `tasks#${ship.seq}`, version: ship.version, patch: { cost: { amount: 800, currency: 'EUR' } } }] } }, agent),
  );
  assert.ok(whole.run !== undefined && whole.changes !== undefined, JSON.stringify(whole));
  /* A READER HELD TO SHIP'S ROWS IS NOT SHOWN THE QUESTION AT ALL. */
  assert.equal(value<unknown>(await api.governance({ register: 'suggestion', id: asked.asked.id }, { ...owner, wheres: { tasks: { field: 'name', op: 'eq', value: 'Ship' } } as never })), null);
  sql.close();
});

test('A KEY HELD BY SOMEBODY OUTSIDE A wheres-NARROWED GRANT IS REFUSED WITHOUT THEIR NAME', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([PEOPLE]));
  value<Entry>(await api.create({ register: 'people', fields: { name: 'Ada Lovelace', email: 'ada@example.com' } }, owner));
  const held: CallContext = { ...owner, wheres: { people: { field: 'name', op: 'eq', value: 'Bob' } } as never };
  const out = (await api.create({ register: 'people', fields: { name: 'Bob', email: 'ada@example.com' } }, held)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'ALREADY_KNOWN');
  assert.doesNotMatch(out.refusal?.fix ?? '', /Lovelace|people#1/u);
  assert.equal(out.refusal?.fix, 'Someone on this list already has ada@example.com. Add what you know to them rather than adding them twice.');
  sql.close();
});
