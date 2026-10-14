/**
 * The drill, as one command: a stranger's whole life on one host (LCH-A03, `loop/scope/area-launch-a.md:365-418`).
 *
 *   node tools/drill/run.mjs --host <origin> [--steps a,b] [--live]
 *
 * One line a step, and a non-zero exit on a red one. PRODUCTION IS REFUSED unless `--live` is given, since the drill
 * makes a record there and closes it. The drill touches no record but its own: the one it made, named `drill-…`.
 *
 * WHAT IT READS FROM THE ENVIRONMENT, BY NAME, AND NEVER PRINTS: `CANARY_MAIL_DOOR` (the address it signs up with, the
 * canary's own mail door, so the letter lands in the canary's Inbox), `CANARY_INVITE_CODE` (a sign-up code, where sign-up
 * is by invitation), `CANARY_INBOX_KEY` (the canary's agent key, which reads that Inbox) with `SMOKE_SLUG` (the canary's
 * name), and `DRILL_OPERATOR_KEY` (the operator key, for the sweep, and to mint the run's own code when no code is
 * named). Each one missing makes the steps that need it skip and say why.
 */

import { ENDS, sweep } from './ends.mjs';
import { ask, drill, hide, inboxMail, noMail, NOTE, STEPS } from './steps.mjs';

/** Every step, in the order the drill runs them. */
export const ORDER = [...Object.keys(STEPS), ...Object.keys(ENDS), 'sweep'];

/** The hosts that are production: the drill makes and closes a real stranger there, so only `--live` lets it. */
const PRODUCTION = new Set(['brain.dog', 'www.brain.dog', 'app.brain.dog']);

export const isProduction = (origin) => PRODUCTION.has(new URL(origin).hostname);

export const HELP = `node tools/drill/run.mjs --host <origin> [--steps a,b] [--live]

A stranger's whole life on one host: sign-up, the mailed link, sign-in refusals, delete and close.
Steps, in order: ${ORDER.join(', ')}.

  --host <origin>   the host to drill, such as https://alpha.brain.dog
  --steps a,b       only these steps (a step that needs an earlier one skips and says so)
  --live            let the drill run on production

Read from the environment by name, never printed: CANARY_MAIL_DOOR, CANARY_INVITE_CODE,
CANARY_INBOX_KEY with SMOKE_SLUG, DRILL_OPERATOR_KEY.`;

/** The command line read: `{ host, steps, live, help }`, or `{ wrong }` with the sentence that says what is wrong. */
export function argsOf(argv) {
  const out = { host: null, steps: ORDER, live: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--live') out.live = true;
    else if (a === '--host') out.host = argv[++i] ?? null;
    else if (a === '--steps') out.steps = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else return { wrong: `${a} is not something the drill takes. Run it with --help.` };
  }
  if (out.help) return out;
  if (!out.host) return { wrong: 'The drill needs --host <origin>.' };
  try {
    out.host = new URL(out.host).origin;
  } catch {
    return { wrong: `--host ${out.host} is not an origin, such as https://alpha.brain.dog.` };
  }
  const unknown = out.steps.filter((s) => !ORDER.includes(s));
  if (unknown.length) return { wrong: `There is no step called ${unknown.join(', ')}. The steps are ${ORDER.join(', ')}.` };
  if (out.steps.length === 0) return { wrong: '--steps names no step.' };
  if (isProduction(out.host) && !out.live) return { wrong: `${new URL(out.host).hostname} is production. The drill makes a record there and closes it, so it runs there only with --live.` };
  return out;
}

/** The drill `env` and the host make: the mail port, the address, the code, and what the letter should say. */
export function drillFor(host, env = process.env, extra = {}) {
  const v = (k) => String(env[k] ?? '').trim() || null;
  const key = v('CANARY_INBOX_KEY');
  const slug = v('SMOKE_SLUG');
  const mail = key && slug ? inboxMail({ origin: host, slug, key }) : noMail(key ? 'no canary is named (SMOKE_SLUG), so its Inbox cannot be read' : 'no inbox key');
  const ours = /(^|\.)brain\.dog$/u.test(new URL(host).hostname);
  const d = drill({ host, address: v('CANARY_MAIL_DOOR'), code: v('CANARY_INVITE_CODE'), mail, ...(ours ? { sender: 'hello@brain.dog', support: 'support@brain.dog' } : {}), ...extra });
  if (key) d.secrets.push(key);
  return d;
}

/**
 * A sign-up code of the drill's own, noted `drill` and good for a day, minted with the operator key, or null. A code is
 * spent by the sign-up it lets in, so one kept in the environment drills once; with the operator key every run has its own.
 */
export async function mintCode(d, operatorKey) {
  d.secrets.push(operatorKey);
  const out = await ask(d, '/account/ops/invite', { body: { note: NOTE, days: 1 }, cookie: null, bearer: operatorKey });
  const link = out.said?.ok === true ? String(out.said.value?.links?.[0] ?? '') : '';
  const code = link.includes('#code=') ? link.slice(link.indexOf('#code=') + '#code='.length) : '';
  return code === '' ? null : code;
}

/**
 * Run `steps` of drill `d`, in the drill's order, saying each as it ends. Answers every result. A step that throws is
 * red, in a sentence that holds no value. The sweep runs with `sweepWith` (its operator key and clock), and a drill with
 * no code is given one of its own when that key is there.
 */
export async function runDrill(d, { steps = ORDER, say = () => {}, sweepWith = {} } = {}) {
  const all = { ...STEPS, ...ENDS };
  const results = [];
  if (!d.code && sweepWith.operatorKey && steps.includes('signup')) d.code = await mintCode(d, sweepWith.operatorKey);
  for (const name of ORDER.filter((s) => steps.includes(s))) {
    let r;
    try {
      r = name === 'sweep' ? await sweep({ host: d.host, mail: d.mail, ip: d.ip, send: d.send, waitMs: d.waitMs, ...sweepWith }) : await all[name](d);
    } catch (e) {
      r = { name, pass: false, said: hide(d, `stopped: ${e instanceof Error ? e.message.split('\n')[0] : 'it threw'}`) };
    }
    results.push(r);
    say(lineOf(r));
  }
  return results;
}

/** One step's line: `green`, `red` or `skip`, its name, and what it saw. */
export const lineOf = (r) => `  ${r.skipped ? 'skip ' : r.pass ? 'green' : 'red  '}  ${r.name}: ${r.said}`;

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = argsOf(argv);
  if (args.wrong) {
    console.error(args.wrong);
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  const d = drillFor(args.host, env);
  const operatorKey = String(env.DRILL_OPERATOR_KEY ?? '').trim() || null;
  console.log(`The drill, on ${new URL(args.host).hostname}:`);
  const results = await runDrill(d, { steps: args.steps, say: (l) => console.log(l), sweepWith: { operatorKey } });
  return results.some((r) => !r.pass) ? 1 : 0;
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`The drill stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
