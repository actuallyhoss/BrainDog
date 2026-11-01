/** Payee names: what a bank writes, and the name a person reads for it. */

import type { MoneyRegister } from './shared.ts';

/**
 * A BANK'S WORDS AND THE NAME THEY STAND FOR, SINCE money-core 3.34.0 (next-money, M9): the Ledger said "GOOGLE
 * *WORKSPACE", "THE Fish Shack" and "IRS Usataxpymt", because a payee the bank shouted in mixed case is left as it is
 * (`plainName`), and no rule of spelling can say "Google Workspace" for "GOOGLE *WORKSPACE". A line here says it once:
 * every Ledger line whose bank words start with "GOOGLE *WORKSPACE" reads "Google Workspace", the lines already there and
 * every line that comes in after (`scripts/name-payees.js`).
 *
 * THE NAME GOES IN THE LINE'S OWN "Paid to or from" (`payee`), and only where nobody put one there or where it holds the
 * bank's own words, so a name typed by hand is never written over, and the bank's words stay in "As the bank wrote it".
 * Kept on the Payees page, where the names are read.
 */
export const PAYEE_NAMES_REGISTER: MoneyRegister = {
  id: 'payee_names',
  name: 'Payee names',
  icon: 'store',
  one: 'payee name',
  holds: 'the name to read for a payee the bank writes another way',
  title: 'name',
  mobile: ['name', 'match', 'note'],
  pack: 'money-core',
  fields: [
    /* THE NAME A PERSON READS, on the Ledger, Payees and every money list. */
    { id: 'name', label: 'Call it', type: 'text', required: true, search: true },
    /* HOW THE BANK STARTS ITS WORDS FOR THIS PAYEE, matched without regard to case, as a filing rule's "How it starts" is. */
    { id: 'match', label: 'When the bank writes', type: 'text', required: true, index: true, search: true },
    { id: 'note', type: 'text' },
  ],
};
