/**
 * A person's hue, apart from the rest of a face (`face.ts`).
 *
 * A FILE OF ITS OWN, because the rail colours each project's initial with it on every screen, and `face.ts` carries the
 * names of every rule a template ships to tell a rule's face from a person's.
 */

/** How many hues a person's face is drawn from, thirty degrees apart round the wheel. */
export const HUES = 12;

/**
 * A person's hue, from something that stays the same for them (their id where the caller has it, else their name).
 *
 * TWELVE STEPS, NOT 360. Two hues a few degrees apart read as the same colour, so a face that should tell two people
 * apart would not; twelve steps at the theme's mark lightness and chroma are each their own colour, and past twelve
 * people the name beside the face is what carries who it is anyway. The hash is FNV-1a over the code points, so the
 * same person is the same hue on every screen and every visit.
 */
export const hueFor = (key: string): number => {
  let hash = 0x811c9dc5;
  for (const ch of key) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % HUES) * (360 / HUES);
};
