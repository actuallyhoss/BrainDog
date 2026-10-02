/**
 * What each version of a module this build ships changed, in the words a person reads on its detail page
 * (`apps/web/src/lib/market/listing.ts`).
 *
 * A MODULE HAS NO CATALOGUE FILE, so nothing publishes its `changes` line the way the Kennel publishes an add-on's. The
 * notes live here instead, newest first, one entry for each version a record could have been given. The long record of
 * why each step was taken, and why it was the size it was, stays beside `FIRST_PARTY_VERSIONS` in `packs/first-party.ts`;
 * these are the same steps said plainly, at most 500 characters each, as an add-on's `changes` is.
 *
 * THE NEWEST ENTRY IS THE VERSION THIS BUILD SHIPS. `test/pack-versions.test.ts` fingerprints the versions; a version
 * bumped there and not named here draws on the page with no notes, which says less than it should and nothing false.
 *
 * NOT UNDER `packs/`, because that folder holds only what a record is built from (`agents.ts`, `first-party.ts`), and
 * this is words for a screen (the directory test in `packs/rates-poll/rates-poll.test.ts`).
 */

import type { FirstPartyId } from './packs/first-party.ts';

export type ModuleChange = { version: string; notes: string };

export const MODULE_CHANGES: Readonly<Record<FirstPartyId | 'agents', readonly ModuleChange[]>> = {
  portfolio: [
    { version: '1.7.0', notes: 'Each project in play shows a small line of the work finished on it each week, when you use Work.' },
    {
      version: '1.5.0',
      notes:
        'A project page leads with the questions waiting on it, shows what changed, draws its plan on a time axis when its tasks have days and its money month by month. Every money figure is in your own currency, and its target is a setting.',
    },
  ],
  people: [
    {
      version: '2.4.0',
      notes:
        'Each person carries the last day they were in touch. People opens on one line of who you have been in touch with lately and who has gone quiet, draws it as a chart and lists everyone, the latest first.',
    },
    { version: '2.3.1', notes: 'People now links each person to the projects you met them in on a BrainDog set up before this fix.' },
    {
      version: '2.3.0',
      notes:
        'Meeting someone by email now happens on its own, the way it already does from a commit. What you were met about moves off their card, which was getting crowded, and onto its own note on their page.',
    },
    { version: '2.2.0', notes: 'One page per person: who they are, the projects you met them in and what is written about them. A person other rows still name cannot be deleted.' },
    { version: '2.1.0', notes: 'People is the list meetings write to, so a meeting finds the right person without the list having to be called People.' },
    { version: '2.0.0', notes: 'Role no longer offers registrar. A row that holds it keeps it as its own word.' },
  ],
  'money-core': [
    {
      version: '3.3.0',
      notes:
        'Money is calmer: one line of what your money is doing and how far cash moved on a month ago, cash by account, the month ahead as a calendar and what moved as a list. A balance older than a week is flagged, and questions show only when something is asked.',
    },
    {
      version: '3.1.0',
      notes:
        'Books keep money that is not one person\'s apart, each with its own page and its own cash walk. A late invoice you chase is marked chased, a repeating line that stopped is ended, and an account or book that rows point at cannot be deleted.',
    },
    {
      version: '3.0.0',
      notes:
        'One page called Money in place of Overview and Ledger. Cash now rolls forward from each account\'s newest balance, a new Balances list holds the checks it restarts from, and Obligations is called Bills and invoices. Card alert wordings moved to their own add-on.',
    },
  ],
  estate: [
    {
      version: '2.0.0',
      notes:
        'Services keeps subscriptions, memberships, insurance and utilities, opens with what it costs a month, asks before a renewal and marks a passed one lapsing. Every target is a setting with no default.',
    },
    { version: '1.3.0', notes: 'Services says who a row is with, where it said a registrar.' },
  ],
  work: [
    {
      version: '1.10.0',
      notes:
        'Work opens on one line of what is open, late and waiting on you, then the capture line. Late, Today, This week, With an agent, Waiting on you and Done recently each show only when they hold something, and what is further off is folded away. Late counts only your own tasks, as its list does. A project page shows what got done on it each week.',
    },
    { version: '1.9.1', notes: 'Tasks and threads now say which project they are for and who holds them on a BrainDog set up before this fix.' },
    {
      version: '1.9.0',
      notes:
        'Work leads with a line to capture what is on your mind, and your tasks and the Board sort by tier then due day. It adds a queue of what agents ask about tasks, a two-week timeline and a twelve-week heat of what got done, and a task can carry why it matters.',
    },
    { version: '1.8.0', notes: 'Finishing a task closes the steps still open under it, and a step added under a task starts in its project.' },
    { version: '1.7.0', notes: 'An update can be written by anybody, not only one of four agent vendors.' },
    { version: '1.6.0', notes: 'Work\'s own page lists tasks as checklists cut so that each task sits under exactly one: Today, This week, Waiting on you, With an agent, After this week, Later and No due day.' },
  ],
  agents: [{ version: '1.3.0', notes: 'The version this build ships.' }],
};
