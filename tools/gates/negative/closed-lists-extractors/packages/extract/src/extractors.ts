/**
 * The thirteen forms, seeded one word out of step with `34 §6`.
 *
 * `lookup` HAS BECOME `regex`, which is the shape this is really guarding against: the count still
 * reads ten, so anything that checks the number agrees, and the vocabulary a declaration may use to
 * read a stranger's message has quietly gained a member nobody reviewed and lost one authors were
 * told they had. A gate that counted would pass this file.
 */

export const EXTRACTORS = [
  'after',
  'before',
  'between',
  'money',
  'date',
  'text',
  'int',
  'decimal',
  'enum',
  'regex',
] as const;

export const COMBINATORS = ['first', 'nth', 'default'] as const;
