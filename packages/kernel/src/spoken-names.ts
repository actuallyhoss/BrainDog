/**
 * Spoken ids inside a sentence, said as the row's name: "Change tools#8 to ..." reads "Change Fly tool to ...".
 *
 * Agents write a question with the ids they were handed, and a person must never read one (the agent-facing rule is
 * "say names, never ids"). An id nothing answers to stays as written rather than vanishing. Pure: the caller hands in how
 * a row is named, so no SQL lives here.
 */

/** `tools#8` (a list and a number) or `S880` (a run), standing alone as a word. Question handles (`SG185`) have no name. */
const SPOKEN_IN = /(?<![\w#/.-])(?:([a-z][a-z0-9_]{0,31})#([1-9]\d{0,14})|(S[1-9]\d{0,14}))(?![\w#-])/gu;

export function nameSpokenIn(text: string, nameOf: (spoken: string) => string | null): string {
  if (!text.includes('#') && !/S\d/u.test(text)) return text;
  return text.replace(SPOKEN_IN, (said: string) => {
    const name = nameOf(said)?.replace(/\s+/gu, ' ').trim();
    return name === undefined || name === '' ? said : name;
  });
}
