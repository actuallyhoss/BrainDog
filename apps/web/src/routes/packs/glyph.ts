/**
 * The glyph an add-on wears in its row: the glyph of the place it brings, as the rail draws that place.
 *
 * EVERY ADD-ON WORE THE SAME CUBE, so six rows of add-ons were six identical wells and the eye had nothing to find Money
 * by. An add-on declares the pages it brings, and the rail already draws each page with the glyph its declaration chose,
 * so an add-on wears its first page's: Money its wallet, Work its task, People its people. Read off what the record
 * declares and never off an add-on's name. The page hands it the pages of the add-ons this build ships; one whose pages
 * it does not know is drawn with the add-ons glyph until it does.
 *
 * A PAGE ABOUT ONE THING IS NOT THE ADD-ON'S PLACE (a project's own page wears its colour, not a glyph), and an add-on
 * that brings no page the rail draws keeps the add-ons glyph.
 *
 * PURE, so `node --test` holds it.
 */

import type { IconName } from '../../lib/ui/icons.ts';

export function glyphOf(
  pages: readonly string[] | undefined,
  nav: readonly { id: string; icon: IconName; row?: boolean | undefined }[],
): IconName {
  for (const slug of pages ?? []) {
    const drawn = nav.find((n) => n.id === slug && n.row !== true);
    if (drawn) return drawn.icon;
  }
  return 'packs';
}
