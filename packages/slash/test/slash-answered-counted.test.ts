/**
 * A model that answered with something the host could not read is an ask that was paid for, and `answer` counts it.
 *
 * `loop/research-batch-forty-six-audit.md` FINDING 4, AUDIT FORTY-FIVE'S BRIEF 3. `answer` settled every `UNREACHABLE`
 * under `-`, which no count reads, and `UNREACHABLE` was every throw out of `complete`, including the four the host's
 * `endpointInference` makes after the endpoint answered: a status that is not `ok`, a 200 over `ANSWER_BYTES`, a 200
 * that is not JSON, and the timeout, where a slow model may have run to the end. The host's `RETRIED` then asked each of
 * them again on the ladder. Measured by the audit through the self-host: one question, four completions served, four rows
 * under `-` with `tokens_out` 0 where the endpoint reported 16,000, and the month's `ask_cap` saw none of them.
 *
 * THE MARK IS STRUCTURAL, `answered: true` ON THE THROWN ERROR, because this package may not import the host (`46 §5.1`)
 * and the host may not import it. A throw without the mark is still a model not reached, and keeps `-` and
 * `UNREACHABLE`: that is audit forty-two's finding 6, and case 4 holds it.
 *
 * RED BEFORE THE REPAIR, MEASURED ON 23 SEPTEMBER: four tests, one pass, three fail. Cases 1 and 2 read `UNREACHABLE`,
 * and case 3 read `UNREACHABLE` twice where it expects the second ask refused `SLASH_BUDGET_SPENT`. Case 4 passed before
 * and after, which is its job.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf, fixOf } from '@braindog/ports';

import { createSlash, type Ask, type Inference } from '../src/index.ts';
import { fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const RATE: Ask = { rule: 'rate', step: 0, question: 'What rate applies to Gold?', shape: 'number' };

/** What the host's `endpointInference` throws after the endpoint answered: the sentence, the mark, and the count if it had one. */
const answeredError = (message: string, usage?: { in: number; out: number }): Error =>
  Object.assign(new Error(message), { answered: true, ...(usage === undefined ? {} : { usage }) });

/** An inference that throws `e` on every call and counts the calls, as the audit's endpoint counted what it served. */
const throwing = (e: Error) => {
  let calls = 0;
  const inference: Inference = {
    complete: async () => {
      calls++;
      throw e;
    },
  };
  return { inference, calls: () => calls };
};

const build = (cap: number) => {
  const sql = openSqlite();
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference: throwing(new Error('the fallback was called')).inference, record: fakeRecord() });
  assert.ok(slash.configure({ ask_cap: cap }, OWNER).ok);
  const rows = () =>
    sql
      .all<{ model: string; tokens_in: number; tokens_out: number; status: string; code: string | null }>(
        'SELECT model, tokens_in, tokens_out, status, code FROM call ORDER BY rowid',
      )
      .map((r) => ({ ...r }));
  return { sql, slash, rows };
};

test('(1) A 200 OVER THE SIZE SLASH READS IS SETTLED UNDER THE MODEL, WITH THE TOKENS IT REPORTED, and is not retried', async () => {
  const { sql, slash, rows } = build(80);
  try {
    const model = throwing(answeredError('The Slash endpoint answered more than Slash reads.', { in: 415, out: 16_000 }));

    const out = await slash.answer(RATE, model.inference);

    /* NOT `UNREACHABLE`, which is the one code the host's `RETRIED` asks again. */
    assert.notEqual(codeOf(out), 'UNREACHABLE', fixOf(out));
    assert.equal(codeOf(out), 'ANSWER_UNREADABLE');
    assert.equal(
      fixOf(out),
      "rule.rate asked Slash at step 1, and the model answered with something Slash could not read: The Slash endpoint answered more than Slash reads. The run stopped there rather than ask it again.",
    );
    assert.deepEqual(rows(), [{ model: 'glm-5.3-flash', tokens_in: 415, tokens_out: 16_000, status: 'error', code: 'ANSWER_UNREADABLE' }]);
    assert.equal(slash.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('(2) AN ANSWERED THROW WITH NO COUNT KEEPS THE PROMPT ESTIMATE, UNDER THE MODEL AND NOT UNDER `-`', async () => {
  const { sql, slash, rows } = build(80);
  try {
    const out = await slash.answer(RATE, throwing(answeredError('The Slash endpoint answered with a body that is not JSON.')).inference);

    assert.equal(codeOf(out), 'ANSWER_UNREADABLE', fixOf(out));
    const [row] = rows();
    assert.equal(row?.model, 'glm-5.3-flash');
    assert.equal(row?.tokens_out, 0);
    assert.ok((row?.tokens_in ?? 0) > 0, 'the estimate was not billed as tokens_in');
    assert.equal(slash.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('(3) AT ask_cap 1, AN ANSWER NOBODY COULD READ SPENDS THE MONTH, and the next ask reaches no model', async () => {
  const { sql, slash } = build(1);
  try {
    const model = throwing(answeredError('The Slash endpoint answered more than Slash reads.', { in: 415, out: 16_000 }));

    const said = [codeOf(await slash.answer(RATE, model.inference)), codeOf(await slash.answer(RATE, model.inference))];

    assert.deepEqual(said, ['ANSWER_UNREADABLE', 'SLASH_BUDGET_SPENT']);
    assert.equal(model.calls(), 1, `${model.calls()} completions served at ask_cap 1`);
  } finally {
    sql.close();
  }
});

test('(4) A THROW WITHOUT THE MARK IS STILL A MODEL NOT REACHED: `UNREACHABLE`, under `-`, and counted by nothing', async () => {
  const { sql, slash, rows } = build(80);
  try {
    const out = await slash.answer(RATE, throwing(new Error('connect ECONNREFUSED')).inference);

    assert.equal(codeOf(out), 'UNREACHABLE');
    assert.equal(rows()[0]?.model, '-');
    assert.equal(slash.status().asks.used, 0);
  } finally {
    sql.close();
  }
});

/* THE COUNT IS TAKEN ONLY WHOLE, so a `usage` missing one of its numbers is billed on the estimate and not as a zero for
   the half nobody reported. Without this case `heardIn` could keep `{ in: 415, out: 0 }` and cases 1 to 4 stayed green,
   measured on 23 September by the checker. */
test('(5) AN ANSWERED THROW WITH HALF A COUNT KEEPS THE ESTIMATE, and does not bill the missing half as zero', async () => {
  const { sql, slash, rows } = build(80);
  try {
    const half = Object.assign(new Error('The Slash endpoint answered more than Slash reads.'), { answered: true, usage: { in: 415 } });
    const out = await slash.answer(RATE, throwing(half).inference);

    assert.equal(codeOf(out), 'ANSWER_UNREADABLE', fixOf(out));
    const [row] = rows();
    assert.equal(row?.model, 'glm-5.3-flash');
    assert.notEqual(row?.tokens_in, 415, 'the half count was billed');
    assert.ok((row?.tokens_in ?? 0) > 0, 'the estimate was not billed as tokens_in');
  } finally {
    sql.close();
  }
});
