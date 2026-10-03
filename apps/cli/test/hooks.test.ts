/**
 * `braindog hook start|end` and `braindog install` as Claude Code and a person run them: a child process,
 * the event on stdin, and a host answering `/api` over a real socket.
 *
 * THE HOST IS A STUB ON node:http, NOT THE SELF-HOST, because apps never import apps (the graph gate).
 * What is under test is the command: what it sends, what it keeps, what it prints, and that it exits 0.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HOOK_MS, heldFor, hookBudget, notSignedIn, readSession, REMEMBER_MS, sessionPath, writeSession, type SessionFile } from '../src/hooks.ts';
import { replaceByHand, hookCommand, installInto, serversFileOf } from '../src/install.ts';
import { sessionHeaders } from '../src/position.ts';
import { REPLACE, REPLACE_FILE } from './replace.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = 'rec_01TESTTESTTESTTESTTESTTEST.stub-bearer-never-printed-4c1d';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-hooks-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let folders = 0;
const folder = (name: string) => {
  const dir = join(scratch, `${name}-${String(folders++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** Everything any child wrote on either stream, for the last test, which says none of it holds the token. */
const printed: string[] = [];

/* ── a host ────────────────────────────────────────────────────────────── */

type Seen = { method: string; body: Record<string, unknown>; headers: IncomingHttpHeaders };

const CONTEXT = {
  session: { spoken: 'S7', state: 'active' },
  project: { spoken: 'things#1', name: 'Kiln', mark: 'K', hue: 20, how: 'folder' },
  ambiguous: [],
  handoff: { from: 'S6', age_s: 600, next: 'Kern the lowercase pairs', tried: [], head: null },
  live: { same_repo: [], elsewhere: [] },
  waiting: [{ id: 'SG3', question: 'Let kilnfonts.example lapse?' }],
  registers: [],
  people: [],
  faded: 0,
  next: 'Start from the handoff S6 left, and call handoff with your own next step before you stop.',
};

/**
 * `attach` answers S7, resumed when the event says so; `handoff` answers the row; `meet` adds a person, or
 * refuses as a record without People does when `people` is false. With `hang`, nothing ever answers. With `card`,
 * the context carries the record's own card, as a host that draws one does. `context` answers the same context,
 * `boot` says the sign-in speaks for Sam, and `list` answers no rows, for the commands and the MCP server.
 */
async function stubHost(t: { after: (fn: () => Promise<void>) => void }, hang = false, people = true, card?: string) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      seen.push({ method, body, headers: req.headers });
      if (hang) return;
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      const row = { id: 'e_7', seq: 7, state: 'active', version: 2, fields: {} };
      if (method === 'attach')
        return answer({ ok: true, value: { session: row, spoken: 'S7', resumed: body.source !== 'startup', project: 'things#1', context: card === undefined ? CONTEXT : { ...CONTEXT, card } } });
      if (method === 'handoff') return answer({ ok: true, value: { ...row, state: body.state } });
      if (method === 'context') return answer({ ok: true, value: CONTEXT });
      if (method === 'boot') return answer({ ok: true, value: { registers: [], now: '2026-10-02T09:00:00Z', me: { kind: 'token', person: 'p_owner', name: 'Sam', level: 'owner' } } });
      if (method === 'list') return answer({ ok: true, value: { rows: [], matched: 0, cursor: null } });
      if (method === 'meet')
        return answer(
          people
            ? { ok: true, value: { person: 'people#1', created: true, linked: true, merge: null } }
            : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no people register, so nobody can be met. Nothing was written.', at: 'register' } },
        );
      answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub answers attach, handoff, meet, context, boot and list, and not ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

/* ── a command ─────────────────────────────────────────────────────────── */

/**
 * The machine's own BrainDog and Claude settings stay out: an empty config folder, no BRAINDOG_ variable, and none of
 * the variables Claude Code gives the shell it runs these tests in, so a child does not take this session for its own.
 */
function envFor(config: string, extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config };
  for (const name of Object.keys(env))
    if (name.startsWith('BRAINDOG_') || name.startsWith('CLAUDE_CODE_') || ['CLAUDECODE', 'CLAUDE_SESSION_ID', 'CLAUDE_PID', 'CLAUDE_CONFIG_DIR'].includes(name)) delete env[name];
  return { ...env, ...extra };
}

type Ran = { code: number | null; stdout: string; stderr: string; ms: number };

/** Run the command in `cwd` with `stdin`, and wait for it to exit. Asynchronous, so the stub in this process can answer. */
function run(args: string[], env: NodeJS.ProcessEnv, stdin: string, cwd = scratch): Promise<Ran> {
  const began = Date.now();
  const child = spawn(process.execPath, [join(APP, 'src', 'main.ts'), ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
  child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
  child.stdin.end(stdin);
  return new Promise((done) => {
    const kill = setTimeout(() => child.kill(), 30_000);
    child.on('close', (code) => {
      clearTimeout(kill);
      printed.push(stdout, stderr);
      done({ code, stdout, stderr, ms: Date.now() - began });
    });
  });
}

const event = (cwd: string, fields: Record<string, unknown>) => JSON.stringify({ cwd, transcript_path: join(cwd, 'x.jsonl'), hook_event_name: 'SessionStart', ...fields });

/* ── the start hook ────────────────────────────────────────────────────── */

test('THE START HOOK ATTACHES, KEEPS THE SESSION FILE, AND PRINTS THE CARD, then exits 0', async (t) => {
  const host = await stubHost(t);
  const config = folder('config');
  const cwd = folder('kiln');
  const env = envFor(config, { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  const out = await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-1', source: 'startup' }));
  assert.equal(out.code, 0, out.stderr);
  assert.equal(out.stderr, '');
  const lines = out.stdout.trimEnd().split('\n');
  assert.match(lines[0]!, /^BrainDog · run S7 · project Kiln · Claude Code on \S/u);
  /* The machine as a person names it, never its network name. */
  assert.equal(lines[0]!.includes(hostname()), false, lines[0]);
  assert.deepEqual(lines.slice(1), ['Next     Kern the lowercase pairs. (S6, 10m ago, check before acting)', 'Waiting  1 on Sam: Let kilnfonts.example lapse?', 'More     call context']);

  /* A question waits, so whose it is was read beside the attach. */
  assert.deepEqual(host.seen.map((s) => s.method), ['attach', 'boot']);
  const [attach] = host.seen;
  assert.deepEqual(attach!.body, { source: 'startup', client_id: 'claude-run-1' });
  assert.equal(attach!.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(attach!.headers['x-braindog-agent'], 'claude');
  assert.equal(attach!.headers['x-braindog-cwd'], cwd);
  /* Attaching finds the run by its client id, so an old run named in a file is never sent, and the session's own id is. */
  assert.equal(attach!.headers['x-braindog-session'], undefined);
  assert.equal(attach!.headers['x-braindog-client'], 'claude-run-1');
  assert.deepEqual([host.seen[1]!.headers['x-braindog-session'], host.seen[1]!.headers['x-braindog-client']], ['S7', 'claude-run-1']);

  const file = sessionPath(env, cwd);
  assert.ok(file.startsWith(join(config, 'braindog', 'sessions')), file);
  const held = readSession(file);
  assert.deepEqual({ ...held, at: undefined }, { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: undefined });
  assert.ok(!readFileSync(file, 'utf8').includes('stub-bearer'), 'the session file holds the token');
});

test('COMPACT RE-ATTACHES to the same run by its client id, prints only the Next line, and keeps the commit it started from', async (t) => {
  const host = await stubHost(t);
  const config = folder('config');
  const cwd = folder('kiln');
  const env = envFor(config, { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: 'abc1234', at: '2026-09-15T00:00:00Z' });

  const out = await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-1', source: 'compact' }));
  assert.equal(out.code, 0);
  assert.deepEqual(host.seen[0]?.body, { source: 'compact', client_id: 'claude-run-1' });
  assert.equal(out.stdout, 'Next     Kern the lowercase pairs. (S6, 10m ago, check before acting)\n', 'a compaction is told only the step it is on');
  assert.equal(readSession(sessionPath(env, cwd))?.head_at_start, 'abc1234');
});

test('A RESUME WITHIN THE HOUR OF THE SAME SESSION PRINTS NOTHING and still re-attaches; later, by another session, or after a clear, it gets the card', async (t) => {
  const host = await stubHost(t);
  const cwd = folder('kiln');
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const file = sessionPath(env, cwd);
  const minutes = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  const resume = event(cwd, { session_id: 'claude-run-1', source: 'resume' });

  /* Ended twenty minutes ago, as the end hook writes it: the card is still in the conversation. */
  writeSession(file, { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: minutes(300), seen: minutes(20) });
  const quiet = await run(['hook', 'start'], env, resume);
  assert.deepEqual([quiet.code, quiet.stdout, quiet.stderr], [0, '', '']);
  assert.deepEqual(host.seen.map((s) => [s.method, s.body.source]), [['attach', 'resume']], 'a quiet resume still brings the run back');

  /* Two hours away: the whole card. */
  writeSession(file, { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: minutes(300), seen: minutes(120) });
  assert.match((await run(['hook', 'start'], env, resume)).stdout, /^BrainDog · run S7 · project Kiln · Claude Code on [^\n]+\nNext {5}Kern/u);

  /* A file another session wrote a minute ago is not this session's card. */
  writeSession(file, { host: host.base, spoken: 'S7', client_id: 'claude-run-2', head_at_start: null, at: minutes(1) });
  assert.match((await run(['hook', 'start'], env, resume)).stdout, /^BrainDog · run S7 /u);

  /* Not signed in, within the hour: still nothing, because the session already said so when it started. */
  const signedOut = envFor(folder('config'), {});
  writeSession(sessionPath(signedOut, cwd), { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: minutes(5) });
  assert.equal((await run(['hook', 'start'], signedOut, resume)).stdout, '');

  /* A clear empties the conversation, so it is the whole card however recent. */
  assert.match((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-1', source: 'clear' }))).stdout, /^BrainDog · run S7 [^\n]*\nNext {5}Kern/u);
});

test('THE RECORD’S OWN CARD IS PRINTED AS IT CAME, and a compaction prints only its Next line', async (t) => {
  const card = 'BrainDog · run S7 · project Kiln · Claude Code on MacBook\nNext     Kern the lowercase pairs. (S6, Claude Code, 10m ago)\nMore     call context';
  const host = await stubHost(t, false, true, card);
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const cwd = folder('kiln');
  assert.equal((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-9', source: 'startup' }))).stdout, `${card}\n`);
  assert.equal((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-9', source: 'compact' }))).stdout, 'Next     Kern the lowercase pairs. (S6, Claude Code, 10m ago)\n');
});

test('AN UNREACHABLE HOST IS ONE LINE AND EXIT 0: a host that never answers, and a port nobody listens on', async (t) => {
  assert.equal(HOOK_MS, 8_000);
  assert.equal(hookBudget({}), 8_000);
  assert.equal(hookBudget({ BRAINDOG_TIMEOUT_MS: '60000' }), 8_000, 'the hook budget grew past eight seconds');

  const hangs = await stubHost(t, true);
  const cwd = folder('kiln');
  const config = folder('config');
  const slow = await run(['hook', 'start'], envFor(config, { BRAINDOG_HOST: hangs.base, BRAINDOG_TOKEN: TOKEN, BRAINDOG_TIMEOUT_MS: '700' }), event(cwd, { session_id: 'r2' }));
  assert.equal(slow.code, 0);
  assert.equal(slow.stdout, 'BrainDog did not answer within 0.7 seconds, so this session works without shared context.\n');
  assert.ok(slow.ms < 8_000, `the hook took ${String(slow.ms)} ms`);
  assert.equal(existsSync(sessionPath(envFor(config, {}), cwd)), false, 'a run nobody attached was written down');

  /* Nothing listens on port 9 of this machine, so the connection is refused at once. */
  const closed = await run(['hook', 'start'], envFor(folder('config'), { BRAINDOG_HOST: 'http://127.0.0.1:9', BRAINDOG_TOKEN: TOKEN }), event(cwd, {}));
  assert.equal(closed.code, 0);
  assert.equal(closed.stdout.trimEnd().split('\n').length, 1);
  assert.match(closed.stdout, /^BrainDog did not answer within 8 seconds/);
});

test('NOT SIGNED IN is one line saying how to get a token, exit 0, and nothing is sent', async (t) => {
  const host = await stubHost(t);
  const config = folder('config');
  const hosts = join(config, 'braindog', 'hosts.json');

  const none = await run(['hook', 'start'], envFor(config, {}), event(folder('kiln'), {}));
  assert.equal(none.code, 0);
  assert.equal(none.stdout, `${notSignedIn(hosts)}\n`);
  assert.match(none.stdout, /BRAINDOG_TOKEN/);

  const noToken = await run(['hook', 'start'], envFor(config, { BRAINDOG_HOST: host.base }), event(folder('kiln'), {}));
  assert.equal(noToken.stdout, `${notSignedIn(hosts)}\n`);
  assert.deepEqual(host.seen, []);

  /* An empty stdin, as a person running it by hand sends, is the same startup. */
  assert.equal((await run(['hook', 'start'], envFor(config, {}), '')).code, 0);
});

/* ── the end hook ──────────────────────────────────────────────────────── */

test('THE END HOOK SETS IDLE, NEVER DONE, on the run the session file names, and prints nothing', async (t) => {
  const host = await stubHost(t);
  const config = folder('config');
  const cwd = folder('kiln');
  const env = envFor(config, { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-09-15T00:00:00Z' });

  const before = Date.now();
  const out = await run(['hook', 'end'], env, JSON.stringify({ session_id: 'claude-run-1', cwd, hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' }));
  assert.deepEqual([out.code, out.stdout, out.stderr], [0, '', '']);
  assert.deepEqual(host.seen.map((s) => [s.method, s.body]), [['handoff', { state: 'idle' }]]);
  assert.equal(host.seen[0]!.headers['x-braindog-session'], 'S7');
  assert.equal(host.seen[0]!.headers['x-braindog-client'], 'claude-run-1');
  /* When it ended, so a resume within the hour knows the card is still in the conversation. The rest is as it was. */
  const ended = readSession(sessionPath(env, cwd));
  assert.ok(Date.parse(ended?.seen ?? '') >= before - 1_000, JSON.stringify(ended));
  assert.deepEqual({ ...ended, seen: undefined }, { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-09-15T00:00:00Z', seen: undefined });

  /* Another session in the same folder wrote the file since: its run is not this one's to idle. */
  const other = await run(['hook', 'end'], env, JSON.stringify({ session_id: 'claude-run-2', cwd, reason: 'other' }));
  assert.equal(other.code, 0);
  assert.equal(host.seen.length, 1);

  /* No session file, a host that is down, or no token: still silent, still 0. */
  const bare = folder('elsewhere');
  assert.deepEqual(Object.values(await run(['hook', 'end'], env, JSON.stringify({ cwd: bare }))).slice(0, 3), [0, '', '']);
  assert.equal((await run(['hook', 'end'], envFor(folder('config'), {}), '')).stdout, '');
  assert.equal(host.seen.length, 1);
});

/* ── the people harvest ────────────────────────────────────────────────── */

/** A repository in a temporary folder with its own identity, so the commits and the owner's address are the test's. */
function repository(): { dir: string; commit: (author?: string) => string } {
  const dir = folder('repo');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Owner');
  git('config', 'user.email', 'owner@example.com');
  git('config', 'commit.gpgsign', 'false');
  let n = 0;
  return {
    dir,
    commit: (author) => {
      git('commit', '--quiet', '--allow-empty', '-m', `change ${String(++n)}`, ...(author === undefined ? [] : ['--author', author]));
      return git('rev-parse', '--short', 'HEAD');
    },
  };
}

test('THE END HOOK MEETS THE AUTHORS OF THIS SESSION’S COMMITS before the run goes idle: no bots, not the owner, at most ten, and silent when refused', async (t) => {
  const repo = repository();
  const start = repo.commit();
  repo.commit('dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>');
  repo.commit('Claude <noreply@anthropic.com>');
  for (let i = 1; i <= 11; i++) repo.commit(`Person ${String(i)} <person${String(i)}@example.com>`);
  repo.commit('Person 11 <PERSON11@example.com>');
  repo.commit();
  const last = repo.commit('Ada Lovelace <123+ada@users.noreply.github.com>');
  const name = repo.dir.split(/[\\/]/).at(-1)!;
  const end = JSON.stringify({ session_id: 'claude-run-3', cwd: repo.dir, hook_event_name: 'SessionEnd', reason: 'logout' });
  const signedIn = (base: string) => {
    const env = envFor(folder('config'), { BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN });
    writeSession(sessionPath(env, repo.dir), { host: base, spoken: 'S7', client_id: 'claude-run-3', head_at_start: start, at: '2026-09-15T00:00:00Z' });
    return env;
  };

  const host = await stubHost(t);
  const out = await run(['hook', 'end'], signedIn(host.base), end);
  assert.deepEqual([out.code, out.stdout, out.stderr], [0, '', '']);
  assert.deepEqual(host.seen.map((s) => s.method), [...Array<string>(10).fill('meet'), 'handoff']);
  const met = host.seen.filter((s) => s.method === 'meet');
  /* Newest first: GitHub's private address as a handle, the owner's commit left out, and one person once. */
  assert.deepEqual(met[0]!.body, { name: 'Ada Lovelace', handle: 'github:ada', where: `commit ${last} in ${name}` });
  assert.deepEqual(
    met.slice(1).map((s) => s.body.email),
    [11, 10, 9, 8, 7, 6, 5, 4, 3].map((i) => `person${String(i)}@example.com`),
  );
  for (const s of met) {
    assert.match(String(s.body.where), new RegExp(`^commit [0-9a-f]{4,40} in ${name}$`));
    assert.equal(s.headers['x-braindog-session'], 'S7');
  }

  /* People switched off: the first is refused, no more are sent, and the run still goes idle. */
  const off = await stubHost(t, false, false);
  const quiet = await run(['hook', 'end'], signedIn(off.base), end);
  assert.deepEqual([quiet.code, quiet.stdout, quiet.stderr], [0, '', '']);
  assert.deepEqual(off.seen.map((s) => s.method), ['meet', 'handoff']);

  /* A port nobody listens on: nothing said, and exit 0. */
  const down = await run(['hook', 'end'], signedIn('http://127.0.0.1:9'), end);
  assert.deepEqual([down.code, down.stdout, down.stderr], [0, '', '']);
});

test('the MCP server sends the run and client from the session file, and a hook refuses a stray argument with exit 0', async () => {
  const at = { cwd: 'C:\\Repos\\kiln', repo: 'kiln', remote: null, host: 'box', branch: null, head: null };
  assert.deepEqual(sessionHeaders(at, 'claude', { spoken: 'S7', client_id: 'claude-run-1' }), {
    'x-braindog-session': 'S7',
    'x-braindog-client': 'claude-run-1',
    'x-braindog-host': 'box',
    'x-braindog-repo': 'kiln',
    'x-braindog-cwd': 'C:\\Repos\\kiln',
    'x-braindog-agent': 'claude',
  });
  assert.equal(sessionHeaders(at, 'claude', { spoken: 'not-a-run' })['x-braindog-session'], undefined);

  const stray = await run(['hook', 'begin'], envFor(folder('config'), {}), '');
  assert.equal(stray.code, 0);
  assert.match(stray.stderr, /^braindog hook takes start or end/);
});

/* ── which run a command is ────────────────────────────────────────────── */

test('A REMEMBERED RUN IS SENT ONLY WHILE IT IS THE CALLER’S: its own host session’s, or one a hook heard from in twelve hours', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const held: SessionFile = { host: 'https://brain.dog/kiln', spoken: 'S297', client_id: 'claude-run-old', head_at_start: null, at: new Date(now - 3_600_000).toISOString() };
  /* Outside a host session: the folder's run while a hook heard from it, at its start or its end, and not past twelve hours. */
  assert.equal(heldFor(held, held.host, {}, now), held);
  assert.equal(heldFor({ ...held, at: new Date(now - REMEMBER_MS - 1_000).toISOString() }, held.host, {}, now), undefined);
  const ended = { ...held, at: '2026-09-29T00:00:00Z', seen: new Date(now - 60_000).toISOString() };
  assert.equal(heldFor(ended, held.host, {}, now), ended);
  /* Inside one: only a file that session wrote, whatever its age; and never a file for another host. */
  assert.equal(heldFor(held, held.host, { CLAUDE_CODE_SESSION_ID: 'claude-run-mine' }, now), undefined);
  assert.equal(heldFor(held, held.host, { CLAUDE_SESSION_ID: 'claude-run-old' }, now), held);
  assert.equal(heldFor({ ...held, at: '2026-09-01T00:00:00Z' }, held.host, { CLAUDE_CODE_SESSION_ID: 'claude-run-old' }, now)?.spoken, 'S297');
  assert.equal(heldFor(held, 'https://brain.dog/other', {}, now), undefined);
  assert.equal(heldFor(null, held.host, {}, now), undefined);

  /* A SERVER KEPT ACROSS A CLEAR still has the id it started with. The file a start hook wrote under the same window is
     its session's; another window's is not; and from a hook that did not say its window, one written since it started. */
  const stale = { CLAUDE_CODE_SESSION_ID: 'claude-run-old' };
  const cleared: SessionFile = { ...held, spoken: 'S298', client_id: 'claude-run-new', at: new Date(now - 60_000).toISOString(), pid: '4242' };
  assert.equal(heldFor(cleared, held.host, stale, now, { parent: 4242, since: now - 3_600_000 }), cleared);
  assert.equal(heldFor(cleared, held.host, stale, now, { parent: 5151, since: now - 3_600_000 }), undefined);
  assert.equal(heldFor(cleared, held.host, stale, now), undefined, 'a command, which is started for the session it is in, is not a server');
  const { pid: _, ...unsaid } = cleared;
  assert.equal(heldFor(unsaid, held.host, stale, now, { parent: 5151, since: now - 3_600_000 }), unsaid);
  assert.equal(heldFor(unsaid, held.host, stale, now, { parent: 5151, since: now }), undefined);
});

test('A COMMAND SENDS ITS OWN HOST SESSION AND AGENT: never another session’s file, and no file twelve hours quiet', async (t) => {
  const host = await stubHost(t);
  /* The real folder, which is what the command keys the file by: on macOS the temporary folder is a link. */
  const cwd = realpathSync(folder('kiln'));
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const headersOf = (s: Seen) => [s.headers['x-braindog-session'], s.headers['x-braindog-client'], s.headers['x-braindog-agent']];

  /* Inside Claude Code, in a folder another session started in: its own session's id, as Claude, and the old run unsent. */
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S297', client_id: 'claude-run-old', head_at_start: null, at: new Date().toISOString() });
  const inside = await run(['context'], { ...env, CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'claude-run-mine' }, '', cwd);
  assert.equal(inside.code, 0, inside.stderr);
  assert.deepEqual(host.seen.splice(0).filter((s) => s.method === 'context').map(headersOf), [[undefined, 'claude-run-mine', 'claude']]);

  /* At a shell, no hook heard from the run in thirteen hours: nothing names it. */
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S297', client_id: 'claude-run-old', head_at_start: null, at: new Date(Date.now() - 13 * 3_600_000).toISOString() });
  const shell = await run(['context'], env, '', cwd);
  assert.equal(shell.code, 0, shell.stderr);
  assert.deepEqual(host.seen.splice(0).filter((s) => s.method === 'context').map(headersOf), [[undefined, undefined, undefined]]);
});

test('THE MCP SERVER SENDS WHAT ITS CLIENT SAID IT IS, from the hello on, with the host session’s id', async (t) => {
  const host = await stubHost(t);
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN, CLAUDE_CODE_SESSION_ID: 'claude-run-mine' });
  const rpc = (id: number, method: string, params: Record<string, unknown>) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const hello = rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.287' } });
  /* Two tools, because every request after the hello carries the same headers and either reaching the host shows them. */
  const calls = [rpc(2, 'tools/call', { name: 'schema', arguments: { register: 'tasks' } }), rpc(3, 'tools/call', { name: 'list', arguments: { register: 'tasks' } })];

  const out = await run(['mcp', '--agent', 'claude'], env, `${[hello, ...calls].join('\n')}\n`, folder('kiln'));
  assert.equal(out.code, 0, out.stderr);
  assert.ok(host.seen.length > 0, `the server never asked the host: ${out.stderr}`);
  for (const asked of host.seen)
    assert.deepEqual(
      ['x-braindog-client-name', 'x-braindog-client-version', 'x-braindog-client', 'x-braindog-agent'].map((name) => asked.headers[name]),
      ['claude-code', '2.1.287', 'claude-run-mine', 'claude'],
      asked.method,
    );
});

test('THE MCP SERVER FOLLOWS ITS WINDOW ACROSS A CLEAR: the run its own window’s start hook wrote, and never another window’s', async (t) => {
  const host = await stubHost(t);
  /* The folder as the server sees it: on macOS the temporary folder is a link, and the file is keyed by the real one. */
  const cwd = realpathSync(folder('kiln'));
  /* The id Claude Code gave the server when it started it, which a clear does not change. */
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN, CLAUDE_CODE_SESSION_ID: 'claude-run-old' });
  const call = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list', arguments: { register: 'tasks' } } })}\n`;
  /* Every request the call made, as the run and the client it named, once each. */
  const named = () => [...new Set(host.seen.splice(0).map((s) => `${String(s.headers['x-braindog-session'])} ${String(s.headers['x-braindog-client'])}`))];

  /* The clear's start hook, under the window that started this server (its parent, here this test). */
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S8', client_id: 'claude-run-new', head_at_start: null, at: new Date().toISOString(), pid: String(process.pid) });
  assert.equal((await run(['mcp', '--agent', 'claude'], env, call, cwd)).code, 0);
  assert.deepEqual(named(), ['S8 claude-run-new']);

  /* Another window's start hook in the same folder: its run is not this server's, and the server's own id is sent. */
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S9', client_id: 'claude-run-other', head_at_start: null, at: new Date().toISOString(), pid: '1' });
  assert.equal((await run(['mcp', '--agent', 'claude'], env, call, cwd)).code, 0);
  assert.deepEqual(named(), ['undefined claude-run-old']);
});

test('THE START HOOK KEEPS THE WINDOW IT RAN UNDER, when Claude Code says it, and nothing that is not a process id', async (t) => {
  const host = await stubHost(t);
  const cwd = folder('kiln');
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const start = event(cwd, { session_id: 'claude-run-1', source: 'clear' });
  assert.equal((await run(['hook', 'start'], { ...env, CLAUDE_PID: '4242' }, start)).code, 0);
  assert.equal(readSession(sessionPath(env, cwd))?.pid, '4242');
  assert.equal((await run(['hook', 'start'], { ...env, CLAUDE_PID: 'not-a-pid' }, start)).code, 0);
  assert.equal(readSession(sessionPath(env, cwd))?.pid, undefined);
});

/* ── install ───────────────────────────────────────────────────────────── */

test('INSTALL IS A DRY RUN BY DEFAULT, and with --apply keeps a copy, keeps other hooks, and is not repeated', async () => {
  const profile = folder('claude');
  const file = join(profile, 'settings.json');
  const before = `${JSON.stringify({ model: 'opus', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo other' }] }] } }, null, 2)}\n`;
  writeFileSync(file, before);
  const env = envFor(folder('config'), {});
  const start = hookCommand('start', join(APP, 'hooks'));
  const end = hookCommand('end', join(APP, 'hooks'));

  const dry = await run(['install', '--config-dir', profile], env, '');
  assert.equal(dry.code, 0, dry.stderr);
  assert.ok(dry.stdout.startsWith(`braindog install would change ${file}:\n`), dry.stdout);
  assert.ok(dry.stdout.includes(`  + hooks.SessionStart: ${JSON.stringify({ hooks: [{ type: 'command', command: start, timeout: 20 }] })}`));
  assert.ok(dry.stdout.includes(`  + hooks.SessionEnd: ${JSON.stringify({ hooks: [{ type: 'command', command: end, timeout: 15 }] })}`));
  assert.ok(dry.stdout.split('\n').some((l) => l.startsWith('Nothing was changed. To write it, run this in ') && l.includes(` install --apply --config-dir '${profile}'`)), dry.stdout);
  assert.ok(dry.stdout.includes('claude mcp add --scope user braindog'));
  assert.equal(readFileSync(file, 'utf8'), before, 'the dry run changed the settings');
  assert.deepEqual(readdirSync(profile), ['settings.json']);

  const applied = await run(['install', '--apply', '--config-dir', profile], env, '');
  assert.equal(applied.code, 0, applied.stderr);
  assert.ok(applied.stdout.includes(`The file as it was is kept at ${file}.bak.`));
  assert.equal(readFileSync(`${file}.bak`, 'utf8'), before);
  const now = JSON.parse(readFileSync(file, 'utf8')) as { model: string; hooks: Record<string, { hooks: { command: string }[] }[]> };
  assert.equal(now.model, 'opus');
  assert.deepEqual(now.hooks.SessionStart!.map((g) => g.hooks[0]!.command), ['echo other', start]);
  assert.deepEqual(now.hooks.SessionEnd!.map((g) => g.hooks[0]!.command), [end]);

  const again = await run(['install', '--apply', '--config-dir', profile], env, '');
  assert.ok(again.stdout.startsWith(`${file} already runs both BrainDog hooks. Nothing to change.`));
  assert.deepEqual(readdirSync(profile).sort(), ['settings.json', 'settings.json.bak', 'skills']);

  /* A settings file that is not JSON is left alone, and its text is not quoted. */
  const broken = folder('claude');
  writeFileSync(join(broken, 'settings.json'), '{ "env": { "SECRET": "hunter2" ');
  const refused = await run(['install', '--apply', '--config-dir', broken], env, '');
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /is not valid JSON, so braindog install leaves it alone/);
  assert.ok(!refused.stderr.includes('hunter2'));
});

test('INSTALL INTO A SETTINGS FILE THE PERSON NAMES: a project settings.local.json, its folder made on --apply, and no profile touched', async () => {
  const repo = folder('repo');
  const profile = folder('profile');
  const file = join(repo, '.claude', 'settings.local.json');
  /* The profile a bare install would change, so a write there is seen. */
  const env = { ...envFor(folder('config'), {}), CLAUDE_CONFIG_DIR: profile };
  const start = hookCommand('start', join(APP, 'hooks'));

  const dry = await run(['install', '--settings', file], env, '');
  assert.equal(dry.code, 0, dry.stderr);
  assert.ok(dry.stdout.startsWith(`braindog install would change ${file}, a new file:
`), dry.stdout);
  assert.ok(!existsSync(join(repo, '.claude')), 'the dry run made the folder');

  const applied = await run(['install', '--apply', '--settings', file], env, '');
  assert.equal(applied.code, 0, applied.stderr);
  assert.ok(applied.stdout.includes('There was no file before, so there is nothing to keep a copy of.'), applied.stdout);
  const now = JSON.parse(readFileSync(file, 'utf8')) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
  assert.deepEqual(now.hooks.SessionStart!.map((g) => g.hooks[0]!.command), [start]);
  assert.deepEqual(readdirSync(profile), [], 'naming a file changed the user profile too');

  /* Both named: the profile folder and the file, each once. */
  const both = await run(['install', '--config-dir', profile, '--settings', file], env, '');
  assert.ok(both.stdout.includes(`braindog install would change ${join(profile, 'settings.json')}, a new file:`), both.stdout);
  assert.ok(both.stdout.includes(`${file} already runs both BrainDog hooks. Nothing to change.`), both.stdout);

  const wrong = await run(['install', '--apply', '--settings', join(repo, 'settings.yaml')], env, '');
  assert.equal(wrong.code, 1);
  assert.match(wrong.stderr, /is not a \.json settings file, so braindog install leaves it alone/);
  assert.ok(!existsSync(join(repo, 'settings.yaml')));
});

/* ── install --replace, the cut-over ───────────────────────────────────── */

/*
 * TALLYBOOK'S ENTRIES, AS AN OLD TOOL LEAVES THEM: two PowerShell hooks under `C:\Tools\tallybook\hooks\` in
 * `settings.json`, and a stdio server running `C:\Tools\tallybook\mcp\tallybook-mcp.mjs` in each profile's
 * `.claude.json`. Every value is made up.
 */
const HB_START = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Tools\\tallybook\\hooks\\session-start.ps1"';
const HB_END = 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\\Tools\\tallybook\\hooks\\session-end.ps1';
/*
 * Near misses that must survive: BrainDog's own first shim, and a folder whose name only ends with brain. A
 * lookalike that only BEGAN with brain was tried first and stayed green with the separator before `brain` taken
 * out of the pattern, so it proved nothing about the "named exactly" half.
 */
const OLD_SHIM = 'powershell -NoProfile -File C:\\Repos\\braindog\\apps\\cli\\hooks\\session-start.ps1';
const LOOKALIKE = 'node C:\\Tools\\nottallybook\\hooks\\session-end.ps1';
const HB_SECRET = 'hb-token-never-printed-77e1';

function cutOverProfile(dir: string, claudeJson: string): { settings: string; before: string; mcpBefore: string } {
  mkdirSync(dir, { recursive: true });
  const settings = join(dir, 'settings.json');
  const before = `${JSON.stringify(
    {
      model: 'opus',
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: HB_START, timeout: 15 }] }, { matcher: 'startup', hooks: [{ type: 'command', command: OLD_SHIM }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: HB_END }, { type: 'command', command: LOOKALIKE }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }],
      },
    },
    null,
    2,
  )}\n`;
  writeFileSync(settings, before);
  const mcpBefore = `${JSON.stringify(
    {
      numStartups: 41,
      mcpServers: {
        brain: { type: 'stdio', command: 'node', args: ['C:\\Tools\\tallybook\\mcp\\tallybook-mcp.mjs'], env: { MCP_TOKEN: HB_SECRET } },
        /* No record says Tallybook was ever registered over HTTP; this is here so the URL branch is driven. */
        'brain-http': { type: 'http', url: `https://tallybook.example/mcp?token=${HB_SECRET}`, headers: { Authorization: `Bearer ${HB_SECRET}` } },
        figma: { type: 'http', url: 'https://mcp.figma.com/mcp' },
        brainy: { type: 'stdio', command: 'node', args: ['C:\\Repos\\brainy\\server.mjs'] },
      },
      projects: { 'C:/Repos/acme': { allowedTools: [], mcpServers: { brain: { command: 'node', args: ['C:/Tools/tallybook/mcp/tallybook-mcp.mjs'] } } } },
    },
    null,
    2,
  )}\n`;
  writeFileSync(claudeJson, mcpBefore);
  return { settings, before, mcpBefore };
}

test('INSTALL --REPLACE IS A DRY RUN THAT NAMES EVERY TALLYBOOK HOOK AND MCP ENTRY, per profile, and changes nothing', () => {
  const home = folder('home');
  const main = cutOverProfile(join(home, '.claude'), join(home, '.claude.json'));
  const client = cutOverProfile(join(home, '.claude-client'), join(home, '.claude-client', '.claude.json'));
  const scripts = join(APP, 'hooks');
  const options = { apply: false, replace: REPLACE, scripts, home };

  const lines = [...installInto(join(home, '.claude'), options), ...installInto(join(home, '.claude-client'), options)];
  const text = lines.join('\n');
  for (const file of [main.settings, client.settings]) {
    assert.ok(text.includes(`braindog install would change ${file}:`), text);
  }
  /* The default profile keeps its servers in the home folder, a named one inside itself: Claude Code's layout. */
  for (const file of [join(home, '.claude.json'), join(home, '.claude-client', '.claude.json')]) {
    assert.ok(text.includes(`braindog install --replace would change ${file}:`), text);
  }
  /* A hook is named by its program and a count, as a server is (install-hook-tokens.test.ts), so the script path is not on the line. */
  assert.equal(lines.filter((l) => l === "  - hooks.SessionStart, Tallybook's: powershell [5 arguments hidden]").length, 2, text);
  assert.equal(lines.filter((l) => l === "  - hooks.SessionEnd, Tallybook's: powershell [5 arguments hidden]").length, 2, text);
  assert.equal(lines.filter((l) => l === "  - mcpServers.brain, Tallybook's: node [1 argument hidden]").length, 2, text);
  assert.equal(lines.filter((l) => l === "  - mcpServers.brain-http, Tallybook's: https://tallybook.example/mcp").length, 2, text);
  assert.equal(lines.filter((l) => l === "  - projects[\"C:/Repos/acme\"].mcpServers.brain, Tallybook's: node [1 argument hidden]").length, 2, text);
  assert.ok(!text.includes(OLD_SHIM) && !text.includes(LOOKALIKE) && !text.includes('brainy') && !text.includes('figma'), text);
  assert.ok(!text.includes(HB_SECRET), 'the dry run printed the env of a server it would remove');
  assert.equal(lines.filter((l) => l.startsWith('Nothing was changed. To write it, run this in ') && l.includes(' install --replace ') && l.includes(REPLACE_FILE) && l.includes(' --apply --config-dir ')).length, 2, text);

  assert.equal(readFileSync(main.settings, 'utf8'), main.before);
  assert.equal(readFileSync(join(home, '.claude.json'), 'utf8'), main.mcpBefore);
  assert.deepEqual(readdirSync(home).sort(), ['.claude', '.claude-client', '.claude.json']);
  assert.deepEqual(readdirSync(join(home, '.claude-client')).sort(), ['.claude.json', 'settings.json']);
});

/*
 * WINDOWS PATHS ARE NOT CASE SENSITIVE, AND THE DEFAULT PROFILE NAMED IN ANOTHER CASE WAS MISSED. Measured before
 * the fix: `--config-dir C:\USERS\...\.claude` looked for `.claude.json` inside the folder, found none, and printed
 * "registers no Tallybook MCP server. Nothing to change." while the real one in the home folder kept its server.
 */
test('the default profile is known in any letter case on Windows, so its .claude.json is not silently skipped', { skip: process.platform !== 'win32' }, () => {
  const home = 'C:\\Users\\Someone';
  assert.equal(serversFileOf('c:\\users\\someone\\.CLAUDE', home), join(home, '.claude.json'));
  assert.equal(serversFileOf('C:\\Users\\Someone\\.claude-client', home), join('C:\\Users\\Someone\\.claude-client', '.claude.json'));
});

test('INSTALL --REPLACE --APPLY copies each file beside itself, removes only Tallybook’s entries, adds BrainDog’s hooks, and is not repeated', () => {
  const home = folder('home');
  const dir = join(home, '.claude-client');
  const claudeJson = join(dir, '.claude.json');
  const { settings, before, mcpBefore } = cutOverProfile(dir, claudeJson);
  const scripts = join(APP, 'hooks');
  const start = hookCommand('start', scripts);
  const end = hookCommand('end', scripts);

  const lines = installInto(dir, { apply: true, replace: REPLACE, scripts, home });
  const text = lines.join('\n');
  assert.ok(text.includes(`The file as it was is kept at ${settings}.bak.`), text);
  assert.ok(text.includes(`The file as it was is kept at ${claudeJson}.bak.`), text);
  assert.equal(readFileSync(`${settings}.bak`, 'utf8'), before);
  assert.equal(readFileSync(`${claudeJson}.bak`, 'utf8'), mcpBefore);

  type Group = { matcher?: string; hooks: { command: string }[] };
  const now = JSON.parse(readFileSync(settings, 'utf8')) as { model: string; hooks: Record<string, Group[]> };
  assert.equal(now.model, 'opus');
  /* The group Tallybook's hook sat alone in is gone; a group it shared keeps the other hook. */
  assert.deepEqual(now.hooks.SessionStart!.map((g) => g.hooks.map((h) => h.command)), [[OLD_SHIM], [start]]);
  assert.equal(now.hooks.SessionStart![0]!.matcher, 'startup');
  assert.deepEqual(now.hooks.SessionEnd!.map((g) => g.hooks.map((h) => h.command)), [[LOOKALIKE], [end]]);
  assert.deepEqual(now.hooks.Stop!.map((g) => g.hooks.map((h) => h.command)), [['echo stop']]);

  const mcp = JSON.parse(readFileSync(claudeJson, 'utf8')) as { numStartups: number; mcpServers: Record<string, unknown>; projects: Record<string, { allowedTools: unknown[]; mcpServers: Record<string, unknown> }> };
  assert.equal(mcp.numStartups, 41);
  /* BrainDog's server in where Tallybook's came out, once at user scope for the three removed (install-adds-server.test.ts). */
  assert.deepEqual(Object.keys(mcp.mcpServers), ['figma', 'brainy', 'braindog']);
  assert.deepEqual(mcp.projects['C:/Repos/acme'], { allowedTools: [], mcpServers: {} });

  /* `checkout` a folder in no git tree, so the moving-checkout line, which follows the real tree's state, is not owed. */
  const again = installInto(dir, { apply: true, replace: REPLACE, scripts, home, checkout: home });
  assert.deepEqual(again, [
    `${settings} already runs both BrainDog hooks and no Tallybook hook. Nothing to change.`,
    `${claudeJson} registers no Tallybook MCP server. Nothing to change.`,
  ]);
  assert.deepEqual(readdirSync(dir).sort(), ['.claude.json', '.claude.json.bak', 'settings.json', 'settings.json.bak', 'skills']);

  /* Without --replace, install leaves Tallybook's entries where they are, as it always has. */
  const plain = folder('home');
  const kept = cutOverProfile(join(plain, '.claude'), join(plain, '.claude.json'));
  installInto(join(plain, '.claude'), { apply: true, scripts, home: plain });
  assert.ok(readFileSync(kept.settings, 'utf8').includes('session-start.ps1'));
  assert.equal(readFileSync(join(plain, '.claude.json'), 'utf8'), kept.mcpBefore);
  assert.ok(!existsSync(join(plain, '.claude.json.bak')));
});

/* ── install --replace --mcp-json, the one file the cut-over used to leave ── */

/*
 * AN OLD TOOL'S SERVER CAN SIT IN A `.mcp.json` IN NO REPOSITORY, such as `C:\Repos\.mcp.json`, and install never
 * opened a `.mcp.json`, so the cut-over was one sitting plus a hand edit. MEASURED BEFORE `--mcp-json` EXISTED: the
 * flag was refused by the option parse with exit 1, and the same run without it left the file byte for byte as it was
 * and never named it.
 * Every file here is a scratch copy; no real profile or `.mcp.json` is read.
 */
function mcpJsonFile(dir: string): { file: string; before: string } {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, '.mcp.json');
  const before = `${JSON.stringify(
    {
      mcpServers: {
        brain: { command: 'node', args: ['C:\\Tools\\tallybook\\mcp\\tallybook-mcp.mjs'], env: { MCP_TOKEN: HB_SECRET } },
        proxied: { command: 'npx', args: ['-y', 'mcp-remote', 'https://tallybook.example/mcp'] },
        figma: { type: 'http', url: 'https://mcp.figma.com/mcp' },
        brainy: { command: 'node', args: ['C:\\Repos\\brainy\\server.mjs'] },
      },
      note: 'kept as it was',
    },
    null,
    2,
  )}\n`;
  writeFileSync(file, before);
  return { file, before };
}

test('INSTALL --REPLACE --MCP-JSON names the Tallybook servers in a .mcp.json outside any repository, is a dry run first, and with --apply copies it and removes only those', async () => {
  const outside = folder('repos');
  const { file, before } = mcpJsonFile(outside);
  const profile = folder('profile');
  const env = envFor(folder('config'), {});

  const dry = await run(['install', '--replace', REPLACE_FILE, '--config-dir', profile, '--mcp-json', file], env, '');
  assert.equal(dry.code, 0, dry.stderr);
  assert.ok(dry.stdout.includes(`braindog install --replace would change ${file}:`), dry.stdout);
  assert.ok(dry.stdout.includes("  - mcpServers.brain, Tallybook's: node [1 argument hidden]"), dry.stdout);
  assert.ok(dry.stdout.includes("  - mcpServers.proxied, Tallybook's: npx [3 arguments hidden]"), dry.stdout);
  /*
   * BRAINDOG'S SERVER GOES INTO THE PROFILE, NOT THE .mcp.json. This once read the whole stdout for the `+` line,
   * and it passed only because the profile gained the entry too, so it could not tell which file did. The `.mcp.json`'s own plan is now read on its
   * own, from its heading to the sentence that ends it.
   */
  const lines = dry.stdout.split('\n');
  const at = lines.indexOf(`braindog install --replace would change ${file}:`);
  assert.ok(at >= 0, dry.stdout);
  const plan = lines.slice(at, lines.findIndex((l, i) => i > at && l.startsWith('Nothing was changed.')));
  assert.ok(!plan.some((l) => l.includes('mcpServers.braindog')), plan.join('\n'));
  assert.ok(dry.stdout.includes('  + mcpServers.braindog: {"type":"stdio","command":"node"'), dry.stdout);
  assert.ok(!dry.stdout.includes('figma') && !dry.stdout.includes('brainy') && !dry.stdout.includes(HB_SECRET), dry.stdout);
  /*
   * Named, it is no longer a file to edit by hand, so the sentence saying so is not printed. CHECKED AGAINST THE
   * SENTENCE ITSELF: this first looked for "removed by hand", words the sentence no longer holds, and it stayed green
   * with main.ts printing the sentence on every --replace.
   */
  assert.ok(!dry.stdout.includes(replaceByHand(REPLACE)), dry.stdout);
  const unnamed = await run(['install', '--replace', REPLACE_FILE, '--config-dir', profile], env, '');
  assert.ok(unnamed.stdout.includes(replaceByHand(REPLACE)), unnamed.stdout);
  assert.equal(readFileSync(file, 'utf8'), before, 'the dry run changed the .mcp.json');
  assert.deepEqual(readdirSync(outside), ['.mcp.json']);

  const applied = await run(['install', '--replace', REPLACE_FILE, '--apply', '--config-dir', profile, '--mcp-json', file], env, '');
  assert.equal(applied.code, 0, applied.stderr);
  assert.ok(applied.stdout.includes(`The file as it was is kept at ${file}.bak.`), applied.stdout);
  assert.equal(readFileSync(`${file}.bak`, 'utf8'), before);
  const now = JSON.parse(readFileSync(file, 'utf8')) as { mcpServers: Record<string, unknown>; note: string };
  /* No `braindog` here: a new name in this file is only a prompt to approve, and the profile holds the entry instead. */
  assert.deepEqual(Object.keys(now.mcpServers), ['figma', 'brainy']);
  assert.equal(now.note, 'kept as it was');
  /* The same run wrote the profile's hooks: one change, not two. */
  assert.ok(existsSync(join(profile, 'settings.json')));

  const again = await run(['install', '--replace', REPLACE_FILE, '--apply', '--config-dir', profile, '--mcp-json', file], env, '');
  assert.ok(again.stdout.includes(`${file} registers no Tallybook MCP server. Nothing to change.`), again.stdout);
  assert.deepEqual(readdirSync(outside).sort(), ['.mcp.json', '.mcp.json.bak']);
});

test('INSTALL --MCP-JSON IS REFUSED inside a git working tree, without --replace, and for a missing file, and each refusal changes no other file', async () => {
  const profile = folder('profile');
  const env = envFor(folder('config'), {});
  const repo = repository();
  const nested = join(repo.dir, 'tools');
  const shared = mcpJsonFile(nested);

  const refused = await run(['install', '--replace', REPLACE_FILE, '--apply', '--config-dir', profile, '--mcp-json', shared.file], env, '');
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /is inside the git working tree at .+, so braindog install leaves it alone/);
  assert.equal(readFileSync(shared.file, 'utf8'), shared.before);
  /* All or none: the profile's settings, which the same run would have written, were not. */
  assert.deepEqual(readdirSync(profile), []);

  const outside = mcpJsonFile(folder('repos'));
  const plain = await run(['install', '--apply', '--config-dir', profile, '--mcp-json', outside.file], env, '');
  assert.equal(plain.code, 1);
  assert.match(plain.stderr, /--mcp-json is read only with --replace/);
  assert.equal(readFileSync(outside.file, 'utf8'), outside.before);
  assert.deepEqual(readdirSync(profile), []);

  const missing = await run(['install', '--replace', REPLACE_FILE, '--config-dir', profile, '--mcp-json', join(folder('repos'), '.mcp.json')], env, '');
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /There is no .+\.mcp\.json/);
});

/*
 * WHAT A SERVER IS, AND WHAT IS SHOWN OF IT. Measured before the fix:
 * `--url=https://tallybook.example/mcp` as one word was not known as Tallybook's, so the entry was kept and not named,
 * and `-t shortpw` printed `shortpw`, which is too short to look like a token and follows a flag too short to say
 * it takes one.
 */
test('a Tallybook URL joined to its flag with = is known, and a short secret after a one-letter flag is not printed', () => {
  const home = folder('home');
  const dir = join(home, '.claude-joined');
  mkdirSync(dir, { recursive: true });
  const claudeJson = join(dir, '.claude.json');
  writeFileSync(
    claudeJson,
    JSON.stringify({
      mcpServers: {
        joined: { command: 'npx', args: ['-y', 'mcp-remote', '--url=https://tallybook.example/mcp'] },
        'joined-query': { command: 'npx', args: ['-y', 'mcp-remote', '--url=https://tallybook.example/mcp?t=qpw12'] },
        'short-flag': { command: 'node', args: ['C:\\Tools\\tallybook\\mcp\\tallybook-mcp.mjs', '-t', 'shortpw', '-v', '--quiet'] },
        near: { command: 'npx', args: ['-y', 'mcp-remote', '--url=https://nottallybook.example.example.com/mcp'] },
      },
    }),
  );
  const text = installInto(dir, { apply: false, replace: REPLACE, scripts: join(APP, 'hooks'), home }).join('\n');
  assert.ok(text.includes("  - mcpServers.joined, Tallybook's: npx [3 arguments hidden]"), text);
  assert.ok(text.includes("  - mcpServers.joined-query, Tallybook's: npx [3 arguments hidden]"), text);
  assert.ok(text.includes("  - mcpServers.short-flag, Tallybook's: node [5 arguments hidden]"), text);
  assert.ok(!text.includes('shortpw') && !text.includes('qpw12'), text);
  assert.ok(!text.includes('mcpServers.near'), text);
});

test('NO CHILD EVER PRINTED THE TOKEN', () => {
  assert.ok(printed.length > 0);
  for (const text of printed) assert.ok(!text.includes('stub-bearer') && !text.includes(TOKEN), 'a child printed the token');
});
