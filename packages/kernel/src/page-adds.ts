/**
 * The blocks packs add to other packs' pages, read off the manifests their `pack` rows store, and laid into a page as it
 * is drawn.
 *
 * WHY THE PAGE'S OWN DECLARATION IS NEVER WRITTEN. A block written into Portfolio's `page.project` would be Portfolio's
 * from then on: Portfolio's next update would plan the page as changed in the app and keep the owner's copy, or drop the
 * block, and taking the adding pack out would leave its block behind on a page it no longer explains. So the addition
 * lives where the adding pack said it, its manifest's `adds`, and the page is assembled from both each time it is read.
 * Updating either pack keeps the other's addition, and uninstalling or turning off the adding pack takes it away, because
 * its `pack` row goes or is marked off.
 *
 * WHERE ONE GOES. After the page's own block whose heading `after` names, or last. A page somebody arranged keeps their
 * order, since this reads the page as it is stored now: an addition whose `after` heading they took away goes last, and
 * one they placed themselves (a block of the same kind and heading already on the page) is not drawn a second time.
 *
 * NOTHING IS TRUSTED TO BE NORMALISED, for `laidOf`'s reason in `pack-laid.ts`: a manifest written by hand, or by a build
 * older than the one reading it, may hold anything. What does not read as `{ page, block: { kind } }` is left out, and a
 * manifest that does not parse adds nothing.
 *
 * ITS CEILING IS `ADDS_DRAWN_MOST` blocks on one page, over one manifest per `pack` row the host hands in.
 */

import type { PageBlock } from './pages.ts';

/** One block a pack adds to another pack's page, as its manifest's `adds` says it. `page` is the page's declaration id. */
export type PageAddition = { pack: string; page: string; block: PageBlock; after?: string };

/**
 * The most added blocks one page draws. `declare` lets one pack add 16, so this is four packs' worth on one page, and a
 * page past it is somebody installing packs to fill a page rather than to use one.
 */
export const ADDS_DRAWN_MOST = 64;

/** The blocks each pack adds to the page whose declaration id is `page`, by pack id and then in the order each wrote them. */
export function additionsOf(packs: readonly { id: string; manifest: string }[], page: string): PageAddition[] {
  const out: PageAddition[] = [];
  for (const p of [...packs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(p.manifest);
    } catch {
      continue;
    }
    const adds = (parsed as { adds?: unknown } | null)?.adds;
    if (!Array.isArray(adds)) continue;
    for (const a of adds as unknown[]) {
      const one = a as { page?: unknown; block?: unknown; after?: unknown } | null;
      if (one === null || typeof one !== 'object' || one.page !== page) continue;
      const block = one.block as { kind?: unknown } | null;
      if (block === null || typeof block !== 'object' || Array.isArray(block) || typeof block.kind !== 'string') continue;
      out.push({ pack: p.id, page, block: block as unknown as PageBlock, ...(typeof one.after === 'string' ? { after: one.after } : {}) });
      if (out.length >= ADDS_DRAWN_MOST) return out;
    }
  }
  return out;
}

/**
 * A page's own blocks with `adds` laid among them: each after the first own block whose heading its `after` names, in the
 * order the additions came, and the rest after every own block. `added` names the pack a block came from, and is absent
 * on the page's own.
 */
export function withAdds(own: readonly PageBlock[], adds: readonly PageAddition[]): { block: PageBlock; added?: string }[] {
  const after: { block: PageBlock; added: string }[][] = own.map(() => []);
  const last: { block: PageBlock; added: string }[] = [];
  for (const a of adds) {
    const heading = a.block.heading;
    /* PLACED BY THE PERSON: a block of the same kind and heading is on the page already, so drawing this one too would
       be the same block twice. */
    if (heading !== undefined && own.some((b) => b.kind === a.block.kind && b.heading === heading)) continue;
    const at = a.after === undefined ? -1 : own.findIndex((b) => b.heading === a.after);
    (at < 0 ? last : after[at]!).push({ block: a.block, added: a.pack });
  }
  return [...own.flatMap((block, i) => [{ block }, ...after[i]!]), ...last];
}
