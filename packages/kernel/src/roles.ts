/**
 * Which list plays a part the kernel reads: the rates a money figure converts by, and the people `meet` writes.
 *
 * A LIST DECLARES THE ROLE, AND THE KERNEL NO LONGER GUESSES IT FROM THE LIST'S NAME. Before this file the rates were
 * the rows of whatever list was called `fx`, read by four fixed field names, and `meet` wrote the list called `people`
 * by six. Measured: the same rates under the id `rates`, or under `fx` called `from`, `to`, `price` and `day`,
 * converted nothing, and a list called `contacts` with exactly People's fields could not be met into. A register now
 * says `rates: { currency, base, rate, as_of }` or `meets: { name, email, met, merged_into, handles?, projects? }`,
 * each part naming the field that plays it, beside `scopes:` which already works this way.
 *
 * ONE KEY PER ROLE, EVERY PART NAMED. A generic `role: rates` would have had to fix the field names again, which is
 * half of what was measured above. `handles` and `projects` are the two parts `meet` can do without: without `projects`
 * it links nobody to a project and still records the person, which is the record with no Projects the seed installs for
 * a student, and without `handles` a handle has nowhere to go and is refused.
 *
 * THE NAME STILL READS, FOR RECORDS ON PACK VERSIONS OLDER THAN THE KEYS, AND ONLY WHILE NO LIST DECLARES THE ROLE. A
 * record installed before the seed declares either key has `fx` and `people` with no key, and turning its figures into
 * parts on the day this landed would be a regression nobody asked for. So with no declaring list, the list named `fx`
 * is the rates and `people` the people, under today's field names. This is scaffolding with an end: once the seed's own
 * lists declare the keys, a record reaches the fallback only until its next pack update.
 *
 * NOTHING HERE IMPORTS THE REST OF THE KERNEL. `declare.ts` checks a declared mapping with the same table at install,
 * and `index.ts` reads it at run time, and the two must agree about what a part's field may be.
 */

/** A field as a register declares it, as far as a role asks. */
export type RoleField = { id: string; type: string; of?: string; to?: string; retired?: boolean };

/** A register as far as a role asks: its id, its fields, and the two keys. */
export type RoleList = { id: string; fields?: readonly RoleField[]; rates?: unknown; meets?: unknown };

export type RoleKey = 'rates' | 'meets';

/** One part of a role: the types its field may be, what that is in words, and whether a role may leave it out. */
export type Part = { part: string; types: readonly string[]; of?: string; says: string; optional?: true; to?: 'self' | 'projects' };

/**
 * What each part's field must be, in the order `meet` has always checked them, so a refusal names the same field
 * first as it did before this file.
 *
 * `rate` IS A DECIMAL OR AN INT: `ratesFrom` reads a number either way. `currency` and `base` are text or an enum of
 * codes, which is how a pack that knows its three currencies would write them.
 */
export const PARTS: Readonly<Record<RoleKey, readonly Part[]>> = {
  rates: [
    { part: 'currency', types: ['text', 'enum'], says: 'a text or an enum of currency codes' },
    { part: 'base', types: ['text', 'enum'], says: 'a text or an enum of currency codes' },
    { part: 'rate', types: ['decimal', 'int'], says: 'a decimal or an int' },
    { part: 'as_of', types: ['day'], says: 'a day' },
  ],
  meets: [
    { part: 'name', types: ['text'], says: 'a text' },
    { part: 'email', types: ['email', 'text'], says: 'an email' },
    { part: 'handles', types: ['list'], of: 'text', says: 'a list of text', optional: true },
    { part: 'projects', types: ['list'], of: 'ref', says: 'a list of refs to projects', optional: true, to: 'projects' },
    { part: 'met', types: ['list'], of: 'text', says: 'a list of text' },
    { part: 'merged_into', types: ['ref'], says: 'a ref to its own list', to: 'self' },
  ],
};

/** The list each role was read from by name before the keys, and still is while no list declares the role. */
export const LEGACY: Readonly<Record<RoleKey, string>> = { rates: 'fx', meets: 'people' };

/** What each role's list holds, for a sentence. */
export const HOLDS: Readonly<Record<RoleKey, string>> = { rates: 'the rates', meets: 'the people meet writes' };

/** The parts of the rates, each naming its field. */
export type RatesFields = { currency: string; base: string; rate: string; as_of: string };

/** The parts of the people `meet` writes, each naming its field. */
export type MeetsFields = { name: string; email: string; met: string; merged_into: string; handles?: string; projects?: string };

/** A role resolved: the list that plays it, each part's field, and whether the list declared it or was found by name. */
export type Role<F> = { register: string; fields: F; declared: boolean };

/** The parts under their own names: what the named list is read with. */
const named = (key: RoleKey): Record<string, string> => Object.fromEntries(PARTS[key].map((p) => [p.part, p.part]));

/**
 * The list playing a role on this record, or `null`.
 *
 * TWO DECLARING LISTS ARE NONE. Install refuses the second (`declare.ts`), so two can only be a declaration row written
 * by hand, and choosing one of them would convert at one list's rates, or file a person in one list, on a guess. That
 * is `resolveProject`'s rule for two lists declaring `scopes:`, for the same reason.
 *
 * THE NAMED LIST IS READ WHATEVER ITS SHAPE, while `legacyShaped` decides only whether it blocks a second holder. One
 * rule for both was the obvious design, and `packages/kernel/test/people.test.ts` measured why not: its `people` with a
 * name and a plain-text email, and none of `met` or `merged_into`, is refused `FIELD_UNKNOWN at handles`, naming the
 * first field it lacks. Read by shape it would be no list at all and `REGISTER_UNKNOWN`, which tells the owner less
 * about a list that is there. For rates it makes no difference: rows without the four fields hold no rate, and
 * `ratesFrom` skips them.
 */
function roleOf(key: RoleKey, lists: Iterable<RoleList>): Role<Record<string, string>> | null {
  const all = [...lists];
  const declaring = all.filter((l) => l[key] !== undefined);
  if (declaring.length > 1) return null;
  const [one] = declaring;
  if (one) {
    const said = one[key];
    const fields = said !== null && typeof said === 'object' && !Array.isArray(said) ? (said as Record<string, string>) : {};
    return { register: one.id, fields: { ...fields }, declared: true };
  }
  const legacy = all.find((l) => l.id === LEGACY[key]);
  return legacy ? { register: legacy.id, fields: named(key), declared: false } : null;
}

/** The list holding the record's rates. */
export const ratesRole = (lists: Iterable<RoleList>): Role<RatesFields> | null => roleOf('rates', lists) as Role<RatesFields> | null;

/** The list `meet` writes. */
export const meetsRole = (lists: Iterable<RoleList>): Role<MeetsFields> | null => roleOf('meets', lists) as Role<MeetsFields> | null;

/** Whether a field's type can play a part. Where a `ref` points is `aims`'s question. */
export function plays(part: Part, field: RoleField | undefined): boolean {
  if (!field || field.retired === true || !part.types.includes(field.type)) return false;
  return part.of === undefined || field.of === part.of;
}

/**
 * Whether a part's `ref` points where it must: `merged_into` at its own list, `projects` at the list declaring
 * `scopes:`. `projects` is that list's id, `null` when none declares it, and `undefined` when it is not known.
 */
export function aims(part: Part, field: RoleField, self: string, projects?: string | null): boolean {
  if (part.to === 'self') return field.to === self;
  if (part.to === 'projects' && projects !== undefined) return projects !== null && field.to === projects;
  return true;
}

/**
 * Whether a list with no key holds a role under the old names: every part a role may not leave out, by its own name,
 * with a type that plays it.
 *
 * BY SHAPE, AND NAMING NO PACK. The named list counts as a holder, so a second list cannot take the role from under
 * yesterday's rows. What that costs, read and not driven: a list called `fx` of sound effects, or `people` as a cast
 * list, would have blocked every pack declaring the role with a fix pointing at a pack that does not own the list. So
 * only a list shaped like the rates or the people counts, and the other kind blocks nothing; both are driven in
 * `test/roles.test.ts`.
 *
 * ASKED AT INSTALL OF EITHER LIST. `declare.ts`'s `roleBody` asks it of the list declaring the key, and `keylessBeside`
 * of the keyless one. A keyless, rates-shaped `fx` arriving AFTER a list declared `rates:` looks like something made by
 * hand that nobody makes by accident, but an install makes it, and the declaring list's next update was then refused,
 * told to declare `rates:` on `fx`. It is now refused at the keyless list's own install. A RECORD THAT REACHED THE PAIR
 * BEFORE THAT GUARD IS REFUSED ON BOTH LISTS' UPDATES, measured by installing the pair with `keylessBeside` switched
 * off and then updating each with it on: the declaring list is told to declare `rates:` on `fx`, and `fx` is told to
 * install under another id, which an installed list cannot. Both refusals come from `Known` laying the batch over the
 * record, which cannot tell the live holder from a new one.
 */
export function legacyShaped(key: RoleKey, list: RoleList): boolean {
  if (list.id !== LEGACY[key] || list[key] !== undefined) return false;
  const fields = list.fields ?? [];
  return PARTS[key]
    .filter((p) => p.optional !== true)
    .every((p) => {
      const field = fields.find((f) => f.id === p.part);
      return field !== undefined && plays(p, field) && aims(p, field, list.id);
    });
}
