/**
 * Every route the app has, and one address for each.
 *
 * DERIVED FROM THE TREE, NOT TYPED OUT. Both browser gates held a hand-written list, and the two
 * disagreed: `a11y` was missing `/s/[token]` — the shared page, the only surface a non-user ever
 * sees — and neither list was compared to the route directory, so a route added tomorrow is audited
 * by neither and nothing notices. A gate whose coverage is a list somebody remembers to update is a
 * gate whose coverage decays silently.
 *
 * A DYNAMIC SEGMENT NEEDS A SAMPLE, and a route with none is a FAILURE rather than a skip: it is the
 * only way "we forgot to sample this" is distinguishable from "there is nothing here".
 */

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { skipDir } from './lib.mjs';

/**
 * One address per dynamic segment, by the segment's own name — or several, where one is a lie.
 *
 * ONE SAMPLE IS RIGHT FOR A ROW AND WRONG FOR A ROUTE THAT IS TWELVE SCREENS. `/settings/[area]` was
 * sampled as `appearance`, so **eleven of the twelve settings areas were measured by neither browser
 * gate** — not the People matrix, not the agents code field, not backups, not export, not the twelve
 * areas' own controls. A review found a control at 43x36 on `/settings/people` and the gate that
 * exists to measure exactly that had never loaded the page.
 *
 * `/r/[register]` stays at one, and that is the right call for the opposite reason: eight registers
 * draw the same component from the same declaration, so the ninth teaches nothing a browser gate can
 * see. The settings areas share a route file and nothing else — twelve different screens behind one
 * `{:else if}` chain, which is precisely a case where the sample IS the coverage.
 */
const SAMPLES = {
  '[register]': 'obligations',
  '[seq]': '1',
  /* SG5, AND NOT THE SAMPLE'S SG31. The gates read the seeded record, whose counters start at 1, and
     `installSeed` files the sample's Kiln licensing question fifth: open, with three options. */
  '[id]': 'SG5',
  '[slug]': 'money',
  '[area]': [
    'appearance',
    'identity',
    'recovery',
    'people',
    'agents',
    'ingest',
    'keyboard',
    'navigation',
    'notifications',
    'backups',
    'billing',
    'export',
  ],
  '[track]': '2',
  '[view]': 'obligations.overdue',
  '[token]': '9f2a7c41d8b3',
};

/** A job id is not a suggestion id, and `[id]` is both. Keyed by the route it sits under. */
const BY_ROUTE = { '/jobs/[id]': 'j_7Q2F' };

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (skipDir(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name === '+page.svelte') out.push(dir);
  }
  return out;
}

/**
 * The routes of one SvelteKit app, as addresses, plus any that could not be sampled.
 *
 * Returns `{ routes, unsampled }`. A caller that ignores `unsampled` is a caller that has quietly
 * stopped checking part of the app.
 */
export async function routesOf(appRoot, extra = []) {
  const dirs = await walk(join(appRoot, 'src', 'routes'));
  const routes = [];
  const unsampled = [];

  for (const dir of dirs) {
    const rel = relative(join(appRoot, 'src', 'routes'), dir).replace(/[\\/]+/g, '/');
    const pattern = rel === '' ? '/' : `/${rel}`;
    const segments = pattern === '/' ? [] : pattern.slice(1).split('/');
    /* A SAMPLE MAY BE SEVERAL, so one pattern can yield several addresses. `filled` is a list of
       lists and the addresses are its cross product — which is one address for every route that has
       a single sample per segment, and twelve for the settings route. */
    let filled = [[]];
    let missing = null;
    for (const s of segments) {
      if (!s.startsWith('[')) {
        filled = filled.map((f) => [...f, s]);
        continue;
      }
      const sample = BY_ROUTE[pattern] ?? SAMPLES[s];
      if (sample === undefined) {
        missing = s;
        break;
      }
      const options = Array.isArray(sample) ? sample : [sample];
      filled = filled.flatMap((f) => options.map((o) => [...f, o]));
    }
    if (missing) unsampled.push(`${pattern} — no sample for ${missing}`);
    else for (const f of filled) routes.push(f.length === 0 ? '/' : `/${f.join('/')}`);
  }

  return { routes: [...routes, ...extra].sort(), unsampled };
}
