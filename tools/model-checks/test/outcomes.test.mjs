/**
 * The model checks' three outcomes held without a model: a provider that times out is `not-measured` and never
 * red; a failing case passes on two of three; a real fall below the bar is red. The rules are tested in `lib.mjs`, and the
 * runner end to end against a provider stood up on localhost, so no test spends a neuron or needs a token.
 *
 *   node --test tools/model-checks/test/outcomes.test.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib.mjs';

const runner = join(dirname(fileURLToPath(import.meta.url)), '..', 'run.mjs');

test('a timeout is no answer, and three of them are not measured, never red', async () => {
  const slept = [];
  const got = await lib.tried(
    async () => {
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    },
    { sleep: async (ms) => void slept.push(ms) },
  );
  assert.equal(got.answered, false);
  assert.equal(got.tries, 3);
  assert.deepEqual(slept, [2_000, 8_000], 'the wait grows between tries');
  assert.equal(lib.routeOutcome(got), lib.NONE);
  const timedOut = [{ id: '1', verdict: 'none' }, { id: '2', verdict: 'none' }];
  assert.equal(lib.suiteOutcome(timedOut, 80).outcome, lib.NONE);
  assert.equal(lib.overall([lib.PASS, lib.NONE]), lib.NONE);
});

test('a provider message is told apart: no answer, not served, or an answer', () => {
  assert.equal(lib.noAnswer('TimeoutError: The operation was aborted due to timeout'), true);
  assert.equal(lib.noAnswer('503: upstream unavailable'), true);
  assert.equal(lib.noAnswer('429: too many requests'), true);
  assert.equal(lib.noAnswer('The Slash endpoint did not finish answering within 30 seconds.'), true, 'the record harness says it this way');
  assert.equal(lib.noAnswer('400: response_format is not supported'), false);
  assert.equal(lib.noAnswer(''), false);
  assert.equal(lib.noAnswer('400: max_tokens above 512 is not allowed'), false, 'a 5xx in the words is not a status');
  assert.equal(lib.noAnswer('The Slash endpoint answered 502.'), true, 'the host says a status this way');
  assert.equal(lib.refused('401: Authentication error'), true);
  assert.equal(lib.refused('The Slash endpoint answered 403.'), true);
  assert.equal(lib.refused('400: 401 tokens is over the limit'), false);
  assert.equal(lib.unserved('400: No such model @cf/zai-org/glm-5.3-flash'), true);
  assert.equal(lib.routeOutcome({ answered: true, served: false, strict: false }), lib.BELOW);
  assert.equal(lib.routeOutcome({ answered: true, served: true, strict: false }), lib.BELOW);
  assert.equal(lib.routeOutcome({ answered: true, served: true, strict: true }), lib.PASS);
});

test('a failing case passes on two of three, and fails on two failures', () => {
  assert.equal(lib.verdict([true]), 'pass');
  assert.equal(lib.verdict([false]), 'more');
  assert.equal(lib.verdict([false, true]), 'more');
  assert.equal(lib.verdict([false, true, true]), 'pass');
  assert.equal(lib.verdict([false, true, false]), 'fail');
  assert.equal(lib.verdict([false, false]), 'fail');
  assert.equal(lib.verdict([null, true]), 'pass', 'the first answer passed');
  assert.equal(lib.verdict([null, null, null]), 'none');
  assert.equal(lib.verdict([null, false, true]), 'none', 'one answer each way is not enough to call red');
});

test('a real fall below the bar is red, and no bar yet cannot be', () => {
  const ten = (passing) => Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), verdict: i < passing ? 'pass' : 'fail' }));
  assert.equal(lib.suiteOutcome(ten(9), 85).outcome, lib.PASS);
  const fell = lib.suiteOutcome(ten(6), 85);
  assert.equal(fell.outcome, lib.BELOW);
  assert.equal(fell.score, 60);
  assert.equal(lib.suiteOutcome(ten(6), null).outcome, lib.PASS);
  assert.equal(lib.overall([lib.PASS, lib.NONE, lib.BELOW]), lib.BELOW);
});

test('two nights below or three not measured is an alarm; no token and runs by hand are not', () => {
  const night = (outcome, reason = null, scheduled = true) => ({ outcome, reason, scheduled });
  assert.deepEqual(lib.alarm([night(lib.BELOW), night(lib.BELOW)]), { why: 'below', nights: 2 });
  assert.equal(lib.alarm([night(lib.BELOW), night(lib.PASS)]), null);
  assert.equal(lib.alarm([night(lib.BELOW), night(lib.BELOW, null, false)]), null);
  assert.deepEqual(lib.alarm([night(lib.NONE, 'no-answer'), night(lib.NONE, 'no-answer'), night(lib.NONE, 'no-answer')]), { why: 'not-measured', nights: 3 });
  assert.equal(lib.alarm([night(lib.NONE, 'no-token'), night(lib.NONE, 'no-token'), night(lib.NONE, 'no-token')]), null);
});

test('the flags: --small is the routes and both suites, a typo is refused, the ceilings default', () => {
  const small = lib.parseArgs(['--small']);
  assert.equal(small.routes, true);
  assert.deepEqual(small.suites, ['slash', 'record']);
  assert.equal(small.maxNeurons, 20_000);
  assert.equal(lib.parseArgs(['--suite', 'slash']).maxNeurons, 100_000);
  assert.equal(lib.parseArgs(['--suite', 'slash']).routes, false);
  assert.throws(() => lib.parseArgs(['--smal']));
  assert.throws(() => lib.parseArgs(['--max-neurons', '1e9']));
  assert.equal(lib.watches(['packages/slash/eval/**', 'apps/worker/src/inference.ts'], 'packages/slash/eval/run.ts'), true);
  assert.equal(lib.watches(['apps/worker/src/inference.ts'], 'apps/worker/src/index.ts'), false);
});

/* ── the runner end to end, against a provider on localhost ───────────────────────────────────────────────────────── */

/**
 * A stand-in for Workers AI that answers by `mode`: `hang` never answers, `unserved` names no such model, `refused` turns the
 * token away, `good` answers the schema, and `object` answers the text row with `response` an object, which the Worker reads as no text.
 */
async function provider(mode) {
  const asked = [];
  const server = createServer((req, res) => {
    asked.push(req.url);
    if (mode === 'hang') return;
    if (mode === 'refused') {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: false, errors: [{ message: 'Authentication error' }] }));
    }
    if (mode === 'unserved') {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: false, errors: [{ message: 'No such model @cf/zai-org/glm-5.3-flash' }] }));
    }
    const content = JSON.stringify({ lines: { bills: 'Two bills are due this week.' } });
    const usage = { prompt_tokens: 60, completion_tokens: 12 };
    const text = req.url.includes('llama') ? { response: mode === 'object' ? JSON.parse(content) : content, usage } : null;
    const result = text ?? { choices: [{ message: { content }, finish_reason: 'stop' }], usage };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, result }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const close = () => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  };
  return { base: `http://127.0.0.1:${server.address().port}`, asked, close };
}

/** One run of `run.mjs`, its exit code, what it printed and the report it wrote. */
function run(argv, env) {
  const out = join(mkdtempSync(join(tmpdir(), 'model-checks-')), 'report.json');
  const clean = { ...process.env, GITHUB_ACTIONS: '' };
  delete clean.MODEL_CHECK_TOKEN;
  delete clean.MODEL_CHECK_ACCOUNT;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runner, ...argv, '--out', out], { env: { ...clean, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let said = '';
    child.stdout.on('data', (d) => (said += d));
    child.stderr.on('data', () => {});
    child.on('close', (code) => resolve({ code, said, report: JSON.parse(readFileSync(out, 'utf8')) }));
  });
}

const fast = (base) => ({ MODEL_CHECK_BASE: base, MODEL_CHECK_TOKEN: 'test-token-not-real', MODEL_CHECK_ACCOUNT: 'acct0000', MODEL_CHECK_TIMEOUT_MS: '150', MODEL_CHECK_WAIT_MS: '1' });

test('no token: one warning line, not measured, exit 0, nothing asked', async () => {
  const got = await run(['--small'], {});
  assert.equal(got.code, 0);
  assert.equal(got.report.outcome, lib.NONE);
  assert.equal(got.report.reason, lib.NO_TOKEN);
  assert.deepEqual(got.said.trim().split('\n'), ['warning: not measured: MODEL_CHECK_TOKEN and MODEL_CHECK_ACCOUNT are not set, so no model was asked']);
});

test('a provider that times out on every route is not measured, exit 0, and asked three times each', async () => {
  const p = await provider('hang');
  try {
    const got = await run(['--routes'], fast(p.base));
    assert.equal(got.code, 0, got.said);
    assert.equal(got.report.outcome, lib.NONE);
    assert.equal(got.report.reason, lib.NO_ANSWER);
    for (const r of got.report.routes) assert.equal(r.tries, 3);
    assert.ok(!got.said.includes('test-token-not-real') && !JSON.stringify(got.report).includes('acct0000'), 'the token and the account stay out');
  } finally {
    await p.close();
  }
});

test('a provider that times out under a suite leaves it not measured, never red', async () => {
  const p = await provider('hang');
  try {
    const got = await run(['--suite', 'slash', '--small'], { ...fast(p.base), SLASH_EVAL_TIMEOUT_MS: '150' });
    assert.equal(got.code, 0, got.said);
    assert.equal(got.report.suites.slash.outcome, lib.NONE);
    assert.equal(got.report.suites.slash.reason, lib.NO_ANSWER, 'the harness ran and the provider was silent');
    for (const c of got.report.suites.slash.cases) assert.deepEqual([c.verdict, c.tries], ['none', 3]);
  } finally {
    await p.close();
  }
});

test('the record harness timing out is not measured too, in its own words', async () => {
  const p = await provider('hang');
  try {
    const got = await run(['--suite', 'record', '--small'], { ...fast(p.base), DRAFT_EVAL_TIMEOUT_MS: '150' });
    assert.equal(got.code, 0, got.said);
    assert.equal(got.report.suites.record.outcome, lib.NONE);
    assert.equal(got.report.suites.record.reason, lib.NO_ANSWER);
  } finally {
    await p.close();
  }
});

test('a routed id the provider does not serve is red, exit 1', async () => {
  const p = await provider('unserved');
  try {
    const got = await run(['--routes'], fast(p.base));
    assert.equal(got.code, 1, got.said);
    assert.equal(got.report.outcome, lib.BELOW);
    assert.equal(got.report.routes[0].served, false);
    assert.match(got.report.routes[0].said, /No such model/u);
  } finally {
    await p.close();
  }
});

test('every route served with its schema taken is a pass, with its tokens and neurons counted', async () => {
  const p = await provider('good');
  try {
    const got = await run(['--routes', '--scheduled'], fast(p.base));
    assert.equal(got.code, 0, got.said);
    assert.equal(got.report.outcome, lib.PASS);
    for (const r of got.report.routes) {
      assert.equal(r.served, true);
      assert.equal(r.strict, true);
      assert.ok(r.neurons > 0);
    }
    assert.equal(got.report.gateway?.answered, true, 'the production gateway is asked once');
    assert.ok(p.asked.some((u) => u.startsWith('/gateway/v1/acct0000/')));
    assert.equal(got.report.history.at(-1).scheduled, true);
  } finally {
    await p.close();
  }
});

test('a token turned away is not measured and never red, and says so', async () => {
  const p = await provider('refused');
  try {
    const got = await run(['--routes'], fast(p.base));
    assert.equal(got.code, 0, got.said);
    assert.equal(got.report.outcome, lib.NONE);
    assert.equal(got.report.reason, lib.REFUSED);
    assert.match(got.said, /turned MODEL_CHECK_TOKEN away/u);
  } finally {
    await p.close();
  }
});

test('the text row is read as the Worker reads it: an answer it cannot use is red here too', async () => {
  const p = await provider('object');
  try {
    const got = await run(['--routes'], fast(p.base));
    assert.equal(got.code, 1, got.said);
    const llama = got.report.routes.find((r) => r.shape === 'text');
    assert.deepEqual([llama.outcome, llama.served, llama.strict], [lib.BELOW, true, false]);
  } finally {
    await p.close();
  }
});

test('one name missing is named alone in the one warning line', async () => {
  const got = await run(['--small'], { MODEL_CHECK_ACCOUNT: 'acct0000' });
  assert.equal(got.code, 0);
  assert.deepEqual(got.said.trim().split('\n'), ['warning: not measured: MODEL_CHECK_TOKEN is not set, so no model was asked']);
});
