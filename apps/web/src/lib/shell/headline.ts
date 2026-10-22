/**
 * A page's headline sentence, cut into the parts the page header draws differently: the figures in it
 * at medium weight, the phrase that needs the reader in the alert red, and everything else in body text.
 *
 * "Cash is £33,850 across 2 accounts, and on what is due it runs out in 57 days." reads at a glance when £33,850, 2
 * and 57 stand a step heavier than the words round them; the sentence stays one sentence, at one size.
 *
 * PURE, AND NODE LOADS IT, so `headline.test.ts` holds the rule without a component.
 */

/** One run of the sentence: words, a figure, or the phrase that needs the reader. */
export type Part = { text: string; fig?: true; needs?: true };

/**
 * A FIGURE: digits with their grouping and decimals, a currency sign before them and a per cent after. A word for a
 * number ("Seven things") is a word, and is left as one.
 */
const FIGURE = /(?:[A-Z]{3}\u00a0|[A-Z]{0,2}\p{Sc})?\d(?:[\d,.]*\d)?(?:%|\u00a0[A-Z]{3}\b)?/gu;

function figures(text: string): Part[] {
  const out: Part[] = [];
  let from = 0;
  for (const m of text.matchAll(FIGURE)) {
    const at = m.index ?? 0;
    if (at > from) out.push({ text: text.slice(from, at) });
    out.push({ text: m[0], fig: true });
    from = at + m[0].length;
  }
  if (from < text.length) out.push({ text: text.slice(from) });
  return out;
}

/**
 * The sentence's parts, in order. `needs` is a phrase inside the sentence; when it is not there, nothing is red. The
 * phrase is drawn whole, its own figures included, since the red already marks it.
 */
export function partsOf(sentence: string, needs?: string): Part[] {
  const at = needs ? sentence.indexOf(needs) : -1;
  if (!needs || at < 0) return figures(sentence);
  return [...figures(sentence.slice(0, at)), { text: needs, needs: true }, ...figures(sentence.slice(at + needs.length))];
}

/**
 * THE SENTENCE ENDS WITH ITS FULL STOP, which the header adds where a caller left it off: "Ada Vine has been quiet since
 * April" ran out under a person's name (UI pass 20 Oct, W2-D), while every other page's line ended as a sentence does.
 * A line that already ends in a stop, a question, an ellipsis or a colon (even inside a closing quote or bracket) is
 * left as it is.
 */
export function stopped(sentence: string): string {
  const t = sentence.trimEnd();
  if (t === '' || /[.!?…:]["”’)\]]*$/u.test(t)) return t;
  return `${t}.`;
}
