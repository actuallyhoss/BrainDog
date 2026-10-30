#!/usr/bin/env node
/**
 * The self-host from a clean clone ("The software stays self-hostable"): the README's own
 * lines, run in a scratch copy of the repository, and then the real `braindog` command built from the same tree.
 *
 *   node apps/selfhost/test/from-clean.mjs [--container] [--dry] [--after-install <script>] [--keep]
 *
 * THE LINES ARE READ OUT OF README.md, NEVER WRITTEN HERE, so the two cannot drift: the first fenced block under "Run it
 * yourself" (the container, by Compose) and the one after "Without Docker". A line changed there is the line run here; a
 * line this check cannot place (no install, no init, no start, no .env, no `compose up`) is refused before anything runs.
 * `<record name>` and `<your email>` are filled with an invented record and owner; the Compose project, image, volume and
 * port are this run's own, so a person's real `braindog` image and volume are never touched.
 *
 * THE COPY IS `git archive HEAD`, read only. No worktree, no clone, nothing written to the repository: the copy is the
 * commit as a stranger would get it, and an untracked file on this machine cannot make it pass.
 *
 * THEN THE REAL COMMAND, `apps/cli/dist/braindog.mjs` built in the copy: a write token minted with the server key, `boot`,
 * one row written and read back over `braindog mcp`, `export` (the key it is wrapped by named by the record's own
 * refusal, as a person learns it), `verify`, `init --from` into a second folder, served, and the row read there.
 *
 * `--container` does the same through the README's `.env` and `docker compose up`, the image's health check healthy and
 * the one-time link in the log, and says `skipped: no docker` where there is none. `--after-install <script>` runs that
 * script once what needs the network is in (the install, and `compose up`, which builds the image), so the workflow can
 * block outbound calls there: a run that then fails needed
 * the Cloud by accident (the scope's risk). One line a step, counts only. A token, the server key and the inbound email
 * token never print: every line said is scrubbed of each secret this run made.
 *
 * EVERY WAIT HAS A DEADLINE (`DEADLINE`), and one missed fails as a sentence naming its step: a process that does not
 * finish, a server that does not answer, a call `braindog mcp` never answers, a container never healthy. A child still
 * running once the run is over is killed, so the check always ends.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* THE CHECKOUT THIS RUN COPIES FROM, a directory. Not called `root`, which in a file that also handles the KEK is
   read as the root key (`tools/gates/secret-grep.mjs`). */
const CHECKOUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The invented record and owner every run makes. Never a real person's. */
export const RECORD = 'harbour-lane';
export const OWNER = 'wren@thimble.example';
/** The row written and read back, in the one list a new record holds. */
export const ROW = { register: 'session', fields: { doing: 'Glaze the second kiln batch' } };

/* ── THE README ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The first ```sh block after the line `after` matches, as its lines, or null. */
function fenceAfter(lines, after) {
  const at = lines.findIndex((l) => after.test(l));
  if (at < 0) return null;
  const open = lines.findIndex((l, i) => i > at && /^```(sh|bash|shell)?\s*$/.test(l));
  if (open < 0) return null;
  const close = lines.findIndex((l, i) => i > open && /^```\s*$/.test(l));
  if (close < 0) return null;
  /* A COMMENT AFTER A LINE IS FOR THE READER, never a word of the command. */
  return lines.slice(open + 1, close).map((l) => l.replace(/\s+#\s.*$/, '').trim()).filter((l) => l !== '' && !l.startsWith('#'));
}

/** The self-host's two blocks out of README.md's text. Throws one sentence when either is missing. */
export function readmeBlocks(text) {
  const lines = text.split('\n');
  const selfhost = fenceAfter(lines, /^Without Docker\b/);
  const container = fenceAfter(lines, /^#{2,4} Run it yourself\s*$/);
  if (selfhost === null) throw new Error('README.md has no sh block after "Without Docker", so there are no self-host lines to run.');
  if (container === null) throw new Error('README.md has no sh block under ### Run it yourself, so there are no container lines to run.');
  return { selfhost, container };
}

/** A README line with its placeholders filled, as the words a process is started with. README lines carry no quotes. */
export function words(line, fill = {}) {
  let out = line.replaceAll('<record name>', RECORD).replaceAll('<your email>', OWNER);
  for (const [from, to] of Object.entries(fill)) out = out.replaceAll(from, to);
  return out.split(/\s+/).filter((w) => w !== '');
}

/** What one README line is to this check. */
export function kindOf(line) {
  if (/^git clone\b/.test(line)) return 'clone';
  if (/^cd\b/.test(line)) return 'cd';
  if (/^pnpm( --[a-z-]+)* install\b/.test(line)) return 'install';
  if (/^pnpm\b.*\bbuild\b/.test(line)) return 'build';
  if (/^cp \S+\.env\.example \.env$/.test(line)) return 'env';
  if (/^docker compose up\b.*\s-d\b/.test(line)) return 'up';
  if (/^docker compose logs\b/.test(line)) return 'logs';
  if (/^docker compose exec braindog cat \/data\/claim-link$/.test(line)) return 'claim';
  /* THE DATA FOLDER THE README POINTS AT, which this check names itself (a scratch folder), so the line is not run. */
  if (/^export BRAINDOG_DATA=\S+$/.test(line)) return 'data';
  if (/\bmain\.ts init\b/.test(line)) return 'init';
  if (/^node apps\/selfhost\/src\/main\.ts( serve)?$/.test(line)) return 'start';
  return 'other';
}

/** What a step that is not a README line does, for `--dry`. */
export const DOES = {
  copy: 'git archive HEAD, unpacked into a scratch folder',
  offline: 'the --after-install script: outbound calls blocked',
  'build the command': 'pnpm --filter braindog-cli build, the braindog command from the same commit',
  healthy: "the container's health check, until healthy",
  'sign in': 'braindog token create --scope write, with the server key',
  boot: 'braindog mcp: read braindog:boot',
  write: 'braindog mcp: create one row',
  read: 'braindog mcp: get the row back',
  export: 'braindog export, with the key the record names',
  verify: 'braindog verify on this machine',
  restore: 'the init line with --from the copy, into a second folder',
  'start the copy': 'the start line, on the second folder',
  'healthy there': "the image's health check on the copy",
  'sign in there': 'braindog token create on the copy',
  'read there': 'braindog mcp: get the row on the copy',
};

/** The calls the real command makes once a host answers, and again on the restored copy. */
const CALLS = ['sign in', 'boot', 'write', 'read', 'export', 'verify', 'restore'];

/**
 * The steps of one run, in order, each `{ id, line? }` where `line` is the README line it runs. Throws one sentence when
 * the README has lost a line this check needs, before anything runs.
 */
export function plan(blocks, { container = false, offline = false } = {}) {
  const steps = [{ id: 'copy' }];
  const kinds = (lines) => lines.map((line) => ({ line, kind: kindOf(line) }));
  const own = kinds(blocks.selfhost);
  const need = (list, kind, block) => {
    if (!list.some((l) => l.kind === kind)) throw new Error(`README.md's ${block} lines have no ${kind} line, so a clean run cannot be made from them.`);
  };
  need(own, 'install', 'self-host');
  if (!container) {
    need(own, 'init', 'self-host');
    need(own, 'start', 'self-host');
    for (const { line, kind } of own) {
      if (kind === 'clone' || kind === 'cd' || kind === 'data') continue;
      if (kind === 'init') steps.push({ id: 'build the command' });
      steps.push({ id: kind === 'other' ? 'readme line' : kind === 'build' ? 'build the app' : kind, line });
      if (kind === 'install' && offline) steps.push({ id: 'offline' });
    }
    for (const id of CALLS) steps.push({ id });
    steps.push({ id: 'start the copy' }, { id: 'sign in there' }, { id: 'read there' });
    return steps;
  }
  const box = kinds(blocks.container);
  for (const kind of ['env', 'up']) need(box, kind, 'container');
  /* THE RESTORE IS THE README'S init LINE WITH --from, run in the image, so the container run needs it too. */
  need(own, 'init', 'self-host');
  steps.push({ id: 'install', line: own.find((l) => l.kind === 'install').line }, { id: 'build the command' });
  for (const { line, kind } of box) {
    if (kind === 'clone' || kind === 'cd' || kind === 'data') continue;
    steps.push({ id: kind === 'other' ? 'readme line' : kind, line });
    /* `compose up --build` IS THE IMAGE AND THE START IN ONE LINE, so outbound is cut once it is in. */
    if (kind === 'up' && offline) steps.push({ id: 'offline' });
    if (kind === 'up') steps.push({ id: 'healthy' });
  }
  for (const id of CALLS) steps.push(id === 'restore' ? { id, line: own.find((l) => l.kind === 'init').line } : { id });
  steps.push({ id: 'start the copy' }, { id: 'healthy there' }, { id: 'sign in there' }, { id: 'read there' });
  return steps;
}

/* ── RUNNING ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * How long each wait may take, in ms. The install and the builds fetch or compile; everything once outbound is blocked
 * talks to this machine only and answers in seconds, so a minute or two there is already a hang. Each sits well inside
 * its job's ceiling in `.github/workflows/selfhost.yml` (30 and 45 minutes), so a hang says its step before the job dies.
 */
export const DEADLINE = {
  install: 600_000,
  build: 600_000,
  image: 1_500_000,
  step: 120_000,
  docker: 120_000,
  inspect: 30_000,
  healthz: 90_000,
  boxHealthy: 180_000,
  fetch: 5_000,
  rpc: 60_000,
  exit: 10_000,
};

/** Every child this run spawned that has not exited yet, so none can keep the check from ending. */
const LIVE = new Set();
function track(child) {
  LIVE.add(child);
  child.once('exit', () => LIVE.delete(child));
  child.once('error', () => LIVE.delete(child));
  return child;
}

/** A deadline in words. */
const secs = (ms) => `${String(Math.round(ms / 1000))} s`;

/** Every secret this run made, so no line it says can carry one. */
const SECRETS = new Set();
export function scrub(text) {
  let out = String(text).replace(/(token at )\S+/g, '$1[hidden]');
  for (const s of SECRETS) out = out.replaceAll(s, '[hidden]');
  return out;
}

const say = (id, text) => process.stdout.write(`${scrub(`${id.padEnd(18)} ${text}`)}\n`);

/** A step that failed: what it ran, scrubbed, and the end of what the process said. */
class Failed extends Error {
  constructor(id, why, output = '') {
    super(`${id}: ${why}`);
    this.tail = scrub(output).split('\n').filter((l) => l.trim() !== '' && !/ExperimentalWarning|trace-warnings/.test(l)).slice(-20).join('\n');
  }
}

/**
 * Run a command to its end, at most `timeout` ms. Answers its stdout; throws `Failed` with its output on a non-zero exit,
 * and one naming the deadline when it does not finish (it is killed).
 */
function run(id, argv, { cwd, env = process.env, input, timeout = DEADLINE.step } = {}) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env, input, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === 'ETIMEDOUT')
    throw new Failed(id, `${argv.slice(0, 3).join(' ')} did not finish in ${secs(timeout)}, so it was stopped`, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  if (r.error) throw new Failed(id, `${argv[0]} could not be run: ${r.error.message}`);
  if (r.status !== 0) throw new Failed(id, `${argv.slice(0, 3).join(' ')} exited ${String(r.status)}`, `${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/** A port nothing on this machine listens on now. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait for `/healthz` to answer ok, at most `ms`; `alive` says whether the server is still running. Each ask is cut at
 * `DEADLINE.fetch`, so a server that takes the call and never answers cannot hold the wait past its deadline.
 */
async function healthy(id, base, alive, ms = DEADLINE.healthz) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!alive()) throw new Failed(id, 'the server stopped before it answered');
    try {
      const r = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(Math.min(DEADLINE.fetch, Math.max(1, until - Date.now()))) });
      if (r.ok && (await r.json()).ok === true) return;
    } catch {
      /* not listening yet */
    }
    await sleep(500);
  }
  throw new Failed(id, `${base}/healthz did not answer ok in ${secs(ms)}`);
}

/* ── THE REAL COMMAND ───────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The environment `braindog` runs in: this machine's, less every BRAINDOG_ setting of its own, with a home and a config
 * folder in the scratch, so the run never reads or writes the hosts file of the person running it.
 */
function cliEnv(home, host, token) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('BRAINDOG_')));
  return { ...env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), BRAINDOG_HOST: host, BRAINDOG_TOKEN: token };
}

/** One `braindog ... --json` call: its parsed document, or `Failed` naming the step. */
function cliJson(id, cli, args, env, cwd) {
  const timeout = DEADLINE.step;
  const r = spawnSync(process.execPath, [cli, ...args, '--json'], { cwd, env, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === 'ETIMEDOUT') throw new Failed(id, `braindog ${args[0]} did not finish in ${secs(timeout)}, so it was stopped`, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  if (r.error) throw new Failed(id, `braindog ${args[0]} could not be run: ${r.error.message}`);
  const last = (r.stdout ?? '').trim().split('\n').at(-1) ?? '';
  try {
    return JSON.parse(last);
  } catch {
    throw new Failed(id, `braindog ${args[0]} answered no JSON document`, `${r.stdout}\n${r.stderr}`);
  }
}

/** A write token minted with the server key, as `braindog token create` does it. Kept as a secret at once. */
function signIn(id, cli, home, base, serverKey) {
  const env = cliEnv(home, base, serverKey);
  const got = cliJson(id, cli, ['token', 'create', '--name', 'from-clean', '--scope', 'write'], env, home);
  const token = got?.value?.token;
  if (got?.ok !== true || typeof token !== 'string' || token === '') throw new Failed(id, 'braindog token create minted no token', JSON.stringify(got?.refusals ?? null));
  SECRETS.add(token);
  return token;
}

/**
 * `braindog mcp` as an agent starts it, over standard input and output, answering each call in turn. The folder it runs
 * in is the scratch home, so the run it opens names no repository. Each call waits at most `DEADLINE.rpc`, and a child
 * that exits, cannot start or says a line that is not JSON fails the call waiting on it at once.
 */
async function mcp(id, cli, home, base, token, calls) {
  const child = track(spawn(process.execPath, [cli, 'mcp', '--agent', 'other'], { cwd: home, env: cliEnv(home, base, token), stdio: ['pipe', 'pipe', 'pipe'] }));
  let buf = '';
  let err = '';
  let gone = null;
  const waiting = new Map();
  const failAll = (why) => {
    gone ??= why;
    for (const w of waiting.values()) w.fail(why);
    waiting.clear();
  };
  child.on('error', (e) => failAll(`braindog mcp could not be run: ${e.message}`));
  child.on('close', (code, signal) => failAll(`braindog mcp exited (${signal ?? String(code)}) before it answered`));
  child.stdin.on('error', () => {
    /* the child is gone; its exit fails the call */
  });
  child.stderr.on('data', (d) => void (err += d));
  child.stdout.on('data', (d) => {
    buf += d;
    for (let at = buf.indexOf('\n'); at >= 0; at = buf.indexOf('\n')) {
      const line = buf.slice(0, at).trim();
      buf = buf.slice(at + 1);
      if (line === '') continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        failAll('braindog mcp said a line that is not JSON');
        return;
      }
      waiting.get(m.id)?.done(m);
      waiting.delete(m.id);
    }
  });
  let n = 0;
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      if (gone !== null) return reject(new Failed(id, `${gone} ${method}`, err));
      const at = ++n;
      const timer = setTimeout(() => {
        waiting.delete(at);
        reject(new Failed(id, `braindog mcp did not answer ${method} in ${secs(DEADLINE.rpc)}`, err));
      }, DEADLINE.rpc);
      waiting.set(at, {
        done: (m) => (clearTimeout(timer), resolve(m)),
        fail: (why) => (clearTimeout(timer), reject(new Failed(id, `${why} ${method}`, err))),
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: at, method, params })}\n`);
    });
  try {
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'from-clean', version: '1' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const out = [];
    for (const [method, params] of calls) {
      const m = await rpc(method, params);
      if (m.error || m.result?.isError) throw new Failed(id, `${method} was refused`, JSON.stringify(m.error ?? m.result?.structuredContent ?? m.result));
      out.push(m.result);
    }
    return out;
  } finally {
    child.kill('SIGKILL');
  }
}

/** `boot`, read as a resource: how many lists the record holds and how many rows are in them. */
async function boot(id, cli, home, base, token) {
  const [r] = await mcp(id, cli, home, base, token, [['resources/read', { uri: 'braindog:boot' }]]);
  const b = JSON.parse(r.contents[0].text);
  const rows = b.registers.reduce((sum, x) => sum + (x.count ?? 0), 0);
  return `${String(b.registers.length)} ${b.registers.length === 1 ? 'list' : 'lists'}, ${String(rows)} ${rows === 1 ? 'row' : 'rows'}`;
}

/** The row written: what the record calls it, read back by that name. */
async function write(id, cli, home, base, token) {
  const [made] = await mcp(id, cli, home, base, token, [['tools/call', { name: 'create', arguments: ROW }]]);
  const spoken = made.structuredContent?.spoken;
  if (typeof spoken !== 'string') throw new Failed(id, 'create answered no name for the row', JSON.stringify(made.structuredContent));
  return spoken;
}

/** The row read by its name, held to what was written. */
async function readBack(id, cli, home, base, token, spoken) {
  const [got] = await mcp(id, cli, home, base, token, [['tools/call', { name: 'get', arguments: { spoken } }]]);
  const doing = got.structuredContent?.fields?.doing;
  if (doing !== ROW.fields.doing) throw new Failed(id, `the row came back as ${JSON.stringify(doing)}, not as written`);
}

/** `export`, the wrapping key named by the record's own refusal as a person learns it, and what the file holds. */
function exportCopy(id, cli, home, base, serverKey, file) {
  const env = cliEnv(home, base, serverKey);
  let got = cliJson(id, cli, ['export', '-o', file], env, home);
  if (got.ok !== true) {
    const first = got.refusals?.[0];
    const kek = first?.code === 'WRONG_KEY' ? /wrapped by ([0-9a-f]{8,})/.exec(first.fix ?? '')?.[1] : undefined;
    if (kek === undefined) throw new Failed(id, 'the export was refused', JSON.stringify(got.refusals ?? null));
    got = cliJson(id, cli, ['export', '--kek', kek, '-o', file], env, home);
  }
  const v = got.value?.verified;
  if (got.ok !== true || !v) throw new Failed(id, 'the export was refused', JSON.stringify(got.refusals ?? null));
  return `${String(v.tables)} tables, ${String(v.rows)} rows`;
}

/** `verify` on this machine: the manifest whole and the signature valid. */
function verifyCopy(id, cli, home, file) {
  const got = cliJson(id, cli, ['verify', file], cliEnv(home, '', ''), home);
  if (got.ok !== true || got.value?.manifest !== 'ok' || got.value?.signature?.valid !== true)
    throw new Failed(id, 'the copy did not verify', JSON.stringify(got.refusals ?? got.value ?? null));
  return `${String(got.value.tables)} tables, ${String(got.value.rows)} rows, manifest ok, signature valid`;
}

/** The commit the copy is, as the CLI's build tuple names it: today in UTC and the short commit id. */
function buildTuple() {
  const sha = run('build the command', ['git', '-C', CHECKOUT, 'rev-parse', '--short=7', 'HEAD']).trim();
  return `${new Date().toISOString().slice(0, 10).replaceAll('-', '.')}+${sha}`;
}

/** The copy: `git archive HEAD` unpacked into the scratch, read only. Answers how many files it holds. */
function copyTree(dest) {
  mkdirSync(dest, { recursive: true });
  const archive = spawnSync('git', ['-C', CHECKOUT, 'archive', '--format=tar', 'HEAD'], { timeout: DEADLINE.step, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024 * 1024 });
  if (archive.error?.code === 'ETIMEDOUT') throw new Failed('copy', `git archive HEAD did not finish in ${secs(DEADLINE.step)}, so it was stopped`);
  if (archive.status !== 0) throw new Failed('copy', 'git archive HEAD failed', String(archive.stderr));
  run('copy', ['tar', '-x', '-C', dest], { input: archive.stdout });
  return run('copy', ['git', '-C', CHECKOUT, 'ls-tree', '-r', '--name-only', 'HEAD']).trim().split('\n').length;
}

/** README words for this machine: `node` is the Node running this check, so a second Node on the path is never used. */
const local = (argv) => (argv[0] === 'node' ? [process.execPath, ...argv.slice(1)] : argv);

/** The image a container run builds, never the README's own `braindog`, which may be a person's real one. */
export const IMAGE = 'braindog-from-clean';

/**
 * The Compose file laid over the README's, from the scratch folder and never written into the copy: this run's own image
 * name, and Docker's default bridge, which the workflow's outbound block (`-i docker0`) covers where a project network
 * would not be.
 */
export const OVERRIDE = `services:\n  braindog:\n    image: ${IMAGE}\n    network_mode: bridge\n`;

/**
 * The environment a README `docker compose` line runs in: the README's compose file and this run's override, a project
 * of its own (so the volume is `<project>_braindog`, never a person's `braindog`), and the port it publishes, on this
 * machine only, through the compose file's own `BRAINDOG_PORT`.
 */
export function composeEnv(env, { repo, override, project, port }) {
  return {
    ...env,
    COMPOSE_FILE: `${join(repo, 'docker-compose.yml')}${delimiter}${override}`,
    COMPOSE_PROJECT_NAME: project,
    BRAINDOG_PORT: `127.0.0.1:${String(port)}`,
  };
}

/** An `init <slug> --owner <email>` line as the restore: the same command, `--from` the copy in place of the owner. */
export function restoreWords(argv, file) {
  const at = argv.indexOf('init');
  if (at < 0 || argv[at + 1] === undefined) throw new Error('the README init line names no record, so there is nothing to restore into');
  return [...argv.slice(0, at + 2), '--from', file];
}

/* ── ONE RUN ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Run every step of `steps` in the scratch folder `dir`, one line each. Throws `Failed` at the first that fails. */
async function execute(steps, dir, { container, afterInstall, held }) {
  const repo = join(dir, 'repo');
  const home = join(dir, 'home');
  const copies = join(dir, 'copies');
  const logs = join(dir, 'logs');
  for (const d of [home, copies, logs]) mkdirSync(d, { recursive: true });
  /* WHERE THE SERVER KEEPS ITS KEK: a path handed to the server, never the key's bytes. */
  const kekFile = join(dir, 'data', 'kek');
  const cli = join(repo, 'apps', 'cli', 'dist', 'braindog.mjs');
  const file = join(copies, 'record.brainl');
  const serverKey = randomBytes(32).toString('base64url');
  SECRETS.add(serverKey);
  const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` };
  const project = `braindog-from-clean-${randomBytes(4).toString('hex')}`;
  const override = join(dir, 'compose.override.yml');
  const s = { base: '', token: '', spoken: '', initLine: '', startLine: '', children: [], containers: [], volumes: [`${project}_braindog`, `${project}-b`], compose: null };
  held.s = s;

  const serve = async (id, data, port) => {
    const out = join(logs, `${id.replaceAll(' ', '-')}.log`);
    writeFileSync(out, '');
    const child = track(
      spawn(local(words(s.startLine))[0], local(words(s.startLine)).slice(1), {
        cwd: repo,
        env: { ...env, BRAINDOG_DATA: data, BRAINDOG_KEK_FILE: kekFile, PORT: String(port), BRAINDOG_SERVER_KEY: serverKey },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
    let said = '';
    let failed = false;
    child.once('error', (e) => void ((failed = true), (said += `${e.message}\n`)));
    child.stdout.on('data', (d) => void (said += d));
    child.stderr.on('data', (d) => void (said += d));
    s.children.push(child);
    const base = `http://127.0.0.1:${String(port)}`;
    try {
      await healthy(id, base, () => !failed && child.exitCode === null && child.signalCode === null);
    } catch (e) {
      e.tail = scrub(said).split('\n').slice(-20).join('\n');
      throw e;
    }
    return base;
  };
  const docker = (id, argv, timeout = DEADLINE.docker) => run(id, argv, { cwd: repo, env, timeout });
  const boxHealthy = async (id, container, base) => {
    const until = Date.now() + DEADLINE.boxHealthy;
    while (Date.now() < until) {
      const state = docker(id, ['docker', 'inspect', '-f', '{{.State.Status}} {{.State.Health.Status}}', container], DEADLINE.inspect).trim();
      if (state === 'running healthy') return healthy(id, base, () => true, 30_000);
      if (!state.startsWith('running')) throw new Failed(id, `the container is ${state}`, run(id, ['docker', 'logs', container], { env, timeout: DEADLINE.inspect }));
      await sleep(2_000);
    }
    throw new Failed(id, `the container was not healthy in ${secs(DEADLINE.boxHealthy)}`);
  };

  for (const step of steps) {
    const { id, line } = step;
    switch (id) {
      case 'copy':
        say(id, `${String(copyTree(repo))} tracked files from git archive HEAD`);
        break;
      case 'install':
      case 'build the app':
      case 'readme line':
        run(id, local(words(line)), { cwd: repo, env, timeout: id === 'install' ? DEADLINE.install : DEADLINE.build });
        say(id, `ran the README line (${String(words(line).length)} words)`);
        break;
      case 'offline':
        run(id, ['sh', afterInstall], { env, timeout: DEADLINE.inspect });
        say(id, 'outbound calls blocked from here on');
        break;
      case 'build the command':
        run(id, ['pnpm', '--filter', 'braindog-cli', 'build'], { cwd: repo, env: { ...env, BRAINDOG_BUILD: buildTuple() }, timeout: DEADLINE.build });
        if (!existsSync(cli)) throw new Failed(id, 'the build wrote no braindog.mjs');
        say(id, '1 file, braindog.mjs');
        break;
      case 'env': {
        /* THE .env AS THE README SAYS TO FILL IT: the owner and the server key, and nothing else. */
        run(id, words(line), { cwd: repo, env });
        const envFile = join(repo, '.env');
        let text = readFileSync(envFile, 'utf8');
        for (const [key, value] of [['BRAINDOG_OWNER', OWNER], ['BRAINDOG_SERVER_KEY', serverKey]]) {
          const at = new RegExp(`^${key}=.*$`, 'm');
          if (!at.test(text)) throw new Failed(id, `the .env the README line made has no ${key}= line to set`);
          text = text.replace(at, `${key}=${value}`);
        }
        writeFileSync(envFile, text, { mode: 0o600 });
        say(id, '.env made, the owner and the server key set');
        break;
      }
      case 'up': {
        const port = await freePort();
        s.base = `http://127.0.0.1:${String(port)}`;
        writeFileSync(override, OVERRIDE);
        s.compose = composeEnv(env, { repo, override, project, port });
        run(id, words(line), { cwd: repo, env: s.compose, timeout: DEADLINE.image });
        const ps = run(id, ['docker', 'compose', 'ps', '-q', 'braindog'], { cwd: repo, env: s.compose, timeout: DEADLINE.inspect }).trim();
        if (ps === '') throw new Failed(id, 'docker compose up started no braindog container');
        s.containers.push(ps);
        say(id, '1 image built, 1 container');
        break;
      }
      case 'logs': {
        /* THE LOG SAYS WHERE THE ONE-TIME LINK IS, AND NEVER HOLDS IT: the link signs in as the owner, and a log is read
           by whoever ships it. */
        const said = run(id, words(line), { cwd: repo, env: s.compose, timeout: DEADLINE.docker });
        if (!/first time: a one-time sign-in link for \S+ is in \/data\/claim-link/.test(said))
          throw new Failed(id, 'the log does not say where the one-time link is', scrub(said));
        if (/#claim=/.test(said)) throw new Failed(id, 'the log holds the one-time link itself');
        say(id, 'the log names /data/claim-link and holds no link');
        break;
      }
      case 'claim': {
        /* AND THE FILE HOLDS IT, as the README's line reads it. Looked for and never said. */
        const said = run(id, words(line), { cwd: repo, env: s.compose, timeout: DEADLINE.docker });
        if (!/\/signin#claim=\S+/.test(said)) throw new Failed(id, '/data/claim-link holds no one-time link');
        say(id, 'the one-time link is in /data/claim-link');
        break;
      }
      case 'init':
        s.initLine = line;
        run(id, local(words(line)), { cwd: repo, env: { ...env, BRAINDOG_DATA: join(dir, 'data') } });
        say(id, '1 record, 1 owner');
        break;
      case 'start': {
        s.startLine = line;
        const port = await freePort();
        s.base = `http://127.0.0.1:${String(port)}`;
        await serve(id, join(dir, 'data'), port);
        say(id, '1 server, /healthz ok');
        break;
      }
      case 'healthy':
        await boxHealthy(id, s.containers[0], s.base);
        say(id, 'the health check is healthy, /healthz ok');
        break;
      case 'sign in':
      case 'sign in there':
        s.token = signIn(id, cli, home, s.base, serverKey);
        say(id, '1 write token, minted with the server key');
        break;
      case 'boot':
        say(id, await boot(id, cli, home, s.base, s.token));
        break;
      case 'write':
        s.spoken = await write(id, cli, home, s.base, s.token);
        say(id, '1 row written through braindog mcp');
        break;
      case 'read':
      case 'read there':
        await readBack(id, cli, home, s.base, s.token, s.spoken);
        say(id, '1 row read back as it was written');
        break;
      case 'export':
        say(id, exportCopy(id, cli, home, s.base, serverKey, file));
        break;
      case 'verify':
        say(id, verifyCopy(id, cli, home, file));
        break;
      case 'restore':
        if (!container) {
          run(id, local(restoreWords(words(s.initLine), file)), { cwd: repo, env: { ...env, BRAINDOG_DATA: join(dir, 'data2'), BRAINDOG_KEK_FILE: kekFile } });
        } else {
          /* THE CONTAINER READS THE COPY AS ITS OWN USER, so the file it is handed is one anybody may read, in a folder of
             its own; the key file is the first volume's, mounted read only, as an operator moving a record would. */
          chmodSync(copies, 0o755);
          chmodSync(file, 0o644);
          const mounts = ['-v', `${s.volumes[1]}:/data`, '-v', `${s.volumes[0]}:/old:ro`, '-v', `${copies}:/copy:ro`, '-e', 'BRAINDOG_KEK_FILE=/old/kek'];
          docker(id, ['docker', 'run', '--rm', ...mounts, IMAGE, ...restoreWords(words(line), '/copy/record.brainl')]);
        }
        say(id, '1 record restored into a second folder');
        break;
      case 'start the copy': {
        const port = await freePort();
        s.base = `http://127.0.0.1:${String(port)}`;
        if (!container) {
          await serve(id, join(dir, 'data2'), port);
          say(id, '1 server, /healthz ok');
          break;
        }
        /* THE IMAGE AS COMPOSE STARTS IT, by hand on the second volume: the same .env, this machine only. */
        const argv = ['docker', 'run', '-d', '-v', `${s.volumes[1]}:/data`, '-p', `127.0.0.1:${String(port)}:8080`, '--env-file', join(repo, '.env')];
        argv.push('-v', `${s.volumes[0]}:/old:ro`, '-e', 'BRAINDOG_KEK_FILE=/old/kek', IMAGE);
        s.containers.push(docker(id, argv).trim());
        say(id, '1 container');
        break;
      }
      case 'healthy there':
        await boxHealthy(id, s.containers[1], s.base);
        say(id, 'the health check is healthy, /healthz ok');
        break;
      default:
        throw new Failed(id, 'this check has no way to run that step');
    }
  }
  return s;
}

/** Everything a run started, stopped, and every volume it made, removed, each at most `DEADLINE.docker`. */
function tidy(s, container, keep) {
  for (const child of s?.children ?? []) child.kill();
  if (!container) return;
  const quiet = { stdio: 'ignore', timeout: DEADLINE.docker, killSignal: 'SIGKILL' };
  /* THE COMPOSE PROJECT FIRST, with its network and volume: its container restarts unless it is taken down. */
  if (s?.compose) spawnSync('docker', ['compose', 'down', '-v', '--remove-orphans'], { ...quiet, env: s.compose });
  for (const c of s?.containers ?? []) spawnSync('docker', ['rm', '-f', c], quiet);
  for (const v of s?.volumes ?? []) spawnSync('docker', ['volume', 'rm', '-f', v], quiet);
  /* AND THE IMAGE, so a run on somebody's own machine leaves no gigabyte behind. */
  if (!keep) spawnSync('docker', ['rmi', '-f', IMAGE], quiet);
}

/* ── THE COMMAND ────────────────────────────────────────────────────────────────────────────────────────────────── */

const USAGE = 'node apps/selfhost/test/from-clean.mjs [--container] [--dry] [--after-install <script>] [--keep]';

async function main(argv) {
  const known = new Set(['--container', '--dry', '--keep', '--after-install']);
  const bad = argv.find((a, i) => a.startsWith('--') && !known.has(a) && argv[i - 1] !== '--after-install');
  if (bad !== undefined) {
    process.stderr.write(`from-clean takes --container, --dry, --after-install <script> and --keep, and not ${bad}.\n${USAGE}\n`);
    return 2;
  }
  const container = argv.includes('--container');
  const at = argv.indexOf('--after-install');
  const afterInstall = at >= 0 ? argv[at + 1] : undefined;
  if (at >= 0 && (afterInstall === undefined || !existsSync(afterInstall))) {
    process.stderr.write('--after-install needs a script that exists, run once what needs the network is in.\n');
    return 2;
  }

  /* --dry READS THIS TREE'S README, the one a person is looking at; a run reads the copy's, the one it proves. */
  if (argv.includes('--dry')) {
    const steps = plan(readmeBlocks(readFileSync(join(CHECKOUT, 'README.md'), 'utf8')), { container, offline: afterInstall !== undefined });
    for (const { id, line } of steps) say(id, line ?? DOES[id] ?? '');
    say('steps', `${String(steps.length)}, nothing run`);
    return 0;
  }
  if (container && spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore', timeout: 30_000 }).status !== 0) {
    say('container', 'skipped: no docker');
    return 0;
  }

  const dir = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'braindog-from-clean-'));
  const held = {};
  const started = Date.now();
  let ok = false;
  try {
    /* THE PLAN IS MADE FROM THE COPY'S README, after the copy, so the lines run are the commit's own. */
    const repo = join(dir, 'repo');
    say('copy', `${String(copyTree(repo))} tracked files from git archive HEAD`);
    const steps = plan(readmeBlocks(readFileSync(join(repo, 'README.md'), 'utf8')), { container, offline: afterInstall !== undefined }).slice(1);
    await execute(steps, dir, { container, afterInstall, held });
    ok = true;
    say('done', `${String(steps.length + 1)} steps in ${String(Math.round((Date.now() - started) / 1000))} s`);
    return 0;
  } catch (e) {
    say('failed', e instanceof Error ? e.message : String(e));
    if (e?.tail) for (const l of e.tail.split('\n')) process.stdout.write(`  ${scrub(l)}\n`);
    return 1;
  } finally {
    tidy(held.s, container, argv.includes('--keep'));
    if (ok && !argv.includes('--keep')) rmSync(dir, { recursive: true, force: true });
    else say('scratch', ok ? 'kept, as --keep asked' : 'kept, to look at what failed');
  }
}

/* THE CHECK ALWAYS ENDS: a server or a call that outlives `tidy` is killed `DEADLINE.exit` after the run is over. */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
  setTimeout(() => {
    say('exit', `a process the run started was still running ${secs(DEADLINE.exit)} after it ended, so it was killed`);
    for (const child of LIVE) child.kill('SIGKILL');
    process.exit(process.exitCode === 0 ? 1 : process.exitCode);
  }, DEADLINE.exit).unref();
}
