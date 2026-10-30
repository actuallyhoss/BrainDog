/**
 * The conformance suite's one list (`33 §3`), run by `apps/selfhost/test/conformance.run.ts` on `node:sqlite` and by
 * `apps/worker/test/conformance.run.ts` in a Durable Object on workerd, then held equal by `compare.run.ts`.
 *
 * `pnpm conformance` at the root runs all three. Each half alone: `pnpm --filter @braindog/selfhost conformance`,
 * `pnpm --filter @braindog/worker conformance`, then `pnpm --filter @braindog/host conformance:compare`.
 */

import { RECORD_CASES } from './record-cases.ts';
import { SQL_CASES } from './sql-cases.ts';
import type { Case } from './suite.ts';

export * from './suite.ts';

export const CASES: readonly Case[] = [...SQL_CASES, ...RECORD_CASES];

/* ONE NAME, ONE CASE: the results and the compare are keyed by it, and a second case under a name would hide the first. */
const seen = new Set<string>();
for (const c of CASES) {
  if (seen.has(c.id)) throw new Error(`two conformance cases are called ${c.id}`);
  seen.add(c.id);
}
