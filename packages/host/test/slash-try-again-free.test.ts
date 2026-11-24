/**
 * Try again on a draft spends none of his asks (`slashRecordMeter().hold(kind, { again })`).
 *
 * THE SLASH AUDIT OF 24 NOVEMBER, finding 9: on the page sheet, Try again asked the same description another way and was
 * counted as a new ask against his month. Its row is still held, priced and settled, so the operator's ceiling sees its
 * neurons, but it spends `none`, which the engine's count of his asks (`spends = 'person'`) passes over.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slashRecordMeter } from '../src/slash-ask.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const CALL = `CREATE TABLE slash_call (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
  status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT,
  purpose TEXT NOT NULL DEFAULT 'ask', spends TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none')))`;

test('A TRY AGAIN IS HELD AND SETTLED, PRICED, AND SPENDS NONE OF HIS ASKS; the first ask spends one', async () => {
  const sql = openSqlite();
  sql.exec(CALL);
  const engine = { status: () => ({ tier: 'a', model: '', asks: { used: 0, cap: 20, resets: '2026-12-01T00:00:00.000Z', capped: true } }) };
  const meter = slashRecordMeter({ sql, clock: fixedClock(Date.UTC(2026, 10, 24, 9)), engine: async () => engine, model: 'gpt-oss-120b', rate: { in: 31_818, out: 68_182 } } as never);
  const first = await meter.hold('draft');
  assert.ok(first.ok);
  first.value.settle({ usage: { in: 4000, out: 300 } });
  const again = await meter.hold('draft', { again: true });
  assert.ok(again.ok);
  assert.equal(sql.one<{ spends: string }>("SELECT spends FROM slash_call WHERE code = 'SLASH_PENDING'")?.spends, 'none', 'held as spending nothing');
  again.value.settle({ usage: { in: 4000, out: 300 } });
  const rows = sql.all<{ spends: string; neurons: number; status: string }>('SELECT spends, neurons, status FROM slash_call ORDER BY rowid');
  assert.deepEqual(rows.map((r) => r.spends), ['person', 'none']);
  assert.ok(rows.every((r) => r.neurons > 0 && r.status === 'ok'), JSON.stringify(rows));
  sql.close();
});
