/**
 * The nightly reading of the vital signs, over three nights of a stepped clock in Cairo: due at five past midnight
 * local, one row a sign for the day that ended, a filed sign kept as it was filed, the same night run twice changing
 * nothing, rows past 400 days pruned, and the four filed signs refusing what is not theirs to file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { fileSignReading, nextSignsDue, readSigns, ruleOf, runSignsNight, signOf, SIGNS_KEY, VITAL_SIGNS } from '../src/signs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const TZ = 'Africa/Cairo';
const NOW = Date.UTC(2026, 9, 8, 12);
const MIN = 60_000;
const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };

const rows = (sql: NodeSql, day: string) =>
  sql.all<{ sign: string; state: string; hand: string; rule: string; said: string }>('SELECT sign, state, hand, rule, said FROM sign_reading WHERE day = ? ORDER BY sign', day);

test('THREE NIGHTS: due at 00:05 Cairo, one row a sign for the day that ended, the filed sign kept, the days strip filled', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.equal(SIGNS_KEY, 'signs');

  /* NIGHT ONE: five past midnight on the 9th in Cairo is 21:05 on the 8th in UTC. */
  const first = nextSignsDue(clock.now(), TZ);
  assert.equal(new Date(first).toISOString(), '2026-10-08T21:05:00.000Z');
  clock.advance(first - clock.now());
  assert.equal(runSignsNight(sql, clock.now(), TZ), VITAL_SIGNS.length);
  const one = rows(sql, '2026-10-08');
  assert.equal(one.length, 22);
  assert.ok(one.every((r) => r.state === 'none'), 'an empty record had a day that was not none');
  assert.deepEqual(new Set(one.map((r) => r.hand)), new Set(['kernel', 'host', 'record']));
  for (const r of one) assert.equal(r.rule, ruleOf(signOf(r.sign)!));

  /* THE 9TH: the host files the model green, and two questions about one thing are asked. */
  clock.advance(10 * 60 * MIN);
  assert.deepEqual(fileSignReading(sql, 'model-answers', { state: 'green', value: 9, said: 'The model answered 9 of 9 asks this week.' }, clock.now(), TZ), { ok: true, value: { sign: 'model-answers', day: '2026-10-09' } });
  assert.equal(readSigns(sql, clock.now(), TZ).find((s) => s.sign === 'model-answers')?.state, 'green', 'a filed reading did not stand for now');
  for (const question of ['Fire the kiln on Friday?', 'Fire the kiln on Saturday?'])
    assert.ok(k.propose({ question, body_kind: 'options', body: { ...OPTIONS, about: 'kiln' } }, 'slash').ok);

  /* NIGHT TWO: the filed sign keeps its filing, so eight rows are written and nine stand. */
  const second = nextSignsDue(clock.now(), TZ);
  assert.equal(second - first, 24 * 60 * MIN);
  clock.advance(second - clock.now());
  assert.equal(runSignsNight(sql, clock.now(), TZ), VITAL_SIGNS.length - 1);
  const two = rows(sql, '2026-10-09');
  assert.equal(two.length, 22);
  assert.equal(two.find((r) => r.sign === 'model-answers')?.state, 'green');
  assert.equal(two.find((r) => r.sign === 'questions-by-cause')?.state, 'red');

  /* NIGHT THREE, and run twice: the kernel's five are read again over themselves, nothing doubles. */
  clock.advance(nextSignsDue(clock.now(), TZ) - clock.now());
  assert.equal(runSignsNight(sql, clock.now(), TZ), VITAL_SIGNS.length);
  assert.equal(runSignsNight(sql, clock.now(), TZ), 17, 'a night run again wrote over the filed signs');
  assert.equal(rows(sql, '2026-10-10').length, 22);
  assert.equal(rows(sql, '2026-10-10').find((r) => r.sign === 'model-answers')?.state, 'none', 'yesterday’s filing stood for a day nothing was filed');

  const signs = readSigns(sql, clock.now() + MIN, TZ);
  const causes = signs.find((s) => s.sign === 'questions-by-cause')!;
  assert.deepEqual(causes.days.slice(-3), [
    { day: '2026-10-08', state: 'none' },
    { day: '2026-10-09', state: 'red' },
    { day: '2026-10-10', state: 'red' },
  ]);
  assert.equal(causes.days.length, 14);
  assert.equal(causes.days[0]!.day, '2026-09-27');
  assert.deepEqual(signs.find((s) => s.sign === 'model-answers')!.days.slice(-2).map((d) => d.state), ['green', 'none']);
  sql.close();
});

test('400 DAYS ARE KEPT and the day before them goes, at the night', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const put = (day: string) =>
    sql.exec("INSERT INTO sign_reading (sign, day, state, value, said, rule, hand, read_at) VALUES ('runs-true', ?, 'green', 0, 'ok', 'x', 'kernel', ?)", day, new Date(NOW).toISOString());
  put('2025-09-02');
  put('2025-09-03');
  runSignsNight(sql, NOW, 'UTC');
  const kept = sql.all<{ day: string }>("SELECT day FROM sign_reading WHERE day < '2026-01-01' ORDER BY day").map((r) => r.day);
  assert.deepEqual(kept, ['2025-09-03'], 'the prune is not at 400 days');
  sql.close();
});

test('ONLY THE FOUR FILED SIGNS ARE FILED, and only a reading in shape', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  const file = (id: string, r: unknown) => fileSignReading(sql, id, r as never, NOW, TZ);
  const code = (r: ReturnType<typeof file>) => (r.ok ? 'ok' : 'refusal' in r ? r.refusal.code : 'conflict');
  assert.equal(code(file('weather', { state: 'green', value: 1, said: 'Sunny.' })), 'REF_UNKNOWN');
  assert.equal(code(file('runs-true', { state: 'green', value: 1, said: 'All good.' })), 'FORBIDDEN', 'a sign the kernel reads was filed over');
  assert.equal(code(file('pages-clean', { state: 'amber', value: 1, said: 'Hmm.' })), 'VALUE_MALFORMED');
  assert.equal(code(file('pages-clean', { state: 'red', value: 1.5, said: 'Half a page.' })), 'VALUE_MALFORMED');
  assert.equal(code(file('pages-clean', { state: 'red', value: 3, said: '' })), 'VALUE_MALFORMED');
  assert.equal(code(file('pages-clean', { state: 'red', value: 3, said: 'x', facts: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })), 'VALUE_MALFORMED');
  assert.equal(code(file('pages-clean', { state: 'red', value: 3, said: '3 pages print something raw.', facts: ['Money: a placeholder where a number goes.'] })), 'ok');
  const page = readSigns(sql, NOW, TZ).find((s) => s.sign === 'pages-clean')!;
  assert.deepEqual([page.state, page.value, page.said, page.facts], ['red', 3, '3 pages print something raw.', ['Money: a placeholder where a number goes.']]);
  assert.equal(sql.one<{ hand: string }>("SELECT hand FROM sign_reading WHERE sign = 'pages-clean'")?.hand, 'host');
  sql.close();
});

test('THROUGH THE KERNEL: the record arms the night as it opens, the night fires at 00:05 by itself, and signs() and signRead() answer', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: TZ, locale: 'en-GB', owner: { id: 'p_1', email: 'me@example.test', name: 'Sam' } }).ok);
  /* A RECORD OPENED AGAIN FINDS ITS ROW WAITING and arms nothing twice; the row is due at five past midnight, Cairo. */
  const again = await openRecord(sql, clock);
  const armed = sql.all<{ due_at: string; payload: string; state: string }>("SELECT due_at, payload, state FROM schedule WHERE kind = 'snapshot' AND key = ?", SIGNS_KEY);
  assert.equal(armed.length, 1);
  assert.deepEqual(JSON.parse(armed[0]!.payload), { signs: true });

  const filed = again.signRead('tools-listed', { state: 'red', value: 0, said: 'Claude Code connected 6 times this week and was given the tool list 0 times.' });
  assert.ok(filed.ok, JSON.stringify(filed));
  assert.equal(again.signRead('arrivals-filed', { state: 'green', value: 0, said: 'Fine.' }).ok, false, 'a kernel sign was filed over');

  for (let night = 0; night < 3; night++) {
    const due = Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'snapshot' AND key = ?", SIGNS_KEY)!.due_at);
    /* EVERY NIGHT IS CAIRO'S, THE FIRST TOO: armed as the kernel opened, before the record had its zone, and moved to the
       record's own night by `createRecord`. */
    assert.equal(new Date(due).toISOString().slice(11), '21:05:00.000Z', 'the night is not at 00:05 in Cairo');
    clock.set(due);
    await again.drain();
  }
  const days = sql.all<{ day: string; n: number }>('SELECT day, count(*) AS n FROM sign_reading GROUP BY day ORDER BY day').map((r) => ({ day: r.day, n: Number(r.n) }));
  assert.deepEqual(days, [
    { day: '2026-10-08', n: 22 },
    { day: '2026-10-09', n: 22 },
    { day: '2026-10-10', n: 22 },
  ]);
  const read = again.signs();
  assert.ok(read.ok);
  const tools = read.value.signs.find((s) => s.sign === 'tools-listed')!;
  assert.deepEqual(tools.days.slice(-3).map((d) => d.state), ['red', 'none', 'none']);
  assert.equal(k.signs().ok, true);
  sql.close();
});
