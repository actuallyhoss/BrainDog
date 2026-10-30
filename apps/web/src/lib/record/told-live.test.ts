/**
 * What came back from what he told agents, as the shell reads it: asked only where `boot` lists his instructions and he
 * owns them, Needs you and Done read in one go with the agent behind each answer, a move rings only while it is new, and
 * every line names the agent and never the run.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { Thread } from './instruct.ts';
import { answeredBy, doneToday, readToldBack, rowsOf, saidShort, toldMoves, toldNeedOf, toldReadable, TOLD_RING_MS } from './told-live.ts';

const NOW = Date.parse('2026-09-03T12:00:00Z');

const thread = (over: Partial<Thread> = {}): Thread => ({
  id: 'IN4',
  said: 'Merge wave 1, then stop',
  kind: 'tell',
  when: 'now',
  to: 'run',
  to_run: 'S1',
  to_agent: null,
  project: 'things#1',
  task: null,
  state: 'needs_you',
  seen_by: 'S1',
  seen_how: 'prompt',
  seen_at: '2026-09-03T11:40:00Z',
  taken_by: 'S1',
  taken_at: '2026-09-03T11:40:00Z',
  reply: 'Merged.  Should I rehearse it on a copy first?',
  replied_at: '2026-09-03T11:59:00Z',
  expires_at: null,
  at: '2026-09-03T11:39:00Z',
  updated_at: '2026-09-03T11:59:00Z',
  seen: [],
  receipts: null,
  ...over,
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('the shell asks only where boot lists his instructions with a row in them and says he owns them', () => {
  const lists = [{ id: 'instructions', count: 3 }];
  assert.equal(toldReadable(lists, { instructions: 'owner' }), true);
  assert.equal(toldReadable([{ id: 'instructions', count: 0 }], { instructions: 'owner' }), false, 'nothing told, nothing asked');
  assert.equal(toldReadable(lists, { instructions: 'read' }), false, 'only the owner is answered instructionList');
  assert.equal(toldReadable(lists, undefined), false);
  assert.equal(toldReadable([], { instructions: 'owner' }), false, 'a host without the list is asked nothing');
});

test('Needs you and Done are read together, and the agent behind each answer is read off its run', async () => {
  const asked: string[] = [];
  const io = async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(url instanceof Request ? url.url : String(url));
    const state = u.searchParams.get('state') ?? (init?.body ? String(JSON.parse(String(init.body)).state) : null);
    asked.push(u.pathname.replace(/^.*\/api\//u, ''));
    if (u.pathname.endsWith('/api/instructionList'))
      return json({ ok: true, value: { rows: state !== null && state.includes('needs_you') ? [thread()] : [thread({ id: 'IN3', state: 'done', to_agent: 'codex', taken_by: 'S2' })], cursor: null } });
    if (u.pathname.endsWith('/api/get')) return json({ ok: true, value: { fields: { agent: 'claude' } } });
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } });
  };
  const back = await readToldBack('http://x.test', io as typeof fetch);
  assert.deepEqual(back?.needs.map((t) => t.id), ['IN4']);
  assert.deepEqual(back?.done.map((t) => t.id), ['IN3']);
  assert.deepEqual(back?.agents, { S1: 'claude' }, 'a thread that names its agent costs no read of its run');
  assert.equal(asked.filter((a) => a.startsWith('get')).length, 1);
});

test('a record that refuses both reads keeps what was heard', async () => {
  const io = async () => json({ ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: 'Owner only.' } });
  assert.equal(await readToldBack('http://x.test', io as typeof fetch), null);
  assert.deepEqual(rowsOf({ ok: true, value: { rows: [{ id: 'IN1' }, 'x', thread()] } }).map((t) => t.id), ['IN4'], 'a row of another shape is dropped');
});

test('only a move in the last two minutes rings, so opening the app rings for nothing old', () => {
  const fresh = thread({ replied_at: new Date(NOW - 30_000).toISOString() });
  const old = thread({ id: 'IN2', state: 'done', replied_at: new Date(NOW - TOLD_RING_MS - 1).toISOString() });
  assert.deepEqual(toldMoves({ needs: [fresh], done: [old], agents: {} }, NOW).map((t) => [t.id, t.state]), [['IN4', 'needs_you']]);
});

test('what was finished today is today on the record’s clock', () => {
  const today = thread({ id: 'IN5', state: 'done', replied_at: '2026-09-03T08:00:00Z' });
  const before = thread({ id: 'IN6', state: 'done', replied_at: '2026-09-01T08:00:00Z' });
  assert.deepEqual(doneToday([today, before], NOW).map((t) => t.id), ['IN5']);
});

test('a line names the agent, never the run, and says his words short and on one line', () => {
  assert.equal(answeredBy(thread(), { S1: 'claude' }), 'Claude');
  assert.equal(answeredBy(thread({ to_agent: 'codex' }), {}), 'Codex');
  assert.equal(answeredBy(thread({ taken_by: null }), {}), 'An agent');
  const need = toldNeedOf(thread(), { S1: 'claude' });
  assert.equal(need.line, 'Claude needs you on “Merge wave 1, then stop”');
  assert.equal(need.reply, 'Merged. Should I rehearse it on a copy first?');
  assert.doesNotMatch(`${need.line} ${need.reply}`, /\bS1\b|\bIN4\b|—/u);
  assert.equal(saidShort('x'.repeat(80), 20).length, 20);
  assert.match(saidShort('x'.repeat(80), 20), /…$/u);
});

test('the shell counts what came back in the badge and rings it as the app’s alert', () => {
  const layout = readFileSync(new URL('../shell/AppFrame.svelte', import.meta.url), 'utf8');
  assert.match(layout, /needYouCount\(waitsNow\(\), data\.open, toldNow\(\)\.needs\.length\)/u);
  assert.match(layout, /instructionAlert\(t\)/u);
  assert.match(layout, /toldReadable\(got\.boot\.registers/u, 'read again whenever the poll re-reads boot');
});
