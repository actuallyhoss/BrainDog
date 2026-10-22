/**
 * Where each machine keeps its sync key (`secret-store.ts`): the Keychain, Credential Manager and the secret service,
 * each driven through a program that a test stands in for, so no real store on this machine is asked anything.
 *
 * WHAT IS HELD: the value never rides on a program's command line, where any other program could read it while it runs
 * (only an item of tool sign-ins too long for one line of `security -i` does, and never the sync key); an agent app's
 * own login is refused before any program starts; and what a program prints is never relayed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { credentialManager, credScript, encoded, keychain, MAC_LINE, secretService, storeFor, syncKeyItem, targetOf, type Item, type Ran, type Run } from '../src/secret-store.ts';

const KEY_HEX = 'ab'.repeat(32);
const SIGN_INS = JSON.stringify({ 'tracker|1a2b': { accessToken: 'at-planted-value', refreshToken: 'rt-planted-value', expiresAt: 1 } });

type Call = { command: string; args: string[]; input: string | null };

/** A store's program stood in for: each call kept, each answer from `answer`, and an item kept as a real store keeps it. */
function programs(answer: (c: Call, kept: Map<string, string>) => Ran): { run: Run; calls: Call[]; kept: Map<string, string> } {
  const calls: Call[] = [];
  const kept = new Map<string, string>();
  const run: Run = async (command, args, input) => {
    const c = { command, args, input };
    calls.push(c);
    return answer(c, kept);
  };
  return { run, calls, kept };
}

/** `security`, as a Mac answers: `-i` reads an add line on stdin, `find` prints the value, 44 for an item not there. */
const security = (c: Call, kept: Map<string, string>): Ran => {
  const words = c.args[0] === '-i' ? (c.input ?? '').trim().split(' ') : c.args;
  const at = (flag: string) => words[words.indexOf(flag) + 1] ?? '';
  const name = `${at('-s')}/${at('-a')}`;
  if (words[0] === 'add-generic-password') {
    kept.set(name, Buffer.from(at('-X'), 'hex').toString('utf8'));
    return { code: 0, out: '' };
  }
  if (words[0] === 'find-generic-password') return kept.has(name) ? { code: 0, out: `${kept.get(name) ?? ''}\n` } : { code: 44, out: '' };
  if (words[0] === 'delete-generic-password') return kept.delete(name) ? { code: 0, out: '' } : { code: 44, out: '' };
  return { code: 1, out: 'security: unknown command' };
};

const onArgs = (calls: Call[], text: string) => calls.some((c) => c.args.some((a) => a.includes(text)));

test('THE SYNC KEY, ON A MAC: typed into security -i on standard input, never an argument, and read back before it counts', async () => {
  const { run, calls, kept } = programs(security);
  const store = keychain(run);
  const item = syncKeyItem('the-bench');
  assert.deepEqual(item, { service: 'braindog-sync-key', account: 'the-bench', attribute: 'slug' });
  assert.deepEqual(await store.write(item, KEY_HEX), { ok: true });
  assert.deepEqual(calls[0]?.args, ['-i']);
  assert.match(calls[0]?.input ?? '', /^add-generic-password -U -s braindog-sync-key -a the-bench -X [0-9a-f]+\n$/u);
  assert.ok(!onArgs(calls, KEY_HEX) && !onArgs(calls, Buffer.from(KEY_HEX).toString('hex')), 'the key was on a command line');
  assert.equal(calls[1]?.args[0], 'find-generic-password', 'it was not read back');
  assert.equal(kept.get('braindog-sync-key/the-bench'), KEY_HEX);
  assert.deepEqual(await store.read(item), { ok: true, value: KEY_HEX });
  assert.deepEqual(await store.remove(item), { ok: true, had: true });
  assert.deepEqual(await store.read(item), { ok: true, value: null }, 'gone is nothing there');
  assert.deepEqual(await store.remove(item), { ok: true, had: false });
});

test('A WRITE THE KEYCHAIN DID NOT KEEP IS NO WRITE, and nothing a program printed is said', async () => {
  const { run } = programs((c) => (c.args[0] === 'find-generic-password' ? { code: 51, out: 'the planted output' } : { code: 0, out: 'the planted output' }));
  const store = keychain(run);
  const wrote = await store.write(syncKeyItem('the-bench'), KEY_HEX);
  assert.equal(wrote.ok, false);
  const read = await store.read(syncKeyItem('the-bench'));
  assert.ok(!read.ok && !read.why.includes('planted'), JSON.stringify(read));
  const { run: none } = programs(() => ({ code: -1, out: '' }));
  const missing = await keychain(none).read(syncKeyItem('the-bench'));
  assert.ok(!missing.ok && /did not start/u.test(missing.why));
});

test('TOOL SIGN-INS TOO LONG FOR ONE LINE OF security -i go on its command line; the sync key never does', async () => {
  const { run, calls, kept } = programs(security);
  const store = keychain(run);
  const long = JSON.stringify({ entries: 'x'.repeat(3_000) });
  const signIns: Item = { service: 'ccenv-mcp-auth', account: 'rowan' };
  assert.deepEqual(await store.write(signIns, long), { ok: true });
  assert.equal(calls[0]?.args[0], 'add-generic-password', 'a long item went to security -i, which cuts a line at 4,096 bytes');
  assert.equal(kept.get('ccenv-mcp-auth/rowan'), long);
  /* SHORT, THE SAME ITEM IS TYPED IN. */
  calls.length = 0;
  assert.deepEqual(await store.write(signIns, SIGN_INS), { ok: true });
  assert.deepEqual(calls[0]?.args, ['-i']);
  assert.ok((calls[0]?.input ?? '').length <= MAC_LINE);
  /* AND A SYNC KEY THAT DID NOT FIT WOULD BE REFUSED, NOT PUT ON A COMMAND LINE. */
  calls.length = 0;
  const refused = await store.write(syncKeyItem('the-bench'), 'f'.repeat(4_000));
  assert.ok(!refused.ok && /never written on a command line/u.test(refused.why));
  assert.equal(calls.length, 0);
});

test("AN AGENT APP'S OWN LOGIN IS NEVER ASKED FOR: refused before any program starts, in every store", async () => {
  const logins: Item[] = [
    { service: 'Claude Code-credentials', account: 'rowan' },
    { service: 'Claude Code-credentials-1a2b3c4d', account: 'rowan' },
    { service: 'claude code-CREDENTIALS', account: 'rowan' },
    { service: 'ccenv-mcp-auth', account: 'claudeAiOauth' },
  ];
  for (const make of [keychain, credentialManager, secretService]) {
    const { run, calls } = programs(() => ({ code: 0, out: '' }));
    const store = make(run);
    for (const item of logins) {
      for (const answer of [await store.read(item), await store.write(item, 'value'), await store.remove(item)]) assert.ok(!answer.ok && /own login/u.test(answer.why), `${store.name}: ${item.service}`);
    }
    assert.equal(calls.length, 0, `${store.name} ran a program for a login`);
  }
});

test('A NAME NO STORE SHOULD READ A WORD IN IS REFUSED: spaces, quotes, a semicolon', async () => {
  const { run, calls } = programs(() => ({ code: 0, out: '' }));
  for (const item of [
    { service: 'braindog sync', account: 'a' },
    { service: "braindog'", account: 'a' },
    { service: 'braindog', account: 'a;b' },
    { service: 'braindog', account: 'a', attribute: 'Slug Name' },
  ]) {
    const read = await keychain(run).read(item);
    assert.ok(!read.ok && /letters, digits/u.test(read.why), JSON.stringify(item));
  }
  assert.equal(calls.length, 0);
});

test('WINDOWS: Credential Manager through a PowerShell helper handed as -EncodedCommand, the value on standard input', async () => {
  const { run, calls, kept } = programs((c, held) => {
    const script = Buffer.from(c.args.at(-1) ?? '', 'base64').toString('utf16le');
    const target = /::(?:Read|Write|Remove)\('([^']+)'/u.exec(script)?.[1] ?? '';
    if (script.includes('::Write(')) {
      held.set(target, c.input ?? '');
      return { code: 0, out: '' };
    }
    if (script.includes('::Read(')) return held.has(target) ? { code: 0, out: held.get(target) ?? '' } : { code: 2, out: '' };
    return held.delete(target) ? { code: 0, out: '' } : { code: 2, out: '' };
  });
  const store = credentialManager(run);
  const item = syncKeyItem('the-bench');
  assert.equal(targetOf(item), 'braindog-sync-key:the-bench');
  assert.deepEqual(await store.read(item), { ok: true, value: null });
  assert.deepEqual(await store.write(item, KEY_HEX), { ok: true });
  assert.equal(kept.get('braindog-sync-key:the-bench'), KEY_HEX);
  const write = calls.find((c) => Buffer.from(c.args.at(-1) ?? '', 'base64').toString('utf16le').includes('::Write('));
  assert.ok(write !== undefined);
  assert.equal(write.command, 'powershell.exe');
  assert.deepEqual(write.args.slice(0, -1), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']);
  assert.equal(write.input, KEY_HEX, 'the value went on standard input');
  assert.ok(!onArgs(calls, KEY_HEX) && !calls.some((c) => Buffer.from(c.args.at(-1) ?? '', 'base64').toString('utf16le').includes(KEY_HEX)), 'the key was in the command');
  assert.deepEqual(await store.read(item), { ok: true, value: KEY_HEX });
  assert.deepEqual(await store.remove(item), { ok: true, had: true });

  /* THE HELPER WRITES AND READS UTF-8 WITH NO BYTE-ORDER MARK, and its script is the one handed. */
  const script = credScript('write', item);
  assert.match(script, /New-Object System\.Text\.UTF8Encoding\(\$false\)/u);
  assert.match(script, /\[BrainDogCred\]::Write\('braindog-sync-key:the-bench', 'the-bench', \$v\)/u);
  assert.equal(Buffer.from(encoded(script), 'base64').toString('utf16le'), script);
});

test('LINUX: the secret service through secret-tool, the value on standard input, nothing there read as nothing', async () => {
  const { run, calls, kept } = programs((c, held) => {
    const name = c.args.slice(c.args[0] === 'store' ? 2 : 1).join(' ');
    if (c.args[0] === 'store') {
      held.set(name, c.input ?? '');
      return { code: 0, out: '' };
    }
    if (c.args[0] === 'lookup') return held.has(name) ? { code: 0, out: held.get(name) ?? '' } : { code: 1, out: '' };
    return held.delete(name) ? { code: 0, out: '' } : { code: 1, out: '' };
  });
  const store = secretService(run);
  const item = syncKeyItem('the-bench');
  assert.deepEqual(await store.read(item), { ok: true, value: null });
  assert.deepEqual(await store.write(item, KEY_HEX), { ok: true });
  const stored = calls.find((c) => c.args[0] === 'store');
  assert.deepEqual(stored?.args, ['store', '--label=braindog-sync-key the-bench', 'service', 'braindog-sync-key', 'slug', 'the-bench']);
  assert.equal(stored?.input, KEY_HEX);
  assert.ok(!onArgs(calls, KEY_HEX));
  assert.equal(kept.get('service braindog-sync-key slug the-bench'), KEY_HEX);
  assert.deepEqual(await store.remove(item), { ok: true, had: true });
  assert.deepEqual(await store.remove(item), { ok: true, had: false });
});

test('EACH SYSTEM GETS ITS OWN STORE', () => {
  const { run } = programs(() => ({ code: 0, out: '' }));
  assert.deepEqual(
    ['darwin', 'win32', 'linux', 'freebsd'].map((p) => storeFor(p, run).name),
    ['the Keychain', 'Credential Manager', 'the secret service', 'the secret service'],
  );
});
