/**
 * The alarm breathes between its steps and stands aside for a person, with what is left going on soon after
 * (`alarm-pace.ts`). The rules in a bare test, then the object as it ships (`cloud-harness.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALARM_SLICE_UNITS, ASIDE_MOST_MS, ASIDE_MS, breathe, pace } from '../src/alarm-pace.ts';
import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAW';
const OWNER = 'ada@example.test';

test('NOBODY HERE: a pass does not stand aside, and a person who left before it began does not count', () => {
  const p = pace(() => 1_000);
  p.arrived();
  p.left();
  p.began();
  assert.equal(p.aside(), false);
});

test('A CALL STILL BEING ANSWERED, OR ONE THAT CAME DURING THE PASS, STANDS IT ASIDE', () => {
  const still = pace(() => 1_000);
  still.arrived();
  still.began();
  assert.equal(still.aside(), true, 'a call still being answered is somebody here');

  const during = pace(() => 1_000);
  during.began();
  assert.equal(during.aside(), false);
  during.arrived();
  during.left();
  assert.equal(during.aside(), true, 'a call that came and went during the pass is somebody here');
});

test('ASIDE HAS AN END: past its most a pass runs, and a pass that reached its end starts the count again', () => {
  let t = 1_000;
  const p = pace(() => t);
  p.arrived();
  p.began();
  assert.equal(p.aside(), true);
  t += ASIDE_MOST_MS - 1;
  assert.equal(p.aside(), true);
  t += 1;
  assert.equal(p.aside(), false, 'somebody working all afternoon held the alarm');
  p.finished();
  assert.equal(p.aside(), true, 'the count did not start again');
});

test('A CLOCK THAT WENT BACK never reads as past the end of standing aside', () => {
  let t = 100_000;
  const p = pace(() => t);
  p.arrived();
  p.began();
  assert.equal(p.aside(), true);
  t = 1_000;
  assert.equal(p.aside(), true);
});

test('STANDING lasts until the time it was told, and a pass that reached its end clears it', () => {
  let t = 1_000;
  const p = pace(() => t);
  p.stoodOff(t + ASIDE_MS);
  assert.equal(p.standing(), true);
  t += ASIDE_MS;
  assert.equal(p.standing(), false);
  p.stoodOff(t + ASIDE_MS);
  p.finished();
  assert.equal(p.standing(), false);
});

test('THE BREATH IS A TIMER AND NOT A PROMISE: every promise waiting settles before it ends', async () => {
  let turns = 0;
  const spin = async () => {
    for (let i = 0; i < 1_000; i++) {
      await Promise.resolve();
      turns += 1;
    }
  };
  void spin();
  await breathe();
  assert.equal(turns, 1_000);
});

type Obj = { alarm(): Promise<void>; fetch(request: Request): Promise<Response> };

/** Every `op` line written while `run` runs. */
async function lines(run: () => Promise<void>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => {
    try {
      const line = JSON.parse(String(a[0])) as Record<string, unknown>;
      if (typeof line.op === 'string') out.push(line);
    } catch {
      /* Not a line of ours. */
    }
  };
  try {
    await run();
  } finally {
    console.log = log;
  }
  return out;
}

async function made() {
  const c = await cloud();
  await c.provision(REC, 'studio', OWNER);
  const cookie = await c.signIn(OWNER);
  const object = c.record(REC) as unknown as Obj;
  return { c, cookie, object };
}

test('ONE TIMED LINE A STEP, and a pass with nobody here runs every one of them', async () => {
  const { c, object } = await made();
  await c.settle();
  const said = await lines(() => object.alarm());
  const steps = said.filter((l) => l.op === 'alarm-step').map((l) => l.step);
  assert.deepEqual(steps, ['drain', 'act', 'ask', 'model', 'look', 'lint', 'signs', 'google']);
  for (const l of said.filter((x) => x.op === 'alarm-step')) {
    assert.equal(typeof l.ms, 'number');
    assert.equal(typeof l.let, 'number');
  }
  assert.equal(said.some((l) => l.op === 'alarm-aside'), false);
});

test('A PERSON WHO COMES DURING THE PASS: it stops at the next breath with the alarm set seconds on, and the rest goes on from there', async () => {
  const { c, cookie, object } = await made();
  await c.settle();
  /* The call arrives after the alarm's first await, so it lands inside the pass, as a request let in at a breath does. */
  let answered = 0;
  const said = await lines(async () => {
    const alarm = object.alarm();
    await new Promise((d) => setImmediate(d));
    const res = await c.ask('/api/boot', { cookie });
    answered = res.status;
    await res.text();
    await alarm;
  });
  assert.equal(answered, 200);
  const steps = said.filter((l) => l.op === 'alarm-step').map((l) => l.step);
  assert.ok(steps.length < 8, `it ran on past the person: ${steps.join(' ')}`);
  assert.ok(said.some((l) => l.op === 'alarm-aside'), 'it did not say it stood aside');
  const at = await c.storages.get(REC)!.getAlarm();
  assert.ok(at !== null && at > Date.now() && at <= Date.now() + ASIDE_MS, `the alarm is set for ${String(at)}`);

  /* NOTHING IS LOST: the next pass, with nobody here, reaches the steps this one left. */
  await c.settle();
  const next = await lines(() => object.alarm());
  assert.deepEqual(next.filter((l) => l.op === 'alarm-step').map((l) => l.step), ['drain', 'act', 'ask', 'model', 'look', 'lint', 'signs', 'google']);
  assert.equal(next.some((l) => l.op === 'alarm-aside'), false);
});

test('A WAKE ASKED WHILE THE ALARM STANDS ASIDE DOES NOT BRING IT BACK AT ONCE', async () => {
  const { c, cookie, object } = await made();
  await c.settle();
  await lines(async () => {
    const alarm = object.alarm();
    await new Promise((d) => setImmediate(d));
    await (await c.ask('/api/boot', { cookie })).text();
    await alarm;
  });
  const at = await c.storages.get(REC)!.getAlarm();
  await (await c.ask('/api/boot', { cookie })).text();
  await c.settle();
  assert.equal(await c.storages.get(REC)!.getAlarm(), at);
});

test('THE SLICE IS SMALLER THAN THE SHARE, or a slice would be the whole of it', () => {
  assert.ok(ALARM_SLICE_UNITS >= 1 && ALARM_SLICE_UNITS < 10);
});
