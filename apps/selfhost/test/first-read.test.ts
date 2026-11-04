/**
 * A self-host's first read (`src/first-read.ts`), through `serveFirstRead` as `/auth/signup/read` will reach it.
 *
 * NO NETWORK AND NO MODEL: one fake `send` answers both this host's endpoint, in the chat-completions shape, and
 * siteverify; the reader is a fake `readSetup` that asks the model it was bound to. Off with the ceiling unset, at 0 and
 * with no model; on with all three; six for one address; the ceiling across addresses.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serveFirstRead, FIRST_READ_ADDRESS_SPENT, FIRST_READ_DAY_SPENT, FIRST_READ_OFF } from '@braindog/host/first-read';
import { ok } from '@braindog/ports';

import { PEOPLE } from '../../../fixtures/names.ts';
import { firstReadOffer, selfhostFirstReadDoor, type ReadSetup } from '../src/first-read.ts';
import type { SlashConfig } from '../src/slash.ts';

const ORIGIN = 'http://braindog.home.example:8787';
const NOW = Date.parse('2026-10-14T10:00:00Z');
const SAID = `I'm ${PEOPLE[5]!.name}. I teach piano and keep track of my students' lessons.`;
const ENDPOINT = 'http://model.home.example:11434/v1/chat/completions';

/** This host's endpoint and siteverify, both answered here; the endpoint's calls are counted. */
const fakeSend = () => {
  const asked: string[] = [];
  const send = async (input: string | URL, init: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes('siteverify')) return Response.json({ success: (init.body as FormData).get('response') !== 'bad' });
    asked.push(url);
    const content = JSON.stringify({ name: PEOPLE[5]!.name, summary: 'Piano lessons.' });
    return Response.json({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 300, completion_tokens: 30 } });
  };
  return { asked, send };
};

const fakeRead: ReadSetup = async (ask, model) => {
  const reply = await model.complete({ model: 'glm-5.3-flash', messages: [{ role: 'user', content: ask.said }], maxTokens: 200, jsonSchema: {} });
  const said = JSON.parse(reply.text) as { name: string; summary: string };
  return ok({ name: said.name, summary: said.summary, usecase: ask.offer.usecases[0]?.id ?? null, also: [], modules: [], currency: null, heard: [], names: [], rows: [], draft: null, by: 'endpoint' });
};

const MODEL: SlashConfig = { url: ENDPOINT, model: 'house-model' };
const ENV = { FIRST_READ_DAILY: '50', TURNSTILE_SECRET: 'test-secret' };

/* `slash` HAS NO DEFAULT, because an `undefined` handed to a defaulted parameter is the default and not "no model". */
const door = (env: Record<string, string | undefined>, slash: SlashConfig | undefined, net = fakeSend(), readSetup: ReadSetup | null = fakeRead) =>
  selfhostFirstReadDoor(env, { origin: ORIGIN, slash, readSetup, send: net.send });

const ask = (ip: string, turnstile = 'good'): Request =>
  new Request(`${ORIGIN}/auth/signup/read`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    body: JSON.stringify({ said: SAID, today: '2026-10-14', zone: 'Africa/Cairo', locale: 'en', turnstile }),
  });

const refusal = async (res: Response) => ((await res.json()) as { refusal: { code: string; fix: string } }).refusal;

test('OFF AS SHIPPED: FIRST_READ_DAILY unset or 0, or no model on this host, says so with a 200 and asks no endpoint', async () => {
  const cases: [Record<string, string | undefined>, SlashConfig | undefined][] = [
    [{ ...ENV, FIRST_READ_DAILY: undefined }, MODEL],
    [{ ...ENV, FIRST_READ_DAILY: '0' }, MODEL],
    [ENV, undefined],
    [{ FIRST_READ_DAILY: '50' }, MODEL],
  ];
  for (const [env, slash] of cases) {
    const net = fakeSend();
    const res = await serveFirstRead(ask('203.0.113.9'), door(env, slash, net), NOW);
    /* OFF IS AN ANSWER, NOT A FAILURE: a 501 put a red line in every stranger's console on every sign-up. */
    assert.equal(res.status, 200);
    assert.deepEqual(await refusal(res), { code: 'NOT_IN_THIS_BUILD', fix: FIRST_READ_OFF });
    assert.equal(net.asked.length, 0);
  }
  assert.equal((await refusal(await serveFirstRead(ask('203.0.113.9'), door(ENV, MODEL, fakeSend(), null), NOW))).code, 'NOT_IN_THIS_BUILD', 'read with no reader');
});

test("ON WITH ALL THREE: the ceiling set, this host's model and a bot check, and the reading comes back", async () => {
  const net = fakeSend();
  const res = await serveFirstRead(ask('203.0.113.9'), door(ENV, MODEL, net), NOW);
  assert.equal(res.status, 200);
  const out = (await res.json()) as { ok: boolean; value: { name: string; usecase: string | null } };
  assert.equal(out.ok, true);
  assert.equal(out.value.name, PEOPLE[5]!.name);
  assert.equal(out.value.usecase, firstReadOffer().usecases[0]!.id);
  assert.deepEqual(net.asked, [ENDPOINT], "this host's endpoint was not the one asked");
});

test('A FAILED BOT CHECK IS REFUSED AND ASKS NO ENDPOINT', async () => {
  const net = fakeSend();
  assert.equal((await serveFirstRead(ask('203.0.113.9', 'bad'), door(ENV, MODEL, net), NOW)).status, 403);
  assert.equal(net.asked.length, 0);
});

test('EIGHTEEN FOR ONE ADDRESS: the nineteenth reading is refused, another address reads, and the next day starts over', async () => {
  const d = door(ENV, MODEL);
  for (let i = 0; i < 18; i += 1) assert.equal((await serveFirstRead(ask('203.0.113.9'), d, NOW)).status, 200);
  const over = await serveFirstRead(ask('203.0.113.9'), d, NOW);
  assert.equal(over.status, 429);
  assert.equal((await refusal(over)).fix, FIRST_READ_ADDRESS_SPENT);
  assert.equal((await serveFirstRead(ask('198.51.100.8'), d, NOW)).status, 200);
  assert.equal((await serveFirstRead(ask('203.0.113.9'), d, NOW + 86_400_000)).status, 200);
});

test('THE CEILING ACROSS ADDRESSES: FIRST_READ_DAILY readings for all strangers, then the day sentence', async () => {
  const d = door({ ...ENV, FIRST_READ_DAILY: '2' }, MODEL);
  assert.equal((await serveFirstRead(ask('192.0.2.1'), d, NOW)).status, 200);
  assert.equal((await serveFirstRead(ask('192.0.2.2'), d, NOW)).status, 200);
  const third = await serveFirstRead(ask('192.0.2.3'), d, NOW);
  assert.equal(third.status, 429);
  assert.equal((await refusal(third)).fix, FIRST_READ_DAY_SPENT);
});
