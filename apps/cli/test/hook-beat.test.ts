/**
 * `braindog hook beat`: after a tool call, one `beat` for the session's run at most
 * every five minutes, inside two seconds, never thrown; and the hook script reads the stamp's age before Node starts.
 *
 * MEASURED BEFORE THIS EXISTED: a session that edited files for forty minutes and called no BrainDog tool read Quiet,
 * because last seen moved only on a write. The host is a stub on node:http, as in `hooks.test.ts`.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BEAT_EVERY_MS, beatStamp, hookBeat } from '../src/beat.ts';
import { sessionPath, writeSession } from '../src/hooks.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-hook-beat-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const folder = (name: string) => {
  const dir = join(scratch, `${name}${String(n++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

async function stub(t: { after: (fn: () => Promise<void>) => void }, hang = false) {
  const seen: { method: string; headers: IncomingHttpHeaders; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => {
      seen.push({ method: new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//u, ''), headers: req.headers, body });
      if (hang) return;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, value: { run: 'S7' } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))));
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

const ID = '3f2c7a9e-1b2d-4c5e-8f90-a1b2c3d4e5f6';
const event = (cwd: string, id: string | null = ID) =>
  JSON.stringify({
    ...(id === null ? {} : { session_id: id }),
    cwd,
    transcript_path: join(cwd, 'x.jsonl'),
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: join(cwd, 'secret-plan.md'), new_string: 'the words of the edit' },
    tool_response: { success: true },
  });

/** A machine signed in to `base`, with the start hook's file for the session's run S7 when `run` is true. */
function machine(base: string, run = true) {
  const home = folder('home');
  const cwd = folder('work');
  const env = { XDG_CONFIG_HOME: join(home, '.config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: 'rec_test-beat-never-printed' };
  if (run) writeSession(sessionPath(env, cwd, ID), { host: base, spoken: 'S7', client_id: ID, head_at_start: null, at: new Date().toISOString() });
  return { home, cwd, env, io: (stdin = event(cwd)) => ({ env, stdin, cwd, home, write: () => assert.fail('a beat printed') }) };
}

test('one beat for the run, then nothing for five minutes, then one more', async (t) => {
  const host = await stub(t);
  const m = machine(host.base);
  const now = Date.now();
  assert.equal(await hookBeat(m.io(), now), 'sent');
  assert.deepEqual(host.seen.map((s) => s.method), ['beat']);
  assert.equal(host.seen[0]!.headers['x-braindog-session'], 'S7');
  assert.equal(host.seen[0]!.headers['x-braindog-client'], ID);
  assert.ok(existsSync(beatStamp(m.home, ID)));
  /* THE RUN AND NOTHING ELSE: no tool, no file the tool touched, no word of the edit, no transcript. */
  const sent = `${host.seen[0]!.body}\n${JSON.stringify(host.seen[0]!.headers)}`;
  for (const word of ['Edit', 'secret-plan', 'the words of the edit', 'x.jsonl', 'transcript', 'tool_'])
    assert.equal(sent.includes(word), false, `the beat sent ${word}: ${sent}`);
  assert.deepEqual(JSON.parse(host.seen[0]!.body || '{}'), {}, 'the beat carried arguments');

  assert.equal(await hookBeat(m.io(), now + 60_000), 'fresh');
  assert.equal(await hookBeat(m.io(), now + BEAT_EVERY_MS - 1_000), 'fresh');
  assert.equal(host.seen.length, 1, 'a beat inside five minutes reached the host');
  /* The stamp's own time, five minutes back, as five minutes passing would leave it. */
  const back = (now - BEAT_EVERY_MS - 1_000) / 1_000;
  utimesSync(beatStamp(m.home, ID), back, back);
  assert.equal(await hookBeat(m.io(), now), 'sent');
  assert.equal(host.seen.length, 2);
});

test('signed out, or no run held for the session: nothing is sent and nothing throws', async (t) => {
  const host = await stub(t);
  const out = machine(host.base);
  assert.equal(await hookBeat({ ...out.io(), env: { XDG_CONFIG_HOME: out.env.XDG_CONFIG_HOME } }), 'signed out');
  const none = machine(host.base, false);
  assert.equal(await hookBeat(none.io()), 'no run');
  /* AND THE STAMP IS WRITTEN ALL THE SAME, so a session with no run starts Node once in five minutes, not every call. */
  assert.equal(await hookBeat(none.io()), 'fresh');
  /* Another session's file in the folder is not this session's run. */
  writeSession(sessionPath(none.env, none.cwd), { host: host.base, spoken: 'S9', client_id: 'another-session', head_at_start: null, at: new Date().toISOString() });
  assert.equal(await hookBeat(none.io(), Date.now() + BEAT_EVERY_MS + 1_000), 'no run');
  assert.equal(host.seen.length, 0);
  /* An event that does not read as JSON names no session, and a folder with no run file holds none. */
  const broken = machine(host.base, false);
  assert.equal(await hookBeat(broken.io('not json at all')), 'no run');
  assert.equal(host.seen.length, 0);
});

test('a host that never answers costs the beat two seconds at most', { timeout: 10_000 }, async (t) => {
  const host = await stub(t, true);
  const m = machine(host.base);
  const began = Date.now();
  assert.equal(await hookBeat(m.io()), 'failed');
  assert.ok(Date.now() - began < 2_800, `took ${String(Date.now() - began)} ms`);
  /* And the stamp is written first, so the next tool call does not wait again. */
  assert.equal(await hookBeat(m.io()), 'fresh');
});

test('a session id never names a path outside the stamps folder', () => {
  assert.equal(beatStamp('/h', '../../etc/x'), join('/h', '.braindog', 'beats', '______etc_x'));
  assert.equal(beatStamp('/h', undefined), join('/h', '.braindog', 'beats', '-'));
});

test('the hook script reads the stamp before Node starts, and hands the event on when it is old', { skip: process.platform === 'win32' }, () => {
  const home = folder('home');
  const bin = folder('bin');
  const ran = join(home, 'node-ran.txt');
  /* A stand-in `node` that keeps what it was given, so a start is seen and nothing is sent anywhere. */
  writeFileSync(join(bin, 'node'), `#!/bin/sh\necho "$@" > "${ran}"\ncat >> "${ran}"\n`);
  chmodSync(join(bin, 'node'), 0o755);
  const script = join(APP, 'hooks', 'braindog-hook.sh');
  const run = () => spawnSync('sh', [script, 'beat'], { input: event('/tmp/work'), env: { HOME: home, PATH: `${bin}:/usr/bin:/bin` }, encoding: 'utf8' });

  const stale = run();
  assert.equal(stale.status, 0);
  assert.ok(existsSync(ran), 'no stamp, and Node was not started');
  assert.match(readFileSync(ran, 'utf8'), /hook beat\n.*"session_id":"3f2c7a9e/su);
  rmSync(ran);

  /* The stand-in wrote no stamp, as an older command without `hook beat` writes none: the script wrote it. */
  assert.ok(existsSync(beatStamp(home, ID)), 'the script left no stamp after Node');
  const fresh = run();
  assert.equal(fresh.status, 0);
  assert.equal(existsSync(ran), false, 'Node was started inside five minutes');
  assert.equal(fresh.stdout, '');
});
