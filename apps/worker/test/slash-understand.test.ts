/**
 * Who is who on the Worker (`src/slash-jobs.ts`, `src/slash-meter.ts`): the model-jobs pass's two asks, the doubtful
 * pairs of `infer.resolve` and the night's notes, over the record's own model and held in this object's ledger.
 *
 * BEFORE THIS, `workerModelJobs` HAD NEITHER, so an `infer.resolve` job waited `pending` for ever on the Cloud and the
 * notes were never read, while the self-host's endpoint answered both. Each ask is one background row under
 * `UNDERSTAND_ASK`, and the operator's ceiling binds it as it binds a press: at a ceiling of 0 nothing reaches the binding.
 * The binding is a local function; nothing leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLASH_MENTIONS_INSTRUCTIONS, SLASH_RESOLVE_INSTRUCTIONS, UNDERSTAND_ASK } from '@braindog/host/understand';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { workerModelJobs } from '../src/slash-jobs.ts';

/** Workers AI's `run`, answering each queued completion once and keeping what it was told. */
const fakeAi = (answers: string[]) => {
  const runs: { system: string }[] = [];
  return {
    runs,
    AI: {
      run: async (_model: string, inputs: { messages: { role: string; content: string }[] }) => {
        runs.push({ system: inputs.messages.find((m) => m.role === 'system')?.content ?? '' });
        return { choices: [{ message: { role: 'assistant', content: answers.shift() ?? '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 30 } };
      },
    },
  };
};

/* NO GRANTS, AND NO PREF SET: the switch for Slash reading on its own (`slash.reads`) left on, as a new record has it. */
const noGrants = () => ({ kernel: { grants: () => [], prefsOf: () => ({}) } }) as never;
const clock = { now: () => Date.UTC(2026, 9, 6, 9) };

const PAIRS = {
  pairs: [{ id: 'p1', a: { name: 'Ada Lovelace', kind: 'person' as const, domain: 'kiln.example' }, b: { name: 'Ada L.', kind: 'person' as const, domain: 'kiln.example' } }],
};
const NOTES = { notes: [{ id: 'n1', about: 'Kiln', kind: 'organisation' as const, text: 'Ada Lovelace runs the books at Kiln.' }] };

test('THE INCLUDED MODEL JUDGES A PAIR AND READS A NOTE, each one background row under UNDERSTAND_ASK', async () => {
  const ai = fakeAi(['{"verdicts":{"p1":0.9}}', '{"mentions":[]}']);
  const sql = openSqlite();
  const jobs = workerModelJobs({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' }, noGrants, { sql, clock });
  assert.ok(jobs?.resolve && jobs.mentions, 'a Worker with a model offered no reading of who is who');

  const judged = await jobs.resolve(PAIRS);
  assert.deepEqual(judged, { ok: true, value: { verdicts: { p1: 0.9 } } });
  const read = await jobs.mentions(NOTES);
  assert.deepEqual(read, { ok: true, value: { mentions: [] } });

  assert.deepEqual(
    ai.runs.map((r) => r.system),
    [SLASH_RESOLVE_INSTRUCTIONS, SLASH_MENTIONS_INSTRUCTIONS],
  );
  const rows = sql.all<{ kind: string; question: string; status: string }>('SELECT kind, question, status FROM slash_call ORDER BY ts, id').map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { kind: 'pattern', question: UNDERSTAND_ASK, status: 'ok' },
    { kind: 'pattern', question: UNDERSTAND_ASK, status: 'ok' },
  ]);
});

test('AT AN OPERATOR CEILING OF 0 NOTHING REACHES THE BINDING, and the pair waits on a spent month', async () => {
  const ai = fakeAi(['{"verdicts":{"p1":0.9}}']);
  const sql = openSqlite();
  const jobs = workerModelJobs({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes', SLASH_INCLUDED_MONTH_NEURONS: '0' }, noGrants, { sql, clock });
  assert.ok(jobs?.resolve);

  const judged = await jobs.resolve(PAIRS);
  assert.equal(judged.ok, false);
  assert.equal(!judged.ok && 'refusal' in judged && judged.refusal.code, 'SLASH_BUDGET_SPENT');
  assert.equal(ai.runs.length, 0, 'the operator turned every ask away and the Worker asked who is who anyway');
});

test("HIS OWN MONTH OF ASKS SPENT DOES NOT STOP IT: understanding is the background's, and only the operator's ceiling binds it", async () => {
  const ai = fakeAi(['{"verdicts":{"p1":0.9}}', '{"verdicts":{"p1":0.9}}']);
  const sql = openSqlite();
  const jobs = workerModelJobs({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' }, noGrants, { sql, clock });
  assert.ok(jobs?.resolve);
  assert.equal((await jobs.resolve(PAIRS)).ok, true);

  /* His limit is two and both are spent at the palette, far under the operator's 1,293. */
  sql.exec("INSERT OR REPLACE INTO slash_settings (singleton, tier, ask_cap, updated_at) VALUES (1, 'a', 2, ?)", new Date(clock.now()).toISOString());
  for (const id of ['r1', 'r2'])
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question)
       VALUES (?, ?, 'read', 'a', 'glm-5.3-flash', 10, 10, 1, 1, 'ok', NULL, 'what is due')`,
      id,
      new Date(clock.now()).toISOString(),
    );

  const judged = await jobs.resolve(PAIRS);
  assert.equal(judged.ok, true, 'his own asks being spent turned away a background reading of who is who');
  assert.equal(ai.runs.length, 2);
});

test('NO MODEL IS NO READING: a Worker with nothing to ask offers no jobs at all', () => {
  assert.equal(workerModelJobs({}, noGrants, { sql: openSqlite(), clock }), undefined);
});
