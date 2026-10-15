/**
 * The kept lane, as one command: a fresh founder signs up, each kept add-on is installed from the catalogue, fed from
 * the lane's stand-in, given one schedule turn, and read back; then the record is deleted (SHL-A19 jobs 1 to 4,
 * `loop/scope/area-shell-a.md:996-1044`).
 *
 *   node tools/kept/run.mjs --host <origin> [--only a,b]
 *
 * One line an add-on: PASS, FAIL with the record's own words, SKIP with why, or TODO where what it asserts waits on
 * work the line names. A non-zero exit on any FAIL, and on a record left behind.
 *
 * A HOST IS REFUSED UNLESS ITS BILLING SAYS TEST. The lane makes a record there, installs add-ons that call out, and
 * deletes it, so it runs only where `/healthz` says billing is in test mode (as `tools/drill/pay.mjs` reads it), and
 * production never. On the Cloud harness (`kept.test.mjs`) there is no command line: the test calls `runKept`.
 *
 * WHAT IT READS FROM THE ENVIRONMENT, BY NAME, AND NEVER PRINTS: the drill's (`tools/drill/run.mjs`): `CANARY_MAIL_DOOR`,
 * `CANARY_INVITE_CODE`, `CANARY_INBOX_KEY` with `SMOKE_SLUG`, and `DRILL_OPERATOR_KEY`, each missing making sign-up
 * skip and say why. On a host the stand-in is not there, so the lines that need it skip and say so.
 *
 * THE RECORD IS DELETED WHATEVER HAPPENED, in a `finally`, as the drill deletes its own (`tools/drill/run.mjs`, read
 * and not changed); a cut run's record is named `drill-kept-…`, which the drill's own sweep takes after a day.
 */

import { drillFor, isProduction, mintCode } from '../drill/run.mjs';
import { MONEY } from './money.mjs';
import { PROJECTS } from './projects.mjs';
import { ask, asKept, deleteRecord, hide, hostCatalogue, PREFIX, red, SENTENCE, signUp, skip } from './steps.mjs';

/** Every check, in the order the lane runs them: the money first, then the projects. */
const CHECKS = { ...MONEY, ...PROJECTS };

/** The kept add-ons, in order, by the line each one starts. */
export const KEPT = Object.keys(CHECKS);

export const HELP = `node tools/kept/run.mjs --host <origin> [--only a,b]

A fresh founder signs up, each kept add-on is installed from the catalogue and fed, one schedule turn, the rows read back,
and the record deleted. One line an add-on: PASS, FAIL with the reason, SKIP with why, or TODO.
Add-ons, in order: ${KEPT.join(', ')}.

  --host <origin>   the host to run on; refused unless its /healthz says billing is in test mode
  --only a,b        only these add-ons

Read from the environment by name, never printed: CANARY_MAIL_DOOR, CANARY_INVITE_CODE,
CANARY_INBOX_KEY with SMOKE_SLUG, DRILL_OPERATOR_KEY.`;

/** The command line read: `{ host, only, help }`, or `{ wrong }` with the sentence that says what is wrong. */
export function argsOf(argv) {
  const out = { host: null, only: KEPT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--host') out.host = argv[++i] ?? null;
    else if (a === '--only') out.only = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else return { wrong: `${a} is not something the lane takes. Run it with --help.` };
  }
  if (out.help) return out;
  if (!out.host) return { wrong: 'The lane runs on the Cloud harness from its test, or on a host named with --host <origin>.' };
  try {
    out.host = new URL(out.host).origin;
  } catch {
    return { wrong: `--host ${out.host} is not an origin, such as https://alpha.brain.dog.` };
  }
  const unknown = out.only.filter((s) => !KEPT.includes(s));
  if (unknown.length) return { wrong: `There is no add-on called ${unknown.join(', ')}. They are ${KEPT.join(', ')}.` };
  if (out.only.length === 0) return { wrong: '--only names no add-on.' };
  if (isProduction(out.host)) return { wrong: `${new URL(out.host).hostname} is production. The lane makes a record and installs add-ons that call out, so it never runs there.` };
  return out;
}

/** The host's billing answer: null when it is test mode, or the sentence that refuses the host. */
export async function testModeOf(ctx) {
  const h = await ask(ctx, '/healthz', { method: 'GET', cookie: null });
  const billing = h.said?.launch?.billing ?? null;
  return billing === 'test' ? null : `billing on ${new URL(ctx.host).hostname} is ${billing ?? 'not said'}, and the lane runs only where it is test.`;
}

/** One result's line: PASS, FAIL, SKIP or TODO, its name, and what it saw. */
export const lineOf = (r) => `  ${r.todo ? 'TODO' : r.skipped ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.name}: ${r.said}`;

/**
 * Run the lane on `ctx` (`kept()` or `asKept()`): sign-up, each of `only` in order, and the delete, whatever happened.
 * Answers every result, sign-up first and `delete` last. A check that throws is a FAIL in a sentence that holds no
 * value; with no record made every check skips, saying so.
 */
export async function runKept(ctx, { only = KEPT, say = () => {} } = {}) {
  const results = [];
  const keep = (r) => {
    const line = { ...r, said: hide(ctx, r.said) };
    results.push(line);
    say(lineOf(line));
  };
  try {
    const up = await signUp(ctx).catch((e) => red(ctx, 'sign-up', `stopped: ${e instanceof Error ? e.message.split('\n')[0] : 'it threw'}`));
    keep(up);
    for (const name of KEPT.filter((k) => only.includes(k))) {
      if (!up.pass || up.skipped) {
        keep(skip(ctx, name, 'no record was made to install it on.'));
        continue;
      }
      try {
        for (const r of await CHECKS[name](ctx)) keep(r);
      } catch (e) {
        keep(red(ctx, name, `stopped: ${e instanceof Error ? e.message.split('\n')[0] : 'it threw'}`));
      }
    }
  } finally {
    keep(await deleteRecord(ctx).catch((e) => red(ctx, 'delete', `stopped, and the record may be left: ${e instanceof Error ? e.message.split('\n')[0] : 'it threw'}`)));
  }
  return results;
}

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
  const ctx = asKept(drillFor(args.host, env, { said: SENTENCE, slug: `${PREFIX}${Date.now().toString(36)}` }), { catalogue: hostCatalogue(args.host) });
  const refused = await testModeOf(ctx);
  if (refused) {
    console.error(refused);
    return 2;
  }
  const operatorKey = String(env.DRILL_OPERATOR_KEY ?? '').trim() || null;
  if (!ctx.code && operatorKey) ctx.code = await mintCode(ctx, operatorKey);
  console.log(`The kept lane, on ${new URL(args.host).hostname}:`);
  const results = await runKept(ctx, { only: args.only, say: (l) => console.log(l) });
  return results.some((r) => !r.pass) ? 1 : 0;
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`The kept lane stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
