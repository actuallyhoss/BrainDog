/**
 * Ids, and the two kinds a record has.
 *
 * A ROW HAS TWO. `id` is a 26-character ULID and is never spoken: it is what a `ref` stores and
 * what an export keys on, and it must survive a rename, a merge and a restore. `seq` is the number
 * a person says out loud, allocated per register from 1, and it is the reason a customer's record is
 * its own database at all: in a shared one the second customer's first task is #4,732.
 *
 * ULID AND NOT UUID, for the property that matters here: a ULID sorts by time. `event.rowid` is the
 * record's version and `MAX(rowid)` is monotonic, so an id that also sorts by time makes an export
 * page cheap and a "what happened next" query an index scan rather than a join.
 *
 * TWO IDS MINTED IN THE SAME MILLISECOND ARE STRICTLY INCREASING. Without that, two rows
 * written in one transaction can sort either way, and every list that pages by id can show one of
 * them twice or neither.
 */

/** Crockford's base 32: no I, L, O or U, so a number read aloud cannot be written back wrong. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type Mint = () => string;

/**
 * A ULID minter over a clock, monotonic within a millisecond.
 *
 * INSIDE A MILLISECOND THE TAIL STEPS UP BY A RANDOM AMOUNT, from 1 to 2^32. Redrawing it gives two ids that sort by
 * luck, and the whole point of the format is that they sort by time; but adding one made the tail a counter, and a
 * member invited to one list read the exact number of hidden writes between two of her lines off their tails (measured:
 * 2, 4, 8 and 22 apart for 0, 1, 3 and 10 hidden diary writes). A random step keeps the order and makes one gap answer
 * many counts. What it cannot hide is that the gap grows with the count: every step averages 2^31 and none passes 2^32,
 * so a gap over 2^34 held at least four other ids and most likely about seven. That is a bound and an estimate with a
 * spread of its own, where the counter was the exact figure, and `ids-tail.test.ts` holds the part that is closed: no
 * difference names the count it came from.
 *
 * A FRESH TAIL HAS ITS TOP BIT CLEAR, so it starts in the lower half of the 80 bits and the steps have 2^79 of headroom:
 * 2^47 ids in one millisecond at the largest step before the tail could run past 80 bits and sort below the last id.
 */
export function ulids(now: () => number): Mint {
  let lastMs = -1;
  let tail = 0n;

  return () => {
    const ms = now();
    if (ms === lastMs) {
      tail += 1n + BigInt(crypto.getRandomValues(new Uint32Array(1))[0]!);
    } else {
      lastMs = ms;
      const fresh = crypto.getRandomValues(new Uint8Array(10));
      fresh[0] = fresh[0]! & 0x7f;
      tail = 0n;
      for (const byte of fresh) tail = (tail << 8n) | BigInt(byte);
    }

    let out = '';
    // The timestamp: 48 bits, ten characters, most significant first.
    for (let shift = 45; shift >= 0; shift -= 5) out += ALPHABET[Math.floor(ms / 2 ** shift) % 32];
    // The tail: 80 bits, sixteen characters.
    for (let shift = 75n; shift >= 0n; shift -= 5n) out += ALPHABET[Number((tail >> shift) & 31n)];
    return out;
  };
}

export const isUlid = (s: string): boolean => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(s);

/** When a ULID was minted, from the id alone. */
export function ulidTime(id: string): number {
  let ms = 0;
  for (const c of id.slice(0, 10)) ms = ms * 32 + ALPHABET.indexOf(c);
  return ms;
}
