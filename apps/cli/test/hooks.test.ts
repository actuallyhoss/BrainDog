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

import { writeDoorCache } from '../src/bridge-cache.ts';
import { eventOf, HOOK_MS, heldFor, hookBudget, hookStart, notSignedIn, readSession, REMEMBER_MS, sessionPath, staleLine, windowPath, writeSession, type SessionFile } from '../src/hooks.ts';
import { keyPrint } from '../src/http.ts';
import { replaceByHand, hookCommand, installInto, serversFileOf } from '../src/install.ts';
import { mintRefusedPath } from '../src/mint-refused.ts';
import { sessionHeaders } from '../src/position.ts';
import { REPLACE, REPLACE_FILE } from './replace.ts';
import { OWNER } from '../../../fixtures/names.ts';

/* The owner as `boot` names them: the first word of the invented owner's name. */
const FIRST = OWNER.name.split(' ')[0]!;

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

type Seen = { method: string; body: Record<string, unknown>; headers: IncomingHttpHeaders; query: string };

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
 * `attach` answers S7, resumed when the event says so; `handoff` answers the row; `end` answers the run done, or
 * with `endSays` refuses with that code, as a host from before `end` does with no such method; `meet` adds a person, or
 * refuses as a record without People does when `people` is false. With `hang`, nothing ever answers. With `card`,
 * the context carries the record's own card, as a host that draws one does. `context` answers the same context,
 * `boot` says the sign-in speaks for the owner (`FIRST`), and `list` answers no rows, for the commands and the MCP server.
 * `createToken` refuses the bearer as a record refuses a token (`NEEDS_BROWSER_SESSION`, 403), or with `mint`'s code.
 */
async function stubHost(
  t: { after: (fn: () => Promise<void>) => void },
  hang = false,
  people = true,
  card?: string,
  o: {
    self?: Record<string, unknown>;
    legacy?: boolean;
    projects?: { repos?: string[]; folders?: string[] }[];
    joined?: string | null;
    endSays?: string;
    head?: string;
    mint?: string;
  } = {},
) {
  /* WITH `head`, the handoff names that commit and the record's card says the commits since it, as `x-braindog-ahead`
     told it, on the Next line and in `card_next`, as a record does (`packages/record/src/card.ts`). */
  const since = (ahead: unknown) => (typeof ahead === 'string' ? ` · ${ahead} commits since` : '');
  const carded = (ahead: unknown) =>
    card === undefined
      ? CONTEXT
      : {
          ...CONTEXT,
          ...(o.head === undefined ? {} : { handoff: { ...CONTEXT.handoff, head: o.head }, card_next: `Next     Kern the lowercase pairs.${since(ahead)}` }),
          card: card.replace(/^(Next .*)$/mu, `$1${since(ahead)}`),
        };
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      seen.push({ method, body, headers: req.headers, query: decodeURIComponent(url.search) });
      if (hang) return;
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      const row = { id: 'e_7', seq: 7, state: 'active', version: 2, fields: {} };
      if (method === 'attach')
        return answer({ ok: true, value: { session: row, spoken: 'S7', resumed: body.source !== 'startup', project: 'things#1', context: carded(req.headers['x-braindog-ahead']) } });
      if (method === 'handoff') return answer({ ok: true, value: { ...row, state: body.state } });
      if (method === 'end' && o.endSays !== undefined) {
        res.writeHead(o.endSays === 'ROUTE_UNKNOWN' ? 404 : o.endSays === 'NOT_IN_THIS_BUILD' ? 501 : 403, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, refusal: { code: o.endSays, fix: 'This host does not end runs.' } }));
      }
      if (method === 'end') return answer({ ok: true, value: { run: 'S7', state: 'done', changed: true } });
      if (method === 'context') return answer({ ok: true, value: carded(req.headers['x-braindog-ahead']) });
      if (method === 'heard') return answer({ ok: true, value: { marked: true } });
      /* A TOKEN CANNOT MAKE TOKENS (`admin` in the record), which is what a plain token in BRAINDOG_TOKEN is told (D4). */
      if (method === 'createToken') {
        const code = o.mint ?? 'NEEDS_BROWSER_SESSION';
        res.writeHead(code === 'RATE_LIMITED' ? 429 : 403, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, refusal: { code, fix: 'Open this from the app; a token cannot change what this BrainDog is.', at: 'principal' } }));
      }
      /* With `projects`, a Projects list declaring `scopes:` and a People list declaring `meets:` with its self part. */
      const registers = o.projects === undefined ? [] : [{ id: 'things', name: 'Projects', count: o.projects.length }, { id: 'people', name: 'People', count: 1 }];
      if (method === 'boot') return answer({ ok: true, value: { registers, now: '2026-10-02T09:00:00Z', me: { kind: 'token', person: 'p_owner', name: FIRST, level: 'owner' } } });
      const register = String(body.register ?? new URLSearchParams(url.search).get('register'));
      const declOf = (id: string) =>
        id === 'things'
          ? { id: 'things', title: 'name', fields: [], scopes: { repos: 'repos', folders: 'folders' } }
          : { id: 'people', title: 'name', fields: [], meets: { name: 'name', email: 'email', keys: 'keys', handles: 'handles', self: 'self', aliases: 'aliases' } };
      if (method === 'schema') return answer({ ok: true, value: declOf(register) });
      /* Every list's declaration in one read, as the record answers `schemas` with `every`. */
      if (method === 'schemas') return answer({ ok: true, value: { lists: Object.fromEntries(registers.map((r) => [r.id, declOf(r.id)])), blocks: {} } });
      /* A project's history: made long ago with what it lists now, or at `joined`; with `joined: null`, not readable. */
      if (method === 'history' && register === 'things') {
        const seq = Number(body.seq ?? new URLSearchParams(url.search).get('seq'));
        const p = o.projects?.[seq - 1];
        if (o.joined === null || p === undefined) return answer({ ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'No history here.', at: 'register' } });
        return answer({ ok: true, value: [{ ts: o.joined ?? '2000-01-01T00:00:00Z', actor: 'p_owner', kind: 'create', field: null, to: { name: `Project ${String(seq)}`, ...p } }] });
      }
      if (method === 'list' && register === 'things')
        return answer({ ok: true, value: { rows: (o.projects ?? []).map((p, i) => ({ id: `e_p${String(i)}`, seq: i + 1, version: 1, fields: { name: `Project ${String(i + 1)}`, ...p } })), matched: 0, cursor: null } });
      if (method === 'list')
        return answer({ ok: true, value: { rows: o.self === undefined ? [] : [{ id: 'p_self', seq: 1, version: 3, fields: { self: true, ...o.self } }], matched: 0, cursor: null } });
      /* A record from before the contract takes four arguments and refuses the first it does not know by name. */
      const extra = Object.keys(body).find((k) => !['name', 'email', 'handle', 'where'].includes(k));
      if (method === 'meet' && o.legacy === true && extra !== undefined)
        return answer({ ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: `${extra} is not something this call takes.`, at: extra } });
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
 * THE HOME FOLDER IS THE CONFIG FOLDER'S OWN, so a child never reads or writes the real `~/.braindog` (the skills yes,
 * the day's start, the update check), and two runs with one config folder share one home, as one machine does.
 */
function envFor(config: string, extra: Record<string, string>): NodeJS.ProcessEnv {
  const home = join(config, 'home');
  mkdirSync(home, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: config, HOME: home, USERPROFILE: home };
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
  assert.deepEqual(lines, ['Connected to BrainDog. Call context.']);
  /* The machine as a person names it, never its network name. */
  assert.equal(lines[0]!.includes(hostname()), false, lines[0]);

  /* THE ATTACH ALONE: the card the record draws says whose the questions are, so the start asks nothing beside it. */
  assert.deepEqual(host.seen.map((s) => s.method), ['attach']);
  const [attach] = host.seen;
  assert.deepEqual(attach!.body, { source: 'startup', client_id: 'claude-run-1' });
  assert.equal(attach!.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(attach!.headers['x-braindog-agent'], 'claude');
  assert.equal(attach!.headers['x-braindog-cwd'], cwd);
  /* Attaching finds the run by its client id, so an old run named in a file is never sent, and the session's own id is. */
  assert.equal(attach!.headers['x-braindog-session'], undefined);
  assert.equal(attach!.headers['x-braindog-client'], 'claude-run-1');

  /* THE SESSION'S OWN FILE, and the folder's for a shell there, each saying the same run and where it started. */
  const file = sessionPath(env, cwd, 'claude-run-1');
  assert.ok(file.startsWith(join(config, 'braindog', 'sessions')), file);
  assert.notEqual(file, sessionPath(env, cwd));
  for (const kept of [file, sessionPath(env, cwd)]) {
    const held = readSession(kept);
    assert.deepEqual({ ...held, at: undefined, hook_ms: undefined }, { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: undefined, cwd, hook_ms: undefined });
    /* How long this hook took, kept for the next hook of the session to send (`owedMark`). */
    assert.ok(Number.isInteger(held?.hook_ms) && held!.hook_ms! > 0 && held!.hook_ms! < 30_000, String(held?.hook_ms));
    assert.ok(!readFileSync(kept, 'utf8').includes('stub-bearer'), 'the session file holds the token');
  }
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
  assert.equal(out.stdout, '', 'a host with no card has no Next line to give');
  assert.equal(readSession(sessionPath(env, cwd))?.head_at_start, 'abc1234');
});

test('A RESUME WITHIN THE HOUR OF THE SAME SESSION PRINTS NOTHING and still re-attaches; later, by another session, or after a clear, it gets the card', async (t) => {
  const host = await stubHost(t);
  const cwd = folder('kiln');
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const file = sessionPath(env, cwd, 'claude-run-1');
  const minutes = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  const resume = event(cwd, { session_id: 'claude-run-1', source: 'resume' });

  /* Ended twenty minutes ago, as the end hook writes it: the card is still in the conversation. */
  writeSession(file, { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: minutes(300), seen: minutes(20) });
  const quiet = await run(['hook', 'start'], env, resume);
  assert.deepEqual([quiet.code, quiet.stdout, quiet.stderr], [0, '', '']);
  assert.deepEqual(host.seen.map((s) => [s.method, s.body.source]), [['attach', 'resume']], 'a quiet resume still brings the run back');

  /* Two hours away: the whole card. */
  writeSession(file, { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: minutes(300), seen: minutes(120) });
  assert.match((await run(['hook', 'start'], env, resume)).stdout, /^Connected to BrainDog\. Call context\.\n/u);

  /* With no file of its own, the folder's, which another session wrote a minute ago, is not this session's card. */
  rmSync(file);
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S7', client_id: 'claude-run-2', head_at_start: null, at: minutes(1) });
  assert.match((await run(['hook', 'start'], env, resume)).stdout, /^Connected to BrainDog\. /u);

  /* Not signed in, within the hour: still nothing, because the session already said so when it started. */
  const signedOut = envFor(folder('config'), {});
  writeSession(sessionPath(signedOut, cwd), { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: minutes(5) });
  assert.equal((await run(['hook', 'start'], signedOut, resume)).stdout, '');

  /* A clear empties the conversation, so it is the whole card however recent. */
  assert.match((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-1', source: 'clear' }))).stdout, /^Connected to BrainDog\. Call context\.\n/u);
});

test('THE RECORD’S OWN CARD IS PRINTED AS IT CAME, and a compaction prints only its Next line', async (t) => {
  const card = 'BrainDog · run S7 · project Kiln · Claude Code on MacBook\nNext     Kern the lowercase pairs. (S6, Claude Code, 10m ago)\nMore     call context';
  const host = await stubHost(t, false, true, card);
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const cwd = folder('kiln');
  assert.equal((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-9', source: 'startup' }))).stdout, `${card}\n`);
  assert.equal((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-9', source: 'compact' }))).stdout, 'Next     Kern the lowercase pairs. (S6, Claude Code, 10m ago)\n');
});

test('THE COMMITS SINCE THE HANDOFF GO TO THE RECORD after the attach, as x-braindog-ahead, and its card and card_next say them', async (t) => {
  const repo = repository(folder('kiln-ahead'));
  const from = repo.commit();
  repo.commit();
  repo.commit();
  const card = 'BrainDog · run S7 · project Kiln · Claude Code on MacBook\nNext     Kern the lowercase pairs.\nMore     call context';
  const host = await stubHost(t, false, true, card, { head: from });
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });

  const start = await run(['hook', 'start'], env, event(repo.dir, { session_id: 'claude-run-11', source: 'startup' }), repo.dir);
  assert.equal(start.code, 0, start.stderr);
  assert.match(start.stdout, /^Next {5}Kern the lowercase pairs\. · 2 commits since$/mu);
  /* The attach cannot say it, because the handoff's commit is in its answer; one read after it does, as the same run. */
  assert.equal(host.seen.find((s) => s.method === 'attach')?.headers['x-braindog-ahead'], undefined);
  const reads = host.seen.filter((s) => s.method === 'context');
  assert.deepEqual(
    reads.map((s) => [s.headers['x-braindog-ahead'], s.headers['x-braindog-session']]),
    [['2', 'S7']],
  );

  /* A compaction prints the record's card_next, which says them too. */
  const compact = await run(['hook', 'start'], env, event(repo.dir, { session_id: 'claude-run-11', source: 'compact' }), repo.dir);
  assert.equal(compact.stdout, 'Next     Kern the lowercase pairs. · 2 commits since\n');

  /* THE NEXT START HERE COUNTS FROM THE STEP THIS ONE WAS HANDED, before its attach, and sends the count with it: the
     same card, word for word, from one round trip. */
  const before = host.seen.length;
  const next = await run(['hook', 'start'], env, event(repo.dir, { session_id: 'claude-run-13', source: 'startup' }), repo.dir);
  assert.equal(next.stdout, start.stdout);
  assert.deepEqual(
    host.seen.slice(before).map((s) => [s.method, s.headers['x-braindog-ahead']]),
    [['attach', '2']],
  );

  /* HEAD where the handoff left it: nothing moved, so nothing more is asked. */
  const still = repository(folder('kiln-still'));
  const here = await stubHost(t, false, true, card, { head: still.commit() });
  const quiet = await run(['hook', 'start'], { ...env, BRAINDOG_HOST: here.base }, event(still.dir, { session_id: 'claude-run-12', source: 'startup' }), still.dir);
  assert.equal(quiet.stdout, `${card}\n`);
  assert.equal(here.seen.filter((s) => s.method === 'context').length, 0);
});

test('A COUNT SENT FOR ANOTHER STEP IS READ AGAIN for the step the attach handed, so the card says that step’s commits or none', async (t) => {
  const repo = repository(folder('kiln-other'));
  const old = repo.commit();
  const from = repo.commit();
  repo.commit();
  const card = 'BrainDog · run S7 · project Kiln · Claude Code on MacBook\nNext     Kern the lowercase pairs.\nMore     call context';
  const host = await stubHost(t, false, true, card, { head: from });
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  /* The last start here was handed a step two commits further back. */
  writeSession(sessionPath(env, repo.dir), { host: host.base, spoken: 'S5', client_id: 'claude-run-20', head_at_start: old, at: new Date().toISOString(), handoff_head: old });

  const start = await run(['hook', 'start'], env, event(repo.dir, { session_id: 'claude-run-21', source: 'startup' }), repo.dir);
  assert.equal(start.code, 0, start.stderr);
  assert.match(start.stdout, /^Next {5}Kern the lowercase pairs\. · 1 commits since$/mu);
  assert.deepEqual(
    host.seen.map((s) => [s.method, s.headers['x-braindog-ahead']]),
    [
      ['attach', '2'],
      ['context', '1'],
    ],
  );
  /* And remembers the step it was handed, for the start after it. */
  assert.equal(readSession(sessionPath(env, repo.dir))?.handoff_head, from);

  /* HEAD where the handed step was left: the count sent is withdrawn, read again with none. */
  const still = repository(folder('kiln-other-still'));
  const back = still.commit();
  const at = still.commit();
  const here = await stubHost(t, false, true, card, { head: at });
  const hereEnv = { ...env, BRAINDOG_HOST: here.base };
  writeSession(sessionPath(hereEnv, still.dir), { host: here.base, spoken: 'S5', head_at_start: back, at: new Date().toISOString(), handoff_head: back });
  const quiet = await run(['hook', 'start'], hereEnv, event(still.dir, { session_id: 'claude-run-22', source: 'startup' }), still.dir);
  assert.equal(quiet.stdout, `${card}\n`);
  assert.deepEqual(
    here.seen.map((s) => [s.method, s.headers['x-braindog-ahead']]),
    [
      ['attach', '1'],
      ['context', undefined],
    ],
  );
});

test('THE START HOOK’S OWN TIME RIDES THE NEXT CALL of the same session, as a hook mark against its run, and is sent once', async (t) => {
  const host = await stubHost(t);
  const cwd = folder('kiln');
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const own = sessionPath(env, cwd, 'claude-run-1');
  const methods = () => host.seen.map((s) => s.method).sort();

  /* A start times itself and keeps the time; it sends nothing more than it always did. */
  assert.equal((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-1', source: 'startup' }))).code, 0);
  assert.deepEqual(methods(), ['attach']);
  /* Every call says the command's build, the checkout's here. */
  for (const s of host.seen) assert.equal(s.headers['x-braindog-cli'], 'dev+0000000', s.method);
  const first = readSession(own)?.hook_ms;
  assert.ok(first !== undefined && first > 0, 'the start hook kept no time');
  host.seen.splice(0);

  /* The compaction's attach carries it along: one mark beside the call it makes anyway, against the run that hook attached. */
  assert.equal((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-1', source: 'compact' }))).code, 0);
  assert.deepEqual(methods(), ['attach', 'heard']);
  const mark = host.seen.find((s) => s.method === 'heard')!;
  assert.deepEqual(mark.body, { kind: 'hook', ms: first, build: 'dev+0000000' });
  assert.deepEqual([mark.headers['x-braindog-session'], mark.headers['x-braindog-client'], mark.headers['x-braindog-cli']], ['S7', 'claude-run-1', 'dev+0000000']);
  const second = readSession(own)?.hook_ms;
  assert.ok(second !== undefined, 'the compaction kept no time of its own');
  host.seen.splice(0);

  /* A clear is another session: the time the folder's file holds is not its to send. */
  assert.equal((await run(['hook', 'start'], env, event(cwd, { session_id: 'claude-run-2', source: 'clear' }))).code, 0);
  assert.deepEqual(methods(), ['attach']);
  host.seen.splice(0);

  /* The end sends what the session still owes beside its end, and the file stops owing it. */
  const end = JSON.stringify({ session_id: 'claude-run-1', cwd, hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' });
  assert.equal((await run(['hook', 'end'], env, end)).code, 0);
  assert.deepEqual(methods(), ['end', 'heard']);
  assert.deepEqual(host.seen.find((s) => s.method === 'heard')!.body, { kind: 'hook', ms: second, build: 'dev+0000000' });
  assert.equal(readSession(own)?.hook_ms, undefined);
  host.seen.splice(0);

  /* A second end owes nothing, so it sends the end alone. */
  assert.equal((await run(['hook', 'end'], env, end)).code, 0);
  assert.deepEqual(methods(), ['end']);
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

/* ── a command line older than its host ────────────────────────────────── */

test('THE COMMAND LINE OUT OF DATE IS ONE LINE: older than the host’s build or than the oldest it works with, said once', () => {
  const OLD = '2026.10.07+4e712da';
  const host = 'brain.dog';
  const line = 'Your BrainDog command line is out of date (built 7 Oct, brain.dog is on 20 Oct). Run braindog update, then start a new session.';
  assert.equal(staleLine(OLD, undefined, '2026.10.20+f46ccf9', host), line);
  /* The attach's own answer says it is below the oldest the host works with, with no build of the host's known here. */
  const behind = { ...CONTEXT, build: { cli: OLD, behind: true } } as never;
  assert.equal(staleLine(OLD, behind, null, host), 'Your BrainDog command line is out of date (built 7 Oct). Run braindog update, then start a new session.');
  /* The same day, a later day, no build known, or a checkout's build: nothing. */
  assert.equal(staleLine(OLD, undefined, '2026.10.07+aaaaaaa', host), null);
  assert.equal(staleLine('2026.10.21+1a2b3c4', undefined, '2026.10.20+f46ccf9', host), null);
  assert.equal(staleLine(OLD, undefined, null, host), null);
  assert.equal(staleLine('dev+0000000', behind, '2026.10.20+f46ccf9', host), null);
  /* SAID ONCE: the record's card already says to update, or the build address's line above the card does. */
  const carded = { ...CONTEXT, card: 'BrainDog · run S7\nUpdate   This command is older than this BrainDog. Run braindog update, or switch on updates by itself in Settings > Agents.' } as never;
  assert.equal(staleLine(OLD, carded, '2026.10.20+f46ccf9', host), null);
  assert.equal(staleLine(OLD, undefined, '2026.10.20+f46ccf9', host, true), null);
});

test('THE START HOOK SAYS IT ABOVE THE CARD, from the host’s build the bridge last heard, with no request of its own', async (t) => {
  const host = await stubHost(t);
  const config = folder('config');
  const home = folder('home');
  const cwd = folder('kiln');
  const env = { XDG_CONFIG_HOME: config, BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN };
  const said: string[] = [];
  const start = (id: string, build: string) =>
    hookStart({ env, stdin: JSON.stringify({ cwd, session_id: id, source: 'startup' }), cwd, home, device: 'MacBook', build, write: (text) => void said.push(text) });

  writeDoorCache(home, host.base, { build: '2026.10.20+f46ccf9', initialize: {} });
  await start('claude-old', '2026.10.07+4e712da');
  const lines = said[0]!.trimEnd().split('\n');
  assert.equal(lines[0], `Your BrainDog command line is out of date (built 7 Oct, ${new URL(host.base).host} is on 20 Oct). Run braindog update, then start a new session.`);
  assert.equal(lines[1], 'Connected to BrainDog. Call context.');
  assert.deepEqual(host.seen.map((s) => s.method), ['attach'], 'saying it cost a request');

  await start('claude-new', '2026.10.20+f46ccf9');
  assert.equal(said[1]!.trimEnd(), 'Connected to BrainDog. Call context.');
});

/* ── what a real Claude Code sends ─────────────────────────────────────── */

type Fixture = { measured: { version: string }; of?: string; hooks: { event: string; stdin: Record<string, string>; env: Record<string, string> }[] };
const FIXTURES = join(APP, 'test', 'fixtures', 'hook-events');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Fixture;

test('WHAT CLAUDE CODE SENDS, AS MEASURED: a resume keeps its id, a clear and a fork do not, and each start reads as the hook expects', () => {
  const names = readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(names, ['clear', 'compact', 'continue', 'exit', 'fork', 'nested', 'resume', 'resume-picked', 'startup', 'startup-print']);
  const starts: Record<string, string> = {};
  for (const name of names) {
    const f = fixture(name);
    assert.match(f.measured.version, /^2\.\d+\.\d+$/, name);
    for (const h of f.hooks) {
      /* The environment names the same session the event does, in every hook measured. */
      assert.equal(h.env.CLAUDE_CODE_SESSION_ID, h.stdin.session_id, `${name} ${h.event}`);
      if (h.event !== 'SessionStart') continue;
      const read = eventOf(JSON.stringify(h.stdin), '/elsewhere');
      assert.deepEqual(read, { cwd: h.stdin.cwd, source: read.source, client_id: h.stdin.session_id }, name);
      starts[name] = `${h.stdin.source} as ${read.source}`;
    }
  }
  /* A fork is a source the hook does not name, so it starts a run of its own. */
  assert.deepEqual(starts, {
    clear: 'clear as clear',
    continue: 'resume as resume',
    fork: 'fork as startup',
    nested: 'startup as startup',
    resume: 'resume as resume',
    'resume-picked': 'resume as resume',
    startup: 'startup as startup',
    'startup-print': 'startup as startup',
  });
  /* `--resume`, `--continue` and a picked resume come back under the conversation's own id; a fork under a new one. */
  for (const name of ['resume', 'continue', 'resume-picked']) assert.equal(fixture(name).hooks.at(-1)!.stdin.session_id, fixture(name).of, name);
  assert.notEqual(fixture('fork').hooks[0]!.stdin.session_id, fixture('fork').of);
  /* A clear and a picked resume end the open session and start another in the same process. */
  for (const [name, reason] of [['clear', 'clear'], ['resume-picked', 'resume']] as const) {
    const [end, start] = fixture(name).hooks;
    assert.deepEqual([end!.event, end!.stdin.reason, start!.event], ['SessionEnd', reason, 'SessionStart'], name);
    assert.notEqual(end!.stdin.session_id, start!.stdin.session_id, name);
    assert.equal(end!.env.CLAUDE_PID, start!.env.CLAUDE_PID, name);
  }
  /* A claude started from another session's shell names nothing of that session. */
  const nested = fixture('nested') as Fixture & { parent: Record<string, string> };
  assert.notEqual(nested.hooks[0]!.env.CLAUDE_PID, nested.parent.CLAUDE_PID);
  assert.notEqual(nested.hooks[0]!.stdin.session_id, nested.parent.CLAUDE_CODE_SESSION_ID);
  /* Measured on 2.1.295: the child flag is set in every hook, a window a person opened included (see the spec). */
  assert.equal(fixture('startup').hooks[0]!.env.CLAUDE_CODE_CHILD_SESSION, '1');
});

/* ── the end hook ──────────────────────────────────────────────────────── */

test('THE END HOOK ENDS THE RUN THE SESSION FILE NAMES, sending no state, and prints nothing', async (t) => {
  const host = await stubHost(t);
  const config = folder('config');
  const cwd = folder('kiln');
  const env = envFor(config, { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-09-15T00:00:00Z' });

  const before = Date.now();
  const out = await run(['hook', 'end'], env, JSON.stringify({ session_id: 'claude-run-1', cwd, hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' }));
  assert.deepEqual([out.code, out.stdout, out.stderr], [0, '', '']);
  /* `end`, and no state: the record picks done or handoff from what the run left. */
  assert.deepEqual(host.seen.map((s) => [s.method, s.body]), [['end', {}]]);
  assert.equal(host.seen[0]!.headers['x-braindog-session'], 'S7');
  assert.equal(host.seen[0]!.headers['x-braindog-client'], 'claude-run-1');
  /* When it ended, so a resume within the hour knows the card is still in the conversation. The rest is as it was. */
  const ended = readSession(sessionPath(env, cwd));
  assert.ok(Date.parse(ended?.seen ?? '') >= before - 1_000, JSON.stringify(ended));
  assert.deepEqual({ ...ended, seen: undefined, ended: undefined }, { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-09-15T00:00:00Z', seen: undefined, ended: undefined });

  /* Another session in the same folder wrote the file since: its run is not this one's to end. */
  const other = await run(['hook', 'end'], env, JSON.stringify({ session_id: 'claude-run-2', cwd, reason: 'other' }));
  assert.equal(other.code, 0);
  assert.equal(host.seen.length, 1);

  /* No session file, a host that is down, or no token: still silent, still 0. */
  const bare = folder('elsewhere');
  assert.deepEqual(Object.values(await run(['hook', 'end'], env, JSON.stringify({ cwd: bare }))).slice(0, 3), [0, '', '']);
  assert.equal((await run(['hook', 'end'], envFor(folder('config'), {}), '')).stdout, '');
  assert.equal(host.seen.length, 1);
});

test('AN OLDER HOST WITH NO END IS SENT THE IDLE HANDOFF IT ALWAYS WAS, by either word it says it has none; a host that refuses end otherwise is not', async (t) => {
  for (const older of ['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD'] as const) {
    const host = await stubHost(t, false, true, undefined, { endSays: older });
    const cwd = folder('kiln');
    const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
    writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-09-15T00:00:00Z' });
    const out = await run(['hook', 'end'], env, JSON.stringify({ session_id: 'claude-run-1', cwd, hook_event_name: 'SessionEnd', reason: 'logout' }));
    assert.deepEqual([out.code, out.stdout, out.stderr], [0, '', ''], older);
    assert.deepEqual(host.seen.map((s) => [s.method, s.body]), [['end', {}], ['handoff', { state: 'idle' }]], older);
    assert.equal(host.seen[1]!.headers['x-braindog-session'], 'S7');
  }

  /* A host that has end and refuses it, to a token that may not, is not answered with a second write. */
  const refusing = await stubHost(t, false, true, undefined, { endSays: 'FORBIDDEN' });
  const cwd = folder('kiln');
  const env = envFor(folder('config'), { BRAINDOG_HOST: refusing.base, BRAINDOG_TOKEN: TOKEN });
  writeSession(sessionPath(env, cwd), { host: refusing.base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-09-15T00:00:00Z' });
  await run(['hook', 'end'], env, JSON.stringify({ session_id: 'claude-run-1', cwd, hook_event_name: 'SessionEnd', reason: 'logout' }));
  assert.deepEqual(refusing.seen.map((s) => s.method), ['end']);
});

/* ── the people harvest ────────────────────────────────────────────────── */

/** A repository in a temporary folder with its own identity, so the commits and the owner's address are the test's. */
function repository(dir = folder('repo')): { dir: string; commit: (author?: string) => string } {
  mkdirSync(dir, { recursive: true });
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

test('THE END HOOK MEETS THE AUTHORS OF THIS SESSION’S COMMITS before the run ends: no bots, not the owner, nobody with one commit, at most ten, and silent when refused', async (t) => {
  const repo = repository();
  /* Ada's first commit is before the session, so her one commit in it is her second in the repository. */
  repo.commit('Ada Lovelace <123+ada@users.noreply.github.com>');
  const start = repo.commit();
  repo.commit('dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>');
  repo.commit('Claude <noreply@anthropic.com>');
  for (let i = 1; i <= 11; i++) for (let twice = 0; twice < 2; twice++) repo.commit(`Person ${String(i)} <person${String(i)}@example.com>`);
  repo.commit('Person 11 <PERSON11@example.com>');
  repo.commit('Drive By <drive@by.example>');
  repo.commit();
  const last = repo.commit('Ada Lovelace <123+ada@users.noreply.github.com>');
  const projects = [{ folders: [realpathSync(repo.dir)] }];
  const name = repo.dir.split(/[\\/]/).at(-1)!;
  const end = JSON.stringify({ session_id: 'claude-run-3', cwd: repo.dir, hook_event_name: 'SessionEnd', reason: 'logout' });
  const signedIn = (base: string) => {
    const env = envFor(folder('config'), { BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN });
    writeSession(sessionPath(env, repo.dir), { host: base, spoken: 'S7', client_id: 'claude-run-3', head_at_start: start, at: '2026-09-15T00:00:00Z' });
    return env;
  };

  const self = { name: 'Owner', email: 'owner@example.com' };
  const host = await stubHost(t, false, true, undefined, { projects, self });
  const out = await run(['hook', 'end'], signedIn(host.base), end);
  assert.deepEqual([out.code, out.stdout, out.stderr], [0, '', '']);
  /* The record's projects and the owner's own row read once, every list's declaration in one read, when the repository
     joined its project, then the meets, then the end. */
  assert.deepEqual(host.seen.map((s) => s.method), ['boot', 'schemas', 'list', 'list', 'history', ...Array<string>(10).fill('meet'), 'end']);
  const met = host.seen.filter((s) => s.method === 'meet');
  /* Newest first: GitHub's private address as a handle and a key, the owner's commit left out, and one person once. */
  const source = `commit ${last.slice(0, 7)} in ${name}`;
  assert.deepEqual(met[0]!.body, { name: 'Ada Lovelace', handle: 'github:ada', where: source, keys: ['github:ada'], kind: 'person', source });
  assert.deepEqual(
    met.slice(1).map((s) => s.body.email),
    [11, 10, 9, 8, 7, 6, 5, 4, 3].map((i) => `person${String(i)}@example.com`),
  );
  for (const s of met) {
    assert.match(String(s.body.source), new RegExp(`^commit [0-9a-f]{7} in ${name}$`));
    assert.equal(s.headers['x-braindog-session'], 'S7');
  }

  /* People switched off: the first is refused, no more are sent, and the run still ends. */
  const off = await stubHost(t, false, false, undefined, { projects, self });
  const quiet = await run(['hook', 'end'], signedIn(off.base), end);
  assert.deepEqual([quiet.code, quiet.stdout, quiet.stderr], [0, '', '']);
  assert.deepEqual(off.seen.map((s) => s.method), ['boot', 'schemas', 'list', 'list', 'history', 'meet', 'end']);

  /* FAIL CLOSED: no row marked the owner's, the project's history unreadable, or a time in it that is no time. Nobody is
     met, nothing is said, and the run still ends. */
  for (const o of [{ projects }, { projects, self, joined: null }, { projects, self, joined: '2999-01-01T00:00:00Z' }, { projects, self, joined: 'soon' }]) {
    const closed = await stubHost(t, false, true, undefined, o);
    const said = await run(['hook', 'end'], signedIn(closed.base), end);
    assert.deepEqual([said.code, said.stdout, said.stderr], [0, '', '']);
    assert.deepEqual(closed.seen.filter((s) => s.method === 'meet'), [], JSON.stringify(o));
    assert.equal(closed.seen.at(-1)?.method, 'end');
  }

  /* No project lists the repository: nobody is met, and the run still ends. */
  const unlisted = await stubHost(t, false, true, undefined, { projects: [{ repos: ['github.com/acme/other'] }], self });
  const none = await run(['hook', 'end'], signedIn(unlisted.base), end);
  assert.deepEqual([none.code, none.stdout, none.stderr], [0, '', '']);
  assert.deepEqual(unlisted.seen.filter((s) => s.method === 'meet'), []);
  assert.equal(unlisted.seen.at(-1)?.method, 'end');

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
    'x-braindog-cli': 'dev+0000000',
  });
  assert.equal(sessionHeaders(at, 'claude', { spoken: 'not-a-run' })['x-braindog-session'], undefined);

  const stray = await run(['hook', 'begin'], envFor(folder('config'), {}), '');
  assert.equal(stray.code, 0);
  assert.match(stray.stderr, /^braindog hook takes start, end, beat, prompt, tool, stop, watch or notify/);
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
     its session's; another window's is not; and one from a hook that did not say its window is not either, however
     recent, because a file written since the server started was as often another window's in the same folder. */
  const stale = { CLAUDE_CODE_SESSION_ID: 'claude-run-old' };
  const cleared: SessionFile = { ...held, spoken: 'S298', client_id: 'claude-run-new', at: new Date(now - 60_000).toISOString(), pid: '4242' };
  assert.equal(heldFor(cleared, held.host, stale, now, { parent: 4242, since: now - 3_600_000 }), cleared);
  assert.equal(heldFor(cleared, held.host, stale, now, { parent: 5151, since: now - 3_600_000 }), undefined);
  assert.equal(heldFor(cleared, held.host, stale, now), undefined, 'a command, which is started for the session it is in, is not a server');
  const { pid: _, ...unsaid } = cleared;
  assert.equal(heldFor(unsaid, held.host, stale, now, { parent: 5151, since: now - 3_600_000 }), undefined);
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
  /* BEFORE THE HELLO, AT MOST ONE `createToken`: the agent's own token tried from BRAINDOG_TOKEN (D4, `agentTokenFromKey`),
     which a token there is refused, so the server sends it as it always did. It goes before the client has said a word. */
  const minted = host.seen.filter((s) => s.method === 'createToken');
  assert.ok(minted.length <= 1 && (minted.length === 0 || host.seen[0] === minted[0]), host.seen.map((s) => s.method).join(' '));
  const said = host.seen.filter((s) => s.method !== 'createToken');
  assert.ok(said.length > 0, `the server never asked the host: ${out.stderr}`);
  for (const asked of said)
    assert.deepEqual(
      ['x-braindog-client-name', 'x-braindog-client-version', 'x-braindog-client', 'x-braindog-agent'].map((name) => asked.headers[name]),
      ['claude-code', '2.1.287', 'claude-run-mine', 'claude'],
      asked.method,
    );
});

test('A KEY THE HOST REFUSED TO MAKE A TOKEN FROM IS NOT ASKED AGAIN: once per key, kept by its print alone, under the home folder', async (t) => {
  const host = await stubHost(t);
  const config = folder('config');
  const env = envFor(config, { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const kept = mintRefusedPath(join(config, 'home'));
  const input = `${[
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.287' } } }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list', arguments: { register: 'tasks' } } }),
  ].join('\n')}\n`;
  const mints = () => host.seen.filter((s) => s.method === 'createToken').length;
  const start = async (e: NodeJS.ProcessEnv) => {
    const out = await run(['mcp', '--agent', 'claude'], e, input, folder('kiln'));
    assert.equal(out.code, 0, out.stderr);
    /* REFUSED OR SKIPPED, THE KEY IS SENT AS IT ALWAYS WAS, and the hello and the tool call still reach the host. */
    const said = host.seen.filter((s) => s.method !== 'createToken');
    assert.ok(said.length > 0 && said.every((s) => s.headers.authorization === `Bearer ${String(e.BRAINDOG_TOKEN)}`), host.seen.map((s) => s.method).join(' '));
    host.seen.splice(0, host.seen.length, ...host.seen.filter((s) => s.method === 'createToken'));
  };

  await start(env);
  assert.equal(mints(), 1, 'the first start asks');
  assert.ok(existsSync(kept), 'and keeps the refusal under the home folder');
  const text = readFileSync(kept, 'utf8');
  assert.equal(text.includes(TOKEN) || text.includes('stub-bearer'), false, 'never the key itself');
  assert.equal(text.includes(keyPrint(TOKEN)), true, "the key's print");

  await start(env);
  await start(env);
  assert.equal(mints(), 1, 'the same key is not asked again');

  /* ANOTHER KEY IS ASKED, once, and then it too is known. */
  const other = { ...env, BRAINDOG_TOKEN: `${TOKEN}-another` };
  await start(other);
  assert.equal(mints(), 2);
  await start(other);
  assert.equal(mints(), 2);
});

test('A HOST THAT WAS ONLY BUSY IS ASKED AGAIN AT THE NEXT START: nothing is kept for a refusal that is not about the key', async (t) => {
  const host = await stubHost(t, false, true, undefined, { mint: 'RATE_LIMITED' });
  const config = folder('config');
  const env = envFor(config, { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const hello = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.287' } } })}\n`;
  for (let i = 0; i < 2; i++) assert.equal((await run(['mcp', '--agent', 'claude'], env, hello, folder('kiln'))).code, 0);
  assert.equal(host.seen.filter((s) => s.method === 'createToken').length, 2);
  assert.equal(existsSync(mintRefusedPath(join(config, 'home'))), false);
});

test('THE MCP SERVER FOLLOWS ITS WINDOW ACROSS A CLEAR: the run its own window’s start hook wrote, and never another window’s', async (t) => {
  const host = await stubHost(t);
  /* The folder as the server sees it: on macOS the temporary folder is a link, and the file is keyed by the real one. */
  const cwd = realpathSync(folder('kiln'));
  /* The id Claude Code gave the server when it started it, which a clear does not change. */
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN, CLAUDE_CODE_SESSION_ID: 'claude-run-old' });
  const call = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list', arguments: { register: 'tasks' } } })}\n`;
  /* Every request the call made, as the run and the client it named, once each. */
  /* Not the `createToken` before the hello (D4), which names no run because none is read before the first request. */
  const named = () => [...new Set(host.seen.splice(0).filter((s) => s.method !== 'createToken').map((s) => `${String(s.headers['x-braindog-session'])} ${String(s.headers['x-braindog-client'])}`))];

  /* The clear's start hook, under the window that started this server (its parent, here this test): the window's file. */
  writeSession(windowPath(env, String(process.pid)), { host: host.base, spoken: 'S8', client_id: 'claude-run-new', head_at_start: null, at: new Date().toISOString(), pid: String(process.pid) });
  assert.equal((await run(['mcp', '--agent', 'claude'], env, call, cwd)).code, 0);
  assert.deepEqual(named(), ['S8 claude-run-new']);
  rmSync(windowPath(env, String(process.pid)));

  /* Another window's start hook in the same folder: its run is not this server's, and the server's own id is sent. */
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S9', client_id: 'claude-run-other', head_at_start: null, at: new Date().toISOString(), pid: '1' });
  assert.equal((await run(['mcp', '--agent', 'claude'], env, call, cwd)).code, 0);
  assert.deepEqual(named(), ['undefined claude-run-old']);
});

test('TWO WINDOWS IN ONE FOLDER EACH KEEP THEIR OWN RUN: the second start hook does not take the first window’s server', async (t) => {
  const host = await stubHost(t);
  const cwd = realpathSync(folder('kiln'));
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const call = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list', arguments: { register: 'tasks' } } })}\n`;
  /* Not the `createToken` before the hello (D4), which names no run because none is read before the first request. */
  const named = () => [...new Set(host.seen.splice(0).filter((s) => s.method !== 'createToken').map((s) => `${String(s.headers['x-braindog-session'])} ${String(s.headers['x-braindog-client'])}`))];
  const now = () => new Date().toISOString();

  /* Window A started first, window B a minute later in the same folder, and B's start hook wrote the folder's file. */
  writeSession(sessionPath(env, cwd, 'claude-run-a'), { host: host.base, spoken: 'S8', client_id: 'claude-run-a', head_at_start: null, at: now(), pid: '1001' });
  writeSession(sessionPath(env, cwd, 'claude-run-b'), { host: host.base, spoken: 'S9', client_id: 'claude-run-b', head_at_start: null, at: now(), pid: '1002' });
  writeSession(sessionPath(env, cwd), { host: host.base, spoken: 'S9', client_id: 'claude-run-b', head_at_start: null, at: now(), pid: '1002' });

  assert.equal((await run(['mcp', '--agent', 'claude'], { ...env, CLAUDE_CODE_SESSION_ID: 'claude-run-a' }, call, cwd)).code, 0);
  assert.deepEqual(named(), ['S8 claude-run-a'], 'window A wrote as window B’s run');
  assert.equal((await run(['mcp', '--agent', 'claude'], { ...env, CLAUDE_CODE_SESSION_ID: 'claude-run-b' }, call, cwd)).code, 0);
  assert.deepEqual(named(), ['S9 claude-run-b']);
  /* A shell in the folder, with no session id, takes the last session started there. */
  assert.equal((await run(['context'], env, '', cwd)).code, 0);
  assert.deepEqual(named(), ['S9 claude-run-b']);
});

test('A SUBAGENT TAKES ITS PARENT RUN’S PLACE when it stands in no repository, and says the parent run; one in a repository keeps its own', async (t) => {
  const host = await stubHost(t);
  const scratch = realpathSync(folder('scratch'));
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  writeSession(windowPath(env, '777'), {
    host: host.base,
    spoken: 'S5',
    client_id: 'claude-run-parent',
    head_at_start: null,
    at: new Date().toISOString(),
    pid: '777',
    cwd: '/work/kiln',
    repo: 'kiln',
    remote: 'github.com/acme/kiln',
  });
  const place = (s: Seen) => ['x-braindog-parent', 'x-braindog-client', 'x-braindog-repo', 'x-braindog-remote', 'x-braindog-cwd'].map((h) => s.headers[h]);
  const child = { ...env, CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_PID: '777', CLAUDE_CODE_SESSION_ID: 'claude-run-child' };

  assert.equal((await run(['context'], child, '', scratch)).code, 0);
  assert.deepEqual(host.seen.splice(0).filter((s) => s.method === 'context').map(place), [['S5', 'claude-run-child', 'kiln', 'github.com/acme/kiln', '/work/kiln']]);

  /* Not a subagent, or another window's process: its own place, and no parent. */
  assert.equal((await run(['context'], { ...child, CLAUDE_CODE_CHILD_SESSION: '' }, '', scratch)).code, 0);
  assert.equal((await run(['context'], { ...child, CLAUDE_PID: '778' }, '', scratch)).code, 0);
  for (const s of host.seen.splice(0).filter((x) => x.method === 'context')) assert.deepEqual(place(s), [undefined, 'claude-run-child', undefined, undefined, scratch]);

  /* In a repository of its own, its own place, with the parent still said. */
  const at = { cwd: '/work/glaze', repo: 'glaze', remote: null, host: 'box', branch: null, head: null };
  const headers = sessionHeaders(at, 'claude', undefined, { parent: { spoken: 'S5', cwd: '/work/kiln', repo: 'kiln', remote: 'github.com/acme/kiln' } });
  assert.deepEqual([headers['x-braindog-parent'], headers['x-braindog-repo'], headers['x-braindog-cwd'], headers['x-braindog-remote']], ['S5', 'glaze', '/work/glaze', undefined]);
});

test('THE END HOOK READS EVERY REPOSITORY THAT MOVED UNDER A FOLDER THAT IS NOT ONE AND A PROJECT LISTS, leaves out the owner by every key and alias on his own row and the machines, and speaks to an older record in its words', async (t) => {
  const top = realpathSync(folder('developer'));
  const a = repository(join(top, 'glaze'));
  const b = repository(join(top, 'studio', 'kiln'));
  /* Moved too, and no project lists it. */
  const c = repository(join(top, 'oss'));
  a.commit();
  a.commit('Grace Hopper <grace@navy.example>');
  b.commit();
  b.commit('Linus <linus@example.org>');
  c.commit('Stranger <stranger@example.org>');
  /* Not searched: a hidden folder and a dependency tree. */
  repository(join(top, '.cache', 'x')).commit();
  repository(join(top, 'node_modules', 'y')).commit();
  const host = await stubHost(t, false, true, undefined, {
    self: { name: OWNER.name, aliases: [FIRST], email: 'Mara@Lindqvist.example', keys: ['email:maralind@gmail.com', 'github:maralind'] },
    legacy: true,
    projects: [{ folders: [join(top, 'glaze')] }, { folders: [join(top, 'studio', 'kiln')] }],
  });
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const start = await run(['hook', 'start'], env, event(top, { session_id: 'claude-run-dev', source: 'startup' }));
  assert.equal(start.code, 0, start.stderr);
  assert.deepEqual(Object.keys(readSession(sessionPath(env, top, 'claude-run-dev'))?.heads ?? {}), ['glaze', 'oss', 'studio/kiln']);

  const grace = a.commit('Grace Hopper <grace@navy.example>');
  for (const machine of [
    'Jenkins Schema Sync <jenkins@brightloom.example>',
    'Brightloom Repos <repos@brightloom.example>',
    'Ubuntu <ubuntu@ip-10-0-0-1>',
    'root <root@build.example>',
    'runner <runner@gh.example>',
    'github-actions <41898282+github-actions[bot]@users.noreply.github.com>',
    'Renovate Bot <bot@renovateapp.com>',
  ])
    for (let twice = 0; twice < 2; twice++) a.commit(machine);
  /* Every key on his row, and his aliases at an address the row does not hold yet. */
  for (const self of [`${FIRST} <${OWNER.email}>`, `${OWNER.name} <m.a.ralind+work@googlemail.com>`, `${FIRST} <1234+maralind@users.noreply.github.com>`, `${FIRST} <mara@new-job.example>`, `${FIRST} <mara@new-job.example>`])
    a.commit(self);
  const linus = b.commit('Linus <linus@example.org>');
  c.commit('Stranger <stranger@example.org>');
  host.seen.splice(0);

  const end = await run(['hook', 'end'], env, JSON.stringify({ session_id: 'claude-run-dev', cwd: top, hook_event_name: 'SessionEnd', reason: 'logout' }));
  assert.deepEqual([end.code, end.stdout, end.stderr], [0, '', '']);
  assert.ok(
    host.seen.some((s) => s.method === 'list' && /"field":"self"/.test(s.query + JSON.stringify(s.body))),
    'the owner’s own row was not asked for',
  );
  const met = host.seen.filter((s) => s.method === 'meet').map((s) => s.body);
  /* The first in the contract's words, refused for keys; then in the four words this record takes, for the rest. */
  assert.deepEqual(met, [
    { name: 'Grace Hopper', email: 'grace@navy.example', where: `commit ${grace.slice(0, 7)} in glaze`, keys: ['email:grace@navy.example'], kind: 'person', source: `commit ${grace.slice(0, 7)} in glaze` },
    { name: 'Grace Hopper', email: 'grace@navy.example', where: `commit ${grace.slice(0, 7)} in glaze` },
    { name: 'Linus', email: 'linus@example.org', where: `commit ${linus.slice(0, 7)} in kiln` },
  ]);
  assert.equal(host.seen.at(-1)?.method, 'end');
  /* Three moved, so the run is not placed by any one of them. */
  assert.equal(host.seen.at(-1)?.headers['x-braindog-repo'], undefined);
});

test('THE END HOOK PLACES A RUN STARTED IN A FOLDER THAT IS NOT A REPOSITORY by the one repository under it that moved, and by none when two moved', async (t) => {
  const top = realpathSync(folder('developer'));
  const kiln = repository(join(top, 'kiln'));
  const glaze = repository(join(top, 'glaze'));
  kiln.commit();
  glaze.commit();
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:sam/kiln.git'], { cwd: kiln.dir });
  const host = await stubHost(t);
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const end = (id: string) => run(['hook', 'end'], env, JSON.stringify({ session_id: id, cwd: top, hook_event_name: 'SessionEnd', reason: 'logout' }));
  const handoff = () => host.seen.filter((s) => s.method === 'end').at(-1)!;

  /* One moved: the end says kiln's remote, folder, branch and commit, so the record places the run in kiln's project. */
  assert.equal((await run(['hook', 'start'], env, event(top, { session_id: 'claude-run-one', source: 'startup' }))).code, 0);
  const head = kiln.commit();
  host.seen.splice(0);
  assert.deepEqual(Object.values(await end('claude-run-one')).slice(0, 3), [0, '', '']);
  const one = handoff();
  assert.equal(one.headers['x-braindog-repo'], 'kiln');
  assert.equal(one.headers['x-braindog-remote'], 'github.com/sam/kiln');
  assert.equal(one.headers['x-braindog-cwd'], kiln.dir);
  assert.equal(one.headers['x-braindog-client'], 'claude-run-one');
  assert.deepEqual({ state: one.body.state, head: one.body.head }, { state: undefined, head });
  assert.equal(typeof one.body.branch, 'string');

  /* Two moved: no guess. The run keeps the folder's own position, with no repository and no remote. */
  assert.equal((await run(['hook', 'start'], env, event(top, { session_id: 'claude-run-two', source: 'startup' }))).code, 0);
  kiln.commit();
  glaze.commit();
  host.seen.splice(0);
  assert.deepEqual(Object.values(await end('claude-run-two')).slice(0, 3), [0, '', '']);
  const two = handoff();
  assert.equal(two.headers['x-braindog-cwd'], top);
  assert.equal(two.headers['x-braindog-repo'], undefined);
  assert.equal(two.headers['x-braindog-remote'], undefined);
  assert.deepEqual(two.body, {});

  /* None moved: the folder's position too. */
  assert.equal((await run(['hook', 'start'], env, event(top, { session_id: 'claude-run-none', source: 'startup' }))).code, 0);
  host.seen.splice(0);
  await end('claude-run-none');
  assert.equal(handoff().headers['x-braindog-cwd'], top);
  assert.equal(handoff().headers['x-braindog-repo'], undefined);
});

test('THE END HOOK COUNTS ONLY SINCE A REPOSITORY JOINED ITS PROJECT, each commit once across two checkouts, and meets no coding agent', async (t) => {
  const top = realpathSync(folder('fork'));
  const a = join(top, 'glaze');
  const b = join(top, 'glaze-copy');
  const git = (cwd: string, args: string[], at?: string) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...(at === undefined ? {} : { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at }) } }).trim();
  mkdirSync(a, { recursive: true });
  git(a, ['init', '--quiet']);
  const commit = (cwd: string, author: string, at?: string) => git(cwd, ['commit', '--quiet', '--allow-empty', '-m', 'change', '--author', author], at);
  for (const [k, v] of [['user.name', 'Owner'], ['user.email', 'owner@example.com'], ['commit.gpgsign', 'false']] as const) git(a, ['config', k, v]);
  commit(a, 'Owner <owner@example.com>');
  git(top, ['clone', '--quiet', a, b]);
  for (const [k, v] of [['user.name', 'Owner'], ['user.email', 'owner@example.com'], ['commit.gpgsign', 'false'], ['pull.ff', 'only']] as const) git(b, ['config', k, v]);
  const host = await stubHost(t, false, true, undefined, { self: { name: 'Owner', email: 'owner@example.com' }, projects: [{ folders: [a, b] }], joined: '2026-01-01T00:00:00Z' });
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  assert.equal((await run(['hook', 'start'], env, event(top, { session_id: 'claude-run-fork', source: 'startup' }))).code, 0);

  /* Upstream's history, pulled in: two commits each, made before the repository joined its project. */
  for (const who of ['Upstream One <one@upstream.example>', 'Upstream Two <two@upstream.example>']) for (let twice = 0; twice < 2; twice++) commit(a, who, '2020-03-01T12:00:00Z');
  /* One commit, in both checkouts once the copy pulls it: one commit, so nobody yet. */
  commit(a, 'Drive By <drive@by.example>');
  /* Coding agents, twice each. */
  for (const agent of [
    'Claude <noreply@anthropic.com>',
    'Claude Code <claude@anthropic.com>',
    'Cursor Agent <cursoragent@cursor.com>',
    'Copilot <198982749+Copilot@users.noreply.github.com>',
    'Devin AI <158243242+devin-ai-integration[bot]@users.noreply.github.com>',
    'Codex <codex@openai.com>',
    'gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>',
    'Ada Lovelace (aider) <ada@lovelace.example>',
  ])
    for (let twice = 0; twice < 2; twice++) commit(a, agent);
  for (let twice = 0; twice < 2; twice++) commit(a, 'Grace Hopper <grace@navy.example>');
  git(b, ['pull', '--quiet']);
  host.seen.splice(0);

  const end = await run(['hook', 'end'], env, JSON.stringify({ session_id: 'claude-run-fork', cwd: top, hook_event_name: 'SessionEnd', reason: 'logout' }));
  assert.deepEqual([end.code, end.stdout, end.stderr], [0, '', '']);
  assert.deepEqual(host.seen.filter((s) => s.method === 'meet').map((s) => s.body.name), ['Grace Hopper']);
});

test('THE START HOOK KEEPS THE WINDOW IT RAN UNDER, when Claude Code says it, and nothing that is not a process id', async (t) => {
  const host = await stubHost(t);
  const cwd = folder('kiln');
  const env = envFor(folder('config'), { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN });
  const start = event(cwd, { session_id: 'claude-run-1', source: 'clear' });
  assert.equal((await run(['hook', 'start'], { ...env, CLAUDE_PID: '4242' }, start)).code, 0);
  assert.equal(readSession(sessionPath(env, cwd))?.pid, '4242');
  /* And the window's own file, which its MCP server follows across a clear and its subagents take their project from. */
  assert.equal(readSession(windowPath(env, '4242'))?.client_id, 'claude-run-1');
  /* A subagent's start is never its window's run. */
  assert.equal((await run(['hook', 'start'], { ...env, CLAUDE_PID: '4343', CLAUDE_CODE_CHILD_SESSION: '1' }, start)).code, 0);
  assert.equal(existsSync(windowPath(env, '4343')), false);
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
  const beat = hookCommand('beat', join(APP, 'hooks'));
  const status = 'Connecting to BrainDog...';

  const dry = await run(['install', '--config-dir', profile], env, '');
  assert.equal(dry.code, 0, dry.stderr);
  assert.ok(dry.stdout.startsWith(`braindog install would change ${file}:\n`), dry.stdout);
  assert.ok(dry.stdout.includes(`  + hooks.SessionStart: ${JSON.stringify({ hooks: [{ type: 'command', command: start, timeout: 10, statusMessage: status }] })}`), dry.stdout);
  assert.ok(dry.stdout.includes(`  + hooks.SessionEnd: ${JSON.stringify({ hooks: [{ type: 'command', command: end, timeout: 10, statusMessage: 'Saving this session to BrainDog...' }] })}`), dry.stdout);
  /* THE BEAT CARRIES NO STATUS LINE: it runs after every tool call, and a line flashing under the agent's work each time
     is a busier screen (hooks-48's checker). */
  assert.ok(dry.stdout.includes(`  + hooks.PostToolUse: ${JSON.stringify({ hooks: [{ type: 'command', command: beat, timeout: 10 }] })}`), dry.stdout);
  assert.ok(dry.stdout.split('\n').some((l) => l.startsWith('Nothing was changed. To write it, run this in ') && l.includes(` install --apply --config-dir '${profile}'`)), dry.stdout);
  assert.ok(dry.stdout.includes('claude mcp add --scope user braindog'));
  assert.equal(readFileSync(file, 'utf8'), before, 'the dry run changed the settings');
  assert.deepEqual(readdirSync(profile), ['settings.json']);

  const applied = await run(['install', '--apply', '--config-dir', profile], env, '');
  assert.equal(applied.code, 0, applied.stderr);
  assert.ok(applied.stdout.includes(`The file as it was is kept at ${file}.pre-braindog.`));
  assert.equal(readFileSync(`${file}.pre-braindog`, 'utf8'), before);
  const now = JSON.parse(readFileSync(file, 'utf8')) as { model: string; hooks: Record<string, { hooks: { command: string }[] }[]> };
  assert.equal(now.model, 'opus');
  assert.deepEqual(now.hooks.SessionStart!.map((g) => g.hooks[0]!.command), ['echo other', start]);
  assert.deepEqual(now.hooks.SessionEnd!.map((g) => g.hooks[0]!.command), [end]);

  const again = await run(['install', '--apply', '--config-dir', profile], env, '');
  assert.ok(again.stdout.startsWith(`${file} already runs every BrainDog hook. Nothing to change.`));
  assert.deepEqual(readdirSync(profile).sort(), ['settings.json', 'settings.json.pre-braindog', 'skills']);

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
  assert.ok(both.stdout.includes(`${file} already runs every BrainDog hook. Nothing to change.`), both.stdout);

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
  const stop = hookCommand('stop', scripts);

  const lines = installInto(dir, { apply: true, replace: REPLACE, scripts, home });
  const text = lines.join('\n');
  assert.ok(text.includes(`The file as it was is kept at ${settings}.pre-braindog.`), text);
  assert.ok(text.includes(`The file as it was is kept at ${claudeJson}.pre-braindog.`), text);
  assert.equal(readFileSync(`${settings}.pre-braindog`, 'utf8'), before);
  assert.equal(readFileSync(`${claudeJson}.pre-braindog`, 'utf8'), mcpBefore);

  type Group = { matcher?: string; hooks: { command: string }[] };
  const now = JSON.parse(readFileSync(settings, 'utf8')) as { model: string; hooks: Record<string, Group[]> };
  assert.equal(now.model, 'opus');
  /* The group Tallybook's hook sat alone in is gone; a group it shared keeps the other hook. */
  assert.deepEqual(now.hooks.SessionStart!.map((g) => g.hooks.map((h) => h.command)), [[OLD_SHIM], [start]]);
  assert.equal(now.hooks.SessionStart![0]!.matcher, 'startup');
  assert.deepEqual(now.hooks.SessionEnd!.map((g) => g.hooks.map((h) => h.command)), [[LOOKALIKE], [end]]);
  /* Somebody else's Stop hook is kept, and BrainDog's own (inbox-file.ts) goes in beside it. */
  assert.deepEqual(now.hooks.Stop!.map((g) => g.hooks.map((h) => h.command)), [['echo stop'], [stop]]);

  const mcp = JSON.parse(readFileSync(claudeJson, 'utf8')) as { numStartups: number; mcpServers: Record<string, unknown>; projects: Record<string, { allowedTools: unknown[]; mcpServers: Record<string, unknown> }> };
  assert.equal(mcp.numStartups, 41);
  /* BrainDog's server in where Tallybook's came out, once at user scope for the three removed (install-adds-server.test.ts). */
  assert.deepEqual(Object.keys(mcp.mcpServers), ['figma', 'brainy', 'braindog']);
  assert.deepEqual(mcp.projects['C:/Repos/acme'], { allowedTools: [], mcpServers: {} });

  /* `checkout` a folder in no git tree, so the moving-checkout line, which follows the real tree's state, is not owed. */
  const again = installInto(dir, { apply: true, replace: REPLACE, scripts, home, checkout: home });
  assert.deepEqual(again, [
    `${settings} already runs every BrainDog hook and no Tallybook hook. Nothing to change.`,
    `${claudeJson} registers no Tallybook MCP server. Nothing to change.`,
  ]);
  assert.deepEqual(readdirSync(dir).sort(), ['.claude.json', '.claude.json.pre-braindog', 'settings.json', 'settings.json.pre-braindog', 'skills']);

  /* Without --replace, install leaves Tallybook's entries where they are, as it always has. */
  const plain = folder('home');
  const kept = cutOverProfile(join(plain, '.claude'), join(plain, '.claude.json'));
  installInto(join(plain, '.claude'), { apply: true, scripts, home: plain });
  assert.ok(readFileSync(kept.settings, 'utf8').includes('session-start.ps1'));
  assert.equal(readFileSync(join(plain, '.claude.json'), 'utf8'), kept.mcpBefore);
  assert.ok(!existsSync(join(plain, '.claude.json.pre-braindog')));
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
  assert.ok(applied.stdout.includes(`The file as it was is kept at ${file}.pre-braindog.`), applied.stdout);
  assert.equal(readFileSync(`${file}.pre-braindog`, 'utf8'), before);
  const now = JSON.parse(readFileSync(file, 'utf8')) as { mcpServers: Record<string, unknown>; note: string };
  /* No `braindog` here: a new name in this file is only a prompt to approve, and the profile holds the entry instead. */
  assert.deepEqual(Object.keys(now.mcpServers), ['figma', 'brainy']);
  assert.equal(now.note, 'kept as it was');
  /* The same run wrote the profile's hooks: one change, not two. */
  assert.ok(existsSync(join(profile, 'settings.json')));

  const again = await run(['install', '--replace', REPLACE_FILE, '--apply', '--config-dir', profile, '--mcp-json', file], env, '');
  assert.ok(again.stdout.includes(`${file} registers no Tallybook MCP server. Nothing to change.`), again.stdout);
  assert.deepEqual(readdirSync(outside).sort(), ['.mcp.json', '.mcp.json.pre-braindog']);
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
