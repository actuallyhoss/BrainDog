/**
 * `/vault` and the approval it shares with `/settings/agents`: the rows each section draws, the one
 * approval both screens send, and the plan offered after connecting an agent.
 *
 * WHAT IS PROVED HERE IS WHAT NEVER REACHES THE SCREEN as much as what does: no row this module builds
 * carries a value, a code or a handle in anything a person reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DeviceRow } from '@braindog/client';

import { copy } from '../copy.ts';
import { VAULT, VAULT_GRANTS, VAULT_OPENED } from './data.ts';
import {
  GLOBAL, VAULT_ALL_DAYS, VAULT_DAYS, answerLine, approve, asks, daysFor, holders, keysOf, namesOf, planOf, reprove, revoke,
  reconnectOf, sampleGrants, sampleKeys, sampleNames, scopeName, words,
} from './vault.ts';

const row = (over: Partial<DeviceRow>): DeviceRow => ({
  handle: 'h1',
  status: 'pending',
  reach: 'vault',
  scope: 'row_kiln',
  label: 'Build box',
  ua: null,
  tries: 0,
  expires: '2026-09-15T12:10:00.000Z',
  approved_by: null,
  approved_at: null,
  last_used: null,
  ...over,
});

/* ── the approval ── */

test('a malformed code is refused before anything is sent', async () => {
  let sent = 0;
  const client = { deviceApprove: async () => ((sent++, { ok: true as const, value: { handle: 'h', reach: 'vault' as const, scope: '*', label: null, ua: null } })) };
  assert.deepEqual(await approve('12 34', client), { kind: 'malformed', why: 'short', digits: 4 });
  assert.deepEqual(await approve('', client), { kind: 'malformed', why: 'empty', digits: 0 });
  assert.equal(sent, 0);
});

test('with no record the demo says it cannot approve, and sends nothing', async () => {
  assert.deepEqual(await approve('123456', null), { kind: 'demo' });
  assert.equal(answerLine({ kind: 'demo' })?.line, copy.notOnDemo);
});

test('the code is sent without its separators, and each answer is read the way Settings reads it', async () => {
  const asked: string[] = [];
  const ok = { deviceApprove: async (a: { user_code: string }) => (asked.push(a.user_code), { ok: true as const, value: { handle: 'h', reach: 'vault' as const, scope: '*', label: 'Laptop', ua: null } }) };
  const approved = await approve('123 456', ok);
  assert.deepEqual(asked, ['123456']);
  assert.equal(approved.kind, 'approved');
  assert.deepEqual(answerLine(approved), { tone: 'good', line: copy.approvedNow('Laptop', copy.reachMeans.vaultAll ?? '') });

  const no = (code: string) => ({ deviceApprove: async () => ({ ok: false as const, refusal: { code, fix: `said ${code}` } }) });
  assert.equal(answerLine(await approve('123456', no('FORBIDDEN')))?.line, copy.codeWrong);
  assert.equal(answerLine(await approve('123456', no('NEEDS_BROWSER_SESSION')))?.line, copy.signInAgainWhy);
  assert.equal(answerLine(await approve('123456', no('SOMETHING_NOBODY_MAPPED')))?.line, 'said SOMETHING_NOBODY_MAPPED');
  assert.deepEqual(await approve('123456', { deviceApprove: async () => ({ ok: false as const, conflict: {} }) }), { kind: 'wrong' });
  assert.equal(answerLine(null), null);
});

test('signing in again uses a passkey where one works, and goes to /signin where it does not', async () => {
  const went: string[] = [];
  const go = (href: string) => went.push(href);
  const auth = (passkey: boolean, signed: boolean) => ({
    support: () => ({ webauthn: true, secure: true }),
    methods: async () => ({ ok: true as const, value: { passkey } }),
    passkeySignIn: async () => ({ ok: signed }),
  });
  assert.equal(await reprove(auth(true, true), go), true);
  assert.deepEqual(went, []);
  assert.equal(await reprove(auth(false, true), go), false);
  assert.deepEqual(went, ['/signin']);
});

test('a revoke replaces the one row, or says why not', async () => {
  const rows = [row({ handle: 'a', status: 'active' }), row({ handle: 'b', status: 'active' })];
  const done = await revoke({ revokeDevice: async (a) => ({ ok: true, value: row({ handle: a.handle, status: 'revoked' }) }) }, rows, 'b');
  assert.ok(done.ok);
  assert.deepEqual(done.rows.map((r) => r.status), ['active', 'revoked']);
  const refused = await revoke({ revokeDevice: async () => ({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again.' } }) }, rows, 'b');
  assert.deepEqual(refused, { ok: false, fix: 'Sign in again.' });
});

/* ── the machines ── */

test('a request waiting is a pending vault grant, and a holder is an approved or active one', () => {
  const rows = [
    row({ handle: 'p', status: 'pending' }),
    row({ handle: 'a', status: 'active' }),
    row({ handle: 'ap', status: 'approved' }),
    row({ handle: 'x', status: 'expired' }),
    row({ handle: 'r', status: 'revoked' }),
    row({ handle: 'l', status: 'pending', reach: 'login' }),
  ];
  assert.deepEqual(asks(rows).map((r) => r.handle), ['p']);
  assert.deepEqual(holders(rows).map((r) => r.handle), ['a', 'ap']);
});

test('a project grant lasts thirty days and a global one seven, and the scope is said by name', () => {
  assert.equal(daysFor('row_kiln'), VAULT_DAYS);
  assert.equal(daysFor(GLOBAL), VAULT_ALL_DAYS);
  assert.match(copy.reachMeans.vault ?? '', /thirty days/);
  assert.match(copy.reachMeans.vaultAll ?? '', /seven days/);
  const names = namesOf([{ id: 'row_kiln', fields: { name: 'Kiln' } }, { id: 'row_x', fields: {} }]);
  assert.equal(scopeName('row_kiln', names), 'Kiln');
  assert.equal(scopeName(GLOBAL, names), words.global);
  assert.equal(scopeName('row_gone', names), words.someProject, 'a project this screen cannot name is not printed by its id');
});

/* ── the keys ── */

test('a key row joins its grant for the counts, and a row with no grant is an index row', () => {
  const names = new Map([['row_kiln', 'Kiln']]);
  const rows = [
    { id: 'c1', fields: { label: 'Stripe', opens: 'Payments', project: 'row_kiln', value: 'g1' }, state: 'live' },
    { id: 'c2', fields: { label: 'Admin panel', opens: 'The panel', where: '1Password' }, state: 'live' },
    { id: 'c3', fields: { label: 'Old', opens: 'Nothing', value: 'g2' }, state: 'retired' },
    { id: 'c4', fields: { label: 'Briefed', opens: 'x', value: { sealed: true, opened: 2, last_opened: '2026-09-01T00:00:00Z' } }, state: 'live' },
  ];
  const grants = [
    { id: 'g1', opened: 5, last_opened: '2026-09-14T10:00:00Z', revoked_at: null },
    { id: 'g2', opened: 1, last_opened: null, revoked_at: null },
  ];
  const keys = keysOf(rows, grants, names);
  assert.deepEqual(keys.map((k) => k.label), ['Admin panel', 'Briefed', 'Stripe'], 'retired rows are gone and the order is the label');
  assert.deepEqual(keys.find((k) => k.id === 'c1'), { id: 'c1', label: 'Stripe', opens: 'Payments', project: 'Kiln', sealed: true, opened: 5, lastOpened: '2026-09-14T10:00:00Z', grant: 'g1' });
  assert.deepEqual(keys.find((k) => k.id === 'c2'), { id: 'c2', label: 'Admin panel', opens: 'The panel', project: null, sealed: false, opened: 0, lastOpened: null, grant: null });
  assert.equal(keys.find((k) => k.id === 'c4')?.opened, 2);
  /* THE GRANT IS WHAT `revokeGrant` NAMES, and a row that holds its counts instead names none. */
  assert.equal(keys.find((k) => k.id === 'c4')?.grant, null);
});

test('a key whose grant was revoked is not sealed any more', () => {
  const keys = keysOf([{ id: 'c1', fields: { label: 'K', opens: 'o', value: 'g1' } }], [{ id: 'g1', opened: 3, last_opened: null, revoked_at: '2026-09-01' }], new Map());
  assert.equal(keys[0]?.sealed, false);
});

test('NOTHING A PERSON READS CARRIES A VALUE, A CODE OR A HANDLE', () => {
  const keys = keysOf([{ id: 'c1', fields: { label: 'K', opens: 'o', value: 'grant_secret_id' } }], [], new Map());
  for (const k of keys) assert.doesNotMatch(JSON.stringify({ label: k.label, opens: k.opens, project: k.project }), /grant_secret_id/);
  const drawn = [words.waiting, words.keys, words.mayOpen, words.noKeys, words.noKeysHow, words.noMachines, words.notNow, words.packInstalled, words.touches];
  const dash = String.fromCharCode(0x2014);
  for (const line of drawn) assert.ok(!line.includes(dash), 'no em dash on screen');
  assert.match(words.noKeysHow, /braindog keys exec <label> -- <command>/, 'the one way the CLI reads a key is the one named');
  assert.doesNotMatch(words.noKeysHow, /keys get/);
});

/* ── the sample ── */

test('the sample draws one request, machines for a project and for global, and sealed and index keys', () => {
  const machines = sampleGrants(VAULT_GRANTS);
  const names = sampleNames(VAULT_GRANTS, VAULT_OPENED);
  if (VAULT_GRANTS.length === 0) return;
  assert.equal(asks(machines).length, 1);
  assert.ok(holders(machines).some((m) => m.scope === GLOBAL));
  assert.ok(holders(machines).some((m) => scopeName(m.scope, names) === 'Kiln'));
  const keys = sampleKeys(VAULT, VAULT_OPENED);
  assert.equal(keys.length, VAULT.length);
  assert.ok(keys.some((k) => k.sealed) && keys.some((k) => !k.sealed));
  assert.ok(keys.some((k) => k.project === null) && keys.some((k) => k.project !== null));
  for (const id of Object.keys(VAULT_OPENED)) assert.ok(VAULT.some((c) => c.id === id), `${id} is not a sample key`);
});

test('an active sample grant ends when its scope says, and a pending one in ten minutes', () => {
  const [pending, project, global] = sampleGrants([
    { id: 'a', name: 'A', state: 'pending', project: 'Kiln', at: '2026-09-15T12:00:00.000Z', lastSeen: null },
    { id: 'b', name: 'B', state: 'active', project: 'Kiln', at: '2026-09-01T12:00:00.000Z', lastSeen: null },
    { id: 'c', name: 'C', state: 'active', project: null, at: '2026-09-01T12:00:00.000Z', lastSeen: null },
  ]);
  assert.equal(pending?.expires, '2026-09-15T12:10:00.000Z');
  assert.equal(project?.expires, '2026-10-01T12:00:00.000Z');
  assert.equal(global?.expires, '2026-09-08T12:00:00.000Z');
});

/* ── the pack offered on connect ── */

test('a plan from the record reads in the Packs screen words, and keeps its hash', () => {
  const diff = {
    pack: { summary: 'What your agents learn.' },
    adds: [
      { id: 'register.learnings', summary: '9 fields' },
      { id: 'register.tools', summary: '1 fields' },
      { id: 'page.agents', summary: '6 blocks' },
    ],
    conflicts: [{ id: 'register.skills', pack: 'someone' }],
    seeds: { count: 1, registers: [] },
    planHash: '12.abc',
  };
  const names: Record<string, string> = { learnings: 'Learnings', tools: 'Tools', agents: 'Agents', skills: 'Skills' };
  const plan = planOf(diff, (_, id) => names[id] ?? id);
  assert.ok(plan);
  assert.equal(plan.planHash, '12.abc');
  assert.equal(plan.summary, 'What your agents learn.');
  assert.deepEqual(plan.adds, [
    { kind: 'list', name: 'Learnings', detail: '9 fields' },
    { kind: 'list', name: 'Tools', detail: '1 field' },
    { kind: 'page', name: 'Agents', detail: '6 tables and figures' },
  ]);
  assert.deepEqual(plan.conflicts, ['Skills already exists, from someone']);
  assert.equal(plan.seeds, '1 example row, marked example, clearable in one action');
  assert.equal(plan.touches, words.touches);
});

test('a plan that writes no example rows has no line about them, not "0 example rows, marked example"', () => {
  const plan = planOf({ adds: [], seeds: { count: 0, registers: [] }, planHash: '3.def' }, (_, id) => id);
  assert.equal(plan?.seeds, null);
  assert.equal(planOf({ adds: [], planHash: '3.def' }, (_, id) => id)?.seeds, null);
  assert.equal(planOf({ adds: [], seeds: { count: 6, registers: [] }, planHash: '3.def' }, (_, id) => id)?.seeds, '6 example rows, marked example, clearable in one action');
});

test('an answer with no plan hash is no plan, so nothing can be installed from it', () => {
  assert.equal(planOf(null, (_, id) => id), null);
  assert.equal(planOf({ adds: [] }, (_, id) => id), null);
});

test('RECONNECT OPENS THE KEY A PAUSED ACTION NAMED: its row to replace, or Add under that name, and the action to resume', () => {
  const row = { id: 'cred_1', label: 'Stripe read', opens: 'api.stripe.com', project: null, sealed: true, opened: 3, lastOpened: null, grant: 'g_1' };
  const asked = (href: string) => new URL(href, 'https://x.example').searchParams;
  assert.deepEqual(reconnectOf(asked('/vault?reconnect=stripe%20READ&then=stripe-balance'), [row]), { mode: 'replace', row, then: 'stripe-balance' });
  assert.deepEqual(reconnectOf(asked('/vault?reconnect=GitHub%20deploy'), [row]), { mode: 'add', label: 'GitHub deploy', then: null });
  assert.equal(reconnectOf(asked('/vault'), [row]), null);
  assert.equal(reconnectOf(asked('/vault?reconnect=%20&then=x'), [row]), null);
});
