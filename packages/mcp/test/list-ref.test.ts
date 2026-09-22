/**
 * `list` filtered by a ref, asked every way an agent writes "Kiln's tasks".
 *
 * THE QUESTION THE OLD TOOL'S AGENTS ASK MOST AFTER THE LOG. 80 of the 93 `brain_tasks` calls in his
 * transcripts filter by project (`loop/research-mcp-parity.md` §2 row 5), and the natural translation
 * here is `list tasks` with `{field: 'thing', is: 'things#1'}`, the id `context` and every `list`
 * answer hand out. Measured over the seed before this file existed (§3 of the same survey): that tree
 * answered ok with 0 rows on a project holding 14, the tree with the name `Kiln` answered 0 as well,
 * the sentence `thing is things#1` was refused `REF_UNKNOWN`, and a name that matches no project at
 * all answered ok with 0 rather than a refusal. An empty board reads as "nothing to do", and an agent
 * cannot see the screen to notice. `create` already stored `thing: 'things#3'` as the row id, so the
 * write path and the read path disagreed about one address.
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

async function seeded() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 22, 9)) });
  await installSeed(api.kernel);
  const mcp = tools(api);
  const all = await mcp.call('list', { register: 'tasks', limit: 500 }, agent);
  assert.ok(all.ok, JSON.stringify(all));
  const rows = (all.value as { rows: Row[] }).rows;
  const kiln = await mcp.call('list', { register: 'things', where: { field: 'name', is: 'Kiln' } }, agent);
  assert.ok(kiln.ok, JSON.stringify(kiln));
  const thing = (kiln.value as { rows: Row[] }).rows[0]!;
  /* THE ROW ID IS READ OFF A TASK, because a compact row carries its spoken id and not its ULID. */
  const id = rows.map((r) => r.fields.thing).find((v) => typeof v === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(v)) as string;
  const truth = rows.filter((r) => r.fields.thing === id).length;
  return { mcp, rows, thing, id, truth };
}

async function count(mcp: Awaited<ReturnType<typeof seeded>>['mcp'], where: unknown): Promise<number | string> {
  const r = await mcp.call('list', { register: 'tasks', where, limit: 500 }, agent);
  return r.ok ? (r.value as { rows: unknown[] }).rows.length : 'refusal' in r ? r.refusal.code : 'CONFLICT';
}

test('a ref in a predicate reads the spoken id, the name and the row id alike, in both forms', async () => {
  const { mcp, rows, thing, id, truth } = await seeded();
  assert.equal(thing.spoken, 'things#1', 'the seed moved: Kiln is no longer things#1');
  const onKiln = rows.filter((r) => r.fields.thing === id);
  assert.ok(truth > 0 && onKiln.length === truth, 'the seed holds no task on the first thing');

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
     is every task, Kiln's included, and the survey measured exactly that. */
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
