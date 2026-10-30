/**
 * Where each host's run is written and read back, for `compare.run.ts` (`33 §3`: each host writes its results, and the
 * gate holds that both ran the same cases).
 *
 * NODE ONLY, and apart from `suite.ts` for that reason: the cases are bundled into a Durable Object, this never is.
 * `_results/` is ignored by git (`_*` in `.gitignore`): a run's results are evidence about one machine, not source.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { HostName, Outcome } from './suite.ts';

export type HostResults = {
  host: HostName;
  /** `sqlite_version()` as the host answered it. Not compared: the two builds may differ, and the cases say whether that matters. */
  sqlite: string;
  /** What ran it: the Node version, and on the Worker the compatibility date. */
  runtime: string;
  at: string;
  outcomes: Outcome[];
};

const dir = fileURLToPath(new URL('./_results/', import.meta.url));

export const resultsFile = (host: HostName): string => `${dir}${host === 'node:sqlite' ? 'node-sqlite' : host}.json`;

export function writeResults(results: HostResults): string {
  mkdirSync(dir, { recursive: true });
  const file = resultsFile(results.host);
  writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
  return file;
}

export function readResults(host: HostName): HostResults | null {
  try {
    return JSON.parse(readFileSync(resultsFile(host), 'utf8')) as HostResults;
  } catch {
    return null;
  }
}
