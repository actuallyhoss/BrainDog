/**
 * Where a figure's rows open (`metrics.ts` re-exports it), in a file of its own so a row's address (`row-href.ts`),
 * which every screen reads, names a figure's door without the figures' arithmetic.
 */

import type { MetricDecl } from './metrics.ts';
import { registerHref } from './where.ts';

/** The list a figure's `source` reads, or `null` for a figure the record computes rather than stores. */
export const registerOf = (source: string): string | null =>
  source.startsWith('register.') ? source.slice('register.'.length) : null;

/**
 * The URL that opens the rows a figure was computed over.
 *
 * A negation becomes `not-in` rather than the enum's complement: the complement is only writable
 * when the field declares its values, and a URL that silently lists them is a URL that breaks when
 * a pack adds one.
 */
export function hrefFor(decl: MetricDecl): string | null {
  const register = registerOf(decl.source);
  /* A FIGURE THAT READS NO LIST HAS NO ROWS TO OPEN, SO IT HAS NO DOOR. This answered `/p/money`, which is a page only
     money-core declares: on a record without Money the door opened nothing, and on one with it the door opened a page
     about something else. Every caller leaves `href` off on `null`, as they already did for a figure over no rows. */
  if (!register) return null;
  /* THE SAME BUILDER A PAGE BLOCK USES. It lived here, so a figure's link was derived from its
     predicate and a block's link was not derived from anything — the block just went to the
     register. Two surfaces asking the same question of the same sentence now get the same answer
     from the same function, which is the only arrangement under which they cannot drift. */
  return registerHref(register, decl.where);
}
