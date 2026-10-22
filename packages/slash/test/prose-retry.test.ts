/**
 * A digest's prose asks a model not reached again, a little later, and walks the host's route (`digestProse`, `jobs.ts`).
 *
 * RED BEFORE THIS. One throw from the model, a gateway's 502 for a second, was the digest's whole ask: the job went down
 * the outbox's ladder, a row a rung. The prose was asked of `llama-3.2-1b` alone though the route names the flash model
 * after it, so a small model that would not answer left every digest without its sentences. And the silent model's
 * half-hourly test wrote a `prose` row each time, read by the vital sign as one more digest the model did not answer.
 *
 * Every model is canned, and the waits are recorded and never slept.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf } from '@braindog/ports';

import { createSlash, type SlashRoute } from '../src/index.ts';
import { PROSE_BACKOFF_MS } from '../src/jobs.ts';
import { NOT_SERVED } from '../src/paused.ts';
import { canned, fakeRecord, fixedClock, NOW, openSqlite, type Canned } from './double.ts';

const DIGEST = { digest: 'weekly', name: 'The week', text: 'late: 2\npaid: 1' };
const PROSE = JSON.stringify({ text: 'Two things are late. One is paid.' });

type Row = { kind: string; model: string; status: string; code: string | null; purpose: string; spends: string; candidate: string | null };

const build = (route?: (small: Canned, flash: Canned) => SlashRoute) => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const inference = canned();
  const small = canned();
  const flash = canned();
  const waited: number[] = [];
  const slash = createSlash(
    { sql, clock, inference, record: fakeRecord() },
    { route: route?.(small, flash), wait: async (ms) => void waited.push(ms) },
  );
  const rows = () => sql.all<Row>('SELECT kind, model, status, code, purpose, spends, candidate FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  return { sql, inference, small, flash, slash, waited, rows };
};

test('A MODEL NOT REACHED IS ASKED AGAIN AFTER A WAIT, AND THE ASK IS ONE ROW', async () => {
  const b = build();
  try {
    b.inference.say(new Error('502 Bad Gateway'));
    b.inference.say(PROSE);
    assert.deepEqual(await b.slash.digestProse(DIGEST), { ok: true, value: { text: 'Two things are late. One is paid.' } });
    assert.deepEqual(b.waited, [PROSE_BACKOFF_MS[0]]);
    assert.equal(b.inference.seen.length, 2);
    assert.deepEqual(b.rows().map((r) => [r.purpose, r.status, r.code]), [['prose', 'ok', null]]);
  } finally {
    b.sql.close();
  }
});

test('A MODEL STILL NOT REACHED AFTER EVERY RETRY IS ONE UNREACHABLE ROW, and the job is held for the ladder', async () => {
  const b = build();
  try {
    for (let i = 0; i <= PROSE_BACKOFF_MS.length; i++) b.inference.say(new Error('504 from the gateway'));
    const out = await b.slash.digestProse(DIGEST);
    assert.equal(codeOf(out), 'UNREACHABLE');
    assert.deepEqual(b.waited, [...PROSE_BACKOFF_MS]);
    assert.equal(b.inference.seen.length, PROSE_BACKOFF_MS.length + 1);
    assert.deepEqual(b.rows().map((r) => [r.purpose, r.code, r.spends]), [['prose', 'UNREACHABLE', 'none']]);
  } finally {
    b.sql.close();
  }
});

test('WHAT A WAIT CANNOT MEND IS NOT RETRIED: a call never sent, an answer that broke, a ceiling, a model not served', async () => {
  const cases: [string, Error][] = [
    ['never sent', Object.assign(new Error('over the ceiling'), { sent: false })],
    ['answered', Object.assign(new Error('half an object'), { answered: true, usage: { in: 10, out: 120 } })],
    ['ceiling', Object.assign(new Error('spent'), { code: 'SLASH_BUDGET_SPENT', sent: false })],
    ['not served', Object.assign(new Error(NOT_SERVED), { why: NOT_SERVED, reached: true })],
  ];
  for (const [name, thrown] of cases) {
    const b = build();
    try {
      b.inference.say(thrown);
      await b.slash.digestProse(DIGEST);
      assert.equal(b.inference.seen.length, 1, `${name} was asked again`);
      assert.deepEqual(b.waited, [], name);
    } finally {
      b.sql.close();
    }
  }
});

test('THE ROUTE IS WALKED: the small model not reached after its retries, and the flash model after it answers', async () => {
  const b = build((small, flash) => () => [
    { id: 'small', model: 'llama-3.2-1b', inference: small },
    { id: 'flash', model: 'glm-5.3-flash', inference: flash },
  ]);
  try {
    for (let i = 0; i <= PROSE_BACKOFF_MS.length; i++) b.small.say(new Error('the provider did not answer'));
    b.flash.say(PROSE);
    const out = await b.slash.digestProse(DIGEST);
    assert.deepEqual(out, { ok: true, value: { text: 'Two things are late. One is paid.' } });
    assert.equal(b.flash.seen[0]?.model, 'glm-5.3-flash');
    /* ONE ROW AN ATTEMPT THE WALK MADE, as `core.run` writes them: the passed-over one under its own model, spending nothing. */
    assert.deepEqual(b.rows().map((r) => [r.candidate, r.model, r.status, r.code, r.spends]), [
      ['small', 'llama-3.2-1b', 'error', 'UNREACHABLE', 'none'],
      ['flash', 'glm-5.3-flash', 'ok', null, 'background'],
    ]);
  } finally {
    b.sql.close();
  }
});

test('A MODEL NOT SERVED IS PASSED OVER AT ONCE, with no wait, for the next candidate', async () => {
  const b = build((small, flash) => () => [
    { id: 'small', model: 'llama-3.2-1b', inference: small },
    { id: 'flash', model: 'glm-5.3-flash', inference: flash },
  ]);
  try {
    b.small.say(Object.assign(new Error(NOT_SERVED), { why: NOT_SERVED, reached: true }));
    b.flash.say(PROSE);
    assert.equal((await b.slash.digestProse(DIGEST)).ok, true);
    assert.deepEqual(b.waited, []);
    assert.equal(b.small.seen.length, 1);
  } finally {
    b.sql.close();
  }
});

test("THE SILENT MODEL'S TEST IS A PROBE: asked once, its row `probe` spending nothing, and never a digest's", async () => {
  const b = build();
  try {
    b.inference.say(new Error('502 Bad Gateway'));
    const out = await b.slash.digestProse({ digest: 'model-test', name: 'A test', text: 'One task closed.', probe: true });
    assert.equal(codeOf(out), 'UNREACHABLE');
    assert.equal(b.inference.seen.length, 1, 'a test is asked again in half an hour, not now');
    assert.deepEqual(b.waited, []);
    assert.deepEqual(b.rows().map((r) => [r.kind, r.purpose, r.spends]), [['prose', 'probe', 'none']]);

    b.inference.say(PROSE);
    assert.equal((await b.slash.digestProse({ digest: 'model-test', name: 'A test', text: 'One task closed.', probe: true })).ok, true);
    assert.deepEqual(b.rows().map((r) => [r.purpose, r.status, r.spends]).at(-1), ['probe', 'ok', 'none']);
  } finally {
    b.sql.close();
  }
});
