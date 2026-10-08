/** Instalments: what is being paid off in parts. */

export const INSTALMENTS: Record<string, unknown>[] = [
  {
    /* WHAT IS BEING PAID IN PARTS, ONE TRACK A PLAN, SINCE money-core 3.2.0: the parts paid against every part of the
       plan, "3 of 8", read off the list's own status, where a part that is paid is done (`installments.done`). A
       plan is the parts that share its `plan`, so no plan is a row anybody has to keep in step with its parts. A
       cancelled part is out of both counts, as it is out of the walk, and money coming in by parts is not what this
       asks, so only what goes out is drawn. Only while something is left to pay in parts. */
    kind: 'progress',
    heading: 'Instalments',
    icon: 'credit-card',
    span: 12,
    source: 'register.installments',
    where: 'direction is out, state is not cancelled',
    columns: [{ field: 'plan' }, { field: 'state' }],
    limit: 6,
    when: { metric: 'installments-left', gt: 0 },
    empty: 'Nothing is being paid in parts.',
  },
];
