import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { TrustStanding } from '@braindog/client';
import { readTrust, takeBack, trustLines, words } from './trust.ts';

/* Noon UTC, so the day reads the same in any zone a test runs in. */
const NOW = Date.parse('2026-10-13T12:00:00Z');
const at = (day: string): string => `${day}T12:00:00.000Z`;

type Agent = TrustStanding['agents'][number];
type Kind = Agent['kinds'][number];
const kind = (k: string, rung: Kind['rung'], day: string, more: Partial<Kind> = {}): Kind => ({ kind: k, rung, since: at(day), lifted: false, dropped: null, ...more });
const agent = (name: string, kinds: Kind[], day: string | null = '2026-09-20'): Agent => ({ agent: name, connected: day === null ? null : at(day), asking: null, kinds });
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

test('an agent marked asking keeps where its run read from, and one sent without it reads as not asking', async () => {
  const asking = { ...agent('Codex', []), asking: { from: 'the inbox', at: at('2026-10-12') } };
  const value = { agents: [asking, { agent: 'Cursor', connected: null, kinds: [] }] };
  const out = await readTrust({ trust: async () => ({ ok: true as const, value }) });
  assert.deepEqual(out?.agents.map((a) => a.asking), [{ from: 'the inbox', at: at('2026-10-12') }, null]);
});

test('the owner\'s way down and what never climbs, in his words', () => {
  assert.equal(words.askAgain, 'Ask again');
  assert.equal(words.asksFirst, 'Asks first: everything else this agent does.');
  assert.equal(words.alwaysAsks, 'Always asks: amounts of money, keys, sharing, and deleting.');
});

test('a kind done on its own carries Ask again with the agent and kind as the record said them, and one that asks carries none', () => {
  const lines = trustLines(
    {
      agents: [
        agent('Claude Code', [kind('add tasks', 'quiet', '2026-10-03'), kind('change projects', 'ask', '2026-10-01'), kind('tag tasks', 'tell', '2026-10-04')], '2026-09-20'),
        agent('Claude Code 2', [kind('add tasks', 'tell', '2026-10-06')], '2026-10-06'),
        agent('Codex', []),
      ],
    },
    NOW,
  );
  assert.deepEqual(
    lines.map((l) => l.take),
    [
      { agent: 'Claude Code', kind: 'add tasks' },
      null,
      { agent: 'Claude Code', kind: 'tag tasks' },
      /* THE NAME THE RECORD GAVE, never the line's own "connected 6 Oct", which is for a person to read. */
      { agent: 'Claude Code 2', kind: 'add tasks' },
      null,
    ],
  );
});

test('Ask again sends the agent and the kind to trustTakeBack, and says the record\'s sentence when it is refused', async () => {
  const heard: [string, Record<string, unknown>][] = [];
  const done = await takeBack({ call: async (name, args) => (heard.push([name, args]), { ok: true, value: { agents: [] } }) }, { agent: 'Cursor', kind: 'add tasks' });
  assert.deepEqual(done, { ok: true });
  assert.deepEqual(heard, [['trustTakeBack', { agent: 'Cursor', kind: 'add tasks' }]]);

  const fix = 'Open this from the app; a token cannot put an agent back to asking.';
  assert.deepEqual(await takeBack({ call: async () => ({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix } }) }, { agent: 'Cursor', kind: 'add tasks' }), { ok: false, fix });
  const lost = await takeBack({ call: async () => { throw new Error('offline'); } }, { agent: 'Cursor', kind: 'add tasks' });
  assert.equal(lost.ok, false);
  assert.match(lost.ok ? '' : lost.fix, /Nothing was changed\.$/u, 'a press that never landed says nothing moved');
  assert.doesNotMatch(lost.ok ? '' : lost.fix, /—/u);
});
