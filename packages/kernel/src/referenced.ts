/**
 * `delete: refuse_while_referenced`: a row that other rows still point at is not deleted out from under them.
 *
 * WHY A LIST ASKS FOR IT. A `ref` is soft everywhere else, and deleting the row it names cascades nowhere (`02 §5`).
 * That is the right default for a record and the wrong one for a ledger: an account deleted while its transactions
 * still name it leaves every one of them pointing at a row nobody can open, and the money they carry belongs to
 * nothing. A list that declares this key keeps its rows while any live row of any list points at them through a `ref`
 * or a `list<ref>` field, and the refusal says which lists and how many rows, so the person can deal with those first
 * (`41 §5.4` step 4.8, `30 §6`).
 *
 * ASKED ONCE, BY THE WRITE PATH, when a patch takes a live row out (`index.ts`, the delete branch), after the field
 * checks and before anything is written. A restore and a row that is already deleted are never asked about, and a list
 * that does not declare the key costs one lookup in the list cache and nothing more.
 *
 * WHAT IT READS, AND ITS CEILING. One count per list that has a field pointing at this one, and never a row: the count
 * walks that list's live rows once, looking only at the fields that point here. The field ids are one bound JSON array,
 * never spliced into the statement, so one list's count binds five parameters however many fields point here, inside
 * the Durable Object's bound on parameters (`DO_LIMITS.variableNumber`, `ports/src/sql.ts`). The lists
 * walked are the record's own declarations, so the loop ends where they do. `41 §10` records the scan as a deliberate
 * ceiling: a referring field declared `index: true` is the upgrade.
 *
 * A ROW COUNTS ONCE, however many of its fields point here: a transfer whose `from` and `to` both name one account is
 * one row to move, and the sentence counts rows a person would open.
 */

import type { Refusal } from '@braindog/ports';

import type { KernelParts } from './parts.ts';

/**
 * The values a list's `delete:` takes, and there is one.
 *
 * `declare.ts` checks a declaration against this list and names it in its refusal, so the grammar and the check that
 * keeps it are one row in one place.
 */
export const DELETE_RULES = ['refuse_while_referenced'] as const;

/**
 * How many referring lists the sentence names one by one. The rest are counted together, so a row that a great many
 * lists point at still gets one sentence a person reads to the end.
 */
const LISTS_NAMED_MOST = 3;

/** A field id as `34 §4` spells one. A name that is not one is not a field a declaration could have installed. */
const FIELD_ID = /^[a-z][a-z0-9_]{0,31}$/u;

/** How many entries, said as a person says it (never "row" in copy a person reads). */
const rows = (n: number): string => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/**
 * The refusal for deleting `entry` from `register` while live rows point at it, or `null` when the delete may go ahead.
 *
 * `null` too for a list that does not declare `delete: refuse_while_referenced`, and for a list this record does not
 * hold, because the write path has refused that already.
 *
 * `reads` IS THE WRITER'S, AS `list` TAKES IT (`WriteContext.reads`). A list she cannot read still keeps the row, because
 * letting the delete through would strand rows she cannot see, but the sentence never names that list or counts its
 * rows: it says only that rows she cannot open point here. Left out, as it is for the owner, every list is named.
 */
export function referencedBy(parts: KernelParts, register: string, entry: string, reads?: (register: string) => boolean): Refusal | null {
  const decl = parts.register(register);
  /* THE KEY IS READ OFF THE DECLARATION THE LIST CACHE HOLDS, which is the body as it was installed. `RegisterDecl`
     does not spell it, because nothing but this function reads it. */
  if (decl === undefined || (decl as Readonly<Record<string, unknown>>).delete !== DELETE_RULES[0]) return null;

  const held: { name: string; n: number }[] = [];
  let hidden = false;
  for (const row of parts.declarations()) {
    if (row.kind !== 'register') continue;
    /* A LIST'S DECLARATION IS `register.<its id>`, which `declare.ts` refuses any other way. */
    const from = parts.register(row.id.slice('register.'.length));
    if (from === undefined) continue;
    /* A RETIRED FIELD IS LEFT OUT, as `backlinks` leaves it out: nobody can see it or change it any more, so counting
       it would keep the row for ever with nothing a person could do about it. */
    const keys = from.fields
      .filter((f) => (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) && f.to === register && !f.retired && FIELD_ID.test(f.id))
      .map((f) => f.id);
    if (keys.length === 0) continue;

    /* ONE STATEMENT PER LIST, with the depth of the expression fixed whatever the number of fields: `json_each` walks
       the row's top-level fields, keeps the ones that point here, and matches a `ref`'s value or any element of a
       `list<ref>`'s. The row being deleted is left out, so a row that names itself does not keep itself. */
    const n = Number(
      parts.sql.one<{ n: number }>(
        `SELECT count(*) AS n FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND e.id <> ? AND EXISTS (
           SELECT 1 FROM json_each(e.fields) AS f WHERE f.key IN (SELECT value FROM json_each(?))
             AND (f.value = ? OR (f.type = 'array' AND EXISTS (SELECT 1 FROM json_each(f.value) AS r WHERE r.value = ?)))
         )`,
        from.id,
        entry,
        JSON.stringify(keys),
        entry,
        entry,
      )?.n ?? 0,
    );
    if (n === 0) continue;
    if (reads !== undefined && !reads(from.id)) hidden = true;
    else held.push({ name: from.name, n });
  }
  if (held.length === 0 && !hidden) return null;

  /* ONLY LISTS SHE CANNOT OPEN, so there is nothing she could move and nothing to name. */
  if (held.length === 0)
    return {
      code: 'DELETE_WHILE_REFERENCED',
      fix: 'Entries you cannot open still point at this one, so it cannot be deleted: somebody who can open them has to point them elsewhere or delete them first.',
      at: 'delete',
    };

  /* THE LISTS HOLDING THE MOST FIRST, and by name among equals, so the same record gives the same sentence twice. */
  held.sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const total = held.reduce((sum, h) => sum + h.n, 0);
  const only = held.length === 1 && !hidden ? held[0] : undefined;
  if (only !== undefined)
    return {
      code: 'DELETE_WHILE_REFERENCED',
      fix: `${rows(only.n)} in ${only.name} still ${only.n === 1 ? 'points' : 'point'} at this one, so it cannot be deleted: point ${only.n === 1 ? 'that entry' : 'those entries'} elsewhere or delete ${only.n === 1 ? 'it' : 'them'} first.`,
      at: 'delete',
    };

  const named = held.slice(0, LISTS_NAMED_MOST).map((h) => `${h.n} in ${h.name}`);
  const rest = held.slice(LISTS_NAMED_MOST);
  if (rest.length > 0) named.push(`${rest.reduce((sum, h) => sum + h.n, 0)} in ${rest.length} other ${rest.length === 1 ? 'list' : 'lists'}`);
  /* A HIDDEN LIST ADDS ROWS NOBODY HERE MAY COUNT, so the sentence stops giving a total and says only that there are more. */
  if (hidden) named.push('more you cannot open');
  const last = named.pop() ?? '';
  const where = named.length === 0 ? last : `${named.join(', ')} and ${last}`;
  return {
    code: 'DELETE_WHILE_REFERENCED',
    fix: `${hidden ? 'Entries' : rows(total)} still point at this one (${where}), so it cannot be deleted: point those entries elsewhere or delete them first.`,
    at: 'delete',
  };
}
