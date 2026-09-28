/**
 * Making a new list from the app: the body the record is sent for it, the check that runs before the trip, and the words.
 *
 * A WHOLE `register`, PROPOSED. A new list is not an addition to anything, so it cannot go through `addTo`; it is filed as
 * a change whose `to` is the list's whole declaration, under the list's own name (`govern.ts` holds a change to the
 * declaration it names). The owner's lands at once, because it is his answer given in the next call (`fileChange`); a
 * member's waits on Decide, and the sentence they read says why, since nothing on the screen changes when they press.
 *
 * THE LIST IS THE PERSON'S AND NOTHING HERE KNOWS WHAT IT HOLDS. It gets one field every list needs, the name each row is
 * called by, and the first fields the person gave it, each checked by the same `drafted` the Fields sheet uses on a live
 * list. No example in these words names a use case.
 */

import { singularOf } from '../voice.ts';
import type { Fetch } from './boot-live.ts';
import { drafted, fileChange, idOf, type FieldAsk, type FieldBody } from './field-write.ts';
import { REGISTERS } from './held.ts';

export const listWords = {
  make: 'Make this list',
  newList: 'New list',
  title: 'Make a list',
  name: 'Name',
  namePlaceholder: 'Suppliers',
  holds: 'What it holds',
  holdsPlaceholder: 'The people and firms we buy from',
  firstFields: 'First fields',
  firstFieldsHelp: 'Every list starts with a name for each row. Add the rest now or later.',
  drop: (label: string) => `Take ${label} off`,
  takeOff: 'Take off',
  save: 'Make the list',
  ask: 'Ask the owner',
  saving: 'Making',
  noName: 'Give the list a name.',
  badName: 'A name starts with a letter, like Suppliers or Reading list.',
  taken: (name: string) => `This record already has a list called ${name}.`,
  noHolds: 'Say in one line what the list holds, so everybody reading it knows.',
  ownerNote: 'The list is made at once.',
  /** WHY A MEMBER'S LIST WAITS, said before the press as well as after it. */
  memberNote: 'A new list is the owner’s call, so it waits on Decide until the owner answers.',
  question: (name: string) => `Make a new list called ${name}?`,
  reason: 'Made by the owner from the app.',
  made: (name: string) => `${name} is ready.`,
  filed: (name: string) => `${name} is waiting on Decide, because a new list is the owner’s call.`,
  /* THE LIST AN ADDRESS NAMED AND THE RECORD DOES NOT HAVE, said in words, with what it does have offered beside it. */
  missingTitle: 'There is no list here yet',
  missing: (said: string) => `This record has no list called ${said}. Open one it has, or make this one.`,
  missingNone: (said: string) => `This record has no list called ${said}, and no lists yet. Make this one to start.`,
  makeBody: 'Give it a name, one line of what it holds, and the fields each row should have.',
} as const;

/**
 * The address the "New list" entry opens: the list screen, under a name no list can have, asking for the sheet.
 *
 * AN ID STARTS WITH A LETTER (the kernel's `IDENT`), so `_new` never collides with a list somebody made. The list screen
 * reads it and draws the new-list sheet over a plain "make a list" state instead of "there is no list called _new".
 */
export const MAKE_ID = '_new';
export const MAKE_PARAM = 'make';
export const NEW_LIST_PATH = `/r/${MAKE_ID}?${MAKE_PARAM}`;

/** The field every new list starts with, and the one its rows are titled by. */
export const TITLE_FIELD: FieldBody & { required: true } = { id: 'name', label: 'Name', type: 'text', required: true };

/** The name a list the address named would read as, to start the new-list sheet from: `reading_list` is Reading list. */
export const nameFromId = (id: string): string => (id === MAKE_ID ? '' : id.replace(/[_-]+/gu, ' ').trim().replace(/^./u, (c) => c.toUpperCase()));

/**
 * The lists a screen may offer somebody who asked for one that is not there.
 *
 * THE KERNEL'S OWN LISTS ARE LEFT OUT: the agent runs list declares a spoken prefix and no line of what it holds, and
 * "Lists on this record: session" offered a person a list of machinery as though it were one of theirs.
 */
export function offered(registers: readonly { id: string; name: string }[]): { id: string; name: string }[] {
  return registers.filter((r) => {
    const decl = REGISTERS[r.id];
    return !(decl && decl.seq_prefix !== undefined && !decl.holds);
  });
}

/** One of the new list's first fields, checked against the title field and the ones given so far. */
export function firstFieldOf(ask: FieldAsk, sofar: readonly FieldBody[], name: string): { ok: true; field: FieldBody } | { ok: false; fix: string } {
  return drafted(ask, [TITLE_FIELD, ...sofar], name.trim() || listWords.newList, offered(Object.values(REGISTERS)).map((r) => r.id));
}

export type ListAsk = { name: string; holds: string; fields: readonly FieldBody[] };
export type NewList = { id: string; name: string; body: Record<string, unknown> };

/**
 * The list a press asks for, or the sentence saying why it is not one yet.
 *
 * READ FROM THIS TAB'S COPY, so a list somebody made a moment ago in another tab passes here and is refused by the record
 * in its own words, which the sheet shows as they are.
 */
export function listOf(ask: ListAsk): { ok: true; list: NewList } | { ok: false; fix: string } {
  const name = ask.name.trim().replace(/\s+/gu, ' ');
  if (name === '') return { ok: false, fix: listWords.noName };
  const id = idOf(name);
  if (id === null) return { ok: false, fix: listWords.badName };
  if (REGISTERS[id]) return { ok: false, fix: listWords.taken(name) };
  const holds = ask.holds.trim().replace(/\s+/gu, ' ');
  if (holds === '') return { ok: false, fix: listWords.noHolds };
  const body = { id, name, one: singularOf(name), holds, title: TITLE_FIELD.id, fields: [TITLE_FIELD, ...ask.fields] };
  return { ok: true, list: { id, name, body } };
}

/** The change `propose` files: the whole list, under its own name, so the record asks whoever reads that list. */
export const makeOf = (list: NewList) => ({
  declaration_id: `register.${list.id}`,
  to: { id: `register.${list.id}`, kind: 'register', body: list.body },
});

export type Made = { from: 'made'; id: string; said: string } | { from: 'filed'; said: string; warn: boolean } | { from: 'refused'; fix: string };

/** File the new list, and accept it at once when the person filing owns the record. */
export async function makeList(base: string, list: NewList, owner: boolean, io?: Fetch): Promise<Made> {
  const out = await fileChange(base, list.id, listWords.question(list.name), makeOf(list), owner, listWords.reason, io);
  if (out.from === 'added') return { from: 'made', id: list.id, said: listWords.made(list.name) };
  if (out.from === 'filed') return { from: 'filed', said: out.fix ?? listWords.filed(list.name), warn: out.fix !== undefined };
  return out;
}
