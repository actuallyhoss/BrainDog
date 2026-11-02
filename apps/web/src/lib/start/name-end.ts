/**
 * A NAME WITHOUT THE STOP OF THE SENTENCE IT WAS SAID IN (onboarding8, Omar's walk: "a brand refresh for Kettle & Co."
 * drafted an organisation called "Kettle & Co." beside the "Kettle & Co" sign-up had already added, and the two were
 * never seen as one). The full stop, comma, colon or mark the sentence ended on is taken off the end; a dot inside a name
 * stays ("Smith & Co. Ltd"), and so do the dots of initials ("J.R.R.", "U.S."), which are the name's own.
 *
 * A plain `.ts` with no imports, so the readers of names (the model's entries, the clients a sentence names, the tools
 * an answer lists) all hold a name to the same end.
 */

/** Initials, each letter with its dot ("U.S.", "J.R.R."), at the very end of a name: the last dot is theirs. */
const INITIALS = /(?:^|[\s.])\p{L}\.(?:\p{L}\.)+$/u;
/** What a sentence ends a name with: a stop, a pause, a mark, an ellipsis, and a closing quote said round it. */
const SENTENCE_END = /[\s.,;:!?…"“”]+$/u;

/** The name as said, with the sentence's stop taken off its end and its spaces made one. */
export function nameEnd(name: string): string {
  const t = name.replace(/\s+/gu, ' ').trim().replace(/^["“”]+/u, '').replace(/[\s,;:!?…"“”]+$/u, '');
  return INITIALS.test(t) ? t : t.replace(SENTENCE_END, '');
}
