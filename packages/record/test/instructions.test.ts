/**
 * What he tells an agent, through the record (agents and MCP plan §2, §8.2; W2-A).
 *
 * WHAT IS HELD: only a person tells, every token refused `NEEDS_BROWSER_SESSION`; an agent reads its own instructions
 * in his voice and marks them seen; of two runs taking one, the first wins and the second is told who has it; a reply
 * is the run's, answered with the batches it wrote while it held the instruction; a task's lane and project fill who
 * an instruction to it reaches; his threads say who saw each and how; a run's start sees what waits for it, and
 * `context` lists it first and answers a stamp with only what moved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type Context, type ContextSince } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };

/** A token's call from one session in Portage's repository, which the seed places on Portage. */
const agent = (client: string, session: CallContext['session'] = {}, token = 'tok_1'): CallContext => ({
  principal: { kind: 'token', id: token, scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client, ...session },
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  /* HE OWNS IT, so the line an agent reads says what his word lifts (`wordOf`). */
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_seed', '*', 'owner')");
  clock.advance(MIN);
  return { api, sql, clock };
}

/** Opens a run for `ctx` and answers its spoken name. */
const opened = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext): Promise<string> =>
  value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;

test('ONLY A PERSON TELLS: a token is refused NEEDS_BROWSER_SESSION, and the run reads what he said in his voice', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-one');
  const run = await opened(api, ctx);

  assert.equal(refusal(await api.instruct({ said: 'Merge wave 1' }, ctx)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.withdrawInstruction({ id: 'IN1' }, ctx)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.instruct({ said: 'Hi', bogus: 1 } as never, owner)).code, 'FIELD_UNKNOWN');

  const told = value<{ id: string; to: string; to_run: string | null; to_agent: string | null; line: string }>(await api.instruct({ said: 'Merge wave 1, then stop', to_run: run }, owner));
  assert.equal(told.to, 'run');
  assert.equal(told.to_run, run);
  /* AND THE RUN'S OWN KIND, so his thread names the agent without reading the run. */
  assert.equal(told.to_agent, 'claude');
  assert.match(told.line, /^Teodor said in BrainDog \(IN1\): "Merge wave 1, then stop"\./u);

  const mine = value<{ run: string; pending: { id: string; state: string; line: string }[]; lines: string[]; stamp: string }>(await api.instructionsMine({}, ctx));
  assert.equal(mine.run, run);
  assert.deepEqual(mine.pending.map((i) => i.id), ['IN1']);
  /* ONE SENT TO THE RUN BY NAME IS TAKEN AS IT IS FIRST SEEN, so the line says to reply. */
  assert.equal(mine.pending[0]!.state, 'working');
  assert.match(mine.lines[0]!, /Reply with instructions reply IN1/u);
  assert.equal(refusal(await api.instructionsMine({ take: 'IN1', reply: 'IN1' }, ctx)).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await api.instructionsMine({ said: 'Done' }, ctx)).at, 'said');
  assert.equal(refusal(await api.instructionsMine({}, owner)).code, 'FORBIDDEN');
  sql.close();
});

test('TAKEN BY ONE RUN: of two runs here the first takes it, the second is told who has it, and the reply carries receipts', async () => {
  const { api, sql, clock } = await record();
  const a = agent('c-a');
  const b = agent('c-b');
  await opened(api, a);
  await opened(api, b);
  const told = value<{ id: string; to: string }>(await api.instruct({ said: 'Add a task for the bounce report', when: 'now', project: 'Portage' }, owner));
  assert.equal(told.to, 'anyone');

  const forA = value<{ pending: { id: string }[] }>(await api.instructionsMine({}, a));
  const forB = value<{ pending: { id: string }[] }>(await api.instructionsMine({}, b));
  assert.deepEqual([forA.pending.map((i) => i.id), forB.pending.map((i) => i.id)], [[told.id], [told.id]]);

  const took = value<{ instruction: { taken_by: string; state: string } }>(await api.instructionsMine({ take: told.id }, a));
  assert.equal(took.instruction.state, 'working');
  const lost = refusal(await api.instructionsMine({ take: told.id }, b));
  assert.match(lost.fix, new RegExp(`^${took.instruction.taken_by} has it`, 'u'));
  /* AND IT IS NO LONGER B'S TO READ. */
  assert.deepEqual(value<{ pending: unknown[] }>(await api.instructionsMine({}, b)).pending, []);

  clock.advance(MIN);
  value(await api.create({ register: 'tasks', fields: { what: 'Write the bounce report' } }, a));
  clock.advance(MIN);
  const replied = value<{ instruction: { state: string; reply: string | null }; receipts: { batches: { rows: string[]; names: string[] }[]; changes: number } | null }>(
    await api.instructionsMine({ reply: told.id, said: 'Added it.', state: 'done' }, a),
  );
  assert.equal(replied.instruction.state, 'done');
  assert.equal(replied.instruction.reply, 'Added it.');
  assert.ok(replied.receipts !== null && replied.receipts.changes >= 1, 'no receipt for the task it made');
  assert.ok(replied.receipts!.batches.some((x) => x.rows.some((r) => r.startsWith('tasks#'))), JSON.stringify(replied.receipts));
  /* AND EACH ROW BY ITS NAME, beside the handle. */
  assert.ok(replied.receipts!.batches.some((x) => x.names.includes('Write the bounce report')), JSON.stringify(replied.receipts));
  /* ONLY THE RUN THAT TOOK IT ANSWERS IT. */
  assert.equal(refusal(await api.instructionsMine({ reply: told.id, said: 'Me too.' }, b)).code, 'FORBIDDEN');
  sql.close();
});

test('EACH RECEIPT IS ITS OWN: a run holding two names under each only the writes it made working that one', async () => {
  const { api, sql, clock } = await record();
  const a = agent('c-two');
  const run = await opened(api, a);
  const price = value<{ id: string }>(await api.instruct({ said: 'Put the licence price on the page', to_run: run }, owner));
  const intro = value<{ id: string }>(await api.instruct({ said: 'Rewrite the specimen intro', to_run: run }, owner));
  clock.advance(MIN);
  /* SHOWN BOTH, IT TAKES BOTH, and works the later one first, as its instruction in hand says. */
  assert.deepEqual(value<{ pending: { id: string }[] }>(await api.instructionsMine({}, a)).pending.map((i) => i.id), [price.id, intro.id]);
  clock.advance(MIN);
  value(await api.create({ register: 'tasks', fields: { what: 'Draft the new intro' } }, a));
  clock.advance(MIN);
  type Answer = { receipts: { batches: { names: string[] }[]; changes: number } | null };
  const forIntro = value<Answer>(await api.instructionsMine({ reply: intro.id, said: 'Rewrote it.', state: 'done' }, a));
  /* ANSWERED, THE OLDER ONE IS IN HAND AGAIN. */
  assert.equal(api.kernel.get(run)?.fields.instruction, price.id);
  clock.advance(MIN);
  value(await api.create({ register: 'tasks', fields: { what: 'Add the price line' } }, a));
  clock.advance(MIN);
  const forPrice = value<Answer>(await api.instructionsMine({ reply: price.id, said: 'Put it there.', state: 'done' }, a));
  const names = (x: Answer) => x.receipts!.batches.flatMap((b) => b.names);
  /* NEITHER COUNTS THE OTHER'S WORK, NOR THE OTHER INSTRUCTION'S OWN ROW. */
  assert.deepEqual(names(forIntro), ['Draft the new intro'], JSON.stringify(forIntro.receipts));
  assert.deepEqual(names(forPrice), ['Add the price line'], JSON.stringify(forPrice.receipts));
  assert.deepEqual([forIntro.receipts!.changes, forPrice.receipts!.changes], [1, 1]);
  /* AND HIS THREADS SAY THE SAME. */
  const threads = value<{ rows: { id: string; receipts: Answer['receipts'] }[] }>(await api.instructionList({}, owner)).rows;
  const of = (id: string) => names({ receipts: threads.find((t) => t.id === id)!.receipts });
  assert.deepEqual([of(price.id), of(intro.id)], [['Add the price line'], ['Draft the new intro']]);
  sql.close();
});

test('A TASK SAYS WHO IT REACHES: its lane and project fill the instruction when he names neither', async () => {
  const { api, sql } = await record();
  const thing = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'things' AND json_extract(fields, '$.name') = 'Portage'");
  assert.ok(thing, 'the seed has Portage');
  const task = value<{ seq: number }>(await api.create({ register: 'tasks', fields: { what: 'Fix the retry', agent: 'codex', thing: thing.id } }, owner));
  const told = value<{ to: string; to_agent: string | null; project: string | null; task: string | null }>(await api.instruct({ said: 'Use the new client', task: `tasks#${String(task.seq)}` }, owner));
  assert.equal(told.to, 'task');
  assert.equal(told.to_agent, 'codex');
  assert.equal(told.task, `tasks#${String(task.seq)}`);
  assert.match(told.project ?? '', /^things#\d+$/u);
  assert.equal(refusal(await api.instruct({ said: 'x', task: 'tasks#99999' }, owner)).at, 'task');
  assert.equal(refusal(await api.instruct({ said: 'x', project: 'Nowhere at all' }, owner)).at, 'project');
  assert.equal(refusal(await api.instruct({ said: 'x', to_agent: 'robot' }, owner)).code, 'ENUM_VALUE_UNKNOWN');
  sql.close();
});

test('HIS THREADS: newest first, who saw each and how, filtered by state and run, and his alone', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-threads');
  const run = await opened(api, ctx);
  value(await api.instruct({ said: 'First thing', to_run: run }, owner));
  value(await api.instruct({ said: 'For whoever is next', project: 'Portage' }, owner));
  value(await api.instructionsMine({ seen: ['IN1'], how: 'prompt' }, ctx));

  const all = value<{ rows: { id: string; seen: { run: string; how: string }[]; by_name: string }[]; cursor: string | null }>(await api.instructionList({}, owner));
  assert.deepEqual(all.rows.map((r) => r.id), ['IN2', 'IN1']);
  assert.deepEqual(all.rows[1]!.seen.map((s) => [s.run, s.how]), [[run, 'prompt']]);
  assert.equal(all.rows[0]!.by_name, 'Teodor');
  const mine = value<{ rows: { id: string }[] }>(await api.instructionList({ run }, owner));
  assert.deepEqual(mine.rows.map((r) => r.id), ['IN1']);
  const paged = value<{ rows: { id: string }[]; cursor: string | null }>(await api.instructionList({ limit: 1 }, owner));
  assert.deepEqual([paged.rows.map((r) => r.id), paged.cursor], [['IN2'], 'IN2']);
  assert.deepEqual(value<{ rows: { id: string }[] }>(await api.instructionList({ limit: 1, cursor: 'IN2' }, owner)).rows.map((r) => r.id), ['IN1']);
  assert.equal(refusal(await api.instructionList({ state: 'lost' }, owner)).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refusal(await api.instructionList({}, ctx)).code, 'FORBIDDEN');

  /* WITHDRAWN BEFORE A RUN TAKES IT, and refused once one has. */
  assert.equal(value<{ state: string }>(await api.withdrawInstruction({ id: 'IN2' }, owner)).state, 'withdrawn');
  assert.equal(refusal(await api.withdrawInstruction({ id: 'IN1' }, owner)).code, 'TRANSITION_ILLEGAL');
  sql.close();
});

test('A RUN STARTS SEEING WHAT WAITS: attach marks it seen at start, context lists it first, and a stamp answers only what moved', async () => {
  const { api, sql, clock } = await record();
  /* BEFORE THE SESSION HAS A RUN, context tells it what waits for whoever is next where it stands. */
  value(await api.instruct({ said: 'Check the bounce numbers first', project: 'Portage' }, owner));
  const before = value<Context>(await api.context({}, agent('c-start')));
  assert.deepEqual(before.told?.map((i) => i.id), ['IN1']);
  assert.equal(before.stamp, null);
  clock.advance(MIN);

  const ctx = agent('c-start');
  const attached = value<{ spoken: string; context: Context }>(await api.attach({ source: 'startup' }, ctx));
  assert.deepEqual(attached.context.told?.map((i) => [i.id, i.seen_how]), [['IN1', 'start']]);
  assert.match(attached.context.told![0]!.line, /^Teodor said in BrainDog \(IN1\): "Check the bounce numbers first"\. Take it with instructions take IN1\.$/u);

  const now = value<Context>(await api.context({}, ctx));
  assert.ok(typeof now.stamp === 'string' && now.stamp !== '');
  /* NO SETTINGS ROW YET, so the token's own scope is what it may do. */
  assert.equal(now.may, 'Writes; money, keys and deletes are asked. On their word, passed as said, only money, keys, new ways in and what leaves BrainDog still are.');
  const still = value<ContextSince>(await api.context({ since: now.stamp! }, ctx));
  assert.deepEqual([still.since.changed, still.since.lines], [false, ['Nothing new.']]);

  clock.advance(MIN);
  value(await api.instruct({ said: 'Then the retry', to_run: attached.spoken }, owner));
  const moved = value<ContextSince>(await api.context({ since: now.stamp! }, ctx));
  assert.equal(moved.since.changed, true);
  assert.deepEqual(moved.since.pending.map((i) => i.id), ['IN2']);
  assert.match(moved.since.lines[0]!, /\(IN2\): "Then the retry"/u);

  assert.equal(refusal(await api.context({ depth: 'huge' } as never, ctx)).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refusal(await api.context({ since: 42 } as never, ctx)).at, 'since');
  assert.equal(refusal(await api.context({ wat: 1 } as never, ctx)).code, 'FIELD_UNKNOWN');
  sql.close();
});

test('CONTEXT TAKES A TASK AND A PROJECT: the task whole with its version and history, and the place by name', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-task', { repo: 'nowhere-repo' });
  await opened(api, ctx);
  const task = value<{ seq: number; version: number }>(await api.create({ register: 'tasks', fields: { what: 'Write the report' } }, owner));
  const said = value<Context>(await api.context({ task: `tasks#${String(task.seq)}`, project: 'Portage' }, ctx));
  assert.equal(said.depth, 'task');
  assert.equal(said.task?.spoken, `tasks#${String(task.seq)}`);
  assert.equal(said.task?.version, task.version);
  assert.equal(said.task?.fields.what, 'Write the report');
  assert.ok((said.task?.history.length ?? 0) >= 1);
  assert.equal(said.project?.name, 'Portage');
  assert.equal(said.project?.how, 'asked');
  assert.equal(refusal(await api.context({ task: 'tasks#99999' }, ctx)).at, 'task');
  assert.equal(refusal(await api.context({ project: 'No such place' }, ctx)).at, 'project');
  sql.close();
});

test('AT MOST THIRTY A MINUTE: the thirty-first is RATE_LIMITED with the seconds to wait', async () => {
  const { api, sql } = await record();
  for (let i = 0; i < 30; i += 1) value(await api.instruct({ said: `Thing ${String(i)}` }, owner));
  const slow = refusal(await api.instruct({ said: 'One more' }, owner));
  assert.equal(slow.code, 'RATE_LIMITED');
  assert.ok(((slow as { retry_after?: number }).retry_after ?? 0) >= 1);
  sql.close();
});
