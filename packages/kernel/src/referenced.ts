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
 *
 * THE WAY OUT, WHERE THE LIST HAS ONE. A list that declares finished states (`state:` and `done:`) has somewhere for
 * such a row to go that strands nothing, so its refusal ends "Mark it Closed instead." in place of the advice to move
 * or delete what points here. The word is the label of the list's first finished value, the list's own, and a row
 * that is finished already gets the older sentence, because it has taken that way out and still cannot go.
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
 * What a `ref` field says becomes of it when the row it names is deleted: `on_delete: unlink`.
 *
 * A LINK THE RECORD DREW ITSELF IS NOT A REASON TO KEEP A ROW. A mail's sender (`gmail_mail.who`) is the Gmail script's
 * guess at who wrote it, and while it pointed at a person the owner wanted gone, his delete was refused: "12 entries in
 * Mail still point at this one". A field declaring `on_delete: unlink` is not counted by `referencedBy`; the delete
 * clears it on every row that names the deleted one (`unlinksOf`, written by the delete in its own batch), and Undo, or
 * bringing the row back, points each one back while it is still empty. A link a person chose, a task's owner or a
 * payment's account, keeps the refusal, since it carries meaning nobody should lose by a delete.
 */
export const ON_DELETE = ['unlink'] as const;

type RefField = { id: string; type: string; of?: string; to?: string; retired?: boolean };

/** Whether a field of another list is a link the delete clears rather than one that keeps the row. */
const unlinks = (f: RefField): boolean => (f as Readonly<Record<string, unknown>>).on_delete === ON_DELETE[0];

/**
 * Every live row of every list whose `on_delete: unlink` fields name `entry` of `register`, with those fields: what a
 * delete clears. The row being deleted is left out.
 */
export function unlinksOf(parts: KernelParts, register: string, entry: string): { register: string; id: string; fields: string[] }[] {
  const out: { register: string; id: string; fields: string[] }[] = [];
  for (const row of parts.declarations()) {
    if (row.kind !== 'register') continue;
    const from = parts.register(row.id.slice('register.'.length));
    if (from === undefined) continue;
    const keys = from.fields
      .filter((f) => (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) && f.to === register && !f.retired && unlinks(f) && FIELD_ID.test(f.id))
      .map((f) => f.id);
    if (keys.length === 0) continue;
    for (const r of parts.sql.all<{ id: string; fields: string }>(
      `SELECT e.id, e.fields FROM entry e WHERE e.register = ? AND e.deleted_at IS NULL AND e.id <> ? AND EXISTS (
         SELECT 1 FROM json_each(e.fields) AS f WHERE f.key IN (SELECT value FROM json_each(?))
           AND (f.value = ? OR (f.type = 'array' AND EXISTS (SELECT 1 FROM json_each(f.value) AS r WHERE r.value = ?)))
       )`,
      from.id,
      entry,
      JSON.stringify(keys),
      entry,
      entry,
    )) {
      let fields: Record<string, unknown> = {};
      try {
        fields = JSON.parse(r.fields) as Record<string, unknown>;
      } catch {
        continue;
      }
      const named = keys.filter((k) => fields[k] === entry || (Array.isArray(fields[k]) && (fields[k] as unknown[]).includes(entry)));
      if (named.length > 0) out.push({ register: from.id, id: r.id, fields: named });
    }
  }
  return out;
}

/**
 * How many referring lists the sentence names one by one. The rest are counted together, so a row that a great many
 * lists point at still gets one sentence a person reads to the end.
 */
const LISTS_NAMED_MOST = 3;

/** A field id as `34 §4` spells one. A name that is not one is not a field a declaration could have installed. */
const FIELD_ID = /^[a-z][a-z0-9_]{0,31}$/u;

/** How many entries, said as a person says it (never "row" in copy a person reads). */
const rows = (n: number): string => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** A state's id as words, where its field declares no label for it: `written_off` is "Written off". */
const words = (id: string): string => {
  const said = id.replace(/[._-]+/gu, ' ').trim();
  return said.slice(0, 1).toUpperCase() + said.slice(1);
};

/**
 * How each sentence ends: the list's first finished state as the way out, or `otherwise` where there is none to offer.
 *
 * `otherwise` IS KEPT for a list with no `state:` or no `done:`, and for a row already in a finished state, whichever
 * one. The row's state is read off the column the write path mirrors it onto, once, and only when a delete is refused.
 */
function wayOut(parts: KernelParts, decl: NonNullable<ReturnType<KernelParts['register']>>, entry: string, otherwise: string): string {
  const done = decl.done ?? [];
  const first = done[0];
  if (decl.state === undefined || first === undefined) return otherwise;
  const now = parts.sql.one<{ state: string | null }>('SELECT state FROM entry WHERE id = ?', entry)?.state;
  if (typeof now === 'string' && done.includes(now)) return otherwise;
  const label = decl.fields.find((f) => f.id === decl.state)?.labels?.[first];
  return `. Mark it ${label ?? words(first)} instead.`;
}

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
      .filter((f) => (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) && f.to === register && !f.retired && !unlinks(f) && FIELD_ID.test(f.id))
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
      fix: `Entries you cannot open still point at this one, so it cannot be deleted${wayOut(parts, decl, entry, ': somebody who can open them has to point them elsewhere or delete them first.')}`,
      at: 'delete',
    };

  /* THE LISTS HOLDING THE MOST FIRST, and by name among equals, so the same record gives the same sentence twice. */
  held.sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const total = held.reduce((sum, h) => sum + h.n, 0);
  const only = held.length === 1 && !hidden ? held[0] : undefined;
  if (only !== undefined)
    return {
      code: 'DELETE_WHILE_REFERENCED',
      fix: `${rows(only.n)} in ${only.name} still ${only.n === 1 ? 'points' : 'point'} at this one, so it cannot be deleted${wayOut(parts, decl, entry, `: point ${only.n === 1 ? 'that entry' : 'those entries'} elsewhere or delete ${only.n === 1 ? 'it' : 'them'} first.`)}`,
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
    fix: `${hidden ? 'Entries' : rows(total)} still point at this one (${where}), so it cannot be deleted${wayOut(parts, decl, entry, ': point those entries elsewhere or delete them first.')}`,
    at: 'delete',
  };
}
