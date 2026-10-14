/**
 * An embedding on the Cloud is one ledger row (ENG-B18 job 1). `workerModelJobs`'s `embed` once called `aiInference`
 * straight, past the engine, so no `slash_call` row was written and the month's embed count read 0 whatever was sent.
 * It now goes through the engine's `embedTexts`, over the same `AI` binding (`slash.ts` `embedOver`), and each call is a
 * row of kind `embed`, purpose `embed`, spending `background`, which `backgroundMeter` counts and the operator's ceiling
 * leaves out, as `slash-meter.ts` does.
 *
 * AND A SEARCH'S WORDS GO THE SAME WAY (`workerMeaning`): one row for a query, and none for the same query again.
 *
 * Over a real SQLite and a local `AI.run` that answers the embedding model `{ data: [[...floats]] }`; no neuron is spent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { backgroundMeter } from '@braindog/host/model-jobs';
import type { Status } from '@braindog/slash';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { EMBED_MODEL } from '../src/inference.ts';
import { workerMeaning, workerModelJobs } from '../src/slash-jobs.ts';
import { includedCeilingReached, workerSlashEngine } from '../src/slash.ts';

const T0 = Date.UTC(2026, 9, 14, 9);
const MONTH = new Date(Date.UTC(2026, 9, 1)).toISOString();
const clock = { now: () => T0 };

/* NO GRANTS, AND NO PREF SET: the switch for Slash reading on its own left on, as a new record has it. */
const noGrants = () => ({ kernel: { grants: () => [], prefsOf: () => ({}) } }) as never;

/** Workers AI's `run`, answering the embedding model with one row of floats for each text, and keeping each call's model. */
const fakeAi = () => {
  const runs: string[] = [];
  return {
    runs,
    AI: {
      run: async (model: string, inputs: { text?: string[] }) => {
        runs.push(model);
        if (model !== EMBED_MODEL) return { choices: [{ message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } };
        return { data: (inputs.text ?? []).map(() => [0.1, -0.2, 0.3, 0.4]) };
      },
    },
  };
};

/* A CEILING OF THREE ASKS at the package's worst call, so five embeddings counted against it would reach it. */
const envOf = (ai: ReturnType<typeof fakeAi>) => ({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes', SLASH_INCLUDED_MONTH_NEURONS: '696' });

type Call = { kind: string; purpose: string; spends: string; model: string };
const rows = (sql: ReturnType<typeof openSqlite>): Call[] =>
  sql.all<Call>('SELECT kind, purpose, spends, model FROM slash_call ORDER BY ts, id').map((r) => ({ ...r }));

test('AN EMBEDDING ON THE CLOUD IS ONE LEDGER ROW: two vectors, one `embed` row spending the background, counted by its meter', async () => {
  const ai = fakeAi();
  const sql = openSqlite();
  const jobs = workerModelJobs(envOf(ai), noGrants, { sql, clock });
  assert.ok(jobs?.embed, 'a Worker with the AI binding offered no embedding');

  const got = await jobs.embed(['a', 'b']);
  assert.ok(got.ok, 'the embedding was refused');
  assert.equal(got.value.vectors.length, 2);
  assert.equal(got.value.dims, 4);
  assert.deepEqual([...got.value.vectors[0]!], [13, -25, 38, 51]);
  assert.deepEqual(ai.runs, [EMBED_MODEL]);
  assert.deepEqual(rows(sql), [{ kind: 'embed', purpose: 'embed', spends: 'background', model: EMBED_MODEL }]);
  assert.equal(backgroundMeter(sql).of!('embed').spent(MONTH), 1);
});

test("FIVE EMBEDDINGS LEAVE THE OPERATOR'S CEILING AND HIS ASKS AS THEY WERE", async () => {
  const ai = fakeAi();
  const sql = openSqlite();
  const env = envOf(ai);
  const jobs = workerModelJobs(env, noGrants, { sql, clock });
  const engine = await workerSlashEngine(env, noGrants, { sql, clock });
  assert.ok(engine);
  const before = (engine.status() as Status).asks;
  assert.equal(await includedCeilingReached(env, { sql, clock }), false);

  for (let i = 0; i < 5; i++) assert.ok((await jobs!.embed!([`text ${i}`])).ok);
  assert.equal(rows(sql).length, 5);
  assert.equal(await includedCeilingReached(env, { sql, clock }), false, 'five embeddings reached a ceiling of three asks');
  assert.deepEqual((engine.status() as Status).asks, before);
});

test('NO AI BINDING, NO EMBED', () => {
  assert.equal(workerModelJobs({}, noGrants, { sql: openSqlite(), clock })?.embed, undefined);
});

test("A SEARCH'S WORDS ARE ONE ROW, AND THE SAME WORDS AGAIN ARE NONE", async () => {
  const ai = fakeAi();
  const sql = openSqlite();
  const jobs = workerModelJobs(envOf(ai), noGrants, { sql, clock });
  const meaning = workerMeaning(jobs, sql, () => true, clock.now);
  assert.ok(meaning, 'a Worker that embeds offered no search by meaning');

  const got = await meaning('vehicle cover');
  assert.ok(got.ok, 'the query was not embedded');
  assert.equal(got.vector.dims, 4);
  assert.equal(got.vector.vec.length, 4);
  assert.deepEqual(rows(sql), [{ kind: 'embed', purpose: 'embed', spends: 'background', model: EMBED_MODEL }]);

  assert.ok((await meaning('Vehicle  Cover')).ok);
  assert.equal(rows(sql).length, 1, 'the same query was asked twice');

  /* HIS SWITCH OFF SENDS NOTHING AND WRITES NOTHING. */
  const off = workerMeaning(jobs, sql, () => false, clock.now);
  assert.deepEqual(await off!('car insurance'), { ok: false, why: 'off' });
  assert.equal(rows(sql).length, 1);
  assert.equal(workerMeaning(undefined, sql, () => true), undefined);
});
