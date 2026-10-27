/**
 * The lane's sixth step: a stranger's whole life on the canary's host (LCH-A03 job 5).
 *
 * THE DRILL ITSELF IS `tools/drill/run.mjs`; this file only says when the lane runs it. It signs up with the canary's own
 * mail door, reads the letter in the canary's Inbox with the canary's agent key, makes a Free record, tries the lock,
 * deletes the record and closes the account, then sweeps any drill record a cut run left more than a day ago.
 *
 * ONLY WHEN HIS SITTING HAS PUT WHAT IT NEEDS, by name: `SMOKE_SLUG` (the canary), `CANARY_MAIL_DOOR`,
 * `CANARY_INVITE_CODE` and `CANARY_INBOX_KEY`. Without any of them it says "skipped", names what is missing, and ends
 * with 3, which the lane reads as skipped and not as red. `DRILL_OPERATOR_KEY` is the sweep's, and without it the sweep
 * alone skips; it also mints each run a code of its own, since a code in the environment is spent by the first run.
 *
 * A RED HERE OPENS A FINDING; it does not roll back. No line names the address, the code, a key or a link.
 */

import { drillFor, runDrill } from '../../drill/run.mjs';
import { where } from '../lib.mjs';

export const onRed = 'finding';

/** What the drill needs from the lane's environment, by name, beside the canary's own `SMOKE_SLUG`. */
export const NEEDS = ['CANARY_MAIL_DOOR', 'CANARY_INVITE_CODE', 'CANARY_INBOX_KEY'];

/** Whether the lane runs the drill with `env`: `{ run: true, place }`, or `{ run: false, line }` saying why not. */
export function planFor(env = process.env) {
  const place = where({ ...env, CANARY_ORIGIN: env.CANARY_ORIGIN || (env.DEPLOY_HOST ? `https://${env.DEPLOY_HOST}` : '') });
  if (!place.live) return { run: false, line: 'skipped: no canary is named (SMOKE_SLUG), so there is no Inbox to read the letter in.' };
  const set = (k) => String(env[k] ?? '').trim() !== '';
  /* A CODE IS SPENT BY THE SIGN-UP IT LETS IN, so the operator key, which mints the run's own, stands in for one. */
  const missing = NEEDS.filter((k) => !set(k) && !(k === 'CANARY_INVITE_CODE' && set('DRILL_OPERATOR_KEY'))).map((k) => (k === 'CANARY_INVITE_CODE' ? `${k} (or DRILL_OPERATOR_KEY)` : k));
  if (missing.length) return { run: false, line: `skipped: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set, so the stranger cannot sign up and read their letter.` };
  return { run: true, place };
}

/** The step: `{ code, lines }`, 0 green, 1 red, 3 skipped. `run` is the drill, stubbed in a test. */
export async function stranger(env = process.env, { run = runDrill } = {}) {
  const plan = planFor(env);
  if (!plan.run) return { code: 3, lines: [plan.line] };
  const operatorKey = String(env.DRILL_OPERATOR_KEY ?? '').trim() || null;
  const lines = [];
  const results = await run(drillFor(plan.place.origin, env), { say: (l) => lines.push(l.trim()), sweepWith: { operatorKey } });
  return { code: results.some((r) => !r.pass) ? 1 : 0, lines };
}

if (import.meta.main)
  stranger().then(
    (out) => {
      const slug = String(process.env.SMOKE_SLUG ?? '').trim();
      for (const l of out.lines) (out.code === 1 ? console.error : console.log)(`  stranger${slug ? `, on the canary ${slug}` : ''}: ${l}`);
      process.exitCode = out.code;
    },
    (e) => {
      console.error(`  stranger stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
