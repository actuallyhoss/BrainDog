/**
 * The look: real screens of a record, with no one's hands.
 *
 *   node tools/look/run.mjs --source seed|lived|file:<path>|live:<record> --set six|nine|all [--out <dir>] [--screens a,b,c]
 *
 * ONE SERVER, THE GATES' SHAPE. The built app is served from `apps/web/build` under `/app` exactly as the browser gates
 * serve it (`tools/gates/lib.mjs`, `APP_BASE` and `appShell`), with the SPA fallback to the app's shell, and every
 * request the page makes to its record is handed to the source. `/app/<slug>/api/<method>` is the same request as
 * `/api/<method>`, as the Worker reads it, because a bearer names the record and the path does not.
 *
 * A SOURCE IS ONE FILE UNDER `sources/`, LOADED BY NAME, so a later unit adds one without touching this file. Its
 * `open(arg)` hands back `{ name, record, seen, pressable, prefix, cannot, handle(req, res, at), counts(), close() }`:
 * whether its screens count as seen, whether they may be pressed, the slug its addresses carry, the screens it cannot
 * draw and why, and what it refused.
 *
 * AND THE PICTURES ARE `capture.mjs`'s (batch 36). When it is there, its default export is handed
 * `{ origin, app, set, out, source }` and the look closes when it returns. Until then the look serves and says where,
 * so a person or an agent can point a browser at it, and stops on Ctrl+C. Either way `run.json` in `--out` says which
 * source, which set, and what the source refused.
 *
 * EVERY LOOK ENDS WITH ONE LINE FROM THE THREE QUICK CHECKS (`checks.mjs`): record words on the screens, counts that
 * disagree between screens, and old numbers that say nothing of their age. It is printed, kept in `said.json` as
 * `checks`, and any finding fails the look. `--source planted` is the seed with one of each fault put in, which the
 * checks must find and `--source seed` must not give them.
 */

import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { argv, env as processEnv, exit } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { APP_BASE, appShell, webBuildUnmet } from '../gates/lib.mjs';
import { answers } from '../gates/record.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');

/** The three sets of screens `screens.mjs` names: the walk's six, the acceptance nine, and every route. */
export const SETS = ['six', 'nine', 'all'];

/** Where a look writes when `--out` is not given, and the only place a source that counts as seen may write. */
export const LOOKS = join('loop', 'proof', 'looks');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

/** The paths the record answers, handed to the source. Everything else is the build's. */
const RECORD = /^\/(?:api|auth|account|mcp|in)(?:\/|$)/u;

/** `/app/<slug>/api/<method>` as the record reads it, `/api/<method>`; anything else unchanged. */
export const recordPath = (pathname) => pathname.replace(/^\/app\/[a-z][a-z0-9-]*[a-z0-9](?=\/api(?:\/|$))/u, '');

/** `--flag value` and `--flag=value`. A flag this command does not take is a refusal, not a silence. */
export function parse(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const m = /^--(source|set|out|screens)(?:=(.*))?$/u.exec(args[i]);
    if (m === null) throw new Error(`The look takes --source, --set, --out and --screens, and not ${args[i]}.`);
    out[m[1]] = m[2] ?? args[(i += 1)];
  }
  const raw = out.source ?? 'seed';
  const colon = raw.indexOf(':');
  const name = colon === -1 ? raw : raw.slice(0, colon);
  const arg = colon === -1 ? undefined : raw.slice(colon + 1);
  if (!/^[a-z][a-z-]*$/u.test(name)) throw new Error(`There is no source called ${raw}. Use seed, lived, file:<path> or live:<record>.`);
  const set = out.set ?? 'six';
  if (!SETS.includes(set)) throw new Error(`There is no set called ${set}. Use six, nine or all.`);
  const screens = out.screens === undefined ? undefined : out.screens.split(',').map((n) => n.trim()).filter(Boolean);
  if (screens?.length === 0) throw new Error('--screens needs names, as in --screens today,money.');
  return { source: { name, arg }, set, out: out.out, screens };
}

/** The source's file, by name, and what its `open` hands back. */
export async function openSource({ name, arg }, options = {}) {
  const file = join(here, 'sources', `${name}.mjs`);
  if (!existsSync(file)) throw new Error(`There is no source called ${name}. Use seed, lived, file:<path> or live:<record>.`);
  const mod = await import(pathToFileURL(file).href);
  return mod.open(arg, options);
}

/** A file of the build, the app's shell for an address under `/app` that is not one, or `null` for a 404. */
async function fileFor(build, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/u, '');
  if (rel.split(/[/\\]/u).includes('..')) return null;
  for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
    const file = join(build, candidate);
    if ((await stat(file).catch(() => null))?.isFile()) return file;
  }
  /* A ROUTE SEGMENT MAY CONTAIN A DOT (`/v/obligations.open`), so the fallback is refused only to an extension this
     server types, as the gates refuse it: a missing chunk stays a 404 and a view id gets the shell. */
  const app = pathname === APP_BASE || pathname.startsWith(`${APP_BASE}/`);
  if (app && !Object.hasOwn(TYPES, extname(rel)) && existsSync(appShell(build))) return appShell(build);
  return null;
}

/**
 * Serve the build and hand the record's paths to an open source. `{ origin, app, close }`, on a port the system
 * hands out, at `localhost` as the gates bind. `close` closes the server and not the source, which is the caller's.
 */
export async function serve(source, { build = join(ROOT, 'apps', 'web', 'build') } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const at = new URL(`${recordPath(url.pathname)}${url.search}`, 'http://localhost');
    if (RECORD.test(at.pathname)) return source.handle(req, res, at);
    const file = await fileFor(build, url.pathname).catch(() => null);
    if (file === null) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const origin = `http://localhost:${server.address().port}`;
  return { origin, app: `${origin}${APP_BASE}${source.prefix}`, server, close: () => new Promise((r) => server.close(() => r())) };
}

/** Where this look writes, and a refusal when a source that counts as seen is pointed outside its looks folder. */
export function outFor(source, given, root = ROOT, at = new Date()) {
  const stamp = at.toISOString().slice(0, 16).replace(':', '-');
  const out = given === undefined ? join(root, LOOKS, `${source.name}-${stamp}`) : resolve(given);
  if (source.outUnder !== undefined) {
    const inside = relative(join(root, source.outUnder), out);
    if (inside.startsWith('..') || isAbsolute(inside))
      throw new Error(`A look at ${source.record} writes only under ${source.outUnder}, so --out has to be a folder there.`);
  }
  return out;
}

/**
 * The first check, `answers`, refused the whole look for one failed boot read. A live record answers slowly at times, so
 * for the live source it is tried up to three times with a growing pause; any other source is asked once, as before.
 */
export async function answersOf(source, origin, { check = answers, tries = source.name === 'live' ? 3 : 1, backoffMs = 2000 } = {}) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    if (i > 0) await new Promise((r) => setTimeout(r, backoffMs * i));
    try {
      return await check(origin);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const report = (source, set, started) => ({
  source: source.name,
  record: source.record,
  set,
  seen: source.seen,
  pressable: source.pressable,
  cannot: source.cannot,
  started,
  counts: source.counts(),
});

async function main() {
  const asked = parse(argv.slice(2));
  const build = join(ROOT, 'apps', 'web', 'build');
  /* THE SOURCE FIRST, so a refusal of its own (CI, no sign-in, not built yet) is the one said, and then the build:
     a look at a build older than the tree is a picture of code that is not this code. */
  const source = await openSource(asked.source, { env: processEnv });
  let served = null;
  try {
    if (!existsSync(appShell(build))) throw new Error('There is no built app to draw. Run pnpm --filter @braindog/web build first.');
    const stale = await webBuildUnmet(ROOT);
    if (stale !== null) throw new Error(`${stale}. Run pnpm --filter @braindog/web build first.`);
    const out = outFor(source, asked.out);
    mkdirSync(out, { recursive: true });
    served = await serve(source, { build });
    await answersOf(source, served.origin);
    const started = new Date().toISOString();
    const write = (extra = {}) => writeFileSync(join(out, 'run.json'), `${JSON.stringify({ ...report(source, asked.set, started), ...extra }, null, 2)}\n`);
    write();
    const capture = join(here, 'capture.mjs');
    if (existsSync(capture)) {
      const { default: run } = await import(pathToFileURL(capture).href);
      await run({ origin: served.origin, app: served.app, set: asked.set, out, source, screens: asked.screens });
      write({ closed: new Date().toISOString() });
      return;
    }
    console.log(`  look: ${source.record} at ${served.app}, set ${asked.set}. capture.mjs is missing; stop with Ctrl+C.`);
    if (source.cannot.length > 0) for (const c of source.cannot) console.log(`  cannot draw ${c.screens.join(', ')}: ${c.why}`);
    await new Promise((r) => process.once('SIGINT', r));
    write({ closed: new Date().toISOString() });
  } finally {
    await served?.close();
    await source.close();
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href)
  main().catch((e) => {
    console.error(`  look refused: ${e instanceof Error ? e.message : String(e)}`);
    exit(1);
  });
