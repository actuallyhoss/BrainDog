/**
 * What money-core's `Spent, 30 days` counts, on the sample record.
 *
 * THIS FILE USED TO HOLD HSBC EGYPT'S THREE WORDINGS, read by the patterns the sample record carried for them. Those
 * tests moved to `packs/bank-hsbc-eg/bank-hsbc-eg.test.ts` with the pack file (`loop/research-legacy-parity.md`
 * brief B1), where they stand on the record a person has once the pack is installed rather than on the sample. The one
 * test left is about money-core's own figure, which arrived in the same commit (`aeef01c5`) and reads no bank.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { METRICS, NOW, day, installSeed } from '../src/index.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
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

/* ── what `Spent, 30 days` counts ───────────────────────────────────────── */

test('SPENT, 30 DAYS COUNTS THIRTY DAYS, today and the twenty-nine before it', async () => {
  /**
   * `window: 30d` IS HOW FAR THE COMPARISON MOVES THE CLOCK (`metrics.ts`, `anchor - shift`), and the
   * window before is cut where the current one starts (`endedAt`). So the declared window is thirty
   * days whatever the sentence says, and the sentence has to say thirty too or the two figures
   * compared are different lengths: `on after -31d` is exclusive of its own day, so it began at day
   * -30 and ran to today, thirty-one days, beside a window before of thirty.
   */
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  const read = (): number => {
    const got = k.metric(METRICS['spent-30d'] as never);
    assert.ok(got.ok, sayOf(got));
    return got.value.value as number;
  };
  const start = read();
  const spend = (offset: number, amount: number) => {
    const got = k.create(
      'transactions',
      { what: `BOUNDARY ${offset}`, on: day(offset), direction: 'out', amount: { amount, currency: 'GBP' }, account: k.get('accounts#1')!.id, state: 'cleared', transfer: false },
      { actor: 'p_seed' },
    );
    assert.ok(got.ok, sayOf(got));
  };
  spend(-29, 1_000);
  assert.equal(read() - start, 1_000, 'day -29 is the thirtieth day counting today, and it was not counted');
  spend(-30, 70_000);
  assert.equal(read() - start, 1_000, 'day -30 was counted, which is a thirty-first day under a thirty-day name');
});
