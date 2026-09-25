/**
 * What the dry run says of an `ask_slash` step on a host that answers Slash (`research-worker-spark.md` Brief I).
 *
 * MEASURED BEFORE THIS: a record opened with `answersSlash: true` installed a rule that asks Slash and ran it to
 * `waiting` with one `infer.ask` job queued, and its dry run still ended the step with "Not in this build: a rule with
 * this step is refused at install." An agent read that the rule it was filing would be refused, on the one host that
 * installs it. Each test below failed on its sentence.
 *
 * THE SENTENCE IS HELD TO A REAL RUN, as `mcp/test/automations.test.ts` holds the flag-off one: the wait it names is
 * the runner's `ASK_SLASH_WAIT_MS`, and the fields it names are the ones the queued job carries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ASK_SLASH_WAIT_MS } from '../../kernel/src/flow.ts';
import { said } from '../src/automations.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const DAY_MS = 86_400_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] },
};

const ASKS = {
  rule: 'asks',
  on: { written: { register: 'obligations', op: ['create'] } },
  once_per: ['entry'],
  steps: [{ ask_slash: { question: 'What rate applies to {{what}}?', about: ['what', 'note'], as: 'rate', shape: 'number' } }],
};

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, JSON.stringify(x));
  return x.value as T;
};

test('ON A HOST THAT ANSWERS SLASH THE DRY RUN SAYS THE RUN WAITS FOR THIS HOST\'S MODEL, and names what it sends', async () => {
  assert.equal(ASK_SLASH_WAIT_MS, DAY_MS, 'the sentence below says a day, and the runner waits something else');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), answersSlash: true });
  const step = value<{ steps: string[] }>(await api.dryRun({ rule: ASKS as never }, owner)).steps[0]!;
  assert.doesNotMatch(step, /Not in this build/u, step);
  assert.equal(
    step,
    'Ask Slash "What rate applies to {{what}}?", and keep the answer as rate. The run waits up to 1d for this host\'s model to answer, and stops here without one. The question goes with what its braces name filled in, and with the row\'s what and note.',
  );

  /* AND THE RUN DOES WHAT IT SAYS: it installs, parks on the step, and queues one question carrying those two fields. */
  value(await api.kernel.install([OBLIGATIONS, { id: 'rule.asks', kind: 'rule', body: ASKS }] as never));
  value(await api.create({ register: 'obligations', fields: { what: 'Rent', note: 'monthly' } }, owner));
  await api.kernel.drain();
  const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'asks'");
  assert.equal(run?.state, 'waiting', run?.say ?? 'no run');
  const job = sql.one<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'infer.ask'");
  assert.deepEqual(Object.keys((JSON.parse(job!.payload) as { about: object }).about), ['what', 'note']);
  sql.close();
});

test('A QUESTION WITH NO about: IS SAID TO GO ALONE, and a nested one on a host that answers is said the same way', () => {
  const alone = { rule: 'a', on: { manual: true }, steps: [{ if: 'x is 1', then: [{ ask_slash: { question: 'Go?', as: 'go' } }] }] };
  assert.deepEqual(said(alone as never, { answersSlash: true }).steps, [
    'If x is 1:',
    '  Ask Slash "Go?", and keep the answer as go. The run waits up to 1d for this host\'s model to answer, and stops here without one. The question goes with no field of the row.',
  ]);
});

test('A QUESTION THAT NAMES THE ROW IN BRACES IS NOT SAID TO GO WITH NO FIELD OF IT, since the run fills them in', async () => {
  /* THE CHECKER'S CASE. With no `about:` the line said "The question goes with no field of the row", and the job the
     run queued asked "Rate for Rent and monthly?": both fields left inside the question's own words. */
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), answersSlash: true });
  const braces = { ...ASKS, steps: [{ ask_slash: { question: 'Rate for {{what}} and {{trigger.row.note}}?', as: 'rate' } }] };
  const step = value<{ steps: string[] }>(await api.dryRun({ rule: braces as never }, owner)).steps[0]!;
  assert.match(step, /The question goes with what its braces name filled in, and with no other field of the row\.$/u, step);

  value(await api.kernel.install([OBLIGATIONS, { id: 'rule.asks', kind: 'rule', body: braces }] as never));
  value(await api.create({ register: 'obligations', fields: { what: 'Rent', note: 'monthly' } }, owner));
  await api.kernel.drain();
  const job = JSON.parse(sql.one<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'infer.ask'")!.payload) as { question: string; about?: object };
  assert.equal(job.question, 'Rate for Rent and monthly?');
  assert.equal(job.about, undefined);
  sql.close();
});

test('A HOST THAT SAYS NOTHING, OR SAYS NO, STILL READS THAT THE STEP IS REFUSED AT INSTALL', async () => {
  for (const answersSlash of [undefined, false]) {
    const sql = openSqlite();
    const api = await createRecordApi({ sql, clock: fixedClock(NOW), ...(answersSlash === undefined ? {} : { answersSlash }) });
    const step = value<{ steps: string[] }>(await api.dryRun({ rule: ASKS as never }, owner)).steps[0]!;
    assert.match(step, /Not in this build: a rule with this step is refused at install\.$/u, `answersSlash: ${String(answersSlash)}`);
    sql.close();
  }
  assert.match(said(ASKS as never).steps[0]!, /refused at install\.$/u);
});
