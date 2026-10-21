/**
 * The one lookup from a kind's name to its spec, for the built-in kinds and for the kinds a pack declares.
 *
 * A PACK'S KIND IS A ROW THE RECORD HOLDS, NOT ONE THIS TABLE DOES. `kinds.ts` is the forty compiled in; a kind a
 * pack invented after this bundle shipped arrives as a `block.<id>` declaration, and the host hands the installed ones
 * in (`RenderOptions.kinds`, `ParseOptions.kinds`). Every reader asks here, so a first-party kind and a pack's travel
 * one code path from the fence to the primitive that draws them, which is what `kinds.ts` was written in the shape of a
 * declaration for (22 §3, ADR-056).
 *
 * A BUILT-IN NAME ALWAYS WINS, and a pack's kind is only ever looked up under the `block.` prefix, so nothing a pack
 * declares can redraw `stat` or answer for a name it does not own.
 */

import { KINDS, isKind, type Kind, type KindSpec } from './kinds.ts';

/** A kind a pack declares, as a page and a fence name it: `block.` and the declaration's own id. */
export type PackKind = `block.${string}`;

/** A drawn block's kind: one of the forty-one, or one a pack declared. */
export type BlockKind = Kind | PackKind;

/** The prefix every pack kind carries, and the pattern the kernel admits under it (`declare.ts` `PACK_KIND`). */
export const PACK_KIND = /^block\.[a-z][a-z0-9_-]{0,31}$/u;

export const isPackKind = (kind: string): kind is PackKind => PACK_KIND.test(kind);

/**
 * The spec a kind draws with, or `undefined` for a kind this build does not draw and no installed pack declares.
 *
 * `Object.hasOwn`, because `extra` is keyed by names a pack wrote and `constructor` is a name.
 */
export function kindSpec(kind: string, extra?: Readonly<Record<string, KindSpec>>): KindSpec | undefined {
  if (isKind(kind)) return KINDS[kind];
  if (extra && isPackKind(kind) && Object.hasOwn(extra, kind)) return extra[kind];
  return undefined;
}
