/**
 * A question to Slash a host was holding when its run ended, and that host never acked it (wave fifty's checker).
 *
 * WHAT WAS MEASURED. Wave fifty taught the ack's failed branch to read the run, and left two roads that did not. `lease()`
 * handed an expired lease back out without reading anything but the clock, so a job leased, its run cancelled and never
 * acked was leased again every time its window ran out: against the build before this file's fix the first test below
 * counted 7 further hand-outs over 24 minutes of clock, each one a post a host would make in the name of a rule that is
 * gone, and the job ended `dead` with `attempts` 8, where it expects none and `done` with 1. `unlease()` put such a job
 * back to `pending` after `release()` had run, where nothing would ever delete it again and the next lease posted it.
 *
 * THE JOIN IS THE ACK'S, one helper in `outbox.ts` read by all three: the run `waiting` at the payload's step, and that
 * step's row holding this job's id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { CEILING, unlease } from '../src/outbox.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
/* PAST THE INFER LEASE, which is two minutes, and short enough that eight of them stay inside the ask's day. */
const PAST_LEASE = 3 * 60_000;

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

async function asked(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock>; run: string; held: { id: string; leasedUntil: string } }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock, { answersSlash: true });
  value(await k.install([OBLIGATIONS, rule(PICK)]));
  const { run } = value(k.automationRun('pick', 'p_1'));
  await k.drain();
  const [held] = k.leaseOutbox(['infer.ask'], 10);
  assert.ok(held, 'no infer.ask row was queued');
  return { k, sql, clock, run, held };
}

const jobState = (sql: NodeSql, id: string) => sql.one<{ state: string; attempts: number }>('SELECT state, attempts FROM outbox WHERE id = ?', id);
const retries = (sql: NodeSql, id: string): number =>
  sql.one<{ n: number }>("SELECT count(*) AS n FROM schedule WHERE kind = 'retry' AND key = ?", `outbox:${id}`)?.n ?? 0;
const changes = (sql: NodeSql): number => sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body_kind = 'change'")?.n ?? 0;

/** Every way a rule stops, each of which reaches `release()`, which leaves a leased job where it is. */
const SWITCHES: [string, (k: Kernel, run: string) => Promise<unknown>][] = [
  ['the run cancelled', async (k, run) => value(k.cancelRun(run, 'p_1'))],
  ['the rule retired', async (k) => value(k.retire(['rule.pick'], { actor: 'p_1' }))],
  ['the rule switched off', async (k) => value(await k.install([rule({ ...PICK, enabled: false })]))],
];

for (const [how, stop] of SWITCHES)
  test(`AN EXPIRED LEASE ON A SLASH JOB WHOSE RUN ENDED IS FINISHED, NOT HANDED OUT AGAIN: ${how}`, async () => {
    const { k, sql, clock, run, held } = await asked();
    await stop(k, run);
    assert.equal(sql.one<{ state: string }>('SELECT state FROM automation_run WHERE id = ?', run)?.state, 'cancelled');
    assert.equal(jobState(sql, held.id)?.state, 'leased', 'release() took a job a host holds, which this test does not cover');

    /* THE HOST NEVER ACKS, and the clock walks through as many lease windows as the ladder has rungs. Every hand-out
       counted here is a question a host would post to Slash on the owner's key. */
    let handedOut = 0;
    for (let i = 0; i < CEILING; i++) {
      clock.advance(PAST_LEASE);
      handedOut += k.leaseOutbox(['infer.ask'], 10).length;
    }
    assert.equal(handedOut, 0, 'the cancelled run asked Slash again');
    /* `attempts` IS 1, the one host that was handed it, as the failed ack counts the same job. */
    assert.deepEqual({ ...jobState(sql, held.id) }, { state: 'done', attempts: 1 });
    assert.equal(retries(sql, held.id), 0);
    assert.equal(changes(sql), 0);
    sql.close();
  });

test('AN EXPIRED LEASE ON A SLASH JOB WHOSE RUN IS STILL WAITING IS RECLAIMED AS BEFORE', async () => {
  /* THE CONTROL. A lease that finished every expired `infer.ask` would pass every test above and lose each live run's
     question the first time a host died holding it. */
  const { k, sql, clock, held } = await asked();
  clock.advance(PAST_LEASE);
  const [again] = k.leaseOutbox(['infer.ask'], 10);
  assert.equal(again?.id, held.id, 'a live run lost its question to one expired lease');
  assert.deepEqual({ ...jobState(sql, held.id) }, { state: 'leased', attempts: 1 });
  sql.close();
});

test('AN EXPIRED LEASE ON A SLASH JOB THE STEP NO LONGER NAMES IS FINISHED, even while its run waits', async () => {
  const { k, sql, clock, run, held } = await asked();
  sql.exec("UPDATE automation_step SET answer = 'someone-else' WHERE run = ? AND n = 0", run);
  clock.advance(PAST_LEASE);
  assert.deepEqual(k.leaseOutbox(['infer.ask'], 10), []);
  assert.deepEqual({ ...jobState(sql, held.id) }, { state: 'done', attempts: 1 });
  sql.close();
});

test('AT THE CEILING, A SLASH JOB WHOSE RUN ENDED IS DONE AND NOT DEAD', async () => {
  /* THE DEAD-LETTER SWEEP RUNS BEFORE THE CLAIM, so the finish has to run before it too, or a job on its last rung is
     dead-lettered in the name of a run that is over. Seven attempts here stand for seven lease windows a live run spent
     before it was cancelled. */
  const { k, sql, clock, run, held } = await asked();
  sql.exec('UPDATE outbox SET attempts = ? WHERE id = ?', CEILING - 1, held.id);
  value(k.cancelRun(run, 'p_1'));
  clock.advance(PAST_LEASE);
  assert.deepEqual(k.leaseOutbox(['infer.ask'], 10), []);
  assert.deepEqual({ ...jobState(sql, held.id) }, { state: 'done', attempts: CEILING });
  sql.close();
});

test('A LIVE LEASE ON A SLASH JOB WHOSE RUN ENDED IS LEFT TO THE HOST HOLDING IT, and its ack still lands', async () => {
  /* ONLY AN EXPIRED LEASE IS FINISHED BY `lease()`. With the sweep's `leased_until < ?` taken out, every other test in
     the kernel still passed, and the job was marked `done` under the host still posting it, whose ack was then refused
     as "done, not leased" for a job it had every right to answer. */
  const { k, sql, run, held } = await asked();
  value(k.cancelRun(run, 'p_1'));
  assert.deepEqual(k.leaseOutbox(['infer.ask'], 10), []);
  assert.equal(jobState(sql, held.id)?.state, 'leased', 'a lease another host still holds was finished under it');
  value(k.ackOutbox({ id: held.id, state: 'failed', leasedUntil: held.leasedUntil, error: 'The Slash endpoint answered 503.' }));
  assert.deepEqual({ ...jobState(sql, held.id) }, { state: 'done', attempts: 1 });
  sql.close();
});

test('A STALE UNLEASE OF A SLASH JOB WHOSE RUN ENDED LEAVES THE CURRENT LEASE ALONE', async () => {
  /* THE FENCE HOLDS ON THE NEW BRANCH TOO. Unfenced, the late hand-back of a host whose lease had expired finished the
     job under the second host that re-leased it, and no other test in the kernel noticed. */
  const { k, sql, clock, run, held } = await asked();
  clock.advance(PAST_LEASE);
  const [again] = k.leaseOutbox(['infer.ask'], 10);
  assert.equal(again?.id, held.id);
  value(k.cancelRun(run, 'p_1'));
  unlease(sql, { id: held.id, leasedUntil: held.leasedUntil });
  assert.equal(jobState(sql, held.id)?.state, 'leased', 'a stale unlease finished a job another host holds');
  sql.close();
});

test('UNLEASE OF A SLASH JOB WHOSE RUN ENDED FINISHES IT, rather than putting it back where nothing will delete it', async () => {
  /* `release()` DELETES A PENDING JOB, BUT ONLY WHEN THE RUN ENDS. A job handed back to `pending` after that is a job
     no later release will find, and the next lease posts it. */
  const { k, sql, run, held } = await asked();
  value(k.cancelRun(run, 'p_1'));
  unlease(sql, { id: held.id, leasedUntil: held.leasedUntil });
  /* `attempts` IS 0, because an unlease is a job nobody tried, which is the rule `unlease` keeps for every kind. */
  assert.deepEqual({ ...jobState(sql, held.id) }, { state: 'done', attempts: 0 });
  assert.deepEqual(k.leaseOutbox(['infer.ask'], 10), [], 'the cancelled run asked Slash again');
  sql.close();
});

test('UNLEASE OF A SLASH JOB WHOSE RUN IS STILL WAITING PUTS IT BACK AS BEFORE', async () => {
  const { k, sql, held } = await asked();
  unlease(sql, { id: held.id, leasedUntil: held.leasedUntil });
  assert.deepEqual({ ...jobState(sql, held.id) }, { state: 'pending', attempts: 0 });
  assert.equal(k.leaseOutbox(['infer.ask'], 10)[0]?.id, held.id);
  sql.close();
});
