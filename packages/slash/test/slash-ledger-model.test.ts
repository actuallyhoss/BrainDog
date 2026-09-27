/**
 * Every `call` row names the model the host sent, and every count it holds is a whole number an `INTEGER` column keeps.
 * Two follow-ups to wave 48's "the ledger names the model the host used", which its checker found half done.
 *
 * WAVE 48 NAMED THE HOST'S MODEL ON `answer` ROWS ONLY. The host maps the package's routing name onto `SLASH_MODEL` on the
 * way out and says what it sent on its reply and on a marked throw (`packages/host/src/slash.ts`, `endpointInference`),
 * and `answer.ts` read that name back. `propose.ts` did not: the drafting `read` row and the `propose` row were both written
 * under `ran.model`, which `core.run` takes from the template. So on one self-host with `SLASH_MODEL=llama3`, an
 * automation's row read `llama3` and a person's read and proposal, sent to the same endpoint as the same `llama3`, read
 * `glm-5.3-flash`, a model nothing was asked of.
 *
 * THE COUNT WAS CLAMPED BELOW AND NOT ABOVE. Wave 48's `counted` made a count whole and not negative, and `1e300` is both:
 * `Number.isInteger(1e300)` is true, so it passed, and SQLite stored it as a REAL in `tokens_in INTEGER NOT NULL`, with
 * `neurons` on tier `a` a REAL of the same size.
 *
 * THE HOST'S REAL `endpointInference`, REACHED BY A RELATIVE PATH as `slash-status-retried.test.ts` reaches it, because
 * what the host says it sent is the host's decision and a hand-written double would test the double.
 *
 * RED ON 23 SEPTEMBER, BEFORE THE REPAIR: five tests, two pass, three fail. Case 1 read `glm-5.3-flash` on both rows and
 * on the proposal it returned; case 2 read `glm-5.3-flash` on the row a proposal that answered unreadably left; case 4
 * read `tokens_in` and `tokens_out` as `real` 1e300 and `neurons` as `real`. Cases 3 and 5 passed before and after, which
 * is their job: a throw that carries no name, and an adapter that names nothing, keep the template's name.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { endpointInference, SLASH_TOKENS_CEILING } from '../../host/src/slash.ts';
import { createSlash, type Inference } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const PREDICATE = JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'state', is: 'open' }] }, q: null });

const PROPOSAL = JSON.stringify({
  text: 'Two are open: {{ref:obligations#7}} and {{ref:obligations#8}}.',
  body_kind: 'query',
  body: {},
  flagged: false,
});

/** A 200 with `content` as the model's completion and the provider's own count. */
const said =
  (content: string, usage: { prompt_tokens: number; completion_tokens: number } = { prompt_tokens: 300, completion_tokens: 20 }) =>
  (): Response =>
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

/** The host's adapter over an endpoint that answers `replies` in turn, as a self-host with `SLASH_MODEL` set builds it. */
const host = (replies: readonly (() => Response)[], model?: string): Inference => {
  let sent = 0;
  return endpointInference({
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    model,
    send: async () => {
      const reply = replies[Math.min(sent, replies.length - 1)]!;
      sent++;
      return reply();
    },
  }) as Inference;
};

const build = (fallback: Inference = canned()) => {
  const sql = openSqlite();
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference: fallback, record: fakeRecord() });
  assert.ok(slash.configure({ ask_cap: 80 }, OWNER).ok);
  const rows = () =>
    sql
      .all<{ kind: string; model: string; code: string | null }>('SELECT kind, model, code FROM slash_call ORDER BY rowid')
      .map((r) => ({ ...r }));
  return { sql, slash, rows };
};

test('(1) A READ AND ITS PROPOSAL ON A HOST WITH SLASH_MODEL ARE BOTH UNDER THAT NAME, and so is the proposal it returns', async () => {
  const { sql, slash, rows } = build();
  try {
    const model = host([said(PREDICATE), said(PROPOSAL)], 'llama3');
    const read = await slash.read('what is still open', OWNER, model);
    assert.ok(read.ok, JSON.stringify(read));
    const out = await slash.propose('what is still open', OWNER, undefined, read.value.ask_id, model);
    assert.ok(out.ok, JSON.stringify(out));
    assert.equal(out.value.model, 'llama3', 'the proposal a person reads names a model nothing was sent');
    assert.deepEqual(rows(), [
      { kind: 'read', model: 'llama3', code: null },
      { kind: 'propose', model: 'llama3', code: null },
    ]);

    /* A PROPOSE WITH NO ASK ID DRAFTS FOR ITSELF, and that drafting row is written by the same `accountRead`. */
    sql.exec('DELETE FROM slash_call');
    const whole = await slash.propose('what is still open', OWNER, undefined, undefined, host([said(PREDICATE), said(PROPOSAL)], 'llama3'));
    assert.ok(whole.ok, JSON.stringify(whole));
    assert.deepEqual(rows(), [
      { kind: 'read', model: 'llama3', code: null },
      { kind: 'propose', model: 'llama3', code: null },
    ]);
  } finally {
    sql.close();
  }
});

test('(2) A PROPOSAL THE MODEL ANSWERED UNREADABLY IS UNDER THE NAME THE HOST SENT, read off the marked throw', async () => {
  const { sql, slash, rows } = build();
  try {
    const junk = (): Response => new Response('<html>a proxy page</html>', { status: 200 });
    const out = await slash.propose('what is still open', OWNER, undefined, undefined, host([said(PREDICATE), junk], 'llama3'));
    assert.equal(out.ok, false);
    assert.deepEqual(rows(), [
      { kind: 'read', model: 'llama3', code: null },
      { kind: 'propose', model: 'llama3', code: 'UNREACHABLE' },
    ]);
  } finally {
    sql.close();
  }
});

test('(3) A READ THAT REACHED NOTHING KEEPS THE TEMPLATE NAME, because a refused connection says nothing about a model', async () => {
  const { sql, slash, rows } = build();
  try {
    const refused: Inference = {
      complete: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:11434')),
    };
    const out = await slash.read('what is still open', OWNER, refused);
    assert.ok(out.ok, JSON.stringify(out));
    assert.deepEqual(rows(), [{ kind: 'read', model: 'glm-5.3-flash', code: 'UNREACHABLE' }]);
  } finally {
    sql.close();
  }
});

/* 1e300 IS WHOLE AND NOT NEGATIVE, so wave 48's clamp let it through. It is the body's `usage` a provider or anything
   between it and this host wrote, and nothing checks it but `counted`. Tier `a` with no `SLASH_MODEL`, so the row is
   under `glm-5.3-flash`, which has a rate, and `neurons` is computed from the count as well. */
test('(4) A COUNT OF 1e300 REACHES THE LEDGER AS A WHOLE NUMBER UNDER THE CEILING, in an INTEGER column, and so do its neurons', async () => {
  const { sql, slash } = build();
  try {
    const out = await slash.read('what is still open', OWNER, host([said(PREDICATE, { prompt_tokens: 1e300, completion_tokens: 1e300 })]));
    assert.ok(out.ok, JSON.stringify(out));
    const row = sql.one<Record<string, unknown>>(
      `SELECT model, tokens_in, tokens_out, typeof(tokens_in) AS tin, typeof(tokens_out) AS tout, typeof(neurons) AS tn FROM slash_call`,
    );
    assert.deepEqual(
      { ...row },
      {
        model: 'glm-5.3-flash',
        tokens_in: SLASH_TOKENS_CEILING,
        tokens_out: SLASH_TOKENS_CEILING,
        tin: 'integer',
        tout: 'integer',
        tn: 'integer',
      },
    );
  } finally {
    sql.close();
  }
});

test('(5) AN ADAPTER THAT NAMES NO MODEL KEEPS THE TEMPLATE NAME on the read row and the proposal row', async () => {
  const model = canned();
  const { sql, slash, rows } = build(model);
  try {
    model.say(PREDICATE);
    model.say(PROPOSAL);
    const out = await slash.propose('what is still open', OWNER);
    assert.ok(out.ok, JSON.stringify(out));
    assert.equal(out.value.model, 'glm-5.3-flash');
    assert.deepEqual(rows(), [
      { kind: 'read', model: 'glm-5.3-flash', code: null },
      { kind: 'propose', model: 'glm-5.3-flash', code: null },
    ]);
  } finally {
    sql.close();
  }
});
