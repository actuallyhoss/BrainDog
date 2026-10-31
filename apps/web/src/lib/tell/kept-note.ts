/**
 * WHAT A NOTE READS ONCE A FACT IS KEPT ON IT (review 31 Oct p, RP2).
 *
 * "Mum's birthday is 15 Nov" on a note that read "Birthday 14 Nov" made "Birthday 14 Nov. Birthday 15 Nov": two
 * birthdays on her page. A birthday already in the note is replaced where it stands; anything else is added after what
 * the note holds. A note that already says it is left alone (`null`), so the press writes nothing.
 *
 * PURE, so a test reads the answer; Tell's card only calls it.
 */

/** A birthday as Tell writes it on a note: "Birthday 14 Nov". */
const BIRTHDAY = /\bBirthday\s+\d{1,2}\s+\p{Lu}\p{Ll}+\b/u;

/** The note `had` with `line` kept on it, or `null` when it already says it. */
export function noteWith(had: string, line: string): string | null {
  const was = had.trim();
  const old = BIRTHDAY.test(line) ? BIRTHDAY.exec(was) : null;
  if (old) return old[0] === line ? null : `${was.slice(0, old.index)}${line}${was.slice(old.index + old[0].length)}`;
  if (was.includes(line)) return null;
  return was === '' ? line : `${was}${/[.!?]$/u.test(was) ? '' : '.'} ${line}`;
}
