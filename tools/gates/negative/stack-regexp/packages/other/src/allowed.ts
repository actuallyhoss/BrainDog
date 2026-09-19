/**
 * THE OTHER HALF OF THE SAME RULE: a regular expression the gate must NOT name.
 *
 * The ban belongs to `packages/extract`, which matches a stranger's payload, and to nowhere else.
 * Every other package matches literals it wrote itself, and banning those would be the gate
 * inventing a rule the stack does not have (`31 §3` layer 4). A count of two, not three, is what
 * proves the scope is real rather than accidental.
 */

export const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/gu, '-');
