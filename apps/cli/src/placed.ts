/**
 * The profiles placed again after `braindog update` swaps the command (AGT-A04, job 2).
 *
 * WHY IT RUNS THE NEW FILE AND NOT THIS ONE. The Agent Skill rides inside the bundle as `__SKILL__`, and the hook shims
 * are written beside the bundle by `hookScripts()`, so what `install --apply` places is whatever the running build
 * carries. The process that swapped the file is still the old build in memory, so it starts the new file once, as
 * `node <file> install --apply`, exactly the line a person types, and the skill and hooks are the new build's. Each
 * file that changes keeps its copy, because `install` already does that (`install.ts`, `installProfiles`).
 *
 * WHICH PROFILES. `~/.braindog/profiles.json` names every Claude Code profile on the machine once AGT-A07 writes it:
 * a list of folders, or `{ "profiles": [...] }` whose entries are folders or `{ "dir": <folder> }`. Until that file
 * exists, it is the profile of the environment, `CLAUDE_CONFIG_DIR` or `~/.claude`, which is what `install --apply`
 * picks with no folder named. A file that does not read is treated as absent rather than stopping an update that has
 * already happened.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { profilesOf } from './install.ts';

type Env = Record<string, string | undefined>;

/** How the new file is started: `spawnSync`'s shape, so a test can hold it. */
export type Runner = (cmd: string, args: string[], options: { env: Env; encoding: 'utf8'; timeout: number }) => { status: number | null; stderr?: string | null; error?: Error };

/** What placing again did: how many profiles it named, and the reason it failed, or null. */
export interface Placed {
  count: number;
  failed: string | null;
}

/** The folders named by `~/.braindog/profiles.json`, or null when there is no such file or it does not read. */
export function listedProfiles(home: string): string[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(home, '.braindog', 'profiles.json'), 'utf8'));
  } catch {
    return null;
  }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { profiles?: unknown }).profiles) ? (raw as { profiles: unknown[] }).profiles : null;
  if (!list) return null;
  const dirs = list.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim()) return [entry];
    const dir = entry && typeof entry === 'object' ? (entry as { dir?: unknown }).dir : undefined;
    return typeof dir === 'string' && dir.trim() ? [dir] : [];
  });
  return dirs.length > 0 ? dirs : null;
}

/**
 * Runs the command at `file` once as `install --apply` for every profile this machine names. Nothing is printed here:
 * `update` says one line for the whole run, and the install's own lines are its business, not this one's.
 */
export function placeAgain(file: string, env: Env, home: string = homedir(), run: Runner = spawnSync as unknown as Runner): Placed {
  const listed = listedProfiles(home);
  const dirs = listed ?? profilesOf([], env);
  /* Named only when the file named them; otherwise the line is the bare one the person would type. */
  const args = [file, 'install', '--apply', ...(listed ?? []).flatMap((dir) => ['--config-dir', dir])];
  const done = run(process.execPath, args, { env, encoding: 'utf8', timeout: 60_000 });
  if (done.error) return { count: 0, failed: done.error.message };
  if (done.status !== 0) {
    const first = (done.stderr ?? '').split('\n').find((line) => line.trim()) ?? `it ended with code ${done.status ?? 'none'}`;
    return { count: 0, failed: first.trim() };
  }
  return { count: dirs.length, failed: null };
}
