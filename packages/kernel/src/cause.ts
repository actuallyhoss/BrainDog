/**
 * A question has a cause (AGT-C07, "a question has a cause", D40.50): the key for what it is about, so it is asked once.
 *
 * TWO IDENTICAL QUESTIONS SEVEN SECONDS APART were filed on the owner's record (SG89 and SG90), and "Needs you" showed
 * one question twice, word for word, because a proposal was inserted as it came with no look at what was open. A cause
 * is the look: one open question a cause, held by a unique index (migration 31), and a second proposal with the same
 * cause joins the first instead of filing.
 *
 * A FILER MAY SET ONE, and when it does not one is derived here from the body. THE RULE IS EXACT EQUALITY AFTER
 * SORTING. A derived cause that is too loose joins two questions that differ, which is worse than asking twice, so
 * nothing here is clever: two bodies share a cause only when they ask for the very same thing in any order. Anything
 * looser needs a cause its filer set.
 *
 * NO IMPORTS, because migration 31's data step derives causes with this file and `migrate.ts` imports the migration:
 * a cause that reached back into the kernel would be a cycle at the moment a record opens. The hash is SHA-256 written
 * out here, synchronous, since `propose` runs inside the write's transaction and WebCrypto answers a promise.
 */

/**
 * The shape of a cause: a letter or digit, then at most 199 of letters, digits and `# @ . _ : / -`, so a derived one
 * (`rowset#notes#9f2c…`), the record's (`write#notes#S12#…`) and the command line's (`skills#tidy@user`) all read.
 * No space, so a cause is a key and never a sentence; no other sign, so it can sit in a link.
 */
export const CAUSE = /^[\p{L}\p{N}][\p{L}\p{N}#@._:/-]{0,199}$/u;

/** Why a cause a filer gave is refused, or `null` when it is one. */
export function causeFault(cause: unknown): string | null {
  if (typeof cause !== 'string') return 'cause is a short key for what this is about, as text, such as invoice-totals.';
  if (!CAUSE.test(cause))
    return `cause is ${JSON.stringify(cause.slice(0, 60))}; it is one short key of letters, digits and # @ . _ : / -, at most 200 characters, such as invoice-totals.`;
  return null;
}

/** How many hex characters of the hash a cause keeps: 96 bits, past any record's count of questions. */
const KEPT = 24;

/**
 * The cause a body derives, or `null` when it derives none.
 *
 *   - a rowset: its list, and each row's target (or, for a new row, the row itself) with its values, sorted;
 *   - a change: the declaration it is filed under and what it adds (`to`);
 *   - a pack: the verb and the pack, `install#work`, which is the command line's own cause for that question;
 *   - options: the question's words folded, the option ids sorted, and what it is `about` and who it is put `to` when it
 *     says, so it needs `question`;
 *   - a pattern, settings or an arrangement: the whole body, as it is asked.
 *
 * What the record works out for itself (`egress`, `approve`, a `from_version`) and the cause a body may carry are left
 * out, so the same ask derives the same cause whoever drew it and whenever.
 */
export function causeOf(kind: string, body: Record<string, unknown>, question?: string): string | null {
  if (!isMap(body)) return null;
  if (kind === 'rowset') {
    if (typeof body.register !== 'string' || !Array.isArray(body.rows) || body.rows.length === 0) return null;
    return clip(`rowset#${body.register}#${hash(rowKeys(body.rows))}`);
  }
  if (kind === 'change') {
    if (typeof body.declaration_id !== 'string' || body.to === undefined) return null;
    return clip(`change#${body.declaration_id}#${hash(canon(body.to))}`);
  }
  if (kind === 'pack') {
    const verb = ['install', 'enable', 'disable'].find((v) => typeof body[v] === 'string');
    return verb === undefined ? null : clip(`${verb}#${String(body[verb])}`);
  }
  if (kind === 'options') {
    if (typeof question !== 'string' || !Array.isArray(body.options)) return null;
    const ids = body.options.map((o) => (isMap(o) && typeof o.id === 'string' ? o.id : '')).sort();
    /* WHAT IT IS ABOUT AND WHO IT IS PUT TO ARE PART OF THE ASK: "Approve this?" about two things, or to two members, is
       two questions, and joining the second away left its agent believing it was filed. Only when present, so an ask
       with neither derives the cause it always did; a cause already stored keeps its old hash, which is harmless, since
       a later ask with `about` or `to` files beside it once and is joined from then on. */
    const asked: unknown[] = [fold(question), ids];
    if (body.about !== undefined || body.to !== undefined) asked.push({ about: body.about, to: body.to });
    return `options#${hash(canon(asked))}`;
  }
  if (kind === 'pattern' || kind === 'settings' || kind === 'arrange') {
    const { cause: _c, egress: _e, approve: _a, ...asked } = body;
    return `${kind}#${hash(canon(asked))}`;
  }
  return null;
}

/**
 * Whether every row of a rowset already holds every value proposed: a question that would change nothing.
 *
 * `holds` reads a row's fields by its list and target, `null` for a row that is not there. Without it nothing can be
 * known, so the answer is `false` and the question is asked. A new row always changes something, and so does a value
 * that is spelled differently from the one held: the comparison is exact, and a miss only means the owner is asked.
 */
export function noop(body: Record<string, unknown>, holds?: (register: string, at: string) => Record<string, unknown> | null): boolean {
  if (!holds || !isMap(body) || typeof body.register !== 'string' || !Array.isArray(body.rows) || body.rows.length === 0) return false;
  const register = body.register;
  return body.rows.every((r) => {
    if (!isMap(r) || typeof r.at !== 'string' || !isMap(r.patch)) return false;
    const held = holds(register, r.at);
    if (held === null) return false;
    return Object.entries(r.patch).every(([field, value]) => canon(value ?? null) === canon(held[field] ?? null));
  });
}

/** Each row as `[target, values]`, sorted: an update by its `at` and its patch, a new row by its own fields. */
function rowKeys(rows: readonly unknown[]): string {
  const keys = rows.map((r) => (isMap(r) && typeof r.at === 'string' ? canon([r.at, r.patch ?? null]) : canon(['', r ?? null])));
  return canon(keys.sort());
}

/** A question's words as they compare: lower case, accents and signs gone, one space between words. */
export function fold(words: string): string {
  return words
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** A value written one way: object keys sorted, nothing else changed. `undefined` reads as `null`. */
export function canon(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canon(v)).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canon((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A derived cause held to the shape: a pack id that does not fit derives none rather than a key the index refuses. */
const clip = (cause: string): string | null => (CAUSE.test(cause) ? cause : null);

/** The first `KEPT` hex characters of the SHA-256 of `text`'s UTF-8 bytes. */
function hash(text: string): string {
  return sha256(new TextEncoder().encode(text)).slice(0, KEPT);
}

/** SHA-256's round constants: the first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 (FIPS 180-4) of `bytes`, as lower-case hex. Checked against the standard's vectors in `cause.test.ts`. */
export function sha256(bytes: Uint8Array): string {
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const padded = new Uint8Array((((bytes.length + 9 + 63) >> 6) << 6));
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let at = 0; at < padded.length; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(at + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      [k, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    const next = [a, b, c, d, e, f, g, k];
    for (let i = 0; i < 8; i++) h[i] = (h[i]! + next[i]!) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}
