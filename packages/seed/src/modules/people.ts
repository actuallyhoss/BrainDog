/**
 * People: clients, contractors and accountants, and where each one was met.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 *
 * A MODULE NOTHING ELSE NEEDS. Money says who a bill or a payment is with through a link, and Work says who holds a task
 * the same way (`LINKS` in `packs/first-party.ts`), so both install and draw on a record with People off. People in turn
 * reads none of their lists: a page of People's that drew one would be refused at install on every record that lacks it,
 * which is every record People reaches before Money or Work (`PEOPLE_PAGES.someone` says why).
 */

import type { MeetsFields } from '@braindog/kernel';

import { gbp, type Fields, type SeedPage, type SeedRegister } from './base.ts';

/**
 * People's one list, which also says it is the list `meet` writes, and keeps a person other rows still name.
 *
 * `delete` IS TYPED HERE AND NOT ON `SeedRegister`, because this is the one list in this file that declares it, and the
 * kernel's own list of the values it takes (`DELETE_RULES` in `packages/kernel/src/referenced.ts`) has this one member.
 */
type PeopleRegister = SeedRegister & { meets: MeetsFields; delete: 'refuse_while_referenced' };

/* ── people ───────────────────────────────────────────────────────────────── */

export const PEOPLE: Fields[] = [
  { name: 'Halden Type Co', role: 'client', rate: null, email: 'ap@halden.example', note: 'Pays on 45 days, always' },
  { name: 'Ravensworth Ltd', role: 'client', rate: null, email: 'accounts@ravensworth.example', note: '' },
  { name: 'J. Okonkwo', role: 'contractor', rate: gbp(45_000), email: 'jo@okonkwo.example', note: 'Illustration, invoices monthly', handles: ['git:jokonkwo'], met: ['2026-08-20 · commit 3f2a91c in kiln-site'] },
  { name: 'Pell & Vine', role: 'accountant', rate: null, email: 'hello@pellvine.example', note: 'Year end is 31 March' },
  { name: 'Nordhaven Registry', role: 'other', rate: null, email: 'support@nordhaven.example', note: '' },
  { name: 'S. Marchetti', role: 'contractor', rate: gbp(62_000), email: 'sm@marchetti.example', note: 'Backend, two days a week', handles: ['git:smarchetti'], met: ['2026-08-27 · commit 8b1e4d0 in portage', '2026-09-02 · commit c47d19e in portage'] },
];

/**
 * PEOPLE'S ONE RULE, ON BY DEFAULT SINCE People 2.3.0: an agent's `meet` already writes a dated `met` line for a
 * commit, and this is the same write for a mail sender, so a record with an inbox reads who wrote in the way it reads
 * who committed. `{{trigger.body.from}}` and `{{trigger.body.subject}}` are the arrival's own words, as an ingest's
 * `where:` reads them elsewhere in this seed; a channel with neither fills nothing, `meet` skips the step and the run
 * goes on rather than meeting nobody under a blank name (`people.ts`'s `normalise`, `07 §4`).
 *
 * NOT AN INVOICE PARTY'S RULE, WHICH THIS UNIT ALSO ASKED FOR. No first-party ingest writes `register.obligations`
 * or `register.transactions` from a matched arrival yet, so `on: { arrival: { state: ['matched'] } }` would fire on
 * any matched arrival at all, of any pack's own ingests; and the one field named `party` on those two lists is
 * `type: 'ref'`, an id `meet`'s `name` would write into a person's name rather than a word anybody typed. Left for
 * whichever unit lands that ingest, to name the raw field it actually extracts.
 */
export const PEOPLE_AUTOMATIONS: Record<string, unknown>[] = [
  {
    rule: 'meet-senders',
    name: 'Meet whoever writes in',
    pack: 'people',
    on: { arrival: { channel: 'email' } },
    steps: [{ meet: { email: '{{trigger.body.from}}', where: 'mail: {{trigger.body.subject}}' } }],
  },
];

export const PEOPLE_REGISTERS: Record<string, PeopleRegister> = {
  people: {
    id: 'people',
    name: 'People',
    icon: 'people',
    one: 'person',
    holds: 'collaborators, contractors and accountants, and what each one is for',
    title: 'name',
    mobile: ['name', 'role', 'rate'],
    pack: 'people',
    /* THE LIST `meet` WRITES, SAID BY THE LIST, since People 2.1.0. Before it the kernel found this list by its id,
       `people`, and each part by a field of the same name (`LEGACY` in `packages/kernel/src/roles.ts`), which is the
       kernel knowing a pack's list by name. Declared, the kernel reads the role off this key, checks every part at
       install, and falls back on the name only for a record still on People 2.0.0 or earlier, until its next update.
       `projects` is the one part that goes when the record holds no Projects: `packs/first-party.ts` drops it with the
       `projects` field it names, so a student's People still installs and `meet` records a person and links nobody. */
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into' },
    /* A CLIENT WITH BILLS AGAINST THEIR NAME IS NOT DELETED OUT FROM UNDER THEM, since People 2.2.0. A payment's or a
       bill's `party` and a task's `owner` point here, and deleting the person they name left each one pointing at a row
       nobody could open, so the money and the work belonged to nobody. The write path now refuses that delete and says
       which lists still name the person and how many rows (`referencedBy`, `packages/kernel/src/referenced.ts`), so they
       can be pointed elsewhere first. A person folded into another by a merge goes as before when nothing names them;
       when something does, accepting the merge is refused with the same sentence, which is the stranding this stops. */
    delete: 'refuse_while_referenced',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      /* Optional, because a person an agent meets in a commit has no role until somebody gives one.
         NO `registrar`, AND THERE WAS ONE until People 2.0.0: a role only a studio that holds domains has, shipped to every
         record, and the Personal use case had to relabel it Agency before a household could read it. A record whose rows
         hold it keeps it as its own word when it updates, because the plan lays back a value a row was written under
         (`test/lists-opened.test.ts` drives one), and a record that never used it is no longer offered it. */
      { id: 'role', type: 'enum', values: ['client', 'contractor', 'accountant', 'collaborator', 'other'], index: true },
      { id: 'rate', type: 'money' },
      /* Unique, because an email is how a person met twice is known to be one person. */
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'note', type: 'text' },
      /* Not `search: true` yet: the search box asks every searchable field `matches`, and the kernel
         refuses that on a list, so People could not be searched at all. */
      { id: 'handles', label: 'Handles', type: 'list', of: 'text' },
      /* A token may add a project here and never remove one. */
      { id: 'projects', label: 'Met in', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      /* Where and when each meeting happened, one dated line each, newest last. */
      { id: 'met', label: 'Met', type: 'list', of: 'text' },
      { id: 'merged_into', label: 'Merged into', type: 'ref', to: 'people' },
    ],
  },
};

export const PEOPLE_PAGES: Record<string, SeedPage> = {
  /** Placed under its own section, since People 2.2.0: it waited off the rail, in the holding pen, until somebody moved it. */
  people: {
    page: 'people',
    title: 'People',
    nav: { section: 'People', order: 10 },
    icon: 'people',
    requires: ['register.people'],
    blocks: [
      {
        /* CARDS, with a face for each person, as the old tool draws people: a table of four columns read
           as a directory. Each card still opens the person's row. Their role, and the projects they were
           met in, because most people here arrive from an agent's commit rather than by hand, and the
           newest first, because the person met yesterday is the one somebody is asking about.

           NOT THE `met` LINES, which the card drew whole: "2026-08-27 · commit 8b1e4d0 in portage" is where an
           agent was when it met them, in the agent's words, and a card is read by a person. The lines stay on
           the row, where the history of a person is read. */
        kind: 'cards',
        heading: 'Everyone',
        source: 'register.people',
        columns: [
          { field: 'name', label: 'Name', as: 'who' },
          { field: 'role', label: 'Role', as: 'fact' },
          { field: 'projects', label: 'Met in', as: 'fact' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        empty: 'Nobody yet.',
      },
    ],
  },

  /**
   * ONE PAGE PER PERSON, since People 2.2.0: who they are, the projects they were met in, and what is written about them.
   * Only what the rows say: nothing here works out anything about a person that nobody wrote down.
   *
   * NOT THE MONEY OR THE WORK BETWEEN YOU, WHICH THE BRIEF ASKS FOR, because a block of People's over `transactions`,
   * `obligations` or `tasks` makes People lean on those lists: `@braindog/declare` counts every block's `source` a page
   * reads (`pointsAt` in `packages/declare/src/index.ts`) and refuses the install `REGISTER_UNRESOLVED` while the list is
   * not held. A record is made with People before Money and Work (`MODULE_ORDER` in `usecases/index.ts`), and a student's
   * or a team's has no Money at all, so such a block would refuse People on nearly every record, whatever `when:` it
   * carried, since the install reads no `when:`. Those blocks wait for the document to leave out a block over a list the
   * record will not hold, as it leaves out a walk's leg (`firstPartyDocument` in `packs/first-party.ts`).
   *
   * NO `nav`, because a rail with a line for every client and contractor is a rail nobody reads.
   *
   * CALLED `someone` AND NOT `person`, BECAUSE THE NAME DECIDES WHO KEEPS A SHARED ADDRESS. A template's pages claim
   * their addresses after every page somebody wrote, and among templates in the order of their ids (`resolvePages` in
   * `packages/kernel/src/pages.ts`). `person` sorts before `project`, so a client called what a project is called
   * would have taken the project's `/p/` address and moved the project's to a numbered one. `someone` sorts after
   * `project`, `organisation`, `milestone` and `skill`, so a person is the one that gives way.
   *
   * BY NAME, AS A PROJECT'S PAGE IS (`name is {{name}}`), so of two people of one name the card draws one, which `meet`
   * asks the owner to merge when it sees them.
   */
  someone: {
    page: 'someone',
    title: '{{name}}',
    for: { register: 'people' },
    icon: 'people',
    pack: 'people',
    requires: ['register.people'],
    blocks: [
      {
        kind: 'cards',
        span: 12,
        source: 'register.people',
        where: 'name is {{name}}',
        columns: [
          { field: 'name', label: 'Name', as: 'who' },
          { field: 'role', label: 'Role', as: 'fact' },
          { field: 'projects', label: 'Met in', as: 'fact' },
          { field: 'email', label: 'Email', as: 'fact' },
        ],
        limit: 1,
        empty: 'Nothing is kept about {{name}} yet.',
      },
      {
        /* THE MET LINES THE CARDS LEAVE OUT, since this is the one page about one person and not a list of everyone
           (`someone` above the fold says why `page.people`'s cards do not draw them; a card also takes at most three
           facts, and `role`, `projects` and `email` already fill that). Each dated line reads as `meet` wrote it,
           "2026-08-27 · commit 8b1e4d0 in portage" or, since People 2.3.0, "2026-09-28 · mail: Renewal quote" for a
           person `rule.meet-senders` met. NOT `document: true`: that reads one text field as a document body, and
           `met` is a list, one line per meeting. */
        kind: 'note',
        heading: 'Met',
        span: 12,
        body: '{{met}}',
        empty: 'Nothing is kept about how {{name}} was met yet.',
      },
      {
        /* A DOCUMENT, AS A PROJECT'S NOTES ARE, because a person `meet` recorded has no `note` at all, so the body stays
           `{{note}}`, and a sample client's is empty. A document note reads a body that is empty or still its
           placeholder as nothing written and draws nothing, so the `empty:` below is what the page says
           (`drawSegments` in `apps/web/src/lib/record/blocks.ts`). */
        kind: 'note',
        document: true,
        heading: 'Notes',
        span: 12,
        body: '{{note}}',
        empty: 'Nothing is written about {{name}} yet.',
      },
    ],
  },
};
