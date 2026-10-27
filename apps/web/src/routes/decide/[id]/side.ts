/**
 * THE SIDE OF ONE QUESTION'S PAGE: what sits beside the choices on a wide screen, and whether there is a side at all.
 *
 * MEASURED on the critic's second pass (`decide-light-1512`): the side column held "Asked by BrainDog 5w ago" and
 * nothing else on most questions, so a third of a laptop's width was five words. The side now says what the record
 * holds about the question and is dropped when it holds nothing: who asked and when lead it, then why it is asked, the
 * share the asker gave as data, and the things the reasons name. With none of those the page is one centred column
 * and who asked is the quiet line over the answers.
 *
 * WHAT ANSWERING CHANGES IS NOT HERE. It is drawn whole under the answers, and a headline of it beside them said it a
 * second time on every wide screen. So it never keeps a side open either: a question whose
 * only news is what it changes has no side.
 *
 * EVERY LINE HERE IS READ, NEVER MADE. The evidence is a pair the asker put on the question's body (`lead.ts`
 * `evidenceIn`), never one read out of a sentence; a linked thing is one a reason cites, by its own title (`cite.ts`).
 * A question whose reasons cite nothing links nothing.
 *
 * PURE AND NODE-LOADABLE, with the clock an argument, so `side.test.ts` holds it.
 */

import { cited, words as citeWords, type RowLink } from '../../../lib/cite.ts';
import { listName } from '../../../lib/record/names.ts';
import { evidenceIn, type Evidence } from '../lead.ts';

/** The most linked things the side lists before it says how many more there are. */
export const LINKED_MOST = 6;

const count = (n: number): string => (n === 1 ? 'one' : n.toLocaleString('en-GB'));

/** The side's own words. Plain, the person's own things by their list's name, and no word of the system's. */
export const words = {
  evidence: 'Evidence',
  linked: 'Linked',
  more: (n: number) => `and ${count(n)} more`,
  about: 'About',
} as const;

/**
 * A THING THE ANSWER KEPT NO NAME FOR IS NOT LISTED. In a sentence it reads "something in Invoices" (`cite.ts`), which
 * is honest there and is no name here: three of them under one heading would be the same words three times.
 */
const unnamed = (title: string, href: string): boolean => {
  const list = /^\/r\/([^/]+)\//u.exec(href)?.[1];
  return list !== undefined && title === citeWords.rowIn(listName(decodeURIComponent(list)));
};

/**
 * THE THINGS THE REASONS NAME, each once, in the order they are first named: a cited thing by its title, and the ones
 * a cited total adds up. `more` counts what was named past `LINKED_MOST`, so the side says there are more and never
 * grows a long list beside three choices.
 */
export function linkedOf(texts: readonly string[], figures: Record<string, unknown> = {}, now?: number): { links: RowLink[]; more: number } {
  const seen = new Map<string, RowLink>();
  const keep = (title: string, href: string) => {
    if (title.trim() !== '' && !unnamed(title, href) && !seen.has(href)) seen.set(href, { title, href });
  };
  for (const text of texts) {
    if (text.trim() === '') continue;
    for (const piece of cited(text, figures, now)) {
      if (piece.kind === 'row') keep(piece.title, piece.href);
      else if (piece.kind === 'sum') for (const r of piece.rows) keep(r.title, r.href);
    }
  }
  const all = [...seen.values()];
  return { links: all.slice(0, LINKED_MOST), more: Math.max(0, all.length - LINKED_MOST) };
}

export type Side = {
  evidence: Evidence | null;
  links: RowLink[];
  more: number;
  /** Whether anything but who asked is here to be said: with `false` the page drops the side. */
  any: boolean;
};

/**
 * THE SIDE, from one open question. `reasons` are the answers' reasons as they were filed, braces and all; `why` is why
 * it is asked; `body` is the question's body as the record keeps it, whose `evidence` is the one share drawn
 * (`evidenceIn`). A reason that says "41 of 58" in words is drawn as those words, with its links, and never as a chart.
 */
export function sideOf(q: {
  why?: string | undefined;
  reasons: readonly { text: string }[];
  body?: unknown;
  figures?: Record<string, unknown> | undefined;
  now?: number | undefined;
}): Side {
  const figures = q.figures ?? {};
  const why = q.why?.trim() ?? '';
  const evidence = evidenceIn(q.body, q.now);
  const { links, more } = linkedOf([...q.reasons.map((r) => r.text), why], figures, q.now);
  return { evidence, links, more, any: why !== '' || evidence !== null || links.length > 0 };
}

/** The row a question is about, by its list and number. */
export type AboutRow = { list: string; seq: number; spoken: string };

/**
 * THE ROW THE QUESTION IS ABOUT, when its body names one (`about: "recurring#7"`, as a rule's question carries it). The
 * side leads with it, by the row's own title and a link to it, so the thing is seen before it is answered for, without
 * leaving the page: two thirds of a laptop's width was empty beside "It went through" and "It stopped".
 */
export function aboutOf(body: unknown): AboutRow | null {
  const about = body !== null && typeof body === 'object' ? (body as { about?: unknown }).about : undefined;
  const m = typeof about === 'string' ? /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u.exec(about.trim()) : null;
  return m ? { list: m[1]!, seq: Number(m[2]), spoken: `${m[1]}#${m[2]}` } : null;
}

/** The facts under the row's title in the side: its list's name, then the amount and how late, where the question says them. */
export const aboutLine = (list: string, money: { amount: string; late: string } | null): string =>
  [list, money?.amount ?? '', money?.late ?? ''].filter((s) => s.trim() !== '').join(' · ');
