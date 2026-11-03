/**
 * "Describe it": Slash's first draft of a filter, through the record's existing query door.
 *
 * THE DOOR IS `POST /api/slash/read`, pass 1 of `46 §5.4`, which the palette already asks (`Palette.svelte`): it answers
 * the predicate Slash drafted for a question, beside the rows that answered it. The builder wants the predicate and
 * nothing else, and files nothing: a draft is drawn as proposed rows and is part of no filter until a person keeps it.
 *
 * THE LIST IS NAMED IN THE QUESTION, because the door drafts over the whole record and a description such as "unpaid
 * over 100" means the list it was typed on. A draft that names a field this list does not have is not drawn at all
 * (`fromWhere` answers `null` for it), and the builder says Slash could not put it as a filter here.
 *
 * ABSENT WHERE SLASH DOES NOT ANSWER. The shell asks `/api/version` once and says whether a model is behind Slash on
 * this host (`slash` in the layout's data, as the palette reads it), and a surface passes no `describe` when it is not,
 * so the control is not drawn rather than drawn and refused.
 *
 * THE CLIENT IS LOADED ON THE FIRST ASK, as the palette loads it, so a list that never asks carries none of it.
 */

import type { Predicate } from '@braindog/where';

/** Whether Slash answers on this host, from the layout's data: `true` only where a model is behind it. */
export const slashAnswers = (data: unknown): boolean => {
  const d = data as { live?: unknown; slash?: unknown } | null;
  return d?.live === true && d.slash === true;
};

/** The builder's `describe` for one list: the words and the list's name go to Slash, and its predicate comes back. */
export function describeWith(base: string, listName: string): (words: string) => Promise<Predicate | null> {
  return async (words) => {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base }).slashRead(`${words} (in ${listName})`);
    return out.ok && out.value.predicate ? (out.value.predicate as Predicate) : null;
  };
}

/**
 * THE ADDRESS THAT OPENS SLASH ABOUT THESE ROWS: `/slash?with=people%2320,tasks%2312`, each row a chip in the composer and
 * sent with every ask, the field focused. For an "Ask about this" button: `href={at(askAboutHref(['people#20']))}`.
 * A ref is a row's spoken id (`people#20`), or `decide:`, `run:` or `sign:` and an id; at most eight are taken.
 */
export const askAboutHref = (refs: readonly string[]): string => `/slash?with=${refs.map((r) => encodeURIComponent(r)).join(',')}`;
