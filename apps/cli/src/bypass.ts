/**
 * `braindog bypass on|off`: "Let your agents do everything without asking", the owner's switch in Settings > Agents
 * (`agents.bypass`, `bypassOf` in `packages/record`).
 *
 * IT OPENS THE APP AT THE SWITCH, AND SETS NOTHING ITSELF. The CLI signs in with a bearer, the same kind of credential
 * every agent on this machine holds, and anything a bearer could switch on an agent could switch on for itself by
 * running this command. So the record takes the switch only from the owner signed in to the app (`setPref`, held to
 * `admin`'s door and, to turn it on, a recent sign-in), and this command takes him there, to press it himself.
 *
 * NO TOKEN IS READ OR SENT: the address is the host the hosts file names, and the page asks him to sign in if needed.
 */

import { execFile } from 'node:child_process';

import { hostKey, hostsPath, readHosts } from './http.ts';

type Env = Record<string, string | undefined>;

/** What `bypassCommand` reads and writes, injectable so a test needs no terminal and no browser. */
export type BypassIo = {
  env: Env;
  out: (line: string) => void;
  err: (line: string) => void;
  /** Opens an address in the person's browser; absent opens nothing and only prints it. */
  open?: ((url: string) => void) | undefined;
};

/** The words, one place, the same as the app's (`apps/web/src/lib/agents/bypass.ts`). */
export const BYPASS_CLI = {
  usage: 'braindog bypass on|off [--host <host>]: opens Settings > Agents, where you turn "Let your agents do everything without asking" on or off.',
  why: 'Only you, signed in to BrainDog, can change this, so an agent on this machine cannot turn it on for itself.',
  on: 'Press "Let your agents do everything without asking" to turn it on.',
  off: 'Press "Let your agents do everything without asking" to turn it off.',
} as const;

/** The address of the switch on a host as the hosts file keys it. */
export const bypassUrl = (host: string): string => `${hostKey(host)}/settings/agents#bypass`;

/** The browser opener this platform has, or none. */
export function systemOpen(url: string): void {
  const [file, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  execFile(file, args as string[], { timeout: 5_000 }, () => undefined);
}

/** Runs the command and answers its exit code. */
export function bypassCommand(argv: readonly string[], io: BypassIo): number {
  const args = [...argv];
  let flag: string | undefined;
  const at = args.indexOf('--host');
  if (at >= 0) {
    flag = args[at + 1];
    args.splice(at, 2);
  }
  const verb = args[0];
  if ((verb !== 'on' && verb !== 'off') || args.length > 1) {
    io.err(BYPASS_CLI.usage);
    return 2;
  }
  let named: string | undefined;
  try {
    named = flag || io.env.BRAINDOG_HOST || readHosts(hostsPath(io.env)).default;
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 1;
  }
  if (!named) {
    io.err('No BrainDog host is set. Pass --host, or sign in first with braindog login.');
    return 1;
  }
  let url: string;
  try {
    url = bypassUrl(named);
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 1;
  }
  io.out(`Opening ${url}`);
  io.out(verb === 'on' ? BYPASS_CLI.on : BYPASS_CLI.off);
  io.out(BYPASS_CLI.why);
  io.open?.(url);
  return 0;
}
