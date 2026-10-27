/**
 * Whether a person could still sign in if one device were lost: one line, said over the passkeys Settings already
 * lists (step 1, the half the record already holds).
 *
 * THE KIND OF DEVICE IS READ OFF THE LABEL, because that is all the record keeps of it. A new passkey is named by
 * `platformLabel` (`apps/web/src/lib/auth.ts`): iPhone, iPad, Android, Windows Hello, Chromebook, Mac, or Passkey when
 * the browser said nothing. A person may rename one, so the words a person would type are read too ("Work laptop",
 * "My phone"). A label that names no device counts toward the number and is never guessed at.
 *
 * SHORT BELOW TWO. One passkey is one lost device away from the long way back in, so the line says to add a second,
 * on the other kind of device when the one there is says which kind it is.
 *
 * WHAT IS LEFT OUT: whether a phone has signed in within thirty days, and whether a test notification was ever shown.
 * The record keeps neither (it would take a session's device and `push_sub.shown_at`), so neither is said here.
 *
 * PURE, so `node --test` holds it.
 */

/** The kinds of device a passkey's label can name, in the order a line lists them. */
export type DeviceKind = 'computer' | 'phone' | 'tablet';

const KINDS: readonly { kind: DeviceKind; one: string; many: string; test: RegExp }[] = [
  { kind: 'computer', one: 'a computer', many: 'computers', test: /\b(mac|macbook|imac|windows|chromebook|laptop|desktop|computer|pc)\b/iu },
  { kind: 'phone', one: 'a phone', many: 'phones', test: /\b(iphone|android|phone|pixel|galaxy)\b/iu },
  { kind: 'tablet', one: 'a tablet', many: 'tablets', test: /\b(ipad|tablet)\b/iu },
];

/** The kind of device a label names, or `null` when it names none. A phone is tested before a computer, so "Pixel" or
    "iPhone" never reads as anything else, and a tablet before both, so "iPad" stays a tablet. */
export function kindOf(label: string | null | undefined): DeviceKind | null {
  if (!label) return null;
  for (const k of ['tablet', 'phone', 'computer'] as const) if (KINDS.find((x) => x.kind === k)?.test.test(label)) return k;
  return null;
}

/** "a and b", "a, b and c". */
const joined = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

/**
 * The line above the passkeys: how many, on which kinds of device, and whether losing one would lock the person out.
 * `short` is true below two, which is when the line asks for one more.
 */
export function passkeysSaid(keys: readonly { label: string | null; created_at?: string }[]): { line: string; short: boolean } {
  const kinds = keys.map((k) => kindOf(k.label));
  const seen = KINDS.filter((k) => kinds.includes(k.kind));
  if (keys.length === 0) {
    return { line: 'No passkey yet. Add one, then a second on your phone, so losing one device does not lock you out.', short: true };
  }
  if (keys.length === 1) {
    const one = seen[0];
    const other = one?.kind === 'phone' ? 'on a computer' : 'on your phone';
    return {
      line: `One passkey${one ? `, on ${one.one}` : ''}. Add a second, ${other}, so losing ${one ? 'that' : 'one'} device does not lock you out.`,
      short: true,
    };
  }
  const n = keys.length;
  const lose = 'You can sign in if you lose one.';
  if (seen.length === 0) return { line: `${n} passkeys. ${lose}`, short: false };
  if (seen.length === 1 && seen[0]) {
    /* ONE KIND NAMED: all of them on it, or only how many are, so an unnamed one is never placed on that kind. */
    const k = seen[0];
    const c = kinds.filter((x) => x === k.kind).length;
    const where = c === n ? `${n === 2 ? 'both' : 'all'} on ${k.many}` : c === 1 ? `one on ${k.one}` : `${c} on ${k.many}`;
    return { line: `${n} passkeys, ${where}. ${lose}`, short: false };
  }
  return { line: `${n} passkeys: ${joined(seen.map((k) => `on ${k.one}`))}. ${lose}`, short: false };
}
