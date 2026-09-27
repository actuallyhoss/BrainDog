/**
 * People: clients, contractors and accountants, and where each one was met.
 *
 * One module of the sample record, split out of `index.ts` so each first-party module's registers, rows,
 * figures and pages sit in one file. `index.ts` composes them and keeps every export it had.
 */

import type { MeetsFields } from '@braindog/kernel';

import { gbp, type Fields, type SeedPage, type SeedRegister } from './base.ts';

/** People's one list, which also says it is the list `meet` writes. */
type PeopleRegister = SeedRegister & { meets: MeetsFields };

/* ── people ───────────────────────────────────────────────────────────────── */

export const PEOPLE: Fields[] = [
  { name: 'Halden Type Co', role: 'client', rate: null, email: 'ap@halden.example', note: 'Pays on 45 days, always' },
  { name: 'Ravensworth Ltd', role: 'client', rate: null, email: 'accounts@ravensworth.example', note: '' },
  { name: 'J. Okonkwo', role: 'contractor', rate: gbp(45_000), email: 'jo@okonkwo.example', note: 'Illustration, invoices monthly', handles: ['git:jokonkwo'], met: ['2026-08-20 · commit 3f2a91c in kiln-site'] },
  { name: 'Pell & Vine', role: 'accountant', rate: null, email: 'hello@pellvine.example', note: 'Year end is 31 March' },
  { name: 'Nordhaven Registry', role: 'other', rate: null, email: 'support@nordhaven.example', note: '' },
  { name: 'S. Marchetti', role: 'contractor', rate: gbp(62_000), email: 'sm@marchetti.example', note: 'Backend, two days a week', handles: ['git:smarchetti'], met: ['2026-08-27 · commit 8b1e4d0 in portage', '2026-09-02 · commit c47d19e in portage'] },
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
  /** Emerged from the data and NOT placed: it sits in the holding pen until a person moves it. The
      system never writes nav order after first install (06 §3, 29 §3). */
  people: {
    page: 'people',
    title: 'People',
    icon: 'people',
    requires: ['register.people'],
    origin: 'derived',
    placed: false,
    blocks: [
      {
        /* CARDS, with a face for each person, as the old tool draws people: a table of four columns read
           as a directory. Each card still opens the person's row. Where they were met and in which
           projects, because most people here arrive from an agent's commit rather than by hand, and
           the newest first, because the person met yesterday is the one somebody is asking about. */
        kind: 'cards',
        heading: 'Everyone',
        source: 'register.people',
        columns: [
          { field: 'name', label: 'Name', as: 'who' },
          { field: 'met', label: 'Met', as: 'fact' },
          { field: 'projects', label: 'Met in', as: 'fact' },
          { field: 'role', label: 'Role', as: 'fact' },
        ],
        order: [{ field: 'seq', dir: 'desc' }],
        empty: 'Nobody yet.',
      },
    ],
  },
};
