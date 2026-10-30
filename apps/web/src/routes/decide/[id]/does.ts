/**
 * WHAT AN ANSWER SETS GOING, said before the press and after it (audit 6g, AG1).
 *
 * "Chase £4,800" drafted a reminder on the invoice, in its Draft to send, and nothing on the question said so: not
 * before the press, so a person could take Chase for sending, and not after it, where the receipt said only that the
 * decision was recorded. The answers here are the ones whose automation the record ships with, by the rule that asks
 * (`opened_by`, `rule:<id>`) and the answer's own words, which is how that automation names them
 * (`packages/seed/src/modules/money/rules.ts`, `MONEY_AUTOMATIONS`). Any other answer says nothing more than it did.
 *
 * PURE AND NODE-LOADABLE, as `onward.ts` is.
 */

type Does = {
  /** One quiet line under the answers, before anybody presses. */
  before: string;
  /** The receipt's line once it is in: `lead`, the thing it is about by its title as a link, then `tail`. */
  lead: string;
  tail: string;
};

const DOES: Readonly<Record<string, Readonly<Record<string, Does>>>> = {
  'rule:invoice-late': {
    'chase it': { before: 'Drafts a reminder for you to send.', lead: 'A reminder is drafted on', tail: 'Open it to read and send.' },
  },
};

const key = (s: string): string => s.trim().toLowerCase();

/** What the answer titled `option` sets going, on a question opened by `by`, or `null` when nothing is known. */
export function doesOf(by: string | undefined, option: string | undefined): Does | null {
  if (by === undefined || option === undefined) return null;
  return DOES[by.trim()]?.[key(option)] ?? null;
}

/** The line under the answers, for the first of `options` that sets something going, or `null`. */
export function doesBefore(by: string | undefined, options: readonly { title: string }[]): string | null {
  for (const o of options) {
    const d = doesOf(by, o.title);
    if (d !== null) return d.before;
  }
  return null;
}
