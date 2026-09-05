/**
 * Ids, and the two kinds a record has.
 *
 * A ROW HAS TWO. `id` is a 26-character ULID and is never spoken — it is what a `ref` stores and
 * what an export keys on, and it must survive a rename, a merge and a restore. `seq` is the number
 * a person says out loud, allocated per register from 1, and it is the reason a customer's record is
 * its own database at all: in a shared one the second customer's first task is #4,732.
 *
 * ULID AND NOT UUID, for the property that matters here: a ULID sorts by time. `event.rowid` is the
 * record's version and `MAX(rowid)` is monotonic, so an id that also sorts by time makes an export
 * page cheap and a "what happened next" query an index scan rather than a join.
 *
 * TWO IDS MINTED IN THE SAME MILLISECOND ARE STRICTLY INCREASING (K10). Without that, two rows
 * written in one transaction can sort either way, and every list that pages by id can show one of
 * them twice or neither.
 */

/** Crockford's base 32: no I, L, O or U, so a number read aloud cannot be written back wrong. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type Mint = () => string;

/**
 * A ULID minter over a clock, monotonic within a millisecond.
 *
 * The randomness is incremented rather than redrawn when the millisecond has not moved: redrawing
 * gives two ids that sort by luck, and the whole point of the format is that they sort by time.
 */
export function ulids(now: () => number): Mint {
  let lastMs = -1;
  let last = new Uint8Array(10);

  return () => {
    const ms = now();
    if (ms === lastMs) {
      // Increment the 80-bit tail. The carry runs out only after 2^80 ids in one millisecond.
      for (let i = 9; i >= 0; i--) {
        if (last[i]! < 255) {
          last[i]!++;
          break;
        }
        last[i] = 0;
      }
    } else {
      lastMs = ms;
      last = crypto.getRandomValues(new Uint8Array(10));
    }

    let out = '';
    // The timestamp: 48 bits, ten characters, most significant first.
    for (let shift = 45; shift >= 0; shift -= 5) out += ALPHABET[Math.floor(ms / 2 ** shift) % 32];
    // The tail: 80 bits, sixteen characters.
    let bits = 0;
    let acc = 0;
    for (const byte of last) {
      acc = (acc << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        out += ALPHABET[(acc >> bits) & 31];
      }
    }
    return out.slice(0, 26);
  };
}

export const isUlid = (s: string): boolean => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(s);

/** When a ULID was minted, from the id alone. */
export function ulidTime(id: string): number {
  let ms = 0;
  for (const c of id.slice(0, 10)) ms = ms * 32 + ALPHABET.indexOf(c);
  return ms;
}
