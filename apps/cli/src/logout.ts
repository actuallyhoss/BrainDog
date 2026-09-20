/**
 * `braindog logout [<host>]`: the mirror of `braindog login <host>`, and the one command that takes a token away.
 *
 * IT IS LOCAL ONLY. NOTHING IS SENT. The bearer is removed from this machine's hosts file and the host is never
 * told, so the token stays live there until it expires or somebody revokes it in the app. A person reading the
 * command's name will assume otherwise, which is why this is the first line of the file.
 *
 * EVERY DELETION IS NAMED. The three fields a login writes are removed one at a time rather than the entry being
 * replaced, the entry goes only once nothing is left in it, and the default goes only when it named this host.
 * There is no flag that removes every login at once.
 *
 * NO SENTENCE HERE QUOTES A TOKEN, A LABEL, A VAULT VALUE OR A VAULT SCOPE, and none echoes what was typed. The
 * grants are counted rather than named, because the keys of that map are whatever a hand-written file put there.
 */

import { parseArgs } from 'node:util';

import { hostKey, readHosts, sameHost, saveHosts } from './http.ts';

export type LogoutIo = {
  /** The hosts file the token is kept in. */
  file: string;
  /** Where `BRAINDOG_HOST` is read from. */
  env: Record<string, string | undefined>;
  /** One line to stderr. */
  say: (line: string) => void;
};

/** `48 §4.4`. This command reaches nothing, so it is never 2 and never 3. */
const REFUSED = 1;

const WRONG = 'braindog logout takes one host, as in braindog logout https://app.brain.dog/<slug>, or --host <host>, and nothing else.';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * A hand-written key with a trailing slash or no scheme still names the same host.
 *
 * THE SAME RULE `target()` REACHES A HOST BY (`http.ts:98-104`), repeated here because that helper is private to
 * that file. An entry left behind that `target()` would still have taken a bearer from is a logout that did not
 * log out, so every matching key goes, not only the one `hostKey` would have written.
 */
/** `a, b and c`. */
const list = (parts: string[]): string => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

const count = (n: number, one: string, many: string): string => (n === 1 ? `a ${one}` : `${String(n)} ${many}`);

export async function logout(args: string[], io: LogoutIo): Promise<number> {
  let parsed: { values: { host?: string | undefined }; positionals: string[] };
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' } } });
  } catch {
    /* parseArgs quotes what it could not read, and that could be a token somebody passed by mistake. */
    io.say(WRONG);
    return REFUSED;
  }
  const [positional, ...more] = parsed.positionals;
  if (more.length > 0 || (positional !== undefined && positional.startsWith('-'))) {
    io.say(WRONG);
    return REFUSED;
  }
  const flag = parsed.values.host;

  /* READ BEFORE ANYTHING IS DECIDED, so a file that cannot be parsed is said before a host is resolved from a
     default this command could not have read, and so nothing is written over it. */
  let hosts;
  try {
    hosts = readHosts(io.file);
  } catch (e) {
    io.say(e instanceof Error ? e.message : `${io.file} could not be read.`);
    return REFUSED;
  }

  let key: string;
  if (positional !== undefined && flag !== undefined) {
    /* TWO HOSTS AND NO WAY TO KNOW WHICH WAS MEANT. Picking one would remove a token nobody asked to remove. */
    let named: string;
    let byFlag: string;
    try {
      named = hostKey(positional);
      byFlag = hostKey(flag);
    } catch (e) {
      io.say(e instanceof Error ? e.message : 'The BrainDog host is not an address.');
      return REFUSED;
    }
    if (named !== byFlag) {
      io.say('braindog logout was given one host as an argument and a different one as --host. Name one of them.');
      return REFUSED;
    }
    key = named;
  } else {
    /* `48 §2`: --host, then BRAINDOG_HOST, then the file's default. Nothing to guess from is a refusal, because
       a logout that guessed would take away a login somebody is using. */
    const named = positional ?? flag ?? io.env.BRAINDOG_HOST ?? hosts.default;
    if (!named) {
      io.say(`No BrainDog host is set. Pass --host, set BRAINDOG_HOST, or name one as braindog logout <host>.`);
      return REFUSED;
    }
    try {
      key = hostKey(named);
    } catch (e) {
      io.say(e instanceof Error ? e.message : 'The BrainDog host is not an address.');
      return REFUSED;
    }
  }

  /* NO http CHECK HERE. `login` and `target` refuse plain http because a bearer would cross the network in the
     clear; this command sends nothing, and refusing would leave the token on disk. */

  let tokens = 0;
  let runners = 0;
  let grants = 0;
  for (const written of Object.keys(hosts.hosts)) {
    if (!sameHost(written, key)) continue;
    const entry: unknown = hosts.hosts[written];
    /* A hand-written entry that is not an object holds nothing any reader will take a bearer from, and this
       command removes only what it can name. It is left as it is rather than swept away. */
    if (!isObject(entry)) continue;
    if (isObject(entry.token)) tokens++;
    if (isObject(entry.runner)) runners++;
    if (isObject(entry.vault)) grants += Object.keys(entry.vault).length;
    delete entry.token;
    delete entry.runner;
    delete entry.vault;
    /* The entry goes once it is empty. Anything else a later version keeps per host stays, and so does its key. */
    if (Object.keys(entry).length === 0) delete hosts.hosts[written];
  }

  const wasDefault = typeof hosts.default === 'string' && sameHost(hosts.default, key);
  if (wasDefault) delete hosts.default;

  const removed: string[] = [];
  if (tokens > 0) removed.push(count(tokens, 'token', 'tokens'));
  if (runners > 0) removed.push(count(runners, 'runner token', 'runner tokens'));
  if (grants > 0) removed.push(count(grants, 'vault grant', 'vault grants'));

  /* NOTHING TO REMOVE IS THE STATE THAT WAS ASKED FOR, so it is 0, and the file is not rewritten. */
  if (removed.length === 0 && !wasDefault) {
    io.say(`No login to ${key} is kept on this machine, so there was nothing to remove.`);
    return 0;
  }

  try {
    saveHosts(io.file, hosts);
  } catch {
    /* The failure could quote the file's contents, and the contents hold a token. */
    io.say(`${io.file} could not be written, so nothing was removed. Check the folder's permissions and run braindog logout ${key} again.`);
    return REFUSED;
  }

  const what = removed.length === 0 ? 'no token was kept for it' : `${list(removed)} removed`;
  io.say(`signed out of ${key} · ${what}${wasDefault ? ' · no default host is set now' : ''}`);
  return 0;
}
