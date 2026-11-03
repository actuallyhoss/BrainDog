/**
 * The Kennel on a self-host: `/api/kennel/v1/`, the paths the Cloud answers
 * (`docs/14-KENNEL-AND-COMMUNITY.md` §1), so the app, the command line and an agent ask every BrainDog the same way.
 *
 * A SELF-HOST KEEPS NO KENNEL OF ITS OWN. It answers from two places, in this order: the operator's catalogue folder
 * (`BRAINDOG_CATALOGUE`, or the one bundled in the built shell, `catalogueFolder`), then the public Kennel that
 * `BRAINDOG_KENNEL` names, `https://app.brain.dog/api/kennel/v1/` when it names none. The folder comes first, so an id the
 * operator publishes there is theirs on this host whatever the public Kennel lists under it (`mergeIndexes`).
 *
 * THE PUBLIC KENNEL'S INDEX AND COUNTS ARE KEPT FOR `KENNEL_KEEP_MS`, and one that does not answer is served from what
 * was kept. With nothing kept, or with `BRAINDOG_KENNEL=off`, the folder answers alone: a self-host with no network
 * still shows what its own folder holds, and nothing it serves waits on another host for longer than `KENNEL_WAIT_MS`.
 * A published file is never kept here, because it never changes and the app holds it to its checksum anyway.
 *
 * WRITES ARE THE PUBLIC KENNEL'S. A submission, a yank and a review are refused here in one sentence naming where they
 * go: this host has no bucket to keep them in and no operator's review to put them through.
 */

import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { env } from 'node:process';

import { readCatalogue, type CatalogueIndex } from '@braindog/declare/catalogue';
import { ADVISORIES_FILE, DEFAULT_KENNEL, KENNEL_BASE, kennelAsk, mergeAdvisories, mergeIndexes, readAdvisories, type Advisories } from '@braindog/declare/kennel';
import { listedEntries } from '@braindog/declare/catalogue';

import type { Answer } from './catalogue.ts';

/** How long the public Kennel's index and counts are kept before they are asked for again: ten minutes. */
export const KENNEL_KEEP_MS = 600_000;
/** How long one read of the public Kennel may take before this host answers without it. */
export const KENNEL_WAIT_MS = 5_000;
/**
 * How long an index or counts read that the public Kennel did not answer is not asked again: a minute. The install
 * shelf and Slash's offers read the index on every ask, so a host with no network would otherwise wait out
 * `KENNEL_WAIT_MS` each time.
 */
export const KENNEL_MISS_MS = 60_000;
/** The most an index or a counts file read from the public Kennel may weigh. */
export const KENNEL_INDEX_MOST_BYTES = 8 * 1_048_576;
/** The most a file or a preview read from the public Kennel may weigh: a preview draws every page, so more than a file's cap. */
export const KENNEL_FILE_MOST_BYTES = 4 * 1_048_576;

/** What the Kennel reads besides the folder: the setting, a way to fetch, and the clock. A test hands in all three. */
export type KennelDeps = {
  /** `BRAINDOG_KENNEL` as the environment says it: unset, `off`, or the public Kennel's address. */
  kennel: string | undefined;
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  now: () => number;
};

/* READ AT EACH REQUEST, NOT AT START, so a value changed in the environment file is the one in force after the restart. */
const fromEnv = (): KennelDeps => ({ kennel: env.BRAINDOG_KENNEL, fetch: (url, init) => fetch(url, init), now: () => Date.now() });

export const servesKennel = (pathname: string): boolean => pathname === KENNEL_BASE.slice(0, -1) || pathname.startsWith(KENNEL_BASE);

/** Where the public Kennel is, with its trailing slash, or `null` for none: `off`, or a value that is not an address. */
export function kennelBase(said: string | undefined): string | null {
  const value = (said ?? '').trim();
  if (value === '') return DEFAULT_KENNEL;
  if (value.toLowerCase() === 'off') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

/* ONCE PER PROCESS, as `validFrom` in `server.ts` says its own: an address that does not read would print on every request. */
let unreadTold = false;

/* ── the public Kennel ──────────────────────────────────────────────────── */

/** A body read to at most `most` bytes, or `null` past it. `Content-Length` is a claim, so the count is the check that holds. */
async function cappedText(res: Response, most: number): Promise<string | null> {
  if (Number(res.headers.get('content-length') ?? 0) > most) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > most) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** One read of the public Kennel: its text, or `null` for anything but a 200 inside the time and the size. */
async function fetched(deps: KennelDeps, url: string, most: number): Promise<string | null> {
  try {
    const res = await deps.fetch(url, { signal: AbortSignal.timeout(KENNEL_WAIT_MS) });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    return await cappedText(res, most);
  } catch {
    return null;
  }
}

/* WHAT WAS KEPT, BY ADDRESS: the index and the counts of each Kennel this process was pointed at, so two entries a Kennel. */
const kept = new Map<string, { at: number; text: string }>();
/* AND WHAT IS BEING ASKED, so a burst of readers after the ten minutes waits on one read rather than making one each. */
const asking = new Map<string, Promise<string | null>>();
/* AND WHAT DID NOT ANSWER, by when, so a host off the network waits once a minute, not once a read. */
const missed = new Map<string, number>();

/**
 * A kept read: fresh for `KENNEL_KEEP_MS`, then asked again, and the last good answer when the Kennel does not answer.
 *
 * ONLY AN ANSWER THAT `reads` IS KEPT. An address that answers a 200 with something else, a web page or a proxy's
 * message, is the same to this host as one that does not answer, so it never replaces a catalogue kept from before.
 */
async function keptText(deps: KennelDeps, url: string, reads: (text: string) => boolean): Promise<string | null> {
  const was = kept.get(url);
  if (was !== undefined && deps.now() - was.at < KENNEL_KEEP_MS) return was.text;
  const miss = missed.get(url);
  if (miss !== undefined && deps.now() - miss < KENNEL_MISS_MS) return was?.text ?? null;
  let pending = asking.get(url);
  if (pending === undefined) {
    pending = fetched(deps, url, KENNEL_INDEX_MOST_BYTES).finally(() => asking.delete(url));
    asking.set(url, pending);
  }
  const text = await pending;
  if (text === null || !reads(text)) {
    missed.set(url, deps.now());
    return was?.text ?? null;
  }
  missed.delete(url);
  kept.set(url, { at: deps.now(), text });
  return text;
}

/* ── the folder ─────────────────────────────────────────────────────────── */

/** A file from the folder, by a path `kennelAsk` matched whole, or `null`. */
function local(folder: string | undefined, path: string): string | null {
  if (folder === undefined) return null;
  try {
    return readFileSync(join(folder, ...path.split('/')), 'utf8');
  } catch {
    return null;
  }
}

/** An index's text read as a catalogue, or `null` when it is not one. */
function catalogueIn(text: string | null): CatalogueIndex | null {
  if (text === null) return null;
  try {
    const read = readCatalogue(JSON.parse(text) as unknown);
    return read.ok ? read.value : null;
  } catch {
    return null;
  }
}

/** A counts file's text when it has the shape every reader rounds, or `null`. */
function countsIn(text: string | null): string | null {
  if (text === null) return null;
  try {
    const doc = JSON.parse(text) as { at?: unknown; counts?: unknown };
    const counts = doc.counts;
    if (typeof doc.at !== 'string' || typeof counts !== 'object' || counts === null || Array.isArray(counts)) return null;
    if (!Object.values(counts).every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) return null;
    return JSON.stringify({ at: doc.at, counts });
  } catch {
    return null;
  }
}

/* ── the two reads, for the doors and for installs ─────────────────────── */

/** The folder's index and the public Kennel's merged, the folder's first (`mergeIndexes`), every entry kept. */
async function mergedIndex(folder: string | undefined, base: string | null, deps: KennelDeps): Promise<CatalogueIndex> {
  const theirs = base === null ? null : catalogueIn(await keptText(deps, `${base}index.json`, (text) => catalogueIn(text) !== null));
  return mergeIndexes(catalogueIn(local(folder, 'index.json')), theirs);
}

/** An advisories file's text read as one, or `null`. */
function advisoriesIn(text: string | null): Advisories | null {
  if (text === null) return null;
  try {
    return readAdvisories(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/**
 * The folder's advisories and the public Kennel's merged, the folder's first: what a record is told about the add-ons
 * it holds (DESIGN.md §8). Kept as the index is kept, so the kill switch reaches a self-host on its next index read.
 */
async function mergedAdvisories(folder: string | undefined, base: string | null, deps: KennelDeps): Promise<Advisories> {
  const theirs = base === null ? null : advisoriesIn(await keptText(deps, `${base}${ADVISORIES_FILE}`, (text) => advisoriesIn(text) !== null));
  return mergeAdvisories(advisoriesIn(local(folder, ADVISORIES_FILE)), theirs);
}

/** A published file or preview by a path matched whole: the folder's, then the public Kennel's, or `null`. */
async function fileFrom(folder: string | undefined, base: string | null, deps: KennelDeps, path: string): Promise<string | null> {
  return local(folder, path) ?? (base === null ? null : await fetched(deps, `${base}${path}`, KENNEL_FILE_MOST_BYTES));
}

/** What `kennelReader` answers: the merged index, and a file by its catalogue path. */
export type KennelReader = { index(): Promise<CatalogueIndex>; file(path: string): Promise<string | null>; advisories(): Promise<Advisories> };

/**
 * The Kennel read the way this host installs from it, the self-host's side of the Worker's `kennelReader`
 * (`apps/worker/src/kennel.ts`): THE SAME TWO READS THE DOORS ABOVE MAKE, so what a record installs by id is what
 * `GET index.json` and `GET packs/...` serve here. The folder's `unlisted` entries are kept for install by id; the
 * public Kennel lists none, so one of its unlisted add-ons is not found from a self-host.
 *
 * `BRAINDOG_KENNEL` IS READ AT EACH CALL, as a request reads it. Off, or not answering with nothing kept, and the
 * folder answers alone. The caller holds every path to the two shapes a catalogue lists.
 */
export function kennelReader(folder: string | undefined, deps?: KennelDeps): KennelReader {
  const bound = (): { d: KennelDeps; base: string | null } => {
    const d = deps ?? fromEnv();
    return { d, base: kennelBase(d.kennel) };
  };
  return {
    index: () => {
      const { d, base } = bound();
      return mergedIndex(folder, base, d);
    },
    file: (path) => {
      const { d, base } = bound();
      return fileFrom(folder, base, d, path);
    },
    advisories: () => {
      const { d, base } = bound();
      return mergedAdvisories(folder, base, d);
    },
  };
}

/* ── answers ────────────────────────────────────────────────────────────── */

const BASE_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' } as const;
/* A READ CARRIES NO CORS HEADER, as on the Cloud, and only a published file may be kept by a cache: it never changes. */
const READ = { ...BASE_HEADERS, 'cache-control': 'no-store' };
const KEPT = { ...BASE_HEADERS, 'cache-control': 'public, max-age=31536000, immutable' };

const refused = (status: number, code: string, fix: string, extra: Record<string, string> = {}): Answer => ({
  status,
  headers: { ...BASE_HEADERS, 'cache-control': 'no-store', ...extra },
  body: JSON.stringify({ ok: false, refusal: { code, fix } }),
});

const WHAT =
  'The Kennel answers index.json, counts.json, packs/<id>/<version>.pack.json, usecases/<id>/<version>.usecase.json and their .preview.json, and takes submit and yank.';

/** The answer for one request under `KENNEL_BASE`, without a socket, so a test reads it whole. */
export async function kennelAnswer(method: string, pathname: string, folder: string | undefined, deps: KennelDeps): Promise<Answer> {
  const asked = kennelAsk(method, pathname);
  if ('wrong' in asked)
    return asked.wrong === 'method'
      ? refused(405, 'ROUTE_UNKNOWN', `This Kennel address takes ${asked.allow}.`, { allow: asked.allow })
      : refused(404, 'ROUTE_UNKNOWN', WHAT);
  const base = kennelBase(deps.kennel);
  if (base === null && deps.kennel !== undefined && deps.kennel.trim().toLowerCase() !== 'off' && !unreadTold) {
    unreadTold = true;
    console.error('kennel: BRAINDOG_KENNEL is not an http or https address, such as https://app.brain.dog/api/kennel/v1/, so this host reads its own folder alone until it is corrected.');
  }
  switch (asked.ask) {
    case 'index': {
      /* THE INDEX LEAVES OUT AN `unlisted` ENTRY, as the Worker's does (`apps/worker/src/kennel.ts`): its files still
         answer by exact path. */
      const merged = await mergedIndex(folder, base, deps);
      return { status: 200, headers: READ, body: JSON.stringify({ ...merged, entries: listedEntries(merged) }) };
    }
    case 'counts': {
      const counted = base === null ? null : countsIn(await keptText(deps, `${base}counts.json`, (text) => countsIn(text) !== null));
      return { status: 200, headers: READ, body: counted ?? JSON.stringify({ at: new Date(deps.now()).toISOString(), counts: {} }) };
    }
    case 'file':
    case 'preview': {
      const text = await fileFrom(folder, base, deps, asked.path);
      if (text === null)
        return refused(404, 'ROUTE_UNKNOWN', `This BrainDog holds no ${asked.path}, and ${base === null ? 'it reads no Kennel' : 'the Kennel did not answer for it'}.`);
      return { status: 200, headers: asked.ask === 'file' ? KEPT : READ, body: text };
    }
    case 'advisories':
      return { status: 200, headers: READ, body: JSON.stringify(await mergedAdvisories(folder, base, deps)) };
    case 'submit':
    case 'yank':
    case 'mine':
    case 'advise':
    case 'key':
    case 'report':
    case 'review':
    case 'verdict':
    case 'publisher':
      return refused(
        501,
        'NOT_IN_THIS_BUILD',
        base === null
          ? 'This BrainDog reads no Kennel (BRAINDOG_KENNEL is off), and takes no submissions, yanks or reviews itself.'
          : `This BrainDog reads the Kennel at ${base} and takes no submissions, yanks or reviews itself. Send this to ${base}${pathname.slice(KENNEL_BASE.length)}.`,
      );
  }
}

/** A request under `KENNEL_BASE` answered on its socket. Nothing here throws past it; a socket that failed is closed. */
export function serveKennelTo(req: IncomingMessage, res: ServerResponse, folder: string | undefined, deps: KennelDeps = fromEnv()): void {
  const method = req.method ?? 'GET';
  void kennelAnswer(method, new URL(req.url ?? '/', 'http://localhost').pathname, folder, deps).then(
    (answer) => {
      res.writeHead(answer.status, answer.headers);
      res.end(method === 'HEAD' ? undefined : answer.body);
    },
    () => res.destroy(),
  );
}
