/**
 * A trial by an agent sends nothing but a read (`src/script-try.ts`, `readOnlyRefused` in `src/script.ts`, SHL-D05).
 *
 * A TOKEN'S TRIAL OPENED NO KEY AND SENT ANY METHOD THE DRAFT ASKED, so a propose token could make the host POST to any
 * public origin a draft named, unapproved, on the owner's plan. The stand-in is the socket itself (`send`): what reaches
 * it is what left the host. The sandbox is a double that fetches what it is told, catches a refusal and logs it, which is
 * what a script inside QuickJS sees from `scriptRunner`'s fetch: a rejected promise it may go on from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ScriptAnswer } from '@braindog/kernel';
import type { HostRequest } from '@braindog/script';
import { runInQuickJs } from '@braindog/script/quickjs';

import { readOnlyExecute, readOnlyRefused } from '../src/script.ts';
import { AGENT_TRIAL, readsOnly, scriptTrial, trialSandbox, type ScriptDraft } from '../src/script-try.ts';

const ORIGIN = 'https://echo.example.test';
const SENTENCE = 'A trial by an agent only reads, so the POST to echo.example.test was not sent. Propose the script, and its runs send it once the owner accepts.';

/** The stand-in: every request that left the host, by method and body. */
function standIn() {
  const reached: { method: string; body: string | null }[] = [];
  const send = async (input: URL, init: RequestInit): Promise<Response> => {
    reached.push({ method: String(init.method ?? 'GET'), body: typeof init.body === 'string' ? init.body : null });
    return new Response('{"echo":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { reached, send };
}

/** A sandbox double that sends each of `asks` through the host's fetch, in order, and logs what each was answered. */
const fetching = (asks: Omit<HostRequest, 'headers' | 'key'>[]) =>
  async (_decl: unknown, host: { fetch: (r: HostRequest) => Promise<{ status: number }> }): Promise<ScriptAnswer> => {
    const lines: string[] = [];
    for (const ask of asks) {
      try {
        lines.push(`${ask.method} ${(await host.fetch({ ...ask, headers: {}, key: null })).status}`);
      } catch (e) {
        lines.push((e as Error).message);
      }
    }
    return { writes: [], log: lines.join('\n'), usage: { fetches: asks.length, bytes: 0, wall_ms: 1, cpu_ms: 1 } };
  };

const ASKS = [
  { method: 'POST', url: `${ORIGIN}/probe/echo?case=Juniper%20Vale`, body: '{"note":"Brightwater"}' },
  { method: 'GET', url: `${ORIGIN}/probe/echo`, body: null },
];

function trialOf(send: ReturnType<typeof standIn>['send']) {
  return scriptTrial({ sandbox: trialSandbox({ run: fetching(ASKS) as never, send, openKey: null, now: () => 0 }), ledger: null });
}

const draft = (who: Partial<Pick<ScriptDraft, 'grantOf' | 'stale' | 'owner'>>): ScriptDraft => ({
  record: { id: 'rec_test', tz: 'UTC' },
  body: { script: 'echo_probe', egress: [ORIGIN], keys: [], reads: [], writes: [], source: 'export default async () => {}' },
  grantOf: null,
  ...who,
});

test("A TOKEN'S TRIAL POSTS NOTHING: the stand-in holds no body, the run answers the sentence, and its GET still reaches", async () => {
  const echo = standIn();
  const answer = await trialOf(echo.send)(draft({ grantOf: null }));
  assert.deepEqual(echo.reached, [{ method: 'GET', body: null }]);
  assert.ok(!('held' in answer) && !('refused' in answer), 'the run went on past the refusal');
  const log = (answer as { log: string }).log.split('\n');
  assert.equal(log[0], SENTENCE);
  assert.equal(log[1], 'GET 200');
  assert.doesNotMatch(log[0]!, /probe|Juniper|Brightwater/, 'the host only, never the path or a value');
});

test("THE OWNER'S TRIAL POSTS, and so does the owner whose proof is stale, who keeps any method and no key", async () => {
  for (const who of [{ grantOf: () => null }, { grantOf: null, stale: true }, { grantOf: null, owner: true }]) {
    const echo = standIn();
    await trialOf(echo.send)(draft(who));
    assert.deepEqual(echo.reached.map((r) => r.method), ['POST', 'GET'], JSON.stringify(who));
    assert.equal(echo.reached[0]!.body, '{"note":"Brightwater"}');
  }
  assert.equal(readsOnly({ grantOf: () => null, owner: false }), true, 'the record saying no wins over a vault handed in');
});

test('ONLY A GET OR A HEAD WITHOUT A BODY IS A READ', () => {
  assert.equal(readOnlyRefused('get', `${ORIGIN}/a`, null), null);
  assert.equal(readOnlyRefused('HEAD', `${ORIGIN}/a`, ''), null);
  for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.match(readOnlyRefused(method, `${ORIGIN}/a`, null)!, new RegExp(`the ${method} to echo.example.test was not sent`));
  assert.match(readOnlyRefused('GET', `${ORIGIN}/a`, 'x=1')!, /the GET to echo.example.test was not sent/);
});

test('readOnlyExecute REFUSES A WRITE BEFORE THE EXECUTOR IT WRAPS, for a sandbox that sends through its own', async () => {
  const sent: string[] = [];
  const execute = readOnlyExecute(async (r) => {
    sent.push(r.method);
    return { status: 200, body: '', bytes: 0, ms: 0, requests: 1 } as never;
  });
  const base = { job: 'j', channel: 'call', ingest: 'echo_probe', origin: ORIGIN, headers: {}, grant: null, timeoutMs: 1, maxBytes: 1 } as const;
  const refused = await execute({ ...base, method: 'POST', url: `${ORIGIN}/probe/echo`, body: '{}' } as never);
  assert.deepEqual('refused' in refused ? refused.refused.fix : null, SENTENCE);
  await execute({ ...base, method: 'GET', url: `${ORIGIN}/probe/echo` } as never);
  assert.deepEqual(sent, ['GET']);
});

test("AN AGENT'S TRIAL IS COUNTED UNDER AN EVENT BEGUN try_agent_, the owner's under try_, so the day's agent trials can be read off the ledger", async () => {
  const events: string[] = [];
  const books = { mayRun: async () => null, meter: async (_r: string, run: { event: string }) => void events.push(run.event) };
  const sandbox = trialSandbox({ run: fetching([]) as never, send: standIn().send, openKey: null, now: () => 0 });
  await scriptTrial({ sandbox, ledger: books as never })(draft({ grantOf: null }));
  await scriptTrial({ sandbox, ledger: books as never })(draft({ grantOf: () => null }));
  assert.ok(events[0]!.startsWith(AGENT_TRIAL), events[0]);
  assert.ok(events[1]!.startsWith('try_') && !events[1]!.startsWith(AGENT_TRIAL), events[1]);
});

test('THE WHOLE PATH ON THE SELF-HOST: a draft in QuickJS that catches the refused POST goes on, and only its GET reaches the stand-in', async () => {
  const echo = standIn();
  const source = `export default async function run(ctx) {
    try { await ctx.fetch('${ORIGIN}/probe/echo', { method: 'post', body: '{"note":"Brightwater"}' }); ctx.log('sent'); } catch (e) { ctx.log(e.message); }
    const r = await ctx.fetch('${ORIGIN}/probe/echo');
    ctx.log('GET ' + r.status);
  }`;
  const trial = scriptTrial({ sandbox: trialSandbox({ run: runInQuickJs, send: echo.send, openKey: null, now: () => 0 }), ledger: null });
  const answer = await trial({ ...draft({ grantOf: null }), body: { ...draft({}).body, source } });
  assert.ok(!('held' in answer) && !('refused' in answer), JSON.stringify(answer));
  assert.deepEqual(echo.reached, [{ method: 'GET', body: null }]);
  assert.match((answer as { log: string }).log, new RegExp(SENTENCE.replace(/[.]/g, '\\.')));
  assert.match((answer as { log: string }).log, /GET 200/);
});
