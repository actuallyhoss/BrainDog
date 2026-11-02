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
 *
 * A COLUMN, TOO: `{ page, into: <block key>, column }` adds one column to a block of the page rather than a
 * block of its own, after the block's own columns. `into` is the key the block answers (`blockKeyOf`), so a person who
 * renames its heading keeps the column. A key the page no longer has leaves the page as it was, with nothing said: the
 * column was about a block that is gone. At most `ADDED_COLUMNS_MOST` added columns on one block, from every pack, the
 * first by pack id kept, since a card four add-ons each add to is a table.
 */

import { blockKeyOf } from './block-keys.ts';
import type { PageBlock } from './pages.ts';

/** One column a pack adds to another pack's block: a field of the block's list or a figure, and its label. */
export type AddedColumn = { field?: string; metric?: string; label: string; as?: string };

/** One block a pack adds to another pack's page, as its manifest's `adds` says it. `page` is the page's declaration id. */
export type PageBlockAddition = { pack: string; page: string; block: PageBlock; after?: string; into?: undefined };

/**
 * One column a pack adds into the block of `page` whose key is `into`.
 *
 * IT CARRIES A `block` TOO, the column alone in a block of kind `column`, because `readPage` keys and fills every
 * addition by its block before it hands them here, and a page made from a template fills the column from its row through
 * that block as it fills its own. The carrier is never drawn: `withAdds` reads `into` first and takes the column out of it.
 */
export type PageColumnAddition = { pack: string; page: string; into: string; column: AddedColumn; block: PageBlock; after?: undefined };

/** What one pack adds to another pack's page: a whole block, or one column into a block of it. */
export type PageAddition = PageBlockAddition | PageColumnAddition;

/** The most added columns one block draws, from every pack together. `declare`'s `ADD_COLUMNS_MOST` is the same two. */
export const ADDED_COLUMNS_MOST = 2;

/** The carrier block a column addition travels in (`PageColumnAddition`). */
const carrier = (column: AddedColumn): PageBlock => ({ kind: 'column', columns: [column as NonNullable<PageBlock['columns']>[number]] }) as PageBlock;

/** A column off a manifest, or `null` when it does not read as one: a label, and a field or a figure as text. */
function columnOf(raw: unknown): AddedColumn | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as { field?: unknown; metric?: unknown; label?: unknown; as?: unknown };
  if (typeof c.label !== 'string' || c.label.trim() === '') return null;
  if (c.field !== undefined && typeof c.field !== 'string') return null;
  if (c.metric !== undefined && typeof c.metric !== 'string') return null;
  if (c.as !== undefined && typeof c.as !== 'string') return null;
  if ((c.field === undefined) === (c.metric === undefined)) return null;
  return {
    ...(typeof c.field === 'string' ? { field: c.field } : {}),
    ...(typeof c.metric === 'string' ? { metric: c.metric } : {}),
    label: c.label,
    ...(typeof c.as === 'string' ? { as: c.as } : {}),
  };
}

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
      const one = a as { page?: unknown; block?: unknown; after?: unknown; into?: unknown; column?: unknown } | null;
      if (one === null || typeof one !== 'object' || one.page !== page) continue;
      if (one.into !== undefined || one.column !== undefined) {
        /* A COLUMN THAT ALSO NAMES A BLOCK is neither, as `declare` refuses it, so it is left out. */
        const column = columnOf(one.column);
        if (typeof one.into !== 'string' || one.into === '' || one.block !== undefined || column === null) continue;
        out.push({ pack: p.id, page, into: one.into, column, block: carrier(column) });
        if (out.length >= ADDS_DRAWN_MOST) return out;
        continue;
      }
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
 *
 * A COLUMN ADDITION GOES INTO THE OWN BLOCK WHOSE KEY ITS `into` NAMES, after that block's own columns, and the block
 * stays the page's own. A block that declares no columns is left as it was, since its kind chose what it draws and one
 * added column would take the place of all of them; a column the block already draws (the same field or figure, drawn
 * the same way) is not drawn twice; a column the block cannot draw without losing something is left out (`fits`); and
 * past `ADDED_COLUMNS_MOST` on one block the rest are left out, by pack id.
 */
export function withAdds(own: readonly PageBlock[], adds: readonly PageAddition[]): { block: PageBlock; added?: string }[] {
  const after: { block: PageBlock; added: string }[][] = own.map(() => []);
  const last: { block: PageBlock; added: string }[] = [];
  const columns = columnsInto(own, adds.filter((a): a is PageColumnAddition => typeof a.into === 'string'));
  for (const a of adds) {
    if (typeof a.into === 'string') continue;
    const heading = a.block.heading;
    /* PLACED BY THE PERSON: a block of the same kind and heading is on the page already, so drawing this one too would
       be the same block twice. */
    if (heading !== undefined && own.some((b) => b.kind === a.block.kind && b.heading === heading)) continue;
    const at = a.after === undefined ? -1 : own.findIndex((b) => b.heading === a.after);
    if (at >= 0) {
      after[at]!.push({ block: a.block, added: a.pack });
      continue;
    }
    /* AFTER ANOTHER ADDITION, WHEN THAT IS WHAT IT NAMES (2 Nov): Sentry adds Errors after Where it stands and Open on
       Sentry after Errors, and Errors is no block of the page's own, so Open on Sentry went to the foot of a project's
       page, under More about and Runs on, a screen away from the figures it explains. It goes straight after the addition
       it names, wherever that one went, and to the foot only when nothing on the page has that heading. */
    const group = a.after === undefined ? -1 : [...after, last].findIndex((g) => g.some((x) => x.block.heading === a.after));
    if (group < 0) {
      last.push({ block: a.block, added: a.pack });
      continue;
    }
    const into = group === after.length ? last : after[group]!;
    into.splice(into.findIndex((x) => x.block.heading === a.after) + 1, 0, { block: a.block, added: a.pack });
  }
  return [...own.flatMap((block, i) => [{ block: columns[i] ?? block }, ...after[i]!]), ...last];
}

/* A FIGURE IN A COLUMN IS READ ONLY AS A CARD'S TREND OR ITS WHEN (`pages.ts` `trendsOf`, `whensOf`). On any other
   kind the read checks a column's field against the list and refuses the whole block, and on a card in any other role
   the figure reads nothing and takes the role's place: a figure that draws nothing hid the newest number a card with a
   short trend says in its stead (`render/src/html.ts`, `trendNewest`). */
const FIGURE_READ_AS = new Set(['trend', 'when']);

/**
 * Whether `block` can draw `column` beside its own without losing anything: a field on any kind, a figure only where it
 * is read, and on a card only a role it has room for (`render/src/cards.ts`'s `MOST`: three facts, one of every other),
 * since one past it makes the renderer degrade the card the page's own pack declared. A column with no role is a fact.
 */
function fits(block: PageBlock, column: { metric?: string; as?: string }): boolean {
  if (block.kind !== 'cards') return column.metric === undefined;
  if (column.metric !== undefined && !FIGURE_READ_AS.has(column.as ?? '')) return false;
  const role = column.as ?? 'fact';
  const held = (block.columns ?? []).filter((c) => (c.as ?? 'fact') === role).length;
  return held < (role === 'fact' ? 3 : 1);
}

/** Each own block that takes added columns, by its place on the page, with them laid after its own; the rest absent. */
function columnsInto(own: readonly PageBlock[], adds: readonly PageColumnAddition[]): (PageBlock | undefined)[] {
  const out: (PageBlock | undefined)[] = own.map(() => undefined);
  if (adds.length === 0) return out;
  const keys = own.map((b) => blockKeyOf(b));
  /* BY PACK ID, steadily, so which two of three a block keeps does not hang on the order a host handed them. */
  const byPack = [...adds].sort((a, b) => (a.pack < b.pack ? -1 : a.pack > b.pack ? 1 : 0));
  const taken = own.map(() => 0);
  for (const a of byPack) {
    const at = keys.indexOf(a.into);
    if (at < 0) continue;
    const block = out[at] ?? own[at]!;
    if (!Array.isArray(block.columns) || block.columns.length === 0 || taken[at]! >= ADDED_COLUMNS_MOST) continue;
    /* THE COLUMN AS ITS CARRIER HOLDS IT, which `readPage` filled from a template's row as it filled the page's own. */
    const filled = a.block.columns?.[0] ?? a.column;
    const column = { ...filled, label: filled.label ?? a.column.label } as NonNullable<PageBlock['columns']>[number];
    if (!fits(block, column)) continue;
    const same = block.columns.some((c) => (c.field ?? null) === (column.field ?? null) && (c.metric ?? null) === (column.metric ?? null) && (c.as ?? null) === (column.as ?? null));
    if (same) continue;
    out[at] = { ...block, columns: [...block.columns, column] };
    taken[at]! += 1;
  }
  return out;
}
