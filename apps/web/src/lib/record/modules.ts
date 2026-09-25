/**
 * The modules this build ships, as a person knows them: a name, a line about what each is for, and the lists and pages
 * each one brings.
 *
 * THEY WERE THE FIRST SIX ROWS OF THE SAMPLE'S `PACKS`, and five screens read them from there: the `/packs` list and
 * a pack's own page for the name and the blurb, `/start` for which list a module opens on, Home's feed for "Added the
 * Money list", and a pack's diff for who owns a name already taken. Reading them meant importing the fixture, which
 * carried the sample's two made-up third-party add-ons and an `installed: true` on every row whatever the record held,
 * into every one of those screens (wave C1 of `loop/research-no-sample.md`). What is left here is only what this
 * build knows about its own modules; which of them a record holds is the record's answer (`packs.ts` `PackState`).
 *
 * THE VERSIONS ARE THE ONES THE SAMPLE CARRIED, and nothing on a live screen prints them: an update is offered from
 * the seed's own versions (`packs.ts` `moduleUpdates`), which is where a module's version is decided.
 */

import type { PackInfo } from './schema.ts';

export const MODULES: readonly PackInfo[] = [
  { id: 'money-core', name: 'Money', blurb: 'What you owe, what you are owed, and installments.', version: '1.4.0', registers: ['obligations'], pages: ['money'], author: 'braindog' },
  /* `Services`, AND THE PACK'S DISPLAY NAME WAS `Estate`. It was the fourth name for one area of the record, beside the
     first run's card, the rail's section heading and the register itself, and this is the copy of it a stranger reads
     on the trust screen before letting the file in. The pack id stays `estate`, which is the `pack:` key on the register
     and the page, and what `04 §3`'s format writes. */
  { id: 'estate', name: 'Services', blurb: 'Domains, hosting, subscriptions, renewals.', version: '1.2.1', registers: ['services'], pages: ['estate'], author: 'braindog' },
  { id: 'people', name: 'People', blurb: 'Collaborators, contractors, accountants.', version: '1.0.3', registers: ['people'], pages: [], author: 'braindog' },
  { id: 'work', name: 'Work', blurb: 'Tasks, tracks, dates.', version: '1.1.0', registers: ['tasks'], pages: ['work'], author: 'braindog' },
  { id: 'portfolio', name: 'Portfolio', blurb: 'The things you run, and the plan for each.', version: '1.0.0', registers: ['things'], pages: [], author: 'braindog' },
  { id: 'agents', name: 'Agents', blurb: 'What your agents learn, the skills they use, the keys they are handed and the tools they run, each for one project or for all.', version: '1.1.1', registers: ['learnings', 'skills', 'credentials', 'tools'], pages: ['agents'], author: 'braindog', titles: { learnings: 'Learnings', skills: 'Skills', credentials: 'Keys', tools: 'Tools', agents: 'Agents' } },
];

/** The module this build ships with `id`, or `undefined` for a use case's pack or anybody else's. */
export const moduleOf = (id: string): PackInfo | undefined => MODULES.find((m) => m.id === id);
