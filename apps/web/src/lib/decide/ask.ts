/**
 * THE QUESTION AND WHAT CAME WITH IT, told apart. Whoever files a question often writes the warning into it: "Install
 * Sentry 1.1.1 from a catalogue? Unsigned: nothing says who published it beyond the catalogue it came from." The title
 * is the question alone, and what follows the question mark is the line under it, on the question's page and on its
 * card, so both say the same short title (2 Nov, "this looks shit").
 *
 * A TEXT WITH NO QUESTION MARK, or one that ends on it, is all title. A question mark inside brackets or quotes is not
 * the end of the question: only one followed by a space and a capital starts the line under it. PURE, NODE LOADS IT.
 */
export type Ask = { ask: string; detail: string };

export function askOf(text: string): Ask {
  const t = text.trim();
  const at = /\?\s+(?=[\p{Lu}\p{N}"“'‘(])/u.exec(t);
  if (!at) return { ask: t, detail: '' };
  const ask = t.slice(0, at.index + 1).trim();
  const detail = t.slice(at.index + at[0].length).trim();
  /* A TITLE OF A WORD OR TWO IS NO QUESTION ON ITS OWN ("Why? Because ..."), so it stays whole. */
  if (ask.split(/\s+/u).length < 3) return { ask: t, detail: '' };
  return { ask, detail };
}
