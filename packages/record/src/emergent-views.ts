/**
 * A saved view a person keeps opening is offered a place in the rail (`29 §3` T2: "all these
 * pages would start dynamically showing as the user starts to use brain.dog").
 *
 * A SAVED VIEW IS A PAGE UNDER VIEWS (`apps/web/src/lib/record/rows-write.ts` `viewPage`): one table over one list,
 * with the filter and order the person had, in the section `VIEWS_SECTION`. Its opens are already counted, since the
 * record's `page` writes one `page.render` a read, keyed by the page's slug (`index.ts`), which is the same line
 * `slash.ts` sums for a page's opens and `openedSince` reads for a list's. Nothing new is stored.
 *
 * THE OFFER (`viewPlacesOffered`): a view opened `PLACE_OPENS` times or more in the last `PLACE_DAYS` days, on a record
 * a person first used `PEN_YOUNG_DAYS` days ago or more, whose `place:<slug>` is not dismissed, is offered a place in the
 * section of the page that already draws its list, at the end of it. Keeping it writes the view's own declaration with
 * only its `nav` moved, so the view is the same page at the same address and nothing else in the rail moves.
 *
 * AT THE END, NEVER IN FRONT. The place is after every page already in that section, the person's and an add-on's
 * alike, so an offer kept never pushes in front of a page somebody chose or an add-on gave the list (`29 §4`).
 *
 * AN OFFER AND NOTHING MORE. It asks, files and decides nothing: it is a pen item the person keeps with one press or
 * lets go, under the pen's three-at-a-time rule and its lapse (`penQueued`).
 */

import type { Json } from '@braindog/kernel';

import { LAPSE_DAYS, TIER, type Offer as Weighed } from './design-agent.ts';
import { PEN_YOUNG_DAYS, signatureOf, usedIn, type PenDeps, type PenItem } from './emergent.ts';

/** The nav section a saved view is written under, as `rows-write.ts` writes it (the web's `copy.viewsSection`). */
export const VIEWS_SECTION = 'Views';
/** The opens a view earns a place at, in `PLACE_DAYS` days: five in a fortnight is a habit, not a look. */
export const PLACE_OPENS = 5;
/** The days those opens are counted over, today among them. */
export const PLACE_DAYS = 14;

/**
 * Where a place sits in the queue: in the page tier, below a page of open work (4500 up) and a week (the head of the
 * tier), above a page for a list that only holds entries (the foot), lifted by its opens.
 */
const PLACE_RANK = TIER.page + 400;
const DAY_MS = 86_400_000;
/** The byte ceiling the page check holds a nav section to, and the highest nav order it admits (`kernel/src/declare.ts`). */
const SECTION_BYTES = 40;
const ORDER_MOST = 9999;

type Weight = { rank: number; basis: string; change: Weighed['change'] };
const WEIGHTS = new WeakMap<PenItem, Weight>();

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const fit = (text: string, most: number): string | null => {
  let out = text.trim();
  while (out !== '' && bytes(out) > most) out = [...out].slice(0, -1).join('').trimEnd();
  return out === '' ? null : out;
};
const isBody = (value: Json | undefined): value is Record<string, Json> =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

/**
 * Each of `slugs`' opens since `since`: the `page.render` lines the record's `page` writes, summed by day as Slash
 * sums them. THE SLUGS GO AS ONE JSON VALUE (`json_each`), never a parameter each, as the pen's other reads pass lists.
 */
function opensSince(deps: PenDeps, slugs: readonly string[], since: string): Map<string, number> {
  if (!deps.use || slugs.length === 0) return new Map();
  return new Map(
    deps.use.sql
      .all<{ subject: string; n: number }>(
        "SELECT subject, sum(n) AS n FROM observation WHERE kind = 'page.render' AND day >= ? AND subject IN (SELECT value FROM json_each(?)) GROUP BY subject",
        since,
        JSON.stringify(slugs),
      )
      .map((r) => [r.subject, Number(r.n)]),
  );
}

/** The declaration of the page at `slug`, parsed, or `null` for one that will not parse or takes a parameter. */
function viewDeclared(declared: readonly { id: string; kind: string; body: string }[], slug: string): { id: string; body: Record<string, Json> } | null {
  for (const row of declared) {
    if (row.kind !== 'page' || row.body.includes('{{')) continue;
    let body: Json;
    try {
      body = JSON.parse(row.body) as Json;
    } catch {
      continue;
    }
    if (!isBody(body)) continue;
    const page = typeof body.page === 'string' ? body.page : row.id.slice('page.'.length);
    if (page === slug) return { id: row.id, body };
  }
  return null;
}

/**
 * The places offered: for each saved view the caller reads over one list, opened `PLACE_OPENS` times or more in the
 * last `PLACE_DAYS` days, on a record past its young fortnight, and not dismissed, the view's own declaration with its
 * `nav` moved to the end of the section that already draws its list (else a section named after the list). A page
 * already somewhere else in the rail is no saved view and is never offered. Every item passes the lint keeping it meets.
 * The item is `place:<slug>`, so a dismissal holds for that view alone and turns down nothing else about the list.
 */
export function viewPlacesOffered(deps: PenDeps): PenItem[] {
  const { kernel, reads, pages, dismissed, use } = deps;
  if (!use) return [];
  const first = usedIn(use).first;
  if (first === null || use.nowMs - Date.parse(first) < PEN_YOUNG_DAYS * DAY_MS) return [];

  const views = pages.filter((p) => p.nav?.section === VIEWS_SECTION && p.registers.length === 1 && reads(p.registers[0]!) && !dismissed.has(signatureOf('place', p.slug)));
  if (views.length === 0) return [];
  const opens = opensSince(deps, views.map((v) => v.slug), dayOf(use.nowMs - (PLACE_DAYS - 1) * DAY_MS));
  const lists = new Map(kernel.registers());
  const declared = kernel.declarations();
  /* THE LAST PLACE IN EACH SECTION, every page in it counted, the person's and an add-on's alike, so a kept place is after them. */
  const lastIn = new Map<string, number>();
  const lapses = dayOf(use.nowMs + LAPSE_DAYS * DAY_MS);
  for (const p of pages) if (p.nav) lastIn.set(p.nav.section, Math.max(lastIn.get(p.nav.section) ?? 0, p.nav.order));
  const out: PenItem[] = [];

  for (const view of views) {
    const n = opens.get(view.slug) ?? 0;
    const list = view.registers[0]!;
    const decl = lists.get(list);
    if (n < PLACE_OPENS || !decl) continue;
    const held = viewDeclared(declared, view.slug);
    if (held === null) continue;
    /* IN THE SECTION OF A PAGE THAT ALREADY DRAWS THE LIST, the one first in the rail, so the view sits under its list. */
    const beside = pages
      .filter((p) => p.nav && p.nav.section !== VIEWS_SECTION && p.registers.includes(list))
      .sort((a, b) => a.nav!.order - b.nav!.order || a.slug.localeCompare(b.slug))[0];
    const section = beside?.nav?.section ?? fit(decl.name, SECTION_BYTES) ?? list;
    const order = (lastIn.get(section) ?? 0) + 10;
    if (order > ORDER_MOST) continue;
    const navWas = isBody(held.body.nav) ? held.body.nav : {};
    const body: Record<string, Json> = { ...held.body, nav: { ...navWas, section, order } };
    if (kernel.lint([{ id: held.id, kind: 'page', body }]) !== null) continue;
    lastIn.set(section, order);

    const name = typeof held.body.title === 'string' && held.body.title.trim() !== '' ? held.body.title.trim() : view.slug;
    const draft = { id: held.id, kind: 'page', body };
    const item: PenItem = {
      id: signatureOf('place', view.slug),
      kind: 'page',
      register: list,
      title: `Keep ${name} in the rail?`,
      why: `Opened ${n.toLocaleString('en')} times in two weeks. Keep it in ${section}, after what is already there.`,
      change: { to: draft },
      list,
      draft,
      lapses,
    };
    WEIGHTS.set(item, { rank: PLACE_RANK + Math.min(n, 99), basis: `opens@${n}`, change: { kind: 'page', list, draft } });
    out.push(item);
  }
  return out;
}

/**
 * The items above as the queue weighs them (`design-agent.ts` `Offer`), for `penQueued` to put beside what `recommend`
 * answered, since the recommender has no rule for a place. An item not made here weighs nothing and is left out.
 */
export const placesWeighed = (items: readonly PenItem[]): Weighed[] =>
  items.flatMap((item) => {
    const w = WEIGHTS.get(item);
    return w ? [{ key: item.id, class: 'arrange' as const, rank: w.rank, basis: w.basis, lapses: item.lapses, title: item.title, why: item.why, change: w.change }] : [];
  });
