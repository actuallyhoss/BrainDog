/**
 * Each piece of the record's own work says on its ledger row what it bought (ENG-A10 job 2, budget-plan-86#6).
 *
 * RED BEFORE THIS: `jobs.ts` wrote every row it accounted with the one `WORK`, purpose `look`. So a digest's two
 * sentences, a pattern drafted for the inbox and every embedding were filed under the daily look: Usage read the
 * month's thinking as one line, and the plan's floors (`packages/host/src/budget-plan.ts`: 4 for `look`, 4 for `prose`,
 * 2 for `pattern`, none for `embed`) had nothing on the ledger to count against but a host's own tally.
 *
 * WHAT DID NOT MOVE. Each of the three still spends the background allowance and none of his asks, a press at the raw
 * inbox is still `ask` and `person`, and a call no model answered still spends nothing (`unspent`, `call.ts`), under
 * the purpose it was made for.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf } from '@braindog/ports';

import { core } from '../src/call.ts';
import { createSlash, type RawPayload } from '../src/index.ts';
import type { Embedding } from '../src/types.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite, type Canned } from './double.ts';

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

const PROSE = JSON.stringify({ text: 'Two things are late. One is paid.' });
const DIGEST = { digest: 'weekly', name: 'The week', text: 'late: 2\npaid: 1' };

const EMBEDDED: Embedding = { model: 'embed-small', dims: 2, vectors: [new Int8Array([1, 2])], usage: { in: 12, out: 0 } };

/** The fake adapter with an embedding model behind it: each call answers what the case queued, or throws it. */
const embedding = (): Canned & { embeds(next: Embedding | Error): void } => {
  const queue: (Embedding | Error)[] = [];
  return Object.assign(canned(), {
    embeds: (next: Embedding | Error): void => void queue.push(next),
    embed: (): Promise<Embedding> => {
      const next = queue.shift();
      if (next === undefined) throw new Error('the test queued no embedding for this call');
      if (next instanceof Error) throw next;
      return Promise.resolve(next);
    },
  });
};

type Row = { kind: string; model: string; status: string; code: string | null; purpose: string; spends: string };

/** The engine on the included model, its ledger's rows in the order written, and the counts the ledger itself makes. */
const build = (inference: Canned = canned()) => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const slash = createSlash({ sql, clock, inference, record: fakeRecord() });
  const ledger = core(sql, clock, inference);
  return {
    sql,
    slash,
    ledger,
    rows: () => sql.all<Row>('SELECT kind, model, status, code, purpose, spends FROM slash_call ORDER BY rowid').map((r) => ({ ...r })),
  };
};

test("(1) A DIGEST'S PROSE IS `prose`, A PATTERN DRAFT `pattern`, AN EMBEDDING `embed`, and each still spends the background allowance", async () => {
  const inference = embedding();
  const { sql, slash, ledger, rows } = build(inference);
  try {
    inference.say(PROSE);
    assert.deepEqual(await slash.digestProse(DIGEST), { ok: true, value: { text: 'Two things are late. One is paid.' } });
    inference.say(INGEST);
    const drafted = await slash.draftPattern(SAMPLES);
    assert.equal(drafted.ok, true, JSON.stringify(drafted));
    inference.embeds(EMBEDDED);
    assert.equal((await slash.embedTexts(['a late invoice'])).ok, true);

    /* RED BEFORE THIS: `look` three times. */
    assert.deepEqual(rows().map((r) => [r.kind, r.purpose, r.spends]), [
      ['prose', 'prose', 'background'],
      ['pattern', 'pattern', 'background'],
      ['embed', 'embed', 'background'],
    ]);

    /* THE COUNT A PLAN MAKES FROM IT: one of each, and nothing left under the daily look. */
    assert.equal(ledger.backgroundUsed(), 3);
    assert.deepEqual(
      (['prose', 'pattern', 'embed', 'look'] as const).map((p) => ledger.backgroundUsed(p)),
      [1, 1, 1, 0],
    );
  } finally {
    sql.close();
  }
});

test('(2) HIS OWN ASKS PASS OVER ALL THREE, as they pass over the daily look: nine pieces of work and his count is where it was', async () => {
  const inference = embedding();
  const { sql, slash, ledger, rows } = build(inference);
  try {
    for (let i = 0; i < 3; i++) {
      inference.say(PROSE);
      await slash.digestProse(DIGEST);
      inference.say(INGEST);
      await slash.draftPattern(SAMPLES);
      inference.embeds(EMBEDDED);
      await slash.embedTexts(['a late invoice']);
    }
    /* A daily look as a host writes its own row, beside them. */
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, question, purpose, spends)
       VALUES ('l_1', ?, 'pattern', 'a', 'glm-5.3-flash', 700, 60, 9, 40, 'ok', 'The daily look', 'look', 'background')`,
      new Date(NOW).toISOString(),
    );
    assert.equal(rows().length, 10);
    assert.equal(ledger.asksUsed(), 0);
    assert.equal(slash.status().asks.used, 0);
    assert.equal(ledger.backgroundUsed(), 10);
    assert.equal(ledger.backgroundUsed('look'), 1);
  } finally {
    sql.close();
  }
});

test('(3) A PRESS AT THE RAW INBOX IS STILL HIS: the same draft, asked by a person, is `ask` and one of his asks', async () => {
  const inference = canned();
  const { sql, slash, ledger, rows } = build(inference);
  try {
    inference.say(INGEST);
    const pressed = await slash.proposePattern(SAMPLES, OWNER);
    assert.equal(pressed.ok, true, JSON.stringify(pressed));
    assert.deepEqual(rows().map((r) => [r.kind, r.purpose, r.spends]), [['pattern', 'ask', 'person']]);
    assert.equal(ledger.asksUsed(), 1);
    assert.equal(ledger.backgroundUsed(), 0);
    assert.equal(ledger.backgroundUsed('pattern'), 0);
  } finally {
    sql.close();
  }
});

test('(4) A CALL THAT FAILED SAYS THE SAME PURPOSE, and spends nothing: a model not reached, on each of the three', async () => {
  const inference = embedding();
  const { sql, slash, ledger, rows } = build(inference);
  try {
    inference.say(new Error('503 from the gateway'));
    assert.equal(codeOf(await slash.digestProse(DIGEST)), 'UNREACHABLE');
    inference.say(new Error('503 from the gateway'));
    assert.equal(codeOf(await slash.draftPattern(SAMPLES)), 'UNREACHABLE');
    inference.embeds(new Error('503 from the gateway'));
    assert.equal(codeOf(await slash.embedTexts(['a late invoice'])), 'UNREACHABLE');

    /* RED BEFORE THIS: `look` on every one, so a month of failed embeddings read as failed daily looks. */
    assert.deepEqual(rows().map((r) => [r.kind, r.purpose, r.status, r.code, r.spends]), [
      ['prose', 'prose', 'error', 'UNREACHABLE', 'none'],
      ['pattern', 'pattern', 'error', 'UNREACHABLE', 'none'],
      ['embed', 'embed', 'error', 'UNREACHABLE', 'none'],
    ]);
    assert.equal(ledger.backgroundUsed(), 0);
    assert.equal(ledger.asksUsed(), 0);
  } finally {
    sql.close();
  }
});

test('(5) THE OTHER WAYS A JOB ENDS KEEP ITS PURPOSE TOO: a host with no embedding model, and prose the model wrote badly', async () => {
  const inference = canned();
  const { sql, slash, ledger, rows } = build(inference);
  try {
    /* NO `embed` ON THE ADAPTER: refused in words, and the row is an embedding's, under `-`. */
    assert.equal(codeOf(await slash.embedTexts(['a late invoice'])), 'NOT_IN_THIS_BUILD');
    /* A REPLY THAT IS NOT THE SCHEMA: no sentences, the digest goes as figures, and the model did run. */
    inference.say('not json at all');
    assert.deepEqual(await slash.digestProse(DIGEST), { ok: true, value: { text: '' } });

    const got = rows();
    assert.deepEqual(got.map((r) => [r.kind, r.purpose]), [
      ['embed', 'embed'],
      ['prose', 'prose'],
    ]);
    assert.deepEqual([got[0]?.model, got[0]?.code, got[0]?.spends], ['-', 'NOT_IN_THIS_BUILD', 'none']);
    /* The model answered, so the ask is spent, and it is prose that spent it. */
    assert.equal(got[1]?.spends, 'background');
    assert.equal(ledger.backgroundUsed('prose'), 1);
    assert.equal(ledger.backgroundUsed('look'), 0);
  } finally {
    sql.close();
  }
});
