/**
 * Settings › Agents (agents and MCP plan §5): one row per agent with Defaults last, plain words for how far each may
 * go, settings that only narrow once a row is stored, his current agents kept as they are, and the row each save sends.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CONTEXT_BUDGETS as KERNEL_BUDGETS, DEFAULT_PROFILE, PROFILE_KINDS } from '@braindog/kernel';

import { keyScopeOf, seatsHeard, type Run, type TokenRow } from '../record/device.ts';
import {
  BUDGET_WORDS,
  KIND_NAMES,
  KIND_ORDER,
  TOOL_ROWS,
  agentRows,
  argsOf,
  chipName,
  draftOf,
  faultOf,
  followers,
  groupRows,
  hasHooks,
  heardLine,
  machinesLine,
  keepersOf,
  keyDecides,
  narrowed,
  noAgentYet,
  plainSays,
  sameDraft,
  saysOf,
  type Heard,
  type ProfileView,
} from './profile.ts';

const view = (p: Partial<ProfileView> & { id: string }): ProfileView => ({
  ...DEFAULT_PROFILE,
  created_at: '2026-10-20T10:00:00.000Z',
  updated_at: '2026-10-20T10:00:00.000Z',
  by: 'row',
  effective: { says: '', applies: 'name' },
  heard_at: null,
  machines: [],
  ...p,
});
const UNSTORED_DEFAULT = view({ id: 'default', created_at: null, updated_at: null, effective: { says: '', applies: 'default' } });
const STORED_DEFAULT = view({ id: 'default', effective: { says: '', applies: 'default' } });
const heard = (agent: string, seq: number, seen = '2026-10-21T09:00:00.000Z'): Heard => ({ agent, seq, seen, scope: null });
const noKey = () => null;

test('a new record lists no agent it has not heard from: Defaults alone, and the list says none is connected', () => {
  const rows = agentRows({ profiles: [UNSTORED_DEFAULT], heard: [], keyScope: noKey });
  assert.deepEqual(rows.map((r) => r.name), ['Defaults for new agents']);
  assert.equal(noAgentYet(rows), 'No agent connected yet');
});

test('one row per agent heard from, in the usual order, Defaults last', () => {
  const rows = agentRows({ profiles: [UNSTORED_DEFAULT], heard: [heard('agent:other', 3), heard('cursor', 2), heard('claude', 1)], keyScope: noKey });
  assert.deepEqual(rows.map((r) => r.name), ['Claude Code', 'Cursor', 'Other apps', 'Defaults for new agents']);
  assert.equal(rows.at(-1)!.key, 'default');
  assert.equal(noAgentYet(rows), null);
});

test('an agent heard from or given a row of its own gets a row; ids never name one', () => {
  const rows = agentRows({
    profiles: [UNSTORED_DEFAULT, view({ id: 'pf_1', name: 'Gemini', match: { kind: 'gemini' } }), view({ id: 'pf_2', name: 'MacBook · Claude Code', match: { kind: 'claude', token: 'tk_9' } })],
    heard: [heard('agent:copilot', 4)],
    keyScope: noKey,
  });
  const names = rows.map((r) => r.name);
  assert.ok(names.includes('Copilot') && names.includes('Gemini') && names.includes('MacBook · Claude Code'));
  assert.equal(rows.find((r) => r.name === 'MacBook · Claude Code')!.applies, 'token');
  assert.ok(rows.every((r) => !/\b(pf|tk)_/u.test(r.name + r.says)));
});

test('nothing stored: its key decides, and the row it would become starts at Write, which is what the key allows', () => {
  const rows = agentRows({ profiles: [UNSTORED_DEFAULT], heard: [heard('claude', 2), heard('codex', 1)], keyScope: (k) => (k === 'claude' ? 'write' : null) });
  const claude = rows[0]!;
  assert.equal(claude.follows, 'key');
  assert.equal(claude.may, 'write');
  assert.equal(claude.draft.ceiling, 'write');
  /* WHAT THE KEY ALLOWS, AND NOT THAT IT DECIDES: the list says that once (`keyDecides`). */
  assert.equal(claude.says, plainSays('write'));
  assert.ok(!narrowed(claude), 'a plain Write row draws no sentence of its own');
  assert.ok(keyDecides(rows));
  const codex = rows[1]!;
  assert.equal(codex.may, null, 'a key not read is not guessed');
  assert.equal(codex.says, '', 'a key not read says nothing');
});

test('the list groups by agent: profiles hang off their agent as chips, Defaults stays a row', () => {
  const rows = agentRows({
    profiles: [UNSTORED_DEFAULT],
    heard: [heard('claude', 9)],
    seats: [
      { agent: 'claude', seat: 'studio', seq: 9, seen: '2026-10-21T08:00:00.000Z' },
      { agent: 'claude', seat: 'brain', seq: 8, seen: '2026-10-21T07:00:00.000Z' },
    ],
    keyScope: () => 'write',
  });
  const groups = groupRows(rows);
  const claude = groups.find((g) => g.row.key === 'kind:claude')!;
  assert.deepEqual(claude.chips.map(chipName), ['brain', 'studio']);
  assert.ok(!groups.some((g) => g.row.seat), 'no profile is a row of its own');
  assert.equal(groups.at(-1)!.row.name, 'Defaults for new agents');
  assert.equal(chipName({ seat: null, name: 'Claude Code as garden', kind: 'claude' }), 'garden');
});

test('Defaults saved: an agent with no row of its own follows it, at Suggest for a new agent', () => {
  const rows = agentRows({ profiles: [STORED_DEFAULT], heard: [heard('claude', 2), heard('codex', 1)], keyScope: () => 'write' });
  assert.equal(rows[1]!.follows, 'defaults');
  assert.equal(rows[1]!.may, 'propose');
  assert.equal(rows[1]!.says, 'Suggests; every change waits for you.');
  assert.equal(rows.at(-1)!.may, 'propose', 'new agents start at Suggest');
});

test('a stored row speaks for itself: his Claude at Write keeps Write', () => {
  const rows = agentRows({ profiles: [STORED_DEFAULT, view({ id: 'kind-claude', name: 'Claude Code', match: { kind: 'claude' }, ceiling: 'write', heard_at: '2026-10-21T08:00:00.000Z', machines: ['MacBook'] })], heard: [heard('claude', 7)], keyScope: noKey });
  const claude = rows[0]!;
  assert.equal(claude.follows, 'own');
  assert.equal(claude.may, 'write');
  assert.equal(claude.says, 'Writes; asks for money, keys and deletes.');
  assert.deepEqual(claude.heard, { at: '2026-10-21T09:00:00.000Z', seq: 7, scope: null }, 'the newer of the row and the runs');
  assert.deepEqual(claude.machines, ['MacBook']);
});

test('the first save of Defaults keeps his current agents: heard and unset agents get rows of their own first', () => {
  const rows = agentRows({ profiles: [UNSTORED_DEFAULT], heard: [heard('claude', 7), heard('codex', 6)], keyScope: noKey });
  assert.deepEqual(keepersOf(rows).map((r) => r.name), ['Claude Code', 'Codex']);
  assert.deepEqual(followers(rows), [], 'no agent heard from takes the Defaults: each is kept as it is');
  const kept = argsOf(keepersOf(rows)[0]!, keepersOf(rows)[0]!.draft);
  assert.equal(kept.ceiling, 'write');
  assert.deepEqual(kept.match, { kind: 'claude' });
  assert.equal(kept.name, 'Claude Code');
  /* AND ONCE DEFAULTS IS STORED, NOBODY IS KEPT AGAIN. */
  assert.deepEqual(keepersOf(agentRows({ profiles: [STORED_DEFAULT], heard: [heard('claude', 7)], keyScope: noKey })), []);
});

test('what an agent may do, in plain words', () => {
  const names = (s: string) => ({ tasks: 'Tasks', notes: 'Notes', P3: 'Kiln' })[s] ?? s;
  assert.equal(saysOf({ ceiling: 'read', projects: null, lists_write: null }), 'Reads only; every change is refused.');
  assert.equal(saysOf({ ceiling: 'propose', projects: ['P3'], lists_write: ['tasks'] }), 'Suggests; every change waits for you.');
  assert.equal(saysOf({ ceiling: 'write', projects: ['P3'], lists_write: ['tasks', 'notes'] }, names), 'Writes Tasks and Notes on Kiln; asks for money, keys and deletes, and anything outside that.');
  assert.equal(saysOf({ ceiling: 'write', projects: null, lists_write: [] }), 'Writes nothing on its own; asks for money, keys and deletes, and anything outside that.');
});

test('a save sends the row it would write: by id when stored, by kind when not, Defaults by its id', () => {
  const [claude, dflt] = agentRows({ profiles: [UNSTORED_DEFAULT], heard: [heard('claude', 1)], keyScope: noKey });
  const d = { ...claude!.draft, brief: '  Small commits.  ', model: '', tools: { create: false }, caps: { jobs_day: 5 } };
  const sent = argsOf(claude!, d);
  assert.equal(sent.id, undefined);
  assert.deepEqual(sent.match, { kind: 'claude' });
  assert.equal(sent.brief, 'Small commits.');
  assert.equal(sent.model, null);
  assert.deepEqual(sent.tools, { create: false });
  assert.deepEqual(sent.caps, { jobs_day: 5 });
  assert.deepEqual(argsOf(dflt!, dflt!.draft).id, 'default');
  const stored = agentRows({ profiles: [STORED_DEFAULT, view({ id: 'kind-codex', name: 'Codex', match: { kind: 'codex' } })], heard: [], keyScope: noKey })[0]!;
  assert.equal(argsOf(stored, stored.draft).id, 'kind-codex');
  assert.equal(argsOf(stored, { ...stored.draft, notify: { on: 'long', minutes: 30, by: 'push' } }).notify && (argsOf(stored, { ...stored.draft, notify: { on: 'long', minutes: 30, by: 'push' } }).notify as { minutes: number }).minutes, 30);
});

test('a draft that changed nothing is the same draft, whatever order its lists were picked in', () => {
  const a = draftOf({ ...DEFAULT_PROFILE, projects: ['a', 'b'] });
  assert.ok(sameDraft(a, { ...a, projects: ['b', 'a'], brief: '' }));
  assert.ok(!sameDraft(a, { ...a, ceiling: 'write' }));
});

test('faults are caught before a save, in the sheet’s words', () => {
  const d = draftOf(DEFAULT_PROFILE);
  assert.equal(faultOf(d), null);
  assert.equal(faultOf({ ...d, caps: { jobs_day: 501 } })?.at, 'caps.jobs_day');
  assert.equal(faultOf({ ...d, notify: { on: 'long', by: 'push' } })?.at, 'notify.minutes');
  assert.equal(faultOf({ ...d, brief: 'x'.repeat(4001) })?.at, 'brief');
});

test('the safe defaults: Suggest, every tool on, the stop switch on, live push off', () => {
  const d = draftOf(DEFAULT_PROFILE);
  assert.equal(d.ceiling, 'propose');
  assert.deepEqual(d.tools, {});
  assert.deepEqual(d.enforce, { hooks: true, channel: false });
  assert.equal(d.context.budget, 700);
});

test('the stop switch and live push are Claude Code’s; Defaults covers it too', () => {
  assert.ok(hasHooks({ key: 'kind:claude', kind: 'claude' }));
  assert.ok(hasHooks({ key: 'default', kind: null }));
  assert.ok(!hasHooks({ key: 'kind:codex', kind: 'codex' }));
});

test('the line under a name: working now, last heard, or not yet, then its machines', () => {
  const ago = () => '3 min ago';
  assert.equal(heardLine({ key: 'kind:claude', heard: { at: 'x', seq: 1, scope: null } }, true, ago), 'Working now');
  assert.equal(heardLine({ key: 'kind:claude', heard: { at: 'x', seq: 1, scope: null } }, false, ago), 'Last heard 3 min ago');
  assert.equal(heardLine({ key: 'kind:claude', heard: { at: 'x', seq: 1, scope: null } }, false, () => '1d ago'), 'Last heard yesterday');
  assert.equal(heardLine({ key: 'kind:codex', heard: null }, false, ago), 'Not heard from yet');
  assert.equal(heardLine({ key: 'default', heard: null }, false, ago), null);
  assert.equal(machinesLine([]), null);
  assert.equal(machinesLine(['kiln-mbp']), 'MacBook Pro');
  assert.equal(machinesLine(['kiln-mbp', 'studio-desktop']), 'MacBook Pro and 1 more');
});

test('the key behind a kind’s newest run decides while nothing is stored', () => {
  const runs: Run[] = [
    { seq: 9, token: 't2', agent: 'agent:codex', host: null },
    { seq: 8, token: 't1', agent: 'claude', host: null },
    { seq: 7, token: 't3', agent: null, host: null },
  ];
  const tokens = [{ id: 't1', scope: 'write' }, { id: 't2', scope: 'propose' }, { id: 't3', scope: 'read' }] as TokenRow[];
  assert.equal(keyScopeOf('claude', runs, tokens), 'write');
  assert.equal(keyScopeOf('codex', runs, tokens), 'propose');
  assert.equal(keyScopeOf('other', runs, tokens), 'read');
  assert.equal(keyScopeOf('cursor', runs, tokens), null);
});

test('the kinds and sizes are the kernel’s', () => {
  for (const k of KIND_ORDER) assert.ok((PROFILE_KINDS as readonly string[]).includes(k));
  for (const k of PROFILE_KINDS) assert.ok(Object.hasOwn(KIND_NAMES, k), `${k} has no name`);
  assert.deepEqual(Object.keys(BUDGET_WORDS).map(Number), [...KERNEL_BUDGETS]);
});

test('every tool the MCP lists has a switch, and no switch names a tool it does not list', () => {
  const src = readFileSync(new URL('../../../../../packages/mcp/src/index.ts', import.meta.url), 'utf8');
  const from = src.indexOf('export const TOOLS');
  const body = src.slice(from, src.indexOf('\n];', from));
  const listed = [...body.matchAll(/^ {4}name: '([a-z_]+)',$/gmu)].map((m) => m[1]!).filter((n) => n !== 'schema' && n !== 'history');
  assert.deepEqual([...TOOL_ROWS.map((t) => t.name)].sort(), [...new Set(listed)].sort());
  assert.deepEqual(TOOL_ROWS.filter((t) => t.always).map((t) => t.name), ['context', 'instructions'], 'how it hears him is never switched off');
});

test('A ROW PER CLAUDE CODE PROFILE OF HIS: it follows its kind until saved, and its first save matches the kind under that profile', () => {
  const NOW = Date.parse('2026-10-22T09:00:00.000Z');
  const runs = [
    { seq: 7, fields: { agent: 'claude', seat: 'harbour', last_seen: '2026-10-22T08:00:00.000Z' } },
    { seq: 5, fields: { agent: 'claude', seat: 'harbour', last_seen: '2026-10-21T08:00:00.000Z' } },
    { seq: 6, fields: { agent: 'claude', seat: 'default', last_seen: '2026-10-22T07:00:00.000Z' } },
    { seq: 2, fields: { agent: 'claude', seat: 'garden', last_seen: '2026-08-01T08:00:00.000Z' } },
  ];
  const seats = seatsHeard(runs, NOW);
  assert.deepEqual(seats.map((h) => [h.agent, h.seat, h.seq]), [['claude', 'harbour', 7], ['claude', 'default', 6]]);

  const claude = view({ id: 'pf_c', name: 'Claude Code', match: { kind: 'claude' }, ceiling: 'write' });
  const rows = agentRows({ profiles: [STORED_DEFAULT, claude], heard: [heard('claude', 7)], seats, keyScope: noKey });
  const harbour = rows.find((r) => r.name === 'Claude Code as harbour')!;
  assert.deepEqual([harbour.kind, harbour.seat, harbour.follows, harbour.may, harbour.stored], ['claude', 'harbour', 'kind', 'write', null]);
  assert.ok(!rows.some((r) => r.name === 'Claude Code as default'), 'the default profile is its kind’s own row');
  assert.ok(!followers(rows).includes('Claude Code as harbour'), 'a profile’s row follows its kind, not Defaults');
  assert.deepEqual(argsOf(harbour, harbour.draft).match, { kind: 'claude', seat: 'harbour' });
  assert.equal(argsOf(harbour, harbour.draft).name, 'Claude Code as harbour');

  /* SAVED, IT IS ITS OWN ROW, beside its kind and before the rows bound to one key. */
  const saved = view({ id: 'pf_q', name: 'Claude Code as harbour', match: { kind: 'claude', seat: 'harbour' }, ceiling: 'read' });
  const again = agentRows({ profiles: [STORED_DEFAULT, claude, saved], heard: [heard('claude', 7)], seats, keyScope: noKey });
  const own = again.filter((r) => r.seat === 'harbour');
  assert.deepEqual(own.map((r) => [r.key, r.follows, r.may]), [['pf_q', 'own', 'read']]);
  assert.deepEqual(argsOf(own[0]!, own[0]!.draft).id, 'pf_q');
});
