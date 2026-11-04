/**
 * An order he sends from BrainDog that names questions (`methods/instructions.ts`).
 *
 * WHAT IS HELD, THE TRUST BOUNDARY FIRST: a run with no order answers nothing; a run whose order names other questions
 * answers none but those; a run that read outside text still files its writes as questions, and answers only what the
 * order names; a stranger's run, on somebody else's key or not the one that took it, answers nothing; a token never
 * sends such an order. Then what it does: the run that took "accept SG243" answers SG243 with that answer, once, as
 * his own decision, said in Activity as his order's, and Undo takes it back; and nothing the order reaches installs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
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

/** A token's call from one session in Portage's repository; his key unless another person is named. */
const agent = (client: string, person = 'p_seed', token = 'tok_1'): CallContext => ({
  principal: { kind: 'token', id: token, scope: 'write', person, level: person === 'p_seed' ? 'owner' : 'write' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client },
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_seed', '*', 'owner')");
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_bea', 'bea@vance-studio.example', 'Bea')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_bea', '*', 'write')");
  /* EACH KEY A GRANT THE RECORD HOLDS, so the ladder reads its writes. */
  for (const [id, person] of [
    ['tok_1', 'p_seed'],
    ['tok_bea', 'p_bea'],
  ] as const)
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, ?, ?, 'write', 'Claude Code', '2026-09-01T00:00:00.000Z')", id, person, `h-${id}`);
  clock.advance(MIN);
  return { api, sql, clock };
}

type Api = Awaited<ReturnType<typeof record>>['api'];

/** Opens a run for `ctx` and answers its spoken name. */
const opened = async (api: Api, ctx: CallContext): Promise<string> => value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;

/** A question of two options, filed by an agent, answering its id. */
async function asked(api: Api, question: string): Promise<string> {
  const filed = value<{ id: string }>(
    await api.propose(
      {
        question,
        body_kind: 'options',
        body: { options: [{ id: 'ship', label: 'Ship Friday', because: 'It is ready.' }, { id: 'wait', label: 'Wait a week', because: 'Safer.' }] },
      } as never,
      agent('c-filer'),
    ),
  );
  return filed.id;
}

const statusOf = (api: Api, id: string): string | undefined => api.kernel.governanceRow('suggestion', id)?.status as string | undefined;

type Mine = { run: string; lines: string[]; pending: { id: string; line: string }[]; answered?: { question: string; option: string; decision: string | null; said: string } };

/** He sends `run` an order naming `answers`, and the run reads it (taking it, since it is sent to it by name). */
async function ordered(api: Api, run: string, ctx: CallContext, answers: { question: string; option: string }[], said = 'Answer it as I said') {
  const told = value<{ id: string; line: string }>(await api.instruct({ said, to_run: run, answers } as never, owner));
  value<Mine>(await api.instructionsMine({}, ctx));
  return told;
}

/* ── the trust boundary ─────────────────────────────────────────────────── */

test('A TOKEN NEVER SENDS AN ORDER THAT ANSWERS: refused before anything is read, and no order is made', async () => {
  const { api, sql } = await record();
  const a = await asked(api, 'Ship Friday or wait?');
  const ctx = agent('c-one');
  const run = await opened(api, ctx);
  assert.equal(refusal(await api.instruct({ said: `accept ${a}`, to_run: run, answers: [{ question: a, option: 'ship' }] } as never, ctx)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'instructions'")?.n, 0);
  assert.equal(refusal(await api.instructionsMine({ answer: a }, ctx)).code, 'LEVEL_REQUIRED');
  assert.equal(statusOf(api, a), 'open');
  sql.close();
});

test('A RUN WITHOUT THE ORDER ANSWERS NOTHING, and a run whose order names other questions answers none but those', async () => {
  const { api, sql } = await record();
  const a = await asked(api, 'Ship Friday or wait?');
  const b = await asked(api, 'Tell the client today?');
  const mine = agent('c-mine');
  const other = agent('c-other');
  const run = await opened(api, mine);
  await opened(api, other);

  /* NO ORDER AT ALL. */
  const none = refusal(await api.instructionsMine({ answer: a }, other));
  assert.equal(none.code, 'LEVEL_REQUIRED');
  assert.match(none.fix, /Only the person answers it, in BrainDog/u);

  /* AN ORDER NAMING A, AND THE RUN ASKING FOR B. */
  await ordered(api, run, mine, [{ question: a, option: 'wait' }]);
  assert.equal(refusal(await api.instructionsMine({ answer: b }, mine)).code, 'LEVEL_REQUIRED');
  assert.equal(statusOf(api, b), 'open');
  /* AND ANOTHER RUN OF HIS, ON HIS KEY, CANNOT SPEND THE ORDER IT DID NOT TAKE. */
  assert.equal(refusal(await api.instructionsMine({ answer: a }, other)).code, 'LEVEL_REQUIRED');
  assert.equal(statusOf(api, a), 'open');
  /* NOR DOES A TOKEN EVER REACH `decide` ITSELF. */
  const decided = (await api.decide({ id: a, decide: { option: 'ship', reason: '' } } as never, mine)) as { ok: boolean };
  assert.equal(decided.ok, false);
  assert.equal(statusOf(api, a), 'open');
  sql.close();
});

test('A RUN THAT READ OUTSIDE TEXT STILL ASKS FOR ITS WRITES, and answers only the question his order names', async () => {
  const { api, sql } = await record();
  const a = await asked(api, 'Ship Friday or wait?');
  const b = await asked(api, 'Tell the client today?');
  const ctx = agent('c-read');
  const run = await opened(api, ctx);
  await ordered(api, run, ctx, [{ question: a, option: 'wait' }]);

  /* TAINTED: a row another person wrote, read by the run. */
  value(api.kernel.create('tasks', { what: 'Written by Bea' }, { actor: 'p_bea' }));
  value(await api.list({ register: 'tasks' }, ctx));
  const write = value<Asked>(await api.create({ register: 'tasks', fields: { what: 'After reading' } }, ctx));
  assert.match(write.asked.why, /This run read .*, so its changes ask for the rest of it/u);

  /* THE ORDER STILL NAMES A, with his answer: the run chooses nothing, so it is given as he said. */
  const done = value<Mine>(await api.instructionsMine({ answer: a }, ctx));
  assert.equal(done.answered?.option, 'wait');
  assert.equal(statusOf(api, a), 'resolved');
  /* AND NOTHING ELSE: B stays his, and the next write still asks. */
  assert.equal(refusal(await api.instructionsMine({ answer: b }, ctx)).code, 'LEVEL_REQUIRED');
  assert.equal(statusOf(api, b), 'open');
  const again = value<Asked>(await api.create({ register: 'tasks', fields: { what: 'Still reading' } }, ctx));
  assert.match(again.asked.why, /so its changes ask for the rest of it/u);
  sql.close();
});

test("A STRANGER'S RUN ANSWERS NOTHING: on somebody else's key, his order to it answers as nobody", async () => {
  const { api, sql } = await record();
  const a = await asked(api, 'Ship Friday or wait?');
  const bea = agent('c-bea', 'p_bea', 'tok_bea');
  const run = await opened(api, bea);
  await ordered(api, run, bea, [{ question: a, option: 'ship' }]);
  const no = refusal(await api.instructionsMine({ answer: a }, bea));
  assert.equal(no.code, 'FORBIDDEN');
  assert.match(no.fix, /not an order to this key/u);
  assert.equal(statusOf(api, a), 'open');
  sql.close();
});

/* ── what an order does ─────────────────────────────────────────────────── */

test('"ACCEPT SG243" LETS THE RUN THAT TOOK IT ANSWER IT ONCE, AS HIS, said as his order, and Undo takes it back', async () => {
  const { api, sql } = await record();
  /* A SET OF ROWS AN AGENT ASKED TO ADD, so his answer writes something and Undo has something to put back. */
  const a = value<{ id: string }>(api.kernel.propose({ question: 'Add the bounce report?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Write the bounce report' }] } }, 'slash', 'rules')).id;
  const made = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'tasks' AND deleted_at IS NULL AND json_extract(fields, '$.what') = 'Write the bounce report'")?.n;
  const ctx = agent('c-one');
  const run = await opened(api, ctx);
  const told = await ordered(api, run, ctx, [{ question: a, option: 'accept' }], `accept ${a}`);
  /* THE RUN IS TOLD WHAT IT MAY ANSWER, and how. */
  const read = value<Mine>(await api.instructionsMine({}, ctx));
  assert.match(read.lines.join(' '), new RegExp(`It lets you answer ${a} as .+? said, with instructions answer ${a}\\.`, 'u'));

  const done = value<Mine>(await api.instructionsMine({ answer: a }, ctx));
  assert.match(done.answered?.said ?? '', new RegExp(`^Answered "[^"]+" \\(${a}\\) with yes, on Teodor's order \\(${told.id}\\)\\.$`, 'u'));
  assert.equal(statusOf(api, a), 'resolved');
  assert.equal(made(), 1);
  const decision = api.kernel.governanceRow('decision', done.answered!.decision!);
  assert.equal(decision?.answer, 'accept');
  assert.equal(decision?.decided_by, 'p_seed', 'he decided it, not the key');
  assert.match(String(decision?.reason), new RegExp(`Teodor said in BrainDog \\(${told.id}\\): "accept ${a}"`, 'u'));

  /* SAID IN ACTIVITY AS HIS ORDER'S. */
  const lines = value<{ events: { note?: string | null; actor?: string }[] }>(await api.recentHistory({ limit: 50 }, owner)).events;
  assert.ok(
    lines.some((e) => e.note === `Answered by ${run} on Teodor's order (${told.id}).`),
    `no line in Activity says whose order it was: ${JSON.stringify(lines.map((e) => e.note).filter(Boolean))}`,
  );
  /* AND THE LINE IS GONE FROM WHAT THE RUN IS TOLD, since it is spent. */
  assert.doesNotMatch(value<Mine>(await api.instructionsMine({}, ctx)).lines.join(' '), /It lets you answer/u);

  /* ONCE: again, even after he undoes it and the question is open again. */
  assert.equal(refusal(await api.instructionsMine({ answer: a }, ctx)).code, 'TRANSITION_ILLEGAL');
  const plan = value<{ hash: string }>(await api.undo({ decision: done.answered!.decision!, dry: true }, owner));
  value(await api.undo({ decision: done.answered!.decision!, hash: plan.hash }, owner));
  assert.equal(statusOf(api, a), 'open');
  assert.equal(made(), 0);
  assert.equal(refusal(await api.instructionsMine({ answer: a }, ctx)).code, 'TRANSITION_ILLEGAL');
  assert.equal(statusOf(api, a), 'open');

  /* AND NOT AFTER THE RUN HAS ANSWERED THE ORDER ITSELF. */
  const b = await asked(api, 'Tell the client today?');
  const second = await ordered(api, run, ctx, [{ question: b, option: 'wait' }]);
  value(await api.instructionsMine({ reply: second.id, said: 'Done.', state: 'done' }, ctx));
  assert.equal(refusal(await api.instructionsMine({ answer: b }, ctx)).code, 'LEVEL_REQUIRED');
  assert.equal(statusOf(api, b), 'open');
  sql.close();
});

test('THE ORDER IS HELD TO WHAT HE SAW AND NAMED: his answer, a choice or a set of rows, and the question unchanged', async () => {
  const { api, sql } = await record();
  const a = await asked(api, 'Ship Friday or wait?');
  const ctx = agent('c-one');
  const run = await opened(api, ctx);
  const answers = (question: string, option: string) => ({ said: 'Do it', to_run: run, answers: [{ question, option }] }) as never;

  assert.equal(refusal(await api.instruct(answers(a, 'maybe'), owner)).code, 'ENUM_VALUE_UNKNOWN');
  /* HIS NO AS HE SAYS IT is the no a set of rows takes. */
  const rows = value<{ id: string }>(api.kernel.propose({ question: 'Add the bounce report?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Write it' }] } }, 'slash', 'rules')).id;
  const no = value<{ answers: { question: string; option: string }[] }>(await api.instruct(answers(rows, 'Decline'), owner));
  assert.deepEqual(no.answers.map((x) => [x.question, x.option]), [[rows, 'reject']]);
  assert.equal(refusal(await api.instruct(answers('SG9999', 'ship'), owner)).code, 'OUT_OF_BOUNDS');
  assert.equal(refusal(await api.instruct({ said: 'Stop', kind: 'stop', to_run: run, answers: [{ question: a, option: 'ship' }] } as never, owner)).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await api.instruct({ said: 'Twice', to_run: run, answers: [{ question: a, option: 'ship' }, { question: a, option: 'wait' }] } as never, owner)).code, 'VALUE_MALFORMED');
  /* A QUESTION THAT INSTALLS IS ANSWERED IN BROWSER, never on an order. */
  sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG900', 'change', '{}', 'open', 'system', ?)", new Date(NOW).toISOString());
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES ('01JZ8QK3F7R2M9V4XN6TCB5HAQ', ?, 'system', 'suggest', 'suggestion:SG900', 'suggestion', 'A change')", new Date(NOW).toISOString());
  assert.equal(refusal(await api.instruct(answers('SG900', 'accept'), owner)).code, 'FORBIDDEN');

  /* THE QUESTION MOVED AFTER HE SENT IT: his word on the old one is not given on the new one. */
  await ordered(api, run, ctx, [{ question: a, option: 'ship' }]);
  sql.exec(
    'UPDATE suggestion SET body = ? WHERE id = ?',
    JSON.stringify({ options: [{ id: 'ship', label: 'Ship tonight', because: 'Changed.' }, { id: 'wait', label: 'Wait a week', because: 'Safer.' }] }),
    a,
  );
  assert.equal(refusal(await api.instructionsMine({ answer: a }, ctx)).code, 'VERSION_STALE');
  assert.equal(statusOf(api, a), 'open');
  sql.close();
});

test('WHAT AN ORDER ANSWERS AS NEVER INSTALLS OR OPENS A KEY: admin and the keychain refuse it', async () => {
  const { api, sql } = await record();
  const as: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' }, registers: '*', credentialed: true, ordered: 'IN1' };
  const install = refusal(await api.setDeclaration({ id: 'register.x', kind: 'register', body: {} } as never, as));
  assert.equal(install.code, 'NEEDS_BROWSER_SESSION');
  assert.match(install.fix, /answers the questions it names and nothing more/u);
  sql.close();
});
