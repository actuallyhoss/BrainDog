/**
 * Whether this machine may keep its skills in step with one BrainDog: one yes, given at a terminal, remembered.
 *
 * NOTHING IS COPIED WITHOUT IT (audit 31 Oct g, AG4). A session's start used to sync every skill and command on the
 * machine into whichever BrainDog the agent pointed at, and write that BrainDog's commands into the Claude Code folder,
 * so connecting an agent to a scratch BrainDog, or one you are only a member of, handed it every private skill here.
 * Now the start work (the skills sync and the tools scan, `session-start.ts`) runs only for a host this file says yes
 * for, and that yes is only ever written by `braindog skills sync` at a terminal, after it has said what it will copy
 * and checked that the person is that BrainDog's owner (`skills.ts`).
 *
 * WITHOUT A YES, A START SAYS SO ONCE: the start hook in its card, the MCP server on stderr and in its next tool answer,
 * each the same one line (`offLine`), and then never again for that host.
 *
 * `~/.braindog/skills-consent.json`: host keys and times, never a key, a token or a path.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';

import { unbom } from './unbom.ts';

/** One host's answer: when the yes was given, and when a start said how to give it. */
type Kept = { yes?: string; no?: string; told?: string };

export const consentPath = (home: string): string => join(home, '.braindog', 'skills-consent.json');

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function readAll(home: string): Record<string, Kept> {
  const file = consentPath(home);
  if (!existsSync(file)) return {};
  try {
    const x: unknown = JSON.parse(unbom(readFileSync(file, 'utf8')));
    if (!isObject(x) || !isObject(x.hosts)) return {};
    const out: Record<string, Kept> = {};
    for (const [host, k] of Object.entries(x.hosts)) {
      if (!isObject(k)) continue;
      out[host] = {
        ...(typeof k.yes === 'string' ? { yes: k.yes } : {}),
        ...(typeof k.no === 'string' ? { no: k.no } : {}),
        ...(typeof k.told === 'string' ? { told: k.told } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Written whole and renamed, at 0600 in a folder made at 0700, as the other files under `~/.braindog` are. */
function keep(home: string, host: string, kept: Kept): void {
  const all = { ...readAll(home), [host]: kept };
  const file = consentPath(home);
  mkdirSync(join(home, '.braindog'), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ hosts: all }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/** Whether the person said yes at a terminal to keeping this machine's skills in step with `host`. */
export function skillsAllowed(home: string, host: string): boolean {
  return readAll(home)[host]?.yes !== undefined;
}

/** The yes, kept for `host`. */
export function allowSkills(home: string, host: string, now: number = Date.now()): void {
  keep(home, host, { yes: new Date(now).toISOString() });
}

/** A no, kept for `host`: nothing is copied, and a start says nothing more about it. */
export function refuseSkills(home: string, host: string, now: number = Date.now()): void {
  const at = new Date(now).toISOString();
  keep(home, host, { no: at, told: at });
}

/**
 * WHAT `setup` AND `env apply` SAY AT THEIR SKILLS STEP WITH NO YES (RG12): they copy nothing either way, since only
 * `braindog skills sync` checks the BrainDog is yours and asks.
 */
export const SKILLS_ASK =
  'none synced, because BrainDog copies skills only after you say yes, and only with a BrainDog you own. Run braindog skills sync to see what it would copy and say yes.';

/**
 * THE ONE LINE A START SAYS WHEN THERE IS NO YES, in the words to type. `braindog skills sync` is the only way on:
 * it says what it would copy, and asks.
 */
export const offLine = (platform: string = process.platform): string =>
  `BrainDog left ${platform === 'darwin' ? 'this Mac' : platform === 'win32' ? 'this PC' : 'this machine'}'s skills and MCP servers alone: it copies them only after you say yes. To keep them in your BrainDog, run braindog skills sync in a terminal.`;

/**
 * `offLine()` the first time a start finds no yes for `host`, and `null` every time after, or when there is a yes.
 * Marked as said before it is returned, so two starts at once say it at most twice, and a home folder that cannot be
 * written says nothing rather than saying it at every start.
 */
export function tellOnce(home: string, host: string, now: number = Date.now()): string | null {
  const kept = readAll(home)[host];
  if (kept?.yes !== undefined || kept?.told !== undefined) return null;
  try {
    keep(home, host, { ...kept, told: new Date(now).toISOString() });
  } catch {
    return null;
  }
  return offLine();
}

/**
 * A yes or no from the person at the terminal, asked on stderr so standard output keeps the command's lines. `null` off
 * a terminal, where nobody can answer. Only `y` or `yes` is a yes, and Ctrl+C is a no.
 */
export async function askAtTerminal(question: string): Promise<boolean | null> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  rl.on('SIGINT', () => rl.close());
  try {
    return /^\s*y(?:es)?\s*$/iu.test(await rl.question(question));
  } catch {
    return false;
  } finally {
    rl.close();
  }
}
