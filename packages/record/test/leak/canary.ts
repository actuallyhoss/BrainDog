/**
 * The canaries of the leak matrix (sharing plan §4.1) and the one check every property ends in: does an answer carry
 * anything its caller may not see.
 *
 * A ROW CARRIES ITS OWN WORD IN EVERY TEXT FIELD. `zq<hex>` on a row a grantee may be kept from, `zp<hex>` on a row
 * its maker kept private, and a unique prime as its amount. `zh<hex>` is a task's notes beside its word, the value a
 * share that hides a field keeps from its grantee (sharing plan §2.7). A row is in or out of sight per caller, so the
 * word belongs to the row and the caller decides whether it is a leak: whatever an answer carries of a row out of the
 * caller's sight (its word, its id, its amount), or of a field hidden from them on a row in sight, is named by `leaks`.
 */

/** mulberry32: a seeded PRNG, so every run draws the same cases (as `kernel/test/lens.test.ts` does). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The canary words, minted in order from one seed, so a fixture built twice carries the same words. */
export function minter(seed = 0x5eed) {
  const next = mulberry32(seed);
  const seen = new Set<string>();
  const word = (prefix: 'zq' | 'zp' | 'zh'): string => {
    for (;;) {
      const hex = Math.floor(next() * 0xffffffff).toString(16).padStart(8, '0');
      if (!seen.has(hex)) {
        seen.add(hex);
        return `${prefix}${hex}`;
      }
    }
  };
  return { word };
}

/**
 * Unique primes for amounts, five digits and above 90,000, so no count, year or page size in an answer is one of them
 * by chance, and a sum of two of them is never one either (two odd primes sum to an even number).
 */
export function primes(from = 90_001): () => number {
  let n = from;
  const isPrime = (k: number): boolean => {
    if (k % 2 === 0) return false;
    for (let d = 3; d * d <= k; d += 2) if (k % d === 0) return false;
    return true;
  };
  return () => {
    while (!isPrime(n)) n += 1;
    const out = n;
    n += 1;
    return out;
  };
}

/** What one row gives away when it is out of a caller's sight: its word, its id, and its amount when it has one. */
export type Canary = { label: string; word: string; id?: string; amount?: number };

/** How an amount may be written in an answer: as stored, with thousands commas, and as minor units shown as major. */
const amountForms = (n: number): string[] => {
  const s = String(n);
  return [s, n.toLocaleString('en-GB'), `${s.slice(0, -2)}.${s.slice(-2)}`];
};

/**
 * Every canary of `out` an answer carries, each named by its row's label and what gave it away.
 *
 * THE ANSWER IS READ AS ITS JSON TEXT, so a word inside a sentence, a refusal's `fix`, a figure's label or a cursor
 * is found as surely as one in a row's fields. An amount is matched as a whole number, never inside a longer one.
 */
export function leaks(answer: unknown, out: readonly Canary[]): string[] {
  const text = JSON.stringify(answer) ?? '';
  const found: string[] = [];
  for (const c of out) {
    if (c.word !== '' && text.includes(c.word)) found.push(`${c.label} (its word ${c.word})`);
    if (c.id !== undefined && text.includes(c.id)) found.push(`${c.label} (its id)`);
    if (c.amount !== undefined)
      for (const form of amountForms(c.amount))
        if (new RegExp(`(?<![\\d.,])${form.replaceAll('.', '\\.')}(?![\\d]|[.,]\\d)`, 'u').test(text)) {
          found.push(`${c.label} (its amount ${form})`);
          break;
        }
  }
  return found;
}
