/**
 * What setup sync carries (`carry.ts`): a thing in Carry read as the command needs it, its place on each system, the
 * hard lines no thing may cross, the files gathered, the archive they travel in, and a file placed again.
 *
 * EVERY FILE IS UNDER A TEMPORARY FOLDER, the home handed in, so nothing of this machine's is read. A login file here is
 * a planted one, named to prove it is refused.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  carryRowOf,
  caseless,
  gatherFiles,
  gatherItem,
  hardLine,
  holds,
  keepAside,
  leftOut,
  MEMORY_WAITS,
  pack,
  placeOf,
  systemOf,
  targetIn,
  unpack,
  within,
  writeWhole,
  type CarryRow,
  type GatherOptions,
} from '../src/carry.ts';
import type { SecretStore } from '../src/secret-store.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-carry-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const newHome = () => {
  const dir = join(scratch, `home-${String(homes++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const text = (file: string, body: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
};

const row = (fields: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: 'r_1', seq: 4, version: 2, state: null, fields, ...extra });
const thing = (fields: Record<string, unknown>): CarryRow => {
  const c = carryRowOf(row({ name: 'A thing', ...fields }));
  assert.ok(c !== null);
  return c;
};
const opts = (o: Partial<GatherOptions> = {}): GatherOptions => ({ leaveOut: [], loose: false, signIns: [], apps: [], ...o });

test('A THING IN CARRY, READ AS THE COMMAND NEEDS IT: its places, what is left out, whether it runs, and whether it is on', () => {
  const c = carryRowOf(
    row({ name: ' Local programs ', kind: 'files', mac: '~/.local/bin', linux: '~/.local/bin', win: '  ', leave_out: ['claude', '', 3], runs: true, waits: ['Field Laptop'], state: 'on' }),
  );
  assert.deepEqual(c, {
    id: 'r_1',
    seq: 4,
    version: 2,
    name: 'Local programs',
    kind: 'files',
    places: { mac: '~/.local/bin', linux: '~/.local/bin' },
    leaveOut: ['claude'],
    runs: true,
    belongsTo: null,
    on: true,
    waiting: ['Field Laptop'],
  });
  assert.equal(carryRowOf(row({ name: 'x', kind: 'something new' }))?.kind, 'files', 'a kind it does not know is files');
  assert.equal(carryRowOf(row({ name: 'x', whose: 'r_9' }))?.belongsTo, 'r_9', 'whose account it is, by the person in People');
  assert.equal(carryRowOf(row({ name: 'x', state: 'off' }))?.on, false);
  assert.equal(carryRowOf(row({ name: 'x' }, { state: 'off' }))?.on, false, 'the state the list keeps on the row');
  assert.equal(carryRowOf(row({ kind: 'files' })), null, 'no name');
  assert.equal(carryRowOf({ fields: { name: 'x' } }), null, 'no number');
});

test("THE HARD LINES: an agent app's own login and session transcripts are refused by their names", () => {
  const home = '/home/rowan';
  for (const path of [
    `${home}/.claude/.credentials.json`,
    `${home}/.claude-work/credentials.json`,
    `${home}/.codex/auth.json`,
    `${home}/Library/Keychains/Claude Code-credentials`,
    `${home}/notes/claudeAiOauth.txt`,
    'C:\\Users\\rowan\\.claude\\.CREDENTIALS.JSON',
  ])
    assert.equal(hardLine(path), 'login', path);
  for (const path of [
    `${home}/.claude/projects`,
    `${home}/.claude/projects/-work-shop/memory/MEMORY.md`,
    `${home}/.claude-work/transcripts/a.json`,
    `${home}/.codex/sessions/2026/10/rollout.json`,
    `${home}/.ccenv/profiles/work/projects/x`,
    `${home}/.claude/history.jsonl`,
    'C:\\Users\\rowan\\.claude\\Projects\\x',
  ])
    assert.equal(hardLine(path), 'transcripts', path);
  /* A PROFILE NAMED BY THE ENVIRONMENT, NOT BY ITS FOLDER'S NAME, is held by where it is. */
  assert.equal(hardLine(`${home}/profiles/studio/projects/x`), null);
  assert.equal(hardLine(`${home}/profiles/studio/projects/x`, [`${home}/profiles/studio`]), 'transcripts');
  for (const path of [`${home}/.claude/context/01.md`, `${home}/.ccenv/shared/mcp-auth.json`, `${home}/.local/bin/tidy`, `${home}/code/shop/.env`, `${home}/projects/site/index.html`])
    assert.equal(hardLine(path), null, path);
});

test('A PLACE ON EACH SYSTEM: ~ is the home, %NAME% on Windows, a Keychain item on a Mac alone, and no hard line crossed', () => {
  const home = join(scratch, 'placed');
  /* `%NAME%` IS READ WITHOUT CASE, as Windows reads it; here it names a folder that is a full path on this machine. */
  const env = { UserProfile: home };
  const c = thing({ mac: '~/.npmrc', linux: '~\\.config\\shop.conf', win: '%USERPROFILE%/.npmrc' });
  assert.deepEqual(placeOf(c, 'mac', { home, env }), { place: { kind: 'path', path: join(home, '.npmrc') } });
  const linux = placeOf(c, 'linux', { home, env });
  assert.ok('place' in linux && linux.place.kind === 'path' && linux.place.path.startsWith(home), JSON.stringify(linux));
  assert.deepEqual(placeOf(c, 'windows', { home, env }), { place: { kind: 'path', path: join(home, '.npmrc') } });
  assert.deepEqual(placeOf(thing({ mac: '~/x' }), 'windows', { home, env }), { none: true });
  assert.match(String((placeOf(thing({ linux: 'relative/x' }), 'linux', { home, env }) as { refused?: string }).refused), /not a full path/u);

  /* THE KEYCHAIN: ITS ACCOUNT THE PERSON SIGNED IN, OR THE ONE NAMED; NOWHERE BUT A MAC. */
  const item = thing({ mac: 'keychain:ccenv-mcp-auth', win: 'keychain:ccenv-mcp-auth' });
  assert.deepEqual(placeOf(item, 'mac', { home, env, user: 'rowan' }), { place: { kind: 'keychain', item: { service: 'ccenv-mcp-auth', account: 'rowan' } } });
  assert.deepEqual(placeOf(thing({ mac: 'keychain:ccenv-mcp-auth/sam' }), 'mac', { home, env, user: 'rowan' }), { place: { kind: 'keychain', item: { service: 'ccenv-mcp-auth', account: 'sam' } } });
  assert.match(String((placeOf(item, 'windows', { home, env }) as { refused?: string }).refused), /only a Mac has a Keychain/u);

  /* A PLACE OR AN ITEM THAT CROSSES A HARD LINE IS REFUSED, whatever Carry says. */
  for (const [system, place] of [
    ['mac', 'keychain:Claude Code-credentials'],
    ['mac', '~/.claude/.credentials.json'],
    ['linux', '~/.codex/auth.json'],
    ['linux', '~/.claude/projects'],
  ] as const)
    assert.ok('refused' in placeOf(thing({ [system]: place }), system, { home, env, user: 'rowan' }), place);
});

test('LEAVE OUT NAMES A FILE OR FOLDER, or *<ending>, compared without case where the system does', () => {
  assert.equal(leftOut('claude', ['claude'], false), true);
  assert.equal(leftOut('Claude', ['claude'], false), false);
  assert.equal(leftOut('Claude', ['claude'], true), true);
  assert.equal(leftOut('report.cache.json', ['*.cache.json'], false), true);
  assert.equal(leftOut('cache.json', ['*.cache.json'], false), false);
  assert.equal(leftOut('x', ['*'], false), false, 'a star alone leaves nothing out');
  assert.equal(caseless(systemOf('win32')), true);
  assert.equal(caseless(systemOf('darwin')), true);
  assert.equal(caseless(systemOf('linux')), false);
  assert.equal(within('/Users/Rowan/Code', '/users/rowan/code/shop', true), true);
  /* Node's own Windows paths compare without case whatever is asked, so the case-blind refusal is a POSIX one. */
  if (process.platform !== 'win32') assert.equal(within('/Users/Rowan/Code', '/users/rowan/code/shop', false), false);
  assert.equal(within('/a/b', '/a/bc', false), false);
});

test('GATHERED: each file whole, links named and left, Leave out kept out, sign-ins kept to their own thing, transcripts never listed', { skip: process.platform === 'win32' ? 'making a link needs rights a Windows runner does not have' : false }, () => {
  const home = newHome();
  const root = join(home, '.claude', 'context');
  text(join(root, '01-projects.md'), 'what each project is\n');
  text(join(root, 'nested', '07-history.md'), 'line one\r\nline two\r\n');
  text(join(root, '06-conversation-history', 'big.md'), 'left out by name\n');
  text(join(root, 'login-copy.json'), '{"claudeAiOauth":{"planted":true}}\n');
  text(join(root, 'mcp-auth.json'), '{"tracker|1a2b":{}}\n');
  text(join(root, 'projects', 'x.md'), 'inside an agent folder, a projects folder is transcripts\n');
  symlinkSync(join(home, 'elsewhere'), join(root, 'link'));
  const g = gatherFiles(root, opts({ leaveOut: ['06-conversation-history'], signIns: [join(root, 'mcp-auth.json')] }));
  assert.deepEqual(
    g.entries.map((e) => e.path),
    ['01-projects.md', 'nested/07-history.md'],
  );
  assert.ok(g.entries[1]?.bytes.equals(Buffer.from('line one\r\nline two\r\n')), 'line endings changed');
  assert.deepEqual(
    g.skipped.map((s) => [s.path, s.why]).sort(),
    [
      ['06-conversation-history', 'left-out'],
      ['link', 'link'],
      ['login-copy.json', 'login'],
      ['mcp-auth.json', 'sign-ins'],
      ['projects', 'transcripts'],
    ],
  );
  assert.equal(g.size, g.entries.reduce((n, e) => n + e.bytes.length, 0));
  assert.deepEqual([g.missing, g.tooBig], [false, false]);

  /* A PLACE THAT IS ONE FILE IS ITS ROOT, AND A PLACE NOT THERE IS SAID AS MISSING. */
  const one = gatherFiles(join(root, '01-projects.md'), opts());
  assert.deepEqual(one.entries.map((e) => e.path), ['']);
  assert.equal(gatherFiles(join(home, 'nothing-here'), opts()).missing, true);
  assert.deepEqual(gatherFiles(join(root, 'mcp-auth.json'), opts({ signIns: [join(root, 'mcp-auth.json')] })).skipped, [{ path: '', why: 'sign-ins' }]);
});

test('A KEYCHAIN ITEM OF TOOL SIGN-INS IS ONE FILE AT THE ROOT, and one holding the claude.ai login is refused', async () => {
  const held = new Map([
    ['ccenv-mcp-auth', '{"tracker|1a2b":{"refreshToken":"rt-planted"}}'],
    ['old-copy', '{"claudeAiOauth":{}}'],
  ]);
  const store: SecretStore = {
    name: 'the Keychain',
    read: async (item) => ({ ok: true, value: held.get(item.service) ?? null }),
    write: async () => ({ ok: true }),
    remove: async () => ({ ok: true, had: false }),
  };
  const got = await gatherItem({ service: 'ccenv-mcp-auth', account: 'rowan' }, store);
  assert.ok(!('failed' in got));
  assert.deepEqual(got.entries.map((e) => [e.path, e.mode, e.bytes.toString('utf8')]), [['', 0o600, held.get('ccenv-mcp-auth')]]);
  const login = await gatherItem({ service: 'old-copy', account: 'rowan' }, store);
  assert.ok(!('failed' in login) && login.entries.length === 0 && login.skipped[0]?.why === 'login');
  const none = await gatherItem({ service: 'not-there', account: 'rowan' }, store);
  assert.ok(!('failed' in none) && none.missing);
});

test('THE ARCHIVE: what was packed comes back byte for byte, a changed byte is named, and a head out of shape is no archive', () => {
  const entries = [
    { path: 'a.txt', bytes: Buffer.from('alpha\n'), mode: 0o644 },
    { path: 'bin/tidy', bytes: Buffer.from('#!/bin/sh\necho tidy\n'), mode: 0o755 },
    { path: 'empty', bytes: Buffer.alloc(0), mode: 0o600 },
  ];
  const archive = pack(entries);
  assert.ok(archive.subarray(0, 4).equals(Buffer.from('BDA1')));
  const back = unpack(archive);
  assert.ok(back !== null);
  assert.deepEqual(back.mismatched, []);
  assert.deepEqual(
    back.entries.map((e) => [e.path, e.mode, e.bytes.toString('utf8')]),
    entries.map((e) => [e.path, e.mode, e.bytes.toString('utf8')]),
  );
  assert.deepEqual(back.listed[1], { path: 'bin/tidy', size: entries[1]!.bytes.length, mode: 0o755, sha256: createHash('sha256').update(entries[1]!.bytes).digest('hex') });

  const changed = Buffer.from(archive);
  changed[changed.length - 10] = (changed[changed.length - 10] ?? 0) ^ 1;
  assert.deepEqual(unpack(changed)?.mismatched, ['bin/tidy']);
  assert.equal(unpack(archive.subarray(0, archive.length - 1)), null, 'cut short');
  assert.equal(unpack(Buffer.concat([archive, Buffer.from('x')])), null, 'a byte too many');
  assert.equal(unpack(Buffer.from('not an archive at all')), null);

  /* A PLACE THAT WOULD WRITE OUTSIDE ITS ROOT IS NO ARCHIVE. */
  const forged = (path: string) => {
    const head = Buffer.from(JSON.stringify({ v: 1, files: [{ path, size: 1, mode: 0o644, sha256: createHash('sha256').update('x').digest('hex') }] }));
    const size = Buffer.alloc(4);
    size.writeUInt32BE(head.length);
    return Buffer.concat([Buffer.from('BDA1'), size, head, Buffer.from('x')]);
  };
  assert.ok(unpack(forged('fine/name')) !== null);
  for (const path of ['../escape', 'a/../../b', '/abs', 'C:/x', 'a\\b', 'a//b', '.', 'a/./b']) assert.equal(unpack(forged(path)), null, path);
});

test('PLACED: inside its root alone, written whole, and a file it replaces kept aside under ~/.braindog, never beside it', () => {
  const home = newHome();
  const root = join(home, '.local', 'bin');
  assert.equal(targetIn(root, 'tidy', false), join(root, 'tidy'));
  assert.equal(targetIn(root, '', false), root);
  assert.equal(targetIn(root, '../escape', false), null);
  const file = join(root, 'tidy');
  writeWhole(file, Buffer.from('#!/bin/sh\necho one\n'), 0o755);
  assert.ok(holds(file, Buffer.from('#!/bin/sh\necho one\n')));
  assert.ok(!holds(file, Buffer.from('#!/bin/sh\necho two\n')));
  const kept = keepAside(file, { home, stamp: '20261022120000' });
  assert.equal(kept, join(home, '.braindog', 'sync-kept', '20261022120000', '.local', 'bin', 'tidy'));
  assert.equal(readFileSync(kept, 'utf8'), '#!/bin/sh\necho one\n');
  writeWhole(file, Buffer.from('#!/bin/sh\necho two\n'), 0o755);
  assert.equal(readFileSync(file, 'utf8'), '#!/bin/sh\necho two\n');
  assert.ok(!existsSync(`${file}.braindog-${String(process.pid)}.tmp`), 'the file written beside it was left');
});

test('AUTO MEMORY WAITS ON THE OWNER: its sentence says so', () => {
  assert.match(MEMORY_WAITS, /waits on your yes/u);
});
