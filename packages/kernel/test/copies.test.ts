/**
 * `copies.ts`: the record's copies as three facts, read from the `export` events, and the two writes a night
 * makes. Over a real record, so the events are the ones `lifecycle` and `export` write and the file is the one
 * `exportBrainl` writes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NIGHT_FAULT, copyFacts, copyFailed, copyKept, failedNote, keptNote } from '../src/copies.ts';
import { openFaults } from '../src/fault.ts';
import { openRecord, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 3, 20);
const DAY = 86_400_000;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  return { k, sql, clock };
}

const life = (k: Kernel) => (kind: 'export', actor: string, note: string) => k.lifecycle(kind, actor, note);
const exportNotes = (sql: NodeSql): string[] =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'export' ORDER BY ts, id").map((r) => r.note);

test('A RECORD MADE TODAY HAS NO COPY AND NO EXPORT YET, and that is three nulls, never a fault', async () => {
  const { sql } = await record();
  assert.deepEqual(copyFacts(sql), { last_copy_at: null, last_copy_bytes: null, last_export_at: null });
  assert.equal(openFaults(sql).length, 0);
});

test('A COPY KEPT IS THE LAST COPY, WITH ITS SIZE, and the newest one wins', async () => {
  const { k, sql, clock } = await record();
  copyKept(sql, life(k), '2026-10-08T03-20-00Z-nightly', 2_100_000, clock.now());
  clock.advance(DAY);
  copyKept(sql, life(k), '2026-10-09T03-20-00Z-nightly', 2_200_000, clock.now());
  assert.deepEqual(copyFacts(sql), { last_copy_at: new Date(NOW + DAY).toISOString(), last_copy_bytes: 2_200_000, last_export_at: null });
  assert.equal(exportNotes(sql).at(-1), keptNote('2026-10-09T03-20-00Z-nightly', 2_200_000));
});

test('"SNAPSHOT NOW" AND THE SELF-HOST WRITE THE SAME NOTE, so their copies count as copies', async () => {
  const { k, sql } = await record();
  k.lifecycle('export', 'system', 'snapshot 2026-10-09T03-20-00Z-nightly 4096 bytes');
  assert.equal(copyFacts(sql).last_copy_bytes, 4096);
});

test('A FAILED NIGHT IS NEVER A COPY: one failed note, one fault, and the last copy stays the last good one', async () => {
  const { k, sql, clock } = await record();
  copyKept(sql, life(k), 'a', 10, clock.now());
  const kept = clock.now();
  clock.advance(DAY);
  copyFailed(sql, life(k), 'the bucket said no', clock.now());

  assert.equal(copyFacts(sql).last_copy_at, new Date(kept).toISOString());
  assert.equal(copyFacts(sql).last_copy_bytes, 10);
  assert.equal(exportNotes(sql).at(-1), 'failed: the copy could not be saved');
  const faults = openFaults(sql);
  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.cause, NIGHT_FAULT);
  assert.equal(faults[0]!.family, 'export');
});

test('THE SAME REASON THE NEXT NIGHT ADDS NO SECOND FAULT, and a copy kept clears it', async () => {
  const { k, sql, clock } = await record();
  copyFailed(sql, life(k), 'the bucket said no', clock.now());
  clock.advance(DAY);
  copyFailed(sql, life(k), 'the bucket said no', clock.now());
  const faults = openFaults(sql);
  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.count, 2);
  assert.equal(exportNotes(sql).filter((n) => n.startsWith('failed:')).length, 2);

  clock.advance(DAY);
  copyKept(sql, life(k), 'b', 20, clock.now());
  assert.equal(openFaults(sql).length, 0);
});

test('LAST EXPORTED IS AN EXPORT SOMEBODY ASKED FOR, never the night\'s own dump', async () => {
  const { k, sql, clock } = await record();
  assert.ok((await k.export({ redactGrants: false, actor: 'system' })).ok);
  assert.equal(copyFacts(sql).last_export_at, null);

  clock.advance(DAY);
  assert.ok((await k.export({ redactGrants: true, actor: 'person#1' })).ok);
  assert.equal(copyFacts(sql).last_export_at, new Date(NOW + DAY).toISOString());
});

test('THE FACTS ARE LOCAL: a copy or a failure written after the dump never travels in the next file', async () => {
  const { k, sql, clock } = await record();
  const first = await k.export({ redactGrants: false, actor: 'system' });
  copyKept(sql, life(k), 'a', 10, clock.now());
  copyFailed(sql, life(k), 'the bucket said no', clock.now());
  copyFailed(sql, life(k), 'the bucket said no', clock.now());
  copyKept(sql, life(k), 'b', 20, clock.now());
  const second = await k.export({ redactGrants: false, actor: 'system' });
  assert.ok(first.ok && second.ok);
  const events = (lines: readonly string[]) => lines.filter((l) => l.includes('snapshot a') || l.includes('failed:'));
  assert.deepEqual(events(second.value), []);
  assert.deepEqual(events(first.value), []);
  /* AN IDLE RECORD'S TWO FILES ARE THE SAME BYTES, with a night's notes and its fault raised and cleared between them. */
  assert.equal(second.value.join('\n'), first.value.join('\n'));
});

test('A FAILED NOTE IS ALWAYS THE SAME WORDS, whatever the night threw', () => {
  assert.equal(failedNote(), 'failed: the copy could not be saved');
  assert.equal(keptNote('x', 12.7), 'snapshot x 12 bytes');
});

test('AN ERROR NAMING A BUCKET AND A KEY NEVER REACHES A NOTE: the reason goes to the fault alone', async () => {
  // A note is history anyone reading the record sees, and the raw error named the bucket.
  const { k, sql, clock } = await record();
  const why = 'R2 bucket braindog-copies-prod refused PUT rec_01J9ZQ/snapshots/2026-10-09 (403)';
  copyFailed(sql, life(k), why, clock.now());

  const notes = sql.all<{ note: string | null }>('SELECT note FROM event').map((r) => r.note ?? '');
  for (const word of ['bucket', 'braindog-copies-prod', 'rec_01J9ZQ', 'snapshots/', '403']) {
    assert.ok(!notes.some((n) => n.includes(word)), `a note carries "${word}"`);
  }
  assert.equal(exportNotes(sql).at(-1), 'failed: the copy could not be saved');
  const fault = sql.one<{ error: string }>('SELECT error FROM fault WHERE cause = ?', NIGHT_FAULT);
  assert.equal(fault?.error, why, 'the reason is kept where only the fault reads it');

  // A reason a page long still reaches the operator, capped, and the note stays the same words.
  const long = `${why} ${'stack '.repeat(1000)}`;
  copyFailed(sql, life(k), long, clock.now());
  const again = sql.one<{ error: string; count: number }>('SELECT error, count FROM fault WHERE cause = ?', NIGHT_FAULT);
  assert.equal(again?.error, long.slice(0, 500));
  assert.equal(Number(again?.count), 2);
  assert.equal(exportNotes(sql).at(-1), 'failed: the copy could not be saved');
});
