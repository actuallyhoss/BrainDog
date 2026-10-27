/**
 * The pack catalogue, read once at build time for `/packs` and every `/packs/<id>`.
 *
 * THROUGH `node:fs` AND NEVER AN IMPORT: the files are the web app's
 * (`apps/web/static/catalogue/`, written by `tools/catalogue/from-packs.mjs`), and an import would be an
 * edge from the site into another app that the `graph` gate refuses. Nothing is copied into this site's
 * `static/`, because a build that writes a tracked file fails CI's clean-tree check.
 *
 * `.server.ts`, so SvelteKit refuses it in anything the browser loads: the pages get what the loads
 * return, prerendered into the HTML, and never this module or a path on the build machine.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { countsOf, entriesOf, offered, previewOf, type Entry } from './catalogue.ts';

/**
 * Where the catalogue sits. A build runs from `apps/site` (`pnpm --filter`), and a script run from the
 * repository's root is the other place anyone starts one; the first holding an `index.json` wins.
 */
const ROOTS = ['../web/static/catalogue', 'apps/web/static/catalogue'];

const root: string | null = ROOTS.map((r) => resolve(process.cwd(), r)).find((r) => existsSync(resolve(r, 'index.json'))) ?? null;

const json = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
};

let entries: Entry[] | null = null;

/** Every entry of the catalogue's `index.json`, public or not; none when there is no catalogue to read. */
export function readEntries(): Entry[] {
  entries ??= root === null ? [] : entriesOf(json(resolve(root, 'index.json')));
  return entries;
}

/**
 * The drawn preview of the version a stranger is offered, when its index entry says one was made
 * (`preview: true`) and the file is there beside it; otherwise none, and the page draws what it adds.
 */
export function readPreview(e: Entry): ReturnType<typeof previewOf> {
  const v = offered(e);
  if (root === null || v === null || v.preview !== true) return null;
  const path = resolve(root, e.kind === 'pack' ? 'packs' : 'usecases', e.id, `${v.version}.preview.json`);
  return existsSync(path) ? previewOf(json(path)) : null;
}

/**
 * THE KENNEL'S COUNTS, `kennel/counts.json`, as its public address answers them
 * (`GET /api/kennel/v1/counts.json`, `apps/worker/src/kennel.ts`). The nightly walk writes the file into
 * the Kennel's storage and nowhere in this tree, so the build asks for it, once, and waits a few seconds
 * at most. A build with no network, or a Kennel with nothing counted yet, draws no count at all, never a
 * zero: `countsOf` keeps only what rounds to ten or more.
 */
const COUNTS_AT = 'https://app.brain.dog/api/kennel/v1/counts.json';

let counts: Promise<ReadonlyMap<string, number>> | null = null;

export function readCounts(): Promise<ReadonlyMap<string, number>> {
  counts ??= (async () => {
    try {
      const res = await fetch(COUNTS_AT, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      return res.ok ? countsOf(await res.json()) : new Map<string, number>();
    } catch {
      return new Map<string, number>();
    }
  })();
  return counts;
}
