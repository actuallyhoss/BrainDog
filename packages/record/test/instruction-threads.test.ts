/**
 * A THREAD OF WHAT HE TOLD AN AGENT (the Agents page of 24 Nov, "the whole agents tab ... is horrendous"): his reply inside
 * a thread is the thread's next word, never a new instruction titled "Following up IN1: check", and it reaches the same
 * run the way every instruction does (`instructions`), naming the thread it follows and what the run last said there.
 * His answer to a question the run asked (Needs you) answers it, and a thread closes whole.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };

const agent = (client: string): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client },
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_seed', '*', 'owner')");
  clock.advance(MIN);
  return { api, sql, clock };
}

type Row = { id: string; state: string; said: string; thread: string | null; to_run: string | null; replies: { said: string; state: string }[] };
type Mine = { pending: { id: string; thread: string | null; line: string }[]; lines: string[]; instruction?: { id: string; state: string } };

test('HIS ANSWER TO A QUESTION THE RUN ASKED IS THE THREAD’S NEXT WORD, to the same run, and the run hears what it answers', async () => {
  const { api, clock } = await record();
  const ctx = agent('c-thread');
  const run = value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;
  value(await api.instruct({ said: 'Merge wave 1', to_run: run }, owner));
  value(await api.instructionsMine({}, ctx));
  clock.advance(MIN);
  value(await api.instructionsMine({ reply: 'IN1', said: 'Tests pass. Should I merge wave 1 now?', state: 'needs_you' }, ctx));
  clock.advance(MIN);

  /* "yes", in the thread: a new instruction, his words alone, kept under IN1, sent to the run that asked. */
  const sent = value<{ id: string }>(await api.sendReply({ id: 'IN1', note: 'yes' }, owner));
  assert.equal(sent.id, 'IN2');
  const rows = value<{ rows: Row[] }>(await api.instructionList({}, owner)).rows;
  const reply = rows.find((r) => r.id === 'IN2')!;
  assert.equal(reply.said, 'yes', 'his reply was titled by its plumbing');
  assert.equal(reply.thread, 'IN1');
  assert.equal(reply.to_run, run);
  /* THE QUESTION IS ANSWERED: Needs you no longer counts it. */
  const first = rows.find((r) => r.id === 'IN1')!;
  assert.equal(first.state, 'done');
  assert.deepEqual(first.replies.map((x) => [x.said, x.state]), [['Tests pass. Should I merge wave 1 now?', 'needs_you']]);
  assert.equal(value<{ rows: Row[] }>(await api.instructionList({ state: 'needs_you' }, owner)).rows.length, 0);

  /* THE RUN READS IT AS THE ANSWER TO ITS OWN QUESTION, tied to IN1. */
  const mine = value<Mine>(await api.instructionsMine({}, ctx));
  assert.deepEqual(mine.pending.map((p) => [p.id, p.thread]), [['IN2', 'IN1']]);
  assert.match(mine.lines[0]!, /^Teodor replied in BrainDog on IN1 \(IN2\): "yes"\. Your last word there: "Tests pass\. Should I merge wave 1 now\?"\./u);
  assert.match(mine.lines[0]!, /reply IN2/u);

  /* AND IT ANSWERS BY THE THREAD'S NAME, which is the id it knows: reply IN1 answers IN2. */
  clock.advance(MIN);
  const done = value<Mine>(await api.instructionsMine({ reply: 'IN1', said: 'Merged.', state: 'done' }, ctx));
  assert.equal(done.instruction?.id, 'IN2');
  assert.equal(done.instruction?.state, 'done');

  /* THE THREAD WHOLE, oldest first, by either of its words. */
  const whole = value<{ rows: Row[] }>(await api.instructionList({ thread: 'IN2' }, owner)).rows;
  assert.deepEqual(whole.map((r) => r.id), ['IN1', 'IN2']);
  assert.deepEqual(whole[1]!.replies.map((x) => x.said), ['Merged.']);

  /* CLOSED WHOLE: neither word stays on his list. */
  value(await api.closeInstruction({ id: 'IN1' }, owner));
  assert.deepEqual(value<{ rows: Row[] }>(await api.instructionList({}, owner)).rows.map((r) => r.id), []);
});

test('A FOLLOW-UP TO A RUN STILL WORKING GOES TO IT, and a thread with a word still open does not close', async () => {
  const { api, clock } = await record();
  const ctx = agent('c-follow');
  const run = value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;
  value(await api.instruct({ said: 'Tidy the release notes', to_run: run }, owner));
  value(await api.instructionsMine({}, ctx));
  clock.advance(MIN);
  value(await api.sendReply({ id: 'IN1', note: 'check the changelog too' }, owner));
  const mine = value<Mine>(await api.instructionsMine({}, ctx));
  assert.deepEqual(mine.pending.map((p) => p.id), ['IN1', 'IN2']);
  /* THE FIRST IS STILL ITS OWN WHILE IT IS OPEN: reply IN1 answers IN1. */
  const one = value<Mine>(await api.instructionsMine({ reply: 'IN1', said: 'Notes tidied.' }, ctx));
  assert.equal(one.instruction?.id, 'IN1');
  const shut = (await api.closeInstruction({ id: 'IN1' }, owner)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(shut.ok, false);
  assert.equal(shut.refusal?.code, 'TRANSITION_ILLEGAL');
});

test('A REPLY TO A THREAD WHOSE RUN ENDED GOES TO THE NEXT RUN OF THAT KIND THERE, still in the thread', async () => {
  const { api, clock } = await record();
  const ctx = agent('c-ended');
  const run = value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;
  value(await api.instruct({ said: 'Check the invoices', to_run: run }, owner));
  value(await api.instructionsMine({}, ctx));
  value(await api.instructionsMine({ reply: 'IN1', said: 'Two are late.' }, ctx));
  value(await api.handoff({ state: 'done', next: 'Chase the two late invoices from October' }, ctx));
  clock.advance(MIN);
  value(await api.sendReply({ id: 'IN1', note: 'Chase them' }, owner));
  const row = value<{ rows: Row[] }>(await api.instructionList({ thread: 'IN1' }, owner)).rows.at(-1)!;
  assert.equal(row.thread, 'IN1');
  assert.equal(row.to_run, null);
  assert.equal(row.said, 'Chase them');
});
