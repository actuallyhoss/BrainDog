#!/usr/bin/env node
/**
 * The agent bench: p50 and p95 per tool, and the size of each answer.
 *
 *   node tools/agent-bench/run.mjs                       the seed, in process (the default)
 *   node tools/agent-bench/run.mjs --host <url>          a host, through the CLI bridge; reads only
 *   node tools/agent-bench/run.mjs --runs 30 --json      more samples; the table as JSON
 *   node tools/agent-bench/run.mjs --big                 the seed grown to his record's size (`big-seed.mjs`)
 *   node tools/agent-bench/local-host.mjs                a host on this machine with that seed, through this tree's CLI
 *   node tools/agent-bench/run.mjs --profile <file>      a restored COPY of a record (see README; needs his approval)
 *
 * It never fails: a miss against targets.json is printed, and the exit code is 0 either way.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** The reads each tool is timed on. Every one is a read; nothing here writes. */
export const READS = [
  { label: 'context', name: 'context', args: () => ({}) },
  { label: 'context since', name: 'context', args: (s) => ({ since: s.stamp ?? 'v0' }) },
  { label: 'instructions', name: 'instructions', args: () => ({}) },
  { label: 'get', name: 'get', args: (s) => ({ spoken: s.row ?? 'tasks#1' }) },
  { label: 'list', name: 'list', args: () => ({ register: 'tasks', where: { field: 'state', is: 'open' }, limit: 10 }) },
  { label: 'search', name: 'search', args: () => ({ q: 'kiln' }) },
  { label: 'schema', name: 'schema', args: () => ({ register: 'tasks' }) },
  { label: 'record_index', name: 'record_index', args: () => ({}) },
  { label: 'governance', name: 'governance', args: () => ({}) },
];
const LISTS = ['tools/list', 'resources/list'];

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** Time `n` samples of one call (after one warm-up that is not counted). */
export async function sample(rpc, method, params, n) {
  await rpc(method, params);
  const ms = [];
  let bytes = 0;
  let refused = 0;
  for (let i = 0; i < n; i++) {
    const r = await rpc(method, params);
    ms.push(r.ms);
    bytes = r.bytes;
    if (r.refused) refused++;
  }
  ms.sort((a, b) => a - b);
  return { p50: percentile(ms, 50), p95: percentile(ms, 95), bytes, refused, n };
}

/** The stamp the answer carries, for the `since` read. */
const stampOf = (result) => result?._meta?.braindog?.stamp ?? null;

/**
 * A task the record holds, by its spoken id, for the `get` read, or `null` when the list named none.
 *
 * ASKED, NEVER ASSUMED. The bench read `tasks#1`, which his record deleted long ago: `get` was refused 30 times of 30
 * (24 Oct) and its time was a refusal's. The newest task the list answers is one that is there.
 */
export function rowOf(result) {
  const rows = result?.structuredContent?.rows;
  if (Array.isArray(rows)) for (const r of rows) if (typeof r?.spoken === 'string' && /^tasks#\d+$/u.test(r.spoken)) return r.spoken;
  const text = (result?.content ?? []).map((c) => c?.text ?? '').join('\n');
  return text.match(/\btasks#\d+\b/u)?.[0] ?? null;
}

export async function bench(rpc, { runs = 10 } = {}) {
  const rows = [];
  const first = await rpc('tools/call', { name: 'context', arguments: {} });
  const listed = await rpc('tools/call', { name: 'list', arguments: { register: 'tasks', limit: 1 } });
  const state = { stamp: stampOf(first.result), row: rowOf(listed.result) };
  for (const m of LISTS) rows.push({ label: m, ...(await sample(rpc, m, {}, runs)) });
  for (const r of READS) rows.push({ label: r.label, ...(await sample(rpc, 'tools/call', { name: r.name, arguments: r.args(state) }, runs)) });
  return rows;
}

export function misses(rows, targets) {
  const out = [];
  for (const r of rows) {
    const t = targets[r.label];
    if (!t) continue;
    if (r.p50 > t.p50) out.push(`${r.label}: p50 ${r.p50.toFixed(0)} over ${t.p50}`);
    if (r.p95 > t.p95) out.push(`${r.label}: p95 ${r.p95.toFixed(0)} over ${t.p95}`);
    if (t.bytes && r.bytes > t.bytes) out.push(`${r.label}: ${r.bytes} B over ${t.bytes} B`);
  }
  return out;
}

export function table(rows, targets) {
  const f = (n) => (n === null ? '-' : n.toFixed(1));
  const lines = ['call                p50 ms   p95 ms   bytes   target p50/p95   note'];
  for (const r of rows) {
    const t = targets[r.label];
    const note = [r.refused ? `${r.refused} refused` : '', t && (r.p50 > t.p50 || r.p95 > t.p95 || (t.bytes && r.bytes > t.bytes)) ? 'MISS' : ''].filter(Boolean).join(', ');
    lines.push(`${r.label.padEnd(18)} ${f(r.p50).padStart(7)}  ${f(r.p95).padStart(7)}  ${String(r.bytes).padStart(6)}   ${(t ? `${t.p50}/${t.p95}` : '-').padEnd(14)}   ${note}`);
  }
  return lines.join('\n');
}

/** A host through the CLI bridge: the stdio server `braindog mcp`, spoken to as a client would. Reads only. */
export function bridge({ cli, host, agent = 'claude' }) {
  const p = spawn(process.execPath, [cli, 'mcp', '--agent', agent, '--host', host], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  let buf = '';
  let n = 0;
  const waiting = new Map();
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.id !== undefined && waiting.has(m.id)) { waiting.get(m.id)(m, Buffer.byteLength(line)); waiting.delete(m.id); }
    }
  });
  p.stderr.on('data', () => {});
  const rpc = (method, params) => new Promise((res) => {
    const id = ++n;
    const t = performance.now();
    waiting.set(id, (m, bytes) => res({ ms: performance.now() - t, bytes, refused: Boolean(m.result?.isError || m.error), result: m.result }));
    p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const ready = rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'agent-bench', version: '1' } }).then(() => {
    p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  });
  return { rpc: async (m, a) => { await ready; return rpc(m, a); }, close: () => p.kill() };
}

function flags(argv) {
  const o = { runs: 10, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--approved') o.approved = true;
    else if (a === '--big') o.big = true;
    else if (['--host', '--runs', '--cli', '--agent', '--profile'].includes(a)) o[a.slice(2)] = argv[++i];
    else { console.error(`agent-bench: no such option ${a}`); process.exit(0); }
  }
  o.runs = Math.max(1, Number(o.runs) || 10);
  return o;
}

/**
 * `--profile <file>`: written, not run on his record. It opens a RESTORED COPY (never the live record), times
 * `context`, `record_index` and `governance` on it, and prints any `briefing:*` marks the record emitted through
 * `performance.mark`/`measure` while it ran. It refuses without `--approved`, which means he has said yes in the app
 * to restoring a copy. README.md says how the copy is made.
 */
export async function profile(file, { runs, approved }) {
  if (!approved) return { refused: 'a restored copy needs his approval in the app first; pass --approved once he has given it' };
  const { openBench } = await import('./seed.mjs');
  const { rpc, close } = await openBench({ file, seed: false });
  const rows = [];
  for (const name of ['context', 'record_index', 'governance']) {
    performance.clearMeasures();
    rows.push({ label: name, ...(await sample(rpc, 'tools/call', { name, arguments: {} }, runs)) });
  }
  const phases = {};
  for (const m of performance.getEntriesByType('measure')) if (m.name.startsWith('briefing:')) (phases[m.name] ??= []).push(m.duration);
  close();
  return { rows, phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length }])) };
}

async function main() {
  const o = flags(process.argv.slice(2));
  const targets = JSON.parse(readFileSync(join(HERE, 'targets.json'), 'utf8')).targets;
  let out;
  if (o.profile) {
    out = await profile(o.profile, o);
    console.log(out.refused ? `agent-bench: ${out.refused}` : `${table(out.rows, targets)}\n\nphases: ${JSON.stringify(out.phases)}`);
    return;
  }
  let rows;
  let where;
  if (o.host) {
    const cli = o.cli ?? process.env.CLI ?? join(homedir(), '.braindog', 'bin', 'braindog.mjs');
    const b = bridge({ cli, host: o.host, agent: o.agent });
    rows = await bench(b.rpc, o);
    b.close();
    where = `host ${o.host} through ${cli}`;
  } else {
    const { openBench } = await import('./seed.mjs');
    const { rpc, close } = await openBench({ big: o.big === true });
    rows = await bench(rpc, o);
    close();
    where = o.big ? 'the seed grown to his size, in process' : 'the seed, in process';
  }
  const miss = misses(rows, targets);
  if (o.json) console.log(JSON.stringify({ where, runs: o.runs, rows, misses: miss }, null, 1));
  else console.log(`agent-bench on ${where}, ${o.runs} samples each\n\n${table(rows, targets)}\n\n${miss.length ? `misses (${miss.length}):\n  ${miss.join('\n  ')}` : 'no misses'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (e) { console.error(`agent-bench: ${e instanceof Error ? e.message : e}`); }
  process.exit(0);
}
