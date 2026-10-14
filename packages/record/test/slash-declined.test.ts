/**
 * A press the included model's ceiling turned away before anything was sent, said as that and not as a model that did
 * not answer.
 *
 * WHAT WAS MEASURED BEFORE THIS FILE. A record of 300 lists puts a prompt of 51,152 bytes on the press, and the
 * Worker's `includedInference` reckons its worst case past the 232 neurons the operator's ceiling counts an ask at, so
 * it throws `NotSent` (`sent: false`) before the binding: the hold released, no `call` row, nothing asked. The record's
 * catch had one sentence for every throw, "The model did not answer, so Slash's own rules drafted these.", and the
 * press returned nothing else a screen could read, so the Slash screen kept saying the included model drafts on a
 * record where every press and every daily look will be the rules' until the record shrinks. The refusal's own fix
 * ("Raise the ceiling for this job, or send fewer rows") is the operator's, and the owner can do neither, so it is not
 * what he is told.
 *
 * THE MODELS BELOW THROW AS THE HOSTS DO: `NotSent` is an `Error` with `sent: false` under the model `included`, and
 * the endpoint's `SlashKeyClosedError` is an `Error` with `sent: false` under `endpoint`, the only other `sent: false`
 * either host throws (`grep -rn "sent = false" apps packages`). A key that would not open is not a record too large, so
 * that one keeps the old sentence. RED BEFORE THE FIX, measured: 0 pass, 2 fail, `large` undefined on both presses and
 * the dropped line the old one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type SlashHeld, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Filed = { by: string; filed: { id: string }[]; dropped: string[]; large?: boolean };

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    search: ['what'],
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
    state: 'state',
    done: ['done'],
  } as never,
};

/** A meter with room, keeping what each hold ended as. */
const meter = () => {
  const states: string[] = [];
  const m: SlashMeter = {
    hold: async () => {
      const i = states.push('held') - 1;
      const held: SlashHeld = { settle: () => void (states[i] = 'settled'), release: () => void (states[i] = 'released') };
      return { ok: true, value: held };
    },
  };
  return { states, meter: m };
};

async function press(model: SlashModel) {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const m = meter();
  const api = await createRecordApi({ sql, clock, slashModel: model, slashMeter: m.meter });
  assert.ok((await api.kernel.install([TASKS])).ok);
  value(await api.create({ register: 'tasks', fields: { what: 'Invoice Acme', state: 'open' } }, OWNER));
  /* THE OWNER'S OWN USE ON FIVE DAYS, so Slash advises a record past its fortnight (HD.410). */
  for (const [i, day] of [3, 5, 7, 9].entries()) {
    clock.set(T0 + day * DAY);
    value(api.kernel.update('tasks', 'tasks#1', { what: i % 2 === 0 ? 'Invoice Acme.' : 'Invoice Acme' }, { actor: 'p_owner', version: i + 1 }));
  }
  clock.set(T0 + 20 * DAY);
  const out = value<Filed>(await api.slashPropose({}, OWNER));
  sql.close();
  return { out, states: m.states };
}

/** The sentence the Worker's `budgetSpent` writes, which the record must not hand the owner. */
const CEILING = 'This call would spend about 272 neurons and its ceiling is 232. Raise the ceiling for this job, or send fewer rows.';

test('A PRESS THE INCLUDED MODEL TURNED AWAY UNSENT says the record is too large for it, and says so to the screen', async () => {
  const unsent: SlashModel = { name: 'included', draft: async () => { throw Object.assign(new Error(CEILING), { sent: false }); } };
  const { out, states } = await press(unsent);
  assert.deepEqual(states, ['released']);
  assert.equal(out.by, 'rules');
  assert.equal(out.large, true);
  assert.ok(out.dropped.includes("This BrainDog is too large for the included model to read, so Slash's own rules drafted these."), JSON.stringify(out.dropped));
  /* NEITHER THE OLD SENTENCE NOR THE OPERATOR'S FIX: the model was never asked, and the owner cannot raise the ceiling. */
  assert.ok(!out.dropped.some((d) => d.includes('did not answer') || d.includes('ceiling') || d.includes('neurons')), JSON.stringify(out.dropped));
});

test('A MODEL THAT THREW, OR A KEY THAT WOULD NOT OPEN, is not said to be a record too large', async () => {
  const threw: SlashModel = { name: 'included', draft: async () => { throw new Error('InferenceUpstreamError: 3043'); } };
  const a = await press(threw);
  assert.equal(a.out.large, false);
  assert.ok(a.out.dropped.includes("The model did not answer, so Slash's own rules drafted these."), JSON.stringify(a.out.dropped));

  const closed: SlashModel = { name: 'endpoint', draft: async () => { throw Object.assign(new Error('The key labelled slash would not open.'), { sent: false }); } };
  const b = await press(closed);
  assert.deepEqual(b.states, ['released']);
  assert.equal(b.out.large, false);
  assert.ok(!b.out.dropped.some((d) => d.includes('too large')), JSON.stringify(b.out.dropped));
});
