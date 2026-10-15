/**
 * The lane's seventh step: the kept lane on the canary's host (SHL-A19, `tools/kept/run.mjs`).
 *
 * THE LANE ITSELF IS `tools/kept/run.mjs`; this file only says when the canary runs it. A fresh founder signs up as the
 * stranger's drill does, each kept add-on is installed from the host's own catalogue, fed, given one turn and read back,
 * one line an add-on, and the record is deleted at the end whatever happened.
 *
 * ONLY WHERE BILLING IS TEST. The lane installs add-ons that call out, so it never runs on production: on the production
 * canary it says skipped, and it runs where `CANARY_ORIGIN` names a host whose `/healthz` says billing is test. It needs
 * what the stranger's drill needs, by name (`60-stranger.mjs`'s `NEEDS`), and without any of them it says skipped and
 * ends with 3, which the lane reads as skipped and not as red.
 *
 * A RED HERE OPENS A FINDING; it does not roll back. No line names the address, the code, a key or a link.
 */

import { drillFor, isProduction, mintCode } from '../../drill/run.mjs';
import { runKept, testModeOf } from '../../kept/run.mjs';
import { asKept, hostCatalogue, PREFIX, SENTENCE } from '../../kept/steps.mjs';
import { where } from '../lib.mjs';
import { NEEDS } from './60-stranger.mjs';

export const onRed = 'finding';

/** Whether the lane runs the kept lane with `env`: `{ run: true, place }`, or `{ run: false, line }` saying why not. */
export function planFor(env = process.env) {
  const place = where({ ...env, CANARY_ORIGIN: env.CANARY_ORIGIN || (env.DEPLOY_HOST ? `https://${env.DEPLOY_HOST}` : '') });
  if (!place.live) return { run: false, line: 'skipped: no canary is named (SMOKE_SLUG), so there is no Inbox to read the letter in.' };
  if (isProduction(place.origin)) return { run: false, line: 'skipped: the canary is on production, and the kept lane runs only where billing is test.' };
  const set = (k) => String(env[k] ?? '').trim() !== '';
  const missing = NEEDS.filter((k) => !set(k) && !(k === 'CANARY_INVITE_CODE' && set('DRILL_OPERATOR_KEY'))).map((k) => (k === 'CANARY_INVITE_CODE' ? `${k} (or DRILL_OPERATOR_KEY)` : k));
  if (missing.length) return { run: false, line: `skipped: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set, so the founder cannot sign up and read their letter.` };
  return { run: true, place };
}

/** The step: `{ code, lines }`, 0 green, 1 red, 3 skipped. `run` and `billing` are the lane and its test-mode read, stubbed in a test. */
export async function keptStep(env = process.env, { run = runKept, billing = testModeOf } = {}) {
  const plan = planFor(env);
  if (!plan.run) return { code: 3, lines: [plan.line] };
  const host = plan.place.origin;
  const ctx = asKept(drillFor(host, env, { said: SENTENCE, slug: `${PREFIX}${Date.now().toString(36)}` }), { catalogue: hostCatalogue(host) });
  const refused = await billing(ctx);
  if (refused) return { code: 3, lines: [`skipped: ${refused}`] };
  const operatorKey = String(env.DRILL_OPERATOR_KEY ?? '').trim() || null;
  if (!ctx.code && operatorKey) ctx.code = await mintCode(ctx, operatorKey);
  const lines = [];
  const results = await run(ctx, { say: (l) => lines.push(l.trim()) });
  return { code: results.some((r) => !r.pass) ? 1 : 0, lines };
}

if (import.meta.main)
  keptStep().then(
    (out) => {
      const slug = String(process.env.SMOKE_SLUG ?? '').trim();
      for (const l of out.lines) (out.code === 1 ? console.error : console.log)(`  kept${slug ? `, on the canary ${slug}` : ''}: ${l}`);
      process.exitCode = out.code;
    },
    (e) => {
      console.error(`  kept stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
