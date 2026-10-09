/**
 * The last good handshake and tool list a host gave, kept per host, for a session that starts while the host is away.
 *
 * WHAT A HOST SAID, AND NOTHING THIS MACHINE HOLDS. The file keeps the `initialize` result (the server's name, version,
 * instructions and capabilities) and the `tools/list` result, as the host answered them, with the build that answered.
 * No bearer, no session hint and no header is written, so the file is safe to read and the folder safe to copy.
 *
 * WRITTEN WHOLE AND RENAMED INTO PLACE, at 0600 in a folder made at 0700, as `saveHosts` writes the hosts file: ten
 * sessions starting at once each write it, and a reader must never see half of one.
 *
 * READ AS A HINT. A file that is missing, not JSON, or not this shape is no cache, never an error: the bridge then lets
 * the bundled server answer the handshake, as it does for a machine that is not signed in.
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** One host's last good answers. `build` is the host's `braindog-build` when it sent one. */
export type DoorCache = { host: string; build?: string | undefined; initialize: Record<string, unknown>; tools?: Record<string, unknown> | undefined; at: string };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * `~/.braindog/cache/door-<host>.json`. The host's key (`https://brain.dog/acme`) loses its scheme, and every character
 * a file name cannot carry on every system becomes `-`, so `door-brain.dog-acme.json`.
 */
export function cacheFile(home: string, host: string): string {
  const name = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'host';
  return join(home, '.braindog', 'cache', `door-${name}.json`);
}

/** The cache for `host`, or `null` when there is none this bridge can serve. */
export function readDoorCache(home: string, host: string): DoorCache | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(cacheFile(home, host), 'utf8'));
  } catch {
    return null;
  }
  /* ANOTHER HOST'S FILE IS NOT THIS ONE'S, if two keys ever fold to one name. */
  if (!isObject(parsed) || parsed.host !== host || !isObject(parsed.initialize)) return null;
  return {
    host,
    ...(typeof parsed.build === 'string' ? { build: parsed.build } : {}),
    initialize: parsed.initialize,
    ...(isObject(parsed.tools) && Array.isArray(parsed.tools.tools) ? { tools: parsed.tools } : {}),
    at: typeof parsed.at === 'string' ? parsed.at : '',
  };
}

/**
 * Keeps what changed over what was there: a handshake, a tool list, or both. A tool list with no handshake beside it is
 * not kept, because a cache without a handshake is never served.
 *
 * NEVER THROWS. A disk that is full or a folder that is not writable costs the next session its cache, not this
 * session its answer, and the sentence would quote a path, so it is not said.
 */
export function writeDoorCache(home: string, host: string, got: { build?: string | undefined; initialize?: Record<string, unknown> | undefined; tools?: Record<string, unknown> | undefined }, now: Date = new Date()): void {
  try {
    const was = readDoorCache(home, host);
    const initialize = got.initialize ?? was?.initialize;
    if (initialize === undefined) return;
    const build = got.build ?? was?.build;
    /* A LIST FROM ANOTHER BUILD IS NOT THIS BUILD'S LIST. Kept under the new build's name, a session that starts while
       the host is away would find the builds equal when it comes back, and never ask for the new list. */
    const tools = got.tools ?? (got.build === undefined || got.build === was?.build ? was?.tools : undefined);
    const kept: DoorCache = { host, ...(build !== undefined ? { build } : {}), initialize, ...(tools !== undefined ? { tools } : {}), at: now.toISOString() };
    const file = cacheFile(home, host);
    mkdirSync(join(home, '.braindog', 'cache'), { recursive: true, mode: 0o700 });
    /* ONE SCRATCH NAME PER PROCESS, so ten sessions writing at once never rename one another's half-written file. */
    const part = `${file}.${process.pid}.tmp`;
    writeFileSync(part, `${JSON.stringify(kept)}\n`, { mode: 0o600 });
    chmodSync(part, 0o600);
    renameSync(part, file);
  } catch {
    /* See above. */
  }
}
