import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { TrustStanding } from '@braindog/client';
import { readTrust, trustLines, words } from './trust.ts';

/* Noon UTC, so the day reads the same in any zone a test runs in. */
const NOW = Date.parse('2026-10-13T12:00:00Z');
const at = (day: string): string => `${day}T12:00:00.000Z`;

type Agent = TrustStanding['agents'][number];
type Kind = Agent['kinds'][number];
const kind = (k: string, rung: Kind['rung'], day: string, more: Partial<Kind> = {}): Kind => ({ kind: k, rung, since: at(day), lifted: false, dropped: null, ...more });
const agent = (name: string, kinds: Kind[], day: string | null = '2026-09-20'): Agent => ({ agent: name, connected: day === null ? null : at(day), kinds });
const said = (agents: Agent[]): string[] => trustLines({ agents }, NOW).map((l) => l.text);

test('a standing becomes one line an agent and kind, in words', () => {
  assert.deepEqual(said([agent('Claude Code', [kind('add tasks', 'quiet', '2026-10-03'), kind('mark tasks done', 'tell', '2026-10-05')])]), [
    'Claude Code may add tasks and do it quietly since 3 Oct',
    'Claude Code may mark tasks done and tell you since 5 Oct',
  ]);
});

test('a kind at Ask says it asks, and one put back says when and why', () => {
  assert.deepEqual(said([agent('Cursor', [kind('change projects', 'ask', '2026-10-01')])]), ['Cursor asks before it may change projects']);
  const back = trustLines({ agents: [agent('Cursor', [kind('add tasks', 'ask', '2026-10-09', { dropped: { at: at('2026-10-09'), why: 'A change like this was undone.' } })])] }, NOW);
  assert.equal(back[0]?.text, 'Cursor asks before it may add tasks, put back on 9 Oct');
  assert.equal(back[0]?.why, 'A change like this was undone.');
  assert.equal(back[0]?.back, true);
});

test('an agent with no rung yet is one line that says everything asks', () => {
  assert.deepEqual(said([agent('Codex', [])]), ['Codex asks before every change']);
});

test('two grants of one label show the day each was connected', () => {
  const lines = said([
    agent('Claude Code', [kind('add tasks', 'quiet', '2026-10-03')], '2026-09-20'),
    agent('Claude Code 2', [kind('add tasks', 'ask', '2026-10-06')], '2026-10-06'),
    agent('Cursor', [], '2026-10-01'),
  ]);
  assert.deepEqual(lines, [
    'Claude Code, connected 20 Sep, may add tasks and do it quietly since 3 Oct',
    'Claude Code 2, connected 6 Oct, asks before it may add tasks',
    'Cursor asks before every change',
  ]);
});

test('a host that names two grants alike still tells them apart by day', () => {
  const lines = said([agent('claude  code', [], '2026-09-20'), agent('Claude Code', [], '2026-10-06')]);
  assert.deepEqual(lines, ['claude  code, connected 20 Sep, asks before every change', 'Claude Code, connected 6 Oct, asks before every change']);
});

test('Slash, which no grant connects, carries no day', () => {
  assert.deepEqual(said([agent('Slash', [kind('tag tasks', 'tell', '2026-10-02')], null)]), ['Slash may tag tasks and tell you since 2 Oct']);
});

test('a day in another year says its year', () => {
  assert.deepEqual(said([agent('Codex', [kind('add tasks', 'tell', '2025-12-30')])]), ['Codex may add tasks and tell you since 30 Dec 2025']);
});

test('no line carries an id, an em dash or a rung key', () => {
  const lines = said([agent('Claude Code', [kind('add tasks', 'quiet', '2026-10-03'), kind('change projects', 'ask', '2026-10-01')])]);
  for (const l of [...lines, ...Object.values(words)]) {
    assert.doesNotMatch(l, /—/u);
    assert.doesNotMatch(l, /\b(quiet|tell|ask)\b(?! you| before)/u);
  }
});

test('every line has a key of its own, so a list can be drawn from them', () => {
  const lines = trustLines({ agents: [agent('A', [kind('add tasks', 'tell', '2026-10-03'), kind('tag tasks', 'tell', '2026-10-03')]), agent('B', [])] }, NOW);
  assert.equal(new Set(lines.map((l) => l.key)).size, lines.length);
});

test('a refused call (a member) draws nothing', async () => {
  const refused = { trust: async () => ({ ok: false as const, refusal: { code: 'FORBIDDEN', fix: 'Where agents stand is for the owner of this record to read, so nothing was read.' } }) };
  assert.equal(await readTrust(refused), null);
});

test('a host built before the call, or one that answers something else, draws nothing', async () => {
  assert.equal(await readTrust({ trust: async () => { throw new Error('ROUTE_UNKNOWN'); } }), null);
  assert.equal(await readTrust({ trust: async () => ({ ok: true as const, value: { nothing: true } }) }), null);
});

test('the owner is answered, and no agent connected reads as an empty ladder', async () => {
  const value: TrustStanding = { agents: [agent('Codex', [])] };
  assert.deepEqual(await readTrust({ trust: async () => ({ ok: true as const, value }) }), value);
  assert.deepEqual(trustLines({ agents: [] }, NOW), []);
  assert.match(words.empty, /^[^.]+\.$/u);
});
