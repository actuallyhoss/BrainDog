/**
 * The app, served by the self-host: one built directory, a fallback for every screen the app draws, and no
 * file outside it.
 *
 * WHY THE SELF-HOST SERVES IT AT ALL. Sign-in is a cookie, and a cookie is per origin: `/signin` has to come
 * from the same process as `/auth/*` and `/api/*`, or the browser holds the session for a host that never
 * reads it. The Worker has this from its assets binding; this is the same `build/`, served the same way.
 *
 * THE APP IS AT THE ROOT, AS ON `app.brain.dog`. `apps/web` is built with no base and writes every file at the top of
 * `build/`, so its pages ask for `/_app/…`. `/api`, `/auth`, `/mcp`, `/oauth` and `/in` are at the root beside it, where
 * `server.ts` answers them before this file is reached, and a path whose first word is one of the host's doors is
 * never the app here either. It was mounted at `/app` until 29 Oct; every address under `/app` is a 308 to the same
 * address without it, so a bookmark or a link mailed before then still opens.
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

/** The prefix the app was mounted at before it moved to the root, which a page load is now sent on from. */
const LEGACY = '/app';

/**
 * THE FIRST WORDS THAT ARE THE HOST'S AND NEVER A PAGE: its doors, the build's chunks, and the old prefix. `server.ts`
 * answers the built doors before this file is reached, so what arrives here under one of these is a path nobody serves,
 * and a 404 says so where the shell's 200 would look like a working endpoint. The Worker keeps the same list
 * (`ROOT_DOORS` in `apps/worker/src/route.ts`), and the web app as `DOORS` (`apps/web/src/lib/at.ts`).
 */
const DOORS = new Set(['api', 'auth', 'account', 'mcp', 'in', 'oauth', 'a', 'ws', 'healthz', 'app', '.well-known']);

/** The first word of a path. */
const firstOf = (pathname: string): string => /^\/+([^/]*)/.exec(pathname)?.[1] ?? '';

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
 * THE BUILD DIRECTORY, OR THE `app` FOLDER AN OPERATOR NAMED WHILE THE APP WAS BUILT UNDER `/app`. The build writes
 * `index.html` at its top again, so the directory itself is the root; a `BRAINDOG_SHELL` that still names
 * `build/app` from those weeks holds a stale build, and is served from its parent once that holds the new one.
 */
function appFolder(dir: string): string {
  const named = realpathSync(dir);
  const parent = resolve(named, '..');
  return named.endsWith(`${sep}app`) && existsSync(join(parent, 'index.html')) ? realpathSync(parent) : named;
}

/**
 * A handler over one built directory. It throws now, at start, when the directory is not there, rather than
 * answering 404 for every screen of a server that says it started.
 *
 * A MISSING FILE UNDER `/_app/` OR `/fonts/` IS A 404, AND ANY OTHER MISSING PATH IS THE APP.
 * `/r/tasks` and `/signin` are screens the app draws from one `index.html`; a missing script is a
 * missing script, and answering it with a page would be a 200 the browser then fails to run.
 *
 * `/fonts/*` IS THE BUILD'S OWN FOLDER, because `packages/skin/tokens.css` asks for `url('/fonts/…')` at the root,
 * which is where the app is now.
 *
 * EVERY PATH UNDER `/app` IS A 308 TO THE SAME PATH WITHOUT IT: `/app/signin#magic=…` and `/app/r/tasks` are where a
 * bookmark or a mailed link from before the move points. Serving the page there instead would hand the app an
 * address it reads as nobody's. The fragment of a `#magic=` link survives, because a `Location` with no fragment keeps
 * the one the browser had. A path whose first word is one of the host's doors is a 404, under `/app` or not.
 */
export function shellOf(dir: string): (request: Request, origin: string) => Response {
  const root = appFolder(dir);
  const fallback = join(root, 'index.html');
  if (!existsSync(fallback))
    throw new Error(`${dir} has no index.html, so it is not a built app. Build apps/web, or point BRAINDOG_SHELL at its build directory.`);

  return (request, origin) => {
    /* THE FRAME A DRAWN BLOCK IS DRAWN IN is answered from code under its own policy, as the Worker answers it, and is
       never a file of the build (`@braindog/host/drawn-frame`). */
    if (isDrawnFrame(new URL(request.url).pathname)) return drawnFrame(request.method, new URL(request.url).pathname);
    /* WHAT THE WORKER'S `asPage` SETS, so a link out of a record on this host says nothing of the host it left. */
    const headers = new Headers({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      'content-security-policy': "frame-ancestors 'none'",
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      /* AS THE WORKER SAYS (`PAGE_HARDENING`), LESS HSTS: this host may be plain http on a machine's own name, and whether it
         stays https is whoever runs it to say. */
      'cross-origin-opener-policy': 'same-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=()',
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

    const legacy = pathname === LEGACY || pathname.startsWith(`${LEGACY}/`);
    const within = legacy ? pathname.slice(LEGACY.length) || '/' : pathname;
    if (DOORS.has(firstOf(within))) {
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 404, headers });
    }
    if (legacy) {
      /* The raw path and not the decoded one, so what was sent is what the browser is sent back to. AND UNDER THIS HOST'S
         OWN ORIGIN, never as a bare path: `/app//evil.example/x` less `/app` is `//evil.example/x`, which a browser reads
         as another host, so a link to this host could send its reader anywhere. Behind the configured origin the same
         characters are only a path on this host. */
      headers.set('location', `${origin}${url.pathname.slice(LEGACY.length) || '/'}${url.search}`);
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 308, headers });
    }

    const file = find(root, within) ?? (within.startsWith('/fonts/') || within.startsWith('/_app/') ? null : fallback);
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
