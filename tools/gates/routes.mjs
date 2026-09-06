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

/** One address per dynamic segment, by the segment's own name. */
const SAMPLES = {
  '[register]': 'obligations',
  '[seq]': '1',
  '[id]': 'SG31',
  '[slug]': 'money',
  '[area]': 'appearance',
  '[track]': '2',
  '[view]': 'obligations.overdue',
  '[token]': '9f2a7c41d8b3',
};

/** A job id is not a suggestion id, and `[id]` is both. Keyed by the route it sits under. */
const BY_ROUTE = { '/jobs/[id]': 'j_7Q2F' };

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
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
    const filled = [];
    let missing = null;
    for (const s of segments) {
      if (!s.startsWith('[')) filled.push(s);
      else {
        const sample = BY_ROUTE[pattern] ?? SAMPLES[s];
        if (sample === undefined) missing = s;
        else filled.push(sample);
      }
    }
    if (missing) unsampled.push(`${pattern} — no sample for ${missing}`);
    else routes.push(filled.length === 0 ? '/' : `/${filled.join('/')}`);
  }

  return { routes: [...routes, ...extra].sort(), unsampled };
}
