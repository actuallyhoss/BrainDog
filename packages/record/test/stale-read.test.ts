/**
 * `stale`, the read (`src/methods/stale.ts`, AGT-C18 job c): where things stand for whoever asks, and the one call that
 * clears each. A step left ten days ago, a question that has waited fifteen and a run that ended forty days ago having
 * written nothing are three lines, each `{ kind, said, count, clear }` in words; a fresh record is answered none; and
 * a caller a list is closed to is told nothing of what is on it.
 *
 * Through the real record on a real kernel in memory. It is worked out at the read and kept in no table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods as staleMethods, type Stale, type StaleLine } from '../src/methods/stale.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/** Wednesday 14 October 2026, nine in the morning, on a record that keeps UTC. */
const NOW = Date.UTC(2026, 9, 14, 9);
const DAY = 86_400_000;

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** Somebody invited to Notes and nothing else: the runs and the questions are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['notes'] };
const agent = (token: string, client: string, client_id: string): CallContext => ({
  principal: { kind: 'token', id: token, scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id, client, host: 'mac', repo: 'studio-repo' },
});

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Made = { api: Api; sql: ReturnType<typeof openSqlite>; clock: ReturnType<typeof fixedClock> };

const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * `stale` as the record answers it. Until `methods/index.ts` holds its line the method is built here over the same
 * kernel, with guards that stand in for the record's own (a level reads, a caller held to some lists reads those and
 * no question), so the gathering is run for real either way; with the line in, this is the record's own method.
 */
const stale = (r: Made, ctx: CallContext): Promise<Result<Stale>> => {
  const own = (r.api as unknown as { stale?: (a: unknown, c: CallContext) => Promise<Result<Stale>> }).stale;
  if (typeof own === 'function') return own({}, ctx);
  const closed = (c: CallContext, register: string): Refusal | null =>
    Array.isArray(c.registers) && !c.registers.includes(register) ? { code: 'FORBIDDEN', fix: 'That list is closed to this caller.' } : null;
  const levelled = (c: CallContext): Refusal | null =>
    (c.principal as { level?: unknown }).level ? null : { code: 'FORBIDDEN', fix: 'This caller reads nothing.' };
  const deps = {
    kernel: r.api.kernel,
    sql: r.sql,
    clock: r.clock,
    guard: levelled,
    scoped: levelled,
    readable: closed,
    sightOf: (c: CallContext, target: string) => (Array.isArray(c.registers) ? null : target),
    no: (code: string, fix: string) => ({ ok: false, refusal: { code, fix } }),
  } as unknown as RecordDeps;
  return staleMethods(deps).stale({}, ctx);
};

async function record(): Promise<Made> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 15 * DAY);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([NOTES] as never));
  for (const [id, label] of [['t_claude', 'Claude Code'], ['t_codex', 'Codex']] as const)
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, 'p_1', ?, 'write', ?, '2026-09-01T00:00:00.000Z')", id, `h_${id}`, label);
  return { api, sql, clock };
}

/**
 * A studio left alone for a while. Fifteen days ago an agent asked a question; ten days ago the same run stopped and
 * left a step; and a run of another agent's ended forty days ago having written nothing.
 */
async function leftAlone() {
  const r = await record();
  const first = agent('t_claude', 'claude-code', 'c-1');
  const asked = value<{ id: string }>(await r.api.propose({ question: 'Add a note called Ship?', body_kind: 'rowset', body: { register: 'notes', rows: [{ name: 'Ship' }] } } as never, first));
  r.clock.set(NOW - 10 * DAY);
  const run = value<Entry>(await r.api.handoff({ state: 'handoff', next: 'Kern the lowercase pairs' }, first));
  const then = new Date(NOW - 40 * DAY).toISOString();
  r.sql.exec(
    "INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES ('01JZ8QK3F7R2M9V4XN6TCB5EMP', 'session', 900, ?, 'done', 1, ?, ?)",
    JSON.stringify({ doing: 'Looked around', agent: 'codex', state: 'done', started: then, last_seen: then, wrote: 0 }),
    then,
    then,
  );
  r.clock.set(NOW);
  return { ...r, asked, run };
}

const kinds = (s: Stale): string[] => s.lines.map((l) => l.kind);
const line = (s: Stale, kind: string): StaleLine => {
  const found = s.lines.find((l) => l.kind === kind);
  assert.ok(found, `no ${kind} line in ${JSON.stringify(s.lines)}`);
  return found;
};

test('A STEP LEFT EARLIER, A QUESTION THAT WAITED AND AN EMPTY RUN ARE THREE LINES, each with its count and the one call that clears it', async () => {
  const r = await leftAlone();
  /* The agent that asked, back in the same repository under a new run. */
  const back = agent('t_claude', 'claude-code', 'c-2');
  const got = value<Stale>(await stale(r, back));
  assert.deepEqual(kinds(got), ['steps', 'questions', 'runs-empty'], JSON.stringify(got.lines));
  assert.equal(got.count, 3);
  for (const l of got.lines) {
    assert.deepEqual(Object.keys(l).sort(), ['clear', 'count', 'kind', 'said']);
    assert.equal(l.count, 1);
    assert.ok(l.said.length > 0 && l.clear.length > 0);
  }

  const step = line(got, 'steps');
  assert.match(step.said, /Kern the lowercase pairs/u, 'the step is said in its own words');
  assert.match(step.said, /10 days/u);
  assert.match(step.clear, /^handoff\b.*\bdrop\b/u);
  assert.ok(step.clear.includes(`S${String(r.run.seq)}`), 'the call names the run that left it, as a person says it');

  const question = line(got, 'questions');
  assert.match(question.said, /Add a note called Ship\?/u);
  assert.match(question.clear, /^withdraw\b/u);
  assert.ok(question.clear.includes(r.asked.id), 'the call names the question');

  const empty = line(got, 'runs-empty');
  /* SAID AS A SENTENCE A PERSON READS since Tidy up said its findings plainly (round 1030). */
  assert.match(empty.said, /ended without writing anything/u);
  assert.match(empty.clear, /^propose\b/u, 'nothing asks by itself, so the call is to put the question to the owner');
  assert.match(empty.clear, /Delete it\?/u);
  r.sql.close();
});

test('NAMES AND NEVER IDS: no line holds a row id, a raw time or a long dash', async () => {
  const r = await leftAlone();
  for (const who of [agent('t_claude', 'claude-code', 'c-2'), owner]) {
    const text = JSON.stringify(value<Stale>(await stale(r, who)));
    assert.doesNotMatch(text, /[0-9A-HJKMNP-TV-Z]{26}/u, 'a row id');
    assert.ok(!text.includes(r.run.id), 'the run by its id');
    assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}/u, 'a raw day or time');
    assert.doesNotMatch(text, /—/u, 'a long dash');
    assert.doesNotMatch(text, /tidy#|t_claude|studio-repo/u, 'a cause, a key or a repository');
  }
  r.sql.close();
});

test('WHOSE QUESTION IT IS decides the call: the owner answers it, and another agent is not told of a question it did not ask', async () => {
  const r = await leftAlone();
  const his = value<Stale>(await stale(r, owner));
  assert.deepEqual(kinds(his), ['steps', 'questions', 'runs-empty']);
  assert.match(line(his, 'questions').clear, /^decide\b/u);
  assert.ok(line(his, 'questions').clear.includes(r.asked.id));
  assert.match(line(his, 'steps').clear, /^handoff\b.*\bdrop\b/u);

  const other = value<Stale>(await stale(r, agent('t_codex', 'codex', 'x-1')));
  assert.deepEqual(kinds(other), ['steps', 'runs-empty'], 'only the agent that asked can take a question back');
  assert.equal(other.count, 2);
  r.sql.close();
});

test('A QUESTION UNDER A WEEK OLD, A STEP LEFT YESTERDAY AND A RUN THAT ENDED LAST WEEK ARE NOT STALE', async () => {
  const r = await record();
  r.clock.set(NOW - 3 * DAY);
  const first = agent('t_claude', 'claude-code', 'c-1');
  value(await r.api.propose({ question: 'Add a note called Ship?', body_kind: 'rowset', body: { register: 'notes', rows: [{ name: 'Ship' }] } } as never, first));
  r.clock.set(NOW - DAY);
  value(await r.api.handoff({ state: 'handoff', next: 'Kern the lowercase pairs' }, first));
  r.clock.set(NOW);
  assert.deepEqual(value<Stale>(await stale(r, agent('t_claude', 'claude-code', 'c-2'))), { lines: [], count: 0 });
  assert.deepEqual(value<Stale>(await stale(r, owner)), { lines: [], count: 0 });
  r.sql.close();
});

test('A FRESH RECORD IS ANSWERED NO LINE', async () => {
  const r = await record();
  r.clock.set(NOW);
  assert.deepEqual(value<Stale>(await stale(r, owner)), { lines: [], count: 0 });
  r.sql.close();
});

test('A CALLER A LIST IS CLOSED TO IS TOLD NOTHING OF WHAT IS ON IT, and one holding no list at all is told of none', async () => {
  const r = await leftAlone();
  /* The question is about Notes, which this caller reads, so the record shows it them; the runs and the finders it does not. */
  const told = value<Stale>(await stale(r, shut));
  assert.deepEqual(kinds(told), ['questions'], 'the runs and the finders are not theirs to read');
  assert.equal(told.count, 1);
  const none = { ...shut, registers: [] } as CallContext;
  assert.deepEqual(value<Stale>(await stale(r, none)), { lines: [], count: 0 }, 'a caller holding no list is told of none');
  r.sql.close();
});

test('IT WRITES NOTHING: no question is filed and no line is kept by asking', async () => {
  const r = await leftAlone();
  const count = (table: string): number => Number(r.sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0);
  const before = [count('suggestion'), count('event'), count('entry')];
  value(await stale(r, owner));
  value(await stale(r, agent('t_claude', 'claude-code', 'c-2')));
  assert.deepEqual([count('suggestion'), count('event'), count('entry')], before);
  r.sql.close();
});
