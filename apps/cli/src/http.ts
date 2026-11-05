/**
 * Which host, which bearer, and the one way a request leaves this process.
 *
 * THE TOKEN IS READ FROM ONE FILE OR ONE VARIABLE AND LEAVES ONLY AS `Authorization: Bearer`. It is
 * never an argument, because argv shows in process lists and in `.mcp.json`. It is never in a sentence
 * this file writes, because stderr ends up in an agent's logs.
 */

import { createHash } from 'node:crypto';
import { chmodSync, closeSync, constants, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { createClient, type Client } from '@braindog/client';
import { unbom } from './unbom.ts';
import { cliBuild } from './position.ts';
import type { Result } from '@braindog/ports';
import { saidDay } from './said-day.ts';

type Env = Record<string, string | undefined>;

/**
 * One bearer the hosts file keeps: a login's, or a runner's enrolment.
 *
 * `from`, ON AN AGENT'S TOKEN ALONE, is `keyPrint` of the owner key in `BRAINDOG_TOKEN` it was made with (a self-host's
 * server key): while that same key is set, the agent sends its own token rather than the key (`target`).
 */
export type Held = { value: string; expires: string; label: string; from?: string };

/**
 * A short one-way print of a key, to know it again without keeping it: the first 16 hex of its SHA-256. The key is
 * long and random, so the print says nothing of it, and nothing on disk can be turned back into it.
 */
export const keyPrint = (key: string): string => createHash('sha256').update(key).digest('hex').slice(0, 16);

/** `docs/48-SPEC-CLI.md` §4.1, with the vault grants of the plan's §2.3. */
export type HostsFile = {
  default?: string;
  hosts: Record<string, { token?: Held; runner?: Held; shape?: Held; vault?: Record<string, { value: string; expires: string }>; agents?: Record<string, Held> }>;
};

/**
 * Which agent a process speaks for, for the token `braindog setup` made for it (agents and MCP plan §5.1, §10.5):
 * `BRAINDOG_AGENT`, which the hook scripts set to `claude`, else `claude` inside Claude Code (`CLAUDECODE`), so the
 * hooks, the MCP server and a command its shell runs all reach the record as one token and so as one run.
 */
export function agentOf(env: Env): string | undefined {
  const named = env.BRAINDOG_AGENT;
  if (typeof named === 'string' && /^[a-z][a-z-]{0,31}$/u.test(named)) return named;
  return env.CLAUDECODE ? 'claude' : undefined;
}

/** The budget of one tool call. The plan's §1.7 sets twenty seconds. */
export const BUDGET_MS = 20_000;
export const budgetOf = (env: Env): number => {
  const ms = Number(env.BRAINDOG_TIMEOUT_MS);
  return Number.isInteger(ms) && ms > 0 ? ms : BUDGET_MS;
};

/** `docs/48-SPEC-CLI.md` §2: XDG first, then `%APPDATA%` on Windows, then `~/.config`. */
export function hostsPath(env: Env, platform: string = process.platform): string {
  const base = env.XDG_CONFIG_HOME || (platform === 'win32' ? env.APPDATA : undefined) || join(homedir(), '.config');
  return join(base, 'braindog', 'hosts.json');
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function readHosts(file: string): HostsFile {
  if (!existsSync(file)) return { hosts: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(unbom(readFileSync(file, 'utf8')));
  } catch {
    /* JSON.parse's own message quotes the text around the fault, and the text holds a token. */
    throw new Error(`${file} is not valid JSON. Correct it by hand, or delete it and sign in again.`);
  }
  if (!isObject(parsed) || !isObject(parsed.hosts)) throw new Error(`${file} has no hosts map, so it is not a BrainDog hosts file.`);
  return parsed as HostsFile;
}

/**
 * Written whole and renamed into place, at 0600, in a folder made at 0700.
 *
 * The mode is set again after the write because `writeFileSync` applies `mode` only to a file it
 * creates, and a `.tmp` left by a killed run keeps whatever mode it had. On Windows the mode is
 * advisory and the file takes the profile's permissions.
 *
 * NEVER THROUGH A LINK. A `.tmp` planted as a symbolic link took every token wherever it pointed, and `chmod` followed it
 * too, so whatever is at that name goes first and the file is opened so a link there fails. A folder that was already
 * there keeps the mode it had unless it is closed here, and it names every session this machine runs.
 */
export function saveHosts(file: string, hosts: HostsFile): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    try {
      chmodSync(dirname(file), 0o700);
    } catch {
      /* A folder somebody else owns stays as it is; the file below is still 0600. */
    }
  }
  discardPart(file);
  const fd = openSync(partOf(file), constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(hosts, null, 2)}\n`);
  } finally {
    closeSync(fd);
  }
  chmodSync(partOf(file), 0o600);
  renameSync(partOf(file), file);
}

/** The scratch name `saveHosts` writes through. One place, so a caller clearing it cannot guess wrong. */
export const partOf = (file: string): string => `${file}.tmp`;

/**
 * THE SCRATCH FILE, THROWN AWAY. A `login` killed between the write and the rename leaves a whole
 * hosts document at `hosts.json.tmp`, holding every token the file held, and nothing consumes it
 * unless a later write happens to run.
 *
 * WHICH MAKES IT `logout`'s, AND ONLY ON THE PATH THAT WRITES NOTHING. Every other path ends in
 * `saveHosts`, whose write and rename consume the leftover on the way past; the nothing-to-remove
 * path returns first, so it is the one case where `braindog logout` can finish with a live bearer
 * still on the disk and a sentence on the screen saying there was nothing to remove. A command
 * whose whole job is to end a login must not leave one behind.
 *
 * IT REMOVES ONLY THE NAME THIS MODULE WRITES, never `file` itself, and says nothing when there is
 * nothing there. A failure is swallowed for the reason every other error path in this pair
 * swallows one: the message would quote the path, and a caller who cannot delete it cannot be
 * helped by being told twice.
 */
export function discardPart(file: string): void {
  try {
    rmSync(partOf(file), { force: true });
  } catch {
    /* Nothing to say. See above. */
  }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** This machine by one of its names. */
export const isLoopback = (hostname: string): boolean => LOOPBACK.has(hostname);

/** http to anywhere but this machine, where a bearer would cross a network in the clear. */
export const inTheClear = (url: URL): boolean => url.protocol === 'http:' && !LOOPBACK.has(url.hostname);

/**
 * The names the app answered on before it came back to its own, and the name it answers on now. The marketing site
 * holds `brain.dog` and `alpha.brain.dog` and hands only the doors on to the app, so a record there is a record on
 * `app.brain.dog` or `app.alpha.brain.dog` (`apps/worker/wrangler.jsonc`).
 */
const MOVED: Readonly<Record<string, string>> = {
  'https://brain.dog': 'https://app.brain.dog',
  'https://alpha.brain.dog': 'https://app.alpha.brain.dog',
};

/**
 * A host as the hosts file keys it: `https://origin[/slug]`, no trailing slash. A bare name means https.
 *
 * NO SENTENCE HERE REPEATS WHAT WAS TYPED. Somebody who pasted a token into the address would find it
 * in the log of every agent session.
 *
 * THE RECORD'S ADDRESS IS `https://app.brain.dog/<slug>`, AND TWO OLDER SPELLINGS OF IT ARE READ AS IT. The app was
 * at `app.brain.dog/app/<slug>` until 29 Oct and its connect screen printed that, so `/app/<slug>` is kept as
 * `/<slug>`: `app` is a reserved slug (`packages/record/src/directory.ts`), so a first segment of `app` is always
 * the prefix and never a record. And before that it was `brain.dog/<slug>`, which is the marketing site now, so that
 * origin is read as `app.brain.dog` (`MOVED`): a device start there is refused, and the bearer is the record's and not
 * the name's, so the same login answers on the new name. It is done here and not in `login` because `logout` and
 * `target` key by this same function, and `sameHost` reads a written key through it too: a login kept under
 * `https://brain.dog/acme` or `https://app.brain.dog/app/acme` is the entry `target` finds for `app.brain.dog/acme`,
 * and the one a `logout` of any of the three removes, so no hosts file already on a machine has to be edited.
 */
export function hostKey(raw: string): string {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error('The BrainDog host is not an address. Write it as https://app.brain.dog/<slug>.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('The BrainDog host is not an https address. Write it as https://app.brain.dog/<slug>.');
  if (url.username || url.password)
    throw new Error('The BrainDog host address carries a name or a password. A token goes in the hosts file or BRAINDOG_TOKEN, never in an address.');
  return `${MOVED[url.origin] ?? url.origin}${url.pathname.replace(/\/+$/, '').replace(/^\/app(?=\/|$)/, '')}`;
}

/**
 * A hand-written key with a trailing slash or no scheme still names the same host.
 *
 * EXPORTED BECAUSE `logout` HAS TO REMOVE WHAT `target` WOULD HAVE USED. A second copy of this that
 * matched one key fewer would leave behind an entry every other command still reads, which is a
 * logout that did not log out.
 */
export const sameHost = (written: string, key: string) => {
  try {
    return hostKey(written) === key;
  } catch {
    return false;
  }
};

/**
 * Where a command goes and the bearer it sends. `from` says where that bearer came from, so a refusal can say what to
 * change: `env` for `BRAINDOG_TOKEN`, `agent` for the token `braindog setup` made for this agent, `login` for this
 * machine's login. No `from` is no bearer at all.
 */
export type Target = { key: string; base: string; token?: string; from?: 'env' | 'agent' | 'login' };

/**
 * The host and its bearer. `--host` beats `BRAINDOG_HOST`, which beats the file's `default`;
 * `BRAINDOG_TOKEN` beats the file. Throws one sentence when there is nothing to reach.
 *
 * NO TOKEN IS NOT AN ERROR. A self-host started without one answers its own machine unauthenticated.
 *
 * THE AGENT'S OWN TOKEN BEFORE THE MACHINE'S, when `braindog setup` made one for the agent this process speaks for
 * (`agent`, else `agentOf`) and it has not expired. An expired one falls back to the machine's login, which still
 * works, and the next `braindog setup` makes a new one.
 */
export function target(flag: string | undefined, env: Env, file: string, now: number = Date.now(), agent: string | undefined = agentOf(env)): Target {
  let hosts: HostsFile | undefined;
  const read = () => (hosts ??= readHosts(file));

  const named = flag || env.BRAINDOG_HOST || read().default;
  if (!named) throw new Error(`No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or name a default in ${file}.`);
  const key = hostKey(named);
  const url = new URL(key);
  if (inTheClear(url))
    throw new Error(`${key} is http, not https. BrainDog sends a token only over https, except to this machine.`);

  const sent = env.BRAINDOG_TOKEN || undefined;
  let token = sent;
  let from: Target['from'] = sent ? 'env' : undefined;
  /*
   * THE AGENT'S OWN TOKEN, and under `BRAINDOG_TOKEN` only one made from that very key (`from`): a self-host's server key
   * there is the owner, a person and never a run, so an agent sending it could not hand off or read what it was told.
   * `setup` and `mcp` make the agent its token from the key (`mintFromKey` in `setup.ts`). A hosts file that does not
   * read is no agent token here, as it was no question while the variable won outright.
   */
  if (agent !== undefined) {
    let own: Held | undefined;
    try {
      own = Object.entries(read().hosts).find(([written]) => sameHost(written, key))?.[1]?.agents?.[agent];
    } catch (e) {
      if (!sent) throw e;
    }
    if (isObject(own) && typeof own.value === 'string' && own.value !== '' && Date.parse(String(own.expires)) > now && (!sent || own.from === keyPrint(sent))) {
      token = own.value;
      from = 'agent';
    }
  }
  if (!token) {
    const entry = Object.entries(read().hosts).find(([written]) => sameHost(written, key))?.[1]?.token;
    if (isObject(entry) && typeof entry.value === 'string' && entry.value) {
      const until = typeof entry.expires === 'string' ? Date.parse(entry.expires) : Number.NaN;
      if (until <= now) throw new Error(`The login to ${key} expired on ${saidDay(String(entry.expires), now)}. Run braindog login ${key}.`);
      token = entry.value;
      from = 'login';
    }
  }
  return { key, base: url.origin, ...(token ? { token } : {}), ...(token && from ? { from } : {}) };
}

/**
 * The sentence a command says when the host refuses its bearer (a `401`), by where the bearer came from.
 *
 * THE HOST SAYS ONLY `unauthorized`, ON PURPOSE (`12 §5`): it cannot tell a stranger which of a wrong key, a revoked
 * one and an address with no BrainDog behind it this was. This side knows what it sent, so it says what to change. It
 * never names a token's value, only where it was read from.
 */
export function refusedFix(to: Pick<Target, 'key' | 'from'>): string {
  const { key } = to;
  if (to.from === 'env') return `${key} does not take the token in BRAINDOG_TOKEN. Replace it, or unset it and run braindog login ${key}.`;
  if (to.from === 'agent') return `${key} no longer takes the token braindog setup made for this agent. Run braindog logout ${key}, then braindog setup ${key}.`;
  if (to.from === 'login') return `${key} did not take this machine's login: it was signed out, or there is no BrainDog at that address. Run braindog login ${key}.`;
  return `${key} needs a sign-in, and this machine holds none for it. Run braindog login ${key}, or set BRAINDOG_TOKEN.`;
}

/** An answer already read, with an `UNAUTHORIZED` refusal's fix replaced by `refusedFix`'s sentence; any other as it is. */
export function withFixOf(r: Result<unknown>, to: Pick<Target, 'key' | 'from'>): Result<unknown> {
  const refusal = r.ok ? null : (r as { refusal?: unknown }).refusal;
  if (!isObject(refusal) || refusal.code !== 'UNAUTHORIZED') return r;
  return { ...r, refusal: { ...refusal, fix: refusedFix(to) } } as Result<unknown>;
}

/**
 * A `401` with the host's `UNAUTHORIZED`, its fix replaced by `refusedFix`'s sentence; any other answer as it came.
 * The body is read only for a 401, so nothing else waits on it.
 */
export async function withRefusedFix(res: Response, to: Pick<Target, 'key' | 'from'>): Promise<Response> {
  if (res.status !== 401) return res;
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    return res;
  }
  if (!isObject(body) || !isObject(body.refusal) || body.refusal.code !== 'UNAUTHORIZED') return res;
  const refusal = body.refusal;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify({ ...body, refusal: { ...refusal, fix: refusedFix(to), at: refusal.at ?? 'authorization' } }), { status: 401, statusText: res.statusText, headers });
}

/**
 * The typed client, with every request carrying the session headers and one deadline.
 *
 * THE DEADLINE BELONGS TO THE CALLER, not to each request, because one tool call can be several
 * requests and the budget is the tool call's. A redirect is refused rather than followed: the API
 * never sends one, and following it would carry the bearer somewhere nobody chose.
 */
export function clientFor(to: Target, headers: () => Promise<Record<string, string>>, signal: AbortSignal): Client {
  return createClient({
    base: to.base,
    token: to.token,
    fetch: async (input, init) => {
      const sent = new Headers(init?.headers);
      /* EVERY CALL SAYS THE COMMAND'S BUILD, the ones that send no session headers too. */
      sent.set('x-braindog-cli', cliBuild());
      for (const [name, value] of Object.entries(await headers())) sent.set(name, value);
      /* A 401 SAYS WHAT TO CHANGE HERE, since the host says only `unauthorized` (`refusedFix`). */
      return withRefusedFix(await fetch(input, { ...init, headers: sent, signal, redirect: 'error' }), to);
    },
  });
}

/* ── a runner's enrolment, and the three calls it makes ─────────────────── */

/**
 * The host a runner works for and the bearer it was enrolled with (`docs/48-SPEC-CLI.md` §5.13).
 *
 * THE ENROLMENT AND NEVER THE LOGIN. A runner's bearer is a device grant of reach `runner`, which the
 * record admits at `claimJob`, `postJobEvent` and `readCancel` and at nothing else, and a login is
 * refused at all three. So `BRAINDOG_TOKEN` is not read here, and neither is the `token` beside it.
 */
export type RunnerTarget = { key: string; base: string; bearer: string; label: string };

/**
 * Which host `braindog runner run` claims from, and with what: `--host`, then `BRAINDOG_HOST`, then the
 * one host this machine is enrolled on, then the file's default. Throws one sentence when there is no
 * enrolment to use, and no sentence quotes a bearer.
 *
 * THE ONE ENROLLED HOST COMES BEFORE THE DEFAULT, because the default is the login's (`login` sets
 * it) and a machine signed in to one record may run the jobs of another.
 */
export function runnerTarget(flag: string | undefined, env: Env, file: string, now: number = Date.now()): RunnerTarget {
  const hosts = readHosts(file);
  const enrolled = Object.entries(hosts.hosts).filter(([, entry]) => isObject(entry) && isObject(entry.runner));
  const named = flag || env.BRAINDOG_HOST || (enrolled.length === 1 ? enrolled[0]?.[0] : undefined) || hosts.default;
  if (!named)
    throw new Error(
      enrolled.length > 1
        ? 'This machine is enrolled as a runner on more than one BrainDog. Name one with --host.'
        : 'This machine is not enrolled as a runner. Run braindog runner enrol https://app.brain.dog/<slug>.',
    );
  const key = hostKey(named);
  const url = new URL(key);
  if (inTheClear(url)) throw new Error(`${key} is http, not https. A runner sends its enrolment only over https, except to this machine.`);
  const held = enrolled.find(([written]) => sameHost(written, key))?.[1]?.runner;
  if (!isObject(held) || typeof held.value !== 'string' || held.value === '')
    throw new Error(`This machine is not enrolled as a runner on ${key}. Run braindog runner enrol ${key}.`);
  /* AN EXPIRY THAT DOES NOT READ AS A DATE IS AN ENDED ONE, so a hand-edited file never runs on a bearer of unknown age. */
  const until = typeof held.expires === 'string' ? Date.parse(held.expires) : Number.NaN;
  if (!(until > now)) throw new Error(`The runner enrolment on ${key} ended on ${saidDay(String(held.expires), now)}. Run braindog runner enrol ${key}.`);
  return { key, base: url.origin, bearer: held.value, label: typeof held.label === 'string' ? held.label : '' };
}

/**
 * Keeps a runner's enrolment under its host, beside the login and never in its place.
 *
 * THE FILE IS READ AGAIN HERE, just before the write, because minutes pass while somebody approves the
 * six digits and another command may have written the file meanwhile.
 */
export function keepRunner(file: string, key: string, runner: Held): void {
  const hosts = readHosts(file);
  hosts.hosts[key] = { ...hosts.hosts[key], runner };
  saveHosts(file, hosts);
}

/** The three calls a runner makes, and the only ones its enrolment opens. */
export type RunnerMethod = 'claimJob' | 'postJobEvent' | 'readCancel';

/**
 * One of a runner's three calls, and the record's answer as a `Result`. A host that did not answer, or
 * answered with something that is not an envelope, is `UNREACHABLE`.
 *
 * A DEADLINE ON EVERY CALL, set by the caller, because a claim is held open by the host for as long as
 * the runner asked it to wait, and a far end that vanishes without closing the socket would otherwise
 * hold the loop for ever (`26 §5`). A redirect is refused rather than followed, for `clientFor`'s
 * reason: it would carry the bearer somewhere nobody chose.
 */
export async function runnerCall(
  to: RunnerTarget,
  method: RunnerMethod,
  args: object,
  o: { ms: number; signal?: AbortSignal | undefined; fetch?: typeof globalThis.fetch | undefined },
): Promise<Result<unknown>> {
  const gone: Result<unknown> = { ok: false, refusal: { code: 'UNREACHABLE', fix: `${to.key} did not answer.` } };
  const deadline = AbortSignal.timeout(o.ms);
  let res: Response;
  try {
    res = await (o.fetch ?? globalThis.fetch)(`${to.base}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${to.bearer}` },
      body: JSON.stringify(args),
      redirect: 'error',
      signal: o.signal ? AbortSignal.any([o.signal, deadline]) : deadline,
    });
  } catch {
    /* The error could quote the request, and the request holds the bearer. */
    return gone;
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return gone;
  }
  if (!isObject(body) || typeof body.ok !== 'boolean') return gone;
  if (body.ok) return { ok: true, value: body.value };
  const refusal = body.refusal;
  if (isObject(refusal) && typeof refusal.code === 'string' && typeof refusal.fix === 'string')
    return { ok: false, refusal: { code: refusal.code, fix: refusal.fix, ...(typeof refusal.at === 'string' ? { at: refusal.at } : {}) } };
  return gone;
}
