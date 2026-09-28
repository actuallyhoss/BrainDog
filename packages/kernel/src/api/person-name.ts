/**
 * A person's own name and sign-in address, as this record mirrors them: `renamePerson` and `mirrorPerson`
 * (`loop/finish/contracts.md` §12.1, GAP-7; ROADMAP M3 "a name can be changed").
 *
 * THE `person` TABLE IS A MIRROR OF THE DIRECTORY'S ROW (migration 0001), and until now only erasure wrote a name into
 * it (`erase.ts`), so a name typed once at an invitation stayed for ever. This file is the one writer of a changed name
 * or address: `renamePerson` is the person asking in this record, and `mirrorPerson` is the host carrying the same
 * change into every other record the person belongs to, after the Directory has moved.
 *
 * A CHANGE IS AN `edit` EVENT ON THE PERSON, target `person:<id>`, target kind `person`, the field that moved, the old
 * and new values as the ledger writes any value and the sentence in `note`. No new event kind: the closed list stays
 * closed (contracts §1.1), and History already reads edits. The same value again writes nothing, so a double press is
 * one change in History.
 *
 * WHO MAY ASK IS THE RECORD'S QUESTION, NOT THIS FILE'S. `packages/record/src/methods/person-name.ts` lets a person
 * change only their own name, and never a token or a shared link.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from '../coerce.ts';
import { jcs } from '../declare.ts';
import type { KernelParts } from '../parts.ts';

/** The longest name a person may give themselves, in code points, as provisioning allows (contracts §12.1). */
export const PERSON_NAME_MOST = 80;

/**
 * A character that draws nothing or draws something else: a control, a line or paragraph separator, a direction mark
 * or a lone surrogate. A name is drawn on every row a person wrote, so one of these would move text around it.
 */
const HIDDEN = /[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}\p{Cs}]/u;

/**
 * A placeholder nobody filled in: a braced field (`{{first_name}}`, `{first}`, `${first}`), a bracketed one
 * (`[First] [Last]`), a mail merge's `*|FNAME|*` or `%FIRST_NAME%`. A form filled from a template stored these as a
 * person's name (`loop/finish/defects.md` H2), and every place the name was drawn said it for good.
 */
const PLACEHOLDER = /\{[^{}]*\}|\[[^[\]]*\]|\*\|[^|]*\|\*|%[\p{L}_]+%/u;

/**
 * The name a person typed, trimmed and with runs of spaces made one, or the one sentence that says why it is not a
 * name. Exported so the Directory and a screen can say the same thing the record says.
 */
export function personNameOf(typed: unknown): Result<string> {
  if (typeof typed !== 'string') return no('REQUIRED_MISSING', 'Type the name you want to be called.', { at: 'name' });
  const name = typed.trim().replace(/\s{2,}/gu, ' ');
  if (name === '') return no('REQUIRED_MISSING', 'Type the name you want to be called.', { at: 'name' });
  if ([...name].length > PERSON_NAME_MOST) return no('VALUE_MALFORMED', `A name is at most ${PERSON_NAME_MOST} characters.`, { at: 'name' });
  if (HIDDEN.test(name)) return no('VALUE_MALFORMED', 'That name has a hidden character in it, such as a line break or a direction mark. Type it again without it.', { at: 'name' });
  if (PLACEHOLDER.test(name)) return no('VALUE_MALFORMED', 'That name is a template field nobody filled in, such as {{first_name}}. Type the name itself.', { at: 'name' });
  return ok(name);
}

/** What moves in a person's mirror: a new name, a new sign-in address, or both. */
export type PersonChange = { name?: string | undefined; email?: string | undefined };

/** What a mirror answered: what it holds now, and whether this call changed anything. */
export type PersonMirrored = { name: string | null; email: string | null; changed: boolean };

export function extension(parts: KernelParts) {
  const { sql, clock, mint, transaction } = parts;

  /**
   * One field of the mirror, moved, with its `edit` event signed by the person. `false` when it already held the value.
   *
   * THE SENTENCE NAMES THE OLD AND NEW NAME AND NEVER AN ADDRESS. History is read by every owner of the record, and a
   * name is already on every row the person wrote, while an old sign-in address is nobody else's business; the values
   * themselves sit in `from_v` and `to_v`, where the owner's own audit reads them.
   */
  const moved = (person: string, field: 'name' | 'email', was: string | null, is: string): boolean => {
    if (was === is) return false;
    if (field === 'name') sql.exec('UPDATE person SET name = ? WHERE id = ?', is, person);
    else sql.exec('UPDATE person SET email = ? WHERE id = ?', is, person);
    const note = field === 'email' ? 'Sign-in email changed' : was === null || was === '' ? `Name set to ${is}` : `Name changed from ${was} to ${is}`;
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, ?, 'edit', ?, 'person', ?, ?, ?, ?)",
      mint(),
      instant(clock.now()),
      person,
      `person:${person}`,
      field,
      was === null ? null : jcs(was),
      jcs(is),
      note,
    );
    return true;
  };

  /**
   * The change, written into this record's mirror of the person. A record that has never mirrored them answers
   * `changed: false` and writes nothing, because a person row made here would be a member nobody invited.
   */
  const mirror = (person: string, change: PersonChange): Result<PersonMirrored> =>
    transaction(() => {
      const row = sql.one<{ name: string | null; email: string | null }>('SELECT name, email FROM person WHERE id = ?', person);
      if (!row) return ok({ name: null, email: null, changed: false });
      let changed = false;
      if (change.name !== undefined) changed = moved(person, 'name', row.name, change.name) || changed;
      if (change.email !== undefined) changed = moved(person, 'email', row.email, change.email) || changed;
      return ok({ name: change.name ?? row.name, email: change.email ?? row.email, changed });
    });

  return {
    /**
     * The caller's own name, as they typed it: trimmed, 1 to `PERSON_NAME_MOST` characters, and never a placeholder.
     * `person` is the caller, and the record method never hands anybody else's id.
     */
    renamePerson(person: string, typed: unknown): Result<{ name: string }> {
      const name = personNameOf(typed);
      if (!name.ok) return name;
      const out = mirror(person, { name: name.value });
      if (!out.ok) return out;
      /* A PERSON THIS RECORD HAS NO ROW FOR IS NOBODY WHO COULD HAVE ASKED: the record method has already admitted them
         as a member, and a member always has a mirror, so this is a record that lost it, said rather than hidden. */
      if (out.value.name === null) return no('OUT_OF_BOUNDS', 'This record has no row for you yet, so there is no name here to change.', { at: 'person' });
      return ok({ name: name.value });
    },

    /**
     * A name or address the Directory has already moved, carried into this record: the host's call, for every record
     * the person belongs to, after `renamePerson` in one of them or after a new sign-in address was confirmed.
     */
    mirrorPerson(person: string, change: PersonChange): Result<PersonMirrored> {
      if (change.name !== undefined) {
        const name = personNameOf(change.name);
        if (!name.ok) return name;
        return mirror(person, { ...change, name: name.value });
      }
      return mirror(person, change);
    },
  };
}
