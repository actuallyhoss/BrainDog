/**
 * The one seeded violation, and five decoys the gate must NOT name: a block comment, a line
 * comment, a glyph standing alone, a rule drawn after a heading, and two SQL column annotations.
 * The sixth is the README beside this file, which carries the same sentence as the published
 * fixture `em-dash-readme/` and is forgiven here for the one reason that this package is private.
 *
 * A BLOCK COMMENT IS NOT PROSE — this line is spaced on both sides and is forgiven because
 * of where it sits, not because of what it says.
 */

// A LINE COMMENT IS NOT PROSE EITHER — same argument, one syntax down.

/** The empty cell. A glyph standing alone is typography and is left alone. */
export const NOTHING = '—';

/** A rule drawn after a heading: the dash closes the line, so it has no space on its right. */
export const rule = (heading: string) => `${heading} —`;

/** Column annotations live in SQL line comments, one language down inside a literal. */
export const SCHEMA = `
  CREATE TABLE seeded (
    id   TEXT PRIMARY KEY,  -- the row's own id — spaced on both sides, and still a comment
    what TEXT NOT NULL      -- what it is for — likewise
  );
`;

/** AND THE ONE THAT IS PROSE. A refusal sentence is the most-read writing this product has. */
export const FIX = 'Reconnect the credential — the provider rejected it.';
