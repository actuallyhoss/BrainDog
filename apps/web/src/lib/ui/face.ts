/**
 * The letter in a writer's disc.
 *
 * THE ARTICLE IS NOT THE NAME. `actorOf` says "the assistant" and "the record itself", because a
 * person reads those words beside the disc, and a first-letter rule gave both of them the same "T",
 * which is two different writers wearing one face. An email is a person nobody has named yet, so the
 * part before the @ stands in for the name.
 */
export const initialOf = (name: string): string => {
  const bare = name.trim().replace(/^the\s+/i, '');
  const first = [...(bare.split('@')[0] ?? '')][0];
  /* A disc with nothing in it reads as a rendering fault, so an empty name still draws a mark. */
  return first ? first.toUpperCase() : '?';
};
