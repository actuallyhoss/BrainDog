/**
 * `braindog statusline`, which Claude Code runs to draw its status line, with its JSON on standard input: one short line
 * back (the model, the folder's name, how much of the 5 hour and 7 day limits is used, and when the limit resets), and
 * every five minutes at most a beat to the Profiles add-on's list so the page can show the same figures.
 *
 * THE PRINT PATH TOUCHES NO NETWORK. It parses what it was given, prints, reads the age of one file and, only when five
 * minutes have passed, starts a detached child that sends the beat (`statusline --beat`), so a slow or dead host never
 * delays the line. The stamp is written before the child starts, so ten windows drawing at once send one beat.
 *
 * THE BEAT CARRIES FIGURES AND NAMES ONLY: the profile's name (`profileNameOf`, never a path), the machine, the two
 * percentages and the reset time. No folder, no model, no session, nothing anyone typed. SHOWN, NEVER ACTED ON: nothing
 * here rotates a profile or stops one. A record without the Profiles add-on takes the beat and does nothing with it.
 *
 * THIS FILE IMPORTS NOTHING BUT NODE'S OWN MODULES AND `position.ts`, because Claude Code runs the print path on every
 * redraw through `statusline-entry.ts`, a file of its own (`STATUSLINE_FILE`). Sending the beat (the network, the
 * record's door) is `statusline-beat.ts`, which only the detached child loads.
 *
 * `--beat-only` (`BEAT_ONLY`) IS THE SAME PATH WITH NOTHING PRINTED, for a status line of his own: his program draws the
 * line it always drew and pipes the same JSON to `braindog statusline --beat-only` (or the small entry with that word),
 * so his meters reach the Profiles page without BrainDog ever taking his `statusLine` (`statusline-place.ts`).
 *
 * THE EVENT'S OWN SESSION TEXT IS NEVER READ: only `model`, `workspace` and `rate_limits` are, each defensively, since
 * any of them may be missing.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { basename, join } from 'node:path';

import { profileNameOf } from './position.ts';

/** The word that sends the beat and prints nothing, for a status line that draws its own line. */
export const BEAT_ONLY = '--beat-only';

/** What the command writes for these words: the line and a newline, or nothing at all under `--beat-only`. */
export const statusOut = (line: string, args: readonly string[]): string => (args.includes(BEAT_ONLY) ? '' : `${line}\n`);

/** How often a profile's beat leaves this machine at most. */
export const STATUS_EVERY_MS = 5 * 60_000;
export type Env = Record<string, string | undefined>;

/** What the line is drawn from. Every part may be missing. */
export type Status = { model: string | null; folder: string | null; five: number | null; seven: number | null; resets: number | null };

/** The beat, as sent: what `statusline --beat` is handed on standard input and what it writes into the record. */
export type StatusBeat = { profile: string; machine: string; five_hour_pct: number | null; seven_day_pct: number | null; resets_at: string | null };

export const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

/* A used percentage as a whole number from 0 to 100, or null. Claude Code says it as a number or a numeric string. */
export function percent(x: unknown): number | null {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
}

/* A reset time in milliseconds: epoch seconds (or milliseconds) as a number, or an ISO string. */
function when(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x) && x > 0) return x < 1e11 ? x * 1000 : x;
  if (typeof x === 'string' && x.trim() !== '') {
    const t = Date.parse(x);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** One limit window: `used_percentage` (or `utilization`) and `resets_at`. */
function windowOf(x: unknown): { pct: number | null; at: number | null } {
  if (!isObject(x)) return { pct: null, at: null };
  return { pct: percent(x.used_percentage ?? x.utilization ?? x.used_pct), at: when(x.resets_at ?? x.reset_at) };
}

/** What the status JSON says, read defensively: bad JSON, a missing field or a wrong type is a null, never a throw. */
export function parseStatus(raw: string): Status {
  let event: unknown = null;
  try {
    event = JSON.parse(raw);
  } catch {
    /* An empty or broken event draws an empty line. */
  }
  const e = isObject(event) ? event : {};
  const limits = isObject(e.rate_limits) ? e.rate_limits : {};
  const five = windowOf(limits.five_hour ?? limits['5h']);
  const seven = windowOf(limits.seven_day ?? limits['7d']);
  const model = isObject(e.model) ? (text(e.model.display_name) ?? text(e.model.id)) : text(e.model);
  const dir = isObject(e.workspace) ? text(e.workspace.current_dir) : null;
  const folder = dir === null ? null : text(basename(dir.replace(/[\\/]+$/u, '').replace(/\\/gu, '/')));
  /* THE SOONER RESET IS THE ONE SAID: the 5 hour window's, else the week's. */
  return { model, folder, five: five.pct, seven: seven.pct, resets: five.at ?? seven.at };
}

/** A reset time as a person reads it here: the clock, with the weekday when it is not today. */
export function resetShown(at: number, now: number): string {
  const d = new Date(at);
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return new Date(now).toDateString() === d.toDateString() ? clock : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${clock}`;
}

/** The one short line: only the parts the event had, joined by a bar. */
export function statusLine(s: Status, now: number = Date.now()): string {
  const parts = [s.model, s.folder, s.five === null ? null : `5h ${String(s.five)}%`, s.seven === null ? null : `7d ${String(s.seven)}%`, s.resets === null ? null : `resets ${resetShown(s.resets, now)}`];
  return parts.filter((p): p is string => p !== null).join(' | ');
}

/* ── the five minutes, kept on this machine ────────────────────────────── */

/** One profile's stamp, named by the profile (a name and never a path), under the home the command is given. */
export const statusStamp = (home: string, profile: string): string => join(home, '.braindog', 'statusline', profile.replace(/[^A-Za-z0-9._-]/gu, '_'));

/** Whether the stamp was written inside the last five minutes. A stamp that cannot be read is an old one. */
export function statusFresh(stamp: string, now: number = Date.now()): boolean {
  try {
    return now - statSync(stamp).mtimeMs < STATUS_EVERY_MS;
  } catch {
    return false;
  }
}

/** The beat for this event, or null when it has no figure to send. Names and numbers only. */
export function beatOf(profile: string, machine: string, s: Status): StatusBeat | null {
  if (s.five === null && s.seven === null) return null;
  return { profile, machine, five_hour_pct: s.five, seven_day_pct: s.seven, resets_at: s.resets === null ? null : new Date(s.resets).toISOString() };
}

/** What `statusline` is handed, and what it does with the beat: a test holds `send`, the command starts a child. */
export type StatusIo = { env: Env; stdin: string; home?: string | undefined; machine?: string | undefined; now?: number | undefined; send?: ((beat: StatusBeat) => void) | undefined; cli?: string | undefined };

/** Start the child that sends the beat, detached, with the beat on its standard input and nothing back. */
export function spawnBeat(beat: StatusBeat, script: string = process.argv[1] ?? ''): void {
  try {
    const child = spawn(process.execPath, [script, 'statusline', '--beat'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    child.on('error', () => undefined);
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(beat));
    child.unref();
  } catch {
    /* A beat that could not start costs the next five minutes' figures, and the line is already printed. */
  }
}

/** The line to print. Sends a beat (through `send`) when five minutes have passed for this profile. Never throws. */
export function statusline(io: StatusIo): string {
  const now = io.now ?? Date.now();
  const s = parseStatus(io.stdin);
  const line = statusLine(s, now);
  try {
    const profile = profileNameOf(io.env, io.home);
    const machine = io.machine ?? hostname();
    const beat = profile === null ? null : beatOf(profile, machine, s);
    if (profile !== null && beat !== null) {
      const stamp = statusStamp(io.home ?? homedir(), profile);
      if (!statusFresh(stamp, now)) {
        /* THE STAMP FIRST, so draws made while the child starts, and a host that is down, wait the five minutes. */
        try {
          mkdirSync(join(io.home ?? homedir(), '.braindog', 'statusline'), { recursive: true, mode: 0o700 });
          writeFileSync(stamp, new Date(now).toISOString());
          utimesSync(stamp, new Date(now), new Date(now));
        } catch {
          /* A folder that cannot be written sends a beat at every draw while it stays so; the child is still one process. */
        }
        (io.send ?? ((b) => spawnBeat(b, io.cli)))(beat);
      }
    }
  } catch {
    /* The line is the point. */
  }
  return line;
}
