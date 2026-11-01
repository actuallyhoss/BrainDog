/**
 * AN ASK TURNED AWAY BECAUSE THE MONTH'S ASKS ARE SPENT LEAVES ONE ROW (model-sign-49), written the one way on the host
 * and in Slash, and the vital sign reads it: the guard's own refusal, not a row put in by hand, turns `model-answers` red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { TURNED_AWAY_SQL as SLASH_SQL } from '../../slash/src/call.ts';
import { openStore } from '../../slash/src/call.ts';
import { readModelSign } from '../src/sign-model.ts';
import { slashGuardedEngine } from '../src/slash.ts';
import { TURNED_AWAY_SQL } from '../src/slash-turned-away.ts';

const NOW = Date.UTC(2026, 8, 14, 12);
const HOUR = 3_600_000;

test('ONE ROW, ONE SHAPE: the host writes the turned-away row as Slash writes it, character for character', () => {
  assert.equal(TURNED_AWAY_SQL, SLASH_SQL);
});

test("THE BYO GUARD'S OWN REFUSAL LEAVES THE ROW, and five answers then the spent month read red, never \"answered all\"", async () => {
  const sql = openSqlite();
  openStore(sql);
  const k = await openRecord(sql, fixedClock(NOW));
  sql.exec('INSERT INTO slash_settings (singleton, tier, model, grant_id, ask_cap, updated_at) VALUES (1, ?, ?, NULL, ?, ?)', 'byo', 'his-model', 5, new Date(NOW).toISOString());
  for (let i = 0; i < 5; i++)
    sql.exec(
      "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code) VALUES (?, ?, 'read', 'byo', 'his-model', 1, 1, 0, 1, 'ok', NULL)",
      `c${i}`,
      new Date(NOW - (10 + i) * HOUR).toISOString(),
    );
  const engine = { read: async () => ({ ok: true, value: null }), propose: async () => ({ ok: true, value: null }), configure: () => ({ ok: true, value: null }), status: () => ({}) };
  const guarded = slashGuardedEngine(engine as never, { sql, clock: fixedClock(NOW), grants: () => [] }) as unknown as { read: (q: string, ctx: unknown) => Promise<unknown> };
  for (let i = 0; i < 3; i++) {
    const out = (await guarded.read('what is due', { principal: { kind: 'person', id: 'p_1', level: 'owner' } } as never)) as { ok: boolean; refusal?: { code: string } };
    assert.equal(out.refusal?.code, 'SLASH_BUDGET_SPENT');
  }
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM slash_call WHERE model = '-' AND status = 'refused' AND code = 'SLASH_BUDGET_SPENT'")?.n, 3);
  const read = readModelSign(k, sql, NOW);
  assert.equal(read.state, 'red', read.said);
  assert.doesNotMatch(read.said, /answered all/u);
  assert.match(read.said, /month's Slash questions are used: 3 questions/u);
});
