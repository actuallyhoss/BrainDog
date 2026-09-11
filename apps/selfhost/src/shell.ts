/**
 * The app, served by the self-host: one built directory, a fallback for every screen the app draws, and no
 * file outside it.
 *
 * WHY THE SELF-HOST SERVES IT AT ALL. Sign-in is a cookie, and a cookie is per origin: `/signin` has to come
 * from the same process as `/auth/*` and `/api/*`, or the browser holds the session for a host that never
 * reads it. The Worker has this from its assets binding; this is the same `build/`, served the same way.
 *
 * `realpath` CONTAINMENT, NOT A STRING CHECK. A path is resolved against the root and then its real path is
 * resolved again, so neither `..` in the URL nor a symlink inside the build can reach a file outside it.
 *
 * `frame-ancestors 'none'`, BECAUSE A SIGN-IN SCREEN IN SOMEBODY ELSE'S FRAME IS A CLICKJACKING SCREEN. It
 * cannot go in the page's own meta tag, which is why it is a header here.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

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
 * A handler over one built directory. It throws now, at start, when the directory is not there, rather than
 * answering 404 for every screen of a server that says it started.
 *
 * A MISSING FILE UNDER `/_app/` IS A 404, AND ANY OTHER MISSING PATH IS THE APP. `/r/tasks` and `/signin` are
 * screens the app draws from one `index.html`; a missing script is a missing script, and answering it with a
 * page would be a 200 the browser then fails to run.
 */
export function shellOf(dir: string): (request: Request) => Response {
  const root = realpathSync(dir);
  const fallback = join(root, 'index.html');
  if (!existsSync(fallback)) throw new Error(`${dir} has no index.html, so it is not a built app. Build apps/web, or point BRAINDOG_SHELL at its build directory.`);

  return (request) => {
    const headers = new Headers({
      'x-content-type-options': 'nosniff',
      'content-security-policy': "frame-ancestors 'none'",
    });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('allow', 'GET, HEAD');
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 405, headers });
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 400, headers });
    }
    const file = find(root, pathname) ?? (pathname.startsWith('/_app/') ? null : fallback);
    if (!file) {
      headers.set('cache-control', 'no-store');
      return new Response(null, { status: 404, headers });
    }
    headers.set('content-type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    /* Vite names every immutable file by its content, so it can be kept for ever; the page that names them cannot. */
    headers.set('cache-control', pathname.startsWith('/_app/immutable/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    return new Response(request.method === 'HEAD' ? null : readFileSync(file), { status: 200, headers });
  };
}
