/**
 * The Claude Code sessions still running on a profile, by process id (brief 53-B of `loop/research-cutover-day.md`).
 *
 * A SESSION OPEN ACROSS AN INSTALL KEEPS WHAT IT STARTED WITH. Measured with Claude Code 2.1.280 and stand-ins for the
 * old tool's server and hooks (`loop/research-cutover-day.md` §4): a session held open across `install --replace --apply`
 * on its own profile went on calling the old server 15 seconds later, answered `mcp__braindog__context` with "No such
 * tool", and still listed the old tool's skill. Only its hooks moved over, because Claude Code reloads `settings.json`
 * within a few seconds. So the one fix is to close each window and open it again, and until this file the install gave
 * no way to see which windows those were.
 *
 * THE FOLDER IS CLAUDE CODE'S OWN, AND UNDOCUMENTED. Each running session keeps `<profile>/sessions/<pid>.json`, which
 * is how the survey counted three open on the default profile and two on a named one. The files are READ BY NAME ONLY AND
 * NEVER OPENED: the name is all this needs, and what is inside belongs to a program that may change it in any release.
 * For the same reason any error at all is an empty list, since a folder that moved or a name that changed shape is a
 * profile with nothing this code can say about it, not a reason to stop an install.
 *
 * A PROCESS ID CAN BE REUSED. A file left by a session that crashed names a pid that some later process may hold, and
 * that is named here as open. It errs towards a window somebody checks and finds already closed, which costs a glance;
 * the other way round would leave a live one unnamed.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/* A decimal process id and nothing else, so a `.json` Claude Code keeps there for some other reason is not read as a session. */
const PID_FILE = /^([1-9][0-9]{0,9})\.json$/;

/**
 * Whether a process holds this id. `kill(pid, 0)` sends nothing and only asks.
 *
 * EPERM IS ALIVE: the process exists and belongs to somebody this one may not signal, which on a shared machine is
 * another user's session and still a session.
 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The ids of the sessions open on the profile at `dir`, lowest first, or none. */
export function openSessions(dir: string): number[] {
  try {
    const pids: number[] = [];
    for (const name of readdirSync(join(dir, 'sessions'))) {
      const stem = PID_FILE.exec(name)?.[1];
      if (stem === undefined) continue;
      const pid = Number(stem);
      if (alive(pid)) pids.push(pid);
    }
    return pids.sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * The one line an install prints for a profile with sessions open, or `null` when none is.
 *
 * IT NEVER REFUSES, dry or `--apply`. The person may be running the install from one of these very sessions, and a
 * refusal would block the only window he has open. With `--replace` it says what the measured harm is: each of them goes
 * on writing to the old tool, named by `replacing` as the replace file names it, through the old server until it closes.
 */
export function openSessionsLine(dir: string, pids: number[], replacing: string | null): string | null {
  if (pids.length === 0) return null;
  const count = pids.length === 1 ? '1 Claude Code session is' : `${String(pids.length)} Claude Code sessions are`;
  const which = `${pids.length === 1 ? 'process' : 'processes'} ${pids.join(', ')}`;
  const harm = replacing !== null
    ? `Each keeps the MCP servers and skills it started with, and so goes on writing to ${replacing}, until it closes.`
    : 'Each keeps the MCP servers and skills it started with until it closes, so none of them has BrainDog yet.';
  return `${count} open on ${dir} (${which}). ${harm} Close and reopen each one once this is written.`;
}
