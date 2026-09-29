/**
 * `list` filtered by a ref, asked every way an agent writes "Kiln's tasks".
 *
 * THE QUESTION AGENTS ASK MOST AFTER THE LOG. Most task reads an agent makes filter by project, and
 * the natural translation here is `list tasks` with `{field: 'thing', is: 'things#1'}`, the id
 * `context` and every `list` answer hand out. Measured over the seed before this file existed: that tree
 * answered ok with 0 rows on a project holding 14, the tree with the name `Kiln` answered 0 as well,
 * the sentence `thing is things#1` was refused `REF_UNKNOWN`, and a name that matches no project at
 * all answered ok with 0 rather than a refusal. An empty board reads as "nothing to do", and an agent
 * cannot see the screen to notice. `create` already stored `thing: 'things#3'` as the row id, so the
 * write path and the read path disagreed about one address.
 *
 * DELETED IN `00f3aa6a` RATHER THAN ADAPTED, AND RESTORED HERE. It read its
 * row id off a task's `thing`, and that commit made the tool answer `things#1` there, so its setup found
 * no id and the file went. Its twelve cases still answered as before, measured, but nothing
 * drove a ref predicate through the agent's `list` any more, and `kernel/test/where-ref.test.ts` still
 * sends its reader here. The row id is now read from the record itself, which the tool no longer shows.
 *
 * THE TRUTH IS COUNTED FROM THE ROWS, not written down, because the seed moves and a hard-coded 14
 * would go stale the day somebody adds a task to Kiln.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const agent: CallContext = {
  principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'list-ref' },
} as CallContext;

type Row = { spoken: string; fields: Record<string, unknown> };
type Stored = { id: string; seq: number | null; fields: Record<string, unknown> };

async function seeded() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 22, 9)) });
  await installSeed(api.kernel);
  const mcp = tools(api);
  const all = await api.list({ register: 'tasks', limit: 500 }, agent);
  assert.ok(all.ok, JSON.stringify(all));
  const rows = all.value.rows as unknown as Stored[];
  const kiln = await mcp.call('list', { register: 'things', where: { field: 'name', is: 'Kiln' } }, agent);
  assert.ok(kiln.ok, JSON.stringify(kiln));
  const thing = (kiln.value as { rows: Row[] }).rows[0]!;
  /* THE ROW ID AND THE TASKS ARE READ FROM THE RECORD, because the tool answers a ref by its spoken id now and a
     compact row carries no ULID of its own, and the truth should not lean on the naming pass it is checked beside. */
  const stored = await api.list({ register: 'things', where: { field: 'name', is: 'Kiln' } }, agent);
  assert.ok(stored.ok, JSON.stringify(stored));
  const id = (stored.value.rows as unknown as Stored[])[0]!.id;
  const truth = rows.filter((r) => r.fields.thing === id).length;
  return { api, mcp, rows, thing, id, truth };
}

async function count(mcp: Awaited<ReturnType<typeof seeded>>['mcp'], where: unknown, register = 'tasks'): Promise<number | string> {
  const r = await mcp.call('list', { register, where, limit: 500 }, agent);
  return r.ok ? (r.value as { rows: unknown[] }).rows.length : 'refusal' in r ? r.refusal.code : 'CONFLICT';
}

test('a ref in a predicate reads the spoken id, the name and the row id alike, in both forms', async () => {
  const { mcp, rows, thing, id, truth } = await seeded();
  assert.equal(thing.spoken, 'things#1', 'the seed moved: Kiln is no longer things#1');
  assert.ok(truth > 0, 'the seed holds no task on the first thing');

  const forms: [string, unknown][] = [
    ['tree, spoken id', { field: 'thing', is: 'things#1' }],
    ['tree, name', { field: 'thing', is: 'Kiln' }],
    ['tree, row id', { field: 'thing', is: id }],
    ['tree, in', { field: 'thing', in: ['things#1'] }],
    ['sentence, spoken id', 'thing is things#1'],
    ['sentence, name', 'thing is Kiln'],
    ['sentence, row id', `thing is ${id}`],
  ];
  const got = await Promise.all(forms.map(async ([label, where]) => [label, await count(mcp, where)] as const));
  assert.deepEqual(got, forms.map(([label]) => [label, truth]));

  /* `not` IS THE ONE WHERE A LITERAL LOOKS RIGHT: every task that is not on the string `things#1`
     is every task, Kiln's included, which is exactly what was measured. */
  const others = rows.filter((r) => r.fields.thing !== id).length;
  assert.equal(await count(mcp, { field: 'thing', not: 'things#1' }), others);
  assert.equal(await count(mcp, { field: 'thing', not_in: ['things#1'] }), others);
});

test('a ref that names nothing is refused rather than answered with an empty board', async () => {
  const { mcp } = await seeded();
  assert.equal(await count(mcp, { field: 'thing', is: 'Nowhere' }), 'REF_UNKNOWN');
  assert.equal(await count(mcp, { field: 'thing', is: 'things#999' }), 'REF_UNKNOWN');
  /* A ROW OF ANOTHER REGISTER IS THE WRONG THING, NOT NO THING, and `create` refuses the same write
     with the same code. */
  assert.equal(await count(mcp, { field: 'thing', is: 'tasks#1' }), 'REF_REGISTER_MISMATCH');
  assert.equal(await count(mcp, 'thing is tasks#1'), 'REF_REGISTER_MISMATCH');
});

test('a ref to a prefixed register is found by the id the tool answers, in the tree, in `in` and in the sentence', async () => {
  /* THE PREFIXED CASE. A learning answers `supersedes: "LN<n>"`, a prefixed id and not
     `register#number`, so the predicate an agent writes from the answer it was handed is that id. */
  const { api, mcp } = await seeded();
  const read = await mcp.call('list', { register: 'learnings', limit: 500 }, agent);
  assert.ok(read.ok, JSON.stringify(read));
  const cited = (read.value as { rows: Row[] }).rows.map((r) => r.fields.supersedes).filter((s): s is string => typeof s === 'string');
  assert.ok(cited.length > 0 && cited.every((s) => /^LN\d+$/.test(s)), `no learning supersedes another by its prefixed id: ${JSON.stringify(cited)}`);
  const ln = cited[0]!;

  /* THE TRUTH FROM THE RECORD: how many stored rows hold the row id `LN<n>` names. */
  const target = await api.get({ spoken: ln }, agent);
  assert.ok(target.ok && target.value !== null, JSON.stringify(target));
  const stored = await api.list({ register: 'learnings', limit: 500 }, agent);
  assert.ok(stored.ok, JSON.stringify(stored));
  const truth = (stored.value.rows as unknown as Stored[]).filter((r) => r.fields.supersedes === (target.value as Stored).id).length;
  assert.ok(truth > 0, `nothing stored supersedes ${ln}`);

  const forms: [string, unknown][] = [
    ['tree, prefixed id', { field: 'supersedes', is: ln }],
    ['tree, in', { field: 'supersedes', in: [ln] }],
    ['sentence, prefixed id', `supersedes is ${ln}`],
  ];
  const got = await Promise.all(forms.map(async ([label, where]) => [label, await count(mcp, where, 'learnings')] as const));
  assert.deepEqual(got, forms.map(([label]) => [label, truth]));
});
