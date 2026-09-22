/**
 * `script_try` over stdio: `braindog mcp` reaches the host's `scriptTry` route, so an agent on the command line can try a
 * draft script the way one over HTTP can (`packages/host/src/script-try.ts`, `packages/mcp/test/script-try.test.ts`).
 *
 * HERE AND NOT IN `packages/mcp/test`, because a package's test does not import an app. The client is a stand-in that
 * answers the route list the way a host does and records every call, so what is under test is only this app's half:
 * that it routes the name when its host does, and that `propose` asks for a trial only when the agent said `try`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tools } from '@braindog/mcp';

import { surfaceOver } from '../src/surface.ts';

const body = {
  script: 'fx-rate',
  egress: ['https://rates.test'],
  keys: [],
  reads: [],
  writes: ['gold'],
  source: "export default async function run(ctx) { ctx.log('ok'); }",
};

/** A host that routes `routed`, answers every call with `{}`, and remembers what it was asked. */
function host(routed: string[]) {
  const called: { name: string; args: unknown }[] = [];
  const client = () =>
    ({
      call: async (name: string, args: unknown) => {
        if (name === '') return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '', allowed: routed } };
        called.push({ name, args });
        return { ok: true, value: name === 'propose' ? { id: 'SG1' } : { writes: [], log: '' } };
      },
    }) as never;
  return { client, called };
}

/** The code a refused answer carries, or `undefined` for one that was not refused. */
const codeOf = (r: unknown): string | undefined => (r as { refusal?: { code?: string } }).refusal?.code;
const change = (extra: Record<string, unknown> = {}) => ({
  question: 'Fetch the rate every hour?',
  body_kind: 'change',
  body: { declaration_id: 'script.fx-rate', to: { id: 'script.fx-rate', kind: 'script', body: { ...body, runs: { every: '1h' } } }, ...extra },
});

test('THE COMMAND LINE ROUTES scriptTry WHEN ITS HOST DOES, and leaves it off when the host is older', async () => {
  const newer = host(['propose', 'scriptTry']);
  const routed = await surfaceOver(newer.client);
  assert.equal(typeof routed.scriptTry, 'function');
  await routed.scriptTry!({ body }, { signal: AbortSignal.timeout(1000) });
  assert.deepEqual(newer.called, [{ name: 'scriptTry', args: { body } }]);
  const older = await surfaceOver(host(['propose']).client);
  assert.equal(older.scriptTry, undefined);
});

test('A STDIO AGENT TRIES A SCRIPT ONLY BY SAYING try, and a trial files nothing', async () => {
  const ctx = { signal: AbortSignal.timeout(1000) };
  const wired = host(['propose', 'scriptTry']);
  const surface = await surfaceOver(wired.client);

  const filed = await tools(surface).call('propose', change(), ctx);
  assert.ok(filed.ok, JSON.stringify(filed));
  assert.deepEqual(wired.called.map((c) => c.name), ['propose'], 'a proposal ran the script nobody asked to try');

  const tried = await tools(surface).call('propose', change({ try: true }), ctx);
  assert.ok(tried.ok, JSON.stringify(tried));
  assert.deepEqual(tried.value, { script_try: { writes: [], log: '' }, proposed: false });
  assert.deepEqual(wired.called.map((c) => c.name), ['propose', 'scriptTry']);

  /* A HOST THAT CANNOT TRY ONE SAYS SO, and the agent is told to propose instead. */
  const older = await tools(await surfaceOver(host(['propose']).client)).call('propose', change({ try: true }), ctx);
  assert.equal(codeOf(older), 'NOT_IN_THIS_BUILD');
});
