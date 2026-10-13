/** Plans: something paid in parts, as one thing with a name. */

import type { MoneyRegister } from './shared.ts';

/**
 * SOMETHING PAID IN PARTS, AS ONE THING, SINCE REC-B12: a flat, a car, a desk. One row a plan, and every part of it
 * on Instalments links here (`plan_row`), so a plan has a page of its own and a part can say which plan it is part of.
 *
 * NO AMOUNT, because the total is the sum of the parts and a figure kept here could disagree with them. What is paid,
 * what is left and the day of the last part are counted from the parts each time they are read.
 *
 * THE NAME IS THE TEXT ITS PARTS ALREADY SHARE (`plan` on Instalments), which stays as the name Cash ahead groups by.
 * Money's `plans_from_names` script makes one row here for each distinct text and links the parts, so a record that
 * held plans only as names holds them as rows after its first run, and nobody types a plan twice.
 */
export const PLANS_REGISTER: MoneyRegister = {
  id: 'plans',
  name: 'Plans',
  icon: 'calendar',
  one: 'plan',
  holds: 'the things you pay for in parts, such as a flat or a car, each with its parts on Instalments',
  title: 'name',
  mobile: ['name', 'state', 'party'],
  state: 'state',
  done: ['paid', 'cancelled'],
  /* A PLAN ITS PARTS POINT AT IS NOT DELETED OUT FROM UNDER THEM, as a book is not: each part would be left part of
     a plan that is no longer there, and drawn on no plan's page. */
  delete: 'refuse_while_referenced',
  pack: 'money-core',
  fields: [
    /* UNIQUE, because a plan's page is found by its name and its parts are matched to it by that name. */
    { id: 'name', type: 'text', required: true, unique: true, search: true },
    { id: 'party', label: 'Who', type: 'ref', to: 'people' },
    { id: 'account', type: 'ref', to: 'accounts' },
    { id: 'note', type: 'text' },
    /* PAID IS WRITTEN BY THE SCRIPT once no part is open, and open again when one is. Cancelled is a person's word,
       and the script never takes it back. */
    { id: 'state', label: 'Status', type: 'enum', values: ['open', 'paid', 'cancelled'], default: 'open', index: true, required: true },
  ],
};
