/**
 * Handing a row to an agent with a note, and "Start one now" (agents and MCP plan §2.3 path E, §7.2): the note goes to
 * the task as an instruction; a run is offered only while a runner took one within the day and an approved kind takes
 * the instruction or the row, and it is started with the instruction as its argument. Otherwise nothing is offered.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INSTRUCTION_ARG, ROW_ARG, noteFor, startArgs, startFor, startKindOf, startNow, startsOnARunner, type Holder } from './hand.ts';
import type { JobKind } from './jobs.ts';

const NOW = Date.parse('2026-10-21T09:00:00Z');
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const kind = (id: string, args: string[]): JobKind => ({ id, title: id, repo: null, args: args.map((a) => ({ id: a, label: a, max: 64 })), writes: false });
const ROW_KIND = kind('job.row', [ROW_ARG]);
const TOLD_KIND = kind('job.told', [INSTRUCTION_ARG, ROW_ARG]);

const CLAUDE: Holder = { kind: 'agent', key: 'agent:claude', name: 'Claude', agent: 'claude' };
const CODEX: Holder = { kind: 'agent', key: 'agent:codex', name: 'Codex', agent: 'codex' };

test('the kind started takes the instruction first, else the row, else none is offered', () => {
  assert.equal(startKindOf([ROW_KIND, TOLD_KIND])?.id, 'job.told');
  assert.equal(startKindOf([ROW_KIND])?.id, 'job.row');
  assert.equal(startKindOf([kind('job.free', ['what'])]), null);
  assert.deepEqual(startArgs(TOLD_KIND, 'IN4', 'tasks#12'), { instruction: 'IN4', row: 'tasks#12' });
  assert.deepEqual(startArgs(ROW_KIND, 'IN4', 'tasks#12'), { row: 'tasks#12' });
  assert.equal(startsOnARunner(CLAUDE), true);
  assert.equal(startsOnARunner(CODEX), false, 'a runner runs Claude Code, so only Claude is offered a start');
});

/** A record whose newest run was claimed `ago` ms before NOW, approving the given kinds, and what it was asked. */
function record(ago: number | null, kinds: JobKind[]) {
  const asked: { name: string; body: unknown }[] = [];
  const io = async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(url instanceof Request ? url.url : String(url));
    const name = u.pathname.replace(/^.*\/api\//u, '');
    const body = init?.body ? JSON.parse(String(init.body)) : Object.fromEntries([...u.searchParams].map(([k, v]) => [k, v]));
    asked.push({ name, body });
    if (name === 'listJobs')
      return json({ ok: true, value: { jobs: ago === null ? [] : [{ id: 'j1', kind: 'job.row', title: 'Row', status: 'ok', runner: 'mac', claimed_at: new Date(NOW - ago).toISOString(), created_at: new Date(NOW - ago).toISOString(), args: {} }], cursor: null } });
    if (name === 'governance')
      return json({ ok: true, value: kinds.map((k, n) => ({ id: `SG${n}`, body_kind: 'change', resolved_as: 'addressed', body: { to: { kind: 'job', id: k.id, body: { title: k.title, args: k.args.map((a) => ({ id: a.id })) } } } })) });
    if (name === 'createJob') return json({ ok: true, value: { id: 'j9' } });
    if (name === 'instruct') return json({ ok: true, value: { id: 'IN7' } });
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } });
  };
  return { io: io as typeof fetch, asked };
}

test('"Start one now" is offered while a runner took a run within the day, and not after', async () => {
  assert.equal((await startFor('http://x.test', NOW, record(3_600_000, [TOLD_KIND]).io))?.id, 'job.told');
  assert.equal(await startFor('http://x.test', NOW, record(25 * 3_600_000, [TOLD_KIND]).io), null, 'a runner last heard yesterday is not listening');
  assert.equal(await startFor('http://x.test', NOW, record(null, [TOLD_KIND]).io), null, 'no runner, no press');
  assert.equal(await startFor('http://x.test', NOW, record(60_000, []).io), null, 'no approved kind, no press');
});

test('the note is an instruction to the task, and the run starts with that instruction as its argument', async () => {
  const r = record(60_000, [TOLD_KIND]);
  assert.deepEqual(await noteFor('http://x.test', 'tasks', 12, ' Start with the italics ', r.io), { ok: true, id: 'IN7' });
  const told = r.asked.find((a) => a.name === 'instruct')?.body as Record<string, unknown>;
  assert.deepEqual(told, { said: 'Start with the italics', to: 'task', task: 'tasks#12', when: 'next' });
  assert.equal(await startNow('http://x.test', TOLD_KIND, 'IN7', 'tasks', 12, r.io), 'j9');
  const job = r.asked.find((a) => a.name === 'createJob')?.body as Record<string, unknown>;
  assert.deepEqual(job, { kind: 'job.told', args: { instruction: 'IN7', row: 'tasks#12' } });
});

test('a note the record refuses says its reason', async () => {
  const io = (async () => json({ ok: false, refusal: { code: 'RATE_LIMITED', fix: 'Send this one again in 20 seconds.' } })) as typeof fetch;
  assert.deepEqual(await noteFor('http://x.test', 'tasks', 12, 'x', io), { ok: false, fix: 'Send this one again in 20 seconds.' });
});
