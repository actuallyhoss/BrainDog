/** Add an account, on a record that holds none yet. */

import { NOTHING_TOLD } from './told.ts';

export const ADD_ACCOUNT: Record<string, unknown>[] = [
  {
    /* THE FIRST BALANCE IS ADDED HERE, IN THE WALK'S PLACE, while there is none: the first thing a fresh record does,
       and every figure on this page reads from it. Cash ahead takes this row once there is cash to walk from, and an
       account after the first is added from the list. */
    kind: 'capture',
    heading: 'Add an account',
    icon: 'plus',
    span: 12,
    register: 'accounts',
    /* NOT OVER WHAT WAS TOLD (AM3): there, the line above the lists says to add an account, and links to it. */
    when: { all: [{ metric: 'cash-accounts', lt: 1 }, ...NOTHING_TOLD] },
  },
];
