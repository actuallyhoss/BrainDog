/** Bills and invoices: a dated amount somebody is to pay or be paid. */

import { BOOK, type MoneyRegister } from './shared.ts';

export const OBLIGATIONS_REGISTER: MoneyRegister = {
  id: 'obligations',
  /**
   * `Bills and invoices`, SINCE money-core 3.0.0, AND IT WAS `Money`.
   *
   * MONEY IS THE MODULE AND ITS PAGE NOW, and this list is one part of it: a dated amount somebody is to pay or be
   * paid, once. What moved is `transactions`, what comes round is `recurring`, and what is held is `accounts`, so a
   * list called Money beside a page called Money named two things with one word.
   *
   * THE ID IS UNTOUCHED. `obligations` is what the URL says, what a predicate says, and what an
   * agent writes, and `19 §9`'s rule is the one Slack follows rather than the one Notion follows:
   * the interface says the word a person would say, for life, and the API keeps its own. Renaming
   * the id would be a migration; renaming the label is a label.
   */
  name: 'Bills and invoices',
  icon: 'obligation',
  /* `item`, because half of these are owed to you and half by you: `bill` is wrong for an invoice
     you sent and `invoice` is wrong for a tax payment. */
  one: 'item',
  holds: 'the bills you are to pay and the invoices you are to be paid, each with a day and a currency',
  title: 'what',
  /* THE DAY IT FALLS DUE, on the one screen that had no room for it. A card shows three
     declared fields, and a bill's card that leaves out its due day leaves out the one fact a person scanning a list of
     bills is looking for. Which way the money goes is the sign on the amount, which the card draws from the row. */
  mobile: ['what', 'amount', 'due'],
  state: 'state',
  done: ['paid', 'written_off'],
  /**
   * THE DAY A BILL WAS PAID IS WRITTEN BY THE RECORD WHEN IT IS MARKED PAID, SINCE money-core 3.0.0.
   *
   * `settled` was a field nothing wrote outside the sample's own rows, so every figure that asked when money was paid
   * (how late clients pay, what went out each month) read a day no live record held. `finished:` is the kernel's key
   * for exactly that (`packages/kernel/src/finished.ts`): it stamps the day a row enters a done state, keeps a day the
   * write names, and empties it when the row is reopened.
   */
  finished: 'settled',
  pack: 'money-core',
  fields: [
    { id: 'what', label: 'Description', type: 'text', required: true, search: true },
    /* `Who`, AND IT WAS `Party`. A column header is read at a glance by somebody scanning for a
       name, and `Party` is a legal word for the same thing that reads as a social event.
       A LINK AND NOT A DEPENDENCY, since money-core 3.0.0 (`LINKS` in `packs/first-party.ts`): on a record without
       People the field is left out and Money installs without it. */
    { id: 'party', label: 'Who', type: 'ref', to: 'people', index: true },
    /* MONEY IN AND MONEY OUT, and the ids stay: direction is a property of an amount, never the frame,
       and a person reads which way it goes rather than who owes whom. */
    {
      id: 'direction',
      label: 'Which way',
      type: 'enum',
      values: ['owed_by_me', 'owed_to_me'],
      labels: { owed_by_me: 'Money out', owed_to_me: 'Money in' },
      index: true,
      required: true,
    },
    { id: 'amount', type: 'money', required: true },
    { id: 'due', type: 'day', index: true, deadline: true, required: true, remind: ['-7d', '0d'] },
    /* `Status`, AND IT WAS `State`, here and on services, sessions, threads and tasks: `Status` is the word
       every product the reader has already used says. The field id stays `state`, which is what a predicate
       says, what `done:` lists and what `05 §254` makes a path a page can hold. `part` READS "Part paid",
       because a bill half paid is what the value means and "part" alone is half a phrase. */
    {
      id: 'state',
      label: 'Status',
      type: 'enum',
      values: ['open', 'part', 'paid', 'written_off'],
      labels: { open: 'Open', part: 'Part paid', paid: 'Paid', written_off: 'Written off' },
      index: true,
      required: true,
    },
    { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
    /* INDEXED, because a book's page filters its bills by it. */
    { ...BOOK, index: true },
    /* THE ACCOUNT A BILL IS PAID FROM, OR AN INVOICE INTO (REC-A09 step 1). Optional, as on an instalment: a bill nobody
       has put on an account holds none. It is what `bill-takes-book` reads, so a bill on Acme's account is in Acme's
       book by no hand. INDEXED, because the nightly count asks for the bills of one account, AND IT IS THE EIGHTH AND
       LAST INDEX THIS LIST MAY HOLD (`INDEX_CEILING`): the next field a page filters on wants one of these given up. */
    { id: 'account', type: 'ref', to: 'accounts', index: true },
    { id: 'note', type: 'text' },
    /**
     * WHAT IT IS FOR, so a page can say where the money goes. Indexed, because a page groups by it
     * and a list filters on it.
     *
     * THE NEUTRAL WORDS COME FIRST, SINCE money-core 3.0.0, because they are what anybody's bills are for: a
     * household's, a student's and a company's alike. The eleven that follow them were one design studio's cost lines,
     * and they stay values of the field, because a row that holds one keeps its word through an update
     * (`carried`) and an enum value taken away would leave that row holding a value its list no longer says.
     */
    {
      id: 'category',
      type: 'enum',
      values: [
        'home', 'food', 'transport', 'health', 'fun', 'pay', 'subscriptions', 'tax', 'other',
        'client_work', 'licensing', 'contractors', 'software', 'premises', 'professional', 'production', 'insurance', 'events',
      ],
      labels: {
        home: 'Home',
        food: 'Food',
        transport: 'Transport',
        health: 'Health',
        fun: 'Fun',
        pay: 'Pay',
        subscriptions: 'Subscriptions',
        tax: 'Tax',
        other: 'Other',
        client_work: 'Client work',
        licensing: 'Licensing',
        contractors: 'Contractors',
        software: 'Software',
        premises: 'Premises',
        professional: 'Professional fees',
        production: 'Production',
        insurance: 'Insurance',
        events: 'Events',
      },
      index: true,
    },
    /* THE DAY IT WAS PAID, which is not the day it was due. How late each client pays is the gap. The record writes
       it when the row is marked paid (`finished:` above). */
    { id: 'settled', label: 'Paid on', type: 'day' },
    /**
     * HOW MUCH OF IT IS PAID (REC-B11). "Part paid" was a status with no amount behind it. Money's `settle` script
     * writes the sum of the payments that name this bill in "Settles", in the bill's own currency, and marks it paid
     * when the sum reaches the amount. Empty on a bill no payment has been matched to. Not indexed: nothing filters on it.
     */
    { id: 'paid_so_far', label: 'Paid so far', type: 'money' },
    /**
     * THE DAY SOMEBODY DECIDED TO CHASE IT, SINCE money-core 3.1.0. Written by the record when "Chase it" is the
     * answer to `invoice-late` in Decide (`invoice-chased` in `MONEY_AUTOMATIONS`), so Money can say how long an
     * invoice has been chased rather than only that it is late. Empty on every row nobody chose to chase.
     */
    { id: 'chased', label: 'Chasing since', type: 'day' },
    /**
     * HOW OFTEN A BILL SAID IT CAME ROUND, KEPT ON ITS ROWS AND WALKED NO MORE, SINCE money-core 3.0.0.
     *
     * What repeats lives in `recurring`, and the cash walk reads it there at every cadence. A bill that also said
     * `repeats` was the same money twice: an import can write each repeating stream as a bill carrying
     * `repeats` and as a row of `recurring`, so a walk over both counted every
     * salary and every rent twice. So the walk takes a bill once, on its due day, when it does not repeat, and leaves
     * a repeating one to its row in `recurring`. The field stays, because rows hold it and an id is for ever.
     */
    { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'quarterly', 'yearly'] },
    /**
     * THE LAST DAY A REPEATING ROW MOVED MONEY ON, SINCE money-core 2.4.0. Kept, as `repeats` is, for the rows and the
     * import that write it; the walk reads the same field on `recurring`, where a repeating item keeps it.
     */
    { id: 'ends', label: 'Ends', type: 'day' },
  ],
};
