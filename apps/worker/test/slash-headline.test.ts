/**
 * The page headlines on the Worker (`src/slash.ts`): the daily look's one ask for the line at the top of each page, through
 * the included model and through his own key, whichever he chose.
 *
 * BEFORE THIS, NEITHER MODEL THE WORKER BUILDS HAD `headline`, so the record's `slashHeadlines` read `!model?.headline`
 * and every page on the Cloud kept its rules line, while the self-host's endpoint wrote one. The binding is a local
 * function and the endpoint a test double; nothing leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLASH_HEADLINE_INSTRUCTIONS } from '@braindog/host/slash';
import type { HeadlineInput } from '@braindog/record';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { workerSlashModel } from '../src/slash.ts';

const FAKE_KEK = '0'.repeat(64);
const GRANT = 'g_his';
const HIS_TOKEN = 'provider-token-for-this-test';
const BASE = 'https://gateway.example.test/v1';

/** One page with a lead line, as the record hands it: its rules line and the figures it shows now. */
const INPUT: HeadlineInput = {
  today: '2026-10-02',
  pages: [{ page: 'money', title: 'Money', rules: 'Two bills are due this week.', figures: [{ id: 'bills-due', value: '2', change: '+1' }] }],
};
const LINES = '{"lines":{"money":"Two bills are due this week, one more than last week."}}';

/** Workers AI's `run`, answering each queued completion once. */
const fakeAi = (answers: string[]) => {
  const runs: { inputs: Record<string, unknown> }[] = [];
  return {
    runs,
    AI: {
      run: async (_model: string, inputs: Record<string, unknown>) => {
        runs.push({ inputs });
        return { choices: [{ message: { role: 'assistant', content: answers.shift() ?? '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 30 } };
      },
    },
  };
};

const switchedOn = (ai: ReturnType<typeof fakeAi>) => ({ AI: ai.AI, AI_GATEWAY: 'braindog', SLASH_INCLUDED: 'yes' });
const noGrants = () => ({ kernel: { grants: () => [] } }) as never;
const hisVault = () => ({ kernel: { grants: () => [{ id: GRANT, label: 'model provider', kind: 'api_token', revoked_at: null }] } }) as never;

/** Slash's own store, on the included model until `tier` says `b`. */
const slashStore = (tier: 'a' | 'b') => {
  const store = openSqlite();
  store.exec('CREATE TABLE slash_settings (singleton INTEGER PRIMARY KEY, tier TEXT, model TEXT, grant_id TEXT, ask_cap INTEGER, updated_at TEXT)');
  store.exec('CREATE TABLE slash_meta (key TEXT PRIMARY KEY, value TEXT)');
  store.exec("INSERT INTO slash_settings VALUES (1, ?, 'his-model', ?, 80, '2026-10-01T09:00:00.000Z')", tier, GRANT);
  store.exec("INSERT INTO slash_meta VALUES ('own.provider', 'openai'), ('own.base_url', ?)", BASE);
  return store;
};

test('THE INCLUDED MODEL WRITES THE HEADLINES: one run, told the headline rules, held to an answer with lines', async () => {
  const ai = fakeAi([LINES]);
  const model = workerSlashModel(switchedOn(ai), noGrants);
  assert.ok(model?.headline, 'the included model writes no headlines, so every page keeps its rules line');
  assert.deepEqual(await model.headline(INPUT), JSON.parse(LINES));
  assert.equal(ai.runs.length, 1);
  const messages = ai.runs[0]!.inputs['messages'] as { role: string; content: string }[];
  assert.equal(messages[0]!.content, SLASH_HEADLINE_INSTRUCTIONS);
  assert.deepEqual(JSON.parse(messages[1]!.content), INPUT);
  const format = ai.runs[0]!.inputs['response_format'] as { json_schema?: { schema?: { required?: string[] } } } | undefined;
  assert.deepEqual(format?.json_schema?.schema?.required, ['lines'], 'the headline ask was not held to its own schema');
});

test('HIS OWN KEY WRITES THEM WHEN HE CHOSE IT, and the same model goes back to the included one when he switches', async () => {
  const ai = fakeAi([LINES]);
  const store = slashStore('b');
  const sent: { url: string; authorization: string | null; system: string }[] = [];
  const model = workerSlashModel({ ...switchedOn(ai), KEK: FAKE_KEK }, hisVault, {
    store: () => store,
    send: async (url, init) => {
      const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
      sent.push({ url: String(url), authorization: new Headers(init.headers).get('authorization'), system: body.messages[0]!.content });
      return new Response(JSON.stringify({ choices: [{ message: { content: LINES } }] }), { status: 200 });
    },
    open: () => async () => HIS_TOKEN,
  });
  assert.deepEqual(await model!.headline!(INPUT), JSON.parse(LINES));
  assert.deepEqual(sent, [{ url: `${BASE}/chat/completions`, authorization: `Bearer ${HIS_TOKEN}`, system: SLASH_HEADLINE_INSTRUCTIONS }]);
  assert.equal(ai.runs.length, 0, 'the included model wrote a headline for a record set to its own key');

  store.exec("UPDATE slash_settings SET tier = 'a' WHERE singleton = 1");
  await model!.headline!(INPUT);
  assert.equal(ai.runs.length, 1);
  assert.equal(sent.length, 1);
  store.close();
});

test('NO MODEL TO ASK IS NOTHING SENT: the record releases its hold and each page keeps its rules line', async () => {
  const store = slashStore('a');
  const sent: string[] = [];
  const model = workerSlashModel({ KEK: FAKE_KEK }, noGrants, { store: () => store, send: async (url) => (sent.push(String(url)), new Response('{}')) });
  const thrown = await model!.headline!(INPUT).then(
    () => null,
    (e: unknown) => e as { sent?: unknown; message: string },
  );
  assert.equal(thrown?.sent, false, 'a headline with no model was not marked as never sent');
  assert.match(thrown?.message ?? '', /Pick your key in Settings/u);
  assert.deepEqual(sent, []);
  store.close();
});
