/**
 * What `context` teaches an agent arriving from another record, and that every form it teaches works.
 *
 * TWO HABITS HAD A PATH AND NO SENTENCE. Agents log notes about no row at all, and the path here is
 * `log` on the agent's own session row; nearly every task an agent adds sets a lane, and the lane here
 * is the `agent` field, empty for the person's own. Neither is said anywhere an agent reads, so an
 * agent looking for "the log" or "the lane"
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
/* A KEY THAT IS EMPTY IS LEFT OUT, as every answer now leaves a null out: no run yet is no `session`, and no project
   no `project`. */
type Briefing = { session?: { spoken: string }; project?: { spoken: string }; teach?: string[]; card?: string };

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
  assert.equal(first.session, undefined);
  assert.match(first.card ?? '', /^.+, working on Kiln/u, 'the card does not say where the caller stands');
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
  assert.equal(answer.value.project, undefined, 'the seed now places /tmp in a project');
  const project = answer.value.teach!.find((l) => /project/.test(l) && /"field":"thing"/.test(l));
  assert.ok(project, `nothing says how to read one project: ${JSON.stringify(answer.value.teach)}`);
  const copied = await mcp.call('list', { register: 'tasks', where: whereIn(project!), limit: 500 }, nowhere);
  const rows = copied.ok ? (copied.value as { rows: Row[] }).rows : [];
  assert.equal(rows.length, 0, `the example in "${project}" is a real project with ${rows.length} tasks`);
});

/* WHAT AN AGENT READS MOST. A survey drove the sixteen tools as an agent's daily flow uses them, and
   these answers were the ones read most and said least. Each test below was red against the code it
   was written for, and says what it measured then. */

type Shaped = { spoken: string; version: number; updated_at?: string; fields?: Record<string, unknown> };
const valueOf = <T>(r: { ok: boolean; value?: unknown }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.value as T;
};

test('log answers what was logged, not the row, and its version is one an update then takes', async () => {
  /* MEASURED BEFORE: `log` answered `surface.update`'s whole row, so a one-line note on Kiln, whose
     note is its write-up, answered 6,610 bytes for a 5,889-byte note. `log` is the most-called tool
     (211 of 837 flow calls), so that was the largest answer an agent read in a day. */
  const mcp = await seeded();
  const kiln = valueOf<Shaped>(await mcp.call('get', { spoken: 'things#1' }, agent));
  const writeUp = Array.from({ length: 120 }, (_, i) => `Line ${String(i + 1)} of the write-up, long enough to be a line.`).join('\n');
  valueOf(await mcp.call('update', { spoken: 'things#1', patch: { note: writeUp }, version: kiln.version }, agent));
  assert.ok(writeUp.length > 5_000, `the write-up is ${String(writeUp.length)} bytes`);

  const logged = await mcp.call('log', { spoken: 'things#1', note: 'Checked the specimen proofs.' }, agent);
  const bytes = JSON.stringify(logged).length;
  assert.ok(bytes < 400, `log answered ${String(bytes)} bytes for a one-line note: ${JSON.stringify(logged).slice(0, 200)}`);
  const said = valueOf<Shaped>(logged);
  assert.equal(said.spoken, 'things#1');
  assert.equal(typeof said.version, 'number');
  assert.equal(said.fields, undefined, 'the answer still carries the row');

  /* THE VERSION IS THE ROW'S AFTER THE NOTE, so an agent that logs and then patches is not refused
     for a version it was just handed. */
  const next = await mcp.call('update', { spoken: 'things#1', patch: { aim: '2026-10-01' }, version: said.version }, agent);
  assert.ok(next.ok, `the version log answered was refused: ${JSON.stringify(next)}`);
});

test("a task's refs come back as the ids context speaks, and sent back unchanged they are taken", async () => {
  /* MEASURED BEFORE: every `thing` on Kiln's tasks answered `01M345FTM0...`, a row id that changes
     from run to run, while `context` names the same project `things#1`. An agent could not say which
     project a task was on without a `get` per id. */
  const mcp = await seeded();
  const briefing = valueOf<Briefing>(await mcp.call('context', {}, agent));
  const kiln = briefing.project!.spoken;
  const rows = rowsOf(await mcp.call('list', { register: 'tasks', where: { field: 'thing', is: kiln }, limit: 500 }, agent));
  assert.ok(rows.length > 0, 'Kiln has no tasks on the seed');
  assert.deepEqual([...new Set(rows.map((r) => r.fields.thing))], [kiln]);
  const tracks = rows.map((r) => r.fields.track).filter((t) => t !== undefined);
  assert.ok(tracks.length > 0 && tracks.every((t) => typeof t === 'string' && /^tracks#\d+$/.test(t)), `tracks answered ${JSON.stringify(tracks)}`);

  /* THE ROUND TRIP: every row's fields, straight back through `update`. The version moves by one on
     that write, as it did with the row ids, so what is asserted is that it is taken and that the
     fields read back as they went out. */
  for (const row of rows as (Row & { version: number })[]) {
    const back = await mcp.call('update', { spoken: row.spoken, patch: row.fields, version: row.version }, agent);
    assert.ok(back.ok, `${row.spoken} refused its own fields: ${JSON.stringify(back)}`);
    assert.deepEqual(valueOf<Shaped>(back).fields, row.fields, `${row.spoken} changed on the round trip`);
  }
});

test("a learning's refs are named by prefix as its rows are, and the prefixed id writes back", async () => {
  /* `supersedes` POINTS AT A REGISTER WITH A PREFIX, so its value is named `LN<n>` as the row itself
     is. Measured on the seed: the record's write path takes `learnings#8` and refuses `LN8` in a ref
     field ("supersedes takes a row id or a spoken id like learnings#41"), so this is the case that
     proves an answer here is still one an agent can send straight back. */
  const mcp = await seeded();
  const base = { lesson: 'A ref comes back as a spoken id.', because: 'Measured on the seed while writing the tests.', kind: 'fact' };
  const first = valueOf<Shaped>(await mcp.call('create', { register: 'learnings', fields: base }, agent));
  assert.match(first.spoken, /^LN\d+$/);
  /* IN ITS OWN WORDS: two learnings saying the same lesson are one (`same:` on learnings), and the second is refused. */
  const second = valueOf<Shaped>(await mcp.call('create', { register: 'learnings', fields: { ...base, lesson: 'A ref comes back as a spoken id, every time.', supersedes: first.spoken } }, agent));
  assert.equal(second.fields!.supersedes, first.spoken);
  assert.equal(second.fields!.project, 'things#1');
  const back = await mcp.call('update', { spoken: second.spoken, patch: second.fields, version: second.version }, agent);
  assert.ok(back.ok, `${second.spoken} refused its own fields: ${JSON.stringify(back)}`);
  assert.deepEqual(valueOf<Shaped>(back).fields, second.fields);
});

test("a list of refs is named one by one, and the prefixed list writes back", async () => {
  /* THE MUTATION'S CASE, because no test above reaches a `list` of `ref`: with the list branch of the
     naming pass cut out, all five still passed. skills#5's `because` is that field on the seed, and it
     points at learnings, so its values are prefixed and have to be qualified on the way back too. */
  const mcp = await seeded();
  const skill = valueOf<Shaped>(await mcp.call('get', { spoken: 'skills#5' }, agent));
  const because = skill.fields!.because as unknown[];
  assert.ok(because.length > 0 && because.every((v) => typeof v === 'string' && /^LN\d+$/.test(v)), `because answered ${JSON.stringify(because)}`);
  const back = await mcp.call('update', { spoken: 'skills#5', patch: { because }, version: skill.version }, agent);
  assert.ok(back.ok, `skills#5 refused its own because: ${JSON.stringify(back)}`);
  assert.deepEqual(valueOf<Shaped>(back).fields!.because, because);
});

test('search names a learning LN<n>, as create and context do', async () => {
  /* MEASURED BEFORE: `LN8` created, and `search` for its words answered `learnings#8`, because it
     built `register#seq` itself where every other tool names a row by its register's prefix. */
  const mcp = await seeded();
  const fields = { lesson: 'Zeppelin hangars echo.', because: 'Measured in the zeppelin hangar with a stopwatch.', kind: 'fact' };
  const made = valueOf<Shaped>(await mcp.call('create', { register: 'learnings', fields }, agent));
  assert.match(made.spoken, /^LN\d+$/);
  const found = valueOf<{ rows: { spoken: string }[] }>(await mcp.call('search', { q: 'zeppelin hangars' }, agent));
  assert.deepEqual(found.rows.map((r) => r.spoken), [made.spoken]);
});

test('context says a note patch replaces the note and log is the append, and both do what it says', async () => {
  /* MEASURED BEFORE: `update tasks#3 {note}` left `note` as the one line sent, the import's text only
     in `history`, and nothing an agent reads said so. Agents often send an update that is `{id, note}`
     alone, meaning an append, which here is `log`, not the patch. */
  const mcp = await seeded();
  const lines = valueOf<Briefing>(await mcp.call('context', {}, agent)).teach ?? [];
  const said = lines.find((l) => /\blog\b/.test(l) && /\bnote\b/.test(l) && /replaces/.test(l));
  assert.ok(said, `nothing says a note patch replaces the note: ${JSON.stringify(lines)}`);

  /* tasks#27 AND NOT tasks#3: the first measurement ran over an imported record, and on the seed
     tasks#3 has no note to lose, while tasks#27 carries "Once the first one is live." */
  const before = valueOf<Shaped>(await mcp.call('get', { spoken: 'tasks#27' }, agent));
  assert.equal(typeof before.fields!.note, 'string', 'tasks#27 has no note on the seed');
  valueOf(await mcp.call('log', { spoken: 'tasks#27', note: 'Draft is in docs/annual.md.' }, agent));
  const logged = valueOf<Shaped>(await mcp.call('get', { spoken: 'tasks#27' }, agent));
  assert.equal(logged.fields!.note, before.fields!.note, 'log changed the note it was said to leave alone');

  const patch = { note: 'Draft is in docs/annual.md.' };
  const patched = valueOf<Shaped>(await mcp.call('update', { spoken: 'tasks#27', patch, version: logged.version }, agent));
  assert.equal(patched.fields!.note, patch.note, 'a note patch did not replace the note');
});
