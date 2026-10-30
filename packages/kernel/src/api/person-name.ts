/**
 * A person's own name and sign-in address, as this record mirrors them: `renamePerson` and `mirrorPerson`, so a name
 * can be changed.
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

/** Where a person whose real name reads as a placeholder writes, said in the refusal so they are not stuck. */
export const PERSON_NAME_SUPPORT = 'support@brain.dog';

/**
 * A template's field anywhere in a name: a doubled bracket (`{{first_name}}`, `[[Name]]`), `${first}`, a mail merge's
 * `*|FNAME|*` or `%FIRST_NAME%`. No name is spelled with these, so they are refused wherever they stand.
 */
const MERGE = /\{\{[^{}]*\}\}|\[\[[^[\]]*\]\]|\$\{[^}]*\}|\*\|[^|]*\|\*|%[\p{L}_]+%/u;

/**
 * The whole name inside one bracketed span, however many brackets deep: a run of opening brackets, no closing bracket,
 * a run of closing ones (`[Mara]`, `{{ owner }}`, `【山田】`). The Worker's provisioning rule, so a name sign-up takes is
 * a name a rename takes. THE RUNS KEEP `((Name))` REFUSED and the one span keeps `(Mara) [work]`, two notes, a name.
 */
const WHOLE = /^\p{Ps}+[^\p{Pe}]*\p{Pe}+$/u;

/** A bracketed part: square, braced, or round. A round one is a note (`Mara (work)`), so its words are not read. */
const PART = /\[([^[\]]*)\]|\{([^{}]*)\}|\(([^()]*)\)/gu;

/** A form's field word, which a square bracket or a brace around it makes a field nobody filled: `[First] [Last]`. */
const FIELD_WORD = /^(first|last|name|your)$/u;

/** A field's label run together, as `spellingOf` writes it, in any bracket: `[yourname]`, `[lastname]`, `(your name)`. */
const FIELD_LABEL = /^((first|last|full|your)?name|firstlast)$/u;

/** The words of a bracketed part: split at `_`, spaces, hyphens and dots, and where a lower-case letter meets a capital. */
const wordsOf = (part: string): string[] =>
  part
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .toLowerCase()
    .split(/[\s_.-]+/u)
    .filter(Boolean);

/**
 * The spellings a form left in place of a name, compared as `spellingOf` writes them, so `Your.Name`, `y o u r n a m e`
 * and `“Name”` are each one entry. The audit's thirty-one, which were all stored, "Your Name", "First Name" and "Last Name". A WHOLE NAME, NEVER A WORD IN ONE: `Name` alone is refused
 * and `Namelia` is a name.
 */
const SPELLINGS: ReadonlySet<string> = new Set([
  'name', 'fullname', 'firstname', 'lastname', 'firstlast', 'firstnamelastname', 'yourname', 'owner', 'janedoe', 'johndoe',
  'todo', 'changeme', '$name', '${name}', '%name%', ':name', '$env:username',
]);

/** A name as `SPELLINGS` holds it: one compatibility form, lower case, and only its letters, digits and `$ : % { }`. */
const spellingOf = (name: string): string =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ᐸᐳ]|[^\p{L}\p{N}$:%{}]/gu, '');

/**
 * Whether a name is a placeholder nobody filled in rather than a name. Exported so the Worker's provisioning and a
 * screen can ask the same question the record asks.
 *
 * A BRACKET IS NOT A PLACEHOLDER BY ITSELF. Any `[...]` part was refused, so `(Mara) [work]` and `Zoë [Z] O’Brien`
 * were refused at rename while sign-up stored them. A bracketed or braced part is refused only when it is the whole
 * name or holds a field word; the spellings are a short list compared whole, because a list of spellings has no end
 * and the person it wrongly refuses is told how to reach a person.
 */
export function placeholderName(name: string): boolean {
  const trimmed = name.trim();
  if (MERGE.test(trimmed) || WHOLE.test(trimmed)) return true;
  for (const m of trimmed.matchAll(PART)) {
    const part = m[1] ?? m[2] ?? m[3] ?? '';
    if (FIELD_LABEL.test(spellingOf(part))) return true;
    if (m[3] === undefined && wordsOf(part).some((w) => FIELD_WORD.test(w))) return true;
  }
  return SPELLINGS.has(spellingOf(trimmed));
}

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
  if (placeholderName(name))
    return no(
      'VALUE_MALFORMED',
      `That reads as a form's placeholder, such as Your Name or {{first_name}}, so type the name you want to be called. If it really is your name, write to ${PERSON_NAME_SUPPORT} and we will set it for you.`,
      { at: 'name' },
    );
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
      if (out.value.name === null) return no('OUT_OF_BOUNDS', 'You are not in People yet, so there is no name to change.', { at: 'person' });
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
