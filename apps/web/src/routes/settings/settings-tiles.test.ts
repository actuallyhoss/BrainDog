/**
 * What the Settings tiles say: the meters as bars, the last thirty nights as a strip, and the sentence
 * under the title. Every number is the record's own answer, and a night is only called missed when it really had none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Meter } from '../../lib/record/actions.ts';
import {
  doorState, doorsLine, doorWords, meterBars, monthDay, nightParts, nightsLine, nightsOf, nightsSaid, settingsSentence, shareOf, tileWords,
} from './billing.ts';

/** 29 September 2026, 14:00 UTC: day 29 of a 30-day month, well after the night's copy has run. */
const NOW = Date.UTC(2026, 8, 29, 14, 0, 0);
const at = (day: string, time = '03:17:00'): { at: string } => ({ at: `${day}T${time}Z` });
/** Every night from `from` to 29 September, one copy each. */
const nightly = (from: number, to = 29): { at: string }[] =>
  Array.from({ length: to - from + 1 }, (_, i) => at(`2026-09-${String(from + i).padStart(2, '0')}`));

const meter = (key: Meter['key'], share: number, binding = false): Meter => ({
  key,
  line: { runs: 'Runs', requests: 'Requests', bytes: 'Data fetched', ms: 'Run time' }[key] + ' 18,400 of 75,000',
  said: '',
  share,
  binding,
});

test('the month is counted in UTC, as the Worker counts it', () => {
  assert.deepEqual(monthDay(NOW), { day: 29, of: 30 });
  assert.deepEqual(monthDay(Date.UTC(2028, 1, 3)), { day: 3, of: 29 });
});

test('a share is never written as none when there is some', () => {
  assert.equal(shareOf(0), '0%');
  assert.equal(shareOf(0.004), '<1%');
  assert.equal(shareOf(0.537), '53%');
  assert.equal(shareOf(1.4), '100%');
});

test('each meter is a bar with its own figures in its label, and only the nearest one is ink', () => {
  const bars = meterBars([meter('runs', 0.25), meter('requests', 0.53, true), meter('bytes', 0.16)]);
  /* THE FIGURES BESIDE THE BAR, NEVER ON IT: a note is drawn at the end of the fill, so on a
     three-run month it sat on the empty track and the bar ran behind its own words ("ı 3 of 15,000"). */
  assert.deepEqual(bars.map((b) => b.label), ['Runs · 18,400 of 75,000', 'Requests · 18,400 of 75,000', 'Data fetched · 18,400 of 75,000']);
  assert.deepEqual(bars.map((b) => b.note), [undefined, undefined, undefined]);
  assert.deepEqual(bars.map((b) => b.tone), [undefined, 'ink', undefined]);
  assert.equal(bars[1]?.value, 0.53);
});

test('thirty nights each with a copy read as thirty, the newest in ink', () => {
  const nights = nightsOf(nightly(1), NOW);
  assert.equal(nights.length, 30);
  assert.equal(nights[0]?.day, '2026-08-31');
  assert.equal(nights[29]?.day, '2026-09-29');
  /* 31 August has no copy in this list and is before the first one kept, so it is not a failure. */
  assert.equal(nights[0]?.state, 'before');
  assert.equal(nightsOf([at('2026-08-31'), ...nightly(1)], NOW).every((n) => n.state === 'copied'), true);
  const parts = nightParts(nightsOf([at('2026-08-31'), ...nightly(1)], NOW));
  assert.deepEqual(parts.map((p) => [p.tone, p.value]), [['g2', 29], ['ink', 1]]);
  assert.equal(nightsLine(nightsOf([at('2026-08-31'), ...nightly(1)], NOW)), tileWords.everyNight(30));
});

test('a young record is not told it missed the nights before it existed', () => {
  const nights = nightsOf(nightly(24), NOW);
  assert.equal(nights.filter((n) => n.state === 'before').length, 24);
  assert.equal(nights.filter((n) => n.state === 'missed').length, 0);
  assert.equal(nightsLine(nights), 'A copy on each of the last 6 nights, since the first on 24 Sep.');
  assert.deepEqual(nightParts(nights).map((p) => p.tone), ['g4', 'g2', 'ink']);
});

test('a gap after the first copy is a miss, named by its day, and drawn red where it fell', () => {
  const copies = [at('2026-08-31'), ...nightly(1, 23), ...nightly(25)];
  const nights = nightsOf(copies, NOW);
  assert.equal(nights.find((n) => n.day === '2026-09-24')?.state, 'missed');
  assert.equal(nightsLine(nights), '1 of the last 30 nights has no copy: 24 Sep.');
  assert.deepEqual(nightParts(nights).map((p) => [p.tone, p.value]), [['g2', 24], ['danger', 1], ['g2', 4], ['ink', 1]]);
  assert.equal(nightsSaid(nights), 'A copy on 29 of the last 30 nights, and 1 with none.');
});

test("before six in the morning, tonight's copy is due and not missed", () => {
  const early = Date.UTC(2026, 8, 29, 2, 30);
  const nights = nightsOf(nightly(1, 28), early);
  assert.equal(nights[29]?.state, 'due');
  assert.equal(nightsLine(nights).includes('no copy'), false);
  /* AND A COPY TAKEN LATE ON A DAY STILL COUNTS FOR THAT DAY. */
  assert.equal(nightsOf([at('2026-09-29', '23:59:00')], NOW)[29]?.state, 'copied');
});

test('copies that cannot be dated are left out rather than guessed', () => {
  const nights = nightsOf([{ at: 'not a time' }], NOW);
  assert.equal(nights.every((n) => n.state === 'before'), true);
});

test('the title sentence says all healthy only about what it read', () => {
  const nights = nightsOf(nightly(1), NOW);
  const calm = [meter('runs', 0.3, true), meter('requests', 0.1)];
  assert.deepEqual(settingsSentence({ nights, meters: calm, resets: '1 October', now: NOW }), {
    sentence: "All healthy: last night's copy is in, and nothing runs out before 1 October.",
  });
  assert.deepEqual(settingsSentence({ nights, meters: null, resets: null, now: NOW }), { sentence: "All healthy: last night's copy is in." });
  assert.equal(settingsSentence({ nights: null, meters: null, resets: null, now: NOW }), null);
  /* A RECORD WITH NO COPY EVER KEPT is not told its copy is in, nor that one was missed. */
  assert.equal(settingsSentence({ nights: nightsOf([], NOW), meters: null, resets: null, now: NOW }), null);
});

test('and the phrase that needs him is the one drawn red', () => {
  const missed = nightsOf(nightly(1, 28), NOW);
  const near = [meter('runs', 0.91, true)];
  assert.deepEqual(settingsSentence({ nights: missed, meters: null, resets: null, now: NOW }), { sentence: 'No copy last night.', needs: 'No copy last night' });
  assert.deepEqual(settingsSentence({ nights: nightsOf(nightly(1), NOW), meters: near, resets: '1 October', now: NOW }), {
    sentence: "Runs are at 91%, 2 days to go, and last night's copy is in.",
    needs: 'Runs are at 91%, 2 days to go',
  });
  const full = settingsSentence({ nights: null, meters: [meter('bytes', 1, true)], resets: '1 October', now: NOW });
  assert.equal(full?.needs, 'Fetched data is used up until 1 October');
});

test('"nothing runs out" is said only where the pace keeps the nearest meter under its allowance', () => {
  /* 40% by the 10th of a 30-day month is 120% by the end of it. */
  const tenth = Date.UTC(2026, 8, 10, 12);
  const said = settingsSentence({ nights: null, meters: [meter('runs', 0.4, true)], resets: '1 October', now: tenth });
  assert.equal(said?.needs, 'At this pace runs will be used up before 1 October');
  const calm = settingsSentence({ nights: null, meters: [meter('runs', 0.2, true)], resets: '1 October', now: tenth });
  assert.equal(calm?.sentence, 'All healthy: nothing runs out before 1 October.');
});

test('a door is on while an address is in use, off with none, and the line counts only the doors an address opens', () => {
  const on = { mintable: true, held: true };
  const off = { mintable: true, held: false };
  const other = { mintable: false, held: false };
  assert.deepEqual([on, off, other].map(doorState), ['on', 'off', 'other']);
  assert.equal(doorsLine([on, on]), 'All 2 doors have an address in use, so each takes things in.');
  assert.equal(doorsLine([on, off, other]), '1 of 2 doors has no address yet, so nothing arrives through it.');
  assert.equal(doorsLine([off]), 'The door has no address yet, so nothing arrives through it.');
  assert.equal(doorsLine([other]), doorWords.noneMade);
});

test('no sentence the tiles add leaves the house voice', () => {
  const said = [
    tileWords.everyNight(30),
    tileWords.sinceFirst(6, '24 Sep'),
    tileWords.missed(2, 30, '24 Sep'),
    tileWords.monthMeta(29, 30, '1 October'),
    tileWords.copiesMeta(30),
    doorWords.allOn(3),
    doorWords.someOff(2, 3),
    doorWords.noneMade,
  ];
  for (const s of said) assert.doesNotMatch(s, /—|!|sorry|simply|just |\b(register|block|pack|schema|slug|declaration|refusal)\b/iu, s);
});
