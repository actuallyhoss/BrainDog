/**
 * A day in an example row, counted from the day the record is made (`install.ts`).
 *
 * AN EXAMPLE WRITTEN `due: '+3d'` IS DUE THREE DAYS AFTER THE RECORD IS MADE, so a use case's Home has something in
 * its week on whatever day somebody starts, and never a date long past. Only a field the list declares as a `day`
 * or an `instant` is read this way; any other value is left as it is written.
 */

type Body = Record<string, unknown>;

const RELATIVE = /^([+-]?\d{1,4})d$/u;

/** Today as the record writes a day, from a clock reading. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** A day as the record writes one, `n` days from `today`. */
const dayFrom = (today: string, n: number): string => dayOf(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000);

/** An example's fields with every relative day in a `day` or `instant` field counted from `today`. */
function datedFields(fields: Body, types: ReadonlyMap<string, string>, today: string): Body {
  const out: Body = {};
  for (const [key, value] of Object.entries(fields)) {
    const type = types.get(key);
    const m = typeof value === 'string' && (type === 'day' || type === 'instant') ? RELATIVE.exec(value) : null;
    if (!m) out[key] = value;
    else out[key] = type === 'day' ? dayFrom(today, Number(m[1])) : `${dayFrom(today, Number(m[1]))}T09:00:00Z`;
  }
  return out;
}

/** A pack document whose example rows have their relative days counted from `today`. */
export function dated(doc: Body, today: string): Body {
  if (!Array.isArray(doc.seeds)) return doc;
  const types = new Map<string, Map<string, string>>();
  for (const d of (doc.declarations ?? []) as Body[])
    if (typeof d.register === 'string' && Array.isArray(d.fields)) types.set(d.register, new Map((d.fields as Body[]).map((f) => [String(f.id), String(f.type)])));
  return {
    ...doc,
    seeds: (doc.seeds as Body[]).map((s) => ({ ...s, fields: datedFields((s.fields ?? {}) as Body, types.get(String(s.register)) ?? new Map(), today) })),
  };
}
