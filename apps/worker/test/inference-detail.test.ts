/**
 * The provider's own words in a refusal's `detail` (`modelMissing`): no key survives into them, the
 * cut is 300, and nothing but the operator's log reads them.
 *
 * WHY THE LAST TEST IS A READ OF THE SOURCE. `detail` is safe because of where it goes, not because of what it holds:
 * `scrubRaw` is patterns and a cut, best effort. Traced on 9 October, the one reader is `includedInference`
 * (`src/slash.ts`), which hands it to the Worker's `#modelFailed` hook, the operator's log line. No route in
 * `src/` or in `packages/host/src/routes` writes a refusal's `detail` into a reply, so no member and no stranger reads it.
 * A second reader is a decision about who sees a provider's words, so it goes red here until somebody takes it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { refused } from '@braindog/ports';

import { aiInference, modelMissing, RAW_MOST, scrubRaw, type AiEnv, type CompleteRequest } from '../src/inference.ts';

/** Key-shaped strings as providers echo them back, each with the part that must not survive. */
const KEYS: readonly { said: string; key: string }[] = [
  { said: 'Authorization: Bearer cf-live-0a1b2c3d4e5f rejected', key: 'cf-live-0a1b2c3d4e5f' },
  { said: 'Incorrect API key provided: sk-proj-ab12cd34ef56', key: 'sk-proj-ab12cd34ef56' },
  { said: 'bad key sk_live_51Habcdef', key: 'sk_live_51Habcdef' },
  { said: 'token ghp_abcdefghijklmnop1234 has expired', key: 'ghp_abcdefghijklmnop1234' },
  { said: 'slack said xoxb-1234567890-abcdef', key: 'xoxb-1234567890-abcdef' },
  { said: 'AWS AKIAIOSFODNN7EXAMPLE is not allowed', key: 'AKIAIOSFODNN7EXAMPLE' },
  { said: 'Google AIzaSyA1b2C3d4E5f6G7h8 denied', key: 'AIzaSyA1b2C3d4E5f6G7h8' },
  { said: 'request had api_key=k3y-v4lue-9z and failed', key: 'k3y-v4lue-9z' },
  { said: '{"error":"bad","token":"t0k3n-s3cr3t-v4lu3"}', key: 't0k3n-s3cr3t-v4lu3' },
  { said: "config {'password': 'hunter2-hunter2'}", key: 'hunter2-hunter2' },
  { said: 'API token: 9f8e7d6c5b4a', key: '9f8e7d6c5b4a' },
  { said: 'account path /accounts/0123456789abcdef0123456789abcdef/ai/run failed', key: '0123456789abcdef0123456789abcdef' },
];

const ask: CompleteRequest = {
  model: 'llama-3.2-1b',
  messages: [{ role: 'user', content: 'Is this an invoice?' }],
  maxTokens: 64,
  schema: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'], additionalProperties: false },
  budget: { neurons: 50 },
};

/** A binding whose every call throws `said`, as a provider that failed. */
const throwing = (said: string): AiEnv => ({
  AI: {
    run: async () => {
      throw new Error(said);
    },
  },
  AI_GATEWAY: 'braindog-alpha',
});

const detailOf = (r: unknown): string => (refused(r as never) ? String((r as { refusal: { detail?: unknown } }).refusal.detail ?? '') : 'not refused');

test('NO KEY-SHAPED STRING SURVIVES scrubRaw, and the words around it do', () => {
  for (const { said, key } of KEYS) {
    const out = scrubRaw(said);
    assert.ok(!out.includes(key), `${key} survived in: ${out}`);
    assert.notEqual(out, '', said);
  }
  assert.equal(scrubRaw('API key invalid for this route'), 'API key invalid for this route', 'words that are no key stay');
});

test('NOR INTO detail, through both calls of the port, for every shape', async () => {
  for (const { said, key } of KEYS) {
    const done = detailOf(await aiInference(throwing(said)).complete(ask));
    const embedded = detailOf(await aiInference(throwing(said)).embed(['hello']));
    for (const d of [done, embedded]) {
      assert.ok(!d.includes(key), `${key} survived in: ${d}`);
      assert.ok(d.length <= RAW_MOST, `${d.length} characters`);
    }
  }
});

test('THE CUT IS 300, and a throw that said nothing leaves no detail at all', async () => {
  assert.equal(RAW_MOST, 300);
  const long = 'the provider is busy, please try again later. '.repeat(30);
  assert.equal(scrubRaw(long).length, 300);
  assert.equal(detailOf(await aiInference(throwing(long)).complete(ask)).length, 300);
  const bare = modelMissing('llama-3.2-1b', 'the provider did not answer');
  assert.ok(refused(bare));
  assert.equal('detail' in bare.refusal, false);
  /* AND THE SENTENCE A PERSON READS NEVER CARRIES THE PROVIDER'S WORDS: they ride in `detail` alone. */
  const out = await aiInference(throwing(KEYS[1]!.said)).complete(ask);
  assert.ok(refused(out));
  assert.doesNotMatch(out.refusal.fix, /sk-proj|Incorrect API key/u);
});

test('ONE READER: only the Worker\'s operator log reads a refusal\'s detail, and no route serialises it', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const repo = join(here, '..', '..', '..');
  const roots = [join(repo, 'apps/worker/src'), join(repo, 'packages/host/src/routes')];
  const files = roots.flatMap((root) =>
    (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).map((f) => join(root, f)),
  );
  assert.ok(files.length > 10, 'the trees were read');
  const readers = files.filter((file) => {
    /* Comments out, so a sentence about `detail` is not a reader of it. */
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
    return /(?:refusal|\))\??\.detail\b|\[['"]detail['"]\]/u.test(code);
  });
  assert.deepEqual(readers.map((f) => relative(repo, f)), ['apps/worker/src/slash.ts']);
});
