/**
 * Which host, which bearer, and the one way a request leaves this process.
 *
 * THE TOKEN IS READ FROM ONE FILE OR ONE VARIABLE AND LEAVES ONLY AS `Authorization: Bearer`. It is
 * never an argument, because argv shows in process lists and in `.mcp.json`. It is never in a sentence
 * this file writes, because stderr ends up in an agent's logs.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { createClient, type Client } from '@braindog/client';

type Env = Record<string, string | undefined>;

type Held = { value: string; expires: string; label: string };

/** `docs/48-SPEC-CLI.md` §4.1, with the vault grants of the plan's §2.3. */
export type HostsFile = {
  default?: string;
  hosts: Record<string, { token?: Held; runner?: Held; vault?: Record<string, { value: string; expires: string }> }>;
};

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
    parsed = JSON.parse(readFileSync(file, 'utf8'));
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
 */
export function saveHosts(file: string, hosts: HostsFile): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const part = `${file}.tmp`;
  writeFileSync(part, `${JSON.stringify(hosts, null, 2)}\n`, { mode: 0o600 });
  chmodSync(part, 0o600);
  renameSync(part, file);
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** This machine by one of its names. */
export const isLoopback = (hostname: string): boolean => LOOPBACK.has(hostname);

/** http to anywhere but this machine, where a bearer would cross a network in the clear. */
export const inTheClear = (url: URL): boolean => url.protocol === 'http:' && !LOOPBACK.has(url.hostname);

/**
 * A host as the hosts file keys it: `https://origin[/slug]`, no trailing slash. A bare name means https.
 *
 * NO SENTENCE HERE REPEATS WHAT WAS TYPED. Somebody who pasted a token into the address would find it
 * in the log of every agent session.
 */
export function hostKey(raw: string): string {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error('The BrainDog host is not an address. Write it as https://app.brain.dog.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('The BrainDog host is not an https address. Write it as https://app.brain.dog.');
  if (url.username || url.password)
    throw new Error('The BrainDog host address carries a name or a password. A token goes in the hosts file or BRAINDOG_TOKEN, never in an address.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
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

export type Target = { key: string; base: string; token?: string };

/**
 * The host and its bearer. `--host` beats `BRAINDOG_HOST`, which beats the file's `default`;
 * `BRAINDOG_TOKEN` beats the file. Throws one sentence when there is nothing to reach.
 *
 * NO TOKEN IS NOT AN ERROR. A self-host started without one answers its own machine unauthenticated.
 */
export function target(flag: string | undefined, env: Env, file: string, now: number = Date.now()): Target {
  let hosts: HostsFile | undefined;
  const read = () => (hosts ??= readHosts(file));

  const named = flag || env.BRAINDOG_HOST || read().default;
  if (!named) throw new Error(`No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or name a default in ${file}.`);
  const key = hostKey(named);
  const url = new URL(key);
  if (inTheClear(url))
    throw new Error(`${key} is http, not https. BrainDog sends a token only over https, except to this machine.`);

  let token = env.BRAINDOG_TOKEN || undefined;
  if (!token) {
    const entry = Object.entries(read().hosts).find(([written]) => sameHost(written, key))?.[1]?.token;
    if (isObject(entry) && typeof entry.value === 'string' && entry.value) {
      const until = typeof entry.expires === 'string' ? Date.parse(entry.expires) : Number.NaN;
      if (until <= now) throw new Error(`The login to ${key} expired on ${String(entry.expires).slice(0, 10)}. Run braindog login ${key}.`);
      token = entry.value;
    }
  }
  return { key, base: url.origin, ...(token ? { token } : {}) };
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
      for (const [name, value] of Object.entries(await headers())) sent.set(name, value);
      return fetch(input, { ...init, headers: sent, signal, redirect: 'error' });
    },
  });
}
