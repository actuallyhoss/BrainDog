/** Snapshots: what the whole position was on a night. */

import type { MoneyRegister } from './shared.ts';

/**
 * WHAT THE WHOLE POSITION WAS ON A NIGHT. One row a night, four figures across it, so a person can
 * ask what things looked like on the 14th and get an answer rather than four charts to line up.
 *
 * `on` IS UNIQUE, which is the whole of the exactly-once rule: a job that runs twice writes one row,
 * and a second reading for a night already taken is refused by name rather than quietly doubling a line.
 */
export const SNAPSHOTS_REGISTER: MoneyRegister = {
  id: 'snapshots',
  name: 'Snapshots',
  icon: 'history',
  one: 'snapshot',
  holds: 'what the money was on a night, so a figure can be compared with the day it was true',
  /**
   * THE TITLE IS THE NIGHT IN WORDS, AND IT WAS `on`, WHICH NOTHING COULD FIND.
   *
   * Every other register here declares `search: true` on its title and this one declared it on no field
   * at all, so thirty rows sat in the record that no query could reach: `A REGISTER WHOSE TITLE IS NOT
   * SEARCHABLE HOLDS ROWS NOBODY CAN FIND BY NAME` names the rule and this register was the one breaking it.
   *
   * AND `on` CANNOT BE THE SEARCHABLE ONE, WHICH WAS MEASURED RATHER THAN ARGUED. Declaring
   * `search: true` on it turned `the projection is the kernel's, string for string` red at
   * `snapshots#1`: the kernel indexes the stored value, `2026-08-04`, and the screen shows
   * `4 Aug 2026`, so a person typing what they can see would have missed every row and a person
   * typing the ISO day would have hit rows the browser said were not there. That is the
   * browser-more-permissive-than-the-record split `find.ts` exists to end, so the answer is a text
   * field holding the night the way every surface in the product already prints it.
   */
  title: 'what',
  mobile: ['what', 'cash', 'net'],
  pack: 'money-core',
  /* KEPT BY THE NIGHT'S AUTOMATION, SINCE THE MERGE AFTER money-core 3.33.0: one row a night, written by the walk and read
     by Net worth and the charts, so it is never offered "a page for Snapshots this week" (recheck of 30 October). */
  kept_by: 'automations',
  fields: [
    /* THE NIGHT, SPELLED THE WAY A DAY IS SPELLED ON SCREEN. It repeats `on`, and the repetition is the
       point: `on` is the day the arithmetic sorts and filters by, and this is the one a person types. */
    /**
     * NOT REQUIRED, AND IT WAS, AND THAT STRANDED EVERY RECORD THAT ALREADY HELD A SNAPSHOT.
     *
     * Driven through `normalise`, `plan` and `install`: money-core 1.2.0, one night written, then
     * 1.3.0 →
     *
     *     REQUIRED_ON_POPULATED at register.snapshots.fields.what.required
     *     "register.snapshots.what is required and 1 rows were written before it. Ship a default
     *      or a fill rule."
     *
     * `declare`'s `unreadable` records a `required: true` with no `default` where the installed
     * body had neither, and `install` answers before anything is staged. So a person on 1.2.0
     * could not take the upgrade at all, and the sentence names a field they have never heard of.
     *
     * AND THE TWO REPAIRS THE SENTENCE OFFERS WERE BOTH MEASURED AND NEITHER IS REACHABLE HERE. A
     * `default` is one stored constant, so every night before the upgrade would be called the
     * same thing, which is worse than a night with no name. A FILL RULE DOES NOT CLEAR THE
     * REFUSAL: `unreadable` looks at `default` and nothing else, and a rule runs after an install
     * that never happens; even if it ran, the only template `fill` reaches is `{{on}}`, the
     * STORED day, so the old rows would read `2026-08-04` in a list whose new rows read
     * `4 Aug 2026`: one list, two spellings of one title. `derived: true` is the kernel's own
     * flag, set by nothing today, and it refuses every write, so the seed could not fill it.
     *
     * SO THE NIGHT IS NAMED BY WHOEVER WRITES IT, and every writer here does. `on` is required
     * and unique, so a row with no name is still exactly one night and still sorts and filters;
     * what it loses is being findable by name, which is what it had before 1.3.0 anyway.
     */
    { id: 'what', label: 'Night', type: 'text', search: true },
    { id: 'on', label: 'Date', type: 'day', unique: true, required: true },
    { id: 'cash', label: 'Cash', type: 'money', required: true },
    { id: 'owed_to_me', label: 'Receivables', type: 'money' },
    { id: 'owed_by_me', label: 'Payables', type: 'money' },
    /* CASH PLUS WHAT IS OWED TO YOU LESS WHAT YOU OWE. Stored rather than derived, because a snapshot
       is a reading and a reading recomputed later from rows that have changed is not one. CALLED WHAT IT IS SINCE
       money-core 3.32.0: it read "Net" at −£20,264 beside Money's net worth of −£27,764, which also counts what is held
       beyond the bank and owed over time (`worth` below), so one word named two figures (recheck of 30 October, N2). */
    { id: 'net', label: 'Cash after bills', type: 'money' },
    /**
     * NET WORTH ON THE NIGHT, SINCE money-core 3.31.0: what is held beyond the bank (the add-ons' holdings, property,
     * certificates and policy funds), what is owed over time (instalments left and debts), and net worth over all of
     * it, read through `held-beyond-cash`, `owed-over-time` and `net-worth`. Then net worth again in units that do not
     * move with the home currency: dollars, and grams of 24k gold at the rate in use that night. Not required: a night
     * that could not read them, or one taken before 3.31.0, leaves them empty (`worthOfNight` in the kernel).
     */
    { id: 'held', label: 'Held beyond cash', type: 'money' },
    { id: 'owed_later', label: 'Still to pay over time', type: 'money' },
    { id: 'worth', label: 'Net worth', type: 'money' },
    { id: 'worth_usd', label: 'Net worth in dollars', type: 'money' },
    { id: 'worth_gold', label: 'Net worth in grams of gold', type: 'decimal' },
    { id: 'taken', label: 'Taken', type: 'enum', values: ['nightly', 'typed'], default: 'nightly', index: true, required: true },
    { id: 'note', type: 'text' },
  ],
};
