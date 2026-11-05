/**
 * `/keychain` and the approval it shares with `/settings/agents`: the rows each section draws, the one
 * approval both screens send, and the plan offered after connecting an agent.
 *
 * WHAT IS PROVED HERE IS WHAT NEVER REACHES THE SCREEN as much as what does: no row this module builds
 * carries a value, a code or a handle in anything a person reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Client, DeviceRow } from '@braindog/client';

import { copy } from '../copy.ts';
import * as keychain from './keychain.ts';
import {
  GLOBAL, KEYCHAIN_ALL_DAYS, KEYCHAIN_DAYS, answerLine, approve, asks, daysFor, foldedAdds, holders, keysOf, namesOf, packSaid, planOf, reprove, revoke,
  READ_ALL_PAGES, RECONNECT_STATE, readAll, reconnectFrom, reconnectOf, scopeName, words,
  type GrantState, type KeyRow, type ReconnectState,
} from './keychain.ts';

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
  const row = { handle: 'h', reach: 'vault' as const, scope: '*', label: null, ua: null };
  const client = {
    deviceLook: async () => ((sent++, { ok: true as const, value: { ...row, expires: '', project: null, keys: [], more: 0 } })),
    deviceApprove: async () => ((sent++, { ok: true as const, value: row })),
  };
  assert.deepEqual(await approve('12 34', client), { kind: 'malformed', why: 'short', digits: 4 });
  assert.deepEqual(await approve('', client), { kind: 'malformed', why: 'empty', digits: 0 });
  assert.equal(sent, 0);
});

/*
 * WITH NO CLIENT THERE IS NOBODY SIGNED IN TO APPROVE AS, and signing in is the way forward. This answered
 * `{ kind: 'demo' }` and drew "The demo has no account", which was true only while `/` with no session was
 * the sample record; with the sample gone the same state is a person who has to sign in.
 */
test('with no client the answer is to sign in, and nothing is sent', async () => {
  const answer = await approve('123456', null);
  assert.deepEqual(answer, { kind: 'signin' });
  assert.equal(answerLine(answer)?.line, copy.signInAgainWhy);
  assert.doesNotMatch(answerLine(answer)?.line ?? '', /demo/iu);
  /* A MALFORMED ENTRY IS STILL SAID FIRST, because it is the mistake the person can fix on this screen. */
  assert.equal((await approve('12', null)).kind, 'malformed');
});

test('the sample is gone from this module: nothing here builds a Keychain that is not the record', () => {
  assert.deepEqual(Object.keys(keychain).filter((k) => /^sample/i.test(k)), []);
});

test('the code is sent without its separators, and each answer is read the way Settings reads it', async () => {
  const asked: string[] = [];
  const row = { handle: 'h', reach: 'vault' as const, scope: '*', label: 'Laptop', ua: null };
  const ok = {
    deviceLook: async (a: { user_code: string }) => (asked.push(a.user_code), { ok: true as const, value: { ...row, expires: '', project: null, keys: ['A key'], more: 0 } }),
    deviceApprove: async (a: { user_code: string; handle: string }) => (asked.push(`${a.user_code}/${a.handle}`), { ok: true as const, value: row }),
  };
  /* THE CODE ALONE LOOKS. Only the handle that look answered approves. */
  assert.equal((await approve('123 456', ok)).kind, 'looked');
  assert.equal(answerLine(await approve('123 456', ok)), null);
  const approved = await approve('123 456', ok, 'h');
  assert.deepEqual(asked, ['123456', '123456', '123456/h']);
  assert.equal(approved.kind, 'approved');
  assert.deepEqual(answerLine(approved), { tone: 'good', line: copy.approvedNow('Laptop', copy.reachMeans.vaultAll ?? '') });

  const no = (code: string) => {
    const out = async () => ({ ok: false as const, refusal: { code, fix: `said ${code}` } });
    return { deviceLook: out, deviceApprove: out };
  };
  assert.equal(answerLine(await approve('123456', no('FORBIDDEN')))?.line, copy.codeWrong);
  assert.equal(answerLine(await approve('123456', no('NEEDS_BROWSER_SESSION')))?.line, copy.signInAgainWhy);
  assert.equal(answerLine(await approve('123456', no('SOMETHING_NOBODY_MAPPED')))?.line, 'said SOMETHING_NOBODY_MAPPED');
  const conflict = async () => ({ ok: false as const, conflict: {} });
  assert.deepEqual(await approve('123456', { deviceLook: conflict, deviceApprove: conflict }), { kind: 'wrong' });
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
  /* UNDER THE APP: a bare `/signin` on `brain.dog` is the marketing site's 404 page. */
  assert.deepEqual(went, ['/signin']);

  /* AND BACK TO THE SCREEN THAT ASKED, which is the step the person was half way through. */
  const was = globalThis.location;
  Object.defineProperty(globalThis, 'location', { value: { pathname: '/acme/keychain', search: '?reconnect=k' }, configurable: true, writable: true });
  try {
    await reprove(auth(false, true), go);
    assert.equal(went.at(-1), '/signin?next=%2Facme%2Fkeychain%3Freconnect%3Dk');
  } finally {
    Object.defineProperty(globalThis, 'location', { value: was, configurable: true, writable: true });
  }
});

test('a revoke replaces the one row, or says why not', async () => {
  const rows = [row({ handle: 'a', status: 'active' }), row({ handle: 'b', status: 'active' })];
  const done = await revoke({ revokeDevice: async (a) => ({ ok: true, value: row({ handle: a.handle, status: 'revoked' }) }) }, rows, 'b');
  assert.ok(done.ok);
  assert.deepEqual(done.rows.map((r) => r.status), ['active', 'revoked']);
  const refused = await revoke({ revokeDevice: async () => ({ ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again.' } }) }, rows, 'b');
  assert.deepEqual(refused, { ok: false, fix: 'Sign in again.' });
  /* A CONFLICT CARRIES NO SENTENCE, and the one it borrowed was the demo's, drawn over a live record. */
  const raced = await revoke({ revokeDevice: async () => ({ ok: false, conflict: {} }) }, rows, 'b');
  assert.deepEqual(raced, { ok: false, fix: copy.writeRaced });
});

/* ── the machines ── */

test('a request waiting is a pending keychain access, and a holder is an approved or active one', () => {
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
  assert.equal(daysFor('row_kiln'), KEYCHAIN_DAYS);
  assert.equal(daysFor(GLOBAL), KEYCHAIN_ALL_DAYS);
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
  /* `scope` IS THE CHIP'S OWN SHAPE: the project's spoken id, name, mark and hue, built from the same
     `project` row `names` already looked up, or `null` for a global key. `names` here carries no `.marks`, so a
     scoped row's mark and hue read `null` and its spoken id falls back to the project's bare id. */
  assert.deepEqual(keys.find((k) => k.id === 'c1'), {
    id: 'c1',
    spoken: null,
    label: 'Stripe',
    opens: 'Payments',
    project: 'Kiln',
    scope: { spoken: 'row_kiln', name: 'Kiln', mark: null, hue: null },
    sealed: true,
    opened: 5,
    lastOpened: '2026-09-14T10:00:00Z',
    grant: 'g1',
  });
  assert.deepEqual(keys.find((k) => k.id === 'c2'), { id: 'c2', spoken: null, label: 'Admin panel', opens: 'The panel', project: null, scope: null, sealed: false, opened: 0, lastOpened: null, grant: null, kept: true });
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
  const drawn = [words.waiting, words.keys, words.mayOpen, words.noKeys, words.noKeysHow, words.noMachines, words.notNow, words.packInstalled, words.touches, words.offerTitle, words.moreFigures(36)];
  const dash = String.fromCharCode(0x2014);
  for (const line of drawn) assert.ok(!line.includes(dash), 'no em dash on screen');
  assert.equal(words.noKeysCommand, 'braindog keys put <name>', 'the one way an agent adds a key is the one named, on its own line');
  for (const line of [words.noKeysHow, words.noKeysCommand]) assert.doesNotMatch(line, /keys get/);
});

test('A SEALED ROW SAYS WHAT IT IS UNOPENED: its size and its hint, from the grant or from what a briefing already knew', () => {
  const rows = [
    { id: 'c1', fields: { label: 'A joined', opens: 'o', value: 'g1' } },
    { id: 'c2', fields: { label: 'B briefed', opens: 'o', value: { sealed: true, opened: 1, last_opened: null, bytes: 12, hint: 'a 12-character value' } } },
  ];
  const keys = keysOf(rows, [{ id: 'g1', opened: 0, last_opened: null, revoked_at: null, bytes: 40, hint: 'a 40-character value' }], new Map());
  assert.deepEqual(keys.map((k) => [k.bytes, k.hint]), [[40, 'a 40-character value'], [12, 'a 12-character value']]);
});

test('A ROW WITH NO VALUE, AN OLDER SEAL OR A REVOKED ONE CARRIES NEITHER, and a fact that is not one is not drawn', () => {
  const rows = [
    { id: 'c1', fields: { label: 'A none', opens: 'o', where: '1Password' } },
    { id: 'c2', fields: { label: 'B older', opens: 'o', value: 'g_old' } },
    { id: 'c3', fields: { label: 'C nulls', opens: 'o', value: 'g_null' } },
    { id: 'c4', fields: { label: 'D revoked', opens: 'o', value: 'g_gone' } },
    { id: 'c5', fields: { label: 'E briefed', opens: 'o', value: { sealed: true, opened: 0, last_opened: null } } },
    { id: 'c6', fields: { label: 'F unsealed', opens: 'o', value: { sealed: false, opened: 0, last_opened: null, bytes: 9, hint: 'a 9-character value' } } },
    { id: 'c7', fields: { label: 'G odd', opens: 'o', value: 'g_odd' } },
  ];
  const grants = [
    { id: 'g_old', opened: 2, last_opened: null, revoked_at: null },
    { id: 'g_null', opened: 2, last_opened: null, revoked_at: null, bytes: null, hint: null },
    { id: 'g_gone', opened: 2, last_opened: null, revoked_at: '2026-09-01', bytes: 40, hint: 'a 40-character value' },
    { id: 'g_odd', opened: 0, last_opened: null, revoked_at: null, bytes: -1, hint: '   ' },
  ] as GrantState[];
  const keys = keysOf(rows, grants, new Map());
  assert.equal(keys.length, 7);
  for (const k of keys) {
    assert.equal('bytes' in k, false, `${k.label} carries no size`);
    assert.equal('hint' in k, false, `${k.label} carries no hint`);
  }
  /* A HINT LONGER THAN THE RECORD LETS ONE BE IS NOT A HINT (`packages/kernel/src/keychain.ts`, sixty characters), and the size beside it still is. */
  const [long] = keysOf([rows[1]!], [{ id: 'g_old', opened: 0, last_opened: null, revoked_at: null, bytes: 61, hint: 'x'.repeat(61) }], new Map());
  assert.equal(long?.bytes, 61);
  assert.equal('hint' in (long ?? {}), false);
});

/* ── every page of a list ── */

const page = (from: number, n: number, cursor: string | null) =>
  ({ ok: true as const, value: { rows: Array.from({ length: n }, (_, i) => ({ id: `k${from + i}` })), matched: 405, cursor } });

test('EVERY KEY IS READ, A PAGE AT A TIME: 200, 200 and 5 answer 405 in order, each page asked with the cursor before it', async () => {
  const asked: (string | null)[] = [];
  const pages = [page(0, 200, 'c1'), page(200, 200, 'c2'), page(400, 5, null)];
  const all = await readAll(async (cursor) => (asked.push(cursor), pages[asked.length - 1]!));
  assert.deepEqual(asked, [null, 'c1', 'c2']);
  assert.equal(all.rows.length, 405);
  assert.deepEqual(all.rows.map((r) => r.id), Array.from({ length: 405 }, (_, i) => `k${i}`));
  assert.equal(all.refused, null);
  assert.equal(all.more, false);
});

test('a refused page answers what was read with the refusal, and asks for nothing after it', async () => {
  const refused = { ok: false as const, refusal: { code: 'FORBIDDEN', fix: 'Sign in again.' } };
  let calls = 0;
  const all = await readAll(async (cursor) => (calls++, cursor === null ? page(0, 200, 'c1') : refused));
  assert.equal(calls, 2);
  assert.equal(all.rows.length, 200);
  assert.equal(all.refused, refused);
  assert.equal(all.more, true, 'a page was owed, so what was read is not all of it');
  const first = await readAll(async () => refused);
  assert.deepEqual(first, { rows: [], refused, more: true });
});

test('THE READ STOPS AT A CEILING IT STATES, and at a cursor that comes round again, and says more stand', async () => {
  assert.equal(READ_ALL_PAGES, 50);
  let calls = 0;
  const endless = await readAll(async () => page(calls++, 1, `c${calls}`));
  assert.equal(calls, READ_ALL_PAGES);
  assert.equal(endless.rows.length, READ_ALL_PAGES);
  assert.deepEqual({ refused: endless.refused, more: endless.more }, { refused: null, more: true });
  calls = 0;
  const three = await readAll(async () => page(calls++, 1, `c${calls}`), 3);
  assert.deepEqual([calls, three.rows.length, three.more], [3, 3, true]);
  calls = 0;
  const round = await readAll(async () => page(calls++, 2, 'same'));
  assert.deepEqual([calls, round.rows.length, round.more], [2, 4, true], 'the same cursor twice is a read that would never end');
  const none = await readAll(async () => ({ ok: true as const, value: { rows: [{ id: 'only' }] } }));
  assert.deepEqual(none, { rows: [{ id: 'only' }], refused: null, more: false }, 'an answer with no cursor is the last page');
});

test('the read is the client’s own `list`, a page of 200 at a time, and a refusal comes back as the client said it', async () => {
  const sent: unknown[] = [];
  const list = (async (args: { register: string; limit?: number; cursor?: string | null }) => {
    sent.push(args);
    return args.cursor ? { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Sign in again.' } } : { ok: true, value: { rows: [{ id: 'k0' }], matched: 2, cursor: 'c1' } };
  }) as unknown as Client['list'];
  const all = await readAll((cursor) => list({ register: 'credentials', limit: 200, cursor }));
  assert.deepEqual(sent, [{ register: 'credentials', limit: 200, cursor: null }, { register: 'credentials', limit: 200, cursor: 'c1' }]);
  assert.deepEqual(all.rows, [{ id: 'k0' }]);
  assert.equal(all.refused && 'refusal' in all.refused ? all.refused.refusal.code : null, 'FORBIDDEN');
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
  assert.deepEqual(plan.conflicts, ['Skills already exists, from Someone'], 'a pack is said by name, never its id');
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.seeds, '1 example row, marked example, clearable in one action');
  assert.equal(plan.touches, words.touches);
});

test('THE OFFER NAMES ITS LISTS AND PAGES AND FOLDS ITS FIGURES INTO ONE COUNT, and says plainly that nothing you wrote is touched', () => {
  const adds = [
    { id: 'register.learnings', summary: '10 fields' },
    ...Array.from({ length: 36 }, (_, i) => ({ id: `metric.m${String(i)}`, summary: '' })),
    { id: 'page.agents', summary: '13 blocks' },
  ];
  const plan = planOf({ adds, planHash: '4.abc' }, (_, id) => ({ learnings: 'Learnings', agents: 'Agents' })[id] ?? 'Slowest start hook, in milliseconds');
  const folded = foldedAdds(plan!);
  assert.deepEqual(folded.named.map((a) => a.name), ['Learnings', 'Agents']);
  assert.equal(folded.more, 'and 36 numbers');
  assert.equal(foldedAdds({ ...plan!, adds: plan!.adds.slice(0, 2) }).more, 'and 1 number');
  assert.equal(foldedAdds({ ...plan!, adds: [plan!.adds[0]!] }).more, null);
  assert.equal(plan!.touches, 'Nothing you wrote is touched');
  assert.equal(words.offerTitle, 'Turn on Agents?');
  assert.doesNotMatch(words.offerTitle, /add-on/u);
  assert.doesNotMatch(plan!.touches, /0 rows|nothing you have written/u);
});

test('a plan that writes no example rows has no line about them, not "0 example rows, marked example"', () => {
  const plan = planOf({ adds: [], seeds: { count: 0, registers: [] }, planHash: '3.def' }, (_, id) => id);
  assert.equal(plan?.seeds, null);
  assert.equal(planOf({ adds: [], planHash: '3.def' }, (_, id) => id)?.seeds, null);
  assert.equal(planOf({ adds: [], seeds: { count: 6, registers: [] }, planHash: '3.def' }, (_, id) => id)?.seeds, '6 example rows, marked example, clearable in one action');
});

test('A CHANGE TAKEN OVER FROM ANOTHER PACK says both names, grouped by that pack, before the pack’s own changes', () => {
  const diff = {
    changes: [
      { id: 'register.clients', from_version: 2, summary: '7 fields', from: 'people' },
      { id: 'register.tasks', from_version: 3, summary: '1 fields' },
      { id: 'page.invoices', from_version: 1, summary: '3 blocks', from: 'people' },
      { id: 'register.bills', from_version: 1, summary: '4 fields', from: 'money-core' },
    ],
    planHash: '9.abc',
  };
  const names: Record<string, string> = { clients: 'Clients', tasks: 'Tasks', invoices: 'Invoices', bills: 'Bills' };
  const packs: Record<string, string> = { people: 'People' };
  const plan = planOf(diff, (_, id) => names[id] ?? id, (id) => packs[id] ?? packSaid(id));
  assert.deepEqual(plan?.changes, ['Takes Clients and Invoices over from People', 'Takes Bills over from Money core', 'Changes Tasks, now 1 field']);
  assert.ok(!plan?.changes.some((l) => /money-core|register\.|page\./u.test(l)), 'names, never ids');
});

test('an answer with no plan hash is no plan, so nothing can be installed from it', () => {
  assert.equal(planOf(null, (_, id) => id), null);
  assert.equal(planOf({ adds: [] }, (_, id) => id), null);
});

test('RECONNECT OPENS THE KEY A PAUSED ACTION NAMED: its row to replace, or Add under that name, and the action to resume', () => {
  const row = { id: 'cred_1', spoken: 'credentials#1', label: 'Stripe read', opens: 'api.stripe.com', project: null, scope: null, sealed: true, opened: 3, lastOpened: null, grant: 'g_1' };
  const asked = (href: string) => new URL(href, 'https://x.example').searchParams;
  assert.deepEqual(reconnectOf(asked('/keychain?reconnect=stripe%20READ&then=stripe-balance'), [row]), { mode: 'replace', row, then: 'stripe-balance' });
  assert.deepEqual(reconnectOf(asked('/keychain?reconnect=GitHub%20deploy'), [row]), { mode: 'add', label: 'GitHub deploy', then: null });
  assert.equal(reconnectOf(asked('/keychain'), [row]), null);
  assert.equal(reconnectOf(asked('/keychain?reconnect=%20&then=x'), [row]), null);
});

test('RECONNECT FROM THE NAVIGATION STATE answers what the address answered, and nothing in the address is read', () => {
  const row: KeyRow = { id: 'cred_1', spoken: 'credentials#1', label: 'Stripe read', opens: 'api.stripe.com', project: null, scope: null, sealed: true, opened: 3, lastOpened: null, grant: 'g_1' };
  const asked = (href: string) => new URL(href, 'https://x.example').searchParams;
  assert.equal(RECONNECT_STATE, 'keychainReconnect');
  const pairs: [ReconnectState, string][] = [
    [{ key: 'stripe READ', then: 'stripe-balance' }, '/keychain?reconnect=stripe%20READ&then=stripe-balance'],
    [{ key: 'GitHub deploy', then: null }, '/keychain?reconnect=GitHub%20deploy'],
    [{ key: '  Stripe read ', then: '  ' }, '/keychain?reconnect=%20%20Stripe%20read%20&then=%20%20'],
  ];
  for (const [state, href] of pairs) assert.deepEqual(reconnectFrom(state, [row]), reconnectOf(asked(href), [row]));
  assert.deepEqual(reconnectFrom({ key: 'stripe READ', then: 'stripe-balance' }, [row]), { mode: 'replace', row, then: 'stripe-balance' });
  assert.deepEqual(reconnectFrom({ key: 'GitHub deploy', then: null }, [row]), { mode: 'add', label: 'GitHub deploy', then: null });
  /* THE WHOLE OF A PAGE'S STATE IS NOT IT: the caller hands `page.state[RECONNECT_STATE]`, and anything else is no ask. */
  const not: unknown[] = [
    null, undefined, 'Stripe read', 7, [], ['Stripe read', null], {}, { key: '', then: null }, { key: '  ', then: 'x' }, { key: 5, then: null },
    { key: 'Stripe read' }, { key: 'Stripe read', then: 5 }, { key: 'Stripe read', then: undefined }, { [RECONNECT_STATE]: { key: 'Stripe read', then: null } },
  ];
  for (const state of not) assert.equal(reconnectFrom(state, [row]), null, JSON.stringify(state) ?? 'undefined');
});

/* THE PASS OF 27 OCTOBER: a key is a Keys row not retired, said once, and the retired are counted beside it. */
test('a key is a row of the Keys list that is not retired, and the retired are counted apart', () => {
  const rows = [
    { id: 'a', fields: { label: 'A', state: 'live' } },
    { id: 'b', fields: { label: 'B', state: 'retired' } },
    { id: 'c', fields: { label: 'C' }, state: 'retired' },
    { id: 'd', fields: { label: 'D', state: 'unverified' } },
  ];
  assert.deepEqual(rows.filter(keychain.isKey).map((r) => r.id), ['a', 'd']);
  assert.equal(keychain.retiredOf(rows), 2);
  assert.equal(keychain.keysOf(rows, [], new Map()).length + keychain.retiredOf(rows), rows.length, 'the two counts do not add up to the list');
});
