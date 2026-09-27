/**
 * A pattern's `call` row, and the proposal it returns, name the model the host sent and not the template's.
 *
 * WAVE 49 GAVE `naming` TO THREE OF THE FOUR `core.run` SITES. The drafting `read`, the `propose` and the automation's
 * `answer` rows all read the name the host says it sent (`test/slash-ledger-model.test.ts`). `proposePattern` in
 * `src/jobs.ts` is the fourth and was left on `ran.model`, which `core.run` takes from the template. Audit fifty §4
 * measured it through the host's real `endpointInference` with `model: 'llama3'` and read one row:
 * `{"kind":"pattern","model":"glm-5.3-flash","tokens_in":1000000,...,"code":"PROPOSAL_SCHEMA"}`. No door reaches
 * `proposePattern` today (`slash-ask.ts` leaves it out on purpose), so no stored row is wrong; the day one does, every
 * pattern row would be.
 *
 * THE HOST'S REAL `endpointInference`, REACHED BY A RELATIVE PATH as `slash-ledger-model.test.ts` reaches it, because
 * what the host says it sent is the host's decision and a hand-written double would test the double.
 *
 * RED ON 23 SEPTEMBER, BEFORE THE REPAIR: four tests, one passes, three fail. Case 1 read `glm-5.3-flash` on the row and
 * on the proposal it returned; case 2, the audit's probe, read `glm-5.3-flash` on a `PROPOSAL_SCHEMA` row; case 3 read
 * `glm-5.3-flash` on the row a reply that was not JSON left. Case 4 passed before and after, which is its job: an adapter
 * that names nothing keeps the template's name.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { endpointInference } from '../../host/src/slash.ts';
import { createSlash, type Inference, type RawPayload } from '../src/index.ts';
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

/** A 200 with `content` as the model's completion and the provider's own count. */
const said =
  (content: string, usage: { prompt_tokens: number; completion_tokens: number } = { prompt_tokens: 300, completion_tokens: 20 }) =>
  (): Response =>
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

/** The host's adapter over an endpoint that answers `reply` every time, as a self-host with `SLASH_MODEL` set builds it. */
const host = (reply: () => Response, model?: string): Inference =>
  endpointInference({
    url: 'http://127.0.0.1:11434/v1/chat/completions',
    model,
    send: async () => reply(),
  }) as Inference;

/* THE PATTERN JOB USES THE INFERENCE SLASH WAS BUILT WITH, and takes none per call, so the host goes in at construction. */
const build = (inference: Inference) => {
  const sql = openSqlite();
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference, record: fakeRecord() });
  const rows = () =>
    sql
      .all<{ kind: string; model: string; code: string | null }>('SELECT kind, model, code FROM slash_call ORDER BY rowid')
      .map((r) => ({ ...r }));
  return { sql, slash, rows };
};

test('(1) A PATTERN FILED ON A HOST WITH SLASH_MODEL IS UNDER THAT NAME, on the row and on the proposal it returns', async () => {
  const { sql, slash, rows } = build(host(said(INGEST), 'llama3'));
  try {
    const out = await slash.proposePattern(SAMPLES, OWNER);
    assert.ok(out.ok, JSON.stringify(out));
    assert.equal(out.value.model, 'llama3', 'the proposal a person reviews names a model nothing was sent');
    assert.deepEqual(rows(), [{ kind: 'pattern', model: 'llama3', code: null }]);
  } finally {
    sql.close();
  }
});

test('(2) A PATTERN ANSWERED WITHOUT AN INGEST BODY IS UNDER THE NAME THE HOST SENT, the audit fifty §4 probe', async () => {
  const { sql, slash, rows } = build(host(said('{"flagged":false}', { prompt_tokens: 1e300, completion_tokens: 1 }), 'llama3'));
  try {
    const out = await slash.proposePattern(SAMPLES, OWNER);
    assert.equal(out.ok, false);
    assert.deepEqual(rows(), [{ kind: 'pattern', model: 'llama3', code: 'PROPOSAL_SCHEMA' }]);
  } finally {
    sql.close();
  }
});

test('(3) A PATTERN THE MODEL ANSWERED UNREADABLY IS UNDER THE NAME THE HOST SENT, read off the marked throw', async () => {
  const junk = (): Response => new Response('<html>a proxy page</html>', { status: 200 });
  const { sql, slash, rows } = build(host(junk, 'llama3'));
  try {
    const out = await slash.proposePattern(SAMPLES, OWNER);
    assert.equal(out.ok, false);
    assert.deepEqual(rows(), [{ kind: 'pattern', model: 'llama3', code: 'UNREACHABLE' }]);
  } finally {
    sql.close();
  }
});

test('(4) AN ADAPTER THAT NAMES NOTHING KEEPS THE TEMPLATE NAME, which is what every pattern row carried before', async () => {
  const inference = canned();
  inference.say(INGEST);
  const { sql, slash, rows } = build(inference);
  try {
    const out = await slash.proposePattern(SAMPLES, OWNER);
    assert.ok(out.ok, JSON.stringify(out));
    assert.equal(out.value.model, 'glm-5.3-flash');
    assert.deepEqual(rows(), [{ kind: 'pattern', model: 'glm-5.3-flash', code: null }]);
  } finally {
    sql.close();
  }
});
