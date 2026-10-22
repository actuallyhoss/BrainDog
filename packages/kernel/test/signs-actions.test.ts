/**
 * The signs of what runs by itself and what arrives (SHL-C01 job 1, `signs-actions.ts`), each read on a record built
 * through the kernel's own verbs where a verb makes the thing: a poll the provider refuses pauses, a job that fails eight
 * times stops, texts arrive at the bank's door and then stop, a message comes in that nothing verified. Each threshold is
 * met on both sides of its line, so a threshold moved by one turns a case here the other colour.
 *
 *   node --test packages/kernel/test/signs-actions.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { openRecord, type ActionAnswer, type Declaration, type GrantRow, type Kernel } from '../src/index.ts';
import { drainSchedule } from '../src/schedule.ts';
import { ACTION_LATE_PERIODS, actionsBlocking, SIGNS_ACTIONS } from '../src/signs-actions.ts';
import { FEED_LATE_PERIODS, readSigns, VITAL_SIGNS, type VitalSign } from '../src/signs.ts';
import { CARD, OWNER, record as bank, text, used } from './ingest-tail-kit.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 5, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

const sign = (sql: NodeSql, id: string, at: number): VitalSign => {
  const s = readSigns(sql, at, 'UTC').find((x) => x.sign === id);
  assert.ok(s, `${id} is not on the list`);
  return s;
};

/** No id, no em dash, no host and no "row" in what a person reads. */
const plainWords = (s: { said: string; facts?: string[] }): void => {
  for (const line of [s.said, ...(s.facts ?? [])]) {
    assert.doesNotMatch(line, /[—]|\b[0-9A-HJKMNP-TV-Z]{26}\b|#\d|\brow\b|example\.test|ingest\.|_/, line);
  }
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const POLL: Declaration = {
  id: 'ingest.balance',
  kind: 'ingest',
  body: {
    ingest: 'balance',
    channel: 'poll',
    description: 'Oxbow revenue',
    url: 'https://api.example.test/v1/balance',
    every: '1h',
    grant: 'example read',
    project: 'studio',
    extract: { what: { after: 'balance ' } },
    writes: { register: 'notes' },
  } as never,
};

async function withPoll(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  const made = k.bindGrant({ label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1');
  assert.ok(made.ok, fixOf(made));
  assert.ok((made.value as GrantRow).id);
  const out = await k.install([NOTES, POLL]);
  assert.ok(out.ok, fixOf(out as Result<unknown>));
  return { k, sql, clock };
}

const said = (status: number, body = ''): ActionAnswer => ({ status, body, bytes: body.length, ms: 3, requests: 1 });
const answering = (a: ActionAnswer) => async () => a;

test('THE LIST: five more signs, read by the kernel, with names and no ids; the late rule matches numbers-arrive', () => {
  assert.deepEqual(SIGNS_ACTIONS.map((s) => s.sign), ['actions-paused', 'actions-held', 'schedule-failed', 'doors-silent', 'arrivals-unverified']);
  for (const s of SIGNS_ACTIONS) {
    assert.ok(VITAL_SIGNS.includes(s), `${s.sign} is not spread into VITAL_SIGNS`);
    assert.equal(s.hand, 'kernel');
    assert.doesNotMatch(s.name, /[a-z]+-[a-z]+/);
  }
  assert.equal(ACTION_LATE_PERIODS, FEED_LATE_PERIODS);
  const arrived = VITAL_SIGNS.find((s) => s.sign === 'arrived');
  assert.ok(arrived && arrived.read === null && arrived.hand === 'record', 'arrived is not a sign the record files');
});

test('A PAUSED POLL: a provider that refuses the key pauses it, and the sign and the project both name it', async () => {
  const { k, sql, clock } = await withPoll();
  /* NOT PAUSED YET: one good run is green, and the project has nothing in its way. */
  assert.equal((await k.runActions(answering(said(200, 'balance 120')))).paused, 0);
  const green = sign(sql, 'actions-paused', clock.now());
  assert.deepEqual([green.state, green.value, green.said], ['green', 0, 'No action that runs on a schedule is paused.']);
  assert.deepEqual(actionsBlocking(sql, clock.now(), 'studio'), []);

  clock.advance(2 * HOUR);
  assert.equal((await k.runActions(answering(said(401, 'no')))).paused, 1);
  const red = sign(sql, 'actions-paused', clock.now());
  assert.deepEqual([red.state, red.value], ['red', 1]);
  assert.equal(red.said, '1 action is paused and will not run until somebody resumes it: Oxbow revenue.');
  assert.ok(red.facts.includes('Oxbow revenue has been paused since 5 October: its key was refused (401).'), red.facts.join(' | '));
  plainWords(red);

  const [blocking, ...more] = actionsBlocking(sql, clock.now(), 'studio');
  assert.equal(more.length, 0);
  assert.equal(blocking?.why, 'paused');
  assert.equal(blocking?.status, 401);
  assert.equal(blocking?.said, 'Oxbow revenue has not answered since 5 October: its key was refused (401). It is paused until somebody resumes it.');
  plainWords(blocking!);
  /* ANOTHER PROJECT'S WAY HOLDS NOTHING OF IT. */
  assert.deepEqual(actionsBlocking(sql, clock.now(), 'garden'), []);
  sql.close();
});

test('A LATE ACTION is in its project\'s way past twice its interval, and not a minute before', async () => {
  const { k, sql, clock } = await withPoll();
  await k.runActions(answering(said(200, 'balance 120')));
  /* NOTHING RUNS IT AGAIN: the clock moves and no runner is called. */
  clock.advance(2 * HOUR - 60_000);
  assert.deepEqual(actionsBlocking(sql, clock.now(), 'studio'), []);
  clock.advance(2 * 60_000);
  const late = actionsBlocking(sql, clock.now(), 'studio');
  assert.deepEqual(late.map((l) => [l.why, l.said]), [['late', 'Oxbow revenue has not answered since 5 October.']]);
  sql.close();
});

test('A FAILED SCHEDULE: a job that fails eight times reads red with its name, and Decide holds no question for it', async () => {
  const { sql, clock } = await withPoll();
  /* NOTHING FAILED, and a job of the person's is scheduled: green. An empty record reads none (`signs-read.test.ts`). */
  const green = sign(sql, 'schedule-failed', clock.now());
  assert.deepEqual([green.state, green.value], ['green', 0]);
  let n = 0;
  const deps = () => ({ mint: () => `01JZ8QK3F7R2M9V4XN6TCB${String(++n).padStart(4, '0')}`, allocate: () => n, nowMs: clock.now() });
  const boom = { poll: () => { throw new Error('The provider could not be reached'); } };
  for (let rung = 1; rung <= 8; rung++) {
    const due = Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'poll' AND key = 'balance'")!.due_at);
    if (due > clock.now()) clock.set(due);
    drainSchedule(sql, deps(), boom, 100, ['poll']);
    if (rung < 8) assert.equal(sign(sql, 'schedule-failed', clock.now()).state, 'green', `red on rung ${rung}`);
  }
  assert.equal(sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'poll' AND key = 'balance'")?.state, 'failed');
  const red = sign(sql, 'schedule-failed', clock.now());
  assert.deepEqual([red.state, red.value], ['red', 1]);
  assert.equal(red.said, '1 job that runs by itself has stopped after failing: Oxbow revenue. The operator has been told.');
  plainWords(red);
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE status = 'open'").length, 0, 'a dead job opened a question');
  assert.deepEqual(actionsBlocking(sql, clock.now(), 'studio').map((l) => [l.why, l.said]), [['failed', 'Oxbow revenue has never answered. It stopped after failing again and again.']]);
  sql.close();
});

test('A DOOR QUIET THREE DAYS AFTER TEN ARRIVALS reads red with its name; nine arrivals are not judged; under three days is green', async () => {
  const r = await bank(CARD());
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, OWNER).ok);
  const start = r.clock.now();
  assert.equal(sign(r.sql, 'doors-silent', start).state, 'none');
  for (let i = 0; i < 9; i++) {
    text(r.k, used('1234', `SHOP ${i}`, `${10 + i}.00`));
    r.clock.advance(DAY);
  }
  const nine = sign(r.sql, 'doors-silent', r.clock.now() + 3 * DAY + HOUR);
  assert.equal(nine.state, 'none', `nine arrivals were judged: ${nine.said}`);
  text(r.k, used('1234', 'SHOP 9', '19.00'));
  const tenth = r.clock.now();
  const red = sign(r.sql, 'doors-silent', tenth + 3 * DAY + HOUR);
  assert.deepEqual([red.state, red.value], ['red', 1]);
  assert.equal(red.said, 'Bank texts has had nothing in 3 days, after 10 arrivals in the 14 days before.');
  /* THE FOURTEEN DAYS BEFORE THE QUIET ONES: the first text an hour inside them counts, an hour outside it does not. */
  assert.equal(sign(r.sql, 'doors-silent', start + 17 * DAY - HOUR).state, 'red');
  assert.equal(sign(r.sql, 'doors-silent', start + 17 * DAY + HOUR).state, 'none');
  plainWords(red);

  /* AN ELEVENTH A DAY LATER: ten before the quiet window and one in it is green, until it too is three days old. */
  r.clock.advance(DAY);
  text(r.k, used('1234', 'SHOP 10', '20.00'));
  const last = r.clock.now();
  const short = sign(r.sql, 'doors-silent', last + 3 * DAY - HOUR);
  assert.deepEqual([short.state, short.value], ['green', 0]);
  assert.equal(sign(r.sql, 'doors-silent', last + 3 * DAY + HOUR).state, 'red');
  /* A DOOR HE TURNED OFF IS QUIET FOR A GOOD REASON. */
  r.sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'ingest.bank-sms'");
  assert.equal(sign(r.sql, 'doors-silent', last + 3 * DAY + HOUR).state, 'none');
  r.sql.close();
});

test('AN ARRIVAL NOTHING VERIFIED reads red for seven days, then is out of the window', async () => {
  const r = await bank(CARD());
  assert.equal(sign(r.sql, 'arrivals-unverified', r.clock.now()).state, 'none');
  text(r.k, used('1234', 'SHOP', '10.00'));
  const green = sign(r.sql, 'arrivals-unverified', r.clock.now());
  assert.deepEqual([green.state, green.value], ['green', 0]);
  const forged = r.k.arrive({ channel: 'webhook', ingest: 'bank-sms', body: used('9999', 'NOBODY', '1.00'), sha256: 'forged-1', verified: false });
  assert.ok(forged.ok, JSON.stringify(forged));
  const at = r.clock.now();
  const red = sign(r.sql, 'arrivals-unverified', at);
  assert.deepEqual([red.state, red.value], ['red', 1]);
  assert.equal(red.said, '1 message in 7 days came in that nothing verified, so no pattern was offered it.');
  plainWords(red);
  assert.equal(sign(r.sql, 'arrivals-unverified', at + 7 * DAY - HOUR).state, 'red');
  assert.equal(sign(r.sql, 'arrivals-unverified', at + 7 * DAY + HOUR).state, 'none');
  r.sql.close();
});

test('HELD BY THE PLAN: a run the limit held this month reads red with the action\'s name', async () => {
  const { sql, clock } = await withPoll();
  assert.deepEqual([sign(sql, 'actions-held', clock.now()).state], ['green']);
  /* WRITTEN AS `meter` WRITES A HELD RUN: a `pull` event whose usage counts it held. */
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES ('01JZ8QK3F7R2M9V4XN6TCBHELD', ?, 'ingest:balance', 'pull', 'declaration:ingest.balance', 'declaration', ?, 'held by the plan')",
    new Date(clock.now()).toISOString(),
    JSON.stringify({ channel: 'poll', outcome: 'held', status: null, usage: { runs: 0, requests: 0, bytes: 0, failures: 0, held: 1 } }),
  );
  const red = sign(sql, 'actions-held', clock.now());
  assert.deepEqual([red.state, red.value], ['red', 1]);
  assert.equal(red.said, "The plan's limit held 1 run this month, so one action did not run when due: Oxbow revenue.");
  plainWords(red);
  sql.close();
});

test('F60: a daily script whose egress is empty fetches nothing, so numbers-arrive does not count it a feed; one that fetches is counted', async () => {
  const daily = (name: string, egress: string[]): Declaration => ({
    id: `script.${name}`,
    kind: 'script',
    body: { script: name, title: `Tidy ${name}`, runs: { every: '1d' }, egress, keys: [], reads: ['notes'], writes: ['notes'], source: 'export default async function run(ctx) {}' } as never,
  });
  const read = async (egress: string[]): Promise<VitalSign> => {
    const sql = openSqlite();
    const clock = fixedClock(NOW);
    const k = await openRecord(sql, clock);
    const out = await k.install([NOTES, daily('notes', egress)]);
    assert.ok(out.ok, fixOf(out as Result<unknown>));
    const s = sign(sql, 'numbers-arrive', NOW + 3 * DAY);
    sql.close();
    return s;
  };
  assert.equal((await read([])).state, 'none');
  assert.equal((await read(['https://api.example.test'])).state, 'red');
});

test('A PROJECT PAGE READS WHAT IS IN ITS WAY (actions.blocking): the paused action, in its sentence, and another project nothing', async () => {
  const { k, sql, clock } = await withPoll();
  await k.runActions(answering(said(200, 'balance 120')));
  clock.advance(2 * HOUR);
  await k.runActions(answering(said(401, 'no')));
  const read = (about: string) => k.block({ kind: 'table', source: 'actions.blocking', about, columns: [{ field: 'name' }, { field: 'why' }, { field: 'said' }] } as never);
  const studio = read('studio');
  assert.deepEqual(studio.refusals, []);
  assert.deepEqual(studio.rows?.map((r) => [r.fields.why, r.fields.said]), [['paused', actionsBlocking(sql, clock.now(), 'studio')[0]!.said]]);
  assert.deepEqual(read('garden').rows, []);
  sql.close();
});
