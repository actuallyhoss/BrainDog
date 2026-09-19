/**
 * Both ways of reaching a regular expression, in the one package that may not.
 *
 * A LITERAL AND A CONSTRUCTOR ARE ONE BAN AND TWO PATTERNS, and a gate that knows the first and not
 * the second bans nothing: `new RegExp(literal)` is what somebody writes the day after they are told
 * the slash form is not allowed. Both lines below must be named.
 */

/** A literal in value position. */
export const money = /(\d[\d,.]*)/u;

/** And the same thing built from a string, which is the spelling the ban is really about. */
export const built = (source: string) => new RegExp(source, 'u');
