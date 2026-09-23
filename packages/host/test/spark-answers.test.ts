/**
 * `serveAsks` (`src/spark-answers.ts`), the pass both hosts will run to answer an automation's `infer.ask` job, driven
 * against a fake kernel and a fake `answer`. `loop/research-infer-ask.md` §6 Brief C.
 *
 * A FAKE KERNEL AND NOT A REAL ONE, because a real kernel cannot queue this job yet: the lint refuses `ask_spark` until
 * Brief A's `answersSpark` flag lands in `packages/kernel`, which another agent owns while this is written. What the
 * kernel does with an ack is already the kernel's own tests (`packages/kernel/test/flow-waits.test.ts`); what is tested
 * here is which ack this pass sends for which outcome, which is the one decision in this file.
 *
 * WRITTEN FIRST AND RUN AGAINST A TREE WITH NO `src/spark-answers.ts`: the file failed to load, every case below red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Ack, OutboxRow } from '@braindog/kernel';
import type { Refusal, Result, Scheduler } from '@braindog/ports';

import { serveAsks, type SparkAsk } from '../src/spark-answers.ts';

/** A question as `flow.ts` `ask()` queues it, with Brief A's `rule` beside the run. The client's name is a row value. */
const ASK: SparkAsk = { run: 'r_1', step: 1, rule: 'rate', question: 'What rate for Acme Ltd?', shape: 'number', about: { client: 'Acme Ltd' } };

const row = (id: string, payload: unknown = ASK): OutboxRow => ({
  id,
  kind: 'infer.ask',
  payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  attempts: 0,
  leasedUntil: `2026-09-23T12:02:00.000Z#${id}`,
});

const SCHEDULER = { get: async () => null, set: async () => {}, clear: async () => {}, wake: async () => {} } as unknown as Scheduler;

function kernelOf(jobs: OutboxRow[], throwsOn: ReadonlySet<string> = new Set()) {
  const acks: Ack[] = [];
  const leased: { kinds: readonly string[]; n: number | undefined }[] = [];
  const tails: Scheduler[] = [];
  return {
    acks,
    leased,
    tails,
    leaseOutbox: (kinds: readonly string[], n?: number): OutboxRow[] => {
      leased.push({ kinds, n });
      return jobs.splice(0);
    },
    ackOutbox: (args: Ack): Result<null> => {
      if (throwsOn.has(args.id)) throw new Error('the object was evicted mid-ack');
      acks.push(args);
      return { ok: true, value: null };
    },
    tail: async (scheduler: Scheduler): Promise<void> => {
      tails.push(scheduler);
    },
  };
}

const refused = (code: Refusal['code'], fix: string): Result<{ text: string }> => ({ ok: false, refusal: { code, fix } });
const quiet = (): void => {};

test('a job answered is acked done with the text and the lease it was handed, and only infer.ask is leased', async () => {
  const kernel = kernelOf([row('o_1')]);
  const asked: SparkAsk[] = [];
  const out = await serveAsks(kernel as never, async (job) => (asked.push(job), { ok: true, value: { text: '4.5' } }), SCHEDULER);

  assert.deepEqual(kernel.leased, [{ kinds: ['infer.ask'], n: 5 }]);
  assert.deepEqual(asked, [ASK]);
  assert.deepEqual(kernel.acks, [{ id: 'o_1', state: 'done', result: { text: '4.5' }, leasedUntil: row('o_1').leasedUntil }]);
  assert.deepEqual(out, { answered: 1, failed: 0, refused: 0, unacked: 0 });
});

test('a refusal a retry cannot change is acked done with its sentence as result.failed, and is not retried', async () => {
  /* THE THREE THE BRIEF NAMES AND ONE IT DOES NOT. `OUT_OF_BOUNDS` stands for any refusal Spark adds later: only
     `UNREACHABLE` says the model was not reached, so only it walks the ladder, and a refusal nobody listed is not
     asked eight more times on the owner's allowance. */
  for (const code of ['SPARK_BUDGET_SPENT', 'PROPOSAL_SCHEMA', 'FORBIDDEN', 'OUT_OF_BOUNDS'] as const) {
    const kernel = kernelOf([row('o_1')]);
    const fix = `rule.rate asked Spark at step 2, and ${code} said no.`;
    const out = await serveAsks(kernel as never, async () => refused(code, fix), SCHEDULER);
    assert.deepEqual(kernel.acks, [{ id: 'o_1', state: 'done', result: { failed: fix }, leasedUntil: row('o_1').leasedUntil }], code);
    assert.deepEqual(out, { answered: 0, failed: 0, refused: 1, unacked: 0 }, code);
  }
});

test('a throw, or a model not reached, is acked failed with the message alone and never a field of the payload', async () => {
  const kernel = kernelOf([row('o_1'), row('o_2', { ...ASK, step: 2 })]);
  const out = await serveAsks(
    kernel as never,
    async (job) => {
      if (job.step === 1) throw new Error('The Spark endpoint answered 503.');
      return refused('UNREACHABLE', 'Spark could not reach its model for rule.rate at step 2.');
    },
    SCHEDULER,
  );
  const failed = kernel.acks.map((a) => ({ id: a.id, state: a.state, error: a.error, result: a.result })).sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(failed, [
    { id: 'o_1', state: 'failed', error: 'The Spark endpoint answered 503.', result: undefined },
    { id: 'o_2', state: 'failed', error: 'Spark could not reach its model for rule.rate at step 2.', result: undefined },
  ]);
  for (const a of kernel.acks) assert.doesNotMatch(String(a.error), /Acme|What rate/);
  assert.deepEqual(out, { answered: 0, failed: 2, refused: 0, unacked: 0 });
});

test('an ack that throws does not stop the rest of the batch', async () => {
  const kernel = kernelOf([row('o_1'), row('o_2'), row('o_3')], new Set(['o_1']));
  const said: string[] = [];
  const out = await serveAsks(kernel as never, async () => ({ ok: true, value: { text: '4' } }), SCHEDULER, 5, (line) => said.push(line));

  assert.deepEqual(kernel.acks.map((a) => a.id).sort(), ['o_2', 'o_3']);
  assert.deepEqual(out, { answered: 2, failed: 0, refused: 0, unacked: 1 });
  assert.deepEqual(said, ['ack o_1: the object was evicted mid-ack']);
});

test('an ack the kernel refuses is counted unacked and not answered, since its lease is somebody else\'s now', async () => {
  const kernel = kernelOf([row('o_1')]);
  kernel.ackOutbox = (): Result<null> => ({ ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'Job o_1 was leased again while you had it.' } });
  const said: string[] = [];
  const out = await serveAsks(kernel as never, async () => ({ ok: true, value: { text: '4' } }), SCHEDULER, 5, (line) => said.push(line));
  assert.deepEqual(out, { answered: 0, failed: 0, refused: 0, unacked: 1 });
  assert.deepEqual(said, ['ack o_1: Job o_1 was leased again while you had it.']);
  assert.equal(kernel.tails.length, 0);
});

test('tail is called once, with the scheduler handed in, after a pass that acked anything, and not after an empty one', async () => {
  const full = kernelOf([row('o_1'), row('o_2'), row('o_3')]);
  await serveAsks(full as never, async () => ({ ok: true, value: { text: 'x' } }), SCHEDULER);
  assert.equal(full.tails.length, 1);
  assert.equal(full.tails[0], SCHEDULER);

  const empty = kernelOf([]);
  const out = await serveAsks(empty as never, async () => assert.fail('nothing was leased, so nothing is asked'), SCHEDULER);
  assert.equal(empty.tails.length, 0);
  assert.deepEqual(out, { answered: 0, failed: 0, refused: 0, unacked: 0 });
});

test('the jobs of one pass are asked together, not one after another', async () => {
  /* ONE AFTER ANOTHER DOES NOT FIT INSIDE THE LEASE. `INFER_LEASE_MS` is 120 seconds (`packages/kernel/src/outbox.ts`)
     and a Spark call may take `SPARK_TIMEOUT_MS`, 30 seconds (`src/spark.ts`), so the fifth of five asked in turn is
     acked up to 150 seconds after it was leased, when another pass may already hold it and the fence refuses the
     answer. Each ask below resolves only once all three have been asked, so a pass that awaited them in turn never
     finishes, and the race turns that into a red line rather than a hung suite. */
  const kernel = kernelOf([row('o_1'), row('o_2'), row('o_3')]);
  let asked = 0;
  let release: () => void = () => {};
  const all = new Promise<void>((resolve) => (release = resolve));
  const pass = serveAsks(
    kernel as never,
    async () => {
      if (++asked === 3) release();
      await all;
      return { ok: true, value: { text: 'x' } };
    },
    SCHEDULER,
  );
  const late = new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), 500).unref());
  assert.notEqual(await Promise.race([pass, late]), 'late');
  assert.equal(kernel.acks.length, 3);
});

test('a job this pass cannot read is ended with a sentence and never reaches Spark', async () => {
  /* `rule` IS BRIEF A's, AND A ROW QUEUED BY A BUILD BEFORE IT HAS NONE. Spark's ledger row is written in the rule's
     name (`rule.<id> step <n>`), so a job without one is not asked; retrying cannot add the field either, so it ends. */
  const { rule: _rule, ...old } = ASK;
  const kernel = kernelOf([row('o_1', old), row('o_2', 'not json')]);
  const out = await serveAsks(kernel as never, async () => assert.fail('a job with no rule is never asked'), SCHEDULER);
  assert.deepEqual(kernel.acks, [
    {
      id: 'o_1',
      state: 'done',
      result: { failed: 'The question at step 2 was queued without what Spark needs to answer it, so the run stopped there.' },
      leasedUntil: row('o_1').leasedUntil,
    },
    {
      id: 'o_2',
      state: 'done',
      result: { failed: 'The question was queued without what Spark needs to answer it, so the run stopped there.' },
      leasedUntil: row('o_2', 'not json').leasedUntil,
    },
  ]);
  assert.deepEqual(out, { answered: 0, failed: 0, refused: 2, unacked: 0 });
});
