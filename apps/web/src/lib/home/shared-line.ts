/**
 * Today's one line about what the owner has shared out: the words and the link's own words.
 *
 * ASKED AFTER TODAY HAS DRAWN (`sharedOut`, an owner's or an Admin's), never a part of `boot`, which an owner is
 * answered byte for byte as before sharing.
 *
 * A SHARE MADE TODAY IS SAID BY ITS OWN WORDS, so a share he did not make is seen the day it was made: "You shared Kiln
 * with priya@studio.co." and "Not you? Stop it". More than one made today is counted. With none made today it says who
 * the shares are with, by name, "Shared with Priya, Sam and 2 more.", and "See who". `needs` is the record's: a wide
 * share made today on an account with no passkey to have confirmed it, the one line of its kind drawn in red.
 *
 * Digits, never number words; names, never ids; no em dashes.
 */

/** What `sharedOut` answers: live shares, who they are with by name, those made today, and whether one needs him. */
export type SharedOut = { live: number; names: string[]; more: number; fresh: { id: string; said: string }[]; needs: boolean };

export type SharedLine = { words: string; go: string; needs: boolean };

/** `sharedOut`'s answer as Today keeps it, or nothing for an answer in another shape or none at all. */
export function sharedFrom(v: unknown): SharedOut | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const s = v as Record<string, unknown>;
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!whole(s.live) || s.live === 0 || !whole(s.more) || !Array.isArray(s.names) || !Array.isArray(s.fresh)) return undefined;
  const fresh = s.fresh.flatMap((f) =>
    typeof f === 'object' && f !== null && typeof (f as { id?: unknown }).id === 'string' && typeof (f as { said?: unknown }).said === 'string'
      ? [{ id: (f as { id: string }).id, said: (f as { said: string }).said }]
      : [],
  );
  return { live: s.live, names: s.names.filter((n): n is string => typeof n === 'string' && n.trim() !== ''), more: s.more, fresh, needs: s.needs === true };
}

/** "Priya", "Priya and Sam", "Priya, Sam and Ana", "Priya, Sam and 2 more". */
const joined = (names: readonly string[], more: number): string => {
  const all = more > 0 ? [...names, `${more.toLocaleString('en-GB')} more`] : [...names];
  return all.length <= 1 ? (all[0] ?? '') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)!}`;
};

export function sharedLine(s: SharedOut): SharedLine | null {
  if (s.live === 0) return null;
  if (s.fresh.length === 1) return { words: s.fresh[0]!.said, go: 'Not you? Stop it', needs: s.needs };
  if (s.fresh.length > 1) return { words: `${s.fresh.length.toLocaleString('en-GB')} shares were made today.`, go: 'Not you? See them', needs: s.needs };
  const who = joined(s.names, s.more);
  return { words: who === '' ? 'Part of this record is shared.' : `Shared with ${who}.`, go: 'See who', needs: false };
}
