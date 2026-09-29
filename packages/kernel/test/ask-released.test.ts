/**
 * A question to Slash that a host was holding when its run ended.
 *
 * WHAT WAS MEASURED. `release()` in `flow.ts` deletes a run's Slash job only while it is `pending` or `failed`, and
 * leaves a `leased` one to its ack. The ack's failed branch read the job and never the run, so a job leased when its
 * rule was retired, switched off or its pack turned off came back on the ladder: in a Worker probe, 8 posts and 8
 * `grant.read` events on the owner's key for a run already `cancelled`, and a rung that was answered billed and
 * counted. Against the build before this file's fix the first test below read a `retry` row armed and the job leased
 * again after its rung, where it expects the job `done` and nothing to lease.
 *
 * THE RUN IS READ AND NOT ONLY THE STEP ROW, because `release()` leaves the step row `waiting` after it cancels the
 * run: it was measured that a check of the step row alone passes a cancelled run's job straight through, and it was
 * measured again here: with `r.state = 'waiting'` taken out of the ack's query, the three switch tests below fail on
 * the armed `retry` and the other two pass.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const PICK = { rule: 'pick', on: { manual: true }, steps: [{ ask_slash: { question: 'Which?', as: 'which' } }, { notify: { say: '{{vars.which}}' } }] };
const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

async function slashed(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { answersSlash: true });
  value(await k.install([OBLIGATIONS, rule(PICK)]));
  return { k, sql, clock };
}

const jobState = (sql: NodeSql, id: string) => sql.one<{ state: string; attempts: number }>('SELECT state, attempts FROM outbox WHERE id = ?', id);
const retries = (sql: NodeSql, id: string): number =>
  sql.one<{ n: number }>("SELECT count(*) AS n FROM schedule WHERE kind = 'retry' AND key = ?", `outbox:${id}`)?.n ?? 0;

/** Every way a rule stops, each of which reaches `cancelRunsOf` or `cancelRun` and so `release()`. */
const SWITCHES: [string, (k: Kernel, run: string) => Promise<unknown>][] = [
  ['the run cancelled', async (k, run) => value(k.cancelRun(run, 'p_1'))],
  ['the rule retired', async (k) => value(k.retire(['rule.pick'], { actor: 'p_1' }))],
  ['the rule switched off', async (k) => value(await k.install([rule({ ...PICK, enabled: false })]))],
];

for (const [how, stop] of SWITCHES)
  test(`A SLASH JOB LEASED WHEN ITS RUN ENDED IS NOT RETRIED WHEN IT FAILS: ${how}`, async () => {
    const { k, sql, clock } = await slashed();
    const { run } = value(k.automationRun('pick', 'p_1'));
    await k.drain();
    const [held] = k.leaseOutbox(['infer.ask'], 10);
    assert.ok(held, 'no infer.ask row was queued');

    await stop(k, run);
    assert.equal(sql.one<{ state: string }>('SELECT state FROM automation_run WHERE id = ?', run)?.state, 'cancelled');
    assert.equal(jobState(sql, held.id)?.state, 'leased', 'release() took a job a host holds, which this test does not cover');

    value(k.ackOutbox({ id: held.id, state: 'failed', leasedUntil: held.leasedUntil, error: 'The Slash endpoint answered 503.' }));
    assert.equal(retries(sql, held.id), 0, 'a retry was armed for a question whose run is over');
    /* `attempts` IS 1 AND NOT 0, because a host did post the question once and the row should say so. */
    assert.deepEqual({ ...jobState(sql, held.id) }, { state: 'done', attempts: 1 });

    /* PAST THE FIRST RUNG, which is two minutes plus its spread, and well past it. Before the fix the job was here to lease
       again, and every rung after it was another question asked in the name of a rule that is gone. */
    clock.advance(HOUR);
    await k.drain();
    assert.deepEqual(k.leaseOutbox(['infer.ask'], 10), [], 'the cancelled run asked Slash again');
    assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body_kind = 'change'")?.n, 0);
    sql.close();
  });

test('A SLASH JOB WHOSE RUN IS STILL WAITING ON IT WALKS THE LADDER AS BEFORE', async () => {
  /* THE CONTROL. A check that marked every failed `infer.ask` done would pass every test above and end each live run's
     question on its first 503. */
  const { k, sql, clock } = await slashed();
  value(k.automationRun('pick', 'p_1'));
  await k.drain();
  const [held] = k.leaseOutbox(['infer.ask'], 10);
  value(k.ackOutbox({ id: held!.id, state: 'failed', leasedUntil: held!.leasedUntil, error: 'The Slash endpoint answered 503.' }));
  assert.deepEqual({ ...jobState(sql, held!.id) }, { state: 'failed', attempts: 1 });
  assert.equal(retries(sql, held!.id), 1);

  clock.advance(HOUR);
  await k.drain();
  const [again] = k.leaseOutbox(['infer.ask'], 10);
  assert.equal(again?.id, held!.id, 'a live run lost its question after one failure');
  sql.close();
});

test('A SLASH JOB THE STEP NO LONGER NAMES IS NOT RETRIED, even while its run waits', async () => {
  /* THE STEP ROW'S `answer` IS THE JOB, as `answerStep` holds it. A job whose run has since asked again, here faked by
     pointing the step at another id, answers nothing, and a retry of it would ask Slash a question no step is waiting on. */
  const { k, sql } = await slashed();
  const { run } = value(k.automationRun('pick', 'p_1'));
  await k.drain();
  const [held] = k.leaseOutbox(['infer.ask'], 10);
  sql.exec("UPDATE automation_step SET answer = 'someone-else' WHERE run = ? AND n = 0", run);
  value(k.ackOutbox({ id: held!.id, state: 'failed', leasedUntil: held!.leasedUntil, error: 'The Slash endpoint answered 503.' }));
  assert.equal(retries(sql, held!.id), 0);
  assert.equal(jobState(sql, held!.id)?.state, 'done');
  sql.close();
});
