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
    {
      version: '1.14.0',
      notes: 'A project keeps the domains it lives at, so mail and renewals about one are read as about the project. Repositories take a remote as git prints it.',
    },
    {
      version: '1.13.0',
      notes:
        'Projects says in its first line when nothing is in play and how to start, and no part of the page says it is empty. Parked and finished counts what is folded under it without loading every project.',
    },
    {
      version: '1.12.0',
      notes:
        'Projects opens on which projects need a push and which are on track, by name. The cards drop their Health and How far along labels, and the bar of how they are going shows once more than four are in play. A project page opens on its next step, leads Where it stands with how it is going, and lists what is handed back as a to-do.',
    },
    {
      version: '1.11.0',
      notes: 'Projects says each thing once: the line, one track of how the projects in play are going, and the projects themselves. The Needs you table is gone, since every card says its health and next step.',
    },
    {
      version: '1.10.0',
      notes:
        'Projects opens on how many are in play and how many are at risk, with where they are and how they are going side by side under it. A project page keeps where it stands and what is handed back in a column beside its chart, and lists its open work once, on the plan.',
    },
    {
      version: '1.9.0',
      notes:
        'The page is called Projects, as the top bar calls it. Right now sits beside where the projects are and how they are going, and statuses read Earning, Building, Parked and Finished. A project page opens on one line: the work handed back for you to check, or else its next step.',
    },
    {
      version: '1.8.0',
      notes:
        'The Overview is calmer: one line of what needs you, where the projects are and how they are going, then the projects in play, with what each earns, what agents hold and what is coming up folded away. A project page shows six things and folds its history, money and what it runs on.',
    },
    { version: '1.7.0', notes: 'Each project in play shows a small line of the work finished on it each week, when you use Work.' },
    {
      version: '1.5.0',
      notes:
        'A project page leads with the questions waiting on it, shows what changed, draws its plan on a time axis when its tasks have days and its money month by month. Every money figure is in your own currency, and its target is a setting.',
    },
  ],
  people: [
    {
      version: '3.0.0',
      notes:
        'Organisations live here now, each with a page of its people, projects and money. People are grouped by the organisation they are with. A person keeps every address and handle they are known by and where they were seen. Mail a pattern reads meets the company behind it, unless it came from a free mail service; other mail only notes who wrote, so a stranger never becomes a contact. The payee on a bank text is one shop however the bank spells it.',
    },
    { version: '2.7.0', notes: 'People opens on who has gone quiet and since when, by name, and otherwise on who you have been in touch with lately.' },
    { version: '2.6.0', notes: 'Nothing changes on screen: In touch, 12 weeks is written the way the app now reads it.' },
    { version: '2.5.0', notes: 'In touch, 12 weeks names each person beside the weeks they were in touch, the latest first.' },
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
      version: '3.12.0',
      notes: 'Runs out names the day your money runs out, with the days left under it, where it showed only a count of days.',
    },
    {
      version: '3.11.0',
      notes:
        'Money opens on Cash ahead, with when your money runs out, your accounts and any questions in a column beside it. What is coming up is open under it, and what already moved is folded under History.',
    },
    {
      version: '3.10.0',
      notes:
        'A payment says which organisation it was with, a shop, a supplier or a client, where it could only name a person, and keeps the payee as the bank wrote it, so the same shop is known however it is spelled. Cash ahead offers five years and To the end again, worked out when you pick them, so Money still opens fast.',
    },
    {
      version: '3.9.0',
      notes: 'Cash ahead goes as far as two years, so Money opens faster. Five years and To the end are no longer offered.',
    },
    {
      version: '3.8.0',
      notes: "Accounts shows only when there is cash to split, and a book's Where this month's money went only when something left the book this month.",
    },
    {
      version: '3.7.0',
      notes: 'Cash ahead opens on the next three months. Six months, a year and two years are still a press away.',
    },
    {
      version: '3.6.0',
      notes: 'Cash ahead no longer says again when the money runs out, since the line at the top does. The flag on the day stays.',
    },
    {
      version: '3.5.0',
      notes: 'An old balance, money late coming in and money late going out are one Heads up under your accounts, each line there only while it is true.',
    },
    {
      version: '3.4.0',
      notes:
        'Money is calmer: the line at the top says your cash and how long it lasts, with no tile repeating it, the month is drawn once as a chart, and everything after Accounts is folded away until you open it.',
    },
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
      version: '2.1.0',
      notes:
        'Services is calmer: a new record reads one note of what belongs here, each part shows only when it has something, and what each domain points at and every service are folded away until you open them.',
    },
    {
      version: '2.0.0',
      notes:
        'Services keeps subscriptions, memberships, insurance and utilities, opens with what it costs a month, asks before a renewal and marks a passed one lapsing. Every target is a setting with no default.',
    },
    { version: '1.3.0', notes: 'Services says who a row is with, where it said a registrar.' },
  ],
  work: [
    {
      version: '1.15.0',
      notes:
        'Work opens on how many tasks are late and how many wait on you. Late runs the whole width, a strip shows what is open, due and done this week, and This week, With an agent and Waiting on you sit side by side. Today is the top of This week.',
    },
    {
      version: '1.14.0',
      notes: 'An empty Work page says Nothing is open right now, under the line to capture a task, instead of a tile for every band saying it is empty.',
    },
    {
      version: '1.13.0',
      notes: 'Work opens on the task that has been late longest, by name, and how many more are late with it.',
    },
    {
      version: '1.12.0',
      notes: 'Today runs the whole width, with what is late and what is due this week side by side under it.',
    },
    {
      version: '1.11.0',
      notes: 'Work shows what is still to do, folds what is further off and what was done, and has a strip of your projects to look at one at a time.',
    },
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
  agents: [
    {
      version: '1.8.0',
      notes:
        'Agents opens on Today: the last 24 hours as one lane for each run, from when it started to when it was last heard from, with the runs still working in colour. It shows while a run was heard from today.',
    },
    { version: '1.7.0', notes: 'A run has a page of its own, named by what it was doing, with what it did and Undo this run.' },
    {
      version: '1.6.0',
      notes: 'Agents groups the runs: what a run asked you first, then the runs working, the ones that stopped today and the ones from earlier, each with the next step it left. A run opens beside the page.',
    },
    {
      version: '1.5.0',
      notes: 'Agents shows the runs: who is working now, where the stopped runs left off and what they added. A run quiet since yesterday is no longer listed as working. Questions are on Decide, and lessons and skills on their own pages.',
    },
    {
      version: '1.4.0',
      notes: 'Agents opens on one line of who is working and what waits on you, shows where runs left off, and folds how the brain grew, its lessons and its skills until you open them.',
    },
    { version: '1.3.0', notes: 'The version this build ships.' },
  ],
};
