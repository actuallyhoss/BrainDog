/**
 * What `context` teaches an agent arriving from the old tool, and that every form it teaches works.
 *
 * TWO HABITS HAD A PATH AND NO SENTENCE (`loop/research-mcp-parity.md` §4). `brain_log` was called 49
 * times across his repos with no entity at all, and the path here is `log` on the agent's own session
 * row; 166 of 167 `brain_task_add` calls set a lane, and the lane here is the `agent` field, empty for
 * his own. Neither is said anywhere an agent reads, so an agent looking for "the log" or "the lane"
 * found neither and made one up. The tool list was the wrong home: it is paid in every turn and
 * measured 2,565 tokens of a 2,600 ceiling (`budget.test.ts`), so the sentences ride on `context`'s
 * answer, which an agent reads once per session.
 *
 * A TAUGHT FORM THAT FAILS IS WORSE THAN NONE, so each one is driven here against the seeded record
 * rather than checked as a string. Measured on the seed before the teaching existed: `agent is empty`
 * answered 19 of 27 tasks, `{"field":"agent","is":null}` was refused VALUE_MALFORMED, and `log` on the
 * run's own `S` id was taken. The project filter is taught in the tree form with the spoken id, the
 * form commit 5fde092b made work, and it is counted against the rows rather than trusted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { tools } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/* STANDING IN KILN'S TYPE FOLDER, which the seed declares on Kiln, so the briefing places the
   caller in a project and the project filter it teaches has a real id in it. */
const agent: CallContext = {
  principal: { kind: 'token', id: 't', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { client_id: 'teaching', cwd: '/Users/studio/Code/kiln-type' },
} as CallContext;

type Row = { spoken: string; fields: Record<string, unknown> };
type Briefing = { session: { spoken: string } | null; project: { spoken: string } | null; teach?: string[] };

async function seeded() {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 22, 9)) });
  await installSeed(api.kernel);
  return tools(api);
}

const rowsOf = (r: { ok: boolean; value?: unknown }): Row[] => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r.value as { rows: Row[] }).rows;
};

/** The JSON object after `where` in a taught sentence, parsed, so the test sends exactly what the agent read. */
const whereIn = (sentence: string): unknown => {
  const at = sentence.indexOf('{');
  assert.ok(at >= 0, `no predicate in: ${sentence}`);
  return JSON.parse(sentence.slice(at, sentence.lastIndexOf('}') + 1));
};

test('context teaches where a note about nothing goes, what a lane is, and how to read one project', async () => {
  const mcp = await seeded();
  const before = await mcp.call('context', {}, agent);
  assert.ok(before.ok, JSON.stringify(before));
  const first = before.value as Briefing;
  assert.ok(Array.isArray(first.teach), 'context teaches nothing');
  const lines = first.teach!;

  /* BEFORE THE FIRST WRITE THERE IS NO SESSION ROW, so the sentence says what opens one rather than
     naming an id that does not exist yet. */
  assert.equal(first.session, null);
  const note = lines.find((l) => /\blog\b/.test(l) && /session/.test(l));
  assert.ok(note, `nothing says where a note about nothing goes: ${JSON.stringify(lines)}`);
  assert.match(note!, /handoff/);

  const lane = lines.find((l) => /\bagent\b/.test(l) && /lane/.test(l));
  assert.ok(lane, `nothing says what a lane is: ${JSON.stringify(lines)}`);
  assert.match(lane!, /agent is empty/);
  const mine = rowsOf(await mcp.call('list', { register: 'tasks', where: 'agent is empty', limit: 500 }, agent));
  const all = rowsOf(await mcp.call('list', { register: 'tasks', limit: 500 }, agent));
  assert.ok(mine.length > 0 && mine.length < all.length, `agent is empty answered ${mine.length} of ${all.length}`);
  assert.ok(mine.every((r) => r.fields.agent == null || r.fields.agent === ''));

  const project = lines.find((l) => /project/.test(l) && /"field":"thing"/.test(l));
  assert.ok(project, `nothing says how to read one project: ${JSON.stringify(lines)}`);
  assert.ok(first.project, 'the seed no longer places the kiln-type folder in a project');
  const where = whereIn(project!);
  assert.deepEqual(where, { field: 'thing', is: first.project!.spoken });
  const onIt = rowsOf(await mcp.call('list', { register: 'tasks', where, limit: 500 }, agent));
  assert.ok(onIt.length > 0, 'the taught project filter answered an empty board');
  /* EVERY TASK ON THAT ROW, AND ONLY THOSE, counted from the unfiltered page by the row id a task stores. */
  const id = onIt[0]!.fields.thing;
  assert.ok(onIt.every((r) => r.fields.thing === id));
  assert.equal(onIt.length, all.filter((r) => r.fields.thing === id).length);

  /* AND ONCE A WRITE HAS OPENED THE RUN, the sentence names the run's own id, and `log` on it is taken. */
  const handed = await mcp.call('handoff', { next: 'Read the teaching back.' }, agent);
  assert.ok(handed.ok, JSON.stringify(handed));
  const after = (await mcp.call('context', {}, agent)) as { ok: true; value: Briefing };
  const spoken = after.value.session!.spoken;
  const named = after.value.teach!.find((l) => /\blog\b/.test(l) && /session/.test(l))!;
  assert.ok(named.includes(spoken), `the note sentence does not name ${spoken}: ${named}`);
  const logged = await mcp.call('log', { spoken, note: 'Nothing in particular, and it has a home.' }, agent);
  assert.ok(logged.ok, JSON.stringify(logged));
});

test('the resource form of the briefing teaches the same sentences as the tool', async () => {
  const mcp = await seeded();
  const tool = (await mcp.call('context', {}, agent)) as { ok: true; value: Briefing };
  const resource = await mcp.read('braindog:context', agent);
  assert.ok(resource.ok, JSON.stringify(resource));
  assert.ok(Array.isArray(tool.value.teach) && tool.value.teach.length > 0, 'context teaches nothing');
  assert.deepEqual((resource.value as Briefing).teach, tool.value.teach);
});

test("outside any project, the project sentence names no row, so copying it reads nobody's tasks", async () => {
  /* MEASURED ON THE SEED: the fallback once taught `"is":"things#1"` as an example, and things#1 is
     Kiln, so an agent in a folder no project claims that copied the sentence read Kiln's board as if
     it were the one it asked about. The same number is the first project of any record. */
  const mcp = await seeded();
  const nowhere = { ...agent, session: { client_id: 'teaching', cwd: '/tmp/no-project-here' } } as CallContext;
  const answer = (await mcp.call('context', {}, nowhere)) as { ok: true; value: Briefing };
  assert.equal(answer.value.project, null, 'the seed now places /tmp in a project');
  const project = answer.value.teach!.find((l) => /project/.test(l) && /"field":"thing"/.test(l));
  assert.ok(project, `nothing says how to read one project: ${JSON.stringify(answer.value.teach)}`);
  const copied = await mcp.call('list', { register: 'tasks', where: whereIn(project!), limit: 500 }, nowhere);
  const rows = copied.ok ? (copied.value as { rows: Row[] }).rows : [];
  assert.equal(rows.length, 0, `the example in "${project}" is a real project with ${rows.length} tasks`);
});
