/** Waiting on you: what a rule or an agent asked about money. */

export const QUEUE: Record<string, unknown>[] = [
  {
    /* WHAT A RULE OR AN AGENT HAS ASKED ABOUT MONEY, answered where it is shown, three at a time, and the rest are in
       Decide. No `empty:` of its own: with nothing waiting the queue says its own line (`QUEUE_CLEARED` in
       `packages/render/src/queue.ts`).

       IN THE SIDE COLUMN, UNDER WHERE THE MONEY IS, SINCE money-core 3.11.0. It was right under the headline from
       3.3.0, because it is the one tile here that needs the person, and three questions drawn whole were then the
       first screen of Money, with no number on it (the design review's fix 1). The questions are still on the first
       screen, beside the walk, and the app draws them compact there (`asks.ts`): the question and its suggested
       answer, one press each.

       NOT PLACED ON MONEY SINCE REC-B23 step 7: the questions are answered in Decide, and its block went to the costs by
       category (`pages/money.ts`). It stays declared for a page that wants it. */
    kind: 'queue',
    heading: 'Waiting on you',
    icon: 'ask',
    span: 12,
    area: 'rail',
    source: 'governance.open',
    /* ONLY WHILE SOMETHING IS ASKED, SINCE money-core 3.3.0 (`questions-open`, the record's own count of what is open
       in Decide), so a record with nothing waiting draws no band under its headline. */
    when: { metric: 'questions-open', gt: 0 },
    /* EVERY LIST MONEY HOLDS, SINCE money-core 3.1.0, so a question an agent asks about a balance check, a category or
       a book is answered here too, and not only in Decide. */
    where: 'list is obligations or transactions or accounts or recurring or installments or balances or categories or books',
    /* THREE AT MOST, AND NO TILE A QUESTION SINCE money-core 3.11.0: four twelfths of the page hold a question and its
       answer on one line, and not its options laid out as a form. */
    limit: 3,
  },
];
