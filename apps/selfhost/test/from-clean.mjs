#!/usr/bin/env node
/**
 * The self-host from a clean clone (LCH-C13 jobs 1 and 2, "The software stays self-hostable", D33.45): the README's own
 * lines, run in a scratch copy of the repository, and then the real `braindog` command built from the same tree.
 *
 *   node apps/selfhost/test/from-clean.mjs [--container] [--dry] [--after-install <script>] [--keep]
 *
 * THE LINES ARE READ OUT OF README.md, NEVER WRITTEN HERE, so the two cannot drift: the fenced block under "On your own
 * machine" and the one under "The container". A line changed there is the line run here; a line this check cannot place
 * (no install, no init, no start) is refused before anything runs. `<record name>` and `<your email>` are filled with an
 * invented record and owner; the container's name, volume, port and env file are this run's own, so a person's real
 * `braindog` volume is never touched.
 *
 * THE COPY IS `git archive HEAD`, read only. No worktree, no clone, nothing written to the repository: the copy is the
 * commit as a stranger would get it, and an untracked file on this machine cannot make it pass.
 *
 * THEN THE REAL COMMAND, `apps/cli/dist/braindog.mjs` built in the copy: a write token minted with the server key, `boot`,
 * one row written and read back over `braindog mcp`, `export` (the key it is wrapped by named by the record's own
 * refusal, as a person learns it), `verify`, `init --from` into a second folder, served, and the row read there.
 *
 * `--container` does the same through `docker build` and `docker run`, the image's health check healthy, and says
 * `skipped: no docker` where there is none. `--after-install <script>` runs that script once what needs the network is
 * in (the install, and the image build), so the workflow can block outbound calls there: a run that then fails needed
 * the Cloud by accident (the scope's risk). One line a step, counts only. A token, the server key and the inbound email
 * token never print: every line said is scrubbed of each secret this run made.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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
  return lines.slice(open + 1, close).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
}

/** The self-host's two blocks out of README.md's text. Throws one sentence when either is missing. */
export function readmeBlocks(text) {
  const lines = text.split('\n');
  const selfhost = fenceAfter(lines, /^\*\*On your own machine\.\*\*/);
  const container = fenceAfter(lines, /^#{2,4} The container\s*$/);
  if (selfhost === null) throw new Error('README.md has no sh block after **On your own machine.**, so there are no self-host lines to run.');
  if (container === null) throw new Error('README.md has no sh block under ### The container, so there are no container lines to run.');
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
  if (/^docker build\b/.test(line)) return 'image';
  if (/\bmain\.ts init\b/.test(line)) return 'init';
  if (/^docker run\b.*\s-d\b/.test(line) || /^node apps\/selfhost\/src\/main\.ts( serve)?$/.test(line)) return 'start';
  return 'other';
}

/** What a step that is not a README line does, for `--dry`. */
export const DOES = {
  copy: 'git archive HEAD, unpacked into a scratch folder',
  offline: 'the --after-install script: outbound calls blocked',
  'build the command': 'pnpm --filter braindog-cli build, the braindog command from the same commit',
  healthy: "the image's health check, until healthy",
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
      if (kind === 'clone' || kind === 'cd') continue;
      if (kind === 'init') steps.push({ id: 'build the command' });
      steps.push({ id: kind === 'other' ? 'readme line' : kind === 'build' ? 'build the app' : kind, line });
      if (kind === 'install' && offline) steps.push({ id: 'offline' });
    }
    for (const id of CALLS) steps.push({ id });
    steps.push({ id: 'start the copy' }, { id: 'sign in there' }, { id: 'read there' });
    return steps;
  }
  const box = kinds(blocks.container);
  for (const kind of ['image', 'init', 'start']) need(box, kind, 'container');
  steps.push({ id: 'install', line: own.find((l) => l.kind === 'install').line }, { id: 'build the command' });
  for (const { line, kind } of box) {
    steps.push({ id: kind === 'other' ? 'readme line' : kind, line });
    if (kind === 'image' && offline) steps.push({ id: 'offline' });
    if (kind === 'start') steps.push({ id: 'healthy' });
  }
  for (const id of CALLS) steps.push({ id });
  steps.push({ id: 'start the copy' }, { id: 'healthy there' }, { id: 'sign in there' }, { id: 'read there' });
  return steps;
}

/* ── RUNNING ────────────────────────────────────────────────────────────────────────────────────────────────────── */

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

/** Run a command to its end. Answers its stdout; throws `Failed` with its output on a non-zero exit. */
function run(id, argv, { cwd, env = process.env, input, timeout = 900_000 } = {}) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env, input, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
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

/** Wait for `/healthz` to answer ok, at most `ms`; `alive` says whether the server is still running. */
async function healthy(id, base, alive, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!alive()) throw new Failed(id, 'the server stopped before it answered');
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok && (await r.json()).ok === true) return;
    } catch {
      /* not listening yet */
    }
    await sleep(500);
  }
  throw new Failed(id, `${base}/healthz did not answer ok in ${String(ms / 1000)} s`);
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
  const r = spawnSync(process.execPath, [cli, ...args, '--json'], { cwd, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  const last = r.stdout.trim().split('\n').at(-1) ?? '';
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
 * in is the scratch home, so the run it opens names no repository.
 */
async function mcp(id, cli, home, base, token, calls) {
  const child = spawn(process.execPath, [cli, 'mcp', '--agent', 'other'], { cwd: home, env: cliEnv(home, base, token), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let err = '';
  const waiting = new Map();
  child.stderr.on('data', (d) => void (err += d));
  child.stdout.on('data', (d) => {
    buf += d;
    for (let at = buf.indexOf('\n'); at >= 0; at = buf.indexOf('\n')) {
      const line = buf.slice(0, at).trim();
      buf = buf.slice(at + 1);
      if (line === '') continue;
      const m = JSON.parse(line);
      waiting.get(m.id)?.(m);
      waiting.delete(m.id);
    }
  });
  let n = 0;
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const at = ++n;
      const timer = setTimeout(() => reject(new Failed(id, `braindog mcp did not answer ${method} in 60 s`, err)), 60_000);
      waiting.set(at, (m) => (clearTimeout(timer), resolve(m)));
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
    child.kill();
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
  const sha = run('build the command', ['git', '-C', ROOT, 'rev-parse', '--short=7', 'HEAD']).trim();
  return `${new Date().toISOString().slice(0, 10).replaceAll('-', '.')}+${sha}`;
}

/** The copy: `git archive HEAD` unpacked into the scratch, read only. Answers how many files it holds. */
function copyTree(dest) {
  mkdirSync(dest, { recursive: true });
  const archive = spawnSync('git', ['-C', ROOT, 'archive', '--format=tar', 'HEAD'], { maxBuffer: 2 * 1024 * 1024 * 1024 });
  if (archive.status !== 0) throw new Failed('copy', 'git archive HEAD failed', String(archive.stderr));
  run('copy', ['tar', '-x', '-C', dest], { input: archive.stdout });
  return run('copy', ['git', '-C', ROOT, 'ls-tree', '-r', '--name-only', 'HEAD']).trim().split('\n').length;
}

/** README words for this machine: `node` is the Node running this check, so a second Node on the path is never used. */
const local = (argv) => (argv[0] === 'node' ? [process.execPath, ...argv.slice(1)] : argv);

/** A README container line with this run's own image, volume, port and env file in place of the README's. */
export function dockerWords(line, { tag, volume, port, envFile }) {
  return words(line).map((w) =>
    w === 'braindog' ? tag
    : w.startsWith('braindog:') ? `${volume}${w.slice('braindog'.length)}`
    : w === 'braindog.env' ? envFile
    : /^\d+:8080$/.test(w) ? `127.0.0.1:${String(port)}:8080`
    : w,
  );
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
  const cli = join(repo, 'apps', 'cli', 'dist', 'braindog.mjs');
  const file = join(copies, 'record.brainl');
  const serverKey = randomBytes(32).toString('base64url');
  SECRETS.add(serverKey);
  const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` };
  const suffix = randomBytes(4).toString('hex');
  const box = { tag: 'braindog-from-clean', volume: `braindog-from-clean-${suffix}-a`, envFile: join(dir, 'braindog.env') };
  const s = { base: '', token: '', spoken: '', initLine: '', startLine: '', children: [], containers: [], volumes: [box.volume, `${box.volume.slice(0, -2)}-b`] };
  held.s = s;

  const serve = async (id, data, port) => {
    const out = join(logs, `${id.replaceAll(' ', '-')}.log`);
    writeFileSync(out, '');
    const child = spawn(local(words(s.startLine))[0], local(words(s.startLine)).slice(1), {
      cwd: repo,
      env: { ...env, BRAINDOG_DATA: data, BRAINDOG_KEK_FILE: join(dir, 'data', 'kek'), PORT: String(port), BRAINDOG_TOKEN: serverKey },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let said = '';
    child.stdout.on('data', (d) => void (said += d));
    child.stderr.on('data', (d) => void (said += d));
    s.children.push(child);
    const base = `http://127.0.0.1:${String(port)}`;
    try {
      await healthy(id, base, () => child.exitCode === null);
    } catch (e) {
      e.tail = scrub(said).split('\n').slice(-20).join('\n');
      throw e;
    }
    return base;
  };
  const docker = (id, argv) => run(id, argv, { cwd: repo, env, timeout: 1_800_000 });
  const boxHealthy = async (id, container, base) => {
    const until = Date.now() + 180_000;
    while (Date.now() < until) {
      const state = docker(id, ['docker', 'inspect', '-f', '{{.State.Status}} {{.State.Health.Status}}', container]).trim();
      if (state === 'running healthy') return healthy(id, base, () => true, 30_000);
      if (!state.startsWith('running')) throw new Failed(id, `the container is ${state}`, run(id, ['docker', 'logs', container], { env }));
      await sleep(2_000);
    }
    throw new Failed(id, 'the container was not healthy in 180 s');
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
        run(id, local(words(line)), { cwd: repo, env });
        say(id, `ran the README line (${String(words(line).length)} words)`);
        break;
      case 'offline':
        run(id, ['sh', afterInstall], { env });
        say(id, 'outbound calls blocked from here on');
        break;
      case 'build the command':
        run(id, ['pnpm', '--filter', 'braindog-cli', 'build'], { cwd: repo, env: { ...env, BRAINDOG_BUILD: buildTuple() } });
        if (!existsSync(cli)) throw new Failed(id, 'the build wrote no braindog.mjs');
        say(id, '1 file, braindog.mjs');
        break;
      case 'image':
        docker(id, dockerWords(line, { ...box, port: 0 }));
        say(id, '1 image built');
        break;
      case 'init':
        s.initLine = line;
        if (container) docker(id, dockerWords(line, { ...box, port: 0 }));
        else run(id, local(words(line)), { cwd: repo, env: { ...env, BRAINDOG_DATA: join(dir, 'data') } });
        say(id, '1 record, 1 owner');
        break;
      case 'start': {
        s.startLine = line;
        const port = await freePort();
        s.base = `http://127.0.0.1:${String(port)}`;
        if (!container) {
          await serve(id, join(dir, 'data'), port);
          say(id, '1 server, /healthz ok');
          break;
        }
        writeFileSync(box.envFile, `BRAINDOG_TOKEN=${serverKey}\nBRAINDOG_HOST=0.0.0.0\n`, { mode: 0o600 });
        s.containers.push(docker(id, dockerWords(line, { ...box, port })).trim());
        say(id, '1 container');
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
          run(id, local(restoreWords(words(s.initLine), file)), { cwd: repo, env: { ...env, BRAINDOG_DATA: join(dir, 'data2'), BRAINDOG_KEK_FILE: join(dir, 'data', 'kek') } });
        } else {
          /* THE CONTAINER READS THE COPY AS ITS OWN USER, so the file it is handed is one anybody may read, in a folder of
             its own; the key file is the first volume's, mounted read only, as an operator moving a record would. */
          chmodSync(copies, 0o755);
          chmodSync(file, 0o644);
          const argv = restoreWords(dockerWords(s.initLine, { ...box, volume: s.volumes[1], port: 0 }), '/copy/record.brainl');
          const image = argv.lastIndexOf(box.tag);
          argv.splice(image, 0, '-v', `${s.volumes[0]}:/old:ro`, '-v', `${copies}:/copy:ro`, '-e', 'BRAINDOG_KEK_FILE=/old/kek');
          docker(id, argv);
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
        const argv = dockerWords(s.startLine, { ...box, volume: s.volumes[1], port });
        argv.splice(argv.lastIndexOf(box.tag), 0, '-v', `${s.volumes[0]}:/old:ro`, '-e', 'BRAINDOG_KEK_FILE=/old/kek');
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

/** Everything a run started, stopped, and every volume it made, removed. */
function tidy(s, container, keep) {
  for (const child of s?.children ?? []) child.kill();
  if (!container) return;
  for (const c of s?.containers ?? []) spawnSync('docker', ['rm', '-f', c], { stdio: 'ignore' });
  for (const v of s?.volumes ?? []) spawnSync('docker', ['volume', 'rm', '-f', v], { stdio: 'ignore' });
  /* AND THE IMAGE, so a run on somebody's own machine leaves no gigabyte behind. */
  if (!keep) spawnSync('docker', ['rmi', '-f', 'braindog-from-clean'], { stdio: 'ignore' });
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
    const steps = plan(readmeBlocks(readFileSync(join(ROOT, 'README.md'), 'utf8')), { container, offline: afterInstall !== undefined });
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
