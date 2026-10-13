#!/usr/bin/env node
/**
 * The sixteen descriptions asked through a host's own door on a fresh record, as the Slash page asks, so what is measured
 * is what ships (ENG-B11): how many draw a clean page on the first ask, counted apart from those clean only after a repair.
 *
 *   DRAFT_EVAL_MODEL=<model> DRAFT_EVAL_KEY=<key> node tools/model-checks/describe-live.mjs --bar 13
 *   MODEL_CHECK_ACCOUNT=<account> MODEL_CHECK_TOKEN=<token> node tools/model-checks/describe-live.mjs --bar 13
 *   node tools/model-checks/describe-live.mjs --stub
 *
 *   --bar <n>      how many must draw clean on the first ask; under it the run exits 1. With none it only counts
 *   --only 1,13    only those descriptions, by number (`packages/record/eval/cases.ts`); the bar is then out of those
 *   --stub         a stub host: the shipped record and door over the stub model, no key and no network. It proves the
 *                  path and the count, and is never a measurement of a model
 *   --json         the lines below go to stderr, and stdout is one JSON line, the report
 *   --out <file>   the report written to a file as well
 *
 * WHOSE KEY. The owner's own, under the names the description harness already reads (`DRAFT_EVAL_PROVIDER`, `_URL`,
 * `_MODEL`, `_KEY`, `_TIMEOUT_MS`, as `packages/record/eval/run.ts` says them), or the checks' token
 * (`MODEL_CHECK_ACCOUNT`, `MODEL_CHECK_TOKEN`), which asks the included model at Workers AI's own address as `run.mjs`
 * does. Read from the environment, never printed, and cut out of every sentence kept. WITH NEITHER IT SAYS
 * "no model key: not measured" AND EXITS 0: nothing was asked, so nothing is green and nothing is red.
 *
 * THE DOOR IS THE HOST'S. Each description is a `POST /api/slashDraft` answered by `serveApi` over `handlersFor` a
 * record, the one function both hosts answer a method with, carrying what the Slash page sends (`draftChange` in
 * `apps/web/src/lib/record/slash.ts`): `asked`, and `page` when the description is about one. The record is a fresh
 * copy of the evaluation's seed for every description, and the model is the host's own `endpointModel` or
 * `anthropicModel`, so the instructions are the ones that ship.
 *
 * WHAT COUNTS. The door keeps a draft only when it drew with no refusal and met the page bar (`describe` and
 * `calmFaults` in `packages/record/src/slash.ts`), mending at most twice. So a description is `first` when something was
 * kept and the model was asked once, `repaired` when something was kept after a repair, `no` when the model answered and
 * nothing was kept, and `unanswered` when the provider gave no answer in three tries, which is never red (`lib.mjs`).
 * The asks are counted where the host hands the model over, because the door's answer does not say how many it took.
 *
 * It exits 1 below the bar alone. A provider that was slow, a token turned away and no key are all not measured.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as lib from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const DOOR = 'POST /api/slashDraft';

/* ── the flags ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The flags, read plainly. An unknown one is an error, so a typo never asks sixteen descriptions of a paid model. */
function flags(argv) {
  const out = { stub: false, json: false, bar: null, only: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--stub') out.stub = true;
    else if (a === '--json') out.json = true;
    else if (a === '--out') out.out = next();
    else if (a === '--bar') {
      const v = next();
      if (!/^[0-9]+$/u.test(v)) throw new Error(`--bar takes a whole number, not ${v}`);
      out.bar = Number(v);
    } else if (a === '--only') {
      const v = next();
      if (!/^[0-9]+(?:,[0-9]+)*$/u.test(v)) throw new Error(`--only takes numbers with commas between, such as 1,13, not ${v}`);
      out.only = v.split(',').map(Number);
    } else throw new Error(`unknown flag ${a}`);
  }
  return out;
}

let args;
try {
  args = flags(process.argv.slice(2));
} catch (e) {
  console.error(`describe live: ${e.message}`);
  process.exit(2);
}
const say = (line) => (args.json ? console.error(line) : console.log(line));
const at = new Date().toISOString();

/** The report, printed as the last line under `--json` and written to `--out`; then the run ends with `code`. */
function finish(report, code) {
  const whole = { at, door: DOOR, stub: args.stub, bar: args.bar, ...report };
  if (args.out !== null) writeFileSync(args.out, `${JSON.stringify(whole, null, 2)}\n`);
  if (args.json) console.log(JSON.stringify(whole));
  process.exit(code);
}

/* ── whose key ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

const env = (name) => (process.env[name] ?? '').trim();
const own = { provider: env('DRAFT_EVAL_PROVIDER') || 'openai', url: env('DRAFT_EVAL_URL'), model: env('DRAFT_EVAL_MODEL'), key: env('DRAFT_EVAL_KEY') };
const checks = { account: env('MODEL_CHECK_ACCOUNT'), token: env('MODEL_CHECK_TOKEN') };
const secrets = [own.key, checks.token, checks.account];
const hide = (text) => lib.scrub(text, secrets);

const keyed = own.model !== '' && own.key !== '' ? 'own' : checks.account !== '' && checks.token !== '' ? 'checks' : null;
if (!args.stub && keyed === null) {
  say('describe live: no model key: not measured. Set DRAFT_EVAL_MODEL and DRAFT_EVAL_KEY, or MODEL_CHECK_ACCOUNT and MODEL_CHECK_TOKEN, and run it again.');
  finish({ model: null, outcome: lib.NONE, reason: lib.NO_TOKEN, firstTry: null, afterRepair: null, of: 0, cases: [] }, 0);
}
if (!args.stub && keyed === 'own' && own.provider !== 'openai' && own.provider !== 'anthropic') {
  console.error(`describe live: DRAFT_EVAL_PROVIDER is openai or anthropic, not ${hide(own.provider)}`);
  process.exit(2);
}

/* ── the host: the record, its door, and the model it is handed ───────────────────────────────────────────────────── */

const { CASES } = await import(join(root, 'packages', 'record', 'eval', 'cases.ts'));
const { OWNER, seeded } = await import(join(root, 'packages', 'record', 'eval', 'record.ts'));
const { handlersFor, serveApi } = await import(join(root, 'packages', 'host', 'src', 'index.ts'));

const asked = CASES.filter((c) => args.only === null || args.only.includes(c.n));
if (asked.length === 0 || (args.only !== null && asked.length !== new Set(args.only).size)) {
  console.error(`describe live: --only names descriptions from 1 to ${CASES.length}, such as --only 1,13`);
  process.exit(2);
}
if (args.bar !== null && args.bar > asked.length) {
  console.error(`describe live: the bar of ${args.bar} is more than the ${asked.length} asked`);
  process.exit(2);
}

/** The address each provider answers at, from its base, as the host builds it for an owner's own key (`eval/run.ts`). */
const addressOf = (provider, base) => {
  const b = base.replace(/\/+$/u, '');
  if (provider === 'openai') return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
  if (b.endsWith('/messages')) return b;
  return b.endsWith('/v1') ? `${b}/messages` : `${b}/v1/messages`;
};

/**
 * The stub host's model: `eval/stub.ts`, and for a description that says what a good answer builds (`stub.built`), that
 * answer whole. A case marked `mends` leaves out what each table says when it is empty on its first ask, which the page
 * bar refuses and hands back, and answers it whole on the repair.
 */
async function stubModel() {
  const { STUB } = await import(join(root, 'packages', 'record', 'eval', 'stub.ts'));
  return {
    name: 'stub host',
    draft: async (input) => {
      const c = CASES.find((x) => x.asked === input.asked);
      if (c?.stub.built === undefined) return STUB.draft(input);
      const { declarations, rows } = structuredClone(c.stub.built);
      if (c.stub.mends === true && input.repair === undefined)
        for (const d of declarations) if (d.kind === 'page') for (const b of d.body.blocks) if (b.kind === 'table') delete b.empty;
      return { drafts: [{ question: `Build ${c.stub.title} for you, as you described it?`, body_kind: 'change', body: { to: { declarations } }, rows }] };
    },
  };
}

/** The host's own model on the key: the owner's, or the checks' token at Workers AI's address with the included model. */
async function keyedModel() {
  const { anthropicModel, endpointModel, SLASH_TIMEOUT_MS } = await import(join(root, 'packages', 'host', 'src', 'slash.ts'));
  let { provider, url, model, key } = own;
  let keyName = 'DRAFT_EVAL_KEY';
  if (keyed === 'checks') {
    const { ROUTED } = await import(join(root, 'apps', 'worker', 'src', 'inference.ts'));
    const base = env('MODEL_CHECK_BASE').replace(/\/+$/u, '') || 'https://api.cloudflare.com/client/v4';
    provider = 'openai';
    url = `${base}/accounts/${checks.account}/ai/v1`;
    /* The routing name every template of the packages asks, as `run.mjs` reads it. */
    model = (ROUTED.find((r) => r.name === 'glm-5.3-flash') ?? ROUTED[0]).provider;
    key = checks.token;
    keyName = 'MODEL_CHECK_TOKEN';
  } else if (url === '') url = provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1';
  const said = Number(env('DRAFT_EVAL_TIMEOUT_MS'));
  const options = { url: addressOf(provider, url), model, key: async () => key, send: (input, init) => fetch(input, init), name: model, keyName, timeoutMs: Number.isFinite(said) && said > 0 ? said : SLASH_TIMEOUT_MS };
  return provider === 'anthropic' ? anthropicModel(options) : endpointModel(options);
}

const model = args.stub ? await stubModel() : await keyedModel();

/** What one description asked of the model: how many asks, and the first thing a provider said that was not an answer. */
let tally = { asks: 0, fault: null };
const counted = {
  ...model,
  name: model.name,
  draft: async (input) => {
    tally.asks++;
    try {
      return await model.draft(input);
    } catch (e) {
      tally.fault ??= hide(e instanceof Error ? e.message : String(e));
      throw e;
    }
  },
};

/* ── one description, through the door ─────────────────────────────────────────────────────────────────────────────── */

const kindsDrawn = (draft) => (draft?.preview?.pages ?? []).flatMap((p) => (p.blocks ?? []).map((b) => b.kind));
const kindsBuilt = (draft) => {
  const to = draft?.change?.to;
  return (Array.isArray(to?.declarations) ? to.declarations : to === undefined ? [] : [to]).map((d) => d.kind);
};

/** One description on a fresh record, sent as the Slash page sends it, and what came back read as a person would see it. */
async function described(c) {
  tally = { asks: 0, fault: null };
  const { api, sql } = await seeded(counted);
  const started = performance.now();
  let status = 0;
  let body = null;
  try {
    const request = new Request('http://braindog.invalid/api/slashDraft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(c.page === undefined ? { asked: c.asked } : { asked: c.asked, page: c.page }),
    });
    const res = await serveApi(request, handlersFor(api), OWNER);
    status = res.status;
    body = await res.json();
  } finally {
    sql.close();
  }
  const ms = Math.round(performance.now() - started);
  const drafts = body?.ok === true ? (body.value?.drafts ?? []) : [];
  const { asks, fault } = tally;
  const quiet = fault !== null && (lib.noAnswer(fault) || lib.refused(fault));
  const clean = drafts.length > 0 ? (asks === 1 ? 'first' : 'repaired') : quiet ? 'unanswered' : 'no';
  const why = clean === 'first' || clean === 'repaired' ? '' : hide(fault ?? body?.value?.dropped?.[0] ?? body?.refusal?.fix ?? 'nothing was kept');
  return { answered: clean !== 'unanswered', said: fault ?? '', n: c.n, name: c.name, status, asks, kept: drafts.length, clean, drew: kindsDrawn(drafts[0]), built: kindsBuilt(drafts[0]), ms, why };
}

/* ── the run ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

const wait = Number(env('MODEL_CHECK_WAIT_MS')) > 0 ? Number(env('MODEL_CHECK_WAIT_MS')) : 2_000;
const LABEL = { first: 'first ask', repaired: 'after repair', no: 'NOT CLEAN', unanswered: 'no answer' };

say(args.stub ? `Describe live, on a stub host: ${asked.length} description${asked.length === 1 ? '' : 's'} through ${DOOR}. No model is measured.` : `Describe live: ${asked.length} description${asked.length === 1 ? '' : 's'} through ${DOOR}, ${hide(model.name)}`);

const cases = [];
let turnedAway = false;
for (const c of asked) {
  /* A TOKEN TURNED AWAY IS TURNED AWAY FOR EVERY DESCRIPTION, so the rest are not asked: nothing they said would be the model's. */
  if (turnedAway) break;
  const got = await lib.tried(() => described(c), { waits: [wait, 4 * wait] });
  const { answered: _a, said, tries, ...kept } = got;
  turnedAway = lib.refused(said);
  cases.push({ ...kept, tries });
  say(`${String(c.n).padStart(2)} ${LABEL[kept.clean].padEnd(12)}  ${c.name.padEnd(16)} ${String(kept.ms).padStart(6)} ms  asks ${kept.asks}  kept ${kept.kept}${kept.why === '' ? '' : `  (${kept.why.slice(0, 160)})`}`);
}

const of = asked.length;
const first = cases.filter((c) => c.clean === 'first').length;
const after = first + cases.filter((c) => c.clean === 'repaired').length;
const unanswered = of - cases.filter((c) => c.clean !== 'unanswered').length;
const measured = of - unanswered;

/* THE OUTCOME, AS `lib.mjs` SAYS THE THREE. Under half answered, or a token turned away, is not measured whatever the
   count. Below the bar is red only when the unanswered could not have lifted it there. A stub host is never a model
   measured, so it is never green: it can only fall below a bar it was handed, which is how its own test holds the count. */
let outcome;
let reason = null;
if (turnedAway) [outcome, reason] = [lib.NONE, lib.REFUSED];
else if (measured * 2 < of) [outcome, reason] = [lib.NONE, lib.NO_ANSWER];
else if (args.bar !== null && first + unanswered < args.bar) outcome = lib.BELOW;
else if (args.bar !== null && first < args.bar) [outcome, reason] = [lib.NONE, lib.NO_ANSWER];
else if (args.stub) [outcome, reason] = [lib.NONE, 'stub'];
else outcome = lib.PASS;

say('');
say(`first try: ${first} of ${of}`);
say(`after repair: ${after} of ${of}`);
if (unanswered > 0) say(`${unanswered} of ${of} got no answer from the provider${turnedAway ? ', which turned the key away' : ''}, and ${unanswered === 1 ? 'is' : 'are'} not counted either way.`);
if (outcome === lib.BELOW) say(`below the bar of ${args.bar}: ${first} of ${of} drew clean on the first ask.`);
else if (outcome === lib.NONE) say(args.stub && reason === 'stub' ? 'A stub host answered, so no model was measured.' : 'Not measured: the provider did not answer enough of them to say.');
else say(args.bar === null ? 'Measured, against no bar: say --bar to hold it to one.' : `Measured: at or over the bar of ${args.bar}.`);

finish({ model: args.stub ? 'stub' : hide(model.name), outcome, reason, firstTry: first, afterRepair: after, of, unanswered, cases }, outcome === lib.BELOW ? 1 : 0);
