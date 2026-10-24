#!/usr/bin/env node
/**
 * What `attach` and `boot` cost the record itself, on a host on this machine shaped like his record: milliseconds of
 * the record's own time and the queries it asked, median of `--runs`, nobody's rows.
 *
 *   node tools/agent-bench/record-cost.mjs [--runs 5] [--json] [--prof <dir>]
 *
 * THE SHAPE IS THE START BENCH'S (`START_SHAPE`: 27 projects, 20 skills, 34 people, 300 runs, 35 questions waiting) and
 * a day of edits on top, two hundred over the last twenty-four hours, so the log a briefing reads since yesterday is as
 * long as his. The calls go through the host's own HTTP door, as the CLI's do, and each is timed where the record
 * answers it (`api.attach`, `api.boot`), so the network and the router are not in the number.
 *
 * EACH ATTACH IS A NEW SESSION, as each start hook's is: a run opened, which is a write, so nothing a read held for the
 * version before it stands. EACH BOOT FOLLOWS ONE EDIT, as a tab's does after a write elsewhere, for the same reason.
 * The answers are compared run to run, with what moves (the run's name, the clock) left out, so a change that made a
 * call faster by saying less shows here.
 */
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { Session } from 'node:inspector/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { startSeedHost } from '../door-check/seed-host.mjs';
import { growSeed, HIS } from './big-seed.mjs';

const { values } = parseArgs({ options: { runs: { type: 'string', default: '5' }, json: { type: 'boolean', default: false }, prof: { type: 'string' }, answers: { type: 'string' } } });
const RUNS = Number(values.runs);
const HOUR = 3_600_000;
/** The start bench's shape (`start-hook.mjs`, 23 Oct): 27 projects, 20 skills, 34 people, 300 runs, 35 questions waiting. */
const SHAPE = { ...HIS, things: 27, skills: 20, people: 34, session: 300, questions: 35 };

/* EVERY QUERY THE RECORD PREPARES, counted while a timed call runs. */
let queries = 0;
/* The timed call running now, whose queries `BENCH_SQL` counts. */
let calling = null;
const prepare = DatabaseSync.prototype.prepare;
/* `BENCH_SQL=1` ALSO COUNTS EACH QUERY'S TEXT, printed per call at the end, to find the ones asked most. */
const texts = process.env.BENCH_SQL === '1' ? new Map() : null;
DatabaseSync.prototype.prepare = function (...args) {
  queries++;
  if (texts && calling !== null) {
    const text = `${calling} ${String(args[0]).replace(/\s+/gu, ' ').slice(0, 150)}`;
    texts.set(text, (texts.get(text) ?? 0) + 1);
  }
  return prepare.apply(this, args);
};

const host = await startSeedHost({
  grow: (kernel) => {
    growSeed(kernel, SHAPE);
    const made = kernel.create('things', { name: 'Bench', lane: 'building', repos: ['https://github.com/bench/repo-0.git'] }, { actor: 'p_seed' });
    if (!made.ok) throw new Error(`no bench project: ${made.refusal?.fix ?? 'no reason'}`);
    /* A DAY OF EDITS: tasks and projects changed over the last day, each its own line of the log. */
    const now = Date.now();
    const tasks = kernel.count('tasks');
    const things = kernel.count('things');
    for (let i = 0; i < 200; i++) {
      const at = now - 24 * HOUR + i * 7 * 60_000;
      const out =
        i % 4 === 0
          ? kernel.backdate(at, () => kernel.update('things', `things#${1 + (i % things)}`, { about: `Edited on the day, ${i}` }, { actor: 'p_seed' }))
          : kernel.backdate(at, () => kernel.update('tasks', `tasks#${1 + (i % tasks)}`, { why: `Edited on the day, ${i}` }, { actor: 'p_seed' }));
      if (!out.ok) throw new Error(`no edit ${i}: ${out.refusal?.code} ${out.refusal?.fix}`);
    }
  },
});
const api = host.api;

/* TIMED WHERE THE RECORD ANSWERS: the method the host calls, wrapped, so the router and the network are not counted. */
const timed = [];
for (const name of ['attach', 'boot']) {
  const inner = api[name].bind(api);
  api[name] = async (...args) => {
    const q0 = queries;
    const t0 = performance.now();
    const c0 = process.cpuUsage();
    calling = name;
    const out = await inner(...args).finally(() => (calling = null));
    const cpu = process.cpuUsage(c0);
    timed.push({ name, ms: performance.now() - t0, cpu: (cpu.user + cpu.system) / 1000, queries: queries - q0 });
    return out;
  };
}

/* THE RECORD LEFT QUIET BEFORE EACH CALL: a write arms the drain, whose rules write lines of their own a moment later, and
   a call timed beside them is slower and reads a log in another order. */
const quiet = async () => {
  for (let i = 0, was = null; i < 60; i++) {
    await new Promise((done) => setTimeout(done, 250));
    const now = api.kernel.version();
    if (now === was) return;
    was = now;
  }
};
const post = async (path, bearer, body, headers = {}) =>
  (await fetch(`${host.base}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, ...headers }, body: JSON.stringify(body) })).json();

await quiet();
const made = await post('createToken', host.key, { scope: 'write', label: 'Record cost bench' });
if (made?.ok !== true) throw new Error(`no agent key: ${made?.refusal?.fix ?? 'no reason'}`);
const bearer = made.value.bearer;
const session = (id) => ({ 'x-braindog-client': id, 'x-braindog-agent': 'claude', 'x-braindog-host': 'bench-mac', 'x-braindog-repo': 'repo-0', 'x-braindog-remote': 'https://github.com/bench/repo-0.git' });

/* WHAT MOVES FROM ONE CALL TO THE NEXT, left out of the comparison: the run's own name and row, and the clock. */
const MOVES = new Set(['now', 'at', 'ts', 'id', 'spoken', 'session', 'started', 'last_seen', 'updated_at', 'created_at', 'opened_at', 'version', 'age', 'seconds', 'client_id', 'token_id', 'age_s', 'ran_s', 'rowid', 'upTo']);
/* AND THE NEWS'S OWN LINES, whose order is when the drain's rules wrote theirs beside the bench's writes: two runs of one
   tree list them in two orders. Their count stays. */
const steady = (value) =>
  JSON.stringify(value, (k, v) => (MOVES.has(k) ? undefined : k === 'events' && Array.isArray(v) ? v.length : typeof v === 'string' ? v.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/gu, '<when>').replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/gu, '<ulid>') : v));

const one = async (name, call) => {
  await quiet();
  const before = timed.length;
  const out = await call();
  if (out?.ok !== true) throw new Error(`${name} refused: ${out?.refusal?.code} ${out?.refusal?.fix}`);
  return { ...timed[before], answer: out.value };
};

let profiler = null;
if (values.prof) {
  profiler = new Session();
  profiler.connect();
  await profiler.post('Profiler.enable');
  await profiler.post('Profiler.start');
}

/* ONE OF EACH FIRST, as a host's first calls after it woke, then the timed ones. */
await one('attach', () => post('attach', bearer, { source: 'startup', client_id: randomUUID(), branch: 'master', head: 'abc1234' }, session(randomUUID())));
await one('boot', () => post('boot', host.key, {}));
const results = { attach: [], boot: [] };
let n = 0;
for (let i = 0; i < RUNS; i++) {
  const id = randomUUID();
  results.attach.push(await one('attach', () => post('attach', bearer, { source: 'startup', client_id: id, branch: 'master', head: 'abc1234' }, session(id))));
  await quiet();
  const edited = await post('update', host.key, { register: 'tasks', seq: 1, patch: { why: `Edited before boot ${n++}` } });
  if (edited?.ok !== true) throw new Error(`no edit: ${edited?.refusal?.code} ${edited?.refusal?.fix}`);
  results.boot.push(await one('boot', () => post('boot', host.key, {})));
}

if (profiler) {
  const { profile } = await profiler.post('Profiler.stop');
  mkdirSync(values.prof, { recursive: true });
  writeFileSync(join(values.prof, `record-cost-${Date.now()}.cpuprofile`), JSON.stringify(profile));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const report = {};
for (const [name, rs] of Object.entries(results)) {
  report[name] = {
    ms: Math.round(median(rs.map((r) => r.ms)) * 10) / 10,
    cpu: Math.round(median(rs.map((r) => r.cpu)) * 10) / 10,
    least: Math.round(Math.min(...rs.map((r) => r.ms)) * 10) / 10,
    queries: median(rs.map((r) => r.queries)),
    bytes: median(rs.map((r) => JSON.stringify(r.answer).length)),
    each: rs.map((r) => Math.round(r.cpu)),
  };
}
/* `--answers <file>` WRITES EVERY ANSWER, steadied, one a line, so two trees' can be compared with `diff`. */
if (values.answers) writeFileSync(values.answers, Object.entries(results).flatMap(([name, rs]) => rs.map((r) => `${name} ${steady(name === 'attach' ? r.answer.context : r.answer)}`)).join('\n') + '\n');
if (values.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else
  for (const [name, r] of Object.entries(report))
    console.log(`${name.padEnd(7)} ${String(r.ms).padStart(6)} ms (least ${String(r.least).padStart(5)})  ${String(r.cpu).padStart(6)} ms cpu  ${String(r.queries).padStart(5)} queries  ${String(r.bytes).padStart(7)} bytes  cpu each [${r.each.join(' ')}]`);
if (texts) for (const [text, n] of [...texts].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.error(String(n).padStart(6), text);
await host.close();
process.exit(0);
