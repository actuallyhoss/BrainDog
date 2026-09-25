/**
 * The words the row page says when somebody adds a field to a list: the control, the kinds a field can be, and what
 * came of the press.
 *
 * A FILE OF ITS OWN AND NOT `copy.ts`, because every line here is about one affordance (`AddField.svelte`) and the
 * module that writes for it (`field-write.ts`), and the three move together. The rules are the house ones: no dashes
 * between clauses, and nothing that names a use case. A list somebody extends is theirs, so no sentence here knows
 * what the list holds; the one example is the placeholder, which a person types over.
 */

import type { Addable } from './field-write.ts';

/** What each kind of field is called where somebody picks one, in the order they are offered. */
export const KIND_WORDS: Readonly<Record<Addable, string>> = {
  text: 'Text',
  document: 'Long text',
  day: 'Date',
  int: 'Whole number',
  decimal: 'Number',
  bool: 'Yes or no',
  url: 'Web address',
  email: 'Email address',
};

export const fieldWords = {
  add: 'Add a field',
  label: 'Name',
  kind: 'Kind',
  /* AN EXAMPLE, which is the one place a word about somebody's own list may appear: it is gone the moment they type. */
  placeholder: 'Website',
  save: 'Add',
  saving: 'Adding',
  cancel: 'Cancel',
  /** The one line under the form saying who decides, so a member is not surprised to see it wait. */
  ownerNote: 'The field is added to every row at once.',
  memberNote: 'The owner is asked first, on Decide.',
  noName: 'Give the field a name.',
  badName: 'A name starts with a letter, like Website or Next review.',
  taken: (label: string, list: string) => `${list} already has a field called ${label}.`,
  changed: 'The list changed while this was being sent. Try again.',
  kindUnknown: 'Pick one of the kinds listed.',
  question: (label: string, list: string) => `Add a field called ${label} to ${list}?`,
  reason: 'Added by the owner from a row.',
  added: (label: string) => `${label} is on every row now.`,
  filed: (label: string) => `${label} is waiting on Decide for the owner.`,
} as const;
