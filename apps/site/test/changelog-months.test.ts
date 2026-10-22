/**
 * A month on the changelog and the days under it say one count (site F17).
 *
 *   node --test apps/site/test/changelog-months.test.ts
 *
 * THE FAULT IT HOLDS SHUT. The page drew the newest day on its own as "Latest" and left it out of its month, so
 * "October 2026 · 1 entry" sat beside "Latest · 20 October 2026 · 16 entries". Now every day is in its month, the
 * newest first, and a month's count is the entries of its days.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DAYS, ITEMS, LATEST, MONTHS, tally } from '../src/routes/changelog/log.ts';

test('every day is under its month, the newest one first', () => {
  const days = MONTHS.flatMap((m) => m.days);
  assert.deepEqual(
    days.map((d) => d.date),
    DAYS.map((d) => d.date),
  );
  assert.equal(MONTHS[0]?.days[0], LATEST, 'the newest day opens its month');
  for (const m of MONTHS) assert.ok(m.days.every((d) => d.date.startsWith(m.key)), `${m.key} holds a day of another month`);
});

test("a month's count and tally are its days' entries, and they add up to the whole log", () => {
  for (const m of MONTHS) {
    const entries = m.days.flatMap((d) => d.entries);
    assert.equal(m.total, entries.length, `${m.key} counts ${m.total} but its days hold ${entries.length}`);
    assert.deepEqual(m.tally, tally(entries));
  }
  assert.equal(
    MONTHS.reduce((n, m) => n + m.total, 0),
    ITEMS.length,
  );
});
