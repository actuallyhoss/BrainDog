/**
 * Whether the command installed on this machine is newer than the one this long-lived process started from.
 *
 * A BRIDGE OUTLIVES AN UPDATE. `braindog mcp` runs as long as its session, and `braindog update` renames a new bundle
 * over the installed file under it, so a session opened the day before kept answering as the old build: on the owner's
 * Mac a bridge said `2026.10.22+c6504b3` and `behind: false` while the installed command was `2026.10.23+ae3f232` and
 * the start hook of every new session said "out of date". The bridge now looks at the installed file, and says once,
 * in the next answer the agent reads, that a newer command is installed and a new session uses it.
 *
 * CHEAP: one `stat` a minute at most, and the file is read only when its modification time moved since the process
 * started. The build is read off the bundle's own `cliBuild`, the one literal `bundle.mjs` writes beside `dev+0000000`.
 * Any fault (no file, a checkout, a file that holds no build) is silence, never a failed answer.
 */

import { readFileSync, statSync } from 'node:fs';

import { buildDay } from '@braindog/mcp/build';

/** How often the installed file is looked at, at most. */
export const LOOK_EVERY_MS = 60_000;

/** The build a bundle carries, as `bundle.mjs` writes `cliBuild`: `true ? "2026.10.23+ae3f232" : "dev+0000000"`. */
const BUNDLED = /\?\s*"(\d{4}\.\d{2}\.\d{2}\+[0-9a-f]{7,40})"\s*:\s*"dev\+0000000"/u;

/** The build a bundle's text carries, or `null` when it carries none (a checkout's source file). */
export function buildInBundle(text: string): string | null {
  return BUNDLED.exec(text)?.[1] ?? null;
}

/** The line the next answer carries once a newer command is installed under this session. */
export const newerSaid = (mine: string, installed: string): string =>
  `BrainDog's command on this machine went from ${buildDay(mine) ?? mine} to ${buildDay(installed) ?? installed} while this session was open. Its hooks use the new one already and its tools come from BrainDog itself, so nothing needs restarting.`;

export type InstalledIo = {
  /** The installed bundle this process runs. */
  file: string;
  /** This process's own build. */
  mine: string;
  now?: () => number;
  stat?: (file: string) => { mtimeMs: number };
  read?: (file: string) => string;
};

/**
 * A check to call before each answer: the line to say once a newer build is installed than `mine`, else `null`. After
 * it has said it once it is silent for good. A build with no day (a checkout) never says it.
 */
export function watchInstalled(io: InstalledIo): () => string | null {
  const now = io.now ?? Date.now;
  const stat = io.stat ?? ((f: string) => statSync(f));
  const read = io.read ?? ((f: string) => readFileSync(f, 'utf8'));
  const mineDay = buildDay(io.mine);
  let said = mineDay === null;
  let first: number | null = null;
  let lastLook = Number.NEGATIVE_INFINITY;
  try {
    first = stat(io.file).mtimeMs;
  } catch {
    said = true;
  }
  return () => {
    if (said) return null;
    const at = now();
    if (at - lastLook < LOOK_EVERY_MS) return null;
    lastLook = at;
    try {
      const moved = stat(io.file).mtimeMs;
      if (moved === first) return null;
      first = moved;
      const installed = buildInBundle(read(io.file));
      const day = buildDay(installed);
      if (installed === null || installed === io.mine || day === null || day < mineDay!) return null;
      said = true;
      return newerSaid(io.mine, installed);
    } catch {
      return null;
    }
  };
}

/**
 * The build installed on this machine when it is newer than `mine`, else `null`, looked at as `watchInstalled` looks:
 * one `stat` a minute at most, and the file read only when its time moved. A bridge says it as `x-braindog-cli`
 * (`bridge.ts`), so once the command was updated under an open session the record stops calling the machine behind,
 * which before kept every open session's card on "This command is older" until the session ended.
 */
export function installedNow(io: InstalledIo): () => string | null {
  const now = io.now ?? Date.now;
  const stat = io.stat ?? ((f: string) => statSync(f));
  const read = io.read ?? ((f: string) => readFileSync(f, 'utf8'));
  const mineDay = buildDay(io.mine);
  let seen: number | null = null;
  let lastLook = Number.NEGATIVE_INFINITY;
  let newer: string | null = null;
  try {
    seen = stat(io.file).mtimeMs;
  } catch {
    /* No file: nothing newer is ever said. */
  }
  return () => {
    if (mineDay === null || seen === null) return newer;
    const at = now();
    if (at - lastLook < LOOK_EVERY_MS) return newer;
    lastLook = at;
    try {
      const moved = stat(io.file).mtimeMs;
      if (moved === seen) return newer;
      seen = moved;
      const there = buildInBundle(read(io.file));
      const day = buildDay(there);
      newer = there !== null && there !== io.mine && day !== null && day >= mineDay ? there : null;
    } catch {
      /* Kept as it was: a file caught mid-rename is read again a minute on. */
    }
    return newer;
  };
}
