/**
 * A key used as the address is struck from the answer as a key sent with the request is.
 *
 * `addressed` opens the key and the request goes out with the URL it holds and no grant, so `sendAction` scrubbed
 * nothing: a provider that echoes its URL (a 404 page, some calendar feeds) handed the secret link to the script, which
 * could log it or write it in a row. The script's fetch now names what to strike (`scrub`, from `addressSecrets`).
 * The link is a fake made here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REDACTED, sendAction, type ActionRequest, type Send } from '../src/actions.ts';
import { addressSecrets } from '../src/script.ts';

const FEED = 'https://calendar.example';
const TOKEN = `tok_${crypto.randomUUID().replaceAll('-', '')}`;
const LINK = `${FEED}/ical/${TOKEN}/basic.ics?key=${TOKEN.slice(4, 24)}`;

const asked = (scrub?: string[]): ActionRequest => ({
  job: 'j_1',
  channel: 'pull',
  ingest: 'calendar',
  method: 'GET',
  url: LINK,
  origin: FEED,
  headers: {},
  grant: null,
  ...(scrub === undefined ? {} : { scrub }),
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
});

/** A provider that answers 404 and says back the address it was asked for, whole, as a path, and as its token. */
const echo: Send<undefined> = async (url) => new Response(`Not found: ${url.href}\npath ${url.pathname}${url.search}\ntoken ${TOKEN}`, { status: 404 });

test('THE ADDRESS, ITS PATH AND ITS TOKEN ARE STRUCK FROM AN ECHOING ANSWER', async () => {
  const run = sendAction({ origins: () => [FEED], openKey: null, send: echo });
  const answer = await run(asked(addressSecrets(LINK, new URL(LINK))));
  assert.ok(!('refused' in answer), JSON.stringify(answer));
  const body = 'body' in answer ? answer.body : '';
  assert.doesNotMatch(body, new RegExp(TOKEN), 'the token came back to the script');
  assert.doesNotMatch(body, new RegExp(TOKEN.slice(4, 24)), 'the query key came back to the script');
  assert.match(body, new RegExp(REDACTED));
});

test('WITHOUT IT THE LINK CAME BACK, which is what the scrub is for', async () => {
  const run = sendAction({ origins: () => [FEED], openKey: null, send: echo });
  const answer = await run(asked());
  assert.match('body' in answer ? answer.body : '', new RegExp(TOKEN));
});

test('A SHORT PART OF THE ADDRESS IS NO SECRET, and is left', () => {
  const texts = addressSecrets(LINK, new URL(LINK));
  assert.ok(texts.includes(TOKEN));
  assert.ok(!texts.includes('basic.ics'));
  assert.ok(!texts.includes('ical'));
  for (let i = 1; i < texts.length; i++) assert.ok(texts[i - 1]!.length >= texts[i]!.length, 'not longest first');
});
