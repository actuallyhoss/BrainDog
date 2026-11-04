/**
 * The start hook says so before the login lapses, while there is still time to sign in again.
 *
 * THE LAPSE IS REAL AND IT IS STORED. A login is the device grant's bearer, minted for `DEFAULT_DAYS = 90`
 * (`packages/kernel/src/token.ts:47`, `packages/kernel/src/device.ts:250` to `:261`), with no sliding renewal: nothing in
 * the kernel moves `expires_at` once it is written. `login` keeps the date it was answered in the hosts file as
 * `hosts[<host>].token.expires` (`apps/cli/src/login.ts`), and a self-host's login said "token expires
 * 2026-12-22". Past it, `target` throws, the MCP server has nothing to reach, and until this the first word anyone had
 * was the hook's line on the day after.
 *
 * FOURTEEN DAYS, because a person who opens a session every working day then sees it on ten of them.
 *
 * NO REAL HOSTS FILE IS READ: each run has a scratch config folder and no `BRAINDOG_` variable of the machine's own.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LAPSE_WARN_DAYS, lapseWarning } from '../src/login.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const SIGN_IN = `node "${MAIN.replaceAll('\\', '/')}" login`;
const TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-bearer-never-printed-51f0';
const DAY = 86_400_000;
const NOW = Date.parse('2026-12-10T12:00:00Z');

const scratch = mkdtempSync(join(tmpdir(), 'braindog-login-lapse-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
/** A config folder whose hosts file keeps one login for `host`, lapsing at `expires`. */
function hostsWith(host: string, expires: string): { config: string; file: string } {
  const config = join(scratch, `c${String(++n)}`);
  mkdirSync(join(config, 'braindog'), { recursive: true });
  const file = join(config, 'braindog', 'hosts.json');
  writeFileSync(file, JSON.stringify({ default: host, hosts: { [host]: { token: { value: TOKEN, expires, label: 'test' } } } }));
  return { config, file };
}

test('the warning comes inside fourteen days of the stored expiry, and not a millisecond sooner', () => {
  assert.equal(LAPSE_WARN_DAYS, 14);
  const host = 'https://a.example';
  const at = (ms: number) => hostsWith(host, new Date(NOW + ms).toISOString()).file;

  const soon = lapseWarning({}, at(10 * DAY), NOW);
  assert.ok(soon !== null, 'ten days out said nothing');
  /* THE DAY AS THE APP SAYS IT, and the long form never: every date this command prints reads the same. */
  assert.ok(soon.includes('lapses on 20 Dec,'), soon);
  assert.ok(!soon.includes('2026-12-20'), soon);
  assert.ok(soon.includes('in 10 days'), soon);
  assert.ok(soon.includes(`${SIGN_IN} ${host}`), soon);
  assert.ok(!soon.includes(TOKEN), 'the token was printed');

  assert.ok(lapseWarning({}, at(14 * DAY), NOW) !== null, 'exactly fourteen days out said nothing');
  assert.equal(lapseWarning({}, at(14 * DAY + 1), NOW), null, 'more than fourteen days out warned');
  assert.ok(lapseWarning({}, at(3_600_000), NOW)?.includes('within a day'), 'an hour out did not say so');
  /* Lapsed is the hook's own line (`target` throws it), so a second sentence here would say it twice. */
  assert.equal(lapseWarning({}, at(-1), NOW), null, 'a lapsed login warned as if it were still to come');
});

test('no warning for a token the file does not keep, a host with no login, or no hosts file at all', () => {
  const { file } = hostsWith('https://a.example', new Date(NOW + DAY).toISOString());
  /* BRAINDOG_TOKEN BEATS THE FILE in `target`, so the file's date says nothing about the token in use. */
  assert.equal(lapseWarning({ BRAINDOG_TOKEN: TOKEN }, file, NOW), null);
  assert.equal(lapseWarning({ BRAINDOG_HOST: 'https://b.example' }, file, NOW), null);
  assert.equal(lapseWarning({}, join(scratch, 'nowhere', 'hosts.json'), NOW), null);
  const broken = join(scratch, 'broken.json');
  writeFileSync(broken, '{ not json');
  assert.equal(lapseWarning({}, broken, NOW), null);
});

/** A loopback port nothing listens on, so the hook's attach is refused at once. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

function hookStart(config: string): Promise<{ code: number | null; stdout: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config, APPDATA: config, BRAINDOG_TIMEOUT_MS: '1000' };
  for (const name of Object.keys(env)) if ((name.startsWith('BRAINDOG_') && name !== 'BRAINDOG_TIMEOUT_MS') || name === 'CLAUDE_CONFIG_DIR') delete env[name];
  const child = spawn(process.execPath, ['--experimental-strip-types', MAIN, 'hook', 'start'], { cwd: scratch, env });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stdin.end(JSON.stringify({ cwd: scratch, source: 'startup', hook_event_name: 'SessionStart' }));
  const kill = setTimeout(() => child.kill(), 30_000);
  return new Promise((done) =>
    child.on('close', (code) => {
      clearTimeout(kill);
      done({ code, stdout });
    }),
  );
}

test('the start hook prints the warning first, above whatever else it says, and still exits 0', async () => {
  const host = `http://127.0.0.1:${String(await closedPort())}`;
  const { config } = hostsWith(host, new Date(Date.now() + 5 * DAY + 3_600_000).toISOString());
  const { code, stdout } = await hookStart(config);
  assert.equal(code, 0);
  const [first, ...rest] = stdout.trimEnd().split('\n');
  assert.match(first ?? '', /^BrainDog: the login to http:\/\/127\.0\.0\.1:\d+ lapses on \d{1,2} [A-Z][a-z]{2}( \d{4})?, in 5 days\./);
  assert.ok(first?.includes(`${SIGN_IN} ${host}`), first);
  /* THE HOOK'S OWN LINE IS STILL THERE BENEATH IT: a host that did not answer, here. */
  assert.match(rest.join('\n'), /^BrainDog did not answer within 1 seconds/);
  assert.ok(!stdout.includes(TOKEN), 'the token was printed');

  const far = hostsWith(host, new Date(Date.now() + 60 * DAY).toISOString());
  const quiet = await hookStart(far.config);
  assert.equal(quiet.code, 0);
  assert.doesNotMatch(quiet.stdout, /lapses/);
});
