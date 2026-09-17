/**
 * What a credential looks like when it is a value, not a key name.
 *
 * `normalise` refused a `token:` key and nothing else, so a pack whose page said `heading: sk_live_...` or whose
 * example row held a GitHub token in a note went into a file people share. A shared use case is exactly that file,
 * exported from somebody's own record, so the value is looked at too.
 *
 * THE PATTERNS ARE THE SHAPES PROVIDERS PUBLISH, prefix and length, so an ordinary sentence never matches. A long
 * random string with no prefix is not refused: it could be an id, and a false refusal on a person's own example row
 * would teach them to ignore this.
 */

type Json = unknown;

/** Keys whose value is a credential by any reading. A pack is a file people share. */
const SECRETS = new Set(['secret', 'token', 'password', 'api_key', 'apikey', 'ciphertext', 'private_key', 'bearer']);

/**
 * The first credential-shaped key anywhere in a body, or `null`.
 *
 * A SEEN-SET, because `normalise` takes an `unknown` and a caller in this process can hand it a body that points at
 * itself. A stack overflow out of a function that returns a `Result` is the one thing this package promises does not
 * happen.
 */
export function credentialKey(body: Json, seen: WeakSet<object> = new WeakSet()): string | null {
  if (typeof body !== 'object' || body === null) return null;
  if (seen.has(body)) return null;
  seen.add(body);
  for (const [key, value] of Array.isArray(body) ? body.map((v, i) => [String(i), v] as const) : Object.entries(body)) {
    if (!Array.isArray(body) && SECRETS.has(key.toLowerCase()) && typeof value === 'string' && value.trim()) return key;
    const found = credentialKey(value, seen);
    if (found) return found;
  }
  return null;
}

const SHAPES: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/u,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/u,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/u,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/u,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{35}\b/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/u,
  /\bhttps?:\/\/[^\s/:@]+:[^\s/@]+@/u,
];

/** Whether one string looks like a credential. */
export const looksLikeCredential = (text: string): boolean => SHAPES.some((shape) => shape.test(text));

/** The path to the first string value anywhere in `body` that looks like a credential, or `null`. */
export function credentialValue(body: Json, path = '', seen: WeakSet<object> = new WeakSet()): string | null {
  if (typeof body === 'string') return looksLikeCredential(body) ? path || 'value' : null;
  if (typeof body !== 'object' || body === null) return null;
  if (seen.has(body)) return null;
  seen.add(body);
  const entries: [string, Json][] = Array.isArray(body) ? body.map((v, i) => [String(i), v]) : Object.entries(body);
  for (const [key, value] of entries) {
    const at = path === '' ? key : Array.isArray(body) ? `${path}[${key}]` : `${path}.${key}`;
    const found = credentialValue(value, at, seen);
    if (found) return found;
  }
  return null;
}
