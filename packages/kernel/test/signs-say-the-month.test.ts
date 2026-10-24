/**
 * Health says what the screens it watches say (audit 25 October, Y5): a green sign over a month that held failures says
 * how many, so "Every script that ran finished its last run" never stands under "four runs failed this month".
 *
 * WHAT IS JUDGED DOES NOT MOVE. A sign still reads red on the last run (a script) and on the last seven days (an
 * automation); only the green sentence now carries the month's failures, counted from the first of the calendar month,
 * as Automations counts them (`record/src/automations.ts`, `started_at` from the month's first day, UTC).
 *
 * And the two sentences that said nothing comes in where plenty had: no web call on a schedule is said as that, and no
 * number arriving on a schedule is said as that, never as no number at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import type { ScriptAnswer, Scripted } from '../src/script-run.ts';
import type { SignReading } from '../src/signs.ts';
import { readSigns } from '../src/signs.ts';
import { SIGNS_FLOW } from '../src/signs-flow.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The first of November, so the whole test sits inside one calendar month. */
const START = Date.UTC(2026, 10, 1, 9);

const PLANTS: Declaration = {
  id: 'register.plants',
  kind: 'register',
  body: { id: 'plants', name: 'Plants', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const WATERING: Declaration = {
  id: 'script.watering',
  kind: 'script',
  body: { script: 'watering', title: 'Water the ferns', runs: { rule: true }, egress: [], keys: [], reads: ['plants'], writes: ['plants'], source: 'export default async function run(ctx) {}' } as never,
};

const rule = (name: string, title: string, steps: unknown[]): Declaration => ({
  id: `rule.${name}`,
  kind: 'rule',
  body: { rule: name, name: title, on: { written: { register: 'plants', op: ['create'] } }, once_per: ['entry'], steps } as never,
});

const KICK = rule('kick_watering', 'Start the watering', [{ script: { id: 'watering', as: 'job' } }]);
const ASK = rule('ask_repot', 'Ask to repot', [{ ask_person: { question: 'Repot {{what}}?', options: ['yes', 'no'], as: 'answer', wait: '1d' } }]);
const NOTE = rule('note_plant', 'Note a new plant', [{ notify: { say: 'New plant: {{what}}' } }]);

type Rec = { k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> };

async function record(...decls: Declaration[]): Promise<Rec> {
  const sql = openSqlite();
  const clock = fixedClock(START);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-greenhouse', name: 'The Greenhouse', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([PLANTS, ...decls]);
  assert.ok(out.ok, fixOf(out));
  return { k, sql, clock };
}

const plant = (r: Rec, what: string): void => {
  const made = r.k.create('plants', { what }, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
};

const USAGE = { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 };

/** The watering script refuses while `broken` is set, and finishes once it is not. */
async function settle(r: Rec, broken: boolean): Promise<void> {
  const sandbox = async (_s: Scripted): Promise<ScriptAnswer> =>
    broken ? { refused: { code: null, why: 'watering threw: hose is undefined' }, log: '', usage: USAGE } : { writes: [], log: '', usage: USAGE };
  const execute = (async () => {
    throw new Error('no call is declared here');
  }) as never;
  for (let i = 0; i < 2; i++) {
    await r.k.drain();
    await r.k.runActions(execute, { script: sandbox, limit: 50 });
  }
}

function sign(sql: NodeSql, id: string, at: number): SignReading {
  const s = SIGNS_FLOW.find((x) => x.sign === id);
  assert.ok(s?.read, `${id} is not on the list`);
  const got = s.read(sql, at, 'UTC');
  assert.ok(![got.said, ...(got.facts ?? [])].some((l) => /[—]/.test(l)), `an em dash in ${got.said}`);
  return got;
}

test('A SCRIPT THAT WAS REFUSED THIS MONTH AND FINISHES NOW: still green, and the sentence counts the refusals and names it', async () => {
  const r = await record(WATERING, KICK);
  plant(r, 'Fern');
  await settle(r, true);
  r.clock.advance(DAY);
  plant(r, 'Moss');
  await settle(r, true);
  r.clock.advance(DAY);
  plant(r, 'Ivy');
  await settle(r, false);
  const got = sign(r.sql, 'scripts-refused', r.clock.now());
  assert.equal(got.state, 'green', 'the last run finished, so the sign is judged as before');
  assert.equal(got.said, 'Every script that ran finished its last run. 2 runs were refused earlier this month: Water the ferns.');
  assert.ok(!got.said.includes('hose'), 'what the script threw stays in its log');
  r.sql.close();
});

test('A SCRIPT WITH NO REFUSAL THIS MONTH says what it said, and a refusal last month is not this month', async () => {
  const r = await record(WATERING, KICK);
  plant(r, 'Fern');
  await settle(r, false);
  assert.equal(sign(r.sql, 'scripts-refused', r.clock.now()).said, 'Every script that ran finished its last run.');
  r.sql.close();

  /* REFUSED ON 31 OCTOBER, finished on 1 November: last month's refusal is not this month's. */
  const before = await record(WATERING, KICK);
  before.clock.set(START - DAY);
  plant(before, 'Fern');
  await settle(before, true);
  before.clock.set(START + HOUR);
  plant(before, 'Moss');
  await settle(before, false);
  assert.equal(sign(before.sql, 'scripts-refused', before.clock.now()).said, 'Every script that ran finished its last run.');
  before.sql.close();
});

test('AN AUTOMATION THAT FAILED EARLIER THIS MONTH, OUTSIDE THE WEEK: still green, and the sentence says the month as Automations does', async () => {
  const r = await record(ASK, NOTE);
  plant(r, 'Fern');
  await r.k.drain();
  r.clock.advance(DAY + HOUR);
  await r.k.drain();
  /* Ten days on, the failure is out of the week and still in the month. */
  r.clock.advance(10 * DAY);
  plant(r, 'Moss');
  await r.k.drain();
  const got = sign(r.sql, 'automations-failed', r.clock.now());
  assert.equal(got.state, 'green');
  assert.equal(got.said, 'None of 2 runs in 7 days failed. 1 run failed earlier this month: Ask to repot.');
  r.sql.close();
});

test('NOTHING ON A SCHEDULE is said as that: no web call on a schedule, and no number arriving on a schedule', async () => {
  const r = await record();
  const signs = readSigns(r.sql, START, 'UTC');
  const said = (id: string) => signs.find((s) => s.sign === id)!.said;
  assert.equal(said('actions-paused'), 'No web call runs on a schedule on this record.');
  assert.equal(said('actions-held'), 'No web call runs on a schedule on this record.');
  assert.equal(said('numbers-arrive'), 'No number arrives on a schedule on this record, so there is nothing to judge by.');
  r.sql.close();
});
