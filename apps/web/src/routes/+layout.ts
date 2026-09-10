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
import { redirect } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export async function load({ url }) {
  const { boot, INBOX } = await import('$lib/record/api.ts');
  const index = boot();

  /* A RECORD WITH ZERO REGISTERS HAS NO LEGAL SCREEN — 19 §6, which is also why screen one has no
     skip. Every other route would draw a nav with nothing in it, an empty state for a register that
     does not exist, or a table of a schema nobody declared; the shell itself has nothing to put in
     the rail. So there is one destination, and this is what sends people to it.

     `/s/<token>` IS EXEMPT because it is a capability URL: it renders one projected page, read-only,
     and must not imply there is a record behind it at all.

     `/signin` IS EXEMPT FOR THE OPPOSITE REASON. It is the screen a person opens when the record
     in front of them is not the one they want, and an empty record is the likeliest moment to
     want another: sending it to onboarding answers a question nobody asked and takes away the one
     control that could have fixed it. The seed always ships registers, so this cannot bite today
     and would bite the first hour a real empty record existed. */
  const spared = url.pathname === '/start' || url.pathname === '/signin' || url.pathname.startsWith('/s/');
  if (index.index.registers.length === 0 && !spared)
    redirect(307, '/start');

  return { ...index, inbox: INBOX.length };
}
