/**
 * The app, served by the self-host: one built directory, a fallback for every screen the app draws, and no
 * file outside it.
 *
 * WHY THE SELF-HOST SERVES IT AT ALL. Sign-in is a cookie, and a cookie is per origin: `/app/signin` has to come
 * from the same process as `/auth/*` and `/api/*`, or the browser holds the session for a host that never
 * reads it. The Worker has this from its assets binding; this is the same `build/`, served the same way.
 *
 * THE APP IS MOUNTED AT `/app`. `apps/web` is built with
 * `paths.base: '/app'` and writes every file under `build/app/`, so its pages ask for `/app/_app/…`. `/api`,
 * `/auth`, `/mcp` and `/in` stay at the root, where `server.ts` answers them before this file is reached.
 *
 * `realpath` CONTAINMENT, NOT A STRING CHECK. A path is resolved against the root and then its real path is
 * resolved again, so neither `..` in the URL nor a symlink inside the build can reach a file outside it.
 *
 * `frame-ancestors 'none'`, BECAUSE A SIGN-IN SCREEN IN SOMEBODY ELSE'S FRAME IS A CLICKJACKING SCREEN. It
 * cannot go in the page's own meta tag, which is why it is a header here.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

import { drawnFrame, isDrawnFrame } from '@braindog/host/drawn-frame';

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/** The app's base, as `apps/web/svelte.config.js` sets `paths.base`. */
const BASE = '/app';

/** Cloudflare Turnstile's origin. The self-host has no sign-up (`on: 'worker'`), so no page of it keeps it. */
const TURNSTILE = 'https://challenges.cloudflare.com';

/** The policy on a file beside the pages, where nothing inline runs; an SVG opened on its own is a document that could. */
const FILE_POLICY = "default-src 'self'; object-src 'none'; base-uri 'none'";

/**
 * The header for a page: the policy SvelteKit wrote into its `<meta>` (`kit.csp` in `apps/web/svelte.config.js`),
 * less Turnstile, with `frame-ancestors 'none'`, which a meta tag cannot carry. It is the Worker's `pagePolicy`
 * (`apps/worker/src/route.ts`) with sign-up taken away: the two hosts share no package this could live in.
 *
 * A PAGE WITH NO META GETS `frame-ancestors 'none'` ALONE, because a policy without the shell's hashes refuses its
 * inline scripts and leaves an empty screen; `apps/web/test/csp.test.ts` fails a build whose shell lacks the meta.
 */
function pagePolicy(html: string): string {
  const own = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(html)?.[1];
  if (own === undefined) return "frame-ancestors 'none'";
  const kept = own
    .split(';')
    .map((directive) => directive.trim().split(/\s+/).filter((source) => source !== TURNSTILE).join(' '))
    .filter((directive) => directive !== '');
  return [...kept, "frame-ancestors 'none'"].join('; ');
}

const inside = (root: string, path: string): boolean => path === root || path.startsWith(root + sep);

/** The real file a URL path names under `root`, or `null`. `/x`, then `/x.html`, then `/x/index.html`. */
function find(root: string, pathname: string): string | null {
  for (const candidate of [pathname, `${pathname}.html`, join(pathname, 'index.html')]) {
    const full = resolve(root, `.${candidate}`);
    if (!inside(root, full)) continue;
    try {
      if (!existsSync(full)) continue;
      const real = realpathSync(full);
      if (inside(root, real) && statSync(real).isFile()) return real;
    } catch {
      /* A name the filesystem will not take is a file that is not there. */
    }
  }
  return null;
}

/**
 * THE BUILD DIRECTORY OR ITS `app` FOLDER, EITHER ONE. `BRAINDOG_SHELL` named the build directory before the
 * move and still does in every operator's environment; `main.ts` and `catalogueFolder` name the folder that
 * holds `index.html`. The app folder is the root either way, so nothing above it is served.
 */
function appFolder(dir: string): string {
  const named = realpathSync(dir);
  return existsSync(join(named, 'app', 'index.html')) ? realpathSync(join(named, 'app')) : named;
}

/**
 * A handler over one built directory. It throws now, at start, when the directory is not there, rather than
 * answering 404 for every screen of a server that says it started.
 *
 * A MISSING FILE UNDER `/app/_app/` OR `/fonts/` IS A 404, AND ANY OTHER MISSING PATH UNDER `/app` IS THE APP.
 * `/app/r/tasks` and `/app/signin` are screens the app draws from one `index.html`; a missing script is a
 * missing script, and answering it with a page would be a 200 the browser then fails to run.
 *
 * `/fonts/*` IS SERVED FROM THE APP FOLDER because `packages/skin/tokens.css` asks for `url('/fonts/…')` at the
 * root. On `brain.dog` the site answers that path with the same bytes; here there is no site.
 *
 * EVERY OTHER PATH IS A 308 INTO `/app`: `/` because that is where a person types the address, and `/signin` or
 * `/r/tasks` because that is where a bookmark or a mailed link from before the move points. Serving the page
 * there instead would load `/_app/…` scripts that are no longer anywhere. The fragment of a `#magic=` link
 * survives, because a `Location` with no fragment keeps the one the browser had.
 */
export function shellOf(dir: string): (request: Request) => Response {
  const root = appFolder(dir);
  const fallback = join(root, 'index.html');
  if (!existsSync(fallback))
    throw new Error(`${dir} has no app/index.html, so it is not a built app. Build apps/web, or point BRAINDOG_SHELL at its build directory.`);

  return (request) => {
    /* THE FRAME A DRAWN BLOCK IS DRAWN IN is answered from code under its own policy, as the Worker answers it, and is
       never a file of the build (`@braindog/host/drawn-frame`). */
    if (isDrawnFrame(new URL(request.url).pathname)) return drawnFrame(request.method);
    const headers = new Headers({
      'x-content-type-options': 'nosniff',
      'content-security-policy': "frame-ancestors 'none'",
    });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('allow', 'GET, HEAD');
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 405, headers });
    }
    const url = new URL(request.url);
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 400, headers });
    }

    const mounted = pathname === BASE || pathname.startsWith(`${BASE}/`);
    const font = pathname.startsWith('/fonts/');
    if (!mounted && !font) {
      /* The raw path and not the decoded one, so what was sent is what the browser is sent back to. */
      headers.set('location', `${BASE}${url.pathname}${url.search}`);
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 308, headers });
    }

    const within = mounted ? pathname.slice(BASE.length) || '/' : pathname;
    const file = find(root, within) ?? (font || within.startsWith('/_app/') ? null : fallback);
    if (!file) {
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 404, headers });
    }
    const type = extname(file).toLowerCase();
    headers.set('content-type', TYPES[type] ?? 'application/octet-stream');
    /* Vite names every immutable file by its content, so it can be kept for ever; the page that names them cannot. */
    headers.set('cache-control', within.startsWith('/_app/immutable/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    /* A HEAD IS READ TOO, so it is told the same policy as the GET it stands for. */
    const bytes = readFileSync(file);
    headers.set('content-security-policy', type === '.html' ? pagePolicy(bytes.toString('utf8')) : `${FILE_POLICY}; frame-ancestors 'none'`);
    return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
  };
}
