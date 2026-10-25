/**
 * Slash's model on the self-host (`src/slash.ts`): read from the environment, absent when nothing is set, and called with the
 * operator's key. The endpoint is a test double and the key an obviously fake value.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RecordApi } from '@braindog/record';

import { slashFromEnv, slashModelFor } from '../src/slash.ts';

test('NO SLASH_ENDPOINT, NO MODEL: the rules draft', () => {
  assert.equal(slashFromEnv({}), undefined);
  assert.equal(slashFromEnv({ SLASH_ENDPOINT: '  ' }), undefined);
  assert.equal(slashModelFor(undefined, () => ({}) as RecordApi, undefined), undefined);
  assert.deepEqual(slashFromEnv({ SLASH_ENDPOINT: 'http://localhost:11434/v1/chat/completions', SLASH_MODEL: 'small' }), {
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'small',
    key: undefined,
  });
});

test('AN ENDPOINT IS CALLED WITH THE OPERATOR KEY, and with no key when there is none in the keychain', async () => {
  const sent: RequestInit[] = [];
  const send = async (_url: URL, init: RequestInit) => (sent.push(init), new Response('{"drafts":[]}', { status: 200 }));
  const withKey = slashModelFor({ url: 'http://localhost:11434/v1/chat/completions', key: 'fake-operator-key', send }, () => ({}) as RecordApi, undefined);
  assert.deepEqual(await withKey!.draft({} as never), { drafts: [] });
  assert.equal((sent[0]!.headers as Record<string, string>).authorization, 'Bearer fake-operator-key');

  const api = { kernel: { grants: () => [] } } as unknown as RecordApi;
  const own = slashModelFor({ url: 'http://localhost:11434/v1/chat/completions', send }, () => api, undefined);
  await own!.draft({} as never);
  assert.equal((sent[1]!.headers as Record<string, string>).authorization, undefined);
});

test('A SELF-HOST WITH A MODEL SAYS slash: true, and one asked to tick has Slash look once for the day', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createClient } = await import('@braindog/client');
  const { start } = await import('../src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-slash-'));
  const send = async () => new Response('{"drafts":[]}', { status: 200 });
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, pollMs: 0, slash: { url: 'http://localhost:11434/v1/chat/completions', key: 'fake-operator-key', send }, slashTickMs: 3_600_000 });
  try {
    const at = (running.server.address() as { port: number }).port;
    const v = await createClient({ base: `http://127.0.0.1:${at}` }).version();
    assert.ok(v.ok);
    assert.equal((v.value as { slash: boolean }).slash, true, 'a host with a Slash endpoint and a key said it had none');
    for (let i = 0; i < 200 && running.api.kernel.prefsOf('slash')['slash.last'] === undefined; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(running.api.kernel.prefsOf('slash')['slash.last'], new Date().toISOString().slice(0, 10));
    assert.deepEqual(await running.api.slashTick(), { ran: false, why: 'today' });
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
