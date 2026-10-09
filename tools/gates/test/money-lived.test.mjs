/**
 * Money, lived, run (F62 and REC-B01 build 5): every step of `packages/seed/lived/money.lived.ts` on a fresh record,
 * through the record's own verbs as `openLived` in `tools/gates/lived.mjs` opens them, and every read after each step
 * must hold.
 *
 *   node --test tools/gates/test/money-lived.test.mjs
 *
 * WHY A RUNNER. The steps were written and nothing ran them, so a step that stopped reading what it said failed nothing.
 * Here each read is one line of the test's diagnostics, quoted as `quote` says it, and the test fails on the first that
 * does not hold, naming it.
 *
 * TWO RECORDS. The first is the person in London the steps were written for. The second is in Cairo, whose rest days are
 * Friday and Saturday, and walks the paydays (REC-B13): a line on "15, last", one on the 30th, and one on the 30th moved
 * to the working day before. Each is its own file in memory, its own clock pinned to the seed's today.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { createRecordApi } from '../../../packages/record/src/index.ts';
import { NOW } from '../../../packages/seed/src/index.ts';
import { CAIRO, LONDON, MONEY_LIVED, MONEY_LIVED_CAIRO, OWNER, liveMoney, quote } from '../../../packages/seed/lived/money.lived.ts';

/** The `Sql` port over one SQLite database in memory, the adapter `lived.mjs` keeps over a file, with its one-level transaction. */
function memorySql() {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    close: () => db.close(),
    exec(text, ...params) {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...params);
    },
    all: (text, ...params) => db.prepare(text).all(...params),
    one: (text, ...params) => db.prepare(text).get(...params),
    transactionSync(fn) {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/**
 * A fresh record to live in, opened as `openLived` opens one: the record's verbs, at the seed's today.
 *
 * TODAY IS THE RECORD'S OWN DAY, in its zone, as the walk counts it (`clockOf`), never the UTC date of the clock: at
 * 22:30 UTC on 15 October it is the 16th in Cairo, the walk has passed the salary on the 15th, and a today said in UTC
 * would let the Cairo steps run on a day they cannot hold.
 */
async function freshRecord(place = LONDON) {
  const sql = memorySql();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: place.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(NOW);
  return { lived: { api, as: OWNER, today, place }, close: () => sql.close() };
}

/** Every step, every read quoted as a diagnostic, and the ones that do not hold named in the failure. */
async function runs(t, steps, place) {
  const { lived, close } = await freshRecord(place);
  try {
    const heard = await liveMoney(lived, steps);
    for (const h of heard) t.diagnostic(quote(h));
    assert.ok(heard.length > 0, 'nothing was read');
    const fails = heard.filter((h) => !h.holds).map(quote);
    assert.deepEqual(fails, [], `${fails.length} of ${heard.length} reads do not hold`);
  } finally {
    close();
  }
}

test('a person in London signs up, keeps pounds and dollars, and files a month of Egyptian pounds: every figure reads as it must', async (t) => {
  await runs(t, MONEY_LIVED);
});

test('a person in Cairo, resting on Friday and Saturday, walks paydays on the 15th, the last day and the 30th', async (t) => {
  await runs(t, MONEY_LIVED_CAIRO, CAIRO);
});
