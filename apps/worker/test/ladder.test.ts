/**
 * The billing lapse ladder under a fake clock, on a real Directory: `53 §5.10`'s verify line, "the four messages fire
 * once each at days 0, 60, 83 and 90", and the two ways it must never delete.
 *
 * THE DIRECTORY IS THE REAL ONE, because the ladder's safety rests on what `due`, `told` and `lapsed` answer: a fake of
 * them would test the ladder against what this file believes the Directory does. The mail and the deletion are
 * collected, since both are the Worker's platform and neither is what can be wrong here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDirectory } from '@braindog/record/directory';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { ladder } from '../src/ladder.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 3, 17);

/** A Directory holding one record `ada` pays for, lapsed at T0 unless `lapse` is false. */
function lapsedRecord(lapse = true) {
  const clock = fixedClock(T0);
  const d = createDirectory(openSqlite(), clock);
  const person = d.person$('ada@example.com');
  assert.ok(person.ok);
  const made = d.provision({ slug: 'ada-notes', email: 'ada@example.com' });
  const record = made.ok ? made.value.record : assert.fail(JSON.stringify(made));
  if (lapse) assert.ok(d.billing({ op: 'set', row: { record, person: person.value.id, customer: 'cus_1', state: 'lapsed' } }).ok);
  return { clock, d, record, person: person.value.id };
}

/** One night of the ladder at `night` days after T0, collecting every letter and every deletion. */
function nightOf(d: ReturnType<typeof lapsedRecord>['d'], sent: { day: number; kind: string }[], deleted: string[], fails?: (day: number) => boolean) {
  return (night: number) =>
    ladder({
      due: (now) => Promise.resolve(d.billing({ op: 'due', now })),
      owners: () => Promise.resolve(['owner@example.com']),
      mail: (kind) => {
        if (fails?.(night)) return Promise.resolve(false);
        sent.push({ day: night, kind });
        return Promise.resolve(true);
      },
      told: (record, day) => Promise.resolve(d.billing({ op: 'told', record, day }).ok),
      lapsed: (record) => Promise.resolve(d.billing({ op: 'lapsed', record })),
      destroy: (record) => {
        deleted.push(record);
        assert.ok(d.close(record).ok);
        return Promise.resolve();
      },
      now: T0 + night * DAY,
    });
}

test('THE FOUR NOTICES FIRE ONCE EACH, ON DAYS 0, 60, 83 AND 90, AND THE RECORD GOES ONCE', async () => {
  const { d, record } = lapsedRecord();
  const sent: { day: number; kind: string }[] = [];
  const deleted: string[] = [];
  const night = nightOf(d, sent, deleted);
  for (let n = 0; n <= 120; n++) await night(n);

  /* TWO ADDRESSES A NOTICE, the payer and the owner, so each kind appears twice on its one day. */
  const days = (kind: string) => [...new Set(sent.filter((s) => s.kind === kind).map((s) => s.day))];
  assert.deepEqual(days('lapse.0'), [0]);
  assert.deepEqual(days('lapse.60'), [60]);
  assert.deepEqual(days('lapse.83'), [83]);
  assert.deepEqual(days('lapse.90'), [90]);
  assert.equal(sent.length, 8, 'a notice went more than once to somebody');
  assert.deepEqual(deleted, [record], 'the record was deleted other than once, on day 90');
});

test('A RECORD PAID AGAIN ON DAY 70 IS NEVER DELETED', async () => {
  const { d, clock, record } = lapsedRecord();
  const sent: { day: number; kind: string }[] = [];
  const deleted: string[] = [];
  const night = nightOf(d, sent, deleted);
  for (let n = 0; n <= 150; n++) {
    if (n === 70) {
      clock.advance(70 * DAY);
      assert.ok(d.billing({ op: 'set', row: { record, state: 'active' } }).ok);
    }
    await night(n);
  }
  assert.deepEqual(deleted, [], 'a record paid for again was deleted');
  assert.deepEqual([...new Set(sent.map((s) => s.kind))], ['lapse.0', 'lapse.60'], 'a notice went after the payment');
});

test('A RECORD WITH NO BILLING ROW IS NEVER TOUCHED', async () => {
  const { d } = lapsedRecord(false);
  const sent: { day: number; kind: string }[] = [];
  const deleted: string[] = [];
  const night = nightOf(d, sent, deleted);
  for (let n = 0; n <= 120; n++) await night(n);
  assert.deepEqual(sent, []);
  assert.deepEqual(deleted, []);
});

test('A NOTICE NOBODY TOOK GOES AGAIN THE NEXT NIGHT, AND HOLDS THE DELETION BACK UNTIL IT DOES', async () => {
  // Day 83's letter bounces until day 95. The deletion waits for it, because "a notice that never went is never
  // deleted": the record goes the night after the last notice finally went, and never before.
  const { d, record } = lapsedRecord();
  const sent: { day: number; kind: string }[] = [];
  const deleted: string[] = [];
  const night = nightOf(d, sent, deleted, (n) => n >= 83 && n < 95);
  for (let n = 0; n <= 120; n++) await night(n);
  assert.deepEqual([...new Set(sent.filter((s) => s.kind === 'lapse.83').map((s) => s.day))], [95]);
  assert.deepEqual(deleted, [record]);
  assert.deepEqual([...new Set(sent.filter((s) => s.kind === 'lapse.90').map((s) => s.day))], [96]);
});
