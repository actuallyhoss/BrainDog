/**
 * The page headlines on the self-host (`src/slash.ts` `slashModelFor`): the daily look's ask for the line at the top of each
 * page, on this host's endpoint, and through the same choice of model the press and the skill step read.
 *
 * THE ENDPOINT ALONE ALREADY WROTE THEM, BUT THE MODEL THE RECORD IS HANDED WHEN A KEY STORE IS OPEN DID NOT: that wrap
 * passed `draft`, `form` and `skill` through and left `headline` off, so a self-host that could open his key never wrote a
 * page's line. The endpoint is a test double; nothing leaves the machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLASH_HEADLINE_INSTRUCTIONS } from '@braindog/host/slash';
import type { HeadlineInput, RecordApi } from '@braindog/record';

import { openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import type { KeyStore } from '../src/keys.ts';
import { slashModelFor } from '../src/slash.ts';

const ENDPOINT = 'http://localhost:11434/v1/chat/completions';
const INPUT: HeadlineInput = {
  today: '2026-10-02',
  pages: [{ page: 'bake', title: 'Bake', rules: 'Three loaves are still to bake.', figures: [{ id: 'loaves-open', value: '3' }] }],
};
const LINES = '{"lines":{"bake":"Three loaves are still to bake, the rye first."}}';

/** The endpoint, answering every ask with the lines, and what each ask told it. */
const endpoint = () => {
  const told: { url: string; system: string; user: unknown }[] = [];
  const send = async (url: URL, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
    told.push({ url: String(url), system: body.messages[0]!.content, user: JSON.parse(body.messages[1]!.content) });
    return new Response(JSON.stringify({ choices: [{ message: { content: LINES } }] }), { status: 200 });
  };
  return { told, send };
};

/** Slash's own store, on this host's endpoint, or on his key when `tier` says `b`. */
const slashStore = (tier: 'a' | 'b') => {
  const store = openSqlite();
  store.exec('CREATE TABLE slash_settings (singleton INTEGER PRIMARY KEY, tier TEXT, model TEXT, grant_id TEXT, ask_cap INTEGER, updated_at TEXT)');
  store.exec('CREATE TABLE slash_meta (key TEXT PRIMARY KEY, value TEXT)');
  store.exec("INSERT INTO slash_settings VALUES (1, ?, 'his-model', 'g_gone', 80, '2026-10-01T09:00:00.000Z')", tier);
  store.exec("INSERT INTO slash_meta VALUES ('own.provider', 'openai'), ('own.base_url', 'https://gateway.example.test/v1')");
  return store;
};

/** A vault that holds no key, so a key he chose once is gone. Nothing here opens the key store. */
const api = () => ({ kernel: { grants: () => [] } }) as unknown as RecordApi;
const keys = {} as KeyStore;

test('THE ENDPOINT WRITES THE HEADLINES, told the headline rules and handed the pages', async () => {
  const wire = endpoint();
  const model = slashModelFor({ url: ENDPOINT, send: wire.send }, api, undefined);
  assert.deepEqual(await model!.headline!(INPUT), JSON.parse(LINES));
  assert.deepEqual(wire.told, [{ url: ENDPOINT, system: SLASH_HEADLINE_INSTRUCTIONS, user: INPUT }]);
});

test('WITH HIS KEY STORE OPEN, THE MODEL THE RECORD IS HANDED STILL WRITES THEM, on the endpoint while no key is chosen', async () => {
  const wire = endpoint();
  const store = slashStore('a');
  const model = slashModelFor({ url: ENDPOINT, send: wire.send }, api, keys, () => store);
  assert.ok(model?.headline, 'the model handed to the record writes no headlines, so every page keeps its rules line');
  assert.deepEqual(await model.headline(INPUT), JSON.parse(LINES));
  assert.equal(wire.told[0]?.system, SLASH_HEADLINE_INSTRUCTIONS);
  store.close();
});

test('A KEY HE CHOSE THAT IS GONE SENDS NOTHING, and the endpoint is not asked in its place', async () => {
  const wire = endpoint();
  const store = slashStore('b');
  const model = slashModelFor({ url: ENDPOINT, send: wire.send }, api, keys, () => store);
  const thrown = await model!.headline!(INPUT).then(
    () => null,
    (e: unknown) => e as { sent?: unknown; message: string },
  );
  assert.equal(thrown?.sent, false, 'a headline on a gone key was not marked as never sent');
  assert.match(thrown?.message ?? '', /no longer a key in the vault/u);
  assert.deepEqual(wire.told, []);
  store.close();
});
