/**
 * Edit layout's Done as the person's own look over the page (PGS-B07): the order, widths and columns they arranged, kept
 * by block key, and laid by the record over the page as read, an add-on's blocks among them.
 *
 * WHY A LOOK AND NOT THE PAGE. Done used to set the page body whole, rebuilt by block index (`arrangedBody`). A page an
 * add-on added a block to never matched the stored count, so it could not be arranged at all, and a page an add-on wrote
 * became the person's own copy once arranged and stopped taking that add-on's updates. A look names blocks by key, so it
 * fits every page, and the page under it stays the add-on's ("User > pack > derived. Always.").
 *
 * WHAT A LOOK CANNOT SAY GOES THE OLD WAY (`byLook`): the record orders blocks only within the heading they sit under in
 * their column (`applyLook` in `packages/kernel/src/compose.ts`), never moves a heading, and names only blocks it
 * answered a key for. An arrangement that does any of those is written as the page body, as before.
 *
 * PURE, AND NODE LOADS IT, so `arrange-look.test.ts` holds the look, the check and the Undo.
 */

import { bodyOf } from '../page/look.ts';
import type { LiveLook } from './page-live.ts';

type Body = Record<string, unknown>;

/**
 * One block as Done laid it, in its new order: its key, the width it takes, the column it sits in on a page with a rail,
 * and whether it is drawn. `kind` tells a heading and the page's opening from the blocks a look moves.
 */
export type Laid = { key: string; span: number; area?: 'main' | 'rail'; drawn: boolean; kind?: string };

/** A block's key as a look may name it (the kernel's `BLOCK_KEY`). A key the page made up for itself is not one. */
const BLOCK_KEY = /^[a-z][a-z0-9_-]{0,47}$/u;

/** The widths a look may give a block (the kernel's `LOOK_SPANS`, the board's five). */
const SPANS: ReadonlySet<number> = new Set([12, 8, 6, 4, 3]);

/** The most blocks one look names (the kernel's `LOOK_KEYS_MOST`). */
const MOST = 88;

/** The kinds that open a page and that a lead goes after (the kernel's `STAYS`). */
const STAYS: ReadonlySet<string> = new Set(['note', 'capture', 'inputs', 'section']);

const areaOf = (b: Laid): 'main' | 'rail' => (b.area === 'rail' ? 'rail' : 'main');
const isHeading = (b: Laid): boolean => b.kind === 'section';

/** What the live look held beside what `LiveLook` narrows, read only when the record answered it. */
type Held = LiveLook & { span?: unknown; area?: unknown; group?: unknown };

const mapOf = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0 ? { ...(v as Record<string, unknown>) } : undefined;

/**
 * THE LEAD STAYS ONLY WHERE IT STILL LEADS. The record moves a lead to the top of the main column, so a lead kept over a
 * block the person moved down would put it straight back. Kept while nothing drawn in the main column stands above it but
 * the page's opening and headings, which is where the record leaves a lead that already leads.
 */
function stillLeads(laid: readonly Laid[], lead: string | null): boolean {
  if (lead === null) return false;
  const at = laid.findIndex((b) => b.key === lead);
  if (at === -1) return false;
  return laid.slice(0, at).every((b) => areaOf(b) !== 'main' || STAYS.has(b.kind ?? '') || !b.drawn);
}

/**
 * The person's look for the page as arranged: `order` the keys in their new order, a width for every block, a column for
 * every block on a page with a rail, and what the live look already held.
 *
 * WHAT THE PERSON KEPT STAYS KEPT: their pins and what is hidden, and on their own look its line and next step too. An
 * engine's headline and next action are never copied into the person's look, so the engine goes on writing them around
 * it (`mergeLook`). A block taken off the page in Edit layout (`removed`) is hidden, and loses its pin, which a hidden
 * block may not hold.
 *
 * `basis` IS WRITTEN AS `bodyOf` WRITES IT, and the look is `look.<page>` of the declaration it is laid over, which a page
 * drawn from a template shares with every page like it.
 */
export function lookOfArrangement(slug: string, live: LiveLook | null, laid: readonly Laid[], removed: readonly string[] = []): Body {
  const own = live?.by === 'owner';
  const gone = new Set(removed);
  const order = [...new Set(laid.filter((b) => !isHeading(b) && BLOCK_KEY.test(b.key)).map((b) => b.key))];
  const pinned = (live?.pinned ?? []).filter((k) => !gone.has(k));
  const hide = [...new Set([...(live?.hide ?? []), ...removed.filter((k) => BLOCK_KEY.test(k))])].filter((k) => !pinned.includes(k));
  const lead = live && !gone.has(live.lead ?? '') && stillLeads(laid, live.lead) ? live.lead : null;
  const body = bodyOf(live?.page ?? slug, {
    page: live?.page ?? slug,
    basis: live?.basis ?? null,
    lead,
    order,
    hide,
    headline: own ? live.headline : null,
    next: own ? live.next : null,
    pinned,
    by: 'owner',
  });
  const span: Record<string, number> = {};
  const area: Record<string, 'main' | 'rail'> = {};
  const railed = laid.some((b) => b.area !== undefined);
  for (const b of laid) {
    if (isHeading(b) || !BLOCK_KEY.test(b.key)) continue;
    if (SPANS.has(b.span)) span[b.key] = b.span;
    if (railed) area[b.key] = areaOf(b);
  }
  /* A GROUPING THE PERSON SET is theirs and rides along; the record answers it where it has one. */
  const group = own ? mapOf((live as Held).group) : undefined;
  return {
    ...body,
    ...(group ? { group } : {}),
    ...(Object.keys(span).length ? { span } : {}),
    ...(Object.keys(area).length ? { area } : {}),
  };
}

/**
 * Each block's heading in its column: the key of the heading it sits under, or the top of its column. A heading is
 * under itself.
 */
function headingsOf(blocks: readonly Laid[]): Map<string, string> {
  const open = new Map<'main' | 'rail', string>();
  const out = new Map<string, string>();
  for (const b of blocks) {
    const area = areaOf(b);
    if (isHeading(b)) open.set(area, `${area}:${b.key}`);
    out.set(b.key, open.get(area) ?? `${area}:`);
  }
  return out;
}

/**
 * WHETHER THE ARRANGEMENT CAN BE KEPT AS A LOOK. `laid` is the page as arranged, `read` the page as it was drawn when the
 * mode opened, each block in its own column.
 *
 * FALSE WHEN A LOOK COULD NOT SAY IT: a block the record gave no key of its own (or two blocks one key), more blocks than
 * a look names, a heading moved, or a block that left the heading it sat under in its column. The record lays a column
 * change first and then orders within each heading, so a block's heading is read off the page as read with every block
 * in its new column.
 */
export function byLook(laid: readonly Laid[], read: readonly Laid[]): boolean {
  const keys = laid.map((b) => b.key);
  if (keys.some((k) => !BLOCK_KEY.test(k)) || new Set(keys).size !== keys.length || keys.length > MOST) return false;
  const to = new Map(laid.map((b) => [b.key, b]));
  /* THE PAGE AS READ, every block in the column it was moved to, and what was taken off left out. */
  const before = read.filter((b) => to.has(b.key)).map((b) => ({ ...b, area: areaOf(to.get(b.key)!) }));
  const heads = (blocks: readonly Laid[]) => blocks.filter(isHeading).map((b) => `${areaOf(b)}:${b.key}`).join(',');
  if (before.some((b) => isHeading(b) && areaOf(b) !== areaOf(read.find((r) => r.key === b.key)!))) return false;
  if (heads(before) !== heads(laid)) return false;
  const was = headingsOf(before);
  const now = headingsOf(laid);
  return laid.every((b) => !was.has(b.key) || was.get(b.key) === now.get(b.key));
}

/** What Undo writes: the person's own look as it was, or a retire of the look Done wrote. */
export type LookUndo = { write: Body } | { retire: string };

/**
 * WHAT UNDO PUTS BACK. The person's own look as it was, widths, columns and grouping included where the record answered
 * them; where there was none, or it was the rules' or Slash's, the look Done wrote is retired and the page is arranged
 * from the record again.
 */
export function lookUndo(slug: string, live: LiveLook | null): LookUndo {
  const page = live?.page ?? slug;
  if (!live || live.by !== 'owner') return { retire: page };
  const held = live as Held;
  const body = bodyOf(page, live);
  const extra = { group: mapOf(held.group), span: mapOf(held.span), area: mapOf(held.area) };
  return { write: { ...body, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) } };
}
