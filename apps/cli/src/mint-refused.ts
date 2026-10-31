/**
 * The keys in `BRAINDOG_TOKEN` a host already refused to make an agent's token from, so `braindog mcp` does not ask again.
 *
 * WHY (finish queue CS1). Under `BRAINDOG_TOKEN`, every `braindog mcp` start tries to make the agent its own token from
 * the key (D4, `agentTokenFromKey` in `setup.ts`), and does so before it answers the client's hello. A self-host's server
 * key is made one; a plain token is refused (`NEEDS_BROWSER_SESSION`: a token cannot make tokens), and was asked again at
 * every start, one more round trip and up to five seconds before the hello. A token never becomes a server key, so the
 * answer is kept for that key and that host, and the start skips the ask while the same key is set. A different key is
 * asked again, and a key that is later made a token clears its line.
 *
 * ONLY A REFUSAL ABOUT THE KEY ITSELF IS KEPT (`KEPT_CODES`). A host that did not answer, answered something this command
 * does not read, was busy, or does not take the key at all (`UNAUTHORIZED`, which a self-host started later with that
 * very key as its server key would take) is asked again next time.
 *
 * `~/.braindog/mint-refused.json`: host keys, `keyPrint`s and times, never a key or a token. A print is the first 16 hex
 * of the key's SHA-256 (`keyPrint` in `http.ts`), which says nothing of the key and cannot be turned back into it.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { keyPrint, sameHost } from './http.ts';
import { unbom } from './unbom.ts';

/** The refusals that say the key is not one tokens are made from: a token (`admin` in the record), or short of the owner. */
export const KEPT_CODES: readonly string[] = ['NEEDS_BROWSER_SESSION', 'FORBIDDEN'];

/** One host's refusal: the print of the key it refused, the code it gave, and when. */
type Kept = { print: string; code: string; at: string };

export const mintRefusedPath = (home: string): string => join(home, '.braindog', 'mint-refused.json');

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function readAll(home: string): Record<string, Kept> {
  const file = mintRefusedPath(home);
  if (!existsSync(file)) return {};
  try {
    const x: unknown = JSON.parse(unbom(readFileSync(file, 'utf8')));
    if (!isObject(x) || !isObject(x.hosts)) return {};
    const out: Record<string, Kept> = {};
    for (const [host, k] of Object.entries(x.hosts))
      if (isObject(k) && typeof k.print === 'string' && typeof k.code === 'string' && typeof k.at === 'string') out[host] = { print: k.print, code: k.code, at: k.at };
    return out;
  } catch {
    return {};
  }
}

/** Written whole and renamed, at 0600 in a folder made at 0700, as the other files under `~/.braindog` are. */
function writeAll(home: string, all: Record<string, Kept>): void {
  const file = mintRefusedPath(home);
  mkdirSync(join(home, '.braindog'), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ hosts: all }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/** The entries for `host` under any spelling of it (`sameHost`), and the rest. */
const split = (all: Record<string, Kept>, host: string) => {
  const other: Record<string, Kept> = {};
  let mine: Kept | undefined;
  for (const [written, k] of Object.entries(all)) {
    if (sameHost(written, host)) mine = k;
    else other[written] = k;
  }
  return { mine, other };
};

/** Whether `host` refused to make a token from this very `key` before. */
export function mintRefused(home: string, host: string, key: string): boolean {
  return split(readAll(home), host).mine?.print === keyPrint(key);
}

/**
 * The host's answer to a token asked for from `key`: a refusal in `KEPT_CODES` is kept for the key, a token made clears
 * the host's line, and anything else leaves the file as it is. Never throws: a home folder that cannot be written asks
 * again at the next start, and costs nothing else.
 */
export function keepMintAnswer(home: string, host: string, key: string, answer: { made: true } | { code: string }, now: number = Date.now()): void {
  try {
    const { mine, other } = split(readAll(home), host);
    if ('made' in answer) {
      if (mine !== undefined) writeAll(home, other);
      return;
    }
    if (!KEPT_CODES.includes(answer.code)) return;
    writeAll(home, { ...other, [host]: { print: keyPrint(key), code: answer.code, at: new Date(now).toISOString() } });
  } catch {
    /* Not kept: the next start asks once more. */
  }
}
