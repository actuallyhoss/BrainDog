/**
 * HIS SWITCH AT WORK: "Keep BrainDog's command line, hooks and skill up to date by itself", in Settings > Agents, kept as
 * his own `agents.self_update` and carried to this command by the attach's context as `build.self_update`. His words of
 * 22 Oct: "to run things related to braindog (with permission) autonomously". The switch is that permission, given once.
 *
 * WHAT IT DOES WHEN A SESSION STARTS, only while the switch is on, and only from an installed build (a checkout is
 * updated with git):
 *   - when the start would tell him this command is behind, it runs `braindog update` itself (`update.ts`): only a newer
 *     build, held to its sum and its release signature, never an older one, with the hooks and skill placed again from it;
 *   - otherwise, when the hooks or the skill in a profile that runs BrainDog's hooks are not this build's, it runs
 *     `install --apply` for those profiles (`staleProfiles` in `install.ts`).
 * It answers one line saying what it did, or why it could not, which the start says in place of "Run braindog update".
 * Off, none of this runs, and the start says what it always said.
 *
 * NEVER A SLOW START. Its reads end at the deadline the start hook hands it, a few seconds inside the hook's own budget,
 * and a read cut short changes nothing: the start then says today's line. A try that did not update is not made again for
 * an hour (`TRIED_EVERY_MS`, kept in `~/.braindog/upkeep.json`), so a slow network costs one start its few seconds, not
 * every start after it. Two starts at once never update together: `update` holds a lock beside the installed file, and a
 * start that finds it held, or finds the file already holding another build than the one it runs, leaves it to the other.
 *
 * IT NEVER THROWS, and whatever fails leaves the command that was there: `update` swaps by one rename after every check.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Context } from '@braindog/client';
import { buildDay } from '@braindog/mcp/build';

import { installProfiles, profilesOf, staleProfiles, type Stale } from './install.ts';
import { buildInBundle } from './installed-build.ts';
import { listedProfiles, type Placed } from './placed.ts';
import { BUSY, update, updating } from './update.ts';

type Env = Record<string, string | undefined>;

/** The most a session's start waits on an update's reads. The 7.6 MB bundle took 1.7 s on the owner's line (9 Nov). */
export const UPKEEP_MS = 4_000;

/** What the start hook keeps of its own budget after the reads: the checks, the swap, the placing and the card. */
export const UPKEEP_ROOM_MS = 2_000;

/** With less than this left before the deadline, no update is begun: it could not finish. */
export const UPKEEP_LEAST_MS = 1_000;

/** How long a try that did not update waits before the next one. */
export const TRIED_EVERY_MS = 60 * 60_000;

/**
 * What the start says of it. `said` is the one line, or `null` for none. `handled` is whether that takes the place of
 * every line that tells him to run braindog update; when it does not, the start says what it always said.
 */
export type Upkept = { said: string | null; handled: boolean };

/** Nothing done here: the start says what it always said. */
export const NOT_KEPT: Upkept = { said: null, handled: false };

/** Whether his switch is on, as the attach's context says it. */
export const upkeepOn = (c: Context | undefined): boolean => (c as { build?: { self_update?: unknown } | null } | undefined)?.build?.self_update === true;

export type UpkeepIo = {
  /** The installed bundle this process runs, which `update` replaces. */
  file: string;
  /** This command's build, and when it was released (`__RELEASED__`), in seconds. */
  build: string;
  released: number;
  env: Env;
  home: string;
  /** The folder of the hook scripts beside the bundle (`hookScripts` in `main.ts`), or `null` when it could not be written. */
  scripts: string | null;
  /** Whether the start would tell him this command is behind its host. */
  behind: boolean;
  /** When its reads must end, in epoch milliseconds. */
  deadline: number;
  now?: number;
  /** Where the builds are read and what reads them, for a test. */
  base?: string;
  fetch?: typeof fetch;
  keys?: readonly string[];
  place?: (file: string) => Placed;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A build as a person says it, `9 Nov`; the build itself when it has no day. */
function dayOf(build: string): string {
  const day = buildDay(build);
  if (day === null) return build;
  const [, m, d] = day.split('.').map(Number) as [number, number, number];
  return `${String(d)} ${MONTHS[m - 1] ?? ''}`.trim();
}

/** The first sentence of what was said: the plain reason. What follows it is advice for a person at a terminal. */
const firstOf = (said: string): string => /^.*?[.!?](?=\s|$)/su.exec(said.trim())?.[0] ?? said.trim();

/** The line for a build that went in: from which day to which, and whether its hooks and skill went in with it. */
export function updatedLine(was: string, now: string, placed: Placed): string {
  const [from, to] = [dayOf(was), dayOf(now)];
  const moved = from === to ? `to a newer build of ${to}` : `from ${from} to ${to}`;
  return placed.failed === null
    ? `BrainDog updated its command line, hooks and skill ${moved}.`
    : `BrainDog updated its command line ${moved}, but its hooks and skill were not placed again (${placed.failed}). Run braindog install --apply.`;
}

/** The line for an update that did not happen, with `update`'s own reason; the command that was there stays. */
export const failedLine = (why: string): string => (why.trim() === '' ? 'BrainDog could not update its command line, so it stays as it was.' : `BrainDog could not update its command line. ${firstOf(why)}`);

/** Which of the two a set of profiles had older, as the lines name them. */
const whatOf = (stale: readonly Stale[]): string => {
  const hooks = stale.some((s) => s.hooks);
  const skill = stale.some((s) => s.skill);
  return hooks && skill ? 'hooks and skill' : hooks ? 'hooks' : 'skill';
};

/** The line for hooks or a skill brought to this build. */
export const placedLine = (stale: readonly Stale[]): string => `BrainDog brought its ${whatOf(stale)} up to date${stale.length > 1 ? ` in ${String(stale.length)} profiles` : ''}.`;

/* ── the hour between tries ────────────────────────────────────────────── */

/** Where the last try that did not update is kept, as `{ at }`. */
export const upkeepPath = (home: string): string => join(home, '.braindog', 'upkeep.json');

/** Whether a try that did not update was made within the hour. A file that does not read is none. */
function triedLately(home: string, now: number): boolean {
  try {
    const kept: unknown = JSON.parse(readFileSync(upkeepPath(home), 'utf8'));
    const at = typeof kept === 'object' && kept !== null && typeof (kept as { at?: unknown }).at === 'string' ? Date.parse((kept as { at: string }).at) : Number.NaN;
    return Number.isFinite(at) && at <= now && now - at < TRIED_EVERY_MS;
  } catch {
    return false;
  }
}

/** Kept before the try, so a try the session's own end cuts short is not made again at every start. */
function markTried(home: string, now: number): void {
  try {
    const file = upkeepPath(home);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${String(process.pid)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ at: new Date(now).toISOString() })}\n`, { mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    /* Not kept: the next start may try again, which costs it the wait and nothing more. */
  }
}

/** Taken away once a try finds the command current, so the next release is taken at the first start after it. */
function clearTried(home: string): void {
  try {
    rmSync(upkeepPath(home), { force: true });
  } catch {
    /* Left, it only holds the next try back for the rest of its hour. */
  }
}

/** Whether the installed file already holds another build than the one this process runs: another start, or he, updated it. */
function movedOn(file: string, build: string): boolean {
  try {
    const there = buildInBundle(readFileSync(file, 'utf8'));
    return there !== null && there !== build;
  } catch {
    return false;
  }
}

/* ── the upkeep ────────────────────────────────────────────────────────── */

/**
 * What the start does for his switch, and the line it says (see the top of this file). `handled` with no line is a
 * command another start is updating, or one already current: nothing to say, and nothing to tell him to run.
 */
export async function upkeep(io: UpkeepIo): Promise<Upkept> {
  try {
    if (buildDay(io.build) === null) return NOT_KEPT;
    const now = io.now ?? Date.now();
    if (io.behind) {
      if (updating(io.file, now) || movedOn(io.file, io.build)) return { said: null, handled: true };
      const left = io.deadline - now;
      if (left < UPKEEP_LEAST_MS || triedLately(io.home, now)) return NOT_KEPT;
      markTried(io.home, now);
      const signal = AbortSignal.timeout(left);
      const refused: string[] = [];
      let went = null as Upkept | null;
      const code = await update([], {
        file: io.file,
        build: io.build,
        released: io.released,
        env: io.env,
        home: io.home,
        out: () => undefined,
        err: (line) => void refused.push(line),
        signal,
        updated: (was, to, placed) => {
          went = { said: updatedLine(was, to, placed), handled: true };
        },
        ...(io.base === undefined ? {} : { base: io.base }),
        ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
        ...(io.keys === undefined ? {} : { keys: io.keys }),
        ...(io.place === undefined ? {} : { place: io.place }),
      });
      /* IN PLACE, and placed again from the new build; this process is the old one, so it places nothing itself. */
      if (went !== null) {
        clearTried(io.home);
        return went;
      }
      /* ANOTHER START TOOK THE LOCK A MOMENT BEFORE THIS ONE: it is the one updating, and it says so in its own session. */
      if (code !== 0 && refused[0] === BUSY) return { said: null, handled: true };
      /* CUT SHORT BY THE DEADLINE, nothing changed: the start says today's line. Any other refusal is said once, plainly. */
      if (code !== 0) return signal.aborted ? NOT_KEPT : { said: failedLine(refused[0] ?? ''), handled: true };
      /* NOTHING NEWER IS OUT, so there is nothing to tell him to run, and the hooks and skill are brought to this build. */
      clearTried(io.home);
      return placeHere(io) ?? { said: null, handled: true };
    }
    return placeHere(io) ?? NOT_KEPT;
  } catch {
    return NOT_KEPT;
  }
}

/**
 * The hooks and the skill brought to this build, in each profile that runs BrainDog's hooks and holds older ones, by the
 * same write `install --apply` makes (each file's copy kept beside it); `null` when every one is current already. The
 * profiles are the ones `braindog update` places again (`placeAgain`): `~/.braindog/profiles.json`, else this session's.
 */
function placeHere(io: UpkeepIo): Upkept | null {
  if (io.scripts === null) return null;
  const stale = staleProfiles(listedProfiles(io.home) ?? profilesOf([], io.env), io.scripts);
  if (stale.length === 0) return null;
  try {
    installProfiles(stale.map((s) => s.dir), [], { apply: true, scripts: io.scripts });
    return { said: placedLine(stale), handled: true };
  } catch (e) {
    const why = firstOf(e instanceof Error ? e.message : String(e)).replace(/\.$/u, '');
    return { said: `BrainDog could not bring its ${whatOf(stale)} up to date (${why}). Run braindog install --apply.`, handled: true };
  }
}
