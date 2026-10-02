/**
 * The words the row page says when somebody adds a field to a list: the control, the kinds a field can be, and what
 * came of the press.
 *
 * A FILE OF ITS OWN AND NOT `copy.ts`, because every line here is about one affordance (`AddField.svelte`) and the
 * module that writes for it (`field-write.ts`), and the three move together. The Fields sheet (`ListEditor.svelte`) is
 * the same affordance grown to every kind, so its words are here too. The rules are the house ones: no dashes
 * between clauses, and nothing that names a use case. A list somebody extends is theirs, so no sentence here knows
 * what the list holds; the one example is the placeholder, which a person types over.
 */

import type { Addable, DurationUnit, SheetKind } from './field-write.ts';

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
  ownerNote: 'Everything here gets it at once.',
  memberNote: 'The owner is asked first, on Decide.',
  noName: 'Give the field a name.',
  badName: 'A name starts with a letter, like Website or Next review.',
  taken: (label: string, list: string) => `${list} already has a field called ${label}.`,
  changed: 'Something here changed while this was being sent. Try again.',
  kindUnknown: 'Pick one of the kinds listed.',
  question: (label: string, list: string) => `Add a field called ${label} to ${list}?`,
  reason: 'Added by the owner.',
  added: (label: string) => `Everything here has ${label} now.`,
  filed: (label: string) => `${label} is waiting on Decide for the owner.`,
  reserved: (label: string) => `${label} is a name the record keeps for itself. Pick another.`,
} as const;

/**
 * What each kind is called in the Fields sheet, where every kind a list can hold is offered, in the order it is offered.
 *
 * A WIDER SET THAN `KIND_WORDS`, because the sheet asks the one more thing some kinds need (the choices of a choice,
 * what a link points at, the unit a duration is said in), and the one-line form on a row page asks nothing more.
 */
export const SHEET_KIND_WORDS: Readonly<Record<SheetKind, string>> = {
  text: 'Text',
  document: 'Long text',
  enum: 'Choice',
  ref: 'Link to something else',
  money: 'Money',
  tags: 'Tags',
  int: 'Whole number',
  decimal: 'Number',
  quantity: 'Quantity',
  duration: 'Duration',
  day: 'Date',
  instant: 'Day and time',
  bool: 'Yes or no',
  url: 'Web address',
  email: 'Email address',
};

/** How a duration may be said, and the word for each: the record keeps seconds and says them in this unit. */
export const DURATION_WORDS: Readonly<Record<DurationUnit, string>> = { m: 'Minutes', h: 'Hours', d: 'Days' };

/**
 * The kind of a field the list already has, as the sheet says it beside its name.
 *
 * `listName` turns the id a link points at into the name a person reads, because a link to `vendors` is said as a link to
 * Suppliers when that is what the list is called.
 */
export function kindSaid(f: { type: string; of?: string | undefined; to?: string | undefined }, listName: (id: string) => string): string {
  if (f.type === 'ref' && f.to) return `Link to ${listName(f.to)}`;
  if (f.type === 'list' && f.of === 'ref' && f.to) return `Links to ${listName(f.to)}`;
  if (f.type === 'list' && f.of === 'text') return SHEET_KIND_WORDS.tags;
  if (f.type === 'list') return 'More than one';
  return Object.hasOwn(SHEET_KIND_WORDS, f.type) ? SHEET_KIND_WORDS[f.type as SheetKind] : 'Other';
}

/**
 * The words of the sheet of what a list holds: its fields, adding one of any kind, renaming, and retiring. Called by what
 * it is to the person, "What Suppliers holds", and never by the system's word for the thing it edits.
 */
export const sheetWords = {
  open: 'What it holds',
  title: (list: string) => `What ${list} holds`,
  subtitle: 'Everything here has these.',
  none: 'Nothing yet beyond a name.',
  titleField: 'The name each one is called by',
  rename: 'Rename',
  renameTo: (label: string) => `New name for ${label}`,
  saveName: 'Save the name',
  cancel: 'Cancel',
  done: 'Done',
  addHead: 'Add a field',
  values: 'Choices',
  valuesHelp: 'One per line, or separated by commas.',
  noValues: 'Give it at least one choice.',
  valueTwice: (value: string) => `${value} is in the choices twice.`,
  linkTo: 'Links to',
  noLists: 'There is nothing else here to link to yet.',
  pickList: 'Pick what it links to.',
  unit: 'Said in',
  quantityUnit: 'Unit',
  quantityHelp: 'Optional, like kg or hours. Each one can say its own.',
  moneyHelp: 'Each amount keeps its own currency.',
  retireNote: 'Retiring waits on Decide, and nothing loses what it holds.',
  renamed: (was: string, now: string) => `${was} is called ${now} now.`,
  renameFiled: (now: string) => `The new name ${now} is waiting on Decide for the owner.`,
  sameName: 'That is already its name.',
  nameTaken: (label: string) => `Another field is already called ${label}.`,
  renameQuestion: (was: string, now: string, list: string) => `Rename ${was} to ${now} on ${list}?`,
  renameReason: 'Renamed by the owner.',
  addReason: 'Added by the owner.',
  noSchema: 'BrainDog could not read this just now. Try again.',
} as const;
