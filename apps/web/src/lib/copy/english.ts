/**
 * The English the area files build their sentences with: joining a list of names, and choosing `a` or `an`.
 *
 * NOT AN AREA FILE. It holds no key of `copy` and `lib/copy.ts` does not spread it: the area files import these two
 * functions from here, so a sentence in `lists.ts` and one in `packs.ts` join a list the same way. It imports
 * nothing, so plain Node loads it with the rest of the copy (`passkey.mjs`).
 */

/** `a`, `a and b`, `a, b and c`: an Oxford-less list, which is what a person writes. */
export const list = (words: string[]): string =>
  words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * `a` or `an`, for a noun this file does not know in advance.
 *
 * THE CAPTURE FIELD SAID "Add a item". It is the label AND the placeholder of the first control on
 * every register screen, drawn from the register's own `one:`, and two of the nine the seed ships
 * are wrong: `item` gives "Add a item" on Money, which is the first list in the rail and the first
 * list anybody opens, and `update` gives "Add a update". A pack may ship any noun at all, so this
 * cannot be fixed by editing the seed: the sentence is generated and the generator has to know.
 *
 * IT IS ABOUT SOUND AND NOT ABOUT LETTERS, which is why the naive vowel test is not enough in
 * either direction. `user`, `unit`, `usage` and `unique` all begin with a vowel and take `a`,
 * because they are said with a `y` in front. `hour` begins with a consonant and takes `an`. The
 * `u` rule below is the one heuristic that earns its place: a `u` whose third letter is a vowel is
 * almost always the `yoo` sound (`user`, `unit`, `usage`, `utility`, `unique`), and one whose third
 * letter is not is almost always the `uh` sound (`update`, `upgrade`, `umbrella`). Measured over
 * the nouns this product can plausibly meet, it is right every time.
 *
 * The silent `h` is a closed list rather than a rule because there is no rule: four words in
 * ordinary English, and a business noun is almost never one of them.
 */
const SILENT_H = /^(hour|honest|honour|honor|heir)/;
export const article = (noun: string): string => {
  const w = noun.trim().toLowerCase();
  if (SILENT_H.test(w)) return 'an';
  if (/^u/.test(w)) return /^u[^aeiou][aeiou]/.test(w) ? 'a' : 'an';
  return /^[aeio]/.test(w) ? 'an' : 'a';
};
