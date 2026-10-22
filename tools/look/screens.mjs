/**
 * Which screens a look draws, and which row, question and project each one shows (`loop/scope/area-proof-a.md` 2.4,
 * PRF-A02 job 3).
 *
 * THREE SETS. `six` is the walk made before a push and after a deploy (Today, Decide, Money, Projects, one
 * project, Agents). `nine` is the acceptance set of the look (Today, Decide, a question, Work, Money, a project, a list, a
 * row, People). `all` is both and then every route of the app, one address each.
 *
 * EVERY SAMPLE IS PICKED FROM THE RECORD'S OWN ANSWERS, never from an id somebody typed: the oldest open question,
 * the project most rows point at, the list with the most rows and its newest row, the first saved view, pack, script
 * and automation, and the newest run and thread. The gates' samples (`tools/gates/routes.mjs`) name rows that exist
 * only in the seed, so on a real record they draw "not found" and photograph as a tidy page. A place opens where the
 * app's own rail opens it: the lead page of the section of that name (`apps/web/src/lib/nav.ts` `leadOf`,
 * `lib/nav/rail.ts` `PLACES`).
 *
 * A SCREEN THAT CANNOT BE PICKED IS SAID, NOT DROPPED. A record with no project has no project screen, and `missing`
 * carries it with the reason, so `said.json` counts it as not seen rather than as a screen that went well.
 *
 * `ask(method, body)` is the record's answer to one read, its `value`, or `null` for a refusal. `capture.mjs` builds
 * it over the look's own server, so a live look picks through the same forwarder that draws, and a test hands in a
 * stub (`screens.test.mjs`).
 */

import { readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from '../gates/lib.mjs';
import { routesOf } from '../gates/routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const WEB = join(here, '..', '..', 'apps', 'web');

/** The screens of the two named sets, by key. A key is the image's name, so it never changes with the record. */
export const SETS = {
  six: ['today', 'decide', 'money', 'projects', 'project', 'agents'],
  nine: ['today', 'decide', 'question', 'work', 'money', 'project', 'list', 'row', 'people'],
};

/** The Work screen's address (`apps/web/src/lib/nav.ts` `WORK`) and the agents pack's page (`lib/nav/rail.ts`). */
const WORK = '/?work';
const AGENTS_PAGE = 'agents';

/** How many projects are weighed for "most rows", so a record of hundreds costs a bounded number of reads. */
const PROJECTS_WEIGHED = 40;
/** A page of open questions, read until a short page says there are no more. */
const QUESTIONS_PAGE = 100;
/** A page of what points at a project, and how many pages are followed before the count is taken as enough. */
const BACKLINK_ROWS = 200;
const BACKLINK_PAGES = 5;

const plain = (s) => String(s ?? '').trim().toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []);

/** The lead page of a section, as the app's rail picks it: "Overview", else the first that is no row's own page. */
export function leadOf(pages, section) {
  const held = list(pages)
    .filter((p) => p?.nav && plain(p.nav.section) === section)
    .sort((a, b) => (a.nav.order ?? 0) - (b.nav.order ?? 0));
  return held.find((p) => plain(p.title) === 'overview') ?? held.find((p) => !p.about && !p.list) ?? held[0] ?? null;
}

/** Every open question, a page at a time, as the Decide screen reads them. */
async function openQuestions(ask) {
  const all = [];
  let cursor = null;
  for (;;) {
    const got = list(await ask('governance', { status: 'open', limit: QUESTIONS_PAGE, ...(cursor ? { cursor } : {}) }));
    all.push(...got.filter((q) => typeof q?.id === 'string'));
    const last = got.at(-1)?.id;
    if (got.length < QUESTIONS_PAGE || typeof last !== 'string' || last === cursor) return all;
    cursor = last;
  }
}

/**
 * How many rows point at one row, from `backlinks`' groups. Its `limit` pages the rows it hands back, and a group
 * past the page is on the next one, so the pages are followed to the end (a few at most, at this size).
 */
async function pointedAt(ask, about) {
  let n = 0;
  let cursor = null;
  for (let page = 0; page < BACKLINK_PAGES; page += 1) {
    const got = await ask('backlinks', { register: about.register, seq: about.seq, limit: BACKLINK_ROWS, ...(cursor ? { cursor } : {}) });
    n += list(got?.from).reduce((sum, g) => sum + (Number(g?.matched) || 0), 0);
    if (typeof got?.cursor !== 'string' || got.cursor === cursor) break;
    cursor = got.cursor;
  }
  return n;
}

/** The words a row is known by: the first text field it holds, else its list's name and number. */
const rowName = (row, register) => {
  const text = Object.values(row?.fields ?? {}).find((v) => typeof v === 'string' && v.trim() !== '' && !/^[0-9A-HJKMNP-TV-Z]{26}$/u.test(v));
  return text ?? `${register.name} ${row.seq}`;
};

/**
 * Everything a look's screens are drawn from, read from the record: the pages and where each place opens, and one
 * sample of each kind with the reason it was the one picked.
 */
export async function pick(ask) {
  const boot = (await ask('boot')) ?? {};
  const pages = list(boot.pages);
  const registers = list(boot.registers).filter((r) => typeof r?.id === 'string');
  const out = { record: boot.record?.name ?? null, pages, places: {}, holdsTasks: registers.some((r) => r.id === 'tasks' && r.count > 0) };
  for (const place of ['work', 'projects', 'money', 'people', 'agents']) out.places[place] = leadOf(pages, place);
  out.places.agents ??= pages.find((p) => p?.slug === AGENTS_PAGE) ?? null;

  const open = await openQuestions(ask);
  const oldest = [...open].sort((a, b) => String(a.opened_at ?? '').localeCompare(String(b.opened_at ?? '')))[0];
  out.question = oldest ? { id: oldest.id, said: oldest.question ?? null, why: `the oldest of ${open.length} open questions` } : null;

  /* THE PROJECT MOST ROWS POINT AT: the one with the most going on is where a fault has most to show. */
  const projects = list(pages)
    .filter((p) => p?.about && p.nav && plain(p.nav.section) === 'projects')
    .slice(0, PROJECTS_WEIGHED);
  let best = null;
  for (const p of projects) {
    const rows = await pointedAt(ask, p.about);
    if (best === null || rows > best.rows) best = { slug: p.slug, title: p.title, rows };
  }
  out.project = best && { ...best, why: `of ${projects.length} projects, the one ${best.rows} things point at` };

  /* THE LIST WITH THE MOST ROWS, and its first row as the list draws it (newest first). */
  const biggest = [...registers].sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))[0];
  out.list = biggest && biggest.count > 0 ? { register: biggest.id, name: biggest.name, rows: biggest.count, why: `the list that holds the most, ${biggest.count}` } : null;
  const first = out.list ? list((await ask('list', { register: out.list.register, limit: 1 }))?.rows)[0] : undefined;
  out.row = first && Number.isInteger(first.seq) ? { register: biggest.id, seq: first.seq, name: rowName(first, biggest), why: `the first in ${biggest.name}, as the list draws it` } : null;

  /* A READ THE RECORD REFUSED is not a record with nothing in it: the screen is said as not picked, for that reason. */
  const refused = new Set();
  const read = async (from, method, body) => {
    const got = await ask(method, body);
    if (got === null) refused.add(from);
    return got;
  };
  const view = list(await read('view', 'views', {}))[0];
  out.view = view?.register && view?.id ? { key: `${view.register}.${view.id}`, name: view.name ?? null, why: 'the first saved view' } : null;
  const pack = list(await read('pack', 'packs', {}))[0];
  out.pack = typeof pack?.id === 'string' ? { id: pack.id, why: 'the first pack this record has' } : null;
  /* A script's page is at its bare id (`script`), as the app links it; `id` is the declaration's `script.<id>`. */
  const script = list(await read('script', 'scripts', {}))[0];
  out.script = typeof script?.script === 'string' ? { id: script.script, name: script.title ?? null, why: 'the first installed script' } : null;
  const automations = await read('automation', 'automations', {});
  const automation = list(Array.isArray(automations) ? automations : automations?.automations)[0];
  out.automation = typeof automation?.id === 'string' ? { id: automation.id, name: automation.name ?? automation.title ?? null, why: 'the first automation' } : null;
  const job = list((await read('job', 'listJobs', { limit: 1 }))?.jobs)[0];
  out.job = typeof job?.id === 'string' ? { id: job.id, why: 'the newest run' } : null;
  const tracks = registers.find((r) => r.id === 'tracks' && r.count > 0);
  const track = tracks ? list((await ask('list', { register: 'tracks', limit: 1 }))?.rows)[0] : undefined;
  out.track = Number.isInteger(track?.seq) ? { seq: track.seq, name: rowName(track, tracks), why: 'the newest thread' } : null;
  out.refused = [...refused];
  return out;
}

const page = (p) => `/p/${p.slug}`;

/** One screen of a named set: `{ key, name, path, why }`, or `{ key, name, missing }` when the record has none. */
function screenOf(key, picked) {
  const place = (k, name) => {
    const p = picked.places[k];
    return p ? { key, name: p.title ?? name, path: page(p), why: `where the rail opens ${name}` } : { key, name, missing: `This record has no ${name} section and no page for it.` };
  };
  switch (key) {
    case 'today':
      return { key, name: 'Today', path: '/', why: 'the first place' };
    case 'decide':
      return { key, name: 'Decide', path: '/decide', why: 'the questions waiting' };
    case 'question':
      return picked.question
        ? { key, name: 'The oldest open question', path: `/decide/${picked.question.id}`, why: picked.question.why }
        : { key, name: 'A question', missing: 'Nothing is waiting on Decide, so there is no question to open.' };
    case 'work':
      if (picked.holdsTasks) return { key, name: 'Work', path: WORK, why: 'the Work screen, as the rail opens it on a record with tasks' };
      return place('work', 'Work');
    case 'money':
      return place('money', 'Money');
    case 'projects':
      return place('projects', 'Projects');
    case 'people':
      return place('people', 'People');
    case 'agents':
      return place('agents', 'Agents');
    case 'project':
      return picked.project
        ? { key, name: picked.project.title, path: `/p/${picked.project.slug}`, why: picked.project.why }
        : { key, name: 'A project', missing: 'This record has no project with a page of its own.' };
    case 'list':
      return picked.list
        ? { key, name: picked.list.name, path: `/r/${picked.list.register}`, why: picked.list.why }
        : { key, name: 'The biggest list', missing: 'Every list on this record is empty.' };
    case 'row':
      return picked.row
        ? { key, name: picked.row.name, path: `/r/${picked.row.register}/${picked.row.seq}`, why: picked.row.why }
        : { key, name: 'The newest in the biggest list', missing: 'Every list on this record is empty.' };
    default:
      throw new Error(`There is no screen called ${key}.`);
  }
}

/**
 * The routes the record's own answers fill, by the route's pattern: what the screen is called, which pick fills it,
 * and its address from that pick.
 */
const PICKED = {
  '/[id]': { name: 'A question by its address', from: 'question', path: (q) => `/${q.id}` },
  '/decide/[id]': { name: 'The oldest open question', from: 'question', path: (q) => `/decide/${q.id}` },
  '/p/[slug]': { name: 'A project', from: 'project', path: (p) => `/p/${p.slug}` },
  '/r/[register]': { name: 'The biggest list', from: 'list', path: (l) => `/r/${l.register}` },
  '/r/[register]/[seq]': { name: 'The newest in the biggest list', from: 'row', path: (r) => `/r/${r.register}/${r.seq}` },
  '/v/[view]': { name: 'A saved view', from: 'view', path: (v) => `/v/${encodeURIComponent(v.key)}` },
  '/packs/[id]': { name: 'A pack', from: 'pack', path: (p) => `/packs/${encodeURIComponent(p.id)}` },
  '/packs/browse/[id]': { name: 'A pack in the catalogue', from: 'pack', path: (p) => `/packs/browse/${encodeURIComponent(p.id)}` },
  '/scripts/[id]': { name: 'A script', from: 'script', path: (s) => `/scripts/${encodeURIComponent(s.id)}` },
  '/automations/[id]': { name: 'An automation', from: 'automation', path: (a) => `/automations/${encodeURIComponent(a.id)}` },
  '/jobs/[id]': { name: 'A run', from: 'job', path: (j) => `/jobs/${encodeURIComponent(j.id)}` },
  '/t/[track]': { name: 'A thread', from: 'track', path: (t) => `/t/${t.seq}` },
};

/** Every page pattern of the app, `/r/[register]/[seq]` and the like, from the route directory. */
async function patternsOf(appRoot) {
  const root = join(appRoot, 'src', 'routes');
  const out = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (skipDir(e.name)) continue;
      if (e.isDirectory()) await walk(join(dir, e.name));
      else if (e.name === '+page.svelte') {
        const rel = relative(root, dir).replace(/[\\/]+/gu, '/');
        out.push(rel === '' ? '/' : `/${rel}`);
      }
    }
  };
  await walk(root);
  return out.sort();
}

const segs = (path) => (path === '/' ? [] : path.slice(1).split('/'));
const statics = (pattern) => segs(pattern).filter((s) => !s.startsWith('[')).length;
const fits = (pattern, address) => {
  const p = segs(pattern);
  const a = segs(address);
  return p.length === a.length && p.every((s, i) => s.startsWith('[') || s === a[i]);
};

/** A key an image can be named by: the address in lower case, its separators as hyphens. */
export const keyOf = (path) => path.replace(/^\/+/u, '').replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase() || 'today';

/** A name for a route's screen: its words, and a settings area as "Settings: <area>". */
const nameOf = (path) => {
  const [first = '', ...rest] = segs(path.split('?')[0]).map((s) => decodeURIComponent(s).replace(/[-_]+/gu, ' '));
  const head = first.charAt(0).toUpperCase() + first.slice(1);
  return rest.length === 0 ? head || 'Today' : `${head}: ${rest.join(', ')}`;
};

/**
 * Every route as one or more screens. A route the record fills takes its pick; a route that names no record data (a
 * settings area, a shared link) keeps the gates' address, which is the screen it draws for anyone.
 */
async function everyRoute(picked, appRoot) {
  const [patterns, { routes }] = await Promise.all([patternsOf(appRoot), routesOf(appRoot)]);
  const screens = [];
  const missing = [];
  for (const pattern of patterns) {
    if (Object.hasOwn(PICKED, pattern)) {
      const { name, from, path } = PICKED[pattern];
      const key = keyOf(pattern.replace(/[[\]]/gu, ''));
      const held = picked[from];
      if (held) screens.push({ key, name: held.name ?? held.title ?? name, path: path(held), why: held.why });
      else if (picked.refused?.includes(from)) missing.push({ key, name, missing: `The record did not answer the read that picks ${name.toLowerCase()}, so none was drawn.` });
      else missing.push({ key, name, missing: `This record holds nothing for ${name.toLowerCase()} to show.` });
      continue;
    }
    /* The gates' addresses of this pattern: the ones no more particular pattern claims. */
    const mine = routes.filter((a) => fits(pattern, a) && !patterns.some((q) => q !== pattern && fits(q, a) && statics(q) > statics(pattern)));
    const why = pattern.includes('[') ? 'the same address for any record: it names nothing the record holds' : 'a route of the app';
    for (const path of mine) screens.push({ key: keyOf(path), name: nameOf(path), path, why });
  }
  return { screens, missing };
}

/**
 * The screens of one set on one record: `{ screens, missing }`. `screens` are `{ key, name, path, why }`, in the order
 * they are drawn; `missing` are `{ key, name, missing }`, the screens of the set this record cannot show and why.
 */
export async function screensOf(set, picked, { appRoot = WEB } = {}) {
  const named = set === 'all' ? [...new Set([...SETS.six, ...SETS.nine])] : SETS[set];
  if (named === undefined) throw new Error(`There is no set called ${set}. Use six, nine or all.`);
  const all = named.map((k) => screenOf(k, picked));
  const screens = all.filter((s) => s.path !== undefined);
  const missing = all.filter((s) => s.path === undefined);
  if (set === 'all') {
    const more = await everyRoute(picked, appRoot);
    const paths = new Set(screens.map((s) => s.path));
    const keys = new Set(screens.map((s) => s.key));
    for (const s of more.screens) {
      if (paths.has(s.path)) continue;
      const key = keys.has(s.key) ? `${s.key}-${keys.size}` : s.key;
      paths.add(s.path);
      keys.add(key);
      screens.push({ ...s, key });
    }
    missing.push(...more.missing.filter((m) => !keys.has(m.key)));
  }
  return { screens, missing };
}
