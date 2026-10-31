/**
 * WHAT WAS TOLD TO MONEY BEFORE THERE IS AN ACCOUNT (audit 31 Oct m, AM3): "Stripe paid out 1,950 USD today"
 * was kept as a paid payout in Bills and invoices, "Rent 12,000 due on the 1st every month" as a line in Repeating, and
 * Money's home said "Nothing here yet. Add an account to start." over both, since every tile of it waits for an account
 * (`cash-accounts`) and the walk and its lists have nothing to walk from. Now, while there is no account, it lists what
 * was told, each line signed by the way it goes, under one line that says what an account adds. Once there is one, Coming
 * up, the Ledger and the walk take their place, and these are not drawn.
 */

const NO_ACCOUNT = { metric: 'cash-accounts', lt: 1 };

/** Whether anything was told: a bill or an invoice kept, or a line that repeats. */
export const NOTHING_TOLD = [{ metric: 'bills-held', lt: 1 }, { metric: 'repeating-held', lt: 1 }];

export const TOLD: Record<string, unknown>[] = [
  {
    /* THE PAGE'S LINE WHILE MONEY IS TOLD AND NOTHING HOLDS IT: what an account adds, not "Nothing here yet". */
    kind: 'note',
    lead: true,
    span: 12,
    when: { all: [NO_ACCOUNT, { any: [{ metric: 'bills-held', gt: 0 }, { metric: 'repeating-held', gt: 0 }] }] },
    body: '[Add an account](/r/accounts?new=1) to see what you have.',
  },
  {
    kind: 'timeline',
    heading: 'Bills and invoices',
    icon: 'receipt',
    source: 'register.obligations',
    where: 'state is open or part or paid',
    columns: [{ field: 'due' }, { field: 'what' }, { field: 'amount', sign: { field: 'direction', minus: 'owed_by_me' } }],
    order: [{ field: 'due', dir: 'desc' }],
    limit: 6,
    when: { all: [NO_ACCOUNT, { metric: 'bills-held', gt: 0 }] },
  },
  {
    kind: 'timeline',
    heading: 'Repeating',
    icon: 'refresh',
    source: 'register.recurring',
    where: 'state is live',
    columns: [{ field: 'next_due' }, { field: 'what' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
    order: [{ field: 'next_due', dir: 'asc' }],
    limit: 6,
    when: { all: [NO_ACCOUNT, { metric: 'repeating-held', gt: 0 }] },
  },
];
