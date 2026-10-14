/**
 * The Cloud's first read (`src/first-read.ts`), through `serveFirstRead` as `/auth/signup/read` will reach it.
 *
 * NO NETWORK AND NO MODEL: Workers AI is a fake binding, the reader is a fake `readSetup` that asks the model it was
 * bound to, and siteverify is a fake `send`. Off as shipped, off with any one part missing, on with all of them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serveFirstRead, FIRST_READ_ADDRESS_SPENT, FIRST_READ_DAY_SPENT, FIRST_READ_OFF } from '@braindog/host/first-read';
import { ok } from '@braindog/ports';

import { PEOPLE } from '../../../fixtures/names.ts';
import { dailyOf, firstReadDoorOf, firstReadOffer, type FirstReadEnv, type MeterStore, type ReadSetup } from '../src/first-read.ts';

const ORIGIN = 'https://cloud.braindog.example';
const NOW = Date.parse('2026-10-14T10:00:00Z');
const SAID = `I'm ${PEOPLE[2]!.name}. I run a small pottery studio and sell at two markets.`;

/** Workers AI answering every completion with one reading, in the chat shape the included model answers in. */
const fakeAi = () => {
  const runs: string[] = [];
  return {
    runs,
    AI: {
      run: async (model: string) => {
        runs.push(model);
        const content = JSON.stringify({ name: PEOPLE[2]!.name, summary: 'A pottery studio.' });
        return { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 400, completion_tokens: 40 } };
      },
    },
  };
};

/** A reader that asks the model it is handed once and answers what it said, as `readSetup` does without its checks. */
const fakeRead: ReadSetup = async (ask, model) => {
  const reply = await model.complete({ model: 'glm-5.3-flash', messages: [{ role: 'user', content: ask.said }], maxTokens: 200, jsonSchema: {} });
  const said = JSON.parse(reply.text) as { name: string; summary: string };
  return ok({ name: said.name, summary: said.summary, usecase: ask.offer.usecases[0]?.id ?? null, also: [], modules: [], currency: null, heard: [], names: [], rows: [], draft: null, by: 'glm-5.3-flash' });
};

/** The Directory's count as the port says it: one more by key and day, within `most`. */
const memoryStore = (): MeterStore & { counts: Map<string, number> } => {
  const counts = new Map<string, number>();
  return {
    counts,
    hit: async (key, day, most) => {
      const n = (counts.get(`${day}|${key}`) ?? 0) + 1;
      counts.set(`${day}|${key}`, Math.min(n, most + 1));
      return n <= most;
    },
  };
};

/** Siteverify, passing every answer but `bad`. */
const verify = async (_input: string, init: RequestInit): Promise<Response> => {
  const answer = (init.body as FormData).get('response');
  return new Response(JSON.stringify({ success: answer !== 'bad' }), { headers: { 'content-type': 'application/json' } });
};

const ask = (ip: string, turnstile = 'good'): Request =>
  new Request(`${ORIGIN}/auth/signup/read`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ said: SAID, today: '2026-10-14', zone: 'Europe/Lisbon', locale: 'en-GB', turnstile }),
  });

const allOn = (ai = fakeAi()): FirstReadEnv => ({ AI: ai.AI, SLASH_INCLUDED: 'yes', FIRST_READ_DAILY: '500', TURNSTILE_SECRET: 'test-secret' });

const door = (env: FirstReadEnv, store: MeterStore | null = memoryStore(), readSetup: ReadSetup | null = fakeRead) =>
  firstReadDoorOf(env, { origin: ORIGIN, readSetup, store, send: verify });

const refusal = async (res: Response) => ((await res.json()) as { refusal: { code: string; fix: string } }).refusal;

test('OFF AS SHIPPED: FIRST_READ_DAILY unset, or 0, answers 501 in the off sentence and the model is never run', async () => {
  for (const daily of [undefined, '0', '', '-3', '2.5', 'lots']) {
    const ai = fakeAi();
    const res = await serveFirstRead(ask('203.0.113.7'), door({ ...allOn(ai), FIRST_READ_DAILY: daily }), NOW);
    assert.equal(res.status, 501, `FIRST_READ_DAILY ${String(daily)} read a stranger's words`);
    assert.deepEqual(await refusal(res), { code: 'NOT_IN_THIS_BUILD', fix: FIRST_READ_OFF });
    assert.equal(ai.runs.length, 0);
  }
  assert.equal(dailyOf('500'), 500);
});

test('OFF WITHOUT A MODEL: no binding, or the included model not switched on, is no reader', async () => {
  for (const env of [{ ...allOn(), AI: undefined }, { ...allOn(), SLASH_INCLUDED: undefined }]) {
    const res = await serveFirstRead(ask('203.0.113.7'), door(env), NOW);
    assert.equal(res.status, 501);
    assert.equal((await refusal(res)).fix, FIRST_READ_OFF);
  }
});

test('OFF WITHOUT A BOT CHECK, A READER OR A COUNT: each missing part is the same 501', async () => {
  const cases = [door({ ...allOn(), TURNSTILE_SECRET: undefined }), door(allOn(), null), door(allOn(), memoryStore(), null)];
  for (const d of cases) assert.equal((await serveFirstRead(ask('203.0.113.7'), d, NOW)).status, 501);
});

test('ON WITH ALL OF IT: the bot check passes, the included model reads, and the reading comes back', async () => {
  const ai = fakeAi();
  const res = await serveFirstRead(ask('203.0.113.7'), door(allOn(ai)), NOW);
  assert.equal(res.status, 200);
  const out = (await res.json()) as { ok: boolean; value: { name: string; usecase: string | null } };
  assert.equal(out.ok, true);
  assert.equal(out.value.name, PEOPLE[2]!.name);
  assert.equal(out.value.usecase, firstReadOffer().usecases[0]!.id, 'the offer did not reach the reader');
  assert.equal(ai.runs.length, 1, 'the included model was not the one asked');
});

test('A FAILED BOT CHECK IS REFUSED BEFORE ANY COUNT OR MODEL', async () => {
  const ai = fakeAi();
  const store = memoryStore();
  const res = await serveFirstRead(ask('203.0.113.7', 'bad'), door(allOn(ai), store), NOW);
  assert.equal(res.status, 403);
  assert.equal(store.counts.size, 0);
  assert.equal(ai.runs.length, 0);
});

test('SIX FOR ONE ADDRESS: the seventh reading from one address that day is refused, and another address still reads', async () => {
  const d = door(allOn());
  for (let i = 0; i < 6; i += 1) assert.equal((await serveFirstRead(ask('203.0.113.7'), d, NOW)).status, 200);
  const seventh = await serveFirstRead(ask('203.0.113.7'), d, NOW);
  assert.equal(seventh.status, 429);
  assert.equal((await refusal(seventh)).fix, FIRST_READ_ADDRESS_SPENT);
  assert.equal((await serveFirstRead(ask('198.51.100.4'), d, NOW)).status, 200);
  assert.equal((await serveFirstRead(ask('203.0.113.7'), d, NOW + 86_400_000)).status, 200, 'the next day did not start over');
});

test('THE CEILING ACROSS ADDRESSES: FIRST_READ_DAILY readings a day for all strangers, then the day sentence', async () => {
  const d = door({ ...allOn(), FIRST_READ_DAILY: '3' });
  for (const ip of ['192.0.2.1', '192.0.2.2', '192.0.2.3']) assert.equal((await serveFirstRead(ask(ip), d, NOW)).status, 200);
  const fourth = await serveFirstRead(ask('192.0.2.4'), d, NOW);
  assert.equal(fourth.status, 429);
  assert.equal((await refusal(fourth)).fix, FIRST_READ_DAY_SPENT);
});

test('THE OFFER IS THE BUILD: every use case, and modules with their lists', () => {
  const offer = firstReadOffer();
  assert.ok(offer.usecases.length > 0 && offer.usecases.every((u) => u.id !== '' && u.title !== ''));
  assert.ok(offer.modules.some((m) => m.lists.length > 0 && m.lists.every((l) => l.fields.length > 0)));
});
