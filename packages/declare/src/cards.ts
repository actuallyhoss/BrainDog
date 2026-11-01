/**
 * A `cards` or a `table` block's grouping: `group: <field>` puts its rows under the thing each one points at (a client's
 * projects under the client, a person's tasks under the person) or under the value of a choice or of the list's state,
 * and `fold: <n>` (cards only) shows that many cards of a group
 * before the rest fold behind "n more", and is only said with a group. It is the calm "lists without boxes grouped
 * under quiet headings", said in the block grammar so the engine can compose it and a pack can declare it. The rules
 * are the kernel's `cardGroupFault`, asked here first so a pack is refused when it is written, not when it is installed.
 *
 * A GROUP IS A LINK, A CHOICE OR THE STATE, BECAUSE A HEADING HAS A NAME: the thing pointed at, or the label of the
 * value. A text field would be a heading a row long, and a `list<ref>` would put one card under three headings, which
 * reads as three cards. So the field is a single `ref`, an `enum` or the list's state on the list the block reads, and
 * anything else is refused with the fields the list has that could group.
 *
 * ASKED HERE OF THE LISTS THIS PACK DECLARES. A block reading a list another pack declares is held to that list where
 * the record knows it, at install; this check would have to guess, so it does not.
 */

import { no, type Result } from '@braindog/ports';

/** How many cards a group shows before the rest fold, when the block does not say. */
export const CARDS_FOLD = 3;

/** The most a block may say: past this a group is a list, and `limit` is the key for that. */
export const CARDS_FOLD_MOST = 50;

type Body = Readonly<Record<string, unknown>>;

/** A field id as the kernel reads one, so a group the record would refuse at install is refused here first. */
const FIELD_ID = /^[a-z][a-z0-9_]{0,63}$/u;

const isObject = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A register body's live fields by id, read without trusting their shape. A retired field groups nothing. */
function fieldsOf(register: Body): Map<string, Body> {
  const out = new Map<string, Body>();
  const fields = register.fields;
  if (Array.isArray(fields)) for (const f of fields) if (isObject(f) && typeof f.id === 'string' && f.retired !== true) out.set(f.id, f);
  return out;
}

/**
 * The first fault in a page's `cards` and `table` blocks' `group` and `fold`, or `null`. `page` is the declaration id the refusal
 * names, and `registers` the lists this pack declares, by id.
 */
export function cardsFault(page: string, body: unknown, registers: ReadonlyMap<string, unknown>): Result<never> | null {
  if (!isObject(body) || !Array.isArray(body.blocks)) return null;
  for (const [i, block] of body.blocks.entries()) {
    if (!isObject(block) || (block.kind !== 'cards' && block.kind !== 'table')) continue;
    const cards = block.kind === 'cards';
    const at = `${page}.blocks[${i}]`;
    const said = typeof block.heading === 'string' && block.heading !== '' ? `${page}'s ${block.heading}` : at;

    if (cards && block.fold !== undefined) {
      const n = block.fold;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > CARDS_FOLD_MOST)
        return no<never>(
          'OUT_OF_BOUNDS',
          `${said} folds at ${JSON.stringify(n)}. Fold is how many cards a group shows before the rest fold, a whole number from 1 to ${CARDS_FOLD_MOST}, and ${CARDS_FOLD} when it is left out.`,
          { at: `${at}.fold` },
        );
      if (block.group === undefined)
        return no<never>('DECLARATION_INVALID', `${said} folds its groups and draws none. Give it group: a link, a choice or the state of its list, or take fold off.`, { at: `${at}.fold` });
    }

    if (block.group === undefined) continue;
    const field = block.group;
    if (typeof field !== 'string' || !FIELD_ID.test(field))
      return no<never>('DECLARATION_INVALID', `${said} groups by ${JSON.stringify(field)}. Group names one field of the list, such as group: client.`, { at: `${at}.group` });
    const source = typeof block.source === 'string' ? block.source : '';
    /* A TABLE OVER WHAT FALLS DUE GROUPS BY ITS ONE WORD, `when`, the stretch each day is in (the kernel's
       `sources/deadlines.ts`), which the record checks where it reads the block. */
    if (!cards && source === 'deadlines' && field === 'when') continue;
    if (!source.startsWith('register.'))
      return no<never>(
        'DECLARATION_INVALID',
        `${said} groups by ${field} and reads no list, so there is nothing to group. Give it source: register.<list>, or take group off.`,
        { at: `${at}.group` },
      );
    const list = source.slice('register.'.length);
    const register = registers.get(list);
    if (!isObject(register)) continue;
    const fields = fieldsOf(register);
    const state = typeof register.state === 'string' ? register.state : null;
    const groups = (f: Body): boolean => f.type === 'ref' || f.type === 'enum' || f.id === state;
    const may = [...fields.values()].filter(groups).map((f) => f.id as string);
    const named = fields.get(field);
    if (named === undefined)
      return no<never>('FIELD_UNKNOWN', `${said} groups by ${field}, and ${list} has no field called ${field}.`, { at: `${at}.group`, allowed: may });
    if (!groups(named))
      return no<never>(
        'DECLARATION_INVALID',
        may.length === 0
          ? `${said} groups by ${field}, which is not a link, a choice or the state, and ${list} has none it could group by. Take group off.`
          : `${said} groups by ${field}, which is not a link, a choice or the state. ${cards ? 'Cards' : 'Rows'} group under the thing they point at or the value they hold: ${may.join(', ')}.`,
        { at: `${at}.group`, allowed: may },
      );
  }
  return null;
}
