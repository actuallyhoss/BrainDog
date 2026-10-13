/**
 * The block kinds that read themselves: one module a kind, and one line each in the table below.
 *
 * A KIND USED TO COST A SWITCH ARM IN EVERY FILE THAT READ A BLOCK. The install check held one list, the read held a
 * chain of `if (block.kind === ...)` arms, and the keys a kind reads were a third place. A kind registered here is
 * named once: `declare.ts` admits every key of this table as a kind (`BLOCK_KINDS`), `block-keys.ts` admits each
 * module's `keys` on that kind and refuses them on every other, and `pages.ts` asks this table before any arm that
 * reads a kind of its own. A kind that is not here is read exactly as it was, by the code in `pages.ts`, so nothing
 * that already draws moved when this file arrived.
 *
 * ADDING A KIND is three files and three lines, one in each registry: this table and `kinds/<kind>.ts` beside it; the
 * web's `apps/web/src/lib/page/kinds/index.ts` and its `<kind>.ts`; and the renderer's row in
 * `packages/render/src/kinds.ts` `TABLE`, which is the renderer's to write. No kind file writes a count of the kinds,
 * so adding one never edits a sentence elsewhere.
 *
 * NOT NAMED `KINDS`, because the kernel already exports `KINDS` for the kinds of declaration (`declare.ts`).
 *
 * WHAT A KIND MODULE MAY IMPORT AT RUN TIME IS A LEAF, because this table is read while the modules that read it are
 * still loading. `block-keys.ts` and `declare.ts` build their lists from this table when they load, and `pages.ts` and
 * `metrics.ts` each reach `declare.ts` through their own imports. A module that imported any of the four at run time
 * would, loaded first as a test loads this table, have `block-keys.ts` ask for this table before it existed, and the
 * kernel would not load at all. So a module imports any type from anywhere, and at run time only a leaf beside it
 * (`listed.ts`, `words.ts`) or a package outside the kernel. What it needs from the record it reaches through `deps`,
 * and `pages.ts`'s and `metrics.ts`'s own helpers arrive on `deps.kit` (`pages.ts` `KindKit`).
 *
 * AND NO MODULE HOLDS A DECLARATION. A kind is code that reads what a page declares; a page, a list or a figure
 * written here would be a pack inside the kernel, which `no-declarations-in-kernel` refuses (`02 §1`).
 */

import type { Refusal } from '@braindog/ports';

import type { BlockResult, PageBlock, PageDeps } from '../pages.ts';
import { calendar } from './calendar.ts';
import { embed } from './embed.ts';
import { gallery } from './gallery.ts';
import { lanes } from './lanes.ts';
import { link } from './link.ts';

/**
 * When a module's `validate` is asked: at install, before the page is written, or at read, for a page written under
 * an earlier build of the module. The same sentence serves both, so an author hears at install what a reader would
 * otherwise be the first to hear.
 */
export type KindContext = { stage: 'install' | 'read' };

export type KindModule = {
  /**
   * The keys this kind reads beyond the ones every block may carry (`block-keys.ts` `GENERAL`). Each is admitted on
   * this kind and refused on every other, in the sentence that names the kinds that read it. A key another kind
   * already reads is shared: it is admitted on both.
   */
  keys: readonly string[];
  /**
   * The sources this kind reads itself though each says `first` (`sources/index.ts`). `pages.ts` answers a `first`
   * source before any kind is asked, and asks the kind instead when the block's source is named here.
   */
  across?: readonly string[];
  /**
   * What is wrong with this block as this kind reads it, or `null`. The sentence is about the block alone: the
   * install puts the page's id and the block's place in front of it, and `at` is the key inside the block.
   *
   * AT INSTALL NOTHING PAST THE KIND AND THE KEY NAMES HAS BEEN CHECKED YET, which is why the block is not typed as a
   * `PageBlock`: it is the JSON a pack sent, and every value in it is narrowed before it is trusted.
   */
  validate?(block: Readonly<Record<string, unknown>>, ctx: KindContext): Refusal | null;
  /**
   * The block's answer. `base` is the answer with nothing read into it yet: the block, no rows, `matched` 0, the
   * refusals `pages.ts` already found (a key nobody reads, a key another kind reads), and the page's `{{path}}`
   * values. A module keeps `base.refusals` in what it returns, adding its own after them, so a block that is wrong in
   * two ways says both. A module never throws: what it cannot read is a refusal on the block, and the page around it
   * still draws (`pages.ts`, "one block's refusal is one block").
   *
   * A block whose `when:` said no never reaches a module, and one whose kind the module refused at `validate` does
   * not either.
   */
  read(deps: PageDeps, block: PageBlock, base: BlockResult): BlockResult;
};

/**
 * The registered kinds, by the name a page's `kind:` says. One line a kind, in the order they arrived.
 *
 * A PLAIN OBJECT AND NOT A FROZEN ONE, so a test can register a stub kind before the kernel loads and read a page
 * through it (`packages/kernel/test/kinds-registry.test.ts`). Looked up only through `kindModule`, never by bracket,
 * so a page naming `constructor` finds nothing.
 */
export const BLOCK_KIND_MODULES: Record<string, KindModule> = {
  calendar,
  link,
  gallery,
  embed,
  lanes,
};

/** The module that reads `kind`, or `undefined` for a kind `pages.ts` reads itself. */
export const kindModule = (kind: string): KindModule | undefined =>
  Object.hasOwn(BLOCK_KIND_MODULES, kind) ? BLOCK_KIND_MODULES[kind] : undefined;
