/** Being chased: invoices somebody chose to chase. */

import { OPEN } from '../../../base.ts';

export const CHASING: Record<string, unknown>[] = [
  {
    /* WHAT SOMEBODY CHOSE TO CHASE, AND SINCE WHEN, from the answer in Decide (`invoice-chased`), oldest first. Only
       while something is being chased: a table that is empty on nearly every record is noise on the one page
       everybody reads. */
    kind: 'table',
    heading: 'Being chased',
    icon: 'bell',
    span: 12,
    source: 'register.obligations',
    where: `${OPEN}, direction is owed to me, chased is set`,
    columns: [
      { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
      { field: 'party', label: 'Who', width: 'minmax(10ch,18ch)' },
      { field: 'amount', label: 'Amount', width: '15ch', align: 'end' },
      { field: 'chased', label: 'Chasing since', width: '15ch', align: 'end' },
    ],
    order: [{ field: 'chased', dir: 'asc' }],
    limit: 6,
    when: { metric: 'chasing', gt: 0 },
    empty: 'Nothing is being chased.',
  },
];
