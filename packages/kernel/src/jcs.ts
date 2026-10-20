/**
 * RFC 8785 canonical JSON, which is the whole of what a checksum needs.
 *
 * Keys sorted, no whitespace, and `JSON.stringify`'s own number and string escaping, which is
 * already RFC 8785's for every value this record can hold, because a field is coerced before it is
 * stored and the coercers do not produce a number JSON cannot round-trip.
 *
 * A FILE OF ITS OWN, apart from `declare.ts` where it was written: a reader that settles a body by its canonical form
 * (`packages/declare/src/when.ts`, on the app's Today) needs these five lines and none of the validator around them.
 */

import type { Json } from './coerce.ts';

export function jcs(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k] as Json)}`).join(',')}}`;
}
