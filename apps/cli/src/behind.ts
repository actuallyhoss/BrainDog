/**
 * Whether this command is behind the host it talks to, said in one line where the start hook prints the lapse warning.
 *
 * THE HOST SAYS WHAT IT NEEDS AT ITS BUILD ADDRESS, `/.well-known/braindog-build`, as `{ app, min_cli }` with no
 * credential (`packages/mcp/src/build.ts`). A command built on a day before `min_cli` is one the host no longer works
 * with, and is told it needs the update. One more than fourteen days older than the host's own build still works, and
 * is told it can update. Both come down to the day of a build, as `min_cli` is written; a checkout's build, which has no
 * day, is never called behind.
 *
 * AT MOST ONCE A DAY PER HOST, in two seconds. The answer is kept in `~/.braindog/update-check.json` beside when it was
 * asked, and every start inside the day reads the kept answer against this command's own build, so a command just
 * updated stops saying it at once and nothing waits on the network. A host that does not answer is asked again the next
 * day and says nothing meanwhile.
 *
 * IT NEVER FAILS THE HOOK. Every fault, a hosts file that cannot be read included, is no line at all: the start hook
 * says what is wrong with the login itself.
 *
 * IT NEVER UPDATES. Replacing the command under a session that has started is the person's to choose (planner-39), so
 * this only says `braindog update`. His switch in Settings > Agents is that choice made once: with it on, the start hook
 * updates instead (`upkeep.ts`), and this line is not said beside what it did.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildDay } from '@braindog/mcp/build';

import { doctor } from './doctor.ts';
import { hostKey, hostsPath, readHosts } from './http.ts';
import { cliBuild } from './position.ts';

type Env = Record<string, string | undefined>;

/** How long one answer is kept before the host is asked again. */
export const CHECK_EVERY_MS = 86_400_000;

/** The most the start hook waits for the build address. */
export const CHECK_MS = 2_000;

/** More days than this behind the host's own build, and the command is told it can update. */
export const BEHIND_DAYS = 14;

const DAY_MS = 86_400_000;
const DAY = /^\d{4}\.\d{2}\.\d{2}$/;

export type BehindIo = {
  env: Env;
  /** The home folder `~/.braindog` is in; the process's own unless a test gives one. */
  home?: string | undefined;
  /** This command's build; `cliBuild()` unless a test gives one. */
  build?: string | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  now?: number | undefined;
};

/** What a host said at its build address, and when it was asked. */
export type Checked = { at: string; app: string | null; min_cli: string | null };

type CheckFile = { hosts: Record<string, Checked> };

export const checkPath = (home: string): string => join(home, '.braindog', 'update-check.json');

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const textOr = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

function readChecks(file: string): CheckFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (isObject(parsed) && isObject(parsed.hosts)) return parsed as CheckFile;
  } catch {
    /* None yet, or not one this command wrote: asked again, and written whole. */
  }
  return { hosts: {} };
}

/** Written whole and renamed into place, so two hooks starting at once never leave half a file. */
function writeChecks(file: string, checks: CheckFile): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(checks, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/** Whole days from one build day to a later one, `2026.10.01` to `2026.10.16` is 15. */
const daysBetween = (from: string, to: string): number => {
  const at = (day: string) => {
    const [y, m, d] = day.split('.').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / DAY_MS);
};

/**
 * The line for a command of `build` against what a host said, or `null`. `host` is the host as the person writes it.
 * Older than `min_cli` is "needs"; more than fourteen days behind the host's own build is "can".
 */
export function behindSaid(build: string, checked: Pick<Checked, 'app' | 'min_cli'>, host: string): string | null {
  const mine = buildDay(build);
  if (mine === null) return null;
  const min = checked.min_cli !== null && DAY.test(checked.min_cli) ? checked.min_cli : buildDay(checked.min_cli);
  const app = buildDay(checked.app);
  const verb = min !== null && mine < min ? 'needs' : app !== null && daysBetween(mine, app) > BEHIND_DAYS ? 'can' : null;
  return verb === null ? null : `This command is older than ${host} ${verb}. Run braindog update.`;
}

/** The host as a person writes it: its name, `brain.dog`, never the address with its scheme and path. */
export const hostName = (key: string): string => new URL(key).host;

/** What the build address answers, or `null` for no answer, a wrong one, or none inside `ms`. */
async function ask(get: typeof globalThis.fetch, key: string, ms: number): Promise<Pick<Checked, 'app' | 'min_cli'> | null> {
  try {
    const res = await get(`${new URL(key).origin}/.well-known/braindog-build`, { signal: AbortSignal.timeout(ms), redirect: 'error' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isObject(body)) return null;
    return { app: textOr(body.app), min_cli: textOr(body.min_cli) };
  } catch {
    return null;
  }
}

/**
 * The start hook's line when this command is behind the default host, or `null`. Never throws, and waits at most two
 * seconds, only on the first start of a day.
 */
export async function behindLine(io: BehindIo): Promise<string | null> {
  try {
    const build = io.build ?? cliBuild();
    if (buildDay(build) === null) return null;
    const named = io.env.BRAINDOG_HOST || readHosts(hostsPath(io.env)).default;
    if (!named) return null;
    const key = hostKey(named);
    const now = io.now ?? Date.now();
    const file = checkPath(io.home ?? homedir());
    const checks = readChecks(file);
    const kept = isObject(checks.hosts[key]) ? checks.hosts[key] : undefined;
    const fresh = kept !== undefined && now - Date.parse(kept.at) < CHECK_EVERY_MS && Date.parse(kept.at) <= now;
    let said: Pick<Checked, 'app' | 'min_cli'> | null = fresh ? { app: textOr(kept.app), min_cli: textOr(kept.min_cli) } : null;
    if (!fresh) {
      said = await ask(io.fetch ?? globalThis.fetch, key, CHECK_MS);
      /* Asked today whatever came back, so a host that is down costs one start a day its two seconds, and no more. */
      const next: Checked = { at: new Date(now).toISOString(), app: said?.app ?? textOr(kept?.app), min_cli: said?.min_cli ?? textOr(kept?.min_cli) };
      try {
        writeChecks(file, { hosts: { ...checks.hosts, [key]: next } });
      } catch {
        /* A home that cannot be written asks again next time; the hook still says what it knows. */
      }
      said ??= kept === undefined ? null : { app: next.app, min_cli: next.min_cli };
    }
    return said === null ? null : behindSaid(build, said, hostName(key));
  } catch {
    return null;
  }
}

/** How long one quiet doctor run is kept before the start hook runs it again. */
export const DOCTOR_EVERY_MS = 7 * 86_400_000;

/**
 * Whether this command is an installed build (one with a day), not a checkout run by `node`. The weekly doctor line is
 * said only by an installed build, as `behindLine` is, so a checkout's own tests and a developer's starts never run it.
 */
export const installedBuild = (build: string = cliBuild()): boolean => buildDay(build) !== null;

export const doctorCheckPath = (home: string): string => join(home, '.braindog', 'doctor-check.json');

/**
 * ONCE A WEEK, THE START HOOK RUNS `braindog doctor` QUIETLY, and says one line beside `behindLine`'s when it lists
 * anything. When it was last run is kept in `~/.braindog/doctor-check.json` as `{ at }`, written before the run, so a run
 * that throws or hangs is not tried again on every start. It asks nothing and files nothing, and any fault is no line.
 */
export function doctorLine(home: string, now = Date.now(), run: () => { report: { places: readonly unknown[] }; code: number } = () => doctor([], { home })): string | null {
  try {
    const file = doctorCheckPath(home);
    let at = Number.NaN;
    try {
      const kept: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (isObject(kept) && typeof kept.at === 'string') at = Date.parse(kept.at);
    } catch {
      /* None yet: run now. */
    }
    if (Number.isFinite(at) && at <= now && now - at < DOCTOR_EVERY_MS) return null;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${String(process.pid)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ at: new Date(now).toISOString() })}\n`, { mode: 0o600 });
    renameSync(tmp, file);
    const out = run();
    return out.code === 1 && out.report.places.length > 0 ? `braindog doctor lists ${String(out.report.places.length)} places to fix. Run braindog doctor to see them.` : null;
  } catch {
    return null;
  }
}
