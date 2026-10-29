/**
 * NET WORTH IN GRAMS, the night's worth restated by what a gram of 24k gold sells for in Holdings' Gold rates: the
 * newest rate in use, converted with the record's own rates when it is kept in another currency (`worthOfNight` in
 * `index.ts`). Nothing when the night's list does not declare the field or the record keeps no such rate.
 *
 * ITS OWN FILE BECAUSE IT NAMES AN ADD-ON'S LIST AND FIELD, which the core may not (`shell-words`, `core-names`). It is
 * held there until SHL-A23 has Holdings declare the figure and the kernel read it off the declaration.
 */

import type { Sql } from '@braindog/ports';

import type { Json } from './coerce.ts';

export function worthInGrams(
  sql: Sql,
  declared: ReadonlySet<string>,
  holds: (list: string) => boolean,
  worth: number,
  currency: string,
  into: (amount: number, from: string, to: string) => number | null,
): Record<string, Json> {
  if (!declared.has('worth_gold') || !holds('gold_rates')) return {};
  const rate = sql.one<{ per_gram: string }>(
    `SELECT json_extract(fields, '$.per_gram') AS per_gram FROM entry
      WHERE register = 'gold_rates' AND deleted_at IS NULL AND json_extract(fields, '$.karat') = '24k'
        AND json_extract(fields, '$.live') = 1
      ORDER BY json_extract(fields, '$.on') DESC, seq DESC LIMIT 1`,
  );
  let gram: { amount?: unknown; currency?: unknown } | null = null;
  try {
    gram = rate?.per_gram ? (JSON.parse(rate.per_gram) as { amount?: unknown; currency?: unknown }) : null;
  } catch {
    gram = null;
  }
  if (!gram || typeof gram.amount !== 'number' || gram.amount <= 0 || typeof gram.currency !== 'string') return {};
  const per = into(gram.amount, gram.currency, currency);
  return per !== null && per > 0 ? { worth_gold: Math.round((worth / per) * 100) / 100 } : {};
}
