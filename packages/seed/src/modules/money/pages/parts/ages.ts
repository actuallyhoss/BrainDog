/** Last confirmed: the day each account's balance was last said, and a box to say what one holds today. Money's page names
 * `register.balances` in its `requires`, as a page names every list a block writes to. */

/**
 * THE DAY AN ACCOUNT'S CARD IS DATED BY, SINCE money-core 3.16.0 (REC-B03): the newest statement Cash now restarts the
 * account from (`account-ages`, grouped by the account's name), written over the card's `as_of` in the answer
 * (`staleDaysOf` in `packages/kernel/src/pages.ts`). The typed "As of" is only the day somebody typed a balance, and a
 * bank message never writes it, so a card dated by it read out of date for ever. An account no statement ever confirmed
 * keeps the day its row holds. Past a week the card says it is out of date, with the watch glyph and the word.
 */
export const CONFIRMED_STALE = { field: 'as_of', after: '7d', figure: 'account-ages' } as const;

/** The card's day column, named for what it now says. */
export const CONFIRMED_COLUMN = { field: 'as_of', label: 'Last confirmed', as: 'when' } as const;

/**
 * MONEY'S LAST CONFIRMED TILE AND ITS BOX, SINCE money-core 3.16.0, placed inside Heads up under the line about the
 * oldest balance (`heads-up.ts`), so the line says how old and the tile says which. Each account Cash now adds up, by
 * the name the record calls it, with the day the bank or a check last said what it held; an old one is marked. Drawn
 * only while a balance is more than a week old (`balances-stale`), so a record whose money is current reads no word
 * about it.
 *
 * WHAT IT HOLDS TODAY WRITES A BALANCE CHECK, never the account. A check is a statement of its own, kept with its day,
 * and Cash now restarts the account from it (`ROLLED` in `legs.ts`); the account's own balance stays what was typed on
 * the day it was typed. Each takes the whole width of Heads up, as every line in it does.
 */
export const AGES: Record<string, unknown>[] = [
  {
    kind: 'cards',
    heading: 'Last confirmed',
    icon: 'clock',
    span: 12,
    source: 'register.accounts',
    where: 'liquid is true, state is not closed',
    columns: [{ field: 'name', as: 'title' }, CONFIRMED_COLUMN],
    order: [{ field: 'seq', dir: 'asc' }],
    stale: CONFIRMED_STALE,
    when: { metric: 'balances-stale', gt: 0 },
  },
  {
    kind: 'capture',
    heading: 'What it holds today',
    icon: 'plus',
    span: 12,
    register: 'balances',
    when: { metric: 'balances-stale', gt: 0 },
  },
];
