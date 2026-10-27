/**
 * The door and the command's build: the command says its build on every call, the bearer path hands it to the
 * record to keep on the key, and the build address says the oldest command this door still works with.
 *
 * WHY EACH HALF. A Mac five commits behind showed nowhere on his record, and a week of sessions with no tools showed
 * nowhere either: the record could not say which build stood behind a key, and the host could not say which build it
 * needed. `x-braindog-cli` is the first fact and `min_cli` the second; `doorHealth` reads the two together.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MIN_CLI, behind, buildDay } from '../../../packages/mcp/src/build.ts';
import { bearerOf, CLI_HEADER, type BearerDeps, type Held } from '../src/session.ts';
import { bundled } from './bundled-worker.ts';

const X = 'rec_01J8ZC0000000000000000000X';
const OWNER: Held = { level: 'owner', registers: null, levels: {} };

/** A bearer path whose record answers every bearer, and keeps what `verify` was handed. */
function heard() {
  const builds: (string | undefined)[] = [];
  const deps: BearerDeps = {
    knows: async () => true,
    verify: async (_record, _bearer, _surface, build) => (builds.push(build), { id: 'tok_1', person_id: 'p_1', scope: 'write' }),
    access: async () => OWNER,
  };
  return { builds, deps };
}

const asked = (headers: Record<string, string> = {}) =>
  new Request('https://brain.example.test/mcp', { method: 'POST', headers: { authorization: `Bearer ${X}.secret`, ...headers } });

test('THE COMMAND’S BUILD REACHES verify AS ITS FOURTH ARGUMENT, through /mcp and /api alike', async () => {
  const { builds, deps } = heard();
  for (const surface of ['mcp', 'api'] as const) {
    const out = await bearerOf(asked({ [CLI_HEADER]: '2026.10.08+1a2b3c4' }), surface, deps);
    assert.equal('record' in out ? out.record : '', X);
  }
  assert.deepEqual(builds, ['2026.10.08+1a2b3c4', '2026.10.08+1a2b3c4']);
});

test('NO HEADER IS NO BUILD, and a long one is not passed on, so the record is handed nothing it must drop', async () => {
  const { builds, deps } = heard();
  await bearerOf(asked(), 'mcp', deps);
  await bearerOf(asked({ [CLI_HEADER]: '   ' }), 'mcp', deps);
  await bearerOf(asked({ [CLI_HEADER]: `2026.10.08+${'a'.repeat(200)}` }), 'mcp', deps);
  assert.deepEqual(builds, [undefined, undefined, undefined]);
  /* AND THE HEADER OPENS NOTHING: a bearer the record does not know is the same 401 with a build or without one. */
  const unknown = await bearerOf(asked({ [CLI_HEADER]: '2026.10.08+1a2b3c4' }), 'mcp', { ...deps, verify: async () => null });
  assert.deepEqual(unknown, { status: 401 });
});

test('MIN_CLI IS A DAY, and the day orders two builds where the hash does not', () => {
  assert.match(MIN_CLI, /^\d{4}\.\d{2}\.\d{2}$/u);
  assert.equal(Number.isNaN(Date.parse(MIN_CLI.replaceAll('.', '-'))), false, `${MIN_CLI} is not a day`);
  assert.equal(buildDay('2026.10.01+abc1234'), '2026.10.01');
  assert.equal(buildDay('2026.10.01'), null, 'a day alone is not a build');
  assert.equal(buildDay('nightly'), null);
  assert.equal(behind('2026.10.01+abc1234', '2026.10.07'), true, 'the build of 1 October, which dropped every tool');
  assert.equal(behind('2026.10.07+0000000', '2026.10.07'), false, 'the same day is not behind, whatever its commit');
  assert.equal(behind('2026.10.09+abc1234', '2026.10.07'), false);
  assert.equal(behind('not a build'), false, 'what is not a build is not called behind');
  assert.equal(behind(null), false);
});

test('THE BUILD ADDRESS ANSWERS { app, min_cli } TO ANYBODY, the package’s own day, and touches no record', async () => {
  const { default: worker } = await bundled();
  const trap = (name: string) =>
    new Proxy({}, { get: (_, key) => { throw new Error(`${name}.${String(key)} was reached for the build address`); } });
  const env = { BRAINDOG_BUILD: '2026.10.09+abc1234', RECORD: trap('RECORD'), DIRECTORY: trap('DIRECTORY'), INGRESS: trap('INGRESS'), ASSETS: trap('ASSETS') };
  const out = await worker.fetch(new Request('https://brain.example.test/.well-known/braindog-build'), env, { waitUntil: () => {} });
  assert.equal(out.status, 200);
  assert.equal(out.headers.get('cache-control'), 'no-store');
  /* THE WORKER'S COPY AND THE PACKAGE'S DAY ARE ONE DAY, or this says which moved without the other. */
  assert.deepEqual(await out.json(), { app: '2026.10.09+abc1234', min_cli: MIN_CLI });
  const unset = await worker.fetch(new Request('https://brain.example.test/.well-known/braindog-build'), { ...env, BRAINDOG_BUILD: '' }, { waitUntil: () => {} });
  assert.deepEqual(await unset.json(), { app: null, min_cli: MIN_CLI });
});
