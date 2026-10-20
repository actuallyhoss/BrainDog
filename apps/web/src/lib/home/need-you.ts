/**
 * THE ONE COUNT OF WHAT NEEDS YOU: the open questions, as `boot` says them (`waits`), else the count the reader was
 * handed. The rail's badge, the phone tab's badge, Today's header and Today's sentence all ask here, so no two disagree.
 * The late work is a separate number and is said on its own; it is never folded into this one.
 *
 * A FILE OF ITS OWN, because the shell asks it on every screen and `today-tiles.ts` carries Today's readers with it:
 * imported from there, the badge put the kernel in front of the first paint.
 */
export const needYouCount = (waits: { questions: number } | null | undefined, fallback: number): number => waits?.questions ?? fallback;
