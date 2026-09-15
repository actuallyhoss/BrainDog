/**
 * `braindog install`: the two hook entries in Claude Code's user settings, shown first and written only when asked.
 *
 * A DRY RUN BY DEFAULT. Settings belong to the person, and a hook runs in every session they start, so the
 * command prints exactly what it would add and changes nothing without `--apply`. With it, the file as it
 * was is copied beside itself first. Existing entries, other tools' hooks included, are left as they are.
 *
 * ONLY THE USER'S `settings.json`. A project's `.mcp.json` is shared through its repository, so this never
 * opens one (`loop/research-agent-path.md` question 5).
 */

import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type Env = Record<string, string | undefined>;
type Entry = { hooks: { type: 'command'; command: string; timeout: number }[] };

/* Claude Code allows a hook sixty seconds by default; these are shorter, and longer than the hook's own eight. */
const EVENTS = [
  { event: 'SessionStart', which: 'start', timeout: 20 },
  { event: 'SessionEnd', which: 'end', timeout: 15 },
] as const;

/** The profile folders to change: each `--config-dir`, else `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export const profilesOf = (named: string[], env: Env): string[] => (named.length > 0 ? named : [env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')]);

/** The command Claude Code runs: the PowerShell shim on Windows, the POSIX one elsewhere. */
export function hookCommand(which: 'start' | 'end', scripts: string, platform: string = process.platform): string {
  return platform === 'win32'
    ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(scripts, 'braindog-hook.ps1')}" ${which}`
    : `sh "${join(scripts, 'braindog-hook.sh')}" ${which}`;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/* The first free name beside the file, so an earlier copy is never overwritten. */
const backupOf = (file: string): string => {
  let n = 0;
  while (existsSync(n === 0 ? `${file}.bak` : `${file}.bak${String(n)}`)) n++;
  return n === 0 ? `${file}.bak` : `${file}.bak${String(n)}`;
};

/**
 * What installing into one profile does, as the lines to print. Throws one sentence when the file cannot
 * be read as settings, and then writes nothing.
 */
export function installInto(dir: string, options: { apply: boolean; scripts: string; platform?: string }): string[] {
  const file = join(dir, 'settings.json');
  const had = existsSync(file);
  let settings: Record<string, unknown> = {};
  if (had) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new Error(`${file} is not valid JSON, so braindog install leaves it alone. Correct it and run install again.`);
    }
    if (!isObject(parsed)) throw new Error(`${file} is not a settings object, so braindog install leaves it alone.`);
    settings = parsed;
  }
  const hooks = settings.hooks ?? {};
  if (!isObject(hooks)) throw new Error(`hooks in ${file} is not an object, so braindog install leaves the file alone.`);

  const added: { event: string; entry: Entry }[] = [];
  for (const { event, which, timeout } of EVENTS) {
    const list = hooks[event] ?? [];
    if (!Array.isArray(list)) throw new Error(`hooks.${event} in ${file} is not a list, so braindog install leaves the file alone.`);
    const command = hookCommand(which, options.scripts, options.platform);
    const present = list.some((group) => isObject(group) && Array.isArray(group.hooks) && group.hooks.some((h) => isObject(h) && h.command === command));
    if (!present) added.push({ event, entry: { hooks: [{ type: 'command', command, timeout }] } });
  }
  if (added.length === 0) return [`${file} already runs both BrainDog hooks. Nothing to change.`];

  const lines = [`${options.apply ? 'Changed' : 'braindog install would change'} ${file}${had ? '' : ', a new file'}:`];
  for (const { event, entry } of added) lines.push(`  + hooks.${event}: ${JSON.stringify(entry)}`);
  if (!options.apply) return [...lines, 'Nothing was changed. Run braindog install --apply to write it.'];

  const next = { ...settings, hooks: { ...hooks } } as Record<string, unknown> & { hooks: Record<string, unknown> };
  for (const { event, entry } of added) next.hooks[event] = [...((hooks[event] as unknown[] | undefined) ?? []), entry];
  let kept: string | null = null;
  if (had) {
    kept = backupOf(file);
    copyFileSync(file, kept);
  }
  /* Written whole and renamed into place, so a failed write never leaves half a settings file. */
  writeFileSync(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  return [...lines, kept ? `The file as it was is kept at ${kept}.` : 'There was no file before, so there is nothing to keep a copy of.'];
}
