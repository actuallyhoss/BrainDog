/**
 * The signs read true where audit 35 found them reading green over a fault (loop/research-audit-35.md, findings 1 and 6).
 *
 * EACH CASE IS THE FAULT ITSELF, BUILT THROUGH THE KERNEL'S VERBS where a verb makes it: runs that crash after leaving a
 * step and are swept, a pattern whose dedupe sets every text aside, a filer that stops filing. Where only a feed writes
 * the table (a young series), the rows are written as `writePoints` writes them. Each case has its other side, so a
 * sign that is merely red everywhere does not pass.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fileSignReading, readSigns, runSignsNight, type VitalSign } from '../src/signs.ts';
import { CARD, OWNER, record, text, used } from './ingest-tail-kit.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms: number): string => new Date(ms).toISOString();

const sign = (sql: NodeSql, id: string, at: number, tz = 'UTC'): VitalSign => {
  const s = readSigns(sql, at, tz).find((x) => x.sign === id);
  assert.ok(s, `${id} is not on the list`);
  return s;
};
const ok = (r: { ok: boolean }): void => assert.ok(r.ok, JSON.stringify(r));

/* ── runs-true: a handoff the sweep wrote is a run lost ───────────────── */

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};
const as = (session: SessionHints): WriteContext => ({ actor: 'agent:claude', principal: { kind: 'token', token: 't_1' }, session });

/** A record with `n` runs, each of which works, leaves a next step, and then goes silent, as a crashed session does. */
async function crashed(n: number) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  ok(await k.install([TASKS]));
  for (let i = 0; i < n; i++) {
    ok(k.create('tasks', { what: `Task ${i}` }, as({ client_id: `c${i}` })));
    clock.advance(5 * MIN);
    ok(k.update('session', `S${i + 1}`, { next: `Carry on with ${i}` }, as({ client_id: `c${i}` })));
  }
  return { sql, clock, k };
}

/** The hourly sweep, run now. */
async function sweep(r: Awaited<ReturnType<typeof crashed>>): Promise<void> {
  r.sql.exec(
    `INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('01J00000000000000000000099', ?, 'purge', 'sweep', '{}', 'pending', 0)
     ON CONFLICT (kind, key) DO UPDATE SET due_at = excluded.due_at, state = 'pending'`,
    iso(r.clock.now()),
  );
  await r.k.drain();
}

test('RUNS: ten runs that crashed after leaving a step, swept to handoffs, read red, not "ended normally"', async () => {
  const r = await crashed(10);
  r.clock.advance(13 * HOUR);
  await sweep(r);
  const states = r.sql.all<{ state: string; n: number }>("SELECT state, count(*) AS n FROM entry WHERE register = 'session' GROUP BY state");
  assert.deepEqual(states.map((s) => `${s.state} ${s.n}`), ['handoff 10'], 'the sweep did not hand the ten off, so this is not the audit\'s case');
  const runs = sign(r.sql, 'runs-true', r.clock.now());
  assert.equal(runs.state, 'red', runs.said);
  assert.equal(runs.value, 10);
  assert.equal(runs.said, '10 of 10 runs this week went silent and never ended. A normal end is being lost.');
  assert.ok(runs.facts.includes('10 runs went silent and were left waiting with their next step, not ended.'), runs.facts.join(' | '));
  assert.ok(!/[—]|\bS\d+\b|01J/.test(runs.said + runs.facts.join(' ')), 'an id or a dash reached the words');
  r.sql.close();
});

test('RUNS: a run that hands off itself ended normally; one swept among eight is under the quarter, three are over it', async () => {
  /* EIGHT RUNS HAND OFF IN THEIR OWN NAME: their `state` line is the agent's, so each ended as it meant to. */
  const self = await crashed(8);
  for (let i = 0; i < 8; i++) ok(self.k.update('session', `S${i + 1}`, { state: 'handoff' }, as({ client_id: `c${i}` })));
  self.clock.advance(13 * HOUR);
  await sweep(self);
  const green = sign(self.sql, 'runs-true', self.clock.now());
  assert.equal(green.state, 'green', green.said);
  assert.equal(green.said, 'Every run that ended this week ended normally.');
  self.sql.close();

  /* SEVEN END THEMSELVES (each left a step, so `endRun` hands it on in the run's own name), TWO CRASH: two of nine is
     under a quarter, so green, and the two are counted. A third lost tips it. */
  const mixed = await crashed(9);
  for (let i = 0; i < 7; i++) ok(mixed.k.endRun(as({ client_id: `c${i}` }), {}));
  mixed.clock.advance(13 * HOUR);
  await sweep(mixed);
  const quarter = sign(mixed.sql, 'runs-true', mixed.clock.now());
  assert.equal(quarter.state, 'green', quarter.said);
  assert.equal(quarter.said, '7 of 9 runs this week ended normally.');
  /* ONE OF THE SEVEN, written as the sweep writes a run with no step. */
  mixed.sql.exec("UPDATE entry SET state = 'abandoned' WHERE id = (SELECT id FROM entry WHERE register = 'session' ORDER BY updated_at, id LIMIT 1)");
  const red = sign(mixed.sql, 'runs-true', mixed.clock.now());
  assert.equal(red.state, 'red', `${red.said} ${red.facts.join(' | ')}`);
  assert.equal(red.said, '3 of 9 runs this week did not end normally: 1 was abandoned and 2 went silent. A normal end is being lost.');
  mixed.sql.close();
});

/* ── arrivals-filed: a day all set aside is not a day filed ───────────── */

test('ARRIVALS: a dedupe that sets every text aside reads red with how many; one filed among them is green', async () => {
  /* THE PATTERN DEDUPES ON THE ACCOUNT ALONE: after the first text, every charge on the card is "a repeat". */
  const r = await record(CARD({ dedupe: ['account'] }));
  ok(r.k.write('accounts', r.card, { last4: '1234' } as never, OWNER));
  assert.equal(text(r.k, used('1234', 'Corner Shop', '120.00', '05/10/2026')).state, 'matched');
  r.clock.advance(2 * DAY);
  for (const [shop, amount] of [['Bakery', '40.00'], ['Pharmacy', '85.50'], ['Taxi', '62.00']] as const)
    assert.equal(text(r.k, used('1234', shop, amount, '07/10/2026')).state, 'skipped');
  const red = sign(r.sql, 'arrivals-filed', r.clock.now() + HOUR, 'Africa/Cairo');
  assert.equal(red.state, 'red', red.said);
  assert.equal(red.value, 3);
  assert.equal(red.said, 'All 3 messages in the day up to 10 October were set aside as repeats. None was filed.');
  assert.ok(red.facts.some((f) => f.startsWith('Looks like a repeat of Corner Shop')), red.facts.join(' | '));
  /* A QUIET DAY AFTER IT DOES NOT HIDE IT: the day judged is the one up to the newest arrival. */
  assert.equal(sign(r.sql, 'arrivals-filed', r.clock.now() + 1.5 * DAY).state, 'red');
  r.sql.close();

  const one = await record(CARD({ dedupe: ['account'] }));
  ok(one.k.write('accounts', one.card, { last4: '1234' } as never, OWNER));
  text(one.k, used('1234', 'Corner Shop', '120.00', '05/10/2026'));
  one.clock.advance(2 * DAY);
  text(one.k, used('1234', 'Bakery', '40.00', '07/10/2026'));
  assert.equal(sign(one.sql, 'arrivals-filed', one.clock.now() + HOUR).said, 'The only message in the day up to 10 October was set aside as a repeat, not filed.');
  one.sql.close();

  /* THE SAME DAY WITH ONE FILED: a repeat set aside beside a charge filed is the pattern working. */
  const g = await record(CARD({ dedupe: ['amount', 'account'] }));
  ok(g.k.write('accounts', g.card, { last4: '1234' } as never, OWNER));
  assert.equal(text(g.k, used('1234', 'Corner Shop', '120.00', '07/10/2026')).state, 'matched');
  assert.equal(text(g.k, used('1234', 'Corner Shop', '120.00', '08/10/2026')).state, 'skipped');
  const green = sign(g.sql, 'arrivals-filed', g.clock.now() + HOUR);
  assert.equal(green.state, 'green', green.said);
  assert.equal(green.said, 'Every message has been filed or set aside within a day.');
  g.sql.close();
});

test('ARRIVALS: a day of texts a rule sets aside is a quiet day, not red; a repeat among them still is', async () => {
  /* A PATTERN'S OWN SKIP (a PIN reminder) IS THE PERSON'S CALL: a bank that sends only those on a day files nothing and
     is working. Judged as set aside, one such text read red for the two weeks it stayed the newest. */
  const r = await record(CARD({ skip: [{ when: { field: 'body', contains: 'Pharmacy' }, reason: 'A pharmacy text is not a charge to keep.' }] }));
  ok(r.k.write('accounts', r.card, { last4: '1234' } as never, OWNER));
  assert.equal(text(r.k, used('1234', 'Corner Shop', '120.00', '05/10/2026')).state, 'matched');
  r.clock.advance(2 * DAY);
  assert.equal(text(r.k, used('1234', 'Pharmacy', '85.50', '07/10/2026')).state, 'skipped');
  const green = sign(r.sql, 'arrivals-filed', r.clock.now() + HOUR);
  assert.equal(green.state, 'green', green.said);
  /* A REPEAT THE SAME DAY IS THE RECORD'S CALL, AND NOTHING WAS FILED: red, and the rule's skip is not in the count. */
  assert.equal(text(r.k, used('1234', 'Corner Shop', '120.00', '05/10/2026')).state, 'skipped');
  const red = sign(r.sql, 'arrivals-filed', r.clock.now() + HOUR);
  assert.equal(red.state, 'red', red.said);
  assert.equal(red.said, 'The only message in the day up to 10 October was set aside as a repeat, not filed.');
  r.sql.close();
});

/* ── numbers-arrive: a young series is read by its feed's declared interval ── */

const bare = async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  return sql;
};

/** A feed declared to bring a number every `every`, and `n` of its numbers a day apart, the newest at `newest`. */
function fed(sql: NodeSql, key: string, every: string, newest: number, n: number, source = `ingest:${key}`): void {
  sql.exec(
    "INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES (?, 1, 'ingest', ?, 'x', ?)",
    `ingest.${key}`,
    JSON.stringify({ ingest: key, channel: 'poll', every, description: `The ${key} feed` }),
    iso(NOW - 30 * DAY),
  );
  for (let i = 0; i < n; i++)
    sql.exec(
      "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, ?, 'int', 1, ?, ?)",
      key,
      iso(newest - i * DAY),
      100 + i,
      source,
      iso(newest),
    );
}

test('NUMBERS: a daily feed with three numbers, the newest four days old, is red; two days old, green', async () => {
  const sql = await bare();
  fed(sql, 'visitors', '1d', NOW - 4 * DAY, 3);
  const red = sign(sql, 'numbers-arrive', NOW, 'Africa/Cairo');
  assert.equal(red.state, 'red', red.said);
  assert.equal(red.said, '1 series has had no number since 4 October. Nothing is scheduled to bring one.');
  assert.ok(red.facts.includes('visitors: no number since 4 October.'), red.facts.join(' | '));
  sql.close();
  const g = await bare();
  fed(g, 'visitors', '1d', NOW - 2 * DAY, 3);
  const green = sign(g, 'numbers-arrive', NOW);
  assert.equal(green.state, 'green', green.said);
  assert.equal(green.said, 'Every series has its numbers on time.');
  g.close();
});

test('NUMBERS: a weekly feed\'s young series is on time at ten days; with no feed declared, it is not judged', async () => {
  const sql = await bare();
  fed(sql, 'invoices', '1w', NOW - 10 * DAY, 2);
  assert.equal(sign(sql, 'numbers-arrive', NOW).state, 'green');
  assert.equal(sign(sql, 'numbers-arrive', NOW + 12 * DAY).state, 'red', 'past three weeks a weekly series is late');
  sql.close();
  const none = await bare();
  fed(none, 'invoices', '1d', NOW - 10 * DAY, 2, 'test');
  assert.equal(sign(none, 'numbers-arrive', NOW).state, 'none', 'a young series no feed declares was judged');
  none.close();
});

/* ── a filed sign: it stands a day, then says since when ─────────────── */

test('FILED: a reading stands a day after it is filed; past that it reads none, "Not read since" the day, never its old green', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await openRecord(sql, clock);
  ok(fileSignReading(sql, 'model-answers', { state: 'green', value: 9, said: 'The model answered 9 of 9 asks this week.' }, NOW, 'UTC'));
  assert.equal(sign(sql, 'model-answers', NOW + 23 * HOUR).state, 'green');
  /* THE NIGHTS GO BY WITH NOTHING FILED: each writes "nothing filed" for its day, which is no filing to stand on. */
  runSignsNight(sql, NOW + 12.5 * HOUR, 'UTC');
  runSignsNight(sql, NOW + 36.5 * HOUR, 'UTC');
  const gone = sign(sql, 'model-answers', NOW + DAY + MIN);
  assert.equal(gone.state, 'none');
  assert.equal(gone.value, null);
  assert.equal(gone.said, 'Not read since 8 October.');
  assert.deepEqual(gone.facts, ['It last read green: The model answered 9 of 9 asks this week.']);
  assert.equal(sign(sql, 'model-answers', NOW + 3 * DAY).said, 'Not read since 8 October.');
  /* A NEW FILING STANDS AGAIN. */
  ok(fileSignReading(sql, 'model-answers', { state: 'red', value: 0, said: 'The model answered none of 4 asks.' }, NOW + 3 * DAY, 'UTC'));
  assert.equal(sign(sql, 'model-answers', NOW + 3 * DAY + HOUR).state, 'red');
  sql.close();
});

test('EMPTY: a record with nothing on it still reads none on every sign', async () => {
  const sql = await bare();
  for (const s of readSigns(sql, NOW + 3 * DAY, 'Africa/Cairo')) assert.equal(s.state, 'none', `${s.sign}: ${s.said}`);
  runSignsNight(sql, NOW + DAY, 'UTC');
  for (const s of readSigns(sql, NOW + 2 * DAY, 'UTC')) assert.equal(s.state, 'none', `${s.sign} after a night: ${s.said}`);
  sql.close();
});
