/**
 * A source taken from a bundle runs: `__name` is there before the script's text is read (`NAMES` in `../src/index.ts`).
 *
 * WHAT WAS MEASURED. `wrangler` bundles the Worker with esbuild's `keepNames`, so `MATCH_PAYMENT_SCRIPT.source`, which
 * is `matchPayment.toString()` taken inside that bundle, wraps each named arrow as `__name(fn, "fn")`. With no `__name`
 * in the sandbox every Money script built that way threw on its first arrow, and the record paused it after three runs.
 * The text below is the shape the production bundle holds, cut down.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CtxHost, ScriptDecl } from '../src/index.ts';
import { runInQuickJs } from '../src/quickjs.ts';

const decl = (source: string): ScriptDecl => ({ id: 'bundled', version: 1, egress: [], keys: [], reads: [], writes: ['seen'], source });

const host: CtxHost = {
  fetch: async () => ({ status: 200, headers: {}, body: '' }),
  now: () => '2026-10-24T10:00:00Z',
  tz: 'Africa/Cairo',
  input: null,
};

const BUNDLED = `function tally(n) {
  const twice = /* @__PURE__ */ __name((x) => x * 2, "twice");
  return twice(n);
}
export default async function run(ctx) {
  const named = /* @__PURE__ */ __name(async (said) => said, "named");
  ctx.write('seen', { n: tally(await named(21)), name: named.name });
}`;

test("a script whose text calls the bundler's __name runs, and the name it sets is the one asked for", async () => {
  const answer = await runInQuickJs(decl(BUNDLED), host);
  assert.ok('writes' in answer, JSON.stringify(answer));
  assert.deepEqual(answer.writes, [{ op: 'create', register: 'seen', fields: { n: 42, name: 'named' } }]);
});

test('a script that brings its own __name keeps it', async () => {
  const own = `const __name = (f) => f;\nexport default async function run(ctx) { ctx.write('seen', { ok: __name(1) }); }`;
  const answer = await runInQuickJs(decl(own), host);
  assert.ok('writes' in answer, JSON.stringify(answer));
  assert.deepEqual(answer.writes, [{ op: 'create', register: 'seen', fields: { ok: 1 } }]);
});
