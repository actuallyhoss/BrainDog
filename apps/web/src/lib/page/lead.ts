/**
 * Which block a declared page opens on as its headline: the page's sentence (`note lead`), when it is the first block
 * a reader sees.
 *
 * ONE HEADLINE ON EVERY PAGE, AT EVERY WIDTH (DIRECTION §35, "every screen answers one question first, in one headline
 * line"). The page's name and tools ride over the top of that tile (`PageHead`'s `over`), so the screen opens on what
 * is true rather than on a word the nav already says. It held only on a plain page: Work, which a reader may narrow,
 * and Kiln, which has a rail, opened on a grey line under a 30px name instead. The filter strip now sits under the
 * headline, and on a page with a rail the headline spans the page over both columns.
 *
 * THE FIRST BLOCK DRAWN, NOT THE FIRST DECLARED. A project page declares two sentences on one figure's `when:`, so on
 * Kiln the first declared is the one the record said no to, and the sentence the reader meets is the second.
 *
 * PURE, AND NODE LOADS IT, so `lead.test.ts` holds the rule without a component.
 */

/** What the rule reads off a block: whether it is drawn, its kind, and whether it is the page's sentence. */
export type LeadCandidate = { readonly drawn: boolean; readonly kind: string; readonly lead?: unknown };

/** The index of the page's headline sentence, or `-1` when the page does not open on one. */
export function leadIndex(blocks: readonly LeadCandidate[]): number {
  const at = blocks.findIndex((b) => b.drawn);
  if (at < 0) return -1;
  const first = blocks[at]!;
  return first.kind === 'note' && first.lead === true ? at : -1;
}
