/**
 * A provider's refusal by status is not an answer, and an answer the host could not read has a code of its own and the
 * name of the model the host sent. Three follow-ups to "A model that answered is counted".
 *
 * WHICH THROWS ARE ANSWERS. An earlier build marked every throw after `send` resolved
 * as `answered`, a status that is not `ok` among them, so a 429, a 502, a 503 or a 401 spent an ask and the package's
 * refusal ended the run on the first rung, where before that each was retried uncounted. The default: a non-2xx status
 * is not an answer (retried, uncounted); the size, the parse and the timeout after a 200 are (counted, final), since those
 * are what a provider bills. The rungs here are the ladder's, called in turn as `serveAsks` would call them, because the
 * package's half of the rule is what it settles each one as.
 *
 * THE HOST'S REAL `endpointInference`, REACHED BY A RELATIVE PATH, because which throws carry the mark is the host's
 * decision and a hand-written double would test the double. This package may not import the host (`46 §5.1`) and does
 * not: `tools/gates/graph.mjs` reads `src/**` alone, and `packages/host/test/slash.test.ts` reaches the other way.
 *
 * RED ON 23 SEPTEMBER, BEFORE THE REPAIR: four tests, one pass, three fail. Case 1 read `PROPOSAL_SCHEMA` on the 503 and
 * never reached the second rung's answer; case 2 read `PROPOSAL_SCHEMA` on all eight rungs, each one a counted ask (and
 * through `serveAsks` the first would have ended the run); case 3 read `PROPOSAL_SCHEMA`. Case 4 passed before and after, which is its job: an adapter that names no
 * model keeps the template's name.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf, fixOf } from '@braindog/ports';

import { endpointInference } from '../../host/src/slash.ts';
import { createSlash, type Ask, type Inference } from '../src/index.ts';
import { fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const RATE: Ask = { rule: 'rate', step: 0, question: 'What rate applies to Gold?', shape: 'number' };

const GOOD = (): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":4.25}' } }], usage: { prompt_tokens: 300, completion_tokens: 8 } }), {
    status: 200,
  });

/** The probe's endpoint: a 200 whose completion is 70,000 characters, reporting 16,000 completion tokens. */
const AT_LENGTH = (): Response =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'x'.repeat(70_000) }) } }], usage: { prompt_tokens: 415, completion_tokens: 16_000 } }),
    { status: 200 },
  );

/** The host's adapter on a self-host whose `SLASH_MODEL` is `llama3`, over an endpoint that answers `replies` in turn. */
const host = (replies: readonly (() => Response)[]) => {
  let sent = 0;
  const inference = endpointInference({
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    model: 'llama3',
    send: async () => {
      const reply = replies[Math.min(sent, replies.length - 1)]!;
      sent++;
      return reply();
    },
  });
  return { inference: inference as Inference, sent: () => sent };
};

const status = (code: number) => (): Response => new Response('{"error":"try again"}', { status: code });

const build = () => {
  const sql = openSqlite();
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference: host([status(599)]).inference, record: fakeRecord() });
  assert.ok(slash.configure({ ask_cap: 80 }, OWNER).ok);
  const rows = () =>
    sql
      .all<{ model: string; tokens_in: number; tokens_out: number; status: string; code: string | null }>(
        'SELECT model, tokens_in, tokens_out, status, code FROM slash_call ORDER BY rowid',
      )
      .map((r) => ({ ...r }));
  return { sql, slash, rows };
};

test('(1) A 503 AND THEN A GOOD 200 IS ONE COUNTED ASK: the 503 is `UNREACHABLE` under `-`, and the answer is kept', async () => {
  const { sql, slash, rows } = build();
  try {
    const model = host([status(503), GOOD]);

    const first = await slash.answer(RATE, model.inference);
    const second = await slash.answer(RATE, model.inference);

    /* `UNREACHABLE` IS THE ONE CODE `serveAsks`'s `RETRIED` ASKS AGAIN, so the ladder reaches the second rung. */
    assert.equal(codeOf(first), 'UNREACHABLE', fixOf(first));
    /* ONE FULL STOP, AND IT IS THE HOST'S. The status sentence already ends in one, and this is the sentence the ladder
       acks as the run's error: measured once the status was a plain throw again, the run read
       "did not answer: The Slash endpoint answered 503..", which is the sentence the marking had hidden. */
    assert.equal(fixOf(first), 'rule.rate asked Slash at step 1, and the model did not answer: The Slash endpoint answered 503.');
    assert.deepEqual(second, { ok: true, value: { text: '4.25' } });
    assert.deepEqual(
      rows().map(({ model: name, status: s, code }) => ({ model: name, status: s, code })),
      [
        { model: '-', status: 'error', code: 'UNREACHABLE' },
        { model: 'llama3', status: 'ok', code: null },
      ],
    );
    assert.equal(slash.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('(2) A 429 ON EVERY ONE OF EIGHT RUNGS SPENDS NOTHING, and each rung is still a row', async () => {
  const { sql, slash, rows } = build();
  try {
    const model = host([status(429)]);

    const said: string[] = [];
    for (let rung = 0; rung < 8; rung++) said.push(codeOf(await slash.answer(RATE, model.inference)) ?? 'ok');

    assert.deepEqual(said, Array.from({ length: 8 }, () => 'UNREACHABLE'));
    assert.equal(model.sent(), 8);
    assert.deepEqual([...new Set(rows().map((r) => r.model))], ['-']);
    assert.equal(slash.status().asks.used, 0);
  } finally {
    sql.close();
  }
});

test('(3) A 200 THE HOST COULD NOT READ IS `ANSWER_UNREADABLE`, under the model the host sent, with the tokens it reported', async () => {
  const { sql, slash, rows } = build();
  try {
    const model = host([AT_LENGTH]);

    const out = await slash.answer(RATE, model.inference);

    assert.equal(codeOf(out), 'ANSWER_UNREADABLE', fixOf(out));
    assert.equal(
      fixOf(out),
      'rule.rate asked Slash at step 1, and the model answered with something Slash could not read: The Slash endpoint answered more than Slash reads. The run stopped there rather than ask it again.',
    );
    assert.deepEqual(rows(), [{ model: 'llama3', tokens_in: 415, tokens_out: 16_000, status: 'error', code: 'ANSWER_UNREADABLE' }]);
    assert.equal(slash.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

/* THE NAME IS READ OFF THE REPLY ONLY WHERE THE ADAPTER GAVE ONE. An adapter that says nothing about its model, a test
   double or a host built before this change, keeps the template's routing name, which is what every row carried before. */
test('(4) AN ADAPTER THAT NAMES NO MODEL KEEPS THE TEMPLATE\'S NAME on the row', async () => {
  const { sql, slash, rows } = build();
  try {
    const bare: Inference = { complete: async () => ({ text: '{"answer":4.25}', usage: { in: 300, out: 8 } }) };

    assert.equal((await slash.answer(RATE, bare)).ok, true);
    assert.deepEqual(rows(), [{ model: 'glm-5.3-flash', tokens_in: 300, tokens_out: 8, status: 'ok', code: null }]);
  } finally {
    sql.close();
  }
});
