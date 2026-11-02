/**
 * The palette's row that makes something: `Add to <list>: <text>`, read out of the query and written as a row.
 *
 * THE SENTENCE IS THE WHOLE INTERFACE. There is no form behind the row and no list to pick: the box already holds the
 * list and the title, so reading them is `creation()`, a pure function over the words and the lists the palette
 * already knows. Half a sentence is `null`, and the row is then absent rather than drawn waiting for the rest, which is
 * the palette's standing rule (`admit.ts`).
 *
 * THE WRITE IS THE LIST'S OWN CAPTURE LINE. `capturedFields` is where `/r/[register]` and a page's `capture` decide
 * what a typed line becomes: the title, and every required field nothing pinned at its emptiest value, each one said
 * back. The palette pins nothing, so it is that line typed with no filter, and the row it writes is the row the list
 * would have written. Writing only the title was the obvious shape, and the record refuses it on any list that
 * requires more than a title, which is most of them.
 *
 * LESS EVERY AMOUNT. The sentence has nowhere to type one, and the line's emptiest amount reads its currency off the rows
 * it is handed, which here were none, so it fell back to the SAMPLE's: pressing "Add to Money
 * owed: rent" on a record imported in USD and wrote GBP 0.00, and "Owed by you, 30 days" went from USD 45.00 to no value,
 * two parts in two currencies. A list that requires an amount is refused by the record, which names the field.
 *
 * `rows-write.ts` IS LOADED ON THE PRESS, NOT WITH THE PALETTE. The client carries the route table as a value, and the
 * palette is in the layout, so a static import would put it in the chunk every screen waits for. This file's own
 * imports are the fixture declarations the palette already loads, `may.ts` (a table and one function), and types.
 */

import { copy } from '../copy.ts';
import type { Way } from '../money/quick.ts';
import { REGISTERS } from '../record/held.ts';
import { may, type HeldLevel } from '../record/may.ts';
import type { Shell } from '../record/boot-live.ts';
import type { List } from '../record/palette.ts';
import type { Fetch } from '../record/row-live.ts';
import type { Captured, Wrote } from '../record/rows-write.ts';
import type { Entry, Fields } from '../record/schema.ts';
import type { Command, Creation } from './admit.ts';
import { chipFields, isQuestion, type Chip } from './tokens.ts';

/** Kept here rather than in `copy.ts`, so the palette's add owns its own words. */
export const words = {
  /** The declaration's title, which `admits()` checks. The row draws `row` in its place. */
  declared: 'Add to a list',
  row: (list: string, title: string) => `Add to ${list}: ${title}`,
  added: (list: string, title: string) => `Added “${title}” to ${list}.`,
  /** The heading over the row. It is drawn first, because a whole sentence of intent outranks a match on its words. */
  group: 'Add',
  /** The heading over a plain line's row, which is drawn after every other heading. */
  plainGroup: 'New',
  /** What the chips under the field are, for a reader who hears them. */
  chips: 'Read from the line',
  /** The row a plain line makes, named by one of the capture list's own word: "Add as a task", "Add as an order". */
  plain: (one: string) => `Add as ${/^[aeiou]/iu.test(one) ? 'an' : 'a'} ${one.toLowerCase()}`,
  /** The receipt for a line that said more than its words: `Added “call the bank” to Tasks, due Thu 15 Oct.` */
  addedWith: (list: string, title: string, said: readonly string[]) => `Added “${title}” to ${list}, ${said.join(', ')}.`,
} as const;

/**
 * `add to`, a list, a colon, and the title. THE FIRST COLON ENDS THE LIST, so the title may carry colons of its own,
 * and the list may not, which no list name does.
 */
const SENTENCE = /^\s*add\s+to\s+([^:]+?)\s*:\s*(.*?)\s*$/iu;

/** A name as it is compared: lower case, with runs of space and the id's underscore read as one space. */
const plain = (s: string): string => s.toLowerCase().replace(/[\s_]+/gu, ' ').trim();

/**
 * The row a query asks for, or `null` when the query is not the whole sentence.
 *
 * BY THE NAME A READER SEES, THEN BY THE ID. `things` is drawn everywhere as Projects, so `add to projects:` is the
 * sentence somebody types; the id is kept for the lists whose name and id are the same word, and for an agent that
 * reads ids. A NAME IS NEVER GUESSED: `add to task:` is not Tasks, because the nearest list is how a bill ends up
 * filed under the wrong one with nobody told.
 */
export function creation(query: string, lists: readonly Pick<List, 'id' | 'name'>[]): Creation | null {
  const said = SENTENCE.exec(query);
  if (!said) return null;
  const [, named = '', title = ''] = said;
  if (title === '') return null;
  const want = plain(named);
  const list = lists.find((l) => plain(l.name) === want) ?? lists.find((l) => plain(l.id) === want);
  return list ? { register: list.id, title } : null;
}

/** A row a plain line makes: the sentence's row, with the chips the line was read into (`tokens.ts`). */
export type Plain = Creation & { plain: true; chips: readonly Chip[] };

/** The list the record's own capture writes into, as the palette names it: its id, its name and one of it. */
export type Into = { register: string; name: string; one?: string | undefined };

/**
 * THE LINES THAT ARE ANOTHER ROW'S SENTENCE, typed or half typed: `Add to Tasks: …` and `New page: …` are read by their
 * own rows, so a line that is starting one is not also a task called "add to".
 */
const SENTENCES = ['add to', 'new page'];
const startsSentence = (line: string): boolean => {
  const said = plain(line.replace(/:.*$/su, ''));
  return SENTENCES.some((s) => s.startsWith(said) || said === s || said.startsWith(`${s} `));
};

/**
 * The row a plain line offers: "call the bank tomorrow" is a row in the list the record's capture writes to.
 *
 * TWO WORDS OR MORE, NOT A QUESTION, NOT ANOTHER ROW'S SENTENCE. One word is a search, a question is Slash's
 * (`isQuestion`, the same test Today's ask bar runs), and `Add to Tasks:` is the sentence row's. `into` is the list the
 * record's Home page captures into (`homeCapture`), never a list named here: a record whose Home has no capture, or a
 * caller who may not add to its list, is offered nothing.
 *
 * THE TITLE IS THE LINE, and the palette reads it into its words and chips (`tokens.ts`) before the row is drawn.
 */
export function plainAdd(query: string, into: Pick<Into, 'register'> | null): Plain | null {
  const line = query.trim();
  if (!into || line.split(/\s+/u).length < 2) return null;
  if (isQuestion(line) || startsSentence(line) || SENTENCE.test(line)) return null;
  return { register: into.register, title: line, plain: true, chips: [] };
}

/**
 * The list the first `capture` block of a page writes into, or `null` where the page has none. The Home page's is the
 * list a plain line goes into, because it is the line the record already offers for exactly that.
 */
export function homeCapture(blocks: readonly { kind: string; [key: string]: unknown }[]): string | null {
  const block = blocks.find((b) => b.kind === 'capture');
  return typeof block?.register === 'string' && block.register !== '' ? block.register : null;
}

/**
 * The lists a row can be added to from here: the ones this build holds a declaration for.
 *
 * THE DECLARATION NAMES THE TITLE FIELD, and the words go nowhere else, which is `capture.ts`'s rule for a page's
 * capture and the same list for the same reason. A live record can hold a list this build has never heard of; its name
 * does not turn the sentence into a row, so the row is absent there rather than written with the words in no field.
 */
export function addable<T extends Pick<List, 'id'>>(lists: readonly T[]): T[] {
  return lists.filter((l) => Boolean(REGISTERS[l.id]?.title));
}

/** What the shell says about the lists and the caller, and only that. */
export type Offer<T> = {
  lists?: readonly T[];
  me?: { level: string; lists: readonly string[] | null; levels?: Readonly<Record<string, HeldLevel>> | undefined };
};

/**
 * The lists the add row may name for this caller.
 *
 * EVERY LIST, THE EMPTY ONES TOO. The palette read the rail's lists, and the rail drops a list with no rows, so "Add to
 * Tasks: buy milk" on an empty Tasks drew nothing, which is the one moment the row helps
 * most. `shell.lists` is the one the shell keeps for putting something into a list.
 *
 * AND ONLY WHERE THE CALLER MAY ADD, LIST BY LIST, which is `may(shell, 'append', list)`. The palette once drew
 * the row for a `read` member, and `create` then refused the press: a row that cannot run is absent (`admit.ts`), not
 * drawn to fail. `boot` now says the level held on each list (`me.levels`), so a colleague with Edits on Expenses and
 * Reads on the rest is offered Expenses alone, and a record-wide appender is not offered the owner's lists `create`
 * would refuse them.
 *
 * A HOST OLDER THAN `me.levels` SAYS ONLY `me.lists`, and a colleague held to named lists is then offered those, as
 * before the field: the shell's `read` is a fallback for them, and taking the row from a bookkeeper given `write` on
 * the one list they were asked to fill would be the fallback deciding what the record never said. Nobody in the shell,
 * a refused `boot`, is offered nothing.
 */
export function offered<T extends Pick<List, 'id'>>(shell: Offer<T>): T[] {
  const { me, lists = [] } = shell;
  if (!me) return [];
  const held = me.lists;
  if (me.levels === undefined && held !== null) return addable(lists.filter((l) => held.includes(l.id)));
  /* `may` READS `level`, `lists` AND `levels` AND NOTHING ELSE of the shell's `me`, which is all an offer carries. */
  const asked = { me } as unknown as Pick<Shell, 'me'>;
  return addable(lists.filter((l) => may(asked, 'append', l.id)));
}

/**
 * The fields a press writes, and what it says it filled in: the list's own capture line, less every money field.
 *
 * THE LINE SAYS ITS FILLS IN THE ORDER THE DECLARATION HOLDS THEM, and with no filter every field after the title is one
 * it filled, so the two walk together and an amount leaves both the write and the receipt.
 *
 * AND WHAT THE LINE SAID WINS (`chips`), as on a page's capture (`page/capture.ts` `captureRow`): a line typed
 * "tomorrow" is due tomorrow, not filled with today, and is not said to have been filled. An amount a chip read was
 * typed with its currency, so it is written; only the guessed one is left out.
 */
export async function addedFields(register: string, said: string, now: number, chips: readonly Pick<Chip, 'field' | 'value'>[] = []): Promise<Captured> {
  const { capturedFields } = await import('../record/rows-write.ts');
  const line = capturedFields(register, said, [], now);
  const decl = REGISTERS[register];
  if (!decl) return line;
  const wrote = decl.fields.filter((f) => f.id !== decl.title && Object.hasOwn(line.fields, f.id));
  const read = chipFields(chips.filter((c) => decl.fields.some((f) => f.id === c.field && f.id !== decl.title)));
  const fields: Fields = {};
  for (const [id, value] of Object.entries(line.fields)) if (decl.fields.find((f) => f.id === id)?.type !== 'money') fields[id] = value;
  return { fields: { ...fields, ...read }, filled: line.filled.filter((_, i) => wrote[i]?.type !== 'money' && !Object.hasOwn(read, wrote[i]?.id ?? '')) };
}

/** What a press answered: the row, what was filled in for the reader, and its way back; or the record's sentence. */
export type Added = { ok: true; entry: Entry; filled: readonly string[]; back: () => Promise<Wrote> } | { ok: false; fix: string };

/**
 * One row, written on a live record.
 *
 * THE WAY BACK IS AN ARCHIVE, at the version the create answered, which is the Put back the list's own add offers: the
 * record has no delete, so the row leaves every list and `restore` can still bring it back. It is handed back as a
 * function rather than run here, because it is the toast's to offer and the reader's to press.
 */
export async function addRow(c: Creation | Plain, now: number, base: string, io?: Fetch, extra: Fields = {}): Promise<Added> {
  const { rowWriter } = await import('../record/rows-write.ts');
  const { fields, filled } = await addedFields(c.register, c.title, now, 'chips' in c ? c.chips : []);
  const writer = rowWriter(base, io);
  /* `extra` IS WHAT CAME WITH THE LINE AND NOT FROM IT: a photo shared from another app, in the list's file field. */
  const out = await writer.create(c.register, { ...fields, ...extra });
  if (!out.ok) return { ok: false, fix: out.fix };
  const { entry } = out;
  return { ok: true, entry, filled, back: () => writer.archive(c.register, entry.seq, entry.version) };
}

/**
 * THE THREE MONEY ROWS: "Add an expense", "Add income" and "Move money between accounts" open the quick-add sheet
 * (`lib/money/QuickAdd.svelte`) on that way, over whatever page is open.
 *
 * THEY NAME THEIR TARGET, which is the record's ledger, found from its declarations and never named here: so they are
 * offered only while a ledger is known and a page is drawn that can open the sheet (`Live.ledger`), and are absent
 * otherwise, which is the standing rule. The first is the `+` key's, and prints it.
 */
export const moneyWords = {
  out: 'Add an expense',
  in: 'Add income',
  move: 'Move money between accounts',
} as const;

const MONEY_IDS: Readonly<Record<string, Way>> = { 'c-money-out': 'out', 'c-money-in': 'in', 'c-money-move': 'move' };

/** The way a money row opens the sheet on, by the row's id; `null` for any other row. */
export const moneyWay = (id: string): Way | null => MONEY_IDS[id] ?? null;

export const MONEY_ADDS: readonly Command[] = [
  {
    id: 'c-money-out',
    title: moneyWords.out,
    href: null,
    act: 'money',
    binding: 'money-add',
    group: copy.commands,
    icon: 'arrow-up-right',
    aliases: ['spent', 'paid', 'spend', 'purchase'],
    when: (live) => live.ledger === true,
  },
  {
    id: 'c-money-in',
    title: moneyWords.in,
    href: null,
    act: 'money',
    group: copy.commands,
    icon: 'arrow-down-left',
    aliases: ['received', 'earned', 'paid me', 'refund'],
    when: (live) => live.ledger === true,
  },
  {
    id: 'c-money-move',
    title: moneyWords.move,
    href: null,
    act: 'money',
    group: copy.commands,
    icon: 'arrow-up-down',
    aliases: ['transfer', 'send'],
    when: (live) => live.ledger === true,
  },
];

/**
 * IMPORT A STATEMENT: a bank's CSV into one account's lines, on its own screen (`routes/add/statement`). Offered on the
 * money rows' rule, while the record keeps a ledger, and named here so the palette's chunk carries no part of the mapper.
 */
export const MONEY_IMPORT: Command = {
  id: 'c-money-import',
  title: 'Import a statement',
  href: '/add/statement',
  group: copy.commands,
  icon: 'upload',
  aliases: ['csv', 'bank statement', 'import transactions'],
  when: (live) => live.ledger === true,
};

/**
 * IMPORT CONTACTS: a contacts CSV or vCard into People and their organisations, on its own screen (`routes/add/contacts`).
 * Offered wherever People can be added to.
 */
export const PEOPLE_IMPORT: Command = {
  id: 'c-people-import',
  title: 'Import contacts',
  href: '/add/contacts',
  group: copy.commands,
  icon: 'upload',
  aliases: ['contacts', 'vcard', 'vcf', 'address book', 'import people'],
};
