/**
 * The kernel's five vital signs, each read on a record that should be red and one that should be green, and each
 * threshold met on both sides of its line, so a threshold moved by one turns a case here the other colour
 * (`tools/mutate.mjs`, the `sign-*` rows).
 *
 * THE RECORDS ARE BUILT THROUGH THE KERNEL'S OWN VERBS where a verb makes the thing: texts arrive at a door and are held
 * or filed, questions are proposed and put off, entries are created. Where nothing but a feed or a run writes the table
 * (numbers, feeds, runs), the rows are written as those write them, as `built-in-figures.test.ts` does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { readSigns, VITAL_SIGNS, type VitalSign } from '../src/signs.ts';
import { CARD, OWNER, record, text, used } from './ingest-tail-kit.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number): string => new Date(ms).toISOString();

const sign = (sql: NodeSql, id: string, at: number, tz = 'UTC'): VitalSign => {
  const s = readSigns(sql, at, tz).find((x) => x.sign === id);
  assert.ok(s, `${id} is not on the list`);
  return s;
};

const ok = <T>(r: { ok: boolean; value?: T }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.value as T;
};

test('AN EMPTY RECORD READS NONE ON EVERY SIGN, never green, and the list is the nine of 2.2 with names and no ids', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const signs = readSigns(sql, NOW, 'Africa/Cairo');
  assert.deepEqual(
    signs.map((s) => s.sign),
    ['arrivals-filed', 'numbers-arrive', 'model-answers', 'tools-listed', 'briefing-true', 'questions-by-cause', 'oldest-question', 'runs-true', 'pages-clean', 'arrived',
     'scripts-paused', 'scripts-refused', 'scripts-sourceless', 'automations-failed', 'automations-parked', 'automations-idle', 'automations-stopped-chains',
     'actions-paused', 'actions-held', 'schedule-failed', 'doors-silent', 'arrivals-unverified',
     'writes-authored', 'format-current', 'amounts-whole', 'rate-age', 'rates-current'],
  );
  for (const s of signs) {
    assert.equal(s.state, 'none', `${s.sign} read ${s.state} on an empty record`);
    assert.equal(s.value, null);
    assert.ok(s.said.length > 0 && !/[—]/.test(s.said), `${s.sign} said ${JSON.stringify(s.said)}`);
    assert.ok(!/[a-z]+-[a-z]+/.test(s.name), `${s.sign}'s name is an id`);
    assert.equal(s.days.length, 14);
  }
  assert.equal(VITAL_SIGNS.filter((s) => s.read !== null).length, 22);
  sql.close();
});

/* ── arrivals-filed ────────────────────────────────────────────────────── */

/** A record with the bank's door, `n` texts for digits no account holds, and one transaction made at the same moment. */
async function held(n: number, filedToo = true) {
  const r = await record(CARD());
  const sent = r.clock.now();
  for (let i = 0; i < n; i++) text(r.k, used('1234', `SHOP ${i}`, `${10 + i}.00`));
  if (filedToo) ok(r.k.create('transactions', { what: 'Rent', amount: { amount: 500_000, currency: 'EGP' }, on: '2026-10-08', account: r.card }, OWNER));
  return { ...r, sent };
}

test('ARRIVALS: three held more than a day is red, with the count, the newest entry and what most of them say', async () => {
  const r = await held(3);
  const red = sign(r.sql, 'arrivals-filed', r.sent + DAY + 60_000, 'Africa/Cairo');
  assert.equal(red.state, 'red');
  assert.equal(red.value, 3);
  assert.match(red.said, /^3 messages have waited more than a day\./);
  assert.match(red.said, /Most say: No account has 1234 in Digits the bank prints\./);
  assert.ok(red.facts.some((f) => f === 'The newest transaction in Transactions is from 8 October.'), red.facts.join(' | '));
  /* A MINUTE SHORT OF A DAY, NOTHING HAS WAITED YET. */
  assert.equal(sign(r.sql, 'arrivals-filed', r.sent + DAY - 60_000).state, 'green');
  r.sql.close();
});

test('ARRIVALS: messages that wait after their pattern is gone are still judged, not nothing to judge by', async () => {
  const r = await held(3);
  r.sql.exec("UPDATE declaration SET retired = 1 WHERE kind = 'ingest'");
  const red = sign(r.sql, 'arrivals-filed', r.sent + DAY + 60_000);
  assert.equal(red.state, 'red');
  assert.match(red.said, /^3 messages have waited more than a day\./);
  r.sql.close();
});

test('ARRIVALS: one held more than a day is red; a minute short of a day, green', async () => {
  /* ONE TEXT UNFILED PAST A DAY IS ONE THE PERSON MUST FILE BY HAND: two once read green under a limit of three. */
  const r = await held(1);
  const red = sign(r.sql, 'arrivals-filed', r.sent + DAY + 60_000);
  assert.equal(red.state, 'red');
  assert.equal(red.value, 1);
  assert.match(red.said, /^1 message has waited more than a day\./);
  /* A MINUTE SHORT OF A DAY IT HAS NOT WAITED YET. */
  assert.equal(sign(r.sql, 'arrivals-filed', r.sent + DAY - 60_000).state, 'green');
  r.sql.close();
});

test('ARRIVALS: a message two days newer than the newest entry of the list it feeds is red; half a day is not', async () => {
  const r = await held(0);
  r.clock.advance(2 * DAY);
  text(r.k, used('1234', 'LATE SHOP', '9.00'));
  const red = sign(r.sql, 'arrivals-filed', r.clock.now() + 60_000);
  assert.equal(red.state, 'red');
  assert.match(red.said, /The newest transaction in Transactions is from/);

  const g = await held(0);
  g.clock.advance(12 * HOUR);
  text(g.k, used('1234', 'SOON SHOP', '9.00'));
  assert.equal(sign(g.sql, 'arrivals-filed', g.clock.now() + 60_000).state, 'green');
  r.sql.close();
  g.sql.close();
});

test('ARRIVALS: a door with a message filed 13 and a half days ago is judged; at 15 days there is nothing to judge by', async () => {
  const r = await record(CARD());
  ok(r.k.create('accounts', { name: 'Gold card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, last4: '9999' }, OWNER));
  const sent = r.clock.now();
  text(r.k, used('9999', 'CORNER SHOP', '12.00'));
  assert.equal(sign(r.sql, 'arrivals-filed', sent + 13.5 * DAY).state, 'green');
  assert.equal(sign(r.sql, 'arrivals-filed', sent + 15 * DAY).state, 'none');
  r.sql.close();
});

/* ── numbers-arrive ────────────────────────────────────────────────────── */

/** `n` numbers of `series`, `gap` apart, the newest at `newest`. */
function points(sql: NodeSql, series: string, newest: number, gap: number, n: number): void {
  for (let i = 0; i < n; i++)
    sql.exec(
      "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, ?, 'int', 1, 'test', ?)",
      series,
      iso(newest - i * gap),
      100 + i,
      iso(newest),
    );
}

const bare = async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  return sql;
};

test('NUMBERS: one series in four gone quiet is red, naming the date; one in five is green', async () => {
  const sql = await bare();
  for (const s of ['sales', 'visits', 'refunds']) points(sql, s, NOW - 2 * DAY, DAY, 6);
  points(sql, 'signups', NOW - 10 * DAY, DAY, 6);
  const red = sign(sql, 'numbers-arrive', NOW, 'Africa/Cairo');
  assert.equal(red.state, 'red');
  assert.match(red.said, /^1 series has had no number since 28 September\. Nothing is scheduled to bring one\.$/);
  assert.ok(red.facts.includes('The newest number is from 6 October.'), red.facts.join(' | '));
  points(sql, 'orders', NOW - DAY, DAY, 6);
  assert.equal(sign(sql, 'numbers-arrive', NOW).state, 'green');
  sql.close();
});

test('NUMBERS: a series is stale past three of its gaps and past three days, and counts from five numbers', async () => {
  /* HOURLY, NEWEST 2.5 DAYS AGO: far past three gaps, but not three days. At 3.5 days it is stale. */
  const sql = await bare();
  points(sql, 'hourly', NOW - 2.5 * DAY, HOUR, 6);
  assert.equal(sign(sql, 'numbers-arrive', NOW).state, 'green');
  assert.equal(sign(sql, 'numbers-arrive', NOW + DAY).state, 'red');
  sql.close();
  /* WEEKLY, NEWEST 15 DAYS AGO: under three gaps. At 22 days it is past them. */
  const w = await bare();
  points(w, 'weekly', NOW - 15 * DAY, 7 * DAY, 6);
  assert.equal(sign(w, 'numbers-arrive', NOW).state, 'green');
  assert.equal(sign(w, 'numbers-arrive', NOW + 7 * DAY).state, 'red');
  w.close();
  /* FOUR NUMBERS ARE NOT A SERIES YET; FIVE ARE. */
  const four = await bare();
  points(four, 'young', NOW - 20 * DAY, DAY, 4);
  assert.equal(sign(four, 'numbers-arrive', NOW).state, 'none');
  points(four, 'young', NOW - 24 * DAY, DAY, 1);
  assert.equal(sign(four, 'numbers-arrive', NOW).state, 'red');
  four.close();
});

test('NUMBERS: the nightly readings of a figure are not numbers that arrive, and do not hide a series gone quiet', async () => {
  const sql = await bare();
  for (const f of ['a', 'b', 'c', 'd', 'e']) {
    sql.exec("INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES (?, 1, 'metric', ?, 'x', ?)", `metric.open-${f}`, JSON.stringify({ metric: `open-${f}`, name: `Open ${f}`, source: 'register.tasks' }), iso(NOW - 30 * DAY));
    for (let i = 0; i < 6; i++)
      sql.exec("INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, 1, 'int', 1, 'register.tasks', ?)", `open-${f}`, iso(NOW - i * DAY).slice(0, 10), iso(NOW));
  }
  assert.equal(sign(sql, 'numbers-arrive', NOW).state, 'none', 'the readings the record makes of itself counted as numbers that arrive');
  points(sql, 'sales', NOW - 10 * DAY, DAY, 6);
  assert.equal(sign(sql, 'numbers-arrive', NOW).state, 'red', 'five fresh figure readings hid one series gone quiet');
  sql.close();
});

test('NUMBERS: a daily feed whose last good run is a day and a half old is green; two and a half, red', async () => {
  const sql = await bare();
  sql.exec("INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES ('ingest.gold', 1, 'ingest', ?, 'x', ?)", JSON.stringify({ ingest: 'gold', channel: 'poll', every: '1d', description: 'Gold price' }), iso(NOW - 30 * DAY));
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload) VALUES ('s2', ?, 'poll', 'gold', '{}')", iso(NOW));
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES ('e2', ?, 'ingest:gold', 'pull', 'declaration:ingest.gold', 'declaration', ?)", iso(NOW - 1.5 * DAY), JSON.stringify({ outcome: 'ok' }));
  assert.equal(sign(sql, 'numbers-arrive', NOW).state, 'green');
  const red = sign(sql, 'numbers-arrive', NOW + DAY);
  assert.equal(red.state, 'red');
  assert.match(red.said, /^Gold price has not run well since/);
  sql.close();
});

/* ── questions-by-cause and oldest-question ────────────────────────────── */

const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };
const asked = async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const ask = (question: string, body: Record<string, unknown> = {}, by = 'slash') => ok<{ id: string }>(k.propose({ question, body_kind: 'options', body: { ...OPTIONS, ...body } }, by));
  return { sql, clock, k, ask };
};

test('CAUSES: two open questions about one thing are red and named by their words; one each is green', async () => {
  const r = await asked();
  r.ask('Fire the kiln on Friday?', { about: 'kiln' });
  r.ask('Glaze the lids?', { about: 'box' });
  assert.equal(sign(r.sql, 'questions-by-cause', NOW).state, 'green');
  r.ask('Fire the kiln on Saturday?', { about: 'kiln' });
  const red = sign(r.sql, 'questions-by-cause', NOW);
  assert.equal(red.state, 'red');
  assert.equal(red.value, 2);
  assert.equal(red.said, '2 open questions share one cause: Fire the kiln on Friday? One answer closes them.');
  r.sql.close();
});

test('CAUSES: a cause the body carries groups its questions; a text tail asks once however many texts wait', async () => {
  const r = await asked();
  r.ask('Which card is 7731?', { cause: 'tail:sms:accounts:7731' });
  r.ask('Which card is 7731, again?', { cause: 'tail:sms:accounts:7731' });
  assert.equal(sign(r.sql, 'questions-by-cause', NOW).state, 'red');
  r.sql.close();
  /* THE DOOR'S OWN TAIL QUESTION: three texts, one question, so one cause holds one question. */
  const t = await record(CARD());
  for (let i = 0; i < 3; i++) text(t.k, used('1234', `SHOP ${i}`, '10.00'));
  const green = sign(t.sql, 'questions-by-cause', t.clock.now());
  assert.equal(green.state, 'green', green.said);
  t.sql.close();
});

test('CAUSES: questions from before causes, asked in the same words, are one cause', async () => {
  const r = await asked();
  for (let i = 0; i < 3; i++) r.ask('Which account is the card ending 7731?');
  r.ask('Renew the domain?');
  const red = sign(r.sql, 'questions-by-cause', NOW);
  assert.equal(red.state, 'red');
  assert.equal(red.said, '3 open questions share one cause: Which account is the card ending 7731? One answer closes them.');
  r.sql.close();
});

test('CAUSES: four questions with no cause are red, three are not; one the record opened for its own fault is red', async () => {
  const r = await asked();
  for (const q of ['Call the plumber?', 'Renew the domain?', 'Book the flight?']) r.ask(q);
  assert.equal(sign(r.sql, 'questions-by-cause', NOW).state, 'green');
  r.ask('Order more clay?');
  assert.equal(sign(r.sql, 'questions-by-cause', NOW).state, 'red');
  r.sql.close();
  const f = await asked();
  f.ask('A job could not be delivered. Try it again?', {}, 'system');
  assert.equal(sign(f.sql, 'questions-by-cause', NOW).state, 'red');
  f.sql.close();
});

test('CAUSES: a list kind alone is no cause; the same words under two causes are one', async () => {
  /* TWO DIFFERENT TASKS PROPOSED ARE BOTH `tasks:add`, and that is not one question asked twice. */
  const r = await asked();
  r.ask('Add "Call the plumber" to tasks?');
  r.ask('Add "Renew the domain" to tasks?');
  r.sql.exec("UPDATE suggestion SET kind = 'tasks:add'");
  const green = sign(r.sql, 'questions-by-cause', NOW);
  assert.equal(green.state, 'green', green.said);
  assert.equal(green.said, '2 open questions, no two with the same cause.');
  r.sql.close();
  /* A CAUSE WRITTEN WRONG, one per payee, splits one question in many; the words still show it is one. */
  const w = await asked();
  w.ask('Which account is the card ending 7731?', { cause: 'tail:sms:7731:SHOP A' });
  w.ask('Which account is the card ending 7731?', { cause: 'tail:sms:7731:SHOP B' });
  const red = sign(w.sql, 'questions-by-cause', NOW);
  assert.equal(red.state, 'red');
  assert.equal(red.said, '2 open questions share one cause: Which account is the card ending 7731? One answer closes them.');
  assert.equal(red.facts.filter((f) => f.startsWith('2 share:')).length, 1, red.facts.join(' | '));
  w.sql.close();
});

test('OLDEST: an open question 14 days old is green, 15 is red; one put off does not count', async () => {
  const r = await asked();
  const q = r.ask('Raise the retainer?');
  const at = (days: number) => sign(r.sql, 'oldest-question', NOW + days * DAY + HOUR);
  assert.equal(at(14).state, 'green');
  const red = at(15);
  assert.equal(red.state, 'red');
  assert.equal(red.said, 'The oldest open question is 15 days old.');
  ok(r.k.decide(q.id, { defer: { until: iso(NOW + 30 * DAY), why: 'after the quarter closes' } }, 'p_1'));
  assert.equal(at(15).state, 'green');
  r.sql.close();
});

/* ── runs-true ─────────────────────────────────────────────────────────── */

let runs = 0;
/** A run as the agent door leaves it: its state, and when it was last heard from. */
function run(sql: NodeSql, state: string, heardAgo: number): void {
  runs += 1;
  const heard = iso(NOW - heardAgo);
  sql.exec(
    "INSERT INTO entry (id, register, seq, fields, state, created_at, updated_at) VALUES (?, 'session', ?, ?, ?, ?, ?)",
    `run${runs}`,
    1000 + runs,
    JSON.stringify({ state, last_seen: heard, client: 'Claude Code', client_id: `window-${String(runs)}`, doing: 'work' }),
    state,
    heard,
    heard,
  );
}

test('RUNS: three abandoned of eight ended is red, two is green; under eight ended is not judged on the share', async () => {
  const sql = await bare();
  for (let i = 0; i < 6; i++) run(sql, 'done', HOUR);
  for (let i = 0; i < 2; i++) run(sql, 'abandoned', HOUR);
  assert.equal(sign(sql, 'runs-true', NOW).state, 'green');
  run(sql, 'abandoned', HOUR);
  const red = sign(sql, 'runs-true', NOW);
  assert.equal(red.state, 'red');
  assert.equal(red.said, '3 of 9 runs this week ended as abandoned. A normal end is being lost.');
  sql.close();
  const few = await bare();
  for (let i = 0; i < 4; i++) run(few, 'abandoned', HOUR);
  for (let i = 0; i < 3; i++) run(few, 'done', HOUR);
  assert.equal(sign(few, 'runs-true', NOW).state, 'green');
  run(few, 'abandoned', HOUR);
  assert.equal(sign(few, 'runs-true', NOW).state, 'red', 'eight ended runs were not judged');
  few.close();
});

test('RUNS: a run open eleven hours after it was last heard from is green, thirteen is red; none in a week, none', async () => {
  const sql = await bare();
  run(sql, 'active', 11 * HOUR);
  assert.equal(sign(sql, 'runs-true', NOW).state, 'green');
  run(sql, 'idle', 13 * HOUR);
  assert.match(sign(sql, 'runs-true', NOW).said, /^1 run is still open more than 12 hours after last heard from\.$/);
  /* EIGHT DAYS ON, OUT OF THE WEEK AND STILL OPEN: the sweep never wrote them off, and that is not "no run". */
  const later = sign(sql, 'runs-true', NOW + 8 * DAY);
  assert.equal(later.state, 'red');
  assert.ok(later.facts.includes('Claude Code was last heard from 8 days ago and is still open.'), later.facts.join(' | '));
  sql.close();
  /* A RUN THAT ENDED EIGHT DAYS AGO IS OUT OF THE WEEK: nothing to judge by. */
  const old = await bare();
  run(old, 'done', 8 * DAY);
  assert.equal(sign(old, 'runs-true', NOW).state, 'none');
  run(old, 'done', 6 * DAY);
  assert.equal(sign(old, 'runs-true', NOW).said, 'Every run that ended this week ended normally.');
  old.close();
});

test('RUNS: runs carried in from elsewhere and never heard from here are not this week, however lately their rows changed', async () => {
  const sql = await bare();
  for (let i = 0; i < 9; i++) run(sql, 'done', HOUR);
  /* WRITTEN OFF WHERE THEY CAME FROM, NO `last_seen`, AND EDITED AN HOUR AGO, as a rule that fills in a run's project does. */
  for (let i = 0; i < 30; i++) {
    runs += 1;
    sql.exec(
      "INSERT INTO entry (id, register, seq, fields, state, created_at, updated_at) VALUES (?, 'session', ?, ?, ?, ?, ?)",
      `run${runs}`,
      1000 + runs,
      JSON.stringify({ state: 'abandoned', agent: 'claude', doing: 'Carried run', started: iso(NOW - 40 * DAY), project: 'things#1' }),
      'abandoned',
      iso(NOW - 40 * DAY),
      iso(NOW - HOUR),
    );
  }
  const read = sign(sql, 'runs-true', NOW);
  assert.equal(read.state, 'green');
  assert.equal(read.said, 'Every run that ended this week ended normally.');
  assert.ok(read.facts.includes('9 runs this week, 9 ended, 0 of them abandoned.'), read.facts.join(' | '));
  sql.close();
});
