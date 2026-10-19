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
  /** Recent commit authors as `Name <email>, ...`; left out when none are read. */
  authors?: string;
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
  /* Only with a remote: the record meets these as people seen in that project's commits. */
  const [log, subjects] =
    top === null || origin === null ? [null, null] : await Promise.all([git(cwd, 'log', '-n', '50', '--format=%an <%ae>'), git(cwd, 'log', '-n', '5', '--format=%h %s')]);
  const authors = withCommits(authorsOf(log), subjects);
  return {
    cwd,
    repo: top === null ? null : basename(top),
    remote: origin === null ? null : normaliseRemote(origin),
    host: hostname(),
    /* `HEAD` is what git says for a detached head, which is no branch at all. */
    branch: branch === 'HEAD' ? null : branch,
    head,
    ...(authors === null ? {} : { authors }),
  };
}

/**
 * The authors line with the last commits after it, `Name <email> || abc1234 Subject || ...`, in at most 1024 printable
 * characters: a commit that would not fit is left off, never cut, and a bar pair inside a subject is written as one bar.
 */
export function withCommits(authors: string | null, log: string | null): string | null {
  let out = authors ?? '';
  for (const line of (log ?? '').split('\n')) {
    const l = line.trim().replace(/\|\|/gu, '|');
    if (!/^[0-9a-f]{7,40} \S/u.test(l) || !/^[\x20-\x7e]+$/u.test(l)) continue;
    if (`${out} || ${l}`.length > 1024) break;
    out = `${out} || ${l}`;
  }
  out = out.trim();
  return out === '' ? null : out;
}

/** The distinct authors of a commit log, newest first, as one header value of at most 512 printable characters; `null` for none. */
export function authorsOf(log: string | null): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of (log ?? '').split('\n')) {
    const l = line.trim();
    const key = l.toLowerCase();
    if (!/^[\x20-\x7e]+$/.test(l) || !/<[^<>\s]+@[^<>\s]+>$/.test(l) || seen.has(key)) continue;
    seen.add(key);
    if (out.length === 5 || [...out, l].join(', ').length > 512) break;
    out.push(l);
  }
  return out.length === 0 ? null : out.join(', ');
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

/** A build as `scripts/bundle.mjs` stamps one, `<yyyy.mm.dd>+<sha>` with seven to forty hex digits, or a checkout's `dev+0000000`. */
export const BUILD = /^(?:[0-9]{4}\.[0-9]{2}\.[0-9]{2}|dev)\+[0-9a-f]{7,40}$/;

/* The bundler defines it, in this module as in `main.ts`; run from a checkout there is no bundle and it is undefined. */
declare const __BUILD__: string;

/**
 * This command's build, the one `braindog version` prints. SENT WITH EVERY CALL as `x-braindog-cli` (AGT-B01), so the
 * record can say a machine runs a command older than itself: his Mac ran the build of 1 October for a week, and
 * nothing in the record could tell.
 */
export const cliBuild = (): string => (typeof __BUILD__ === 'string' ? __BUILD__ : 'dev+0000000');

/* The grammar of the plan's §3.4. `Session` and `Client` come from the session file the start hook
   writes, or the host's own session id, so a process with neither sends neither. */
const GRAMMAR: Record<string, RegExp> = {
  'x-braindog-session': /^S[1-9][0-9]*$/,
  'x-braindog-parent': /^S[1-9][0-9]*$/,
  'x-braindog-client': CLIENT_ID,
  'x-braindog-host': /^[A-Za-z0-9._-]{1,128}$/,
  'x-braindog-repo': /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  'x-braindog-remote': printable(256),
  'x-braindog-cwd': printable(512),
  'x-braindog-agent': new RegExp(`^(?:${AGENTS.join('|')})$`),
  'x-braindog-client-name': printable(128),
  'x-braindog-client-version': printable(64),
  'x-braindog-cli': BUILD,
  'x-braindog-ahead': /^(?:0|[1-9][0-9]{0,3})$/,
  'x-braindog-authors': printable(1024),
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

/** The run a subagent works for, by its spoken id, and where that run stands (`parentOf` in `hooks.ts`). */
export type Parent = { spoken: string; cwd: string | null; repo: string | null; remote: string | null };

/**
 * What else a call says about who makes it: the process's environment, the client's own name and version, and the run
 * it works for when it is a subagent. `build` is the command's own (`cliBuild`) unless a caller says another, as a test does.
 */
export type Said = { env?: Env | undefined; client?: ClientInfo | undefined; parent?: Parent | null | undefined; build?: string | undefined; ahead?: number | null | undefined };

/**
 * Commits HEAD moved since the handoff, as `x-braindog-ahead` carries them: a whole number from 0 to 9,999, a count past
 * that said as 9,999, and nothing at all for a count git could not make. The record reads it for the card's Next line.
 */
export const aheadHeader = (moved: number | null | undefined): string | undefined =>
  typeof moved === 'number' && Number.isInteger(moved) && moved >= 0 ? String(Math.min(moved, 9_999)) : undefined;

/**
 * The headers a position becomes. A value outside its grammar is dropped, as the host would drop it,
 * and because `fetch` refuses a header value that is not Latin-1: a folder named in another script
 * would otherwise turn every call into a failure.
 *
 * ONE RUN PER HOST SESSION. The client id is the run's own when the caller names one (the start hook's `session_id`),
 * and otherwise the host session's id from the environment, so the hook's run and every tool call after it are one run
 * rather than one each. Inside Claude Code (`CLAUDECODE`) a caller that names no agent is `claude`. Both come from
 * `said.env` only, never from this process's own, so a caller says which environment it speaks for.
 *
 * A SUBAGENT OUTSIDE ANY REPOSITORY SAYS ITS PARENT RUN'S PLACE (`said.parent`): the repository, remote and folder that
 * run started in, so the record places it in the same project, and the parent's spoken id as `x-braindog-parent` for a
 * record that reads it. One in a repository of its own says its own place, which is where its work is.
 */
export function sessionHeaders(p: Position, agent?: Agent, run?: { spoken?: string | undefined; client_id?: string | undefined }, said: Said = {}): Record<string, string> {
  const env = said.env ?? {};
  const parent = said.parent ?? null;
  const from = parent !== null && p.repo === null && (parent.repo !== null || parent.remote !== null || parent.cwd !== null) ? parent : null;
  const values: Record<string, string | null | undefined> = {
    'x-braindog-session': run?.spoken,
    'x-braindog-parent': parent?.spoken,
    'x-braindog-client': run?.client_id ?? hostSessionOf(env),
    'x-braindog-host': p.host,
    'x-braindog-repo': from ? from.repo : p.repo,
    'x-braindog-remote': from ? from.remote : p.remote,
    'x-braindog-cwd': from ? (from.cwd ?? p.cwd) : p.cwd,
    'x-braindog-agent': agent ?? (env.CLAUDECODE ? 'claude' : undefined),
    'x-braindog-client-name': said.client?.name?.trim(),
    'x-braindog-client-version': said.client?.version?.trim(),
    'x-braindog-cli': said.build ?? cliBuild(),
    'x-braindog-ahead': aheadHeader(said.ahead),
    'x-braindog-authors': from ? undefined : p.authors,
  };
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) if (value && GRAMMAR[name]!.test(value)) out[name] = value;
  return out;
}
