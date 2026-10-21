/**
 * WHAT A READER WHO DOES NOT HOLD THE WHOLE RECORD IS NOT DRAWN (the owner's call of 21 October): a guest on Kiln, or a
 * colleague held to some lists, opened Today on "Needs you", "Numbers" and "Coming up" tiles each saying "This part of
 * the page drew nothing, and the record says why", over parts the record keeps for whoever reads all of it. Every block
 * the record refused such a reader is left out for them (`drawn: false`, `why: 'held'`), as an empty block is
 * (`emptyHidden`); its sentence stays on the block for anything that reads why.
 *
 * A READER OF THE WHOLE RECORD IS SHOWN A REFUSAL AS EVER, the owner's Today among them: a refusal there is a page that
 * asks for something the record cannot draw, and saying so is how it gets fixed.
 *
 * PLAIN TYPESCRIPT, so a test loads it in Node.
 */

/** What the shell says of the reader: the lists they hold when they hold lists and not the record, else `null`. */
export type Reader = { lists: readonly string[] | null } | null | undefined;

/** Whether the reader holds the whole record: no shell yet reads as the record's own, which is shown everything. */
export const holdsWhole = (me: Reader): boolean => me === null || me === undefined || me.lists === null;

/** The page's blocks with each one the record refused this reader left out, when they do not hold the whole record. */
export function heldOut<B extends { refusals: readonly unknown[]; drawn?: boolean | undefined; why?: string | undefined }>(blocks: readonly B[], whole: boolean): readonly B[] {
  if (whole) return blocks;
  return blocks.map((b) => (b.refusals.length > 0 && b.drawn !== false ? ({ ...b, drawn: false, why: 'held' } as B) : b));
}
