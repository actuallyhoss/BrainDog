/**
 * The `Inference` port is reachable from the barrel, by the package's own name.
 *
 * WHY A TEST FOR ONE EXPORT LINE. The port sat in `src/inference.ts` with nothing exporting it, so the
 * Worker carried a copy and every other package that wanted a model call had nowhere to import the
 * shape from. A barrel that appears to export a port and does not fails on the first consumer rather
 * than on whoever wrote the line, which is the failure this file moves back to the line.
 *
 * WHY THE COMPILER IS RUN FROM HERE. This package's `tsconfig.json` includes `src/` alone and Node
 * strips a type import without looking at it, so a test that only IMPORTS the six type names passes
 * against a barrel that exports none of them. The second test hands this very file to `tsc`, which is
 * the one reader that can say a type name is missing.
 *
 * THE IMPORT IS `@braindog/ports` AND NOT `../src/index.ts`, on purpose: that is the spelling every
 * consumer writes, and a package may reach its own exports map by its own name.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import * as ports from '@braindog/ports';
import {
  inferenceDetail,
  modelMissing,
  refused,
  type Budget,
  type CompleteRequest,
  type Completion,
  type Inference,
  type InferenceDetail,
  type JsonSchema,
  type Msg,
  type Result,
  type Usage,
} from '@braindog/ports';

/* Each of the six names is USED, so `tsc` has something to refuse when one is missing. */
const line: Msg = { role: 'user', content: 'How many are late?' };
const schema: JsonSchema = { type: 'object' };
const budget: Budget = { neurons: 260 };
const usage: Usage = { in: 12, out: 3, neurons: null };
const ask: CompleteRequest = { model: 'small', messages: [line], maxTokens: 64, schema, budget };
const reply: Completion = { text: '{"late":2}', model: 'small', usage };

const canned: Inference = {
  complete: async (): Promise<Result<Completion>> => ({ ok: true, value: reply }),
  embed: async () => modelMissing('embed', 'no adapter on this host'),
};

test('THE VALUES: the barrel carries the port\'s five values, which `export type *` would erase', () => {
  for (const name of ['INFERENCE_CODES', 'modelMissing', 'schemaFailed', 'budgetSpent', 'isInferenceRefusal', 'inferenceDetail'])
    assert.ok(name in ports, `'@braindog/ports' does not export ${name}`);
});

test('THE TYPES: `tsc` reads this file and finds every name it imports from the barrel', () => {
  const here = fileURLToPath(import.meta.url);
  const tsc = fileURLToPath(new URL('../../../node_modules/.bin/tsc', import.meta.url));
  assert.ok(existsSync(tsc), 'the compiler is not installed at the root, so this test proves nothing');
  /* `--ignoreConfig`: a file named on the command line means the package's `tsconfig.json` is not read, and `tsc` asks to be told so. */
  const flags = '--ignoreConfig --noEmit --strict --target es2024 --lib es2024 --module nodenext --moduleResolution nodenext --types node';
  const more = '--allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly --exactOptionalPropertyTypes --skipLibCheck';
  const ran = spawnSync(tsc, [...flags.split(' '), ...more.split(' '), here], { encoding: 'utf8' });
  assert.equal(ran.status, 0, `${ran.stdout}${ran.stderr}`);
});

test('THE PORT IS USABLE AS IMPORTED: a canned adapter answers through it', async () => {
  const done = await canned.complete(ask);
  assert.ok(done.ok);
  assert.equal(done.value.model, 'small');
});

test('A REFUSAL CARRIES why, raw AND candidate, and none of them where nothing was said', async () => {
  const full = modelMissing('small', 'the provider did not answer', 'upstream 503', 'included:small');
  assert.ok(refused(full));
  const read: InferenceDetail = inferenceDetail(full.refusal);
  assert.deepEqual(read, { why: 'the provider did not answer', raw: 'upstream 503', candidate: 'included:small' });
  /* The provider's words stay under the name that already held them, so the one reader of `detail` is unmoved. */
  assert.equal(full.refusal.detail, 'upstream 503');
  assert.equal(full.refusal.fix.includes('503'), false);

  const bare = await canned.embed(['hello']);
  assert.ok(refused(bare));
  assert.deepEqual(inferenceDetail(bare.refusal), { why: 'no adapter on this host' });
  assert.equal('detail' in bare.refusal, false);
  assert.equal('candidate' in bare.refusal, false);

  /* A refusal no model call raised has nothing to read, and reading it invents nothing. */
  assert.deepEqual(inferenceDetail({ code: 'FORBIDDEN', fix: 'Sign in.', detail: 'a session, not a model' }), {});
});
