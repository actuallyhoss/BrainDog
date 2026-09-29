/**
 * `ctx.update`'s version, as the prelude hands it to the host.
 *
 * THE RECORD'S WRITE PATH HAS TWO ANSWERS FOR A VERSION: a whole number is compared with the row's, and no version
 * writes without comparing. The prelude used to send `Number(version)` whatever came in, so a missing version crossed
 * as `NaN` (and was refused by the record with a fix no script could follow), `null` crossed as `0` (a conflict on
 * every row, since rows start at 1), and a typo such as `'four'` crossed as the same `NaN` as no version at all. Now a
 * missing or `null` version crosses as `NaN`, which `finishScript` reads as "none", and any other version that is not
 * a whole number stops the run inside the sandbox with a sentence that names `ctx.update`.
 *
 * Run through `runInQuickJs`, because the prelude is a string and only a sandbox says what it does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CtxHost, ScriptAnswer, ScriptDecl } from '../src/index.ts';
import { runInQuickJs } from '../src/quickjs.ts';

const decl = (body: string): ScriptDecl => ({
  id: 'gold-rate',
  version: 1,
  egress: [],
  keys: [],
  reads: [],
  writes: ['gold_egp'],
  source: `export default async function run(ctx) { ${body} }`,
});

const host: CtxHost = {
  fetch: async () => assert.fail('nothing here fetches'),
  now: () => '2026-09-22T10:00:00Z',
  tz: 'UTC',
  input: null,
};

const writesOf = (a: ScriptAnswer) => {
  assert.ok('writes' in a, `expected writes, got ${JSON.stringify(a)}`);
  return a.writes;
};

const versionOf = async (call: string): Promise<unknown> => {
  const [w] = writesOf(await runInQuickJs(decl(call), host));
  assert.equal(w?.op, 'update');
  return w.op === 'update' ? w.version : undefined;
};

test('NO VERSION, OR null, CROSSES AS NaN, which the record reads as "write without comparing" (null once through JSON)', async () => {
  for (const call of [`ctx.update('gold_egp#1', { value: 2 })`, `ctx.update('gold_egp#1', { value: 2 }, undefined)`, `ctx.update('gold_egp#1', { value: 2 }, null)`]) {
    const version = await versionOf(call);
    assert.ok(Number.isNaN(version), `${call} sent ${String(version)}; null used to send 0, a conflict on every row`);
    assert.equal(JSON.parse(JSON.stringify({ version })).version, null);
  }
});

test('A WHOLE-NUMBER VERSION CROSSES AS ITSELF, as text too, so the compare-and-set a script asked for is kept', async () => {
  assert.equal(await versionOf(`ctx.update('gold_egp#1', { value: 2 }, 4)`), 4);
  assert.equal(await versionOf(`ctx.update('gold_egp#1', { value: 2 }, '4')`), 4);
});

test('A VERSION GIVEN THAT IS NOT A WHOLE NUMBER STOPS THE RUN, naming ctx.update, rather than crossing as "none"', async () => {
  /* `[4]` IS HERE FOR THE typeof CHECK: `Number([4])` is 4, so without it an array crossed as a whole version. */
  for (const bad of [`'four'`, '1.5', '{}', '[4]', 'Infinity']) {
    const a = await runInQuickJs(decl(`ctx.update('gold_egp#1', { value: 2 }, ${bad});`), host);
    assert.ok('refused' in a, `version ${bad} was handed on as ${JSON.stringify('writes' in a ? a.writes : a)}`);
    assert.match(a.refused.why, /ctx\.update takes the version the row was read at/);
    assert.match(a.refused.why, /leave it out to write without comparing/);
  }
});
