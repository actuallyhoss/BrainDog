/**
 * THE ONE SET OF WORDS FOR WHAT SOMEBODY MAY DO HERE (collab pass, 2 Nov).
 *
 * THREE VOCABULARIES MET ONE PERSON. The invite form said Owner, Admin, Member, Viewer and Adds only; a list's own level
 * said Decides, Edits, Adds only and Reads; the Share sheet said View, Comment, Edit and Manage; and none of the three
 * said what any word lets a person do. An owner inviting a contractor picked a word and learned what it meant from the
 * contractor. Now every place that gives access says it with these words, each with one line of what it lets them do
 * and one of what it does not, and Settings > Who can do what draws them side by side.
 *
 * THE WORDS ARE "CAN" PHRASES, so a role, a list's level and a share's rung read alike: "Mira can decide", "Sam can
 * edit tasks in Kiln". An Admin is still called one where a sentence needs a noun, and the record's refusals say Admin.
 *
 * WHAT IS SAID HERE IS WHAT THE RECORD DOES, and nothing here decides it: the ladder is `LEVEL_REACH` in
 * `packages/record/src/index.ts` and `DOES` in `../record/may.ts`; the owner-only doors are `admin` and `keychain`; an
 * Admin's limits are `teamKeeps`. A line that drifts from those is a line that lies, so each says only the broad fact.
 *
 * PLAIN TYPESCRIPT, no imports beyond types, so a test and the copy gates can load it in Node.
 */

import type { Level } from '../record/schema.ts';

export type RoleWords = {
  /** The role's name, as a picker and a row draw it. */
  name: string;
  /** What a sentence calls somebody holding it: "an Admin". */
  noun: string;
  /** One line: what they can do. */
  can: string;
  /** One line: what they cannot. */
  cant: string;
  /** The same, said to the person holding it, where `cant` speaks of them as "they". */
  cantYou?: string;
};

/** The five, highest first, as every picker lists them. */
export const ROLE_ORDER: readonly Level[] = ['owner', 'decide', 'write', 'append', 'read'];

export const ROLES: Readonly<Record<Level, RoleWords>> = {
  owner: {
    name: 'Owner',
    noun: 'an owner',
    can: 'Everything, including people, plugins, settings, Keys, export and deleting this BrainDog.',
    cant: 'Nothing is kept from an owner.',
  },
  decide: {
    name: 'Can decide',
    noun: 'an Admin',
    can: 'See and change everything, answer what needs a decision, and invite people.',
    cant: "Can't open Keys, change plugins or settings, export, or make an owner.",
  },
  write: {
    name: 'Can edit',
    noun: 'a member',
    can: 'See, add and change what is here, and comment.',
    cant: "Can't answer what needs a decision, invite anyone or open Keys.",
  },
  append: {
    name: 'Can add',
    noun: 'a contributor',
    can: 'Add new things and comment.',
    cant: "Can't see what is here, even what they added, unless you also let them view it.",
    cantYou: "Can't see what is here, even what you added, unless the owner also lets you view it.",
  },
  read: {
    name: 'Can view',
    noun: 'a viewer',
    can: 'See what you give them.',
    cant: "Can't change, add or delete anything.",
  },
};

/** A role's name, or the words for somebody who holds no role on the whole BrainDog. */
export const roleName = (level: string | null | undefined): string =>
  level !== null && level !== undefined && Object.hasOwn(ROLES, level) ? ROLES[level as Level].name : 'Some lists only';

/** One line for a role, said to the person giving it: "Can edit: see, add and change what is here, and comment." */
export const roleLine = (level: Level): string => `${ROLES[level].can} ${ROLES[level].cant}`;

/** A level on one list, as the per-list select says it: the same words, since a list's level does the same there. */
export const LIST_WORDS: Readonly<Record<'read' | 'append' | 'write', string>> = {
  read: ROLES.read.name,
  append: ROLES.append.name,
  write: ROLES.write.name,
};

/** A share's rung, said under the Share sheet's Can. */
export const RUNG_LINES: Readonly<Record<string, string>> = {
  view: 'They see it, and nothing they do changes it.',
  comment: 'They see it, and can comment or suggest a change for you to take.',
  edit: 'They see it, change it and add to it.',
  manage: 'They edit it, and can share it on with people already here.',
};

/**
 * WHAT EACH ROLE MAY DO, one row a thing, for Settings > Who can do what. `true` yes, `false` no, a string a yes with a
 * limit said in a word or two. The columns are `ROLE_ORDER`.
 */
export type MatrixRow = { thing: string; holds: Readonly<Record<Level, boolean | string>> };

export const MATRIX: readonly MatrixRow[] = [
  { thing: 'See what is here', holds: { owner: true, decide: true, write: true, append: false, read: true } },
  { thing: 'Add new things', holds: { owner: true, decide: true, write: true, append: true, read: false } },
  { thing: 'Change and delete things', holds: { owner: true, decide: true, write: true, append: false, read: false } },
  { thing: 'Comment and suggest changes', holds: { owner: true, decide: true, write: true, append: true, read: false } },
  { thing: 'Answer what needs a decision', holds: { owner: true, decide: true, write: false, append: false, read: false } },
  { thing: 'Invite people and change what they can do', holds: { owner: true, decide: 'Not owners', write: false, append: false, read: false } },
  { thing: 'Share a project or a list with someone', holds: { owner: true, decide: true, write: false, append: false, read: false } },
  { thing: 'Connect their own agents', holds: { owner: true, decide: 'Up to their role', write: 'Up to their role', append: 'Up to their role', read: 'Up to their role' } },
  { thing: 'Let their agents act without asking', holds: { owner: 'Their own agents', decide: false, write: false, append: false, read: false } },
  { thing: 'Plugins, settings and what runs on its own', holds: { owner: true, decide: false, write: false, append: false, read: false } },
  { thing: 'Keys', holds: { owner: true, decide: false, write: false, append: false, read: false } },
  { thing: 'Export, backups and deleting this BrainDog', holds: { owner: true, decide: false, write: false, append: false, read: false } },
  { thing: 'Make someone an owner, or hand ownership over', holds: { owner: true, decide: false, write: false, append: false, read: false } },
];

/** The share rungs, side by side, for the same page. */
export const RUNG_ORDER = ['view', 'comment', 'edit', 'manage'] as const;
export const RUNG_NAMES: Readonly<Record<(typeof RUNG_ORDER)[number], string>> = { view: 'View', comment: 'Comment', edit: 'Edit', manage: 'Manage' };
