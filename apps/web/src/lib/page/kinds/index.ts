/**
 * The block kinds the app draws from the record's own answer: one module a kind, and one line each in the table below.
 *
 * A KIND USED TO BE A SWITCH ARM IN EVERY FILE BETWEEN THE ANSWER AND THE SCREEN. `page-live.ts` translated the
 * record's block into the shape the old sample engine answered, `blocks.ts` turned that into the dialect with an arm
 * per kind, and `PageView.svelte` chose a drawing with more arms. A kind registered here is drawn straight from the
 * kernel's `BlockResult`: `page-live.ts` keeps the answer on the block as `answer`, and `blocks.ts` `draw`, which
 * `BlockSlot.svelte` draws through, asks this table before any arm of its own. A kind
 * that is not here is drawn exactly as it was.
 *
 * ADDING A KIND is three files and three lines, one in each registry: this table and `kinds/<kind>.ts` beside it;
 * the kernel's `packages/kernel/src/kinds/index.ts` and its `<kind>.ts`; and the renderer's row in
 * `packages/render/src/kinds.ts` `TABLE`. A kind's stylesheet is `kinds/<kind>.css`, and `styles.ts` beside this file
 * gathers every one, so no new kind edits `blocks.css`.
 *
 * IT LOADS IN PLAIN NODE, and so does every module it names: `blocks.ts` imports it, and the app's tests import
 * `blocks.ts`. So a kind module imports no stylesheet, no `.svelte` file and no `$lib` path, and names its imports with
 * their `.ts` extension. It may import `blocks.ts` or `page-live.ts` for a helper and use it inside `draw`, never at its
 * own top level, because both import this file.
 *
 * THE ANSWER IS WHAT A RECORD SENT, which may be a record on another build. The type is the kernel's so a module names
 * what it reads by the kernel's own words, and a module still narrows every value before it draws it: what it cannot
 * read is a refusal on the block (`opts.nothing()` for an empty one), never a throw that takes the page with it.
 */

import type { BlockResult } from '@braindog/kernel';
import type { Segment } from 'braindog-render';

import type { Refusal } from '../../record/blocks.ts';
import { calendar } from './calendar.ts';
import { link } from './link.ts';
import { gallery } from './gallery.ts';
import { embed } from './embed.ts';
import { lanes } from './lanes.ts';

/** What `draw` hands a kind besides its answer. */
export type DrawOptions = {
  /** The record's home currency, or `null` when it has none, which a figure with no code of its own is written in. */
  home: string | null;
  /** The record's clock when it read the page, which "today" and "late" are told against. */
  now: number;
  /**
   * The empty state every other kind draws when it has no rows: "nothing matched", or, over a list that holds nothing
   * yet, what the list holds and how to add the first row. A kind with nothing to draw answers this rather than a
   * sentence of its own, so the empty states `19 §6` tells apart stay told apart.
   */
  nothing: () => Refusal;
};

/** One block, drawn: the dialect's segments, or the reason there are none. The shape `blocks.ts` `draw` answers. */
export type Drawn = { segments: Segment[]; refusal: Refusal | null };

export type KindDrawer = { draw(result: BlockResult, opts: DrawOptions): Drawn };

/**
 * The registered kinds, by the name a page's `kind:` says. One line a kind, in the order they arrived.
 *
 * A PLAIN OBJECT AND NOT A FROZEN ONE, so a test can register a stub kind and draw a block through it
 * (`kinds.test.ts`). Looked up only through `drawerOf`, never by bracket, so a block named `constructor` finds nothing.
 */
export const BLOCK_KIND_DRAWERS: Record<string, KindDrawer> = {
  calendar,
  link,
  gallery,
  embed,
  lanes,
};

/** The drawer for `kind`, or `undefined` for a kind `blocks.ts` draws itself. */
export const drawerOf = (kind: string): KindDrawer | undefined =>
  Object.hasOwn(BLOCK_KIND_DRAWERS, kind) ? BLOCK_KIND_DRAWERS[kind] : undefined;
