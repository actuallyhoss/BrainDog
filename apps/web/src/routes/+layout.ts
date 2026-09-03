import { boot } from '$lib/record/api.ts';

/**
 * `ssr = false`: a static shell. Both hosts serve one `build/` directory unchanged and no request is
 * ever rendered on a server (50 §13 D1).
 *
 * In the real client this fires `boot()`, `GET /api/version` and the route's own call IN PARALLEL,
 * so a page costs one round trip after the shell. Here `boot()` is synchronous.
 */
export const ssr = false;
export const prerender = false;

export function load() {
  return boot();
}
