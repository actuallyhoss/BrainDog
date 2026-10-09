/**
 * Every route the app has, and one address for each.
 *
 * DERIVED FROM THE TREE, NOT TYPED OUT. Both browser gates held a hand-written list, and the two
 * disagreed: `a11y` was missing `/s/[token]` (the shared page, the only surface a non-user ever
 * sees), and neither list was compared to the route directory, so a route added tomorrow is audited
 * by neither and nothing notices. A gate whose coverage is a list somebody remembers to update is a
 * gate whose coverage decays silently.
 *
 * A DYNAMIC SEGMENT NEEDS A SAMPLE, and a route with none is a FAILURE rather than a skip: it is the
 * only way "we forgot to sample this" is distinguishable from "there is nothing here".
 *
 * AND THE SAMPLE IS THE RECORD'S (PRF-B04). `routesFor` asks the record a gate draws for its own ids, so an automation
 * and a catalogue entry are opened by an id they have, not by a question's. `routesOf` is the same walk with no record,
 * for the gates that have not moved onto `routesFor` yet.
 */

import { readdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { skipDir } from './lib.mjs';
import { AREAS } from '../../apps/web/src/routes/settings/[area]/place.ts';

/** One dynamic segment filled: `{ '[register]': 'obligations', '[seq]': '1' }`. */
const fill = (seg, value) => ({ [seg]: String(value) });

/**
 * EVERY ROUTE'S SAMPLE, IN ONE TABLE, keyed `<app>:<pattern>` (PRF-B04 job 2). It was two: `SAMPLES` by segment name and
 * `BY_ROUTE` by pattern, and a segment's name decided which id a route got, so `/automations/[id]` and
 * `/packs/browse/[id]` opened `SG5`, a question's id that no automation and no catalogue entry has, and both were
 * measured as not found. Keyed by app because `/packs/[id]` is two routes: the record app's add-on and the site's listing.
 *
 * An entry is one of two kinds:
 * - `{ fixed }`: fills that are not the record's to give. The sixteen Settings areas are read from the place that
 *   declares them (`settings/[area]/place.ts` `AREAS`), so an area added there is swept without a line here; it was a
 *   hand-typed fourteen, and Pages and Words and money were never opened. The site keeps its own samples, and
 *   `/s/[token]` opens a link that names no page, which is the whole of what that route draws while sharing is off.
 * - `{ asks, was }`: fills read from what the record answered (`readRecord`). An address the record has nothing for is
 *   opened once at `was`, the sample it had before, drawn as not found, and named in `unseen`.
 * `missing: true` marks a fixed sample that names nothing on purpose, so it is drawn as not found too (`missing` below).
 */
export const SAMPLE_OF = {
  'web:/[id]': { asks: (s) => s.questions.map((id) => fill('[id]', id)), was: [fill('[id]', 'SG5')] },
  'web:/decide/[id]': { asks: (s) => s.questions.map((id) => fill('[id]', id)), was: [fill('[id]', 'SG5')] },
  'web:/automations/[id]': { asks: (s) => s.automations.map((id) => fill('[id]', id)), was: [fill('[id]', 'SG5')] },
  'web:/scripts/[id]': { asks: (s) => s.scripts.map((id) => fill('[id]', id)), was: [fill('[id]', 'no-script')] },
  'web:/jobs/[id]': { asks: (s) => s.jobs.map((id) => fill('[id]', id)), was: [fill('[id]', 'j_none')] },
  'web:/packs/[id]': { asks: (s) => s.addOns.map((id) => fill('[id]', id)), was: [fill('[id]', 'people')] },
  'web:/packs/browse/[id]': { asks: (s) => s.entries.map((id) => fill('[id]', id)), was: [fill('[id]', 'SG5')] },
  'web:/v/[view]': { asks: (s) => s.views.map((id) => fill('[view]', id)), was: [fill('[view]', 'obligations.open')] },
  'web:/p/[slug]': { asks: (s) => s.pages.map((slug) => fill('[slug]', slug)), was: [fill('[slug]', 'money')] },
  'web:/r/[register]': { asks: (s) => s.rows.map((r) => fill('[register]', r.register)), was: [fill('[register]', 'obligations')] },
  'web:/r/[register]/[seq]': {
    asks: (s) => s.rows.map((r) => ({ ...fill('[register]', r.register), ...fill('[seq]', r.seq) })),
    was: [{ ...fill('[register]', 'obligations'), ...fill('[seq]', '1') }],
  },
  'web:/t/[track]': { asks: (s) => s.tracks.map((seq) => fill('[track]', seq)), was: [fill('[track]', '2')] },
  'web:/s/[token]': { fixed: [fill('[token]', 'no-page-yet')], missing: true },
  'web:/settings/[area]': { fixed: [...AREAS.keys()].map((area) => fill('[area]', area)) },
  'site:/packs/[id]': { fixed: [fill('[id]', 'bank-hsbc-eg')] },
  'site:/legal/[name]': { fixed: [fill('[name]', 'terms')] },
  'site:/docs/[section]/[slug]': { fixed: [{ ...fill('[section]', 'start'), ...fill('[slug]', 'welcome') }] },
};

/**
 * What the record holds that an address can name, asked through its own doors with the gate's key (`record.ask`).
 *
 * `{ questions, automations, scripts, jobs, addOns, entries, views, pages, rows, tracks }`, each a list, empty where the
 * record has nothing or refused. One open question, automation, script, job, installed add-on, catalogue entry, saved
 * view and thread; `rows` is one row of the first list that holds any, and `pages` the first page of the navigation.
 * `every: true` makes those two one row of EACH list and every page, for a sweep that can afford it.
 *
 * A CATALOGUE ENTRY IS A USE CASE THE RECORD OFFERS (`arrangement`'s `offer`), opened by the id the catalogue lists it
 * under, which is its pack id less `usecase-` (`lib/market/listing.ts`: `installedId` is `usecase-${u.usecase}`).
 */
export async function readRecord(record, { every = false } = {}) {
  const read = async (name, args) => {
    const said = await record.ask(name, args);
    return said?.ok === true ? said.value : null;
  };
  const ids = (list) => (Array.isArray(list) ? list : []).map((x) => x?.id).filter((id) => typeof id === 'string' && id !== '');
  const first = (list) => list.slice(0, 1);
  const boot = (await read('boot')) ?? {};
  const rows = [];
  for (const register of (boot.registers ?? []).filter((r) => (r?.count ?? 0) > 0).map((r) => r.id)) {
    if (!every && rows.length > 0) break;
    const seq = (await read('list', { register, limit: 1 }))?.rows?.[0]?.seq;
    if (Number.isInteger(seq)) rows.push({ register, seq });
  }
  const track = (await read('list', { register: 'tracks', limit: 1 }))?.rows?.[0]?.seq;
  const pages = (boot.pages ?? []).map((p) => p?.slug).filter((s) => typeof s === 'string' && s !== '');
  const asked = await read('governance');
  const views = await read('views');
  return {
    questions: first(ids(Array.isArray(asked) ? asked.filter((q) => q?.status === 'open') : [])),
    automations: first(ids(await read('automations'))),
    scripts: first(ids(await read('scripts'))),
    jobs: first(ids((await read('listJobs', { limit: 1 }))?.jobs)),
    addOns: first(ids(await read('packs'))),
    entries: first(ids((await read('arrangement'))?.offer).map((id) => id.replace(/^usecase-/u, ''))),
    views: first((Array.isArray(views) ? views : []).map((v) => `${v.register}.${v.id}`)),
    pages: every ? pages : first(pages),
    rows,
    tracks: Number.isInteger(track) ? [track] : [],
  };
}

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
 * The routes of one SvelteKit app, as addresses, at the record's own ids.
 *
 * Returns `{ routes, unsampled, unseen, missing }`. `unsampled` is a route the table has no sample for, a FAILURE at every
 * call site, since it is the only way "we forgot to sample this" differs from "there is nothing here". `unseen` is an
 * address the record had nothing for, opened at the sample it had before and drawn as not found, which the gate's
 * summary counts as "not seen with data". A caller that ignores either has quietly stopped checking part of the app.
 * `missing` is every address drawn as not found ON PURPOSE, `unseen` and the samples marked `missing`: there the host's
 * not found is the answer asked for (`printed.mjs` `checkScreen`'s `missing`).
 *
 * `record` is `startRecord`'s handle or `recordAt(base)` (`record.mjs`); `null` reads no record and opens every route
 * at its `was`, which is `routesOf` for the gates whose lines have not moved yet. `extra` is added as it is.
 */
export async function routesFor(appRoot, record = null, { every = false, extra = [] } = {}) {
  const app = basename(appRoot);
  const said = record === null ? null : await readRecord(record, { every });
  const routes = new Set(extra);
  const unsampled = [];
  const unseen = [];
  const notFound = [];

  for (const dir of await walk(join(appRoot, 'src', 'routes'))) {
    const rel = relative(join(appRoot, 'src', 'routes'), dir).replace(/[\\/]+/g, '/');
    const pattern = rel === '' ? '/' : `/${rel}`;
    const segments = pattern === '/' ? [] : pattern.slice(1).split('/');
    const dynamic = segments.filter((s) => s.startsWith('['));
    if (dynamic.length === 0) {
      routes.add(pattern);
      continue;
    }
    const entry = SAMPLE_OF[`${app}:${pattern}`];
    if (entry === undefined) {
      unsampled.push(`${pattern} has no sample for ${dynamic[0]}`);
      continue;
    }
    let fills = entry.fixed ?? (said === null ? entry.was : entry.asks(said));
    const nothing = fills.length === 0;
    if (nothing) fills = entry.was;
    for (const f of fills) {
      const missing = dynamic.find((s) => f[s] === undefined);
      if (missing !== undefined) {
        unsampled.push(`${pattern} has no sample for ${missing}`);
        break;
      }
      const address = `/${segments.map((s) => (s.startsWith('[') ? encodeURIComponent(f[s]) : s)).join('/')}`;
      routes.add(address);
      if (nothing) unseen.push(address);
      if (nothing || entry.missing === true) notFound.push(address);
    }
  }

  return { routes: [...routes].sort(), unsampled, unseen, missing: notFound };
}

/** Every route at the samples it had before the record was asked, for `a11y` and `layout` until their lines move. */
export const routesOf = (appRoot, extra = []) => routesFor(appRoot, null, { extra });
