#!/usr/bin/env node
/**
 * Checks that ask a real model, run by themselves (ENG-A03). The engine's included model, asked through Workers AI's
 * own address with a token, so what is measured is what the Worker ships and nothing else.
 *
 *   MODEL_CHECK_ACCOUNT=<account> MODEL_CHECK_TOKEN=<token> node tools/model-checks/run.mjs --small
 *
 *   --routes            one ask a routed name (`ROUTED` in `apps/worker/src/inference.ts`): served, schema taken, time,
 *                       tokens, and the provider's own words on a failure; and one ask through the production gateway
 *   --suite slash       Slash's thirty questions (`packages/slash/eval/run.ts --json`), scored against the bar
 *   --suite record      the twelve descriptions and the night's headlines (`packages/record/eval/run.ts --json`)
 *   --small             the routes and eight chosen cases (`SMALL` in `lib.mjs`); nothing named is the routes and both suites
 *   --changed <base>    run only when the diff from <base> touches a file in `watched.json`
 *   --max-neurons <n>   the most the run may spend; 20,000 for --small and 100,000 otherwise (22 cents and $1.10)
 *   --out <file>        where the report goes, `model-checks.json` by default
 *   --history <file>    last run's report, whose nights this one carries forward for the alarm
 *   --scheduled         this run is a night, and counts towards the alarm
 *   --set-baseline      write each measured suite's bar, its score less five points, where `baseline.json` has none
 *
 * THE TOKEN IS READ FROM THE ENVIRONMENT AND NEVER PRINTED, and the account is cut out of every message kept. With no
 * token the run says not-measured in one warning line, writes its report and exits 0: that is the default until the
 * owner sets the two names (DIRECTION 42). It exits 1 on `measured-below` alone, the only red.
 *
 * The rules are in `lib.mjs`; this file is the network and the files.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lib from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

let args;
try {
  args = lib.parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`model checks: ${e.message}`);
  process.exit(2);
}

const token = (process.env.MODEL_CHECK_TOKEN ?? '').trim();
const account = (process.env.MODEL_CHECK_ACCOUNT ?? '').trim();
const secrets = [token, account];
const unset = [token === '' ? 'MODEL_CHECK_TOKEN' : null, account === '' ? 'MODEL_CHECK_ACCOUNT' : null].filter((n) => n !== null);
const inActions = process.env.GITHUB_ACTIONS === 'true';
const warn = (line) => console.log(inActions ? `::warning title=model checks::${line}` : `warning: ${line}`);
const mode = args.small ? 'small' : 'full';
const at = new Date().toISOString();

/* ── --changed: only when a watched file moved ─────────────────────────────────────────────────────────────────────── */

if (args.changed !== null) {
  const watched = readJson(join(here, 'watched.json')).files;
  let files;
  try {
    files = execFileSync('git', ['diff', '--name-only', `${args.changed}...HEAD`], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    console.error(`model checks: could not read the diff from ${args.changed}; is it fetched?`);
    process.exit(2);
  }
  const touched = files.filter((f) => lib.watches(watched, f));
  if (touched.length === 0) {
    console.log(`model checks: nothing watched changed since ${args.changed}, so no model was asked`);
    writeFileSync(args.out, `${JSON.stringify({ at, mode, skipped: true, outcome: null }, null, 2)}\n`);
    process.exit(0);
  }
  console.log(`model checks: ${touched.length} watched file${touched.length === 1 ? '' : 's'} changed: ${touched.join(', ')}`);
}

/* ── what the Worker routes ────────────────────────────────────────────────────────────────────────────────────────── */

const { ROUTED } = await import(join(root, 'apps', 'worker', 'src', 'inference.ts'));
/** The routing name every template of the packages asks (`packages/slash/src/prompts.ts`, `INCLUDED_MODEL` in `apps/worker/src/slash.ts`). */
const INCLUDED = 'glm-5.3-flash';
const included = ROUTED.find((r) => r.name === INCLUDED) ?? ROUTED[0];

/** The production gateway's name, read from `wrangler.jsonc`: the last `AI_GATEWAY` there is the production environment's. */
const gatewayName = (() => {
  const all = [...readFileSync(join(root, 'apps', 'worker', 'wrangler.jsonc'), 'utf8').matchAll(/"AI_GATEWAY"\s*:\s*"([^"]+)"/gu)];
  return all.at(-1)?.[1] ?? null;
})();

const baselinePath = join(here, 'baseline.json');
const baseline = readJson(baselinePath);
const history = (() => {
  if (args.history === null || !existsSync(args.history)) return [];
  try {
    const prev = readJson(args.history);
    return Array.isArray(prev.history) ? prev.history : [];
  } catch {
    return [];
  }
})();

const report = { at, mode, models: ROUTED.map((r) => ({ name: r.name, provider: r.provider })), routes: [], gateway: null, suites: {}, neurons: { spent: 0, ceiling: args.maxNeurons } };

/* ── one ask of a route ────────────────────────────────────────────────────────────────────────────────────────────── */

/* A FIXED PROMPT THAT HOLDS NO PERSON'S CONTENT, under the top-level shape the Worker sends for the page headlines
   (`LINES` in `apps/worker/src/slash.ts`), the shape every record ask shares: one required key holding an object. */
const PROMPT = [
  { role: 'system', content: 'You check that a model answers. Answer with one JSON object and nothing else.' },
  { role: 'user', content: 'Write one calm sentence for a page named Bills saying that two bills are due this week. Answer as {"lines": {"bills": "<the sentence>"}}.' },
];
const SCHEMA = { type: 'object', properties: { lines: { type: 'object' } }, required: ['lines'] };
const MAX_TOKENS = 120;
/* THREE KNOBS FOR THE TESTS ALONE, so `test/outcomes.test.mjs` can stand a provider up on localhost and not wait 30
   seconds for a timeout: the address, how long one ask may take, and the first wait between tries (the second is four
   times it). Unset, they are Cloudflare's address, the host's own 30 seconds, and 2 then 8 seconds. */
const BASE = (process.env.MODEL_CHECK_BASE ?? '').replace(/\/+$/u, '') || 'https://api.cloudflare.com/client/v4';
const GATEWAY = process.env.MODEL_CHECK_BASE ? `${BASE}/gateway` : 'https://gateway.ai.cloudflare.com';
const TIMEOUT_MS = Number(process.env.MODEL_CHECK_TIMEOUT_MS) > 0 ? Number(process.env.MODEL_CHECK_TIMEOUT_MS) : 30_000;
const WAIT_MS = Number(process.env.MODEL_CHECK_WAIT_MS) > 0 ? Number(process.env.MODEL_CHECK_WAIT_MS) : 2_000;
const waits = { waits: [WAIT_MS, 4 * WAIT_MS] };

/** The `response_format` a row's shape takes, as `formatFor` in `inference.ts` builds it: one schema, two envelopes. */
const formatFor = (shape) => (shape === 'chat' ? { type: 'json_schema', json_schema: { name: 'answer', schema: SCHEMA, strict: true } } : { type: 'json_schema', json_schema: SCHEMA });

/**
 * The answer's text, token counts and whether it was cut off, read as `readAnswer` in `inference.ts` reads the row's shape:
 * `text` reads a string `response`, `chat` a string `content` and its `finish_reason`, and anything else is no text. The REST
 * envelope wraps `result`. Read more kindly than the Worker reads it, a route would pass here and fail every call there.
 */
function readAnswer(shape, body) {
  const r = body && typeof body === 'object' && 'result' in body ? body.result : body;
  const raw = shape === 'chat' ? r?.choices?.[0]?.message?.content : r?.response;
  const why = shape === 'chat' ? r?.choices?.[0]?.finish_reason : undefined;
  const u = r?.usage ?? {};
  const usage = { in: u.prompt_tokens ?? 0, out: u.completion_tokens ?? 0 };
  return { text: typeof raw === 'string' ? raw : '', usage, cutOff: typeof why === 'string' ? why === 'length' : usage.out > 0 && usage.out >= MAX_TOKENS };
}

/** Whether the text is the object the schema pins: JSON as it came, an object, `lines` an object. The top level, as the Worker checks it. */
const honoured = (text) => {
  try {
    const v = JSON.parse(text);
    return v !== null && typeof v === 'object' && v.lines !== null && typeof v.lines === 'object' && !Array.isArray(v.lines);
  } catch {
    return false;
  }
};

async function askOnce(route, url) {
  const started = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages: PROMPT, max_tokens: MAX_TOKENS, response_format: formatFor(route.shape) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const said = await res.text();
  const ms = Math.round(performance.now() - started);
  if (!res.ok) {
    const message = lib.scrub(`${res.status}: ${said}`, secrets);
    if (res.status === 429 || res.status >= 500) return { answered: false, said: message, ms };
    /* A TOKEN TURNED AWAY IS NOT THE ROUTE'S FAULT, and a night red for it would mail "below the bar" about a model nobody asked. */
    if (lib.refused(message)) return { answered: false, refused: true, said: message, ms };
    return { answered: true, served: !lib.unserved(message), strict: false, ms, said: message, usage: { in: 0, out: 0 } };
  }
  let body;
  try {
    body = JSON.parse(said);
  } catch {
    return { answered: true, served: true, strict: false, ms, said: lib.scrub(`not JSON: ${said}`, secrets), usage: { in: 0, out: 0 } };
  }
  const { text, usage, cutOff } = readAnswer(route.shape, body);
  if (cutOff) return { answered: true, served: true, strict: false, ms, said: `it stopped at the ${MAX_TOKENS}-token ceiling`, usage };
  const strict = honoured(text);
  return { answered: true, served: true, strict, ms, said: strict ? '' : lib.scrub(`the answer broke the schema: ${text}`, secrets), usage };
}

const restOf = (route) => `${BASE}/accounts/${account}/ai/run/${route.provider}`;
const gatewayOf = (route) => `${GATEWAY}/v1/${account}/${gatewayName}/workers-ai/${route.provider}`;

/** Whether the ceiling allows a spend of `n` more; when it does not, nothing is sent. */
const afford = (n) => report.neurons.spent + n <= args.maxNeurons;

async function checkRoutes() {
  for (const route of ROUTED) {
    const row = { name: route.name, provider: route.provider, shape: route.shape };
    if (!afford(lib.worst(route, PROMPT.map((m) => m.content).join(''), MAX_TOKENS))) {
      report.routes.push({ ...row, outcome: lib.NONE, reason: lib.CEILING });
      continue;
    }
    const got = await lib.tried(() => askOnce(route, restOf(route)), waits);
    const spent = got.answered ? lib.neurons(route, got.usage) : 0;
    report.neurons.spent += spent;
    report.routes.push({ ...row, outcome: lib.routeOutcome(got), ...(got.refused ? { refused: true } : {}), served: got.served ?? null, strict: got.strict ?? null, ms: got.ms ?? null, tokens: got.usage ?? null, neurons: spent, tries: got.tries, said: lib.scrub(got.said, secrets) });
  }
  /* THE GATEWAY ONCE, ON THE INCLUDED ROW: the Worker's every call goes through it, and a gateway that does not exist is
     one of the three causes ENG-A04 names. It is reported beside the routes and does not colour the run, because the
     token may lack the gateway's own permission while the binding has it. */
  if (gatewayName !== null && afford(lib.worst(included, PROMPT.map((m) => m.content).join(''), MAX_TOKENS))) {
    const got = await lib.tried(() => askOnce(included, gatewayOf(included)), waits);
    report.neurons.spent += got.answered ? lib.neurons(included, got.usage) : 0;
    report.gateway = { name: gatewayName, model: included.name, answered: got.answered, served: got.served ?? null, strict: got.strict ?? null, ms: got.ms ?? null, said: lib.scrub(got.said, secrets) };
  }
}

/* ── the two harnesses, in their own process ───────────────────────────────────────────────────────────────────────── */

/** The variables each harness reads, pointed at Workers AI's chat-completions address with the included model. */
const harnessEnv = (suite) => {
  const base = `${BASE}/accounts/${account}/ai/v1`;
  const p = suite === 'slash' ? 'SLASH_EVAL' : 'DRAFT_EVAL';
  return { ...process.env, [`${p}_PROVIDER`]: 'openai', [`${p}_URL`]: base, [`${p}_MODEL`]: included.provider, [`${p}_KEY`]: token };
};

/** One run of a harness with `--json`, and its score object, or `{ said }` with what it printed when it gave none. */
function harness(suite, only) {
  const file = join(root, 'packages', suite, 'eval', 'run.ts');
  const argv = [file, '--json', ...(only === null ? [] : ['--only', only.join(',')])];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { cwd: root, env: harnessEnv(suite), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let line = '';
    /* THE HARNESS'S LINES NAME THE ADDRESS IT ASKS, and the address holds the account, so they reach the log a whole line
       at a time with the token and the account cut out. */
    const hide = (text) => secrets.reduce((t, s) => (s.length >= 4 ? t.split(s).join('[hidden]') : t), text);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => {
      err += d;
      line += d;
      const done = line.lastIndexOf('\n') + 1;
      if (done > 0) process.stderr.write(hide(line.slice(0, done)));
      line = line.slice(done);
    });
    const killer = setTimeout(() => child.kill('SIGTERM'), 30 * 60 * 1000);
    child.on('close', () => {
      clearTimeout(killer);
      if (line !== '') process.stderr.write(`${hide(line)}\n`);
      const last = out.trim().split('\n').at(-1) ?? '';
      try {
        resolve({ score: JSON.parse(last) });
      } catch {
        resolve({ said: lib.scrub(err.trim().split('\n').slice(-3).join(' '), secrets) || 'the harness printed no score' });
      }
    });
  });
}

/** What a run of the harness spent: Slash counts its tokens; the record does not, so its worst is booked. */
const spentBy = (suite, score, asked) =>
  suite === 'slash' ? lib.neurons(included, { in: score.tokens?.in ?? 0, out: score.tokens?.out ?? 0 }) : asked * lib.WORST_CASE.record + 257;

async function checkSuite(suite) {
  const bar = baseline[suite]?.[mode] ?? null;
  let only = args.small ? [...lib.SMALL[suite]] : null;
  const per = lib.WORST_CASE[suite];
  const extra = suite === 'record' ? 257 : 0;
  const count = only?.length ?? lib.CASES[suite];
  const room = Math.floor((args.maxNeurons - report.neurons.spent - extra) / per);
  if (room <= 0) return { outcome: lib.NONE, reason: lib.CEILING, bar };
  if (room < count) only = (only ?? Array.from({ length: count }, (_, i) => i + 1)).slice(0, room);

  const cases = new Map();
  let first = null;
  for (let round = 0; round < 3; round++) {
    const open = [...cases.values()].filter((c) => lib.verdict(c.results) === 'more');
    if (round > 0 && open.length === 0) break;
    let asked = only;
    if (round > 0) {
      const ns = [...new Set(open.map((c) => c.n).filter((n) => n !== null))];
      asked = ns.length > 0 ? ns : [only?.[0] ?? 1];
    }
    const askedCount = asked?.length ?? count;
    if (round > 0 && !afford(askedCount * per + extra)) break;
    const got = await harness(suite, asked);
    if (!('score' in got)) {
      if (round === 0) return { outcome: lib.NONE, reason: 'harness', said: got.said, bar };
      break;
    }
    first ??= got.score;
    report.neurons.spent += spentBy(suite, got.score, askedCount);
    const openIds = new Set(open.map((c) => c.id));
    for (const c of got.score.cases) {
      if (round > 0 && !openIds.has(c.id)) continue;
      const kept = cases.get(c.id) ?? { id: c.id, n: c.n, results: [], said: '' };
      /* A CASE WITH A FAULT WAS NOT THE MODEL'S PASS, whatever the harness scored: the engine answers by its rules when the
         model does not, and an empty answer can be right by rules alone (Slash's question 29 cites nothing). So a fault
         is no answer when the provider was silent, and a failure when it said no. */
      const fault = c.fault ?? '';
      const result = fault === '' ? c.pass === true : lib.noAnswer(fault) || lib.refused(fault) ? null : false;
      kept.results.push(result);
      if (lib.refused(fault)) kept.refused = true;
      if (result !== true) kept.said = lib.scrub(fault || c.code || '', secrets);
      cases.set(c.id, kept);
    }
  }
  const settled = [...cases.values()].map((c) => {
    const v = lib.verdict(c.results);
    return { id: c.id, verdict: v === 'more' ? 'none' : v, tries: c.results.length, said: v === 'pass' ? '' : c.said };
  });
  const result = lib.suiteOutcome(settled, bar);
  if (result.outcome === lib.NONE && [...cases.values()].some((c) => c.refused)) result.reason = lib.REFUSED;
  const summary = suite === 'record' && first !== null ? { firstTry: first.firstTry, headlines: first.headlines, systemWords: first.systemWords } : first !== null ? { latency: first.latency } : {};
  return { ...result, ...summary, cases: settled };
}

/* ── the run ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

let reason = null;
if (token === '' || account === '') {
  reason = lib.NO_TOKEN;
  for (const r of args.routes ? ROUTED : []) report.routes.push({ name: r.name, provider: r.provider, shape: r.shape, outcome: lib.NONE, reason });
  for (const s of args.suites) report.suites[s] = { outcome: lib.NONE, reason, bar: baseline[s]?.[mode] ?? null };
} else {
  if (args.routes) await checkRoutes();
  for (const s of args.suites) report.suites[s] = await checkSuite(s);
}

const outcomes = [...report.routes.map((r) => r.outcome), ...Object.values(report.suites).map((s) => s.outcome)];
report.outcome = lib.overall(outcomes);
if (reason === null && report.outcome === lib.NONE) {
  const all = [...report.routes, ...Object.values(report.suites)].filter((x) => x.outcome === lib.NONE).map((x) => x.reason ?? (x.refused ? lib.REFUSED : lib.NO_ANSWER));
  reason = all.includes(lib.REFUSED) ? lib.REFUSED : all.includes(lib.NO_ANSWER) ? lib.NO_ANSWER : (all[0] ?? lib.NO_ANSWER);
}
report.reason = reason;
report.history = [...history, { at, mode, outcome: report.outcome, reason, scheduled: args.scheduled }].slice(-lib.KEPT);
report.alarm = lib.alarm(report.history);
writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);

/* ── what a reader sees: a line a route, a line a suite, and the verdict ───────────────────────────────────────────── */

/* WITH NO TOKEN THE WHOLE RUN IS ONE WARNING LINE, which is the default until the owner sets the two names. */
for (const r of reason === lib.NO_TOKEN ? [] : report.routes) {
  if (r.outcome === lib.NONE) console.log(`route ${r.name.padEnd(14)} ${r.outcome} (${r.reason ?? (r.refused ? lib.REFUSED : lib.NO_ANSWER)})${r.said ? `  (${r.said.slice(0, 160)})` : ''}`);
  else
    console.log(
      `route ${r.name.padEnd(14)} ${r.outcome}  ${r.provider}  served ${r.served ? 'yes' : 'no'}  schema ${r.strict ? 'taken' : 'not taken'}  ` +
        `${r.ms ?? '-'} ms  ${r.tokens?.in ?? 0} in ${r.tokens?.out ?? 0} out  ${r.neurons} neurons${r.said ? `  (${r.said.slice(0, 160)})` : ''}`,
    );
}
if (report.gateway !== null) {
  const g = report.gateway;
  console.log(`gateway ${g.name.padEnd(12)} ${g.answered ? (g.served && g.strict ? 'answered' : 'answered with a fault') : 'no answer'}  ${g.ms ?? '-'} ms${g.said ? `  (${g.said.slice(0, 160)})` : ''}`);
}
for (const [name, s] of reason === lib.NO_TOKEN ? [] : Object.entries(report.suites)) {
  const barSaid = s.bar === null ? 'no bar yet' : `bar ${s.bar}`;
  if (s.score === null || s.score === undefined) console.log(`suite ${name.padEnd(14)} ${s.outcome} (${s.reason ?? lib.NO_ANSWER})${s.said ? `  (${s.said.slice(0, 160)})` : ''}`);
  else console.log(`suite ${name.padEnd(14)} ${s.outcome}  ${s.score} of 100 over ${s.measured} of ${s.of} cases answered, ${barSaid}`);
}
const tail = `${report.neurons.spent} of ${report.neurons.ceiling} neurons`;
if (report.outcome === lib.NONE)
  warn(
    reason === lib.NO_TOKEN
      ? `not measured: ${unset.join(' and ')} ${unset.length === 1 ? 'is' : 'are'} not set, so no model was asked`
      : reason === lib.REFUSED
        ? `not measured: Workers AI turned MODEL_CHECK_TOKEN away, so check it is live and holds the Workers AI permission, ${tail}`
        : `not measured: the provider gave no answer${reason === lib.NO_ANSWER ? '' : ` (${reason})`}, ${tail}`,
  );
else console.log(`model checks: ${report.outcome}, ${mode} run, ${tail}`);
if (report.alarm !== null) console.log(`model checks: alarm, ${report.alarm.nights} nights ${report.alarm.why === 'below' ? 'below the bar' : 'not measured'} running`);

/* ── --set-baseline: the first full run less five points, where no bar is set; raising one is by hand ──────────────── */

if (args.setBaseline) {
  let wrote = false;
  for (const [name, s] of Object.entries(report.suites)) {
    if (typeof s.score !== 'number' || (baseline[name]?.[mode] ?? null) !== null) continue;
    baseline[name] = { ...(baseline[name] ?? {}), [mode]: Math.max(0, s.score - 5) };
    wrote = true;
    console.log(`baseline: ${name} ${mode} bar set to ${baseline[name][mode]}`);
  }
  if (wrote) {
    baseline.set = at.slice(0, 10);
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  }
}

process.exit(report.outcome === lib.BELOW ? 1 : 0);
