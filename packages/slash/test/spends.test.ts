/**
 * Whose allowance an ask spends is what its ledger row says, and the two counts read nothing else (ENG-A05).
 *
 * RED BEFORE STORE VERSION 3, CASE 1. `asksUsed` counted rows of kind `read` or `pattern`, and the record's own draft of
 * a pattern is written as kind `pattern`, so on the included model a background ask spent one of his 80: `asks.used`
 * read 1 after one `draftPattern` and nobody had asked anything. The header of `jobs.ts` said it did not.
 *
 * HIS WORDS: "cap stays 80", and "a non-2xx status from the model is retried and not counted". So a failed attempt
 * moves neither count (cases 3 and 4) and keeps the neurons a platform may have billed, where a reply nobody could
 * read and a timeout count once (case 5). An automation's question is one of his asks (case 6).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf } from '@braindog/ports';

import { core } from '../src/call.ts';
import { BACKGROUND_ASKS_MONTH, createSlash, type Ask, type RawPayload } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const sample = (seq: number, amount: string): RawPayload => ({
  id: `inbox_raw#${seq}`,
  channel: 'email',
  ts: '2026-11-14T08:00:00Z',
  from: 'alerts@hsbc.com.eg',
  subject: `HSBC: You have received EGP ${amount} from ACME`,
  body: `Dear customer, your account was credited with EGP ${amount} at ACME LTD on 14 Nov.`,
});

const SAMPLES = [sample(212, '5,005.00'), sample(213, '1,200.50'), sample(214, '99.00')];

const INGEST = JSON.stringify({
  ingest: {
    match: { from: { is: 'alerts@hsbc.com.eg' }, subject: { starts: 'HSBC: You have received' } },
    extract: { merchant: { between: ['at ', ' LTD'] }, amount: { money: true } },
    writes: { register: 'obligations', confidence: 'exact' },
  },
  flagged: false,
});

const PREDICATE = JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'state', is: 'open' }] }, q: null });

const RATE: Ask = { rule: 'rate', step: 0, question: 'What rate applies to Gold?', shape: 'number' };

type Row = { kind: string; model: string; code: string | null; purpose: string; spends: string; neurons: number };

/** The engine on the included model, and the two counts as the ledger itself reads them. */
const build = () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const inference = canned();
  const slash = createSlash({ sql, clock, inference, record: fakeRecord() });
  const ledger = core(sql, clock, inference);
  return {
    sql,
    inference,
    slash,
    his: () => slash.status().asks.used,
    background: () => ledger.backgroundUsed(),
    rows: () => sql.all<Row>('SELECT kind, model, code, purpose, spends, neurons FROM slash_call ORDER BY rowid').map((r) => ({ ...r })),
  };
};

/** A throw with one of the host's marks on it, as `packages/host/src/slash.ts` and the Worker's adapter throw them. */
const marked = (message: string, mark: Record<string, unknown>): Error => Object.assign(new Error(message), mark);

test('(1) ONE BACKGROUND ASK ON THE INCLUDED MODEL LEAVES HIS COUNT WHERE IT WAS, and is one of the background allowance', async () => {
  const { sql, inference, slash, his, background, rows } = build();
  try {
    inference.say(PREDICATE);
    assert.equal((await slash.read('what is still open', OWNER)).ok, true);
    assert.equal(his(), 1);

    inference.say(INGEST);
    const drafted = await slash.draftPattern(SAMPLES);
    assert.equal(drafted.ok, true, JSON.stringify(drafted));
    /* RED BEFORE VERSION 3: 2, the record's own draft counted as one of his. */
    assert.equal(his(), 1, 'a background ask spent one of his asks');
    assert.equal(background(), 1);
    assert.deepEqual(rows().map((r) => [r.kind, r.purpose, r.spends]), [
      ['read', 'ask', 'person'],
      ['pattern', 'pattern', 'background'],
    ]);

    /* AND THE REST OF THE RECORD'S OWN WORK: two sentences above a digest, and an ask a host wrote for the headlines. */
    inference.say(JSON.stringify({ text: 'Two things are late. One is paid.', cites: [] }));
    await slash.digestProse({ digest: 'weekly', name: 'The week', text: 'late: 2\npaid: 1' });
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, question, purpose, spends)
       VALUES ('h_1', ?, 'pattern', 'a', 'glm-5.3-flash', 700, 60, 9, 40, 'ok', 'Slash''s page headlines', 'headline', 'background')`,
      new Date(NOW).toISOString(),
    );
    assert.equal(his(), 1);
    assert.deepEqual(rows().map((r) => [r.kind, r.purpose, r.spends]).slice(2), [
      ['prose', 'prose', 'background'],
      ['pattern', 'headline', 'background'],
    ]);
    assert.equal(background(), 3);
    assert.equal(core(sql, fixedClock(NOW), inference).backgroundUsed('headline'), 1);
  } finally {
    sql.close();
  }
});

test(`(2) THE BACKGROUND ALLOWANCE IS ITS OWN ${BACKGROUND_ASKS_MONTH}, his record's monthly thinking budget, and spending all of it costs him none of his 80`, () => {
  const { sql, his, background } = build();
  try {
    assert.equal(BACKGROUND_ASKS_MONTH, 600);
    for (let i = 0; i < BACKGROUND_ASKS_MONTH; i++)
      sql.exec(
        `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, purpose, spends)
         VALUES (?, ?, 'pattern', 'a', 'glm-5.3-flash', 700, 60, 9, 40, 'ok', 'look', 'background')`,
        `b_${i}`,
        new Date(NOW).toISOString(),
      );
    assert.equal(background(), BACKGROUND_ASKS_MONTH);
    assert.equal(his(), 0);
  } finally {
    sql.close();
  }
});

test('(3) A FAILED ATTEMPT MOVES NEITHER COUNT: a model that could not be reached, on his ask, a rule\'s and the record\'s own work', async () => {
  const { sql, inference, slash, his, background, rows } = build();
  try {
    /* His own ask is still answered, from the words alone, and it cost him nothing. */
    inference.say(new Error('502 from the gateway'));
    assert.equal((await slash.read('what is open', OWNER)).ok, true);
    inference.say(new Error('503 from the gateway'));
    assert.equal((await slash.answer(RATE)).ok, false);
    inference.say(new Error('503 from the gateway'));
    assert.equal((await slash.draftPattern(SAMPLES)).ok, false);
    inference.say(new Error('503 from the gateway'));
    assert.equal((await slash.digestProse({ digest: 'weekly', name: 'The week', text: 'late: 2' })).ok, false);

    assert.deepEqual(rows().map((r) => [r.kind, r.purpose, r.code, r.spends]), [
      ['read', 'ask', 'UNREACHABLE', 'none'],
      ['read', 'automation', 'UNREACHABLE', 'none'],
      ['pattern', 'pattern', 'UNREACHABLE', 'none'],
      ['prose', 'prose', 'UNREACHABLE', 'none'],
    ]);
    assert.equal(his(), 0);
    assert.equal(background(), 0);
  } finally {
    sql.close();
  }
});

test('(4) A FAILED ATTEMPT KEEPS ITS NEURONS: a binding that was called and threw is priced for the operator and is not one of his asks', async () => {
  const { sql, inference, slash, his, rows } = build();
  try {
    const threw = (): Error => marked('InferenceUpstreamError: 3043 internal server error', { reached: true, model: 'glm-5.3-flash' });
    /* THE LADDER'S RUNGS, three of them at a cap of two: every one reaches the model, because none was an ask of his. */
    assert.ok(slash.configure({ ask_cap: 2 }, OWNER).ok);
    for (let i = 0; i < 3; i++) {
      inference.say(threw());
      const out = await slash.answer(RATE);
      assert.equal(codeOf(out), 'UNREACHABLE');
    }
    assert.equal(inference.seen.length, 3);
    for (const row of rows()) {
      assert.equal(row.model, 'glm-5.3-flash');
      assert.equal(row.spends, 'none');
      assert.ok(row.neurons > 0, 'the attempt a platform may have billed lost its neurons');
    }
    assert.equal(his(), 0);
  } finally {
    sql.close();
  }
});

test('(5) AN UNREADABLE REPLY AND A TIMEOUT COUNT ONCE: the model ran, so the ask is spent, on a rule\'s question and on his own', async () => {
  const { sql, inference, slash, his, rows } = build();
  try {
    const ranOut = (): Error => marked('The model took longer than 30 seconds.', { answered: true, model: 'glm-5.3-flash', usage: { in: 700, out: 0 } });
    inference.say(ranOut());
    const answered = await slash.answer(RATE);
    assert.equal(codeOf(answered), 'ANSWER_UNREADABLE');
    assert.equal(his(), 1);

    /* HIS OWN ASK REACHES THE LEDGER AS `UNREACHABLE` ALL THE SAME, and is told from a model not reached by the mark. */
    inference.say(ranOut());
    assert.equal((await slash.read('what is open', OWNER)).ok, true);
    assert.equal(his(), 2);

    /* AND A REPLY THAT IS NOT JSON, which no host marks: the model answered, and it is one ask. */
    inference.say('I think the answer is probably four.');
    assert.equal((await slash.answer(RATE)).ok, false);
    assert.equal(his(), 3);
    assert.deepEqual(rows().map((r) => [r.purpose, r.code, r.spends]), [
      ['automation', 'ANSWER_UNREADABLE', 'person'],
      ['ask', 'UNREACHABLE', 'person'],
      ['automation', 'PROPOSAL_SCHEMA', 'person'],
    ]);
  } finally {
    sql.close();
  }
});

test("(6) AN AUTOMATION'S ASK SPENDS HIS ALLOWANCE, and the cap of his asks turns the next one away without spending anything", async () => {
  const { sql, inference, slash, his, background, rows } = build();
  try {
    assert.ok(slash.configure({ ask_cap: 1 }, OWNER).ok);
    inference.say(JSON.stringify({ answer: 4 }));
    assert.equal((await slash.answer(RATE)).ok, true);
    assert.equal(his(), 1);
    assert.equal(background(), 0);

    const refused = await slash.answer(RATE);
    assert.equal(codeOf(refused), 'SLASH_BUDGET_SPENT');
    assert.equal(inference.seen.length, 1);
    assert.deepEqual(rows().map((r) => [r.purpose, r.model, r.spends]), [
      ['automation', 'glm-5.3-flash', 'person'],
      ['automation', '-', 'none'],
    ]);
    assert.equal(his(), 1);
  } finally {
    sql.close();
  }
});
