/**
 * The plugin catalogue, read once at build time for `/plugins`, every `/plugins/<id>` and every `/plugins/by/<who>`.
 *
 * TWO SOURCES, MERGED (`mergeEntries`): the catalogue bundled with the web app (`apps/web/static/catalogue/`, written by
 * `tools/catalogue/from-packs.mjs`), and the Kennel's public index (`GET /api/kennel/v1/index.json`), which holds every
 * plugin somebody else published and reviewed. The bundled one is read from disk and always there; the Kennel is asked
 * once over the network and waited on a few seconds at most, so a build with no network still draws BrainDog's own.
 *
 * `BRAINDOG_KENNEL` names another Kennel (its `/api/kennel/v1` address, for a local one) or `off` for none.
 *
 * THROUGH `node:fs` AND `fetch`, NEVER AN IMPORT: an import of the web app's files would be an edge from the site into
 * another app that the `graph` gate refuses. Nothing is copied into this site's `static/`, because a build that writes a
 * tracked file fails CI's clean-tree check.
 *
 * `.server.ts`, so SvelteKit refuses it in anything the browser loads: the pages get what the loads return, prerendered
 * into the HTML, and never this module or a path on the build machine.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { countsOf, entriesOf, mergeEntries, offered, previewOf, type Entry } from './catalogue.ts';

/**
 * Where the catalogue sits. A build runs from `apps/site` (`pnpm --filter`), and a script run from the
 * repository's root is the other place anyone starts one; the first holding an `index.json` wins.
 */
const ROOTS = ['../web/static/catalogue', 'apps/web/static/catalogue'];

const root: string | null = ROOTS.map((r) => resolve(process.cwd(), r)).find((r) => existsSync(resolve(r, 'index.json'))) ?? null;

/** The Kennel's public address, or `null` when this build reads none. */
const KENNEL: string | null = (() => {
  const set = process.env['BRAINDOG_KENNEL']?.trim();
  if (set === 'off') return null;
  return (set && /^https?:\/\//u.test(set) ? set : 'https://app.brain.dog/api/kennel/v1').replace(/\/+$/u, '');
})();

/** How long the build waits on the Kennel for one file before drawing without it. */
const WAIT_MS = 5000;

const json = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
};

/** One JSON file from the Kennel, or `null` on any miss, a refusal, a timeout or no network. */
async function fromKennel(path: string): Promise<unknown> {
  if (KENNEL === null) return null;
  try {
    const res = await fetch(`${KENNEL}/${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(WAIT_MS) });
    return res.ok ? ((await res.json()) as unknown) : null;
  } catch {
    return null;
  }
}

const keyOf = (e: Pick<Entry, 'kind' | 'id'>): string => `${e.kind}:${e.id}`;

let bundledKeys: ReadonlySet<string> = new Set();
let entries: Promise<Entry[]> | null = null;

/**
 * Every entry of the bundled catalogue and the Kennel's index, public or not. With no Kennel to reach, the bundled
 * catalogue alone; with neither, none.
 */
export function readEntries(): Promise<Entry[]> {
  entries ??= (async () => {
    const bundled = root === null ? [] : entriesOf(json(resolve(root, 'index.json')));
    bundledKeys = new Set(bundled.map(keyOf));
    return mergeEntries(bundled, entriesOf(await fromKennel('index.json')));
  })();
  return entries;
}

/** Whether an entry came from the Kennel alone, which is the only place its files are. */
export const fromKennelOnly = (e: Pick<Entry, 'kind' | 'id'>): boolean => !bundledKeys.has(keyOf(e));

/**
 * The drawn preview of the version a stranger is offered, when its index entry says one was made (`preview: true`):
 * from beside the bundled file, or from the Kennel for an entry only the Kennel lists. The preview is BrainDog's own
 * drawing from a scratch install (`tools/catalogue/previews.mjs`, the Kennel's review), never the author's picture.
 */
export async function readPreview(e: Entry): Promise<ReturnType<typeof previewOf>> {
  const v = offered(e);
  if (v === null || v.preview !== true) return null;
  const path = `${e.kind === 'pack' ? 'packs' : 'usecases'}/${e.id}/${v.version}.preview.json`;
  if (fromKennelOnly(e)) return previewOf(await fromKennel(path));
  const at = root === null ? null : resolve(root, path);
  return at !== null && existsSync(at) ? previewOf(json(at)) : null;
}

/**
 * THE KENNEL'S COUNTS, `counts.json`, as its public address answers them (`apps/worker/src/kennel.ts`). The nightly
 * walk writes the file into the Kennel's storage and nowhere in this tree, so the build asks for it, once. A build with
 * no network, or a Kennel with nothing counted yet, draws no count at all, never a zero: `countsOf` keeps only what
 * rounds to ten or more.
 */
let counts: Promise<ReadonlyMap<string, number>> | null = null;

export function readCounts(): Promise<ReadonlyMap<string, number>> {
  counts ??= fromKennel('counts.json').then(countsOf);
  return counts;
}
