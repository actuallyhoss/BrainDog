/**
 * THE PERSON'S OWN WORDS, AS WRITTEN (`data-own` on the element that draws them). What somebody or their agent typed
 * into a text field is drawn as it was written, slugs, paths and dates and all, and the look's words check
 * (`tools/look/capture.mjs`) forgives text inside such an element. What the app says around it, a date it formats, an
 * amount, a choice's label, is never marked, so the check still reads it.
 */

/** The field types whose value is what somebody typed. */
export const OWN_TYPES: ReadonlySet<string> = new Set(['text', 'document', 'url', 'email', 'list']);
