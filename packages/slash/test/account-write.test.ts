/**
 * What `account` writes, and what it leaves alone.
 *
 * WHY THIS FILE EXISTS. Wave thirty's backlog read `account` as `INSERT OR REPLACE` for every caller and asked whether a read
 * or a proposal could overwrite the owner's settings (tier, cap, model) or reset the month's counter. Measured, it cannot:
 * `account` names one table, `slash_call`, and settles by `slash_call.id` alone, and since `defects.md` S14 only an id the
 * ledger itself minted settles over a row that is there. Every id it is handed is either the hold `reserve` wrote
 * for that same model call or a fresh `mint()` (`src/propose.ts`, `src/jobs.ts`), and the `ask_id` a pass 2 quotes is only
 * ever read with a `SELECT`, never passed back as the id of a new row. The settings singleton is written in two places, both
 * in `src/index.ts` and neither of them here: `INSERT OR IGNORE` once at build and `UPDATE ... SET` on named columns in
 * `configure`. So there is nothing to split, and these tests pin the behaviour that makes the question answerable by reading.
 *
 * THEY WERE SEEN TO FAIL, against two mutations of `src/call.ts` made for the purpose and then reverted. With `account` made
 * to also write `INSERT OR REPLACE INTO settings (singleton, updated_at)`, the clobber the backlog feared, the first two fail
 * with `ask_cap` back at 80 and the byo owner's `tier` and `model` back at `a` and null. With `release` made to delete by id
 * alone, so that it removes the settled row and not only the hold, all three fail: the quoted pass 2 finds no read row,
 * drafts again, and makes a model call nobody asked for. Both were measured when the tables were `settings` and `call`.
 *
 * A COLLIDING ID CANNOT REACH A SETTLED ROW. Pinned to one id, the calls failed first at `reserve`, whose plain `INSERT`
 * throws a `UNIQUE` constraint before any model is called, so the hold is what stops two calls settling onto one row.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSlash, type RawPayload } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const PREDICATE = JSON.stringify({
  registers: ['obligations'],
  where: { all: [{ field: 'state', is: 'open' }] },
  q: null,
});

const PROPOSAL = JSON.stringify({
  text: 'Two are open: {{ref:obligations#7}} and {{ref:obligations#8}}.',
  body_kind: 'query',
  body: {},
  flagged: false,
});

const SAMPLE: RawPayload = {
  id: 'inbox_raw#212',
  channel: 'email',
  ts: '2026-11-14T08:00:00Z',
  from: 'alerts@hsbc.com.eg',
  subject: 'HSBC: You have received EGP 5,005.00 from ACME',
  body: 'Dear customer, your account was credited with EGP 5,005.00 at ACME LTD on 14 Nov.',
};

const PATTERN = JSON.stringify({
  ingest: {
    match: { from: { is: 'alerts@hsbc.com.eg' }, subject: { starts: 'HSBC: You have received' } },
    extract: { merchant: { between: ['at ', ' LTD'] }, amount: { money: true } },
    writes: { register: 'obligations', confidence: 'exact' },
  },
  flagged: false,
});

const build = () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const inference = canned();
  const slash = createSlash({ sql, clock, inference, record: fakeRecord() });
  const settingsRow = () => ({ ...sql.one<Record<string, unknown>>('SELECT * FROM slash_settings WHERE singleton = 1') });
  const calls = () =>
    sql
      .all<{ id: string; kind: string; status: string; question: string | null; predicate: string | null }>(
        'SELECT id, kind, status, question, predicate FROM slash_call ORDER BY rowid',
      )
      .map((r) => ({ ...r }));
  return { sql, clock, inference, slash, settingsRow, calls };
};

/** One of every model call this package makes: a read, a pass 2 on its `ask_id`, a pass 2 without one, and a pattern. */
const everyCaller = async (slash: ReturnType<typeof build>['slash'], inference: ReturnType<typeof build>['inference']) => {
  inference.say(PREDICATE);
  const read = await slash.read('what is still open', OWNER);
  assert.ok(read.ok, JSON.stringify(read));

  inference.say(PROPOSAL);
  const quoted = await slash.propose('what is still open', OWNER, undefined, read.value.ask_id);
  assert.ok(quoted.ok, JSON.stringify(quoted));

  inference.say(PREDICATE);
  inference.say(PROPOSAL);
  const fresh = await slash.propose('what is still open', OWNER);
  assert.ok(fresh.ok, JSON.stringify(fresh));

  inference.say(PATTERN);
  const pattern = await slash.proposePattern([SAMPLE], OWNER);
  assert.ok(pattern.ok, JSON.stringify(pattern));

  return read.value.ask_id;
};

test('EVERY CALLER OF account LEAVES THE OWNER\'S SETTINGS AS CONFIGURED on tier a: cap, tier and updated_at unmoved', async () => {
  const { sql, clock, inference, slash, settingsRow } = build();
  try {
    assert.ok(slash.configure({ ask_cap: 7 }, OWNER).ok);
    const configured = settingsRow();
    /* THE CLOCK MOVES so that a rewrite of the singleton would show in `updated_at` even if it wrote the same values back. */
    clock.advance(60_000);

    await everyCaller(slash, inference);

    assert.deepEqual(settingsRow(), configured);
    assert.equal(slash.status().asks.cap, 7);
  } finally {
    sql.close();
  }
});

test('every caller of account leaves a byo owner\'s model name in place', async () => {
  const { sql, clock, inference, slash, settingsRow } = build();
  try {
    assert.ok(slash.configure({ tier: 'byo', model: 'qwen-local', ask_cap: 3 }, OWNER).ok);
    const configured = settingsRow();
    clock.advance(60_000);

    await everyCaller(slash, inference);

    assert.deepEqual(settingsRow(), configured);
    assert.equal(configured['model'], 'qwen-local');
    assert.equal(slash.status().model, 'qwen-local');
  } finally {
    sql.close();
  }
});

test('ONE ROW PER MODEL CALL, and pass 2 on an ask_id does not replace the read row it quotes', async () => {
  const { sql, inference, slash, calls } = build();
  try {
    const askId = await everyCaller(slash, inference);

    const rows = calls();
    /* Five model calls: the read, the quoted pass 2, the fresh pass 2's own draft and its proposal, and the pattern. */
    assert.equal(inference.seen.length, 5);
    assert.deepEqual(
      rows.map((r) => `${r.kind} ${r.status}`),
      ['read ok', 'propose ok', 'read ok', 'propose ok', 'pattern ok'],
    );
    assert.equal(new Set(rows.map((r) => r.id)).size, 5, 'two model calls settled onto one id');

    /* THE ROW PASS 2 READ ITS DRAFT FROM IS STILL THAT DRAFT. Replaced, a second pass 2 on the same ask_id would re-draft. */
    const quoted = rows.find((r) => r.id === askId);
    assert.equal(quoted?.kind, 'read');
    assert.equal(quoted?.question, 'what is still open');
    assert.match(quoted?.predicate ?? '', /"obligations"/);

    /* The meter counts reads and proposals on tier a, not patterns: four, and nothing held is left counted. */
    assert.equal(slash.status().asks.used, 4);
    assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM slash_call WHERE code = 'SLASH_PENDING'")?.n, 0);
  } finally {
    sql.close();
  }
});
