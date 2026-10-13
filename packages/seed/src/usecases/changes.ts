/**
 * What each version of a built-in use case changed, in the words a person reads where an update is offered
 * (`apps/web/src/lib/market/listing.ts`, the update sheet on Decide).
 *
 * THE SAME SHAPE AS `MODULE_CHANGES` in `../changelog.ts`: newest first, one entry for each version a record could have
 * been given, at most 500 characters each, as an add-on's `changes` is. The long record of why each step was taken and
 * why it was the size it was stays in the comment above each use case's `version`; these are the same steps said
 * plainly, with no ids in them.
 *
 * FROM THE VERSIONS ON `origin/master` ONWARD, since a record can hold nothing older than what was deployed when these
 * were first written. `test/usecase-changes.test.ts` holds every use case's current version to a note, so a version
 * raised without one fails rather than drawing an update that says nothing.
 */

export type UseCaseChange = { version: string; notes: string };

/** The notes a person reads on settings that name each list, said once for the four use cases that took it. */
const NAMED = (list: string): string =>
  `Settings say which list each name belongs to, such as "Name of the ${list} list", and the names of your lists come first.`;

export const USE_CASE_CHANGES: Readonly<Record<string, readonly UseCaseChange[]>> = {
  personal: [{ version: '2.3.1', notes: NAMED('Ledger') }],
  student: [{ version: '1.5.1', notes: NAMED('Courses') }],
  founder: [
    {
      version: '2.5.0',
      notes:
        'Numbers can hold money. A reading can carry an amount in its own currency where a plain value was required, and Latest numbers shows it beside Value. A project that reports a number is set up through the live feed add-on.',
    },
    {
      version: '2.4.0',
      notes:
        'Home says in one line how many agents are working now. Working now lists only the agents heard from in the last fifteen minutes, where it listed any run from today, even one quiet for hours.',
    },
  ],
  team: [
    {
      version: '2.20.0',
      notes: 'A project page says where the project stands from what happened on it this week until somebody says how it is going.',
    },
    {
      version: '2.19.0',
      notes:
        'Working now on Agent work lists only the runs heard from in the last fifteen minutes, with a helper folded under the run it helps, where it listed any run from today, even one quiet for hours.',
    },
  ],
  guide: [{ version: '1.6.1', notes: NAMED('Steps') }],
  shop: [
    {
      version: '1.1.0',
      notes: 'This week now starts today, and an order past its day is counted as late on its own. An order with a deposit stays in Owed to you, and the Orders line names whoever has owed longest.',
    },
    { version: '1.0.0', notes: 'The first version: Orders and Products, and an Orders page that says the month\'s orders, what ships this week and who still owes you.' },
  ],
  business: [
    {
      version: '1.7.0',
      notes:
        'Shop is a use case of its own now, with Orders and Products. Saying you run a shop or a store proposes Shop, and a business that also sells is still Small business, with Shop beside it.',
    },
    {
      version: '1.6.0',
      notes: 'Working now lists only the agents heard from in the last fifteen minutes, where it listed any run from today, even one quiet for hours.',
    },
  ],
};
