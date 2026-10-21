/**
 * `braindog env check [--profile <name>...] [--json]`: each Claude Code profile's MCP servers as Claude Code itself
 * finds them, connected, waiting on a sign-in, or failed, by name only (`docs/48-SPEC-CLI.md` §5.19). On a new
 * machine it is the last step: each profile's servers set up, which of them still wait for a sign-in in that profile.
 *
 * `claude mcp list` ONCE A PROFILE, with `CLAUDE_CONFIG_DIR` naming it and unset for the default one (`envFor`), in the
 * home folder so no repository's `.mcp.json` is read beside the profile's own, each within `LIST_MS`, three at once.
 *
 * IT RUNS A PROGRAM THAT STARTS EVERY SERVER. Claude Code checks a server by connecting to it, so the list starts each
 * profile's stdio servers. So `claude` is a program entry like any other (`pins.ts`): found on the path or the check
 * stops there and says so, shown whole and asked y/N at a terminal the first time, and pinned by its SHA-256. With no
 * terminal and no pin it is not run. The file found on the path is the one run, so the pin is of what runs.
 *
 * NAMES ONLY. Each server is said by the name a person reads (`healthOf`), one shaped like a key as a hidden name
 * (`namer`), and its status by its mark alone: what Claude Code prints after the mark, an error or an address, is
 * never relayed.
 *
 * IT CHANGES NOTHING but the pin a yes keeps. `code` is 1 when a server waits on a sign-in or failed, or a profile's
 * list could not be read, as `doctor`'s is when it lists anything.
 */

import { parseArgs } from 'node:util';

import { oneLine } from './clip.ts';
import { foundOnPath } from './clients/index.ts';
import { healthOf, LIST_MS, runClaudeList, type Health, type ListRunner } from './clients/connected.ts';
import { ccenvHome, profilesIn, shown } from './doctor.ts';
import { labelsOf, namer } from './env.ts';
import { keepPin, pinOf, pinsFile, readPins } from './pins.ts';
import { askTerminal, envFor } from './setup.ts';
import { eachAtOnce } from './sync.ts';

type Env = Record<string, string | undefined>;

/** What the verb reads beyond its arguments, each a test's to hand in. */
export type CheckIo = {
  home: string;
  env: Env;
  /** How `claude mcp list` runs: `runClaudeList` unless a test holds it. */
  list?: ListRunner | undefined;
  /** The one question before `claude` first runs here: `askTerminal`, null with no terminal, unless a test holds it. */
  ask?: ((question: string) => Promise<boolean | null>) | undefined;
  /** Where the entry is shown before that question: standard error unless a test holds it. */
  say?: ((line: string) => void) | undefined;
  now?: (() => number) | undefined;
};

/** How one profile's list went: read, past its limit, ended with another exit, or `claude` did not start. */
export type Ran = 'read' | 'late' | 'failed' | 'absent';

/** One profile as checked: its name and folder, how its list went, and each server by name with its status. */
export type Checked = { name: string; dir: string; ran: Ran; servers: { name: string; health: Health }[] };

/** What `--json` answers: the `claude` that ran, as a line names it, and each profile. */
export type CheckReport = { claude: string | null; profiles: Checked[] };

/** How many lists run at once: each connects to every server of its profile, and they overlap. */
const AT_ONCE = 3;

/** The words each status is said in, one server and several. */
const SAID: Record<Health, [string, string]> = {
  connected: ['connected', 'connected'],
  'needs sign-in': ['needs a sign-in', 'need a sign-in'],
  failed: ['failed', 'failed'],
  waiting: ['waits for approval in a session', 'wait for approval in a session'],
  off: ['is turned off', 'are turned off'],
};
const ORDER: readonly Health[] = ['connected', 'needs sign-in', 'failed', 'waiting', 'off'];
const HEADING: Record<Health, string> = { connected: 'Connected', 'needs sign-in': 'Needs a sign-in', failed: 'Failed', waiting: 'Waits for approval', off: 'Turned off' };

/** Names joined as a sentence says them: `a`, `a and b`, `a, b and c`. */
const and = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`);

const RAN: Record<Exclude<Ran, 'read'>, string> = {
  late: `claude mcp list took longer than ${String(Math.round(LIST_MS / 1000))} seconds, so its servers were not read.`,
  failed: 'claude mcp list did not finish, so its servers were not read.',
  absent: 'claude did not start, so its servers were not read.',
};

/** The lines: each profile with its count, each status a line naming its servers, then the whole in one sentence. */
export function printCheck(report: CheckReport): string[] {
  const lines = [`braindog env check ran claude mcp list in ${report.profiles.length === 1 ? 'one profile' : `${String(report.profiles.length)} profiles`}.`];
  const tally = new Map<Health, number>();
  for (const p of report.profiles) {
    const where = `${oneLine(p.name)}, ${oneLine(p.dir)}`;
    if (p.ran !== 'read') {
      lines.push(`${where}: ${RAN[p.ran]}`);
      continue;
    }
    if (p.servers.length === 0) {
      lines.push(`${where}: no MCP server.`);
      continue;
    }
    const by = ORDER.map((h) => [h, p.servers.filter((s) => s.health === h).map((s) => s.name)] as const).filter(([, names]) => names.length > 0);
    lines.push(`${where}: ${p.servers.length === 1 ? 'one server' : `${String(p.servers.length)} servers`}, ${and(by.map(([h, names]) => `${String(names.length)} ${SAID[h][names.length === 1 ? 0 : 1]}`))}.`);
    for (const [h, names] of by) {
      lines.push(`  ${HEADING[h]}: ${names.join(', ')}.`);
      tally.set(h, (tally.get(h) ?? 0) + names.length);
    }
  }
  const owed = (['needs sign-in', 'failed'] as const).filter((h) => (tally.get(h) ?? 0) > 0);
  const unread = report.profiles.filter((p) => p.ran !== 'read').length;
  const parts = [
    ...owed.map((h) => {
      const n = tally.get(h) ?? 0;
      return `${String(n)} ${n === 1 ? 'server' : 'servers'} ${SAID[h][n === 1 ? 0 : 1]}`;
    }),
    ...(unread === 0 ? [] : [`${String(unread)} ${unread === 1 ? 'list was' : 'lists were'} not read`]),
  ];
  lines.push(
    parts.length === 0
      ? 'Nothing waits on a sign-in and nothing failed.'
      : `${and(parts)}.${owed.includes('needs sign-in') ? ' Sign in to each from a session in its profile, with /mcp.' : ''}`,
  );
  return lines;
}

/** Whether anything waits on the person: a sign-in, a failure, or a list not read. */
const owes = (report: CheckReport): boolean => report.profiles.some((p) => p.ran !== 'read' || p.servers.some((s) => s.health === 'needs sign-in' || s.health === 'failed'));

/**
 * `braindog env check`: its arguments read, `claude` found and approved, each profile's list run and read. THROWS ONE
 * SENTENCE for an argument it does not take, a profile not on this machine or a pins file that does not read, before
 * anything runs.
 */
export async function envCheck(args: string[], io: CheckIo): Promise<{ lines: string[]; report: CheckReport; json: boolean; code: 0 | 1 }> {
  let values: { profile?: string[] | undefined; json?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, options: { profile: { type: 'string', multiple: true }, json: { type: 'boolean' } }, strict: true }));
  } catch {
    throw new Error('braindog env check takes --profile <name> and --json, and nothing else.');
  }
  const json = values.json === true;
  const found = profilesIn(io.home, [], io.env);
  const labels = labelsOf(found, io.home, ccenvHome(io.home, io.env));
  const here = found.map((dir, i) => ({ dir, name: labels[i] ?? dir }));
  const named = values.profile ?? [];
  if (named.some((n) => !here.some((p) => p.name === n)))
    throw new Error(`braindog env check --profile takes a profile on this machine: ${here.length === 0 ? 'none was found' : and(here.map((p) => p.name))}.`);
  const chosen = named.length > 0 ? here.filter((p) => named.includes(p.name)) : here;
  if (chosen.length === 0) return { lines: ['No Claude Code profile was found on this machine, so nothing was checked.'], report: { claude: null, profiles: [] }, json, code: 0 };

  const claude = foundOnPath('claude', io.env);
  if (claude === null) {
    const lines = ["claude is not on this machine's path, so no profile was checked. Install Claude Code, then run braindog env check again."];
    return { lines, report: { claude: null, profiles: [] }, json, code: 1 };
  }
  const file = pinsFile(io.home);
  const pins = readPins(file);
  if (pins === null) throw new Error(`${file} is not valid JSON, so env check did not run. Delete it, and every program entry is asked about again.`);
  /* THE PROGRAM AS IT RUNS, by the file found on the path, which is the file started below. */
  const entry = { command: claude, args: ['mcp', 'list'] };
  const sha = pinOf('check', 'claude', entry);
  const said = shown(claude, io.home);
  if (pins[sha] === undefined) {
    const say = io.say ?? ((line: string) => void process.stderr.write(`${line}\n`));
    say(`env check runs claude mcp list in each profile, and Claude Code starts each profile's MCP servers to check them. It runs this program: ${JSON.stringify(entry)}`);
    const yes = await (io.ask ?? ((q: string) => askTerminal(q)))('Allow claude mcp list to run on this machine? [y/N] ');
    if (yes !== true) {
      const lines = [
        yes === null
          ? 'claude mcp list runs a program not yet approved on this machine, and no one is at a terminal to approve it, so no profile was checked. Run braindog env check at a terminal once.'
          : 'claude mcp list was not approved on this machine, so no profile was checked.',
      ];
      return { lines, report: { claude: said, profiles: [] }, json, code: 1 };
    }
  }

  const called = namer();
  const run = io.list ?? runClaudeList;
  const profiles = await eachAtOnce(chosen, AT_ONCE, async (p): Promise<Checked> => {
    const got = await run(['mcp', 'list'], io.home, LIST_MS, envFor(p.dir, io.home, io.env), claude);
    const base = { name: p.name, dir: shown(p.dir, io.home) };
    if (got.code === 'absent' || got.code === 'late') return { ...base, ran: got.code, servers: [] };
    if (got.code !== 0) return { ...base, ran: 'failed', servers: [] };
    return { ...base, ran: 'read', servers: healthOf(got.out).entries.map((e) => ({ name: called(e.name), health: e.health })) };
  });
  /* PINNED ONCE IT HAS RUN, with each profile it ran in, for `env pins` to say. */
  const now = (io.now ?? Date.now)();
  for (const p of chosen) keepPin(file, sha, { name: 'claude', kind: 'check', profile: p.name, now });
  const report: CheckReport = { claude: said, profiles };
  return { lines: printCheck(report), report, json, code: owes(report) ? 1 : 0 };
}
