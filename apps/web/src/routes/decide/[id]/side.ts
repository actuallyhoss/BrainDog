/**
 * THE SIDE OF ONE QUESTION'S PAGE: what sits beside the choices on a wide screen, and whether there is a side at all.
 *
 * MEASURED on the critic's second pass (`decide-light-1512`): the side column held "Asked by BrainDog 5w ago" and
 * nothing else on most questions, so a third of a laptop's width was five words. The side now says what the record
 * holds about the question and is dropped when it holds nothing: who asked and when lead it, then why it is asked, what
 * answering changes in a line each, the share the suggested answer's reason claims, and the things the reasons name.
 * With none of those the page is one centred column and who asked is the quiet line over the answers.
 *
 * EVERY LINE HERE IS READ, NEVER MADE. What it changes is the headline of what the page already draws whole under the
 * answers; the evidence is a pair of numbers the asker wrote ("41 of 58 lines", `lead.ts` `evidenceOf`); a linked thing
 * is one a reason cites, by its own title (`cite.ts`). A question whose reasons cite nothing links nothing.
 *
 * PURE AND NODE-LOADABLE, with the clock an argument, so `side.test.ts` holds it.
 */

import { cited, words as citeWords, type RowLink } from '../../../lib/cite.ts';
import { listName } from '../../../lib/record/names.ts';
import { evidenceOf, type Evidence } from '../lead.ts';

/** The most lines "What it changes" says beside the choices; the whole of it is under them. */
export const CHANGES_MOST = 4;

/** The most linked things the side lists before it says how many more there are. */
export const LINKED_MOST = 6;

const count = (n: number): string => (n === 1 ? 'one' : n.toLocaleString('en-GB'));

/** The side's own words. Plain, the person's own things by their list's name, and no word of the system's. */
export const words = {
  evidence: 'Evidence',
  linked: 'Linked',
  /** What a proposal would put on the screen, by what it is and its name: "Page: Cash this month". */
  appears: (kind: string, title: string) => `${kind}: ${title}`,
  changed: (n: number, list: string) => `Changes ${count(n)} in ${list}`,
  added: (n: number, list: string) => `Adds ${count(n)} to ${list}`,
  more: (n: number) => `and ${count(n)} more`,
} as const;

/** What answering would do, as the page already worked it out, for the lines the side says of it. */
export type Facts = {
  /** An arrangement's own lead and its summary, where the question is one. */
  arranged?: { lead: string; summary: string } | null | undefined;
  /** What a proposal would put in place: a page, a list, a rule. */
  appears?: readonly { kind: string; title: string }[] | undefined;
  /** How many things it changes, and how many it adds, in `list`. */
  changed?: number | undefined;
  added?: number | undefined;
  list?: string | undefined;
  /** The money accepting writes, already in words ("Moves £12.98"), or empty. */
  money?: string | undefined;
};

/**
 * WHAT ANSWERING CHANGES, a line each and at most `CHANGES_MOST`: the arrangement, or what a proposal puts in place, or
 * how many things it changes and adds, then the money it writes. A question of options alone changes nothing by being
 * answered, and says nothing here.
 */
export function changesOf(f: Facts): string[] {
  const out: string[] = [];
  const list = f.list?.trim() ?? '';
  if (f.arranged && f.arranged.lead.trim() !== '') {
    out.push(f.arranged.summary.trim() === '' ? f.arranged.lead : `${f.arranged.lead}: ${f.arranged.summary}`);
  } else if (f.appears && f.appears.length > 0) {
    for (const a of f.appears.slice(0, 3)) if (a.title.trim() !== '') out.push(a.kind.trim() === '' ? a.title : words.appears(a.kind, a.title));
  } else if (list !== '') {
    if ((f.changed ?? 0) > 0) out.push(words.changed(f.changed ?? 0, list));
    if ((f.added ?? 0) > 0) out.push(words.added(f.added ?? 0, list));
  }
  if (f.money && f.money.trim() !== '') out.push(f.money);
  return out.slice(0, CHANGES_MOST);
}

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
  changes: string[];
  evidence: Evidence | null;
  links: RowLink[];
  more: number;
  /** Whether anything but who asked is here to be said: with `false` the page drops the side. */
  any: boolean;
};

/**
 * THE SIDE, from one open question. `reasons` are the answers' reasons as they were filed, braces and all, the
 * suggested one marked; `why` is why it is asked. The evidence is the share the suggested answer's reason claims, or
 * else the one why it is asked claims; an answer nobody suggested is never drawn as a chart, since a chart beside one
 * choice reads as an endorsement of it.
 */
export function sideOf(q: {
  why?: string | undefined;
  reasons: readonly { text: string; suggested?: boolean | undefined }[];
  figures?: Record<string, unknown> | undefined;
  facts?: Facts | undefined;
  now?: number | undefined;
}): Side {
  const figures = q.figures ?? {};
  const why = q.why?.trim() ?? '';
  const suggested = q.reasons.find((r) => r.suggested === true)?.text ?? '';
  const evidence = [suggested, why].reduce<Evidence | null>((got, text) => got ?? (text.trim() === '' ? null : evidenceOf(text, figures, q.now)), null);
  const { links, more } = linkedOf([...q.reasons.map((r) => r.text), why], figures, q.now);
  const changes = changesOf(q.facts ?? {});
  return { changes, evidence, links, more, any: why !== '' || changes.length > 0 || evidence !== null || links.length > 0 };
}
