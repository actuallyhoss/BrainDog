/**
 * Spark's model on the self-host (`src/spark.ts`): read from the environment, absent when nothing is set, and called with the
 * operator's key. The endpoint is a test double and the key an obviously fake value.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { RecordApi } from '@braindog/record';

import { sparkFromEnv, sparkModelFor } from '../src/spark.ts';

test('NO SPARK_ENDPOINT, NO MODEL: the rules draft', () => {
  assert.equal(sparkFromEnv({}), undefined);
  assert.equal(sparkFromEnv({ SPARK_ENDPOINT: '  ' }), undefined);
  assert.equal(sparkModelFor(undefined, () => ({}) as RecordApi, undefined), undefined);
  assert.deepEqual(sparkFromEnv({ SPARK_ENDPOINT: 'http://localhost:11434/v1/chat/completions', SPARK_MODEL: 'small' }), {
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'small',
    key: undefined,
  });
});

test('AN ENDPOINT IS CALLED WITH THE OPERATOR KEY, and with no key when there is none in the vault', async () => {
  const sent: RequestInit[] = [];
  const send = async (_url: URL, init: RequestInit) => (sent.push(init), new Response('{"drafts":[]}', { status: 200 }));
  const withKey = sparkModelFor({ url: 'http://localhost:11434/v1/chat/completions', key: 'fake-operator-key', send }, () => ({}) as RecordApi, undefined);
  assert.deepEqual(await withKey!.draft({} as never), { drafts: [] });
  assert.equal((sent[0]!.headers as Record<string, string>).authorization, 'Bearer fake-operator-key');

  const api = { kernel: { grants: () => [] } } as unknown as RecordApi;
  const own = sparkModelFor({ url: 'http://localhost:11434/v1/chat/completions', send }, () => api, undefined);
  await own!.draft({} as never);
  assert.equal((sent[1]!.headers as Record<string, string>).authorization, undefined);
});
