/**
 * `planted`: the seed with one fault of each kind the look's quick checks look for put into its answers, so a check that
 * went blind is seen to (`checks.mjs`, `words.mjs`). It draws exactly as the seed does and never counts as seen.
 *
 *   node tools/look/run.mjs --source planted --set six        finds every fault below
 *   node tools/look/run.mjs --source seed --set six           finds none of them
 *
 * WORDS: one next step, which Today, Projects and the project's page all draw, says a template slot, a handle, a run's
 * and a question's id, a path, a refusal code, a raw date, an empty amount, a code quote, two machine words and a hash.
 * COUNTS: `boot` says 3 questions wait where the Needs you page holds 8, and leaves one project out of the rail, so the
 * More sheet lists 2 projects where the lane bars say 3. AGES: the record's clock is put on nine days, so every figure
 * read on 2 September is ten days old with the product's own rule (stale at 14 days) still saying nothing of it.
 */

import { open as openSeed } from './seed.mjs';

const DAY = 86_400_000;

/** The seed's own next step on Kiln, and what is put in its place. */
export const MARKER = 'Settle how Kiln is licensed, before the September issue announces it';
export const FAULTS = 'Settle {{kiln.licence}} for tools#8 and SG185, see ~/Developer/kiln/NEXT.md, ROUTE_UNKNOWN since 2026-10-06, GBP 0.00 owed, 3 rows in `kiln` with a typed value, build 8b1fe59';

/** How far the record's clock is moved on, and the page left out of the rail. */
export const LATER_DAYS = 9;
export const LEFT_OUT = 'marlow-co';

/** One answer of the record with the faults put in; `pathname` is the route it answers (`/api/boot`). */
export function plant(pathname, answer) {
  const swap = (v) => {
    if (typeof v === 'string') return v.split(MARKER).join(FAULTS);
    if (Array.isArray(v)) return v.map(swap);
    return v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v;
  };
  const out = swap(answer);
  if (/^\/api\/boot\/?$/u.test(pathname) && out?.value !== undefined) {
    const v = out.value;
    if (v.waits) v.waits = { ...v.waits, questions: 3 };
    if (typeof v.now === 'string') v.now = new Date(Date.parse(v.now) + LATER_DAYS * DAY).toISOString();
    if (Array.isArray(v.pages)) v.pages = v.pages.filter((p) => p.slug !== LEFT_OUT);
  }
  return out;
}

export async function open() {
  const seed = await openSeed();
  return {
    ...seed,
    name: 'planted',
    record: 'the seed with faults planted',
    async handle(req, res, at) {
      if (!/^\/api\//u.test(at.pathname)) return seed.handle(req, res, at);
      /* THE SEED ANSWERS INTO A HOLDER, so its answer can be changed before it goes on. */
      const held = { status: 200, headers: {}, body: Buffer.alloc(0), writeHead(status, headers) { held.status = status; held.headers = headers ?? {}; }, end(body) { held.body = Buffer.from(body ?? ''); } };
      await seed.handle(req, held, at);
      let body = held.body;
      if (/json/u.test(String(held.headers['content-type'] ?? '')))
        try {
          body = Buffer.from(JSON.stringify(plant(at.pathname, JSON.parse(body.toString('utf8')))));
        } catch {
          /* Not JSON after all: it goes on as it came. */
        }
      res.writeHead(held.status, { ...held.headers, 'content-length': String(body.length) });
      res.end(body);
    },
  };
}
