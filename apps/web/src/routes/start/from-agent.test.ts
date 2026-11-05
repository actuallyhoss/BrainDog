/**
 * THE FIRST RUN FROM A PERSON'S OWN AGENT: the lines Settings, Agents shows, the one line to paste, the build
 * waiting and then arriving among the record's open questions, and Make it mine pressing the accept once.
 *
 * A FAKE RECORD, NOT A SOCKET, as `accept.test.ts` has it: the two calls the page makes, `governance` and `call`.
 * Invented names only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { connectLines as settingsLines } from '../../lib/record/device.ts';
import { copy } from '../../lib/copy.ts';
import type { Approver } from '../../lib/record/keychain.ts';
import { approverFor, ASK_EVERY, askBuild, connectLines, hostOf, linesFor, makeItMine, waitingBuild, watch, words } from './from-agent.ts';

const BASE = 'https://brain.example/wren';

/** A record with these open questions, keeping every call made of it. */
function record(open: unknown[], decide: (args: unknown) => unknown = () => ({ ok: true, value: { decided: true } })) {
  const calls: { name: string; args: unknown }[] = [];
  const asked: unknown[] = [];
  const client = {
    governance: async (args: unknown) => {
      asked.push(args);
      return { ok: true as const, value: open };
    },
    call: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args });
      return decide(args) as { ok: true; value: unknown };
    },
  };
  return { client, calls, asked };
}

const arrangement = (id: string, body: Record<string, unknown>) => ({ id, body_kind: 'arrange', status: 'open', question: 'Arrange this BrainDog?', body });

test('THE LINES ARE SETTINGS, AGENTS OWN: the address any app takes and the setup command for this record, no app named', () => {
  const lines = settingsLines('https://brain.example', 'wren');
  const ways = connectLines(lines, 'unix');
  const all = ways.flatMap((w) => w.lines.map((l) => l.text));
  assert.ok(all.includes(lines.other), 'the address any app takes');
  assert.ok(all.includes(lines.setup), 'the setup command');
  assert.ok(all.some((t) => t.includes('install.sh')), 'the installer for this computer');
  for (const w of ways) assert.ok(w.hint.length > 0);
  for (const name of ['Claude', 'Codex', 'Cursor']) assert.ok(!JSON.stringify(ways).includes(name), `${name} is not named`);
  /* NO LINE CARRIES A KEY: the agent signs in through the browser. */
  assert.ok(!all.some((t) => /bearer/iu.test(t)));
  assert.equal(connectLines(lines, 'windows')[1]?.lines[0]?.text.includes('install.ps1'), true);
});

test('THE SETUP LINE NAMES THE RECORD THE PAGE IS ON, read off its base, and a base with no record names none', () => {
  assert.deepEqual(hostOf(BASE), { origin: 'https://brain.example', slug: 'wren' });
  assert.deepEqual(hostOf('https://brain.example'), { origin: 'https://brain.example', slug: null });
  const setup = linesFor(BASE).flatMap((w) => w.lines).find((l) => l.id === 'setup');
  assert.equal(setup?.text, 'braindog setup https://brain.example/wren');
  const address = linesFor(BASE).flatMap((w) => w.lines).find((l) => l.id === 'other');
  assert.equal(address?.text, 'https://brain.example/mcp');
});

test('THE ONE LINE TO PASTE, word for word', () => {
  assert.equal(words.line, 'Set up my BrainDog. Ask me who I am, then propose it.');
  assert.ok(!Object.values(words).some((w) => typeof w === 'string' && w.includes('—')), 'no em dash in the words');
});

test('NO ARRANGEMENT WAITS: nothing open, or only other kinds of question, is no build', async () => {
  assert.equal(waitingBuild([]), null);
  assert.equal(waitingBuild([{ id: 'q1', body_kind: 'rowset', status: 'open', body: {} }, { id: 'q2', body_kind: 'pack', body: { install: 'tasks' } }]), null);
  assert.equal(waitingBuild([{ ...arrangement('q3', {}), status: 'decided' }]), null, 'a decided arrangement is not waiting');
  const { client } = record([{ id: 'q1', body_kind: 'change', body: {} }]);
  assert.equal(await askBuild(BASE, { client }), null);
});

test('ONE ARRIVES: drawn as the build, Today first, then each add-on it turns on by name, use cases aside', async () => {
  const body = { usecase: 'usecase-studio', why: ['Mara Quill runs a pottery studio.', 'She sells at two markets.'], packs: { install: ['usecase-studio', 'money-core', 'contacts'], enable: ['money-core'] } };
  const got = waitingBuild([{ id: 'q1', body_kind: 'rowset', status: 'open', body: {} }, arrangement('q7', body), arrangement('q8', {})]);
  assert.equal(got?.id, 'q7', 'the first open arrangement');
  assert.equal(got?.why, 'Mara Quill runs a pottery studio.');
  assert.deepEqual(got?.places.map((p) => p.kind), ['today', 'module', 'module']);
  assert.deepEqual(got?.places.slice(1).map((p) => p.id), ['money-core', 'contacts']);
  for (const p of got?.places ?? []) assert.ok(!/^[a-z]+-[a-z]+$/u.test(p.name), `${p.name} is a name, not an id`);

  /* A REASON THAT CITES AN ENTRY is `{ text, at }`, and a lone sentence is read as one reason. */
  assert.equal(waitingBuild([arrangement('q9', { why: [{ text: 'Four orders came in this week.', at: 'orders#4' }] })])?.why, 'Four orders came in this week.');
  assert.equal(waitingBuild([arrangement('q9', { why: 'A pottery studio.' })])?.why, 'A pottery studio.');
  assert.equal(waitingBuild([arrangement('q9', {})])?.why, null);

  const { client, asked } = record([arrangement('q7', body)]);
  assert.equal((await askBuild(BASE, { client }))?.id, 'q7');
  assert.deepEqual(asked[0], { status: 'open', limit: 200 });
});

test('A RECORD THAT DID NOT ANSWER is not "nothing waits": the page keeps what it drew', async () => {
  const client = { governance: async () => ({ ok: false as const, refusal: { code: 'UNREACHABLE', fix: 'Try again.' } }), call: async () => ({ ok: true as const, value: null }) };
  assert.equal(await askBuild(BASE, { client }), undefined);
  const threw = { governance: async () => Promise.reject(new Error('offline')), call: async () => ({ ok: true as const, value: null }) };
  assert.equal(await askBuild(BASE, { client: threw }), undefined);
});

test('MAKE IT MINE CALLS THE ACCEPT ONCE, on the arrangement, with the reason the record keeps', async () => {
  const { client, calls } = record([]);
  const out = await makeItMine(BASE, 'q7', { client });
  assert.deepEqual(out, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, 'decide');
  assert.deepEqual(calls[0]?.args, { id: 'q7', decide: { option: 'accept', reason: words.reason } });
});

test('A REFUSED PRESS SAYS THE RECORD SENTENCE, and one that threw says the record was not reached', async () => {
  const { client } = record([], () => ({ ok: false, refusal: { code: 'PLAN_STALE', fix: 'The add-on changed since it was proposed. Ask your agent again.' } }));
  assert.deepEqual(await makeItMine(BASE, 'q7', { client }), { ok: false, fix: 'The add-on changed since it was proposed. Ask your agent again.' });
  const threw = { governance: async () => ({ ok: true as const, value: [] }), call: async () => Promise.reject(new Error('offline')) };
  const out = await makeItMine(BASE, 'q7', { client: threw });
  assert.deepEqual(out, { ok: false, fix: copy.recordNotReached });
  /* THE PAGE SAYS "It was not made." BEFORE THE FIX, so the fix never repeats it. */
  assert.ok(!out.ok && !out.fix.startsWith(words.notMade));
});

test('THE SIX DIGITS SETUP SHOWS ARE APPROVED ON THIS PAGE: one approval, of the code as typed in two groups', async () => {
  const sent: unknown[] = [];
  /* ONLY THE TWO METHODS AN APPROVAL CALLS (`keychain.ts` `Approver`); what it answers is not read here. */
  const approver = (into: unknown[]): Approver => ({
    deviceLook: async (args) => (into.push(args), { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No machine is waiting with that code.' } }),
    deviceApprove: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'No machine is waiting with that code.' } }),
  });
  assert.equal((await approverFor(BASE, { client: approver(sent) })('123 456')).kind, 'wrong', 'a code that matches nothing is said as wrong');
  assert.deepEqual(sent, [{ user_code: '123456' }]);
  const none: unknown[] = [];
  const answer = await approverFor(BASE, { client: approver(none) })('12');
  assert.equal(answer.kind, 'malformed', 'too few digits are refused here, never sent');
  assert.equal(none.length, 0);
});

test('ASKED NO FASTER THAN EVERY FIVE SECONDS, paused while hidden, and stopped for good when the page is left', () => {
  let ticks = 0;
  const timers = new Map<number, number>();
  let next = 1;
  let seen: (() => void) | null = null;
  const doc = { visibilityState: 'visible', addEventListener: (_k: string, fn: () => void) => (seen = fn), removeEventListener: () => (seen = null) };
  const host = {
    setInterval: (_fn: () => void, ms: number) => (timers.set(next, ms), next++),
    clearInterval: (id: unknown) => void timers.delete(id as number),
    document: doc,
  };
  const stop = watch(() => ticks++, host, 1_000);
  assert.equal(ticks, 1, 'once at once');
  assert.deepEqual([...timers.values()], [ASK_EVERY], 'a faster ask is held to five seconds');
  doc.visibilityState = 'hidden';
  (seen as (() => void) | null)?.();
  assert.equal(timers.size, 0, 'nothing asked while hidden');
  doc.visibilityState = 'visible';
  (seen as (() => void) | null)?.();
  assert.equal(ticks, 2, 'asked at once when shown again');
  stop();
  assert.equal(timers.size, 0);
  assert.equal(seen, null, 'no listener left behind');
});
