/**
 * A digest's two sentences when the gateway named in `AI_GATEWAY` is not on the account (22 October: "2001: Please
 * configure AI Gateway"). The binding without the gateway answers it; and where that fails too, the ledger and the
 * engine's health say what it failed with, not only the gateway's sentence, while the embedding that still answers does
 * not make the engine "answering". Over a real ledger and a local `AI.run`; no neuron is spent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSlash, engineHealth, engineSaid } from '@braindog/slash';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { EMBED_MODEL } from '../src/inference.ts';
import { includedInference } from '../src/slash.ts';

const T0 = Date.UTC(2026, 9, 22, 20);
const clock = { now: () => T0 };

const GATEWAY = 'AiError: 2001: Please configure AI Gateway in the Cloudflare dashboard';
const DIGEST = { digest: 'weekly-1', name: 'Your week', text: 'Three tasks closed. One invoice went out.' };
const answer = (text: string) => ({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ text }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 8 } });

/** A binding on an account with no gateway: any call that names one throws, and a call that does not goes to `direct`. */
const account = (direct: () => unknown) => {
  const runs: { model: string; gateway: boolean }[] = [];
  return {
    runs,
    AI: {
      run: async (model: string, _inputs: unknown, options?: { gateway?: unknown }) => {
        runs.push({ model, gateway: options?.gateway !== undefined });
        if (options?.gateway !== undefined) throw new Error(GATEWAY);
        return model === EMBED_MODEL ? { data: [[0.1, 0.2, 0.3]] } : direct();
      },
    },
  };
};

const engine = (ai: ReturnType<typeof account>) => {
  const sql = openSqlite();
  const inference = includedInference({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' });
  assert.ok(inference, 'the included model is on');
  /* A RETRY WAITS FOR NOTHING HERE (`SlashOptions.wait`). */
  return { sql, slash: createSlash({ sql, clock, inference, record: {} as never }, { tiers: ['a', 'b'], wait: async () => {} }) };
};

const prose = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ status: string; code: string | null; raw: string | null }>("SELECT status, code, raw FROM slash_call WHERE kind = 'prose' ORDER BY ts, rowid").map((r) => ({ ...r }));

test('A GATEWAY THAT IS NOT THERE: the binding without it writes the digest, and the ledger says it was answered', async () => {
  const ai = account(() => answer('A quiet week.'));
  const { sql, slash } = engine(ai);
  const out = await slash.digestProse(DIGEST);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(out.value.text, 'A quiet week.');
  assert.deepEqual(ai.runs.map((r) => r.gateway), [true, false], 'the gateway once, then the binding without it');
  assert.deepEqual(prose(sql), [{ status: 'ok', code: null, raw: null }]);
  assert.equal(engineHealth(sql, clock, { model: true }).state, 'answering');
});

test('WHERE THE BINDING FAILS WITHOUT THE GATEWAY TOO, THE LEDGER AND HEALTH SAY WHAT IT FAILED WITH, and the embedding answers nothing for the model that writes', async () => {
  const ai = account(() => {
    throw new Error('AiError: 5016: this model needs its terms agreed on the account 123456789012');
  });
  const { sql, slash } = engine(ai);
  for (let i = 0; i < 3; i++) {
    const out = await slash.digestProse(DIGEST);
    assert.equal(out.ok, false);
    /* THE EMBEDDING ANSWERS THROUGH THE SAME TWO PATHS, every time. */
    assert.ok((await slash.embedTexts(['a cup of tea'])).ok);
  }
  const rows = prose(sql);
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.deepEqual({ status: r.status, code: r.code }, { status: 'error', code: 'UNREACHABLE' });
    assert.match(r.raw ?? '', /^AiError: 5016: this model needs its terms agreed/, 'the last path leads');
    assert.match(r.raw ?? '', /gateway said: AiError: 2001: Please configure AI Gateway/, 'and the gateway is said behind it');
    assert.doesNotMatch(r.raw ?? '', /123456789012/);
  }
  const h = engineHealth(sql, clock, { model: true });
  assert.equal(h.state, 'not_answering');
  assert.equal(h.last_ok, null, 'the embedding is not the last answer');
  assert.equal(h.answeredBy, undefined);
  assert.match(h.lastWords ?? '', /^AiError: 5016: this model needs its terms agreed on the account \[cut\]/);
  assert.match(engineSaid(h, T0).text, /^Slash's model has not answered since 22 October\./);
});
