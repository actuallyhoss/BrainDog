/** Instalments: what is being paid off in parts. */

export const INSTALMENTS: Record<string, unknown>[] = [
  {
    /* WHAT IS BEING PAID IN PARTS, ONE TRACK A PLAN, SINCE money-core 3.2.0: the parts paid against every part of the
       plan, "3 of 8". A plan is the parts that share its `plan`, so no plan is a row anybody has to keep in step with
       its parts. Only while something is left to pay in parts.

       EACH PLAN READS ITS TWO COUNTS FROM THE FIGURES THE OWNER NAMED, the parts paid by plan and the
       parts in all by plan (`figures/plans.ts`), and no longer from a count of the list's rows a host made itself. So
       the tile and a plan's own page say one number from one sentence each: a cancelled part is in neither, as it is
       out of the walk, and money coming in by parts is not what this asks, so only what goes out is counted. A plan
       with nothing paid yet is in the second figure and not in the first, and reads nought of its parts.

       THE ORDER IS THE DRAWING'S: the first figure is what fills each track and the second is what it fills toward.

       THE THREE AFTER THEM SAY WHAT IS NEXT UNDER EACH BAR, "Next £1,875 on 3 Sep": the day of the earliest open part, what
       is left to pay and what is left once that part is paid, the amount being the second less the third. They fill and
       fill toward nothing, so a host that reads two cells draws the tracks as it did (`page-live.ts` `nextPart`).

       AND THE LAST, SINCE money-core 3.40.0 (1 Nov, M23): the day of the latest part still open, so each plan's one track
       says when it is paid off beside what is next ("Next $208 on 9 Dec, the last on 9 Aug 2027"). */
    kind: 'progress',
    heading: 'Instalments',
    icon: 'credit-card',
    /* NO WIDTH OF ITS OWN, SINCE money-core 3.29.0: half a row beside a neighbour, or the whole row alone. */
    cells: [
      { metric: 'installments-paid-by-plan', label: 'Paid' },
      { metric: 'installments-total-by-plan', label: 'Parts' },
      { metric: 'installments-next-due-by-plan', label: 'Next due' },
      { metric: 'installments-left-by-plan', label: 'Left' },
      { metric: 'installments-after-next-by-plan', label: 'Left after' },
      { metric: 'installments-last-due-by-plan', label: 'Last due' },
    ],
    when: { metric: 'installments-left', gt: 0 },
    empty: 'Nothing is being paid in parts.',
  },
];
