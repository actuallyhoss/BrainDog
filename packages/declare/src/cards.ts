/**
 * A `cards` block's grouping: `group: <ref field>` puts its cards under the thing each one points at (a client's
 * projects under the client, a person's tasks under the person), and `fold: <n>` shows that many cards of a group
 * before the rest fold behind "n more", and is only said with a group. DIRECTION §37's "lists without boxes grouped
 * under quiet headings", said in the block grammar so the engine can compose it and a pack can declare it. The rules
 * are the kernel's `cardGroupFault`, asked here first so a pack is refused when it is written, not when it is installed.
 *
 * A GROUP IS A REF, BECAUSE A HEADING NAMES A THING. A text or enum field would group by a word nobody can open, and a
 * `list<ref>` would put one card under three headings, which reads as three cards. So the field is a single `ref` on the
 * list the block reads, and anything else is refused with the ref fields the list does have.
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
 * The first fault in a page's `cards` blocks' `group` and `fold`, or `null`. `page` is the declaration id the refusal
 * names, and `registers` the lists this pack declares, by id.
 */
export function cardsFault(page: string, body: unknown, registers: ReadonlyMap<string, unknown>): Result<never> | null {
  if (!isObject(body) || !Array.isArray(body.blocks)) return null;
  for (const [i, block] of body.blocks.entries()) {
    if (!isObject(block) || block.kind !== 'cards') continue;
    const at = `${page}.blocks[${i}]`;
    const said = typeof block.heading === 'string' && block.heading !== '' ? `${page}'s ${block.heading}` : at;

    if (block.fold !== undefined) {
      const n = block.fold;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > CARDS_FOLD_MOST)
        return no<never>(
          'OUT_OF_BOUNDS',
          `${said} folds at ${JSON.stringify(n)}. Fold is how many cards a group shows before the rest fold, a whole number from 1 to ${CARDS_FOLD_MOST}, and ${CARDS_FOLD} when it is left out.`,
          { at: `${at}.fold` },
        );
      if (block.group === undefined)
        return no<never>('DECLARATION_INVALID', `${said} folds its groups and draws none. Give it group: a link field of its list, or take fold off.`, { at: `${at}.fold` });
    }

    if (block.group === undefined) continue;
    const field = block.group;
    if (typeof field !== 'string' || !FIELD_ID.test(field))
      return no<never>('DECLARATION_INVALID', `${said} groups by ${JSON.stringify(field)}. Group names one field of the list, such as group: client.`, { at: `${at}.group` });
    const source = typeof block.source === 'string' ? block.source : '';
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
    const refs = [...fields.values()].filter((f) => f.type === 'ref').map((f) => f.id as string);
    const named = fields.get(field);
    if (named === undefined)
      return no<never>('FIELD_UNKNOWN', `${said} groups by ${field}, and ${list} has no field called ${field}.`, { at: `${at}.group`, allowed: refs });
    if (named.type !== 'ref')
      return no<never>(
        'DECLARATION_INVALID',
        refs.length === 0
          ? `${said} groups by ${field}, which is not a link to one thing, and ${list} links to nothing it could group by. Take group off.`
          : `${said} groups by ${field}, which is not a link to one thing. Cards group under the thing they point at: ${refs.join(', ')}.`,
        { at: `${at}.group`, allowed: refs },
      );
  }
  return null;
}
