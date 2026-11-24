#!/usr/bin/env node
/**
 * Checks that ask a real model, run by themselves. The engine's included model, asked through Workers AI's
 * own address with a token, so what is measured is what the Worker ships and nothing else.
 *
 *   MODEL_CHECK_ACCOUNT=<account> MODEL_CHECK_TOKEN=<token> node tools/model-checks/run.mjs --small
 *
 *   --routes            one ask a routed name (`ROUTED` in `apps/worker/src/inference.ts`): served, schema taken, time,
 *                       tokens, and the provider's own words on a failure; and one ask through the production gateway
 *   --steps             one real ask of each routed name on each of Slash's routes, streamed so the first byte is timed:
 *                       answer (a chat step that must call the right tool, one that must fill a tool's args, one that must
 *                       answer from a result), compose (the page headline) and small (a digest's prose)
 *   --model <name>      the routed name the suites ask; the included model (`INCLUDED_MODEL`) by default
 *   --only <a,b>        only these routed names for --routes and --steps
 *   --suite slash       Slash's thirty questions (`packages/slash/eval/run.ts --json`), scored against the bar
 *   --suite record      the seventeen descriptions and the night's headlines (`packages/record/eval/run.ts --json`)
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
 * owner sets the two names. It exits 1 on `measured-below` alone, the only red.
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

/* AND THE WORKER'S OWN REQUEST (`inputsFor`): the messages, the ceiling a reasoning row is raised to, the schema's envelope
   and the row's knobs, so a check asks a model exactly as a real call does. */
const { ROUTED, INCLUDED_MODEL, REASONING_ROOM, inputsFor, ceilingFor } = await import(join(root, 'apps', 'worker', 'src', 'inference.ts'));
/** The routing name every template of the packages asks (`INCLUDED_MODEL`, `@braindog/ports`), or the one `--model` names. */
const INCLUDED = args.model ?? INCLUDED_MODEL;
const included = ROUTED.find((r) => r.name === INCLUDED) ?? ROUTED[0];
if (args.model !== null && included.name !== args.model) {
  console.error(`model checks: --model ${args.model} is not a routed name; the routed names are ${ROUTED.map((r) => r.name).join(', ')}`);
  process.exit(2);
}
/** The routed rows `--routes` and `--steps` ask: every one, or those `--only` names. */
const asked = args.only === null ? ROUTED : ROUTED.filter((r) => args.only.includes(r.name));

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

const report = { at, mode, models: ROUTED.map((r) => ({ name: r.name, provider: r.provider })), routes: [], steps: [], gateway: null, suites: {}, neurons: { spent: 0, ceiling: args.maxNeurons } };

/* ── one ask of a route ────────────────────────────────────────────────────────────────────────────────────────────── */

/* A FIXED PROMPT THAT HOLDS NO PERSON'S CONTENT, under the top-level shape the Worker sends for the page headlines
   (`LINES` in `apps/worker/src/slash.ts`), the shape every record ask shares: one required key holding an object. */
const PROMPT = [
  { role: 'system', content: 'You check that a model answers. Answer with one JSON object and nothing else.' },
  { role: 'user', content: 'Write one calm sentence for a page named Bills saying that two bills are due this week. Answer as {"lines": {"bills": "<the sentence>"}}.' },
];
const SCHEMA = { type: 'object', properties: { lines: { type: 'object' } }, required: ['lines'] };
/* THE LEAST CEILING A REAL CALL IS SENT (`REASONING_ROOM`). It was 120, which no real call asks for, and the engine's probe
   at 16 read a model that reasons as broken while it answered every ask. */
const MAX_TOKENS = REASONING_ROOM;
/* THREE KNOBS FOR THE TESTS ALONE, so `test/outcomes.test.mjs` can stand a provider up on localhost and not wait 30
   seconds for a timeout: the address, how long one ask may take, and the first wait between tries (the second is four
   times it). Unset, they are Cloudflare's address, the host's own 30 seconds, and 2 then 8 seconds. */
const BASE = (process.env.MODEL_CHECK_BASE ?? '').replace(/\/+$/u, '') || 'https://api.cloudflare.com/client/v4';
const GATEWAY = process.env.MODEL_CHECK_BASE ? `${BASE}/gateway` : 'https://gateway.ai.cloudflare.com';
const TIMEOUT_MS = Number(process.env.MODEL_CHECK_TIMEOUT_MS) > 0 ? Number(process.env.MODEL_CHECK_TIMEOUT_MS) : 30_000;
const WAIT_MS = Number(process.env.MODEL_CHECK_WAIT_MS) > 0 ? Number(process.env.MODEL_CHECK_WAIT_MS) : 2_000;
const waits = { waits: [WAIT_MS, 4 * WAIT_MS] };

/**
 * The answer's text, token counts and whether it was cut off, read as `readAnswer` in `inference.ts` reads the row's shape:
 * `text` reads a string `response`, `chat` a string `content` and its `finish_reason`, and anything else is no text. The REST
 * envelope wraps `result`. Read more kindly than the Worker reads it, a route would pass here and fail every call there.
 */
function readAnswer(route, body) {
  const shape = route.shape;
  const r = body && typeof body === 'object' && 'result' in body ? body.result : body;
  const raw = shape === 'chat' ? r?.choices?.[0]?.message?.content : r?.response;
  const why = shape === 'chat' ? r?.choices?.[0]?.finish_reason : undefined;
  const u = r?.usage ?? {};
  const usage = { in: u.prompt_tokens ?? 0, out: u.completion_tokens ?? 0 };
  return { text: typeof raw === 'string' ? raw : '', usage, cutOff: typeof why === 'string' ? why === 'length' : usage.out > 0 && usage.out >= ceilingFor(route, MAX_TOKENS) };
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
    /* THE WORKER'S OWN REQUEST (`inputsFor`): its ceiling, its envelope, the row's `reasoning_effort` and `thinks: false`,
       so the check asks as the Worker asks and a model that reasons is not read as cut off for a ceiling nobody sends. */
    body: JSON.stringify(inputsFor(route, { messages: PROMPT, maxTokens: MAX_TOKENS, schema: SCHEMA })),
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
  const { text, usage, cutOff } = readAnswer(route, body);
  if (cutOff) return { answered: true, served: true, strict: false, ms, said: `it stopped at the ${ceilingFor(route, MAX_TOKENS)}-token ceiling`, usage };
  const strict = honoured(text);
  return { answered: true, served: true, strict, ms, said: strict ? '' : lib.scrub(`the answer broke the schema: ${text}`, secrets), usage };
}

const restOf = (route) => `${BASE}/accounts/${account}/ai/run/${route.provider}`;
const gatewayOf = (route) => `${GATEWAY}/v1/${account}/${gatewayName}/workers-ai/${route.provider}`;

/** Whether the ceiling allows a spend of `n` more; when it does not, nothing is sent. */
const afford = (n) => report.neurons.spent + n <= args.maxNeurons;

async function checkRoutes() {
  for (const route of asked) {
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

/* ── one ask of each of Slash's routes ─────────────────────────────────────────────────────────────────────────────── */

/* THE CONVERSATION'S OWN SYSTEM TEXT AND SCHEMA (`packages/slash/src/prompts.ts`), so a step is asked as the bar asks it.
   The record is a fixed one with no person's content: the day the seed's clock stands at, five lists and the tools the
   bar offers, as `promptOf` in `packages/slash/src/chat.ts` lays them out. */
const { CHAT_SYSTEM, PROMPTS } = await import(join(root, 'packages', 'slash', 'src', 'prompts.ts'));
const TOOL_LINES = [
  'figures(words): Totals BrainDog works out, each with its value now. Use for any money or count question: "cash", "runway", "spent this month", "spent last month", "owed to you", "late payables", "renews"',
  'today(): What is late, due today, stopped or waiting on them',
  'search(q): Find rows by a name or one or two key words, in every list: "Ada", "Analytics", "rent". Not a whole sentence',
  'open(id): One row whole, by its id (tasks#3) or its name; or one figure by its id (cash-now)',
  'list(list, where?, limit?): Rows of one list, newest first. where filters by field ids: {"field":"state","is":"open"}. Tests: is, not, in, gt, lt, before, after, contains',
  'lists(list): One list\'s fields: their ids and the values they take, for list\'s where, add and change',
  'changes(about?, since?): What changed lately and who changed it',
  'waiting(): The questions waiting for their answer in Decide',
  'add(list, fields): Add a row: the list id and its fields by field id, days as YYYY-MM-DD, money as a plain number (25.50). add("tasks", {"what":"Call the bank","due":"2026-11-02"})',
  'change(id, fields): Change fields of one row by its id: change("tasks#3", {"state":"done"})',
  'draft(what, page?): Draft a new page, a change to a page, or an automation from what they described; it waits for them in Decide',
  'go(to): Take them to a page, a list, a row, or to decide, inbox, automations, settings or agents',
];
const TOOL_NAMES = new Set(TOOL_LINES.map((l) => l.slice(0, l.indexOf('('))));
const stepPrompt = (said, done) =>
  [
    'Today is Thursday 3 September 2026. Tomorrow is Friday 4 September 2026.',
    '',
    'Their lists, as name (id, rows): Tasks (tasks, 41), Bills and invoices (obligations, 14), Ledger (ledger, 310), People (people, 26), Services (services, 9).',
    '',
    'Tools, as name(args): what it does.',
    ...TOOL_LINES,
    '',
    `Now they say: ${said}`,
    ...(done === null ? ['Call the tools that answer this, or answer with "calls": [] if it needs nothing from the record.'] : ['', 'What your calls answered this turn:', ...done, '', 'Answer with "calls": [] if this is enough. Otherwise call again.']),
  ].join('\n');
const callsOf = (v) => (Array.isArray(v?.calls) ? v.calls.filter((c) => c !== null && typeof c === 'object') : []);
const PROSE_SCHEMA = { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } };

/** Each step: its route, what is sent, and what a right answer is (a fault in words, or `''`). */
const STEPS = [
  {
    id: 'tool',
    route: 'answer',
    system: CHAT_SYSTEM,
    user: stepPrompt("what's late?", null),
    schema: PROMPTS.chat.schema,
    maxTokens: PROMPTS.chat.maxTokens,
    right: (v) => {
      const calls = callsOf(v);
      if (calls.length === 0) return `it called nothing and said ${JSON.stringify(String(v?.say ?? '').slice(0, 80))}`;
      const unknown = calls.filter((c) => !TOOL_NAMES.has(c.tool)).map((c) => c.tool);
      if (unknown.length > 0) return `it called ${unknown.join(', ')}, which is no tool`;
      return calls.some((c) => c.tool === 'today' || (c.tool === 'list' && /obligations|tasks/u.test(JSON.stringify(c.args ?? {})))) ? '' : `it called ${calls.map((c) => c.tool).join(', ')} and not today`;
    },
  },
  {
    id: 'args',
    route: 'answer',
    system: CHAT_SYSTEM,
    user: stepPrompt('add a task to call Priya tomorrow', null),
    schema: PROMPTS.chat.schema,
    maxTokens: PROMPTS.chat.maxTokens,
    right: (v) => {
      const add = callsOf(v).find((c) => c.tool === 'add');
      if (add === undefined) return `it called ${callsOf(v).map((c) => c.tool).join(', ') || 'nothing'} and not add`;
      const args = add.args ?? {};
      const said = JSON.stringify(args);
      if (!/"tasks"/u.test(said)) return `add went to ${said.slice(0, 80)}, not tasks`;
      if (!said.includes('2026-09-04')) return `add's fields name no due day of 2026-09-04: ${said.slice(0, 120)}`;
      return /priya/iu.test(said) ? '' : `add's fields do not name Priya: ${said.slice(0, 120)}`;
    },
  },
  {
    id: 'answer',
    route: 'answer',
    system: CHAT_SYSTEM,
    user: stepPrompt("what's late?", [
      '[1] today {}',
      'Late: {{ref:obligations#16}} Invoice 2026-041, £4,800, 38 days late. {{ref:obligations#9}} Legal review, June, £9,190, 64 days late. {{ref:tasks#31}} Send the Kiln proofs, 2 days late.',
    ]),
    schema: PROMPTS.chat.schema,
    maxTokens: PROMPTS.chat.maxTokens,
    right: (v) => {
      if (callsOf(v).length > 0) return `it called ${callsOf(v).map((c) => c.tool).join(', ')} again with the answer in hand`;
      const say = String(v?.say ?? '');
      const missing = ['£4,800', '£9,190', 'obligations#16', 'obligations#9'].filter((f) => !say.includes(f));
      return missing.length === 0 ? '' : `its answer left out ${missing.join(', ')}: ${JSON.stringify(say.slice(0, 120))}`;
    },
  },
  {
    id: 'headline',
    route: 'compose',
    system: PROMPT[0].content,
    user: PROMPT[1].content,
    schema: SCHEMA,
    maxTokens: 600,
    right: (v) => (typeof v?.lines?.bills === 'string' && v.lines.bills.trim() !== '' ? '' : `no line for bills: ${JSON.stringify(v).slice(0, 120)}`),
  },
  {
    id: 'prose',
    route: 'small',
    system: 'You write at most two calm sentences that go above a digest about to be sent to the owner of a business record. No figures, no names of rows, no greeting. Answer with one JSON object and nothing else.',
    user: 'A digest named "Weekly bills" is about to be sent. It lists three bills due this week and one paid late last week. Answer as {"text": "<the sentences>"}.',
    schema: PROSE_SCHEMA,
    maxTokens: 600,
    right: (v) => {
      const t = String(v?.text ?? '').trim();
      if (t === '') return 'no text';
      return /[0-9]/u.test(t) ? `it wrote a figure: ${JSON.stringify(t.slice(0, 120))}` : '';
    },
  },
];

/**
 * One step streamed: how long to the first event, to the first word of the answer and to the end, the answer read as
 * `readStream` in `inference.ts` reads it, and the counts from the stream's last word.
 */
async function stepOnce(route, step) {
  const started = performance.now();
  const res = await fetch(restOf(route), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      ...inputsFor(route, {
        messages: [
          { role: 'system', content: step.system },
          { role: 'user', content: step.user },
        ],
        maxTokens: step.maxTokens,
        schema: step.schema,
      }),
      stream: true,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS * 2),
  });
  if (!res.ok || res.body === null) {
    const said = lib.scrub(`${res.status}: ${await res.text()}`, secrets);
    const ms = Math.round(performance.now() - started);
    if (res.status === 429 || res.status >= 500) return { answered: false, said, ms };
    if (lib.refused(said)) return { answered: false, refused: true, said, ms };
    return { answered: true, served: !lib.unserved(said), right: false, ms, first: null, firstText: null, said, usage: { in: 0, out: 0 } };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let held = '';
  let text = '';
  let first = null;
  let firstText = null;
  let usage = { in: 0, out: 0 };
  let cut = false;
  const take = (line) => {
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (data === '' || data === '[DONE]') return;
    first ??= Math.round(performance.now() - started);
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    const u = chunk?.usage;
    if (u && typeof u === 'object') usage = { in: Math.max(usage.in, u.prompt_tokens ?? 0), out: Math.max(usage.out, u.completion_tokens ?? 0) };
    const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined;
    const piece = choice !== undefined ? choice?.delta?.content : chunk?.response;
    if (choice?.finish_reason === 'length') cut = true;
    if (typeof piece === 'string' && piece !== '') {
      firstText ??= Math.round(performance.now() - started);
      text += piece;
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    held += decoder.decode(value, { stream: true });
    const lines = held.split('\n');
    held = lines.pop() ?? '';
    for (const l of lines) take(l.trim());
  }
  if (held.trim() !== '') take(held.trim());
  const ms = Math.round(performance.now() - started);
  if (cut) return { answered: true, served: true, right: false, ms, first, firstText, said: `it stopped at the ${ceilingFor(route, step.maxTokens)}-token ceiling`, usage };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { answered: true, served: true, right: false, ms, first, firstText, said: lib.scrub(`not JSON: ${text.slice(0, 200)}`, secrets), usage };
  }
  const fault = step.right(value);
  return { answered: true, served: true, right: fault === '', ms, first, firstText, said: lib.scrub(fault, secrets), usage };
}

async function checkSteps() {
  for (const route of asked) {
    for (const step of STEPS) {
      const row = { name: route.name, step: step.id, route: step.route };
      if (!afford(lib.worst(route, step.system + step.user, ceilingFor(route, step.maxTokens)))) {
        report.steps.push({ ...row, outcome: lib.NONE, reason: lib.CEILING });
        continue;
      }
      const got = await lib.tried(() => stepOnce(route, step), waits);
      const spent = got.answered ? lib.neurons(route, got.usage) : 0;
      report.neurons.spent += spent;
      const outcome = !got.answered ? lib.NONE : got.served && got.right ? lib.PASS : lib.BELOW;
      report.steps.push({ ...row, outcome, ms: got.ms ?? null, first: got.first ?? null, firstText: got.firstText ?? null, tokens: got.usage ?? null, neurons: spent, tries: got.tries, said: lib.scrub(got.said ?? '', secrets) });
    }
  }
}

/* ── the two harnesses, in their own process ───────────────────────────────────────────────────────────────────────── */

/** A row's own knobs (`reasoning_effort`, `thinks: false`), read off the Worker's own request so the two cannot drift. */
const knobsOf = (route) => {
  const { messages: _messages, max_tokens: _ceiling, response_format: _format, ...knobs } = inputsFor(route, { messages: [], maxTokens: 0, schema: {} });
  return knobs;
};

/** The variables each harness reads, pointed at Workers AI's chat-completions address with the included model. */
const harnessEnv = (suite) => {
  const base = `${BASE}/accounts/${account}/ai/v1`;
  const p = suite === 'slash' ? 'SLASH_EVAL' : 'DRAFT_EVAL';
  /* AND THE ROW'S OWN KNOBS (`knobsOf`), which the Slash harness adds to each ask, so the suite asks as the Worker asks. */
  return { ...process.env, [`${p}_PROVIDER`]: 'openai', [`${p}_URL`]: base, [`${p}_MODEL`]: included.provider, [`${p}_KEY`]: token, [`${p}_EXTRA`]: JSON.stringify(knobsOf(included)) };
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
  for (const r of args.routes ? asked : []) report.routes.push({ name: r.name, provider: r.provider, shape: r.shape, outcome: lib.NONE, reason });
  for (const r of args.steps ? asked : []) report.steps.push({ name: r.name, outcome: lib.NONE, reason });
  for (const s of args.suites) report.suites[s] = { outcome: lib.NONE, reason, bar: baseline[s]?.[mode] ?? null };
} else {
  if (args.routes) await checkRoutes();
  if (args.steps) await checkSteps();
  for (const s of args.suites) report.suites[s] = await checkSuite(s);
}

const outcomes = [...report.routes.map((r) => r.outcome), ...report.steps.map((r) => r.outcome), ...Object.values(report.suites).map((s) => s.outcome)];
report.outcome = lib.overall(outcomes);
if (reason === null && report.outcome === lib.NONE) {
  const all = [...report.routes, ...report.steps, ...Object.values(report.suites)].filter((x) => x.outcome === lib.NONE).map((x) => x.reason ?? (x.refused ? lib.REFUSED : lib.NO_ANSWER));
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
for (const r of reason === lib.NO_TOKEN ? [] : report.steps) {
  const tail = r.said ? `  (${r.said.slice(0, 160)})` : '';
  if (r.outcome === lib.NONE) console.log(`step  ${r.name.padEnd(20)} ${String(r.step ?? '').padEnd(8)} ${r.outcome} (${r.reason ?? lib.NO_ANSWER})${tail}`);
  else
    console.log(
      `step  ${r.name.padEnd(20)} ${r.step.padEnd(8)} ${r.route.padEnd(7)} ${r.outcome === lib.PASS ? 'right' : 'WRONG'}  first ${r.first ?? '-'} ms  words ${r.firstText ?? '-'} ms  ` +
        `end ${r.ms ?? '-'} ms  ${r.tokens?.in ?? 0} in ${r.tokens?.out ?? 0} out  ${r.neurons} neurons${tail}`,
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
