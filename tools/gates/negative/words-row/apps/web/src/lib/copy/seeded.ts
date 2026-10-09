/* A row is how the database holds it: this comment says row and is not read. */
import { list } from './row.ts';

type Kind = 'row' | 'bill';

export const seeded = {
  'row': 'Bills',
  open: 'Open this row to change it',
  kind: (k: Kind) => (k === 'row' ? 'A bill' : 'A task'),
  joined: (xs: string[]) => xs.join(' row '),
  // a row in a line comment
  inRow: 'Three bills, side by side',
  more: list,
};
