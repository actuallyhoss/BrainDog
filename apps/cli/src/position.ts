/**
 * Where a session stands: the folder, the repository, its remote, the machine, the branch and the
 * commit. The record resolves a project from these, so they travel with every call as the session
 * headers of `loop/research-agent-path.md` §3.4.
 *
 * A REPOSITORY IS A GIT TOP-LEVEL FOLDER OR NOTHING. A temporary folder is not a project, so outside
 * a work tree every git field is null rather than a guess.
 */

import { execFile } from 'node:child_process';
import { hostname } from 'node:os';
import { basename } from 'node:path';

export const AGENTS = ['claude', 'codex', 'cursor', 'other'] as const;
export type Agent = (typeof AGENTS)[number];
export const isAgent = (x: unknown): x is Agent => (AGENTS as readonly unknown[]).includes(x);

export type Position = {
  cwd: string;
  repo: string | null;
  remote: string | null;
  host: string;
  branch: string | null;
  head: string | null;
};

/* Three seconds each, because a hung git (a network drive, a held lock) must not hold the first call. */
const git = (cwd: string, ...args: string[]) =>
  new Promise<string | null>((done) =>
    execFile('git', args, { cwd, timeout: 3_000, windowsHide: true }, (e, out) => done(e ? null : out.trim() || null)),
  );

/** Never rejects: a machine without git, or a folder outside a work tree, is a position with nulls. */
export async function positionOf(cwd: string): Promise<Position> {
  const top = await git(cwd, 'rev-parse', '--show-toplevel');
  const [branch, head, origin] =
    top === null
      ? [null, null, null]
      : await Promise.all([
          git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'),
          git(cwd, 'rev-parse', '--short', 'HEAD'),
          git(cwd, 'remote', 'get-url', 'origin'),
        ]);
  return {
    cwd,
    repo: top === null ? null : basename(top),
    remote: origin === null ? null : normaliseRemote(origin),
    host: hostname(),
    /* `HEAD` is what git says for a detached head, which is no branch at all. */
    branch: branch === 'HEAD' ? null : branch,
    head,
  };
}

/**
 * A remote as the plan's §6.1 compares it: scheme, `user@` and `.git` dropped, the host lower-cased,
 * and `git@host:a/b` written `host/a/b`.
 *
 * DROPPING THE USER HALF ALSO DROPS ANY CREDENTIAL. `https://name:password@host/a/b` is a real way
 * people clone, and this value leaves the machine in a header.
 */
export function normaliseRemote(url: string): string | null {
  const text = url.trim();
  let host: string;
  let path: string;
  const scp = /^(?:[^@/]+@)?([^/:]+):(?!\/)(.+)$/.exec(text);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    /* A one-letter host is a Windows drive, as in C:\repos\x: a path, not a remote. */
    if (scp[1]!.length === 1) return null;
    host = scp[1]!;
    path = scp[2]!;
  } else {
    try {
      const parsed = new URL(text);
      host = parsed.host;
      path = parsed.pathname;
    } catch {
      return null;
    }
  }
  if (!host) return null;
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  return path ? `${host.toLowerCase()}/${path}` : host.toLowerCase();
}

const printable = (max: number) => new RegExp(`^[\\x20-\\x7e]{1,${max}}$`);

/* The grammar of the plan's §3.4. `Session` and `Client` wait for the session file the start hook
   writes, so they are not sent yet. */
const GRAMMAR: Record<string, RegExp> = {
  'x-braindog-host': /^[A-Za-z0-9._-]{1,128}$/,
  'x-braindog-repo': /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  'x-braindog-remote': printable(256),
  'x-braindog-cwd': printable(512),
  'x-braindog-agent': new RegExp(`^(?:${AGENTS.join('|')})$`),
};

/**
 * The headers a position becomes. A value outside its grammar is dropped, as the host would drop it,
 * and because `fetch` refuses a header value that is not Latin-1: a folder named in another script
 * would otherwise turn every call into a failure.
 */
export function sessionHeaders(p: Position, agent?: Agent): Record<string, string> {
  const values: Record<string, string | null | undefined> = {
    'x-braindog-host': p.host,
    'x-braindog-repo': p.repo,
    'x-braindog-remote': p.remote,
    'x-braindog-cwd': p.cwd,
    'x-braindog-agent': agent,
  };
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) if (value && GRAMMAR[name]!.test(value)) out[name] = value;
  return out;
}
