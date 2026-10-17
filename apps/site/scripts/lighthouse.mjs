/**
 * Lighthouse over the built site: every page a visitor has, on a phone and at a desk, held to 95 in every category.
 *
 * LAUNCH.md job 12 holds the site to "Lighthouse 95 or more" and nothing measured it: Playwright was the only browser
 * in the tree. This serves `build/` the way production does, opens Playwright's own Chromium and hands it to
 * Lighthouse's Node API, which is pinned to one exact version in this package's devDependencies so a score moves only
 * when the site does.
 *
 * IT SERVES THE ARTEFACT, AS `shot.mjs` DOES, and as Cloudflare serves it: an address finds `<path>`, `<path>.html` or
 * `<path>/index.html`; a miss answers 404 with `404.html` (`not_found_handling: "404-page"` in `wrangler.jsonc`); the
 * headers are the ones `_headers` gives; and text goes out brotli'd when the browser asks for it, because a page sent
 * raw is scored on bytes no visitor downloads. It listens on port 0, since five gates already hold fixed ports.
 *
 * IT IS NOT A GATE, and lives here rather than in `tools/gates`, because `run.mjs` takes every .mjs there for one.
 * Sixty-six Lighthouse runs take minutes, so the integrator runs it after a build, not every session:
 *
 *   pnpm --filter @braindog/site build
 *   node apps/site/scripts/lighthouse.mjs                    every page, both form factors, three runs each
 *   node apps/site/scripts/lighthouse.mjs --page /pricing    one page while fixing it
 *
 * MEDIAN OF THREE, per category. One run's performance swings by a few points on a busy machine; the middle of three
 * is the number a second run would agree with. Exit 0 when every median is 95 or more, 1 when any is under, 2 when it
 * could not run at all (no build, no browser).
 *
 * NOTHING RUNS WHEN THIS FILE IS IMPORTED: the work is under `import.meta.main` at the foot.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { brotliCompress } from 'node:zlib';

const ROOT = join(import.meta.dirname, '..', 'build');

/**
 * THE ELEVEN PAGES (loop/research-103b.md, the checks): every address the site has for a visitor, less the 404 and the
 * held ones (`HELD` in `src/lib/launch.ts`), with one page standing for each template. The five `for/*` pages are one
 * layout over different examples, and so are the docs' articles and the legal texts.
 */
export const PAGES = [
  '/',
  '/agents',
  '/pricing',
  '/slash',
  '/security',
  '/support',
  '/docs',
  '/docs/start/welcome',
  '/legal',
  '/legal/terms',
  '/for/founders',
];

/** Every category Lighthouse 13 scores, agentic browsing (whether an agent can read the page) among them. */
export const HELD_TO = ['performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing'];
export const FLOOR = 95;
export const RUNS = 3;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};
const SQUEEZED = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.xml', '.txt', '.md']);

/** The middle of an odd count, and the lower middle of an even one. `null` for nothing measured. */
export function median(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * `_headers` as Cloudflare reads it: a line at column 0 is a path pattern (`*` matches anything), an indented
 * `Name: value` under it is a header for that pattern. Comments and blank lines are skipped.
 */
export function readHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);
      rules.push({ pattern, headers: {} });
      continue;
    }
    const at = line.indexOf(':');
    const rule = rules.at(-1);
    if (at > 0 && rule) rule.headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  return (path) => Object.assign({}, ...rules.filter((r) => r.pattern.test(path)).map((r) => r.headers));
}

/**
 * Every score under the floor, one plain sentence each. Empty is green. `results` is
 * `{ [page]: { mobile: { [category]: number|null }, desktop: {...} } }` with scores out of 100.
 */
export function under(results, floor = FLOOR) {
  const out = [];
  if (Object.keys(results).length === 0) out.push('No page was measured, so nothing here is known to score.');
  for (const [page, forms] of Object.entries(results)) {
    for (const [form, scores] of Object.entries(forms)) {
      for (const category of HELD_TO) {
        const score = scores[category];
        if (score === null || score === undefined) out.push(`${page} on ${form}: ${category} has no score.`);
        else if (score < floor) out.push(`${page} on ${form}: ${category} is ${score}, under ${floor}.`);
      }
    }
  }
  return out;
}

const squeeze = promisify(brotliCompress);

/** Serves `build/` on 127.0.0.1 at a port the system picks, the way the asset layer serves it in production. */
export async function serveBuild(root = ROOT) {
  const headersFor = readHeaders(await readFile(join(root, '_headers'), 'utf8').catch(() => ''));
  const send = async (req, res, file, status) => {
    const type = extname(file);
    const headers = { 'content-type': TYPES[type] ?? 'application/octet-stream', ...headersFor(new URL(req.url ?? '/', 'http://x').pathname) };
    if (SQUEEZED.has(type) && /\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
      const body = await squeeze(await readFile(file));
      res.writeHead(status, { ...headers, 'content-encoding': 'br', vary: 'accept-encoding', 'content-length': body.length });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    // `normalize` then refuse `..`: this hands a folder to a browser, and one traversal makes it a different folder.
    let rel;
    try {
      rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    } catch {
      return res.writeHead(400).end(); // a malformed escape is a bad request, not a crash of the whole run
    }
    if (rel.includes('..')) return res.writeHead(400).end();
    /* THE VISIT COUNT IS THE WORKER'S, not a file: `seen.js` posts every page to `/api/seen`, and in production the
       Worker answers it 204 whatever happens (`apps/worker/src/seen.ts`). Served as a miss, it is a console error on
       every page and best practices loses four points the site does not lose. */
    if (url.pathname === '/api/seen') return res.writeHead(204).end();
    for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
      const file = join(root, candidate);
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) return send(req, res, file, 200);
    }
    const missing = join(root, '404.html');
    if (await stat(missing).catch(() => null)) return send(req, res, missing, 404);
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

/** A port nothing holds right now, for Chromium's debugging port, which Lighthouse connects to by number. */
async function freePort() {
  const probe = createNetServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  return port;
}

/** One Lighthouse run, as `{ [category]: score out of 100 | null }`. */
async function measure(lighthouse, config, url, port) {
  const result = await lighthouse(url, { port, output: 'json', logLevel: 'error', onlyCategories: HELD_TO }, config);
  const categories = result?.lhr?.categories ?? {};
  const failed = result?.lhr?.runtimeError?.message;
  if (failed) throw new Error(`${url}: ${failed}`);
  return Object.fromEntries(HELD_TO.map((c) => [c, typeof categories[c]?.score === 'number' ? Math.round(categories[c].score * 100) : null]));
}

async function main() {
  const { values } = parseArgs({ options: { page: { type: 'string', multiple: true }, runs: { type: 'string' } } });
  const pages = values.page?.length ? values.page : PAGES;
  const runs = Math.max(1, Number(values.runs ?? RUNS) || RUNS);

  if (!(await stat(join(ROOT, 'index.html')).catch(() => null))) {
    console.error('There is no build to measure. Run `pnpm --filter @braindog/site build` first.');
    return 2;
  }
  const [{ chromium }, { default: lighthouse, desktopConfig }] = await Promise.all([import('@playwright/test'), import('lighthouse')]);
  const { server, origin } = await serveBuild();
  const port = await freePort();
  // The full Chromium in its new headless mode, which is the one Lighthouse is written against.
  const browser = await chromium.launch({ channel: 'chromium', args: [`--remote-debugging-port=${port}`] }).catch((e) => {
    console.error(`Chromium did not start: ${e.message.split('\n')[0]}`);
    return null;
  });
  if (!browser) {
    server.close();
    return 2;
  }

  const results = {};
  try {
    for (const page of pages) {
      results[page] = {};
      for (const [form, config] of [['mobile', undefined], ['desktop', desktopConfig]]) {
        const each = [];
        for (let i = 0; i < runs; i += 1) each.push(await measure(lighthouse, config, `${origin}${page}`, port));
        const middle = Object.fromEntries(HELD_TO.map((c) => [c, median(each.map((r) => r[c]))]));
        results[page][form] = middle;
        console.log(`${page.padEnd(22)} ${form.padEnd(8)} ${HELD_TO.map((c) => `${c} ${middle[c] ?? '-'}`).join('  ')}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const low = under(results);
  if (low.length === 0) console.log(`\nEvery page scores ${FLOOR} or more in ${HELD_TO.join(', ')}, on a phone and at a desk, median of ${runs}.`);
  else console.log(`\nUnder ${FLOOR}:\n${low.map((l) => `  ${l}`).join('\n')}`);
  return low.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = await main();
