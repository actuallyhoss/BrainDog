/**
 * Whose allowance a ledger row spent is what the row says, and nothing the host works out (ENG-A05).
 *
 * THE COUNT USED TO BE READ OUT OF A ROW'S KIND, ITS `filed` AND THE WORDS OF ITS QUESTION. A headline was "a `pattern`
 * row whose question is the headline's", and a background ask was "a `pattern`, `prose` or `embed` row that filed
 * nothing", so his own press that filed nothing was counted as background and never as his. Each test below writes rows
 * whose kind, `filed` and question point one way and whose `spends` and `purpose` point the other, and holds the meters
 * to the second. A meter that goes back to reading a question string fails here.
 *
 * THE LEDGER IS BUILT HERE AND NOT BY `createSlash`, so the file says which columns the host itself needs: Slash's
 * `slash_call` at store version 3, the two columns among them (`packages/slash/src/call.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slashRecordMeter } from '../src/slash-ask.ts';
import { backgroundMeter, backgroundSpent, BACKGROUND_JOBS_MONTH, HEADLINE_ASK, UNDERSTAND_ASK } from '../src/model-jobs.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 2, 3, 17);
const MONTH = new Date(Date.UTC(2026, 9, 1)).toISOString();
const AT = new Date(T0).toISOString();

const CALL = (extra: string) => `CREATE TABLE slash_call (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
  status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT${extra})`;
const V3 = CALL(", purpose TEXT NOT NULL DEFAULT 'ask', spends TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none'))");

type Row = { kind: string; purpose: string; spends: string; question?: string; filed?: string; model?: string };

/** A version 3 ledger, the record's meter over it, and an engine whose count is the package's: rows that spent `person`. */
function ledger(cap = 20) {
  const sql = openSqlite();
  sql.exec(V3);
  const clock = fixedClock(T0);
  const person = () => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM slash_call WHERE spends = 'person' AND ts >= ?", MONTH)?.n ?? 0;
  const engine = { status: () => ({ tier: 'a', model: '', asks: { used: person(), cap, resets: '2026-11-01T00:00:00.000Z', capped: true } }) };
  const meter = slashRecordMeter({ sql, clock, engine: async () => engine, model: 'glm-5.3-flash' });
  let n = 0;
  /** A row as the package settles one, every column that could be mistaken for the count set by the caller. */
  const wrote = (row: Row) =>
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, question, filed, purpose, spends)
       VALUES (?, ?, ?, 'a', ?, 10, 5, 1, 3, 'ok', ?, ?, ?, ?)`,
      `row-${++n}`,
      AT,
      row.kind,
      row.model ?? 'glm-5.3-flash',
      row.question ?? null,
      row.filed ?? null,
      row.purpose,
      row.spends,
    );
  const counts = () => ({
    his: person(),
    work: backgroundMeter(sql).spent(MONTH),
    headlines: backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline').spent(MONTH),
    understand: backgroundMeter(sql).understand?.spent(MONTH),
  });
  return { sql, meter, wrote, counts };
}

test('A HEADLINE, AN UNDERSTANDING AND A PATTERN THAT FILED NOTHING EACH SPEND BACKGROUND, and his press that filed spends his own', async () => {
  const { sql, meter, wrote, counts } = ledger();
  for (const ask of ['headline', 'understand'] as const) {
    const held = await meter.background(ask);
    assert.ok(held.ok, `${ask} was refused`);
    held.value.settle({ usage: { in: 300, out: 40 } });
  }
  /* The record's own draft from the model-jobs pass: a pattern the kernel files in the ack, so the row files nothing. */
  wrote({ kind: 'pattern', purpose: 'look', spends: 'background' });
  assert.deepEqual(counts(), { his: 0, work: 2, headlines: 1, understand: 1 });

  /* His press, filed on Decide. */
  wrote({ kind: 'pattern', purpose: 'ask', spends: 'person', filed: 'filed on Decide' });
  assert.deepEqual(counts(), { his: 1, work: 2, headlines: 1, understand: 1 });
  assert.deepEqual(backgroundSpent(sql, MONTH), { all: 3, headlines: 1, understand: 1 });
  sql.close();
});

test('HIS PRESS THAT FILED NOTHING IS HIS ASK, never a background one, which is the count that was wrong', () => {
  const { sql, wrote, counts } = ledger();
  wrote({ kind: 'pattern', purpose: 'ask', spends: 'person' });
  assert.deepEqual(counts(), { his: 1, work: 0, headlines: 0, understand: 0 });
  sql.close();
});

test('THE WORDS OF A QUESTION DECIDE NOTHING: a row is a headline or an understanding by its purpose alone', () => {
  const { sql, wrote, counts } = ledger();
  /* The headline's and the understanding's own questions, on rows that were neither. */
  wrote({ kind: 'pattern', purpose: 'look', spends: 'background', question: HEADLINE_ASK });
  wrote({ kind: 'pattern', purpose: 'look', spends: 'background', question: UNDERSTAND_ASK });
  assert.deepEqual(counts(), { his: 0, work: 2, headlines: 0, understand: 0 });
  /* And a headline and an understanding under some other words. */
  wrote({ kind: 'pattern', purpose: 'headline', spends: 'background', question: 'What changed on each page last night' });
  wrote({ kind: 'pattern', purpose: 'understand', spends: 'background', question: 'Are these two the same person' });
  assert.deepEqual(counts(), { his: 0, work: 3, headlines: 1, understand: 1 });
  /* His own ask, worded as a headline, is still his. */
  wrote({ kind: 'read', purpose: 'ask', spends: 'person', question: HEADLINE_ASK });
  assert.deepEqual(counts(), { his: 1, work: 3, headlines: 1, understand: 1 });
  sql.close();
});

test('NOR DOES THE KIND, NOR WHAT WAS FILED: a row counts where it says it spent, and a failed attempt counts nowhere', () => {
  const { sql, wrote, counts } = ledger();
  wrote({ kind: 'read', purpose: 'look', spends: 'background' });
  wrote({ kind: 'prose', purpose: 'look', spends: 'background', filed: 'kept with the digest' });
  wrote({ kind: 'embed', purpose: 'look', spends: 'background' });
  assert.equal(counts().work, 3);
  /* A failed attempt and a model never reached keep their rows and spend nobody's month. */
  wrote({ kind: 'pattern', purpose: 'look', spends: 'none' });
  wrote({ kind: 'prose', purpose: 'look', spends: 'none', model: '-' });
  wrote({ kind: 'pattern', purpose: 'headline', spends: 'none', question: HEADLINE_ASK });
  assert.deepEqual(counts(), { his: 0, work: 3, headlines: 0, understand: 0 });
  sql.close();
});

test('EVERY ROW THE RECORD HOLDS SAYS WHAT IT WAS FOR AND WHOSE MONTH IT SPENT, and a background ask leaves his count where it was', async () => {
  const { sql, meter, counts } = ledger();
  for (const kind of ['draft', 'form'] as const) {
    const held = await meter.hold(kind);
    assert.ok(held.ok);
    held.value.settle({ usage: { in: 120, out: 30 } });
  }
  assert.equal(counts().his, 2);
  for (const ask of ['skill', 'look', 'headline', 'understand'] as const) {
    const held = await meter.background(ask);
    assert.ok(held.ok);
    held.value.settle({ usage: { in: 120, out: 30 } });
  }
  assert.deepEqual(counts(), { his: 2, work: 3, headlines: 1, understand: 1 });
  assert.deepEqual(
    sql.all<{ purpose: string; spends: string }>('SELECT purpose, spends FROM slash_call ORDER BY rowid').map((r) => `${r.purpose} ${r.spends}`),
    /* A SKILL DRAFT SAYS `skill`, its own purpose with its own floor (`budget-floors-alone.test.ts`), and no longer `look`. */
    ['ask person', 'plan person', 'skill background', 'look background', 'headline background', 'understand background'],
  );
  /* A HOLD IN FLIGHT IS COUNTED WHERE IT WILL SETTLE, and one let go is counted nowhere. */
  const flying = await meter.background('headline');
  assert.ok(flying.ok);
  assert.equal(counts().headlines, 2);
  flying.value.release();
  assert.equal(counts().headlines, 1);
  sql.close();
});

test('AN ASK NO MODEL ANSWERED MOVES NEITHER COUNT AND KEEPS ITS ROW, and an unreadable answer counts once', async () => {
  const { sql, meter, counts } = ledger();
  const press = await meter.hold('draft');
  const headline = await meter.background('headline');
  assert.ok(press.ok && headline.ok);
  assert.deepEqual(counts(), { his: 1, work: 0, headlines: 1, understand: 0 });
  press.value.settle({ usage: { in: 120, out: 0 }, code: 'UNREACHABLE' });
  headline.value.settle({ usage: { in: 300, out: 0 }, code: 'UNREACHABLE' });
  assert.deepEqual(counts(), { his: 0, work: 0, headlines: 0, understand: 0 });
  assert.deepEqual(
    sql.all<{ code: string; spends: string; tokens_in: number }>('SELECT code, spends, tokens_in FROM slash_call ORDER BY rowid').map((r) => `${r.code} ${r.spends} ${r.tokens_in}`),
    ['UNREACHABLE none 120', 'UNREACHABLE none 300'],
  );

  const garbled = await meter.hold('form');
  const look = await meter.background('look');
  assert.ok(garbled.ok && look.ok);
  garbled.value.settle({ usage: { in: 120, out: 30 }, code: 'PROPOSAL_SCHEMA' });
  look.value.settle({ usage: { in: 120, out: 30 }, code: 'PROPOSAL_SCHEMA' });
  assert.deepEqual(counts(), { his: 1, work: 1, headlines: 0, understand: 0 });
  sql.close();
});

test('A LEDGER AN OLDER BUILD WROTE READS AS SPENT until the engine steps it, and no ledger at all is nothing spent', () => {
  const none = openSqlite();
  assert.deepEqual(backgroundSpent(none, MONTH), { all: 0, headlines: 0, understand: 0 });
  assert.equal(backgroundMeter(none).spent(MONTH), 0);
  none.close();

  const old = openSqlite();
  old.exec(CALL(''));
  old.exec(
    "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, question) VALUES ('a', ?, 'pattern', 'a', 'm', 1, 1, 1, 1, 'ok', ?)",
    AT,
    HEADLINE_ASK,
  );
  assert.equal(backgroundSpent(old, MONTH), null);
  const work = backgroundMeter(old);
  assert.equal(work.spent(MONTH), work.cap);
  old.close();
});
