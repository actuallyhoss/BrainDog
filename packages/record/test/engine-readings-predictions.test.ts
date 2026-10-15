/**
 * The predictions graded, beside the brake, in `engineReadings` (ENG-B17 job 2), so the Slash page can say "Of 4
 * suggestions graded, 3 did what they said."
 *
 * Read from the kernel's own `prediction` table on a fresh record, with rows planted as `scorePrediction` settles them:
 * three met, one missed, one scored with no reading (no verdict, so neither), one not yet due. A store that answered
 * nothing, or a record where no prediction was ever written, says nothing, never a pair of zeros. And the brake beside
 * it counts an offer he let lapse as a no.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, predictionsOf, type EngineReadingsAnswer } from '../src/methods/engine-readings.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;
const at = (ms: number): string => new Date(ms).toISOString();
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

/** A fresh record whose host hands an empty ledger, and its readings through the method file over the record's own store. */
const record = async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock } as never);
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-mill', name: 'The Mill', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  const m = methods({
    scoped: () => null,
    clock,
    sql,
    kernel: api.kernel,
    engineLedger: async () => ({ calls: [], mentions: [], questions: [] }),
  } as unknown as RecordDeps);
  const read = async (): Promise<EngineReadingsAnswer> => {
    const out = value<EngineReadingsAnswer | null>(await m.engineReadings(undefined, owner));
    assert.ok(out !== null);
    return out;
  };
  return { sql, read };
};

let n = 0;
/** A prediction as `writePrediction` files it and `scorePrediction` settles it: `met` 1, 0 or null, `scored` or not. */
function planted(sql: ReturnType<typeof openSqlite>, scored: boolean, met: 0 | 1 | null): void {
  sql.exec(
    `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, scored_at, observed, met, on_miss)
     VALUES (?, ?, 'More is added to Walks.', ?, 12, 'count', '>=13', '30d', ?, ?, ?, ?, 'none')`,
    `pr_${++n}`, `SG${n}`, JSON.stringify({ source: 'events.walks', value: { count: 'made' } }), at(NOW - DAY), scored ? at(NOW - DAY) : null, met === null ? null : 13 + met, met,
  );
}

test('A RECORD NO OFFER HAS CARRIED A PREDICTION ON SAYS NOTHING; ONE NOT YET DUE SAYS 0 OF 0', async () => {
  const { sql, read } = await record();
  const out = await read();
  assert.equal(out.predictions, undefined);
  assert.deepEqual(out.braked, { on: false, share: 0, of: 0 });
  planted(sql, false, null);
  assert.deepEqual((await read()).predictions, { scored: 0, met: 0 });
});

test('ON A PLANTED TABLE: four graded, three met; one with no reading and one not due are neither', async () => {
  const { sql, read } = await record();
  planted(sql, true, 1);
  planted(sql, true, 1);
  planted(sql, true, 0);
  planted(sql, true, 1);
  planted(sql, true, null);
  planted(sql, false, null);
  assert.deepEqual((await read()).predictions, { scored: 4, met: 3 });
  assert.deepEqual(predictionsOf(sql), { scored: 4, met: 3 });
});

test('A STORE THAT ANSWERED NOTHING SAYS NOTHING, never a count of zero it could not know', () => {
  assert.equal(predictionsOf({ all: () => [] } as never), null);
});

test('THE BRAKE BESIDE IT COUNTS AN OFFER HE LET LAPSE AS A NO', async () => {
  const { sql, read } = await record();
  /* nineteen answers, all taken up, then one open offer whose day is behind today. */
  for (let i = 0; i < 19; i++) {
    const id = `SGa${i}`;
    sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as) VALUES (?, 'arrange', '{}', 'resolved', 'slash', ?, 'addressed')", id, at(NOW - 20 * DAY));
    sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, 'p_owner', 'resolve', ?, 'suggestion', 'addressed')", `E${i}`, at(NOW - 19 * DAY + i * 60_000), `suggestion:${id}`);
  }
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SGlapsed', 'arrange', ?, 'open', 'slash', ?)",
    JSON.stringify({ lapses: new Date(NOW - 3 * DAY).toISOString().slice(0, 10) }), at(NOW - 17 * DAY),
  );
  assert.deepEqual((await read()).braked, { on: false, share: 0.95, of: 20, lapsed: 1 });
});
