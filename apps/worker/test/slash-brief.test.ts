/**
 * The briefing on the Worker (`src/slash.ts`, ENG-B12 job 5): the one ask for Today's cards, through the included model
 * and through his own key, whichever he chose.
 *
 * BEFORE THIS, THE WORKER'S MODEL OBJECT HAD NO `brief`. It lists its asks one by one, so whatever the host's adapters
 * learned, a record on the Cloud read `!model?.brief` and its briefing stayed the rules' for ever. The binding is a local
 * function and the endpoint a test double; nothing leaves the machine and no key is real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SLASH_BRIEF_INSTRUCTIONS, SLASH_COMPOSE_INSTRUCTIONS } from '@braindog/host/slash';
import type { HeadlineInput } from '@braindog/record';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { LOOK, includedModel, workerSlashModel, type ModelFail } from '../src/slash.ts';

const FAKE_KEK = '0'.repeat(64);
const GRANT = 'g_his';
const HIS_TOKEN = 'provider-token-for-this-test';
const BASE = 'https://gateway.example.test/v1';

/** Three things to brief him on, as the record hands them: a handle, a kind, a title and the figures a line may name. */
const INPUT = {
  today: '2026-10-14',
  most: 7,
  facts: [
    { h: 'a', kind: 'late', title: 'Studio rent', figures: { days: '3', amount: 'EGP 12,000' } },
    { h: 'b', kind: 'asked', title: 'Which card pays the hosting bill', figures: { waiting: '2' } },
    { h: 'c', kind: 'step', title: 'Import the September statement', figures: {} },
  ],
};
const CARDS = '{"cards":[{"h":"a","line":"Studio rent is {{days}} days late, {{amount}}."},{"h":"c","line":"The September statement is next."}]}';

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
const hisKeychain = () => ({ kernel: { grants: () => [{ id: GRANT, label: 'model provider', kind: 'api_token', revoked_at: null }] } }) as never;

/** Slash's own store, on the included model until `tier` says `b`. */
const slashStore = (tier: 'a' | 'b') => {
  const store = openSqlite();
  store.exec('CREATE TABLE slash_settings (singleton INTEGER PRIMARY KEY, tier TEXT, model TEXT, grant_id TEXT, ask_cap INTEGER, updated_at TEXT)');
  store.exec('CREATE TABLE slash_meta (key TEXT PRIMARY KEY, value TEXT)');
  store.exec("INSERT INTO slash_settings VALUES (1, ?, 'his-model', ?, 80, '2026-10-01T09:00:00.000Z')", tier, GRANT);
  store.exec("INSERT INTO slash_meta VALUES ('own.provider', 'openai'), ('own.base_url', ?)", BASE);
  return store;
};

/** What an ask threw, or null where it answered. */
const thrownBy = (ask: Promise<unknown>) =>
  ask.then(
    () => null,
    (e: unknown) => e as { sent?: unknown; message: string },
  );

test('THE INCLUDED MODEL WRITES THE BRIEFING: one run, told the briefing rules, held to an answer with cards', async () => {
  const ai = fakeAi([CARDS]);
  const model = includedModel(switchedOn(ai));
  assert.ok(model?.brief, 'the included model writes no briefing, so Today on the Cloud stays the rules');
  assert.deepEqual(await model.brief(INPUT), JSON.parse(CARDS));
  assert.equal(ai.runs.length, 1);
  const messages = ai.runs[0]!.inputs['messages'] as { role: string; content: string }[];
  assert.equal(messages[0]!.content, SLASH_BRIEF_INSTRUCTIONS);
  assert.deepEqual(JSON.parse(messages[1]!.content), INPUT);
  const format = ai.runs[0]!.inputs['response_format'] as { json_schema?: { schema?: { required?: string[]; properties?: Record<string, { type?: string }> } } } | undefined;
  assert.deepEqual(format?.json_schema?.schema?.required, ['cards'], 'the briefing ask was not held to its own schema');
  assert.equal(format?.json_schema?.schema?.properties?.['cards']?.type, 'array');
});

test('AN ANSWER WITH NO CARDS IS A THROW, which the record reads as the rules speaking', async () => {
  const ai = fakeAi(['{"lines":{}}']);
  const thrown = await thrownBy(includedModel(switchedOn(ai))!.brief!(INPUT));
  assert.ok(thrown, 'an answer that broke the briefing schema was handed to the record');
  assert.equal(ai.runs.length, 1);
});

test('A BRIEFING PAST THE WORST ASK IS NEVER SENT, and throws as a headline past it does', async () => {
  /* The ceiling counts every call at the package's worst, 12,000 tokens in. Thirty titles of 20,000 characters are far past it. */
  const long = { ...INPUT, facts: Array.from({ length: 30 }, (_, i) => ({ h: `f${i}`, kind: 'due', title: 'bill '.repeat(4_000), figures: {} })) };
  const pages: HeadlineInput = { today: '2026-10-14', pages: long.facts.map((f) => ({ page: f.h, title: f.title, rules: f.title, figures: [] })) };
  const ai = fakeAi([CARDS, CARDS]);
  const fails: ModelFail[] = [];
  const model = includedModel(switchedOn(ai), (f) => fails.push(f))!;
  const brief = await thrownBy(model.brief!(long));
  const headline = await thrownBy(model.headline!(pages));
  assert.equal(ai.runs.length, 0, 'a briefing past the worst ask reached the binding');
  assert.equal(brief?.sent, false, 'a briefing past the worst ask was not marked as never sent');
  /* The same sentence, each with its own size: the two inputs are not the same length. */
  const sized = (said: string | undefined) => said?.replace(/about [0-9]+ neurons/u, 'about N neurons');
  assert.match(brief?.message ?? '', /would spend about [0-9]+ neurons and its ceiling is 232\./u);
  assert.equal(sized(brief?.message), sized(headline?.message), 'the briefing is turned away in other words than a headline');
  assert.equal(headline?.sent, false);
  assert.deepEqual(fails, [], 'the ceiling saying no was told to the operator as a model that failed');
});

test('THROUGH THE CHOICE: the included model by default, his own key when he chose it, and back again', async () => {
  const ai = fakeAi([CARDS, CARDS]);
  const store = slashStore('a');
  const sent: { url: string; authorization: string | null; system: string; user: unknown }[] = [];
  const model = workerSlashModel({ ...switchedOn(ai), KEK: FAKE_KEK }, hisKeychain, {
    store: () => store,
    send: async (url, init) => {
      const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
      sent.push({ url: String(url), authorization: new Headers(init.headers).get('authorization'), system: body.messages[0]!.content, user: JSON.parse(body.messages[1]!.content) });
      return new Response(JSON.stringify({ choices: [{ message: { content: CARDS } }] }), { status: 200 });
    },
    open: () => async () => HIS_TOKEN,
  });
  assert.ok(model?.brief, 'the Worker hands the record a model with no briefing');
  assert.deepEqual(await model.brief(INPUT), JSON.parse(CARDS));
  assert.equal(ai.runs.length, 1);
  assert.deepEqual(sent, []);

  store.exec("UPDATE slash_settings SET tier = 'b' WHERE singleton = 1");
  assert.deepEqual(await model.brief(INPUT), JSON.parse(CARDS));
  assert.deepEqual(sent, [{ url: `${BASE}/chat/completions`, authorization: `Bearer ${HIS_TOKEN}`, system: SLASH_BRIEF_INSTRUCTIONS, user: INPUT }]);
  assert.equal(ai.runs.length, 1, 'the included model wrote a briefing for a record set to its own key');
  store.close();
});

test('NO MODEL TO ASK IS NOTHING SENT, in a sentence: the record releases its hold and the rules write the cards', async () => {
  const store = slashStore('a');
  const sent: string[] = [];
  const model = workerSlashModel({ KEK: FAKE_KEK }, noGrants, { store: () => store, send: async (url) => (sent.push(String(url)), new Response('{}')) });
  const thrown = await thrownBy(model!.brief!(INPUT));
  assert.equal(thrown?.sent, false, 'a briefing with no model was not marked as never sent');
  assert.match(thrown?.message ?? '', /Pick your key in Settings/u);
  assert.deepEqual(sent, []);
  store.close();
});

test('A CHOSEN MODEL THAT WRITES NO BRIEFING IS NEVER SENT, and says so in a sentence', () => {
  /* Read as text, as `slash.test.ts` reads this file: both adapters write a briefing today, so no choice reaches the
     branch, and it is the branch that keeps a provider added later from being asked for what it cannot write. */
  const source = readFileSync(new URL('../src/slash.ts', import.meta.url), 'utf8');
  const brief = /brief: async \(input\) => \{[\s\S]*?\n    \},/u.exec(source)?.[0] ?? '';
  assert.match(brief, /const model = chosen\(\);/u, 'the briefing does not go through the choice of model');
  assert.match(brief, /if \(model\.brief === undefined\) throw new NotSent\('The model Slash answers with here writes no briefing\.'\);/u);
});

test('ON HIS OWN KEY A BRIEFING THAT FAILS IS TOLD TO THE OPERATOR AS HIS, as a headline is, and thrown', async () => {
  const ai = fakeAi([CARDS]);
  const store = slashStore('b');
  const fails: ModelFail[] = [];
  const model = workerSlashModel({ ...switchedOn(ai), KEK: FAKE_KEK }, hisKeychain, {
    store: () => store,
    send: async () => new Response('upstream is down', { status: 503 }),
    open: () => async () => HIS_TOKEN,
    onFail: (f) => fails.push(f),
  });
  const brief = await thrownBy(model!.brief!(INPUT));
  assert.ok(brief, 'a briefing his provider refused was answered');
  assert.equal(ai.runs.length, 0, 'the included model answered for a key that failed');
  const headline = await thrownBy(model!.headline!({ today: '2026-10-14', pages: [] }));
  assert.ok(headline);
  assert.equal(fails.length, 2, 'a failing briefing on his key was not told');
  const [first, second] = fails;
  assert.deepEqual(first, second, 'a failing briefing is told in other words than a failing headline');
  assert.deepEqual(
    { model: first!.model, provider: first!.provider, why: first!.why, sent: first!.sent, whose: first!.whose, streak: first!.streak },
    { model: 'his-model', provider: 'openai', why: 'your key did not answer', sent: true, whose: 'owner', streak: 0 },
  );
  store.close();
});

test('A PAGE MAY BE ANSWERED AS AN OBJECT: the headline schema lets `lead`, `order`, `hide` and `next` through', async () => {
  /* ENG-B09 job 7: a page handed its blocks is answered whole, and the Cloud's schema must not flatten it to a line. */
  const composed = {
    lines: {
      money: { lead: 'Two bills are due this week.', order: ['bills', 'cash', 'renewals'], hide: ['renewals'], next: { row: 'r1', text: 'Pay the studio rent' } },
      today: 'Nothing is late.',
    },
  };
  const ai = fakeAi([JSON.stringify(composed)]);
  const input: HeadlineInput = { today: '2026-10-14', pages: [{ page: 'money', title: 'Money', rules: 'Two bills are due this week.', figures: [] }] };
  assert.deepEqual(await includedModel(switchedOn(ai))!.headline!(input), composed);
  const messages = ai.runs[0]!.inputs['messages'] as { content: string }[];
  assert.equal(messages[0]!.content, SLASH_COMPOSE_INSTRUCTIONS);
  const format = ai.runs[0]!.inputs['response_format'] as { json_schema?: { schema?: unknown } } | undefined;
  assert.deepEqual(format?.json_schema?.schema, LOOK, 'the page looks were not asked under the look schema');
});
