/** Rates: what one currency is worth in another, and on which day. */

import type { MoneyRegister } from './shared.ts';

/**
 * WHAT ONE CURRENCY IS WORTH IN ANOTHER, AND ON WHICH DAY (`08 §2.5`). Money in more than one currency is added up in the
 * record's home currency only when there is a rate for every other one, as of the day each amount is about; without one
 * a figure says one amount per currency and names the rate it lacks. A rate is typed in, written by an agent, or polled
 * from a public address (`ratesPollPack`). One `currency` is `rate` of `base`, and a row quoted the other way round is
 * read as its inverse.
 */
export const FX_REGISTER: MoneyRegister = {
  id: 'fx',
  name: 'Exchange rates',
  icon: 'money',
  one: 'rate',
  holds: 'what one currency is worth in another, and the day that was true',
  title: 'currency',
  mobile: ['currency', 'rate', 'as_of'],
  pack: 'money-core',
  /* THE LIST THE KERNEL CONVERTS BY, SAID BY THE LIST, SINCE money-core 3.0.0 (`packages/kernel/src/roles.ts`). Before
     it the kernel read the rates off whatever list was called `fx`, by four fixed field names, and a record reaches
     that reading now only until its next update. */
  rates: { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' },
  fields: [
    { id: 'currency', type: 'text', required: true, index: true, search: true },
    { id: 'base', label: 'Base currency', type: 'text', required: true, index: true },
    { id: 'rate', type: 'decimal', required: true },
    { id: 'as_of', label: 'As of', type: 'day', index: true, required: true },
    { id: 'source', type: 'text' },
  ],
};
