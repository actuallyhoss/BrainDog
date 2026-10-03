/**
 * Where a session stands: the folder, the repository, its remote, the machine, the branch and the
 * commit. The record resolves a project from these, so they travel with every call as the session
 * headers, with which host session and which client is calling.
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
export const git = (cwd: string, ...args: string[]) =>
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

const CLIENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/* The grammar of the plan's §3.4. `Session` and `Client` come from the session file the start hook
   writes, or the host's own session id, so a process with neither sends neither. */
const GRAMMAR: Record<string, RegExp> = {
  'x-braindog-session': /^S[1-9][0-9]*$/,
  'x-braindog-client': CLIENT_ID,
  'x-braindog-host': /^[A-Za-z0-9._-]{1,128}$/,
  'x-braindog-repo': /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  'x-braindog-remote': printable(256),
  'x-braindog-cwd': printable(512),
  'x-braindog-agent': new RegExp(`^(?:${AGENTS.join('|')})$`),
  'x-braindog-client-name': printable(128),
  'x-braindog-client-version': printable(64),
};

type Env = Record<string, string | undefined>;

/**
 * The host session this process runs in, by the host's own id, when its environment says one: `CLAUDE_SESSION_ID`, then
 * `CLAUDE_CODE_SESSION_ID`, which Claude Code gives its shell, its subagents and the commands they run. It is the id
 * the start hook hands `attach` as `client_id`, so a call that carries it lands in the run the hook attached.
 */
export function hostSessionOf(env: Env): string | null {
  for (const id of [env.CLAUDE_SESSION_ID, env.CLAUDE_CODE_SESSION_ID]) if (typeof id === 'string' && CLIENT_ID.test(id)) return id;
  return null;
}

/** What a client says it is when it says hello: MCP's `initialize` `clientInfo`, as in `claude-code` and `2.1.287`. */
export type ClientInfo = { name?: string | undefined; version?: string | undefined };

/** What else a call says about who makes it: the process's environment, and the client's own name and version. */
export type Said = { env?: Env | undefined; client?: ClientInfo | undefined };

/**
 * The headers a position becomes. A value outside its grammar is dropped, as the host would drop it,
 * and because `fetch` refuses a header value that is not Latin-1: a folder named in another script
 * would otherwise turn every call into a failure.
 *
 * ONE RUN PER HOST SESSION. The client id is the run's own when the caller names one (the start hook's `session_id`),
 * and otherwise the host session's id from the environment, so the hook's run and every tool call after it are one run
 * rather than one each. Inside Claude Code (`CLAUDECODE`) a caller that names no agent is `claude`. Both come from
 * `said.env` only, never from this process's own, so a caller says which environment it speaks for.
 */
export function sessionHeaders(p: Position, agent?: Agent, run?: { spoken?: string | undefined; client_id?: string | undefined }, said: Said = {}): Record<string, string> {
  const env = said.env ?? {};
  const values: Record<string, string | null | undefined> = {
    'x-braindog-session': run?.spoken,
    'x-braindog-client': run?.client_id ?? hostSessionOf(env),
    'x-braindog-host': p.host,
    'x-braindog-repo': p.repo,
    'x-braindog-remote': p.remote,
    'x-braindog-cwd': p.cwd,
    'x-braindog-agent': agent ?? (env.CLAUDECODE ? 'claude' : undefined),
    'x-braindog-client-name': said.client?.name?.trim(),
    'x-braindog-client-version': said.client?.version?.trim(),
  };
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) if (value && GRAMMAR[name]!.test(value)) out[name] = value;
  return out;
}
