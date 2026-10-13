/** Instalments: what is being paid off in parts. */

export const INSTALMENTS: Record<string, unknown>[] = [
  {
    /* WHAT IS BEING PAID IN PARTS, ONE TRACK A PLAN, SINCE money-core 3.2.0: the parts paid against every part of the
       plan, "3 of 8". A plan is the parts that share its `plan`, so no plan is a row anybody has to keep in step with
       its parts. Only while something is left to pay in parts.

       EACH PLAN READS ITS TWO COUNTS FROM THE FIGURES THE OWNER NAMED (REC-B12 job 5), the parts paid by plan and the
       parts in all by plan (`figures/plans.ts`), and no longer from a count of the list's rows a host made itself. So
       the tile and a plan's own page say one number from one sentence each: a cancelled part is in neither, as it is
       out of the walk, and money coming in by parts is not what this asks, so only what goes out is counted. A plan
       with nothing paid yet is in the second figure and not in the first, and reads nought of its parts.

       THE ORDER IS THE DRAWING'S: the first figure is what fills each track and the second is what it fills toward. */
    kind: 'progress',
    heading: 'Instalments',
    icon: 'credit-card',
    span: 12,
    cells: [
      { metric: 'installments-paid-by-plan', label: 'Paid' },
      { metric: 'installments-total-by-plan', label: 'Parts' },
    ],
    when: { metric: 'installments-left', gt: 0 },
    empty: 'Nothing is being paid in parts.',
  },
];
