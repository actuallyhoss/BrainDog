/**
 * `ssr = false`: a static shell. Both hosts serve one `build/` directory unchanged and no request is
 * ever rendered on a server (50 §13 D1).
 *
 * The record module is loaded DYNAMICALLY, and that is not a trick to make a budget pass. In the real
 * client `boot()` is `POST /api/boot` — a network response, which is by definition not in your entry
 * chunk. Importing the mock statically put the whole synthetic record into the entry graph and pushed
 * it 0.3 KB over the 30 KB budget, which was the bundle gate correctly reporting a shape the real app
 * would not have.
 *
 * In the real client this fires `boot()`, `GET /api/version` and the route's own call IN PARALLEL, so
 * a page costs one round trip after the shell.
 */
export const ssr = false;
export const prerender = false;

export async function load() {
  const { boot, INBOX } = await import('$lib/record/api.ts');
  return { ...boot(), inbox: INBOX.length };
}
