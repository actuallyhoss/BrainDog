/**
 * Placing `statusLine: { type: "command", command: "braindog statusline" }` in a Claude Code profile's settings, for
 * `env apply` and `setup`.
 *
 * ONLY WHERE THE PROFILE HAS NO STATUS LINE YET. A `statusLine` of his own, whatever it holds, is never read into,
 * changed or replaced, and neither is a settings file that does not read as an object. It runs a program on every draw,
 * so the callers show it whole and ask y/N, and a yes is pinned (`pins.ts`, kind `statusline`) as the hooks are.
 *
 * A COPY OF THE FILE IS KEPT FIRST (`keepCopy`), and the new text is written beside it and renamed over it.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { keepCopy, shellWord } from './install.ts';

/** The status line's own entry, written beside the hook scripts: `statusline-entry.ts` built on its own (`scripts/bundle.mjs`). */
export const STATUSLINE_FILE = 'braindog-statusline.mjs';

/** The program that draws the line from a folder of hook scripts: the bundle's own entry there, else a checkout's source. */
export const statuslineEntryIn = (scripts: string): string => (existsSync(join(scripts, STATUSLINE_FILE)) ? join(scripts, STATUSLINE_FILE) : resolve(scripts, '..', 'src', 'statusline-entry.ts')).replaceAll('\\', '/');

/** The entry placed: Node on that small file, so a redraw does not load the whole command. */
export const statusLineEntry = (scripts: string): { type: 'command'; command: string } => ({ type: 'command', command: `node ${shellWord(statuslineEntryIn(scripts))}` });

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The profile's settings file. */
export const settingsOf = (dir: string): string => join(dir, 'settings.json');

/** What a profile's settings say of a status line: one is there, none is, or the file does not read as a settings object. */
export function statusLineIn(dir: string): 'has' | 'none' | 'unreadable' {
  const file = settingsOf(dir);
  if (!existsSync(file)) return 'none';
  try {
    const x: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isObject(x) ? (x.statusLine === undefined ? 'none' : 'has') : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** Write the entry into a profile that has none, after a copy of its settings. The copy's name, or null when there was no file. */
export function placeStatusLine(dir: string, scripts: string): { kept: string | null } {
  const file = settingsOf(dir);
  if (statusLineIn(dir) !== 'none') throw new Error(`${file} already has a statusLine or does not read as settings, so it was left alone.`);
  const settings: Record<string, unknown> = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  const kept = keepCopy(file);
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...settings, statusLine: statusLineEntry(scripts) }, null, 2)}\n`);
  renameSync(tmp, file);
  return { kept };
}
