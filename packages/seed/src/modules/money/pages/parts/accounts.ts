/** Accounts: Cash now cut into the accounts that hold it. */

export const ACCOUNTS_TILE: Record<string, unknown>[] = [
  {
    /* WHERE THE MONEY IS, SINCE money-core 3.3.0: Cash now cut into the accounts that hold it, each named as the
       record names it, one track whose parts add up to the headline (`cash-by-account`). Drawn on every record with
       an account, one book or several, because "which account is it in" is asked of three accounts as much as of two
       books. What each account last said and when is on its row, a tap away. */
    kind: 'split',
    heading: 'Accounts',
    icon: 'landmark',
    /* NO WIDTH OF ITS OWN, SINCE money-core 3.29.0, where it stood in a side column from 3.11.0: Money's home is one
       board of even pairs under the hero, and the app sets this beside the Ledger, or across the row alone. */
    source: 'metric.cash-by-account',
    /* EVERY ACCOUNT CASH NOW ADDS UP, SINCE money-core 3.24.0: the line says "7 accounts" and the tile stopped at six. */
    limit: 12,
    /* ONLY WHILE THERE IS CASH TO CUT, SINCE money-core 3.8.0. An account at nought, or overdrawn, cuts no length of
       a track, so a record whose every account was empty drew "Every part is zero" in a tile of its own. An account
       that does not count as cash was never a part; every account is on the accounts list. */
    when: { metric: 'cash-now', gt: 0 },
  },
];
