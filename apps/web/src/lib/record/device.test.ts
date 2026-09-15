/**
 * `/settings/agents`: what counts as a code, what each answer from `deviceApprove` says, and the sample
 * drawn in the kernel's shape.
 *
 * THE ARITHMETIC OF A WRONG GUESS IS NOT HERE. The kernel spends the tries and denies the rows, and
 * tests that itself; this screen's part is refusing a malformed entry before it can spend one, and
 * naming each refusal in words a person can act on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_DIGITS, LABEL_MAX, TOKEN_DAYS, answerOf, codeOf, connectLines, noRecord, normalise, reachKey, revocable,
  sampleMachines, sampleTokens, standing, type DeviceRow, type TokenRow,
} from './device.ts';
import { DEVICES, TOKENS } from './data.ts';
import type { Device } from './schema.ts';
import { REACHES, SCOPES } from '@braindog/kernel';
import { copy } from '../copy.ts';
import { NOW } from '@braindog/seed';

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
  assert.match(copy.codeTries, /start again on the machine/i);
  assert.match(copy.codeExpired, /braindog login/);
  assert.equal(copy.codeWrong, 'No machine is waiting with that code.');
  assert.match(copy.codeShort(5), /5 digits/);
  assert.match(copy.codeLong(7), /7 digits/);
  assert.doesNotMatch(copy.notOnDemo, /\.\s+\S/, 'the demo says it in one sentence');
});

test('no-record refusals draw the sample, and a record that refuses for a reason does not', () => {
  assert.equal(noRecord('UNREACHABLE'), true);
  assert.equal(noRecord('UNAUTHORIZED'), true);
  assert.equal(noRecord('FORBIDDEN'), false);
  assert.equal(noRecord('NEEDS_BROWSER_SESSION'), false);
});

/* ── what a grant reaches ── */

test('every reach the kernel can grant has a sentence, and a vault grant\'s depends on its scope', () => {
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
    copy.approveTitle, copy.codeLabel, copy.codeGo, copy.codeEmpty, copy.codeOther, copy.codeWrong, copy.codeTries,
    copy.codeExpired, copy.signInAgainWhy, copy.signInAgain, copy.notOnDemo, copy.machines, copy.noDevices,
    copy.tokens, copy.noKeys, copy.connectTitle, copy.connectLabel, copy.connectGo, copy.tokenOnce, copy.copyToken,
    copy.onNewMachine, copy.inClaudeCode, copy.connectDone, copy.unnamedMachine, copy.unnamedToken,
  ];
  for (const w of words) {
    assert.doesNotMatch(w, /—/, w);
    assert.doesNotMatch(w, /\bscope\b|\bhandle\b/i, w);
  }
});

/* ── the sample, in the record's shape ── */

test('the sample machines are rows listDevices could return', () => {
  const rows = sampleMachines(DEVICES);
  assert.equal(rows.length, DEVICES.length);
  for (const [i, r] of rows.entries()) {
    const d = DEVICES[i]!;
    assert.ok(STATUSES.includes(r.status), r.status);
    assert.ok((REACHES as readonly string[]).includes(r.reach), r.reach);
    assert.equal(r.label, d.name);
    assert.equal(r.last_used, d.lastSeen);
    assert.ok(!Number.isNaN(Date.parse(r.expires)));
  }
});

test('a sample row is named by a handle, never by its id', () => {
  const rows = sampleMachines(DEVICES);
  for (const [i, r] of rows.entries()) {
    assert.match(r.handle, /^[0-9a-f]{16}$/);
    assert.ok(!r.handle.includes(DEVICES[i]!.id));
  }
  assert.equal(new Set(rows.map((r) => r.handle)).size, rows.length, 'handles are distinct');
  assert.equal(sampleMachines(DEVICES)[0]!.handle, rows[0]!.handle, 'and stable');
});

test('a locked sample row becomes denied, which is what five wrong codes leave in the kernel', () => {
  const locked: Device = { ...DEVICES[0]!, id: 'dg_locked', state: 'locked' };
  assert.equal(sampleMachines([locked])[0]!.status, 'denied');
});

test('the sample keeps its denied and its waiting rows, and only the live ones can be revoked', () => {
  const rows = sampleMachines(DEVICES);
  assert.ok(rows.some((r) => r.status === 'denied'));
  assert.ok(rows.some((r) => r.status === 'pending'));
  for (const r of rows) assert.equal(revocable(r), r.status === 'pending' || r.status === 'approved' || r.status === 'active');
});

test('the sample tokens are rows listTokens could return, with nothing shaped like a bearer', () => {
  const rows = sampleTokens(TOKENS);
  assert.equal(rows.length, TOKENS.length);
  for (const t of rows) {
    assert.ok((SCOPES as readonly string[]).includes(t.scope));
    assert.equal(t.revoked_at, null);
    for (const v of Object.values(t)) if (typeof v === 'string') assert.ok(v.length < 40, v);
  }
});

test('a revoked token is not listed as standing', () => {
  const [first] = sampleTokens(TOKENS);
  assert.ok(first);
  const gone: TokenRow = { ...first, id: 'tk_gone', revoked_at: new Date(NOW).toISOString() };
  assert.deepEqual(standing([first, gone]).map((t) => t.id), [first.id]);
});

/* ── connect an agent ── */

test('the two lines to copy name the origin and carry no token', () => {
  const lines = connectLines('https://record.example');
  assert.equal(lines.login, 'braindog login https://record.example');
  const json = /^claude mcp add-json braindog '(.+)' --scope user$/.exec(lines.mcp)?.[1];
  assert.ok(json, lines.mcp);
  assert.deepEqual(JSON.parse(json), { type: 'stdio', command: 'braindog', args: ['mcp', '--agent', 'claude'] });
  assert.doesNotMatch(lines.mcp, /token|bearer|bd_/i);
});

test('a token minted here is a ninety-day write token with a label the kernel accepts', () => {
  assert.equal(TOKEN_DAYS, 90);
  assert.equal(LABEL_MAX, 120);
});
