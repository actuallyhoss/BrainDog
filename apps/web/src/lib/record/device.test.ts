/**
 * `/settings/agents`: what counts as a code, what each answer from `deviceApprove` says, and which rows
 * a revoke still changes.
 *
 * THE ARITHMETIC OF A WRONG GUESS IS NOT HERE. The kernel spends the tries and denies the rows, and
 * tests that itself; this screen's part is refusing a malformed entry before it can spend one, and
 * naming each refusal in words a person can act on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  reportKeyOf, CODE_DIGITS, LABEL_MAX, TOKEN_DAYS, answerOf, codeOf, connectLines, connected, nameOf, normalise, reachKey,
  revocable, standing, type Connection, type DeviceRow, type TokenRow,
} from './device.ts';
import { APP_NAMES, clientOf, lineOf, madeByOther, partsOf } from './apps.ts';
import * as device from './device.ts';
import { REACHES, SCOPES } from '@braindog/kernel';
import { copy } from '../copy.ts';

const STATUSES: DeviceRow['status'][] = ['pending', 'approved', 'active', 'expired', 'denied', 'revoked'];

const refused = (code: string, fix = `The record said ${code}.`) => ({ ok: false as const, refusal: { code, fix } });

/* ── the entry ── */

test('the code as the CLI prints it, in two groups, and as one run, are the same code', () => {
  assert.deepEqual(codeOf('123 456'), { ok: true, code: '123456' });
  assert.deepEqual(codeOf('123456'), { ok: true, code: '123456' });
});

test('five digits is refused as short, and says how many it counted', () => {
  assert.deepEqual(codeOf('12345'), { ok: false, why: 'short', digits: 5 });
  assert.deepEqual(codeOf('123 45'), { ok: false, why: 'short', digits: 5 });
});

test('seven digits is refused rather than trimmed to a code that might match another machine', () => {
  assert.deepEqual(codeOf('1234567'), { ok: false, why: 'long', digits: 7 });
});

test('an empty field and a field holding anything but digits are refused, and neither is sent', () => {
  assert.deepEqual(codeOf(''), { ok: false, why: 'empty', digits: 0 });
  assert.deepEqual(codeOf('   '), { ok: false, why: 'empty', digits: 0 });
  assert.equal(codeOf('12a456').ok, false);
  assert.equal(codeOf('code 123456').ok, false);
  assert.deepEqual(codeOf('１２３４５６'), { ok: false, why: 'other', digits: 0 });
});

test('a paste from a terminal or a chat keeps working: non-breaking spaces, hyphens, a trailing newline', () => {
  for (const pasted of ['123 456', '123-456', '123‑456', ' 123456\n', '123\t456'])
    assert.deepEqual(codeOf(pasted), { ok: true, code: '123456' }, JSON.stringify(pasted));
  assert.equal(normalise('1 2 3 4 5 6'), '123456');
});

test('a code is six digits, the width the kernel checks', () => {
  assert.equal(CODE_DIGITS, 6);
});

/* ── the answers ── */

test('an approval carries the label and the reach, so the screen can say what it let in', () => {
  const a = answerOf({ ok: true, value: { handle: 'h', reach: 'runner', scope: null, label: 'Build box', ua: null } });
  assert.deepEqual(a, { kind: 'approved', label: 'Build box', reach: 'runner', scope: null });
});

test('each refusal from deviceApprove has its own kind', () => {
  assert.deepEqual(answerOf(refused('FORBIDDEN')), { kind: 'wrong' });
  assert.deepEqual(answerOf(refused('DEVICE_CODE_TRIES')), { kind: 'tries' });
  assert.deepEqual(answerOf(refused('DEVICE_CODE_EXPIRED')), { kind: 'expired' });
  assert.deepEqual(answerOf(refused('NEEDS_BROWSER_SESSION')), { kind: 'signin' });
  assert.deepEqual(answerOf(refused('VALUE_MALFORMED')), { kind: 'malformed', why: 'other', digits: 0 });
});

test('any other refusal keeps the record\'s own sentence', () => {
  assert.deepEqual(answerOf(refused('UNREACHABLE', 'The record could not be reached: offline')), {
    kind: 'refused',
    fix: 'The record could not be reached: offline',
  });
});

test('the sentences for the refusals say what to do, and none prints a count of tries', () => {
  assert.match(copy.codeTries, /run the command again/i);
  /* NOT `braindog login` BY NAME: export, setup and a runner print the same page, and each is run again to get a code. */
  assert.match(copy.codeExpired, /run the command again/i);
  assert.match(copy.codeWrong, /^No machine is waiting with that code\./u);
  assert.match(copy.codeShort(5), /5 digits/);
  assert.match(copy.codeLong(7), /7 digits/);
});

/* `noRecord` WENT WITH ITS LAST CALLER. It told a 401 or an unreachable host at
   an address with no slug from any other refusal, which was the one place the sample was drawn; three writers still
   asked it at the end and answered `gone`, which no screen drew differently from `refused`. */
test('there is no longer a refusal that means no record is here', async () => {
  assert.equal('noRecord' in (await import('./device.ts')), false);
});

/* ── what a grant reaches ── */

test('every reach the kernel can grant has a sentence, and a keychain access\'s depends on its scope', () => {
  for (const reach of REACHES) assert.ok(copy.reachMeans[reachKey(reach, null)], reach);
  assert.equal(reachKey('vault', '*'), 'vaultAll');
  assert.equal(reachKey('vault', 'p_01'), 'vault');
  assert.equal(reachKey('login', '*'), 'login');
  assert.match(copy.reachMeans.vaultAll ?? '', /seven days/);
  assert.match(copy.reachMeans.vault ?? '', /thirty days/);
});

test('every status the kernel writes has a word, and approvedNow says who and what', () => {
  for (const s of STATUSES) assert.ok(copy.deviceState[s], s);
  assert.equal(copy.deviceState.locked, undefined, 'the kernel has no locked state');
  const line = copy.approvedNow('Build box', 'do work');
  assert.ok(line.includes('Build box') && line.includes('do work'));
});

test('every scope a token can hold is said as what it can do', () => {
  for (const s of SCOPES) assert.ok(copy.keyCan[s], s);
});

test('the words on this screen carry no em dash and no schema word', () => {
  const words = [
    ...Object.values(copy.deviceState), ...Object.values(copy.reachMeans), ...Object.values(copy.keyCan),
    copy.approveTitle, copy.codeLabel, copy.codeContinue, copy.confirmApprove, copy.codeEmpty, copy.codeOther, copy.codeWrong, copy.codeTries,
    copy.codeExpired, copy.signInAgainWhy, copy.signInAgain, copy.connectedNone,
    copy.connectedNoneWhy, copy.connectTitle, copy.doorKeyLabel, copy.doorKeyGo, copy.tokenOnce, copy.copyKey,
    copy.connectDone, copy.unnamedMachine, copy.unnamedKey,
  ];
  for (const w of words) {
    assert.doesNotMatch(w, /—/, w);
    assert.doesNotMatch(w, /\bscope\b|\bhandle\b/i, w);
  }
});

/* ── the rows, as the record lists them ── */

test('only a waiting, approved or working grant can be revoked; a finished one keeps saying what it said', () => {
  for (const status of STATUSES) {
    const row: DeviceRow = {
      handle: 'h1', status, reach: 'runner', scope: null, label: 'Build box', ua: null, tries: 0,
      expires: '2026-09-15T12:10:00.000Z', approved_by: null, approved_at: null, last_used: null,
    };
    assert.equal(revocable(row), status === 'pending' || status === 'approved' || status === 'active', status);
  }
});

test('a revoked token is not listed as standing', () => {
  const first: TokenRow = {
    id: 'tk_1', person_id: 'p_1', scope: 'write', label: 'Laptop', created_at: '2026-09-01T00:00:00Z',
    last_used_at: null, last_surface: null, expires_at: null, revoked_at: null,
  };
  const gone: TokenRow = { ...first, id: 'tk_gone', revoked_at: '2026-09-02T00:00:00Z' };
  assert.deepEqual(standing([first, gone]).map((t) => t.id), [first.id]);
});

/*
 * THE SAMPLE IS GONE FROM THIS MODULE. `sampleMachines` and `sampleTokens` turned the fixture's
 * machines and keys into the record's rows so `/settings/agents` could draw them to a visitor with no record;
 * with no sample, nothing on that screen is drawn from anything but `listDevices` and `listTokens`.
 */
test('nothing here builds machines or keys that are not the record', () => {
  assert.deepEqual(Object.keys(device).filter((k) => /^sample/i.test(k)), []);
});

/* ── connect an agent ── */

test('the lines to copy name the origin and carry no key', () => {
  const lines = connectLines('https://record.example');
  assert.equal(lines.setup, 'braindog setup https://record.example');
  /* THE CLOUD DEVICE FLOW NEEDS A SLUG, and a line with none was refused there. */
  assert.equal(connectLines('https://brain.dog', 'acme').setup, 'braindog setup https://brain.dog/acme');
  /* ANY MCP CLIENT TAKES THE ADDRESS, and Claude Code takes it as an HTTP server: no stdio `braindog` to have installed. */
  assert.equal(lines.mcp, 'https://record.example/mcp');
  assert.equal(lines.claude, 'claude mcp add --transport http braindog https://record.example/mcp');
  for (const line of Object.values(lines)) assert.doesNotMatch(line, /token|bearer|bd_/i);
});

test('each app is handed its own line, the address in every one and never a key', () => {
  const lines = connectLines('https://brain.dog', 'acme');
  /* THE THREE LINES THERE WERE ARE UNCHANGED, for the screens that already read them. */
  assert.equal(lines.mcp, 'https://brain.dog/mcp');
  assert.equal(lines.claude, 'claude mcp add --transport http braindog https://brain.dog/mcp');
  assert.equal(lines.setup, 'braindog setup https://brain.dog/acme');
  /* CODEX TAKES AN HTTP SERVER BY ITS OWN COMMAND, and Cursor's server file takes an entry with the address. */
  assert.equal(lines.codex, 'codex mcp add braindog --url https://brain.dog/mcp');
  assert.deepEqual(JSON.parse(lines.cursor), { mcpServers: { braindog: { url: 'https://brain.dog/mcp' } } });
  /* CLAUDE ON THE WEB AND ANY OTHER APP ARE GIVEN THE ADDRESS ALONE. */
  assert.equal(lines.web, lines.mcp);
  assert.equal(lines.other, lines.mcp);
  for (const [app, line] of Object.entries(lines)) {
    assert.match(line, /https:\/\/brain\.dog/u, app);
    assert.doesNotMatch(line, /token|bearer|bd_/iu, app);
  }
});

test('a token minted here is a ninety-day write token with a label the kernel accepts', () => {
  assert.equal(TOKEN_DAYS, 90);
  assert.equal(LABEL_MAX, 120);
});

test('a report key reads as its name and the list it sends to, never as its label', () => {
  assert.deepEqual(reportKeyOf('report:{"register":"datapoints","fixed":{"organisation":"organisations#1"},"stamp":"at","name":"Northwind"}'), { name: 'Northwind', register: 'datapoints' });
  assert.deepEqual(reportKeyOf('report:{"register":"datapoints"}'), { name: null, register: 'datapoints' });
  assert.deepEqual(reportKeyOf('report:not json'), { name: null, register: '' });
  assert.equal(reportKeyOf('Claude on the laptop'), null);
  assert.equal(reportKeyOf(null), null);
});

/* ── who is connected, in three parts ── */

const NOW = Date.parse('2026-10-14T12:00:00Z');
const daysAgo = (n: number): string => new Date(NOW - n * 86_400_000).toISOString();

const key = (over: Partial<TokenRow> = {}): TokenRow => ({
  id: 'tk_a', person_id: 'p_1', scope: 'write', label: 'nightly-report', created_at: daysAgo(30),
  last_used_at: daysAgo(1), last_surface: null, expires_at: null, revoked_at: null, ...over,
});

const only = (token: TokenRow, run: Connection['run'] = null): Connection => connected([], [token], run ? [run] : [])[0]!;

const studio: DeviceRow = {
  handle: 'dv_1', status: 'active', reach: 'login', scope: null, label: 'Studio pc · braindog-cli', ua: null, tries: 0,
  expires: '2026-12-01T00:00:00Z', approved_by: 'p_1', approved_at: daysAgo(20), last_used: daysAgo(1),
};

test('an app that signed in from claude.ai with a metadata document reads Claude, signed in', () => {
  const c = only(key({ label: 'Claude', client: { id: 'https://claude.ai/oauth/mcp-client', kind: 'cimd', host: 'claude.ai' } }));
  const parts = partsOf(c, NOW);
  assert.deepEqual(parts, { app: 'Claude', where: 'claude.ai', how: 'signed in', idle: null });
  assert.equal(lineOf(c, parts), 'From claude.ai, signed in');
  assert.equal(nameOf(c), 'Claude on claude.ai');
});

test('a key with no client reads its label and is a key you made', () => {
  const c = only(key());
  assert.deepEqual(partsOf(c, NOW), { app: 'nightly-report', where: null, how: 'a key you made', idle: null });
  assert.equal(lineOf(c), 'A key you made');
  assert.equal(nameOf(c), 'nightly-report');
});

test('A KEY THE READER MADE IS THEIRS, never "made by" their own name; a colleague’s says whose', () => {
  const c = only(key({ person_id: 'p_owner', person_name: 'The Studio' }));
  assert.equal(lineOf(c, partsOf(c, NOW), 'p_owner'), 'A key you made');
  assert.equal(madeByOther(c, 'p_owner'), null);
  assert.equal(lineOf(c, partsOf(c, NOW), 'p_lina'), 'A key');
  assert.equal(madeByOther(c, 'p_lina'), 'The Studio');
});

test('a machine reads its agent on its machine, as it did before the stamp', () => {
  const token = key({ id: 'tk_m', label: studio.label, expires_at: studio.expires });
  const c = connected([studio], [token], [{ seq: 4, token: 'tk_m', agent: 'claude', host: 'STUDIO-PC' }])[0]!;
  assert.deepEqual(partsOf(c, NOW), { app: 'Claude', where: 'Studio pc', how: 'signed in', idle: null });
  assert.equal(nameOf(c), 'Claude on Studio pc');
  assert.equal(lineOf(c), 'On Studio pc, signed in');
  /* THE APP THE RUN SAID IT RAN IN IS READ BEFORE THE KIND OF AGENT. */
  const coded = connected([studio], [token], [{ seq: 5, token: 'tk_m', agent: 'claude', host: 'STUDIO-PC', client: 'claude-code 2.1.4' }])[0]!;
  assert.equal(nameOf(coded), 'Claude Code on Studio pc');
  /* NO RUN, NO MACHINE NAME: the label it signed in with stands. */
  assert.equal(nameOf(connected([studio], [token], [])[0]!), 'Studio pc · braindog-cli');
});

test('a machine whose sign-in was stamped reads on the name it gave', () => {
  const token = key({ id: 'tk_d', label: studio.label, expires_at: studio.expires, client: { id: 'braindog', kind: 'device', host: 'Studio' } });
  const c = connected([studio], [token], [{ seq: 6, token: 'tk_d', agent: 'claude', host: 'STUDIO-PC', client: 'claude-code' }])[0]!;
  assert.equal(partsOf(c, NOW).where, 'Studio');
  assert.equal(lineOf(c), 'On Studio, signed in');
  assert.equal(nameOf(c), 'Claude Code on Studio');
  /* BEFORE ANY RUN, THE MACHINE IS STILL ON ITS NAME: the command signed it in. */
  const fresh = connected([studio], [token], [])[0]!;
  assert.equal(nameOf(fresh), 'The BrainDog command on Studio');
  assert.equal(lineOf(fresh), 'On Studio, signed in');
});

test('a connection unused for twelve days says so, and one used yesterday says nothing', () => {
  assert.equal(partsOf(only(key({ last_used_at: daysAgo(12) })), NOW).idle, 12);
  assert.equal(partsOf(only(key({ last_used_at: daysAgo(1) })), NOW).idle, null);
  assert.equal(partsOf(only(key({ last_used_at: null })), NOW).idle, null);
  assert.equal(copy.notUsedFor(12), 'Not used for 12 days');
});

test('an unknown host reads as its host name, never its id', () => {
  const c = only(key({ label: null, client: { id: '01JABCDEFGHJKMNPQRSTVWXYZ0', kind: 'dcr', host: 'notes.example:8443' } }));
  const parts = partsOf(c, NOW);
  assert.equal(parts.app, 'notes.example');
  assert.equal(nameOf(c), 'notes.example');
  assert.doesNotMatch(`${nameOf(c)} ${lineOf(c, parts)}`, /01JABC/u);
  /* KNOWN SITES BY THEIR APP, a subdomain included, and a loopback sign-in is this computer. */
  assert.equal(partsOf(only(key({ client: { id: 'x1', kind: 'dcr', host: 'www.chatgpt.com' } })), NOW).app, 'ChatGPT');
  assert.equal(partsOf(only(key({ client: { id: 'x2', kind: 'dcr', host: 'app.cursor.com' } })), NOW).app, 'Cursor');
  const here = only(key({ label: 'Codex', client: { id: 'x3', kind: 'dcr', host: null } }));
  assert.equal(partsOf(here, NOW).how, 'this machine');
  assert.equal(lineOf(here), 'Signed in on this computer');
});

test('a client that is not one reads as no client, and the words carry no em dash', () => {
  for (const raw of [null, undefined, 'claude.ai', { id: 7, kind: 'cimd' }, { id: 'a', kind: 'oauth' }]) assert.equal(clientOf(raw), null);
  assert.deepEqual(clientOf({ id: 'a', kind: 'cimd', host: ' ' }), { id: 'a', kind: 'cimd', host: null });
  for (const s of [copy.connectedOn('Studio'), copy.connectedFrom('claude.ai'), copy.connectedHere, copy.connectedKey, copy.connectedKeyYours, copy.notUsedFor(9)]) {
    assert.doesNotMatch(s, /—/u);
  }
  assert.equal(APP_NAMES['claude-code'], 'Claude Code');
});

/* ── the agents heard from in runs (UI pass 20 Oct, agents F1) ── */

test('the agents that work here come from every run, one per agent, newest first, named by project', () => {
  const now = Date.parse('2026-09-03T12:00:00Z');
  const run = (seq: number, agent: string, last_seen: string, project?: string) => ({ seq, fields: { agent, last_seen, ...(project ? { project } : {}) } });
  const projects = new Map([['things#1', { spoken: 'kiln', name: 'Kiln', mark: '◼', hue: 265 }]]);
  const heard = device.heardFrom(
    [
      run(1, 'claude', '2026-09-03T11:57:00Z', 'things#1'),
      run(2, 'codex', '2026-09-03T11:48:00Z', 'things#9'),
      run(3, 'claude', '2026-09-02T10:00:00Z'),
      run(4, 'cursor', '2026-07-01T10:00:00Z'),
    ],
    now,
    projects,
  );
  assert.deepEqual(heard.map((h) => h.agent), ['claude', 'codex']);
  assert.equal(heard[0]?.scope?.name, 'Kiln');
  /* A PROJECT IT CANNOT NAME IS LEFT OUT, never drawn as `things#9`. */
  assert.equal(heard[1]?.scope, null);
});
