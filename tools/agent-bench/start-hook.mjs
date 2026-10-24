#!/usr/bin/env node
/**
 * The start card's time, by phase, against a host on this machine: `braindog hook start` as Claude Code runs it, on a
 * record shaped like his, from a home that is nobody's.
 *
 *   pnpm --filter braindog-cli build
 *   node tools/agent-bench/start-hook.mjs [--runs 5] [--rtt 0] [--folder developer|repo] [--cli <file>] [--json] [--prof <dir>]
 *
 * WHY HERE AND NOT ON HIS RECORD. The start hook opens a run and its start work syncs skills and tools, so timing it on
 * his record writes to it. This starts the self-host in memory with the seed grown to his shape (`big-seed.mjs`), makes
 * one key with the seed's server key, and runs the command in a home under the system's temporary folder: its own
 * hosts file, `~/.braindog`, Claude config with twenty skills and eight servers, and a `Developer` folder of thirty
 * repositories, as his starts mostly begin in one. NOTHING OF THIS MACHINE'S OWN IS READ OR WRITTEN: `HOME`,
 * `XDG_CONFIG_HOME` and `CLAUDE_CONFIG_DIR` point inside that folder, the environment is built from nothing but `PATH`,
 * and the folder is removed after.
 *
 * `--rtt` holds each request that long at a front of its own before the record sees it, so a local run can stand in
 * for brain.dog's round trip (about 90 ms from his Mac).
 *
 * WHAT IT SAYS. One warm-up start (it fills Node's compile cache and the day's checks, as his first start of a day
 * does), then `--runs` new sessions, each a `startup` with an id of its own. For each, the phases the hook marks with
 * `BRAINDOG_HOOK_TRACE=1` (`apps/cli/src/hook-trace.ts`), the card on stdout, and the process's exit, which is what
 * Claude Code's `durationMs` counts. Medians over the runs. Every run's card is checked to be the first one's, so a
 * change that made it faster by saying less shows here.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';

import { startSeedHost } from '../door-check/seed-host.mjs';
import { growSeed, HIS } from './big-seed.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '5' },
    rtt: { type: 'string', default: '0' },
    folder: { type: 'string', default: 'developer' },
    cli: { type: 'string', default: join(HERE, '..', '..', 'apps', 'cli', 'dist', 'braindog.mjs') },
    json: { type: 'boolean', default: false },
    prof: { type: 'string' },
  },
});
const RUNS = Number(values.runs);
const RTT = Number(values.rtt);

/** His shape for the start (23 Oct): 27 projects, 20 skills, 34 people, 300 runs, 35 questions waiting. */
export const START_SHAPE = { ...HIS, things: 27, skills: 20, people: 34, session: 300, questions: 35 };

const git = (cwd, ...args) => spawnSync('git', args, { cwd, stdio: 'ignore', env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: '1' } });

/** The home: hosts file, Claude's config with skills and servers, and a folder of repositories. */
function makeHome(base, token) {
  const home = mkdtempSync(join(tmpdir(), 'braindog-start-bench-'));
  mkdirSync(join(home, '.config', 'braindog'), { recursive: true, mode: 0o700 });
  const expires = new Date(Date.now() + 30 * 86_400_000).toISOString();
  writeFileSync(join(home, '.config', 'braindog', 'hosts.json'), `${JSON.stringify({ default: base, hosts: { [base]: { token: { value: token, expires } } } }, null, 2)}\n`, { mode: 0o600 });
  const claude = join(home, '.claude');
  for (let i = 1; i <= 20; i++) {
    const dir = join(claude, 'skills', `bench-skill-${i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: bench-skill-${i}\ndescription: A skill for the start bench, number ${i}.\n---\n\n# Bench skill ${i}\n\n${'Do the thing well. '.repeat(40)}\n`);
  }
  const servers = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`bench-${i + 1}`, { command: 'node', args: [`/nowhere/server-${i + 1}.mjs`] }]));
  writeFileSync(join(claude, '.claude.json'), `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`);
  writeFileSync(join(home, '.claude.json'), `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`);
  const dev = join(home, 'Developer');
  for (let i = 0; i < 30; i++) {
    const repo = join(dev, `repo-${i}`);
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, 'README.md'), `repo ${i}\n`);
    git(repo, 'init', '-q', '-b', 'master');
    git(repo, 'remote', 'add', 'origin', `https://github.com/bench/repo-${i}.git`);
    git(repo, 'add', '.');
    git(repo, '-c', 'user.name=Bench', '-c', 'user.email=bench@bench.example', 'commit', '-q', '-m', `Start repo ${i}`);
  }
  return { home, cwd: values.folder === 'repo' ? join(dev, 'repo-0') : dev, claude };
}

/** A front that holds each request `rtt` ms, then forwards it, so a local host costs a far one's round trip. It also
 * counts what each start asked before its process ended. */
const seen = [];
async function slowFront(inner, rtt) {
  const front = createServer(async (req, res) => {
    seen.push({ at: performance.now(), path: new URL(req.url ?? '/', 'http://x').pathname });
    if (rtt > 0) await new Promise((done) => setTimeout(done, rtt));
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!['host', 'connection', 'content-length', 'transfer-encoding'].includes(k) && v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req);
    try {
      const got = await fetch(`${inner}${req.url}`, { method: req.method, headers, body, duplex: 'half', redirect: 'manual' });
      const out = {};
      got.headers.forEach((v, k) => {
        if (!['connection', 'transfer-encoding', 'content-encoding', 'content-length'].includes(k)) out[k] = v;
      });
      res.writeHead(got.status, out);
      res.end(Buffer.from(await got.arrayBuffer()));
    } catch {
      res.writeHead(502).end();
    }
  });
  await new Promise((done) => front.listen(0, '127.0.0.1', done));
  return { base: `http://localhost:${front.address().port}`, close: () => new Promise((done) => front.close(() => done())) };
}

/** One start: the card, the trace, when the card came and when the process ended. */
function oneStart(cli, env, cwd, id = randomUUID()) {
  const event = JSON.stringify({ session_id: id, transcript_path: join(cwd, 'none.jsonl'), cwd, hook_event_name: 'SessionStart', source: 'startup' });
  return new Promise((done) => {
    const t0 = performance.now();
    let first = null;
    let out = '';
    let err = '';
    const child = spawn(process.execPath, [...(values.prof ? ['--cpu-prof', '--cpu-prof-dir', values.prof] : []), cli, 'hook', 'start'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => {
      first ??= performance.now() - t0;
      out += d;
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('close', () => {
      const exit = performance.now() - t0;
      const line = /braindog-hook-trace (\{.*\})/u.exec(err)?.[1];
      const asked = seen.filter((r) => r.at >= t0 && r.at <= t0 + exit).map((r) => r.path);
      done({ id, card: out, printed: first, exit, asked, trace: line ? JSON.parse(line) : null });
    });
    child.stdin.end(event);
  });
}

/** The phases, each its own span, from the marks (each since the process started). */
function phases(r) {
  const t = r.trace ?? {};
  const span = (a, b) => (t[a] !== undefined && t[b] !== undefined ? t[b] - t[a] : null);
  return {
    'node start': t.node ?? null,
    'module load': span('node', 'loaded'),
    'stdin + auth': span('loaded', 'auth'),
    'git + device': span('auth', 'position'),
    attach: span('position', 'attach'),
    'ahead re-read': span('attach', 'ahead'),
    'card render': span('ahead', 'card'),
    'start work (owed, spawn)': span('card', 'owed'),
    'hook mark': span('owed', 'marked'),
    'day checks (behind)': span('returned', 'behind'),
    'card printed': r.printed,
    'printed to exit': r.printed === null ? null : r.exit - r.printed,
    'exit (durationMs)': r.exit,
    requests: r.asked.length,
  };
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return s.length === 0 ? null : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const began = performance.now();
/* AND ONE PROJECT THAT LISTS THE FIRST REPOSITORY, so a start there is placed and handed its step, as his are. */
const host = await startSeedHost({
  grow: (kernel) => {
    growSeed(kernel, START_SHAPE);
    const made = kernel.create('things', { name: 'Bench', lane: 'building', repos: ['https://github.com/bench/repo-0.git'] }, { actor: 'p_seed' });
    if (!made.ok) throw new Error(`no bench project: ${made.refusal?.fix ?? 'no reason'}`);
  },
});
const made = await (
  await fetch(`${host.base}/api/createToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${host.key}` },
    body: JSON.stringify({ scope: 'write', label: 'Start hook bench' }),
  })
).json();
if (made?.ok !== true || typeof made.value?.bearer !== 'string') throw new Error(`no agent key: ${made?.refusal?.fix ?? 'no reason'}`);
const front = await slowFront(host.base, RTT);
const { home, cwd, claude } = makeHome(front.base, made.value.bearer);
const env = {
  PATH: process.env.PATH,
  HOME: home,
  TMPDIR: join(home, 'tmp'),
  XDG_CONFIG_HOME: join(home, '.config'),
  CLAUDE_CONFIG_DIR: claude,
  NODE_COMPILE_CACHE: join(home, '.braindog', 'cache', 'node'),
  BRAINDOG_AGENT: 'claude',
  BRAINDOG_HOOK_TRACE: '1',
  LANG: 'en_US.UTF-8',
};
mkdirSync(env.TMPDIR, { recursive: true });
console.error(`start bench: host at ${front.base} (rtt ${RTT} ms), seeded in ${Math.round(performance.now() - began)} ms, folder ${values.folder}`);

const settle = async () => {
  /* Quiet first: no request at the front for a second and a half, so the work a start left has finished. */
  for (let i = 0; i < 300 && seen.length > 0 && performance.now() - seen[seen.length - 1].at < 1_500; i++) await new Promise((done) => setTimeout(done, 100));
  /* The start work a hook left runs in a process of its own; let it finish so the next start is not timed beside it. */
  const dir = join(home, '.config', 'braindog', 'sessions');
  for (let i = 0; i < 100; i++) {
    let left = [];
    try {
      left = readdirSync(dir).filter((f) => f.startsWith('later-'));
    } catch {}
    if (left.length === 0) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  await new Promise((done) => setTimeout(done, 1_500));
};

let code = 0;
try {
  const warm = await oneStart(values.cli, env, cwd);
  await settle();
  /* IN A REPOSITORY, A STEP LEFT BEHIND ITS HEAD, as his usually is: the warm-up run hands off at the first commit and
     three commits land after it, so every start's card says "3 commits since" and the hook counts them. */
  if (values.folder === 'repo') {
    const first = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).stdout.trim();
    const handed = await (
      await fetch(`${front.base}/api/handoff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${made.value.bearer}`, 'x-braindog-client': warm.id, 'x-braindog-agent': 'claude' },
        body: JSON.stringify({ next: 'Run the start bench again after the three commits', head: first, state: 'handoff' }),
      })
    ).json();
    if (handed?.ok !== true) throw new Error(`no handoff: ${handed?.refusal?.fix ?? 'no reason'}`);
    for (let i = 1; i <= 3; i++) {
      writeFileSync(join(cwd, `step-${i}.md`), `step ${i}\n`);
      git(cwd, 'add', '.');
      git(cwd, '-c', 'user.name=Bench', '-c', 'user.email=bench@bench.example', 'commit', '-q', '-m', `Step ${i}`);
    }
  }
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    runs.push(await oneStart(values.cli, env, cwd));
    await settle();
  }
  /* THE CARDS COMPARED, the run line left out since it names the run. Each start's own work files rows (a skills sync
     proposes), so a card's Waiting count may move from one start to the next; the card's words are held by the CLI's
     start hook tests (`apps/cli/test/hooks.test.ts`), not here. */
  const body = (card) => card.split('\n').slice(1).join('\n');
  const differ = runs.filter((r) => body(r.card) !== body(runs[0].card)).length;
  const table = phases(runs[0]);
  const med = Object.fromEntries(Object.keys(table).map((k) => [k, median(runs.map((r) => phases(r)[k]))]));
  const result = { rtt: RTT, folder: values.folder, runs: RUNS, warmup: phases(warm), median: med, each: runs.map(phases), card: runs[0].card, cards_differ: differ };
  if (values.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    console.log(`warm-up exit ${Math.round(warm.exit)} ms`);
    for (const [k, v] of Object.entries(med)) console.log(`${k.padEnd(26)} ${v === null ? '-' : `${Math.round(v)} ms`}   [${runs.map((r) => (phases(r)[k] === null ? '-' : Math.round(phases(r)[k]))).join(' ')}]`);
    console.log(`cards that differ from the first: ${differ}; asked: ${runs[0].asked.join(' ')}`);
    console.log('--- card ---');
    console.log(runs[0].card);
  }
} finally {
  await front.close();
  await host.close();
  rmSync(home, { recursive: true, force: true });
}
process.exit(code);
