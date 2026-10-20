/**
 * Whether the More sheet is asked for, held where a page can reach it, as `palette/open.svelte.ts` holds the palette.
 *
 * THE PHONE'S BAR HAS FIVE PLACES AND NO MORE TAB (his call 2, 20 October), so Work, People, Settings and the rest are
 * under the face at the top of each screen (`PageHead.svelte`), and that face is inside the page, not the shell. The
 * shell opens its sheet when this turns true and puts it back.
 */
export const moreSheet = $state({ asked: false });

/** Ask the shell for the More sheet. */
export function openMore(): void {
  moreSheet.asked = true;
}
