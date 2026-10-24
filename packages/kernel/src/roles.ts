/**
 * Which list plays a part the kernel reads: the rates a money figure converts by, and the people `meet` writes.
 *
 * A LIST DECLARES THE ROLE, AND THE KERNEL NO LONGER GUESSES IT FROM THE LIST'S NAME. Before this file the rates were
 * the rows of whatever list was called `fx`, read by four fixed field names, and `meet` wrote the list called `people`
 * by six. Measured: the same rates under the id `rates`, or under `fx` called `from`, `to`, `price` and `day`,
 * converted nothing, and a list called `contacts` with exactly People's fields could not be met into. A register now
 * says `rates: { currency, base, rate, as_of }` or `meets: { name, email, met, merged_into, handles?, projects?, in_touch? }`,
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
export type RoleList = { id: string; fields?: readonly RoleField[]; rates?: unknown; meets?: unknown; org?: unknown };

export type RoleKey = 'rates' | 'meets';

/**
 * Every role a list can play. `org` IS KEPT OUT OF `RoleKey` because `declare.ts`'s `keylessBeside` asks only the first
 * two of a keyless list arriving beside a declaring one; `roleBody` checks all three at install.
 */
export type RoleName = RoleKey | 'org';

/**
 * One part of a role: the types its field may be, what that is in words, and whether a role may leave it out.
 *
 * `later` IS A PART ADDED AFTER THE NAMED LISTS' FIELDS WERE FIXED. A keyless `people` from before it has no such field,
 * and requiring it there would refuse every meet on a record nobody touched, so a keyless list plays a later part only
 * when it has a field of that name that plays it.
 */
export type Part = { part: string; types: readonly string[]; of?: string; says: string; optional?: true; to?: 'self' | 'projects'; later?: true };

/**
 * What each part's field must be, in the order `meet` has always checked them, so a refusal names the same field
 * first as it did before this file.
 *
 * `rate` IS A DECIMAL OR AN INT: `ratesFrom` reads a number either way. `currency` and `base` are text or an enum of
 * codes, which is how a pack that knows its three currencies would write them.
 */
export const PARTS: Readonly<Record<RoleName, readonly Part[]>> = {
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
    { part: 'in_touch', types: ['day'], says: 'a day', optional: true, later: true },
    /* THE UNDERSTANDING LAYER'S PARTS (batch 17). Every identifier beyond the one email, as `kind:value`; the
       organisation they are with; whether this is the record's own person; and the other names they go by. All
       optional and all `later`, so a People from before them is met exactly as it was. */
    { part: 'keys', types: ['list'], of: 'text', says: 'a list of text', optional: true, later: true },
    { part: 'org', types: ['ref'], says: 'a ref to the organisations', optional: true, later: true },
    { part: 'self', types: ['bool'], says: 'a bool', optional: true, later: true },
    { part: 'aliases', types: ['list'], of: 'text', says: 'a list of text', optional: true, later: true },
  ],
  /* AN ORGANISATION: a company, an employer, a client, a vendor, a merchant or a bank, met by its domain, a payee as a
     bank writes it, or its name. `met` and `projects` are optional and kept as People keeps them, when declared. */
  org: [
    { part: 'name', types: ['text'], says: 'a text' },
    { part: 'keys', types: ['list'], of: 'text', says: 'a list of text', optional: true, later: true },
    { part: 'kind', types: ['enum', 'text'], says: 'an enum or a text', optional: true, later: true },
    { part: 'domain', types: ['text', 'url'], says: 'a text', optional: true, later: true },
    { part: 'merged_into', types: ['ref'], says: 'a ref to its own list', to: 'self', optional: true, later: true },
    { part: 'met', types: ['list'], of: 'text', says: 'a list of text', optional: true, later: true },
    { part: 'projects', types: ['list'], of: 'ref', says: 'a list of refs to projects', optional: true, to: 'projects', later: true },
    /* THE DAY IT WAS RETIRED, SINCE People 3.8.0 (the audit of 25 October, Y2): a shop met by a name a card text cut short
       is put away on his answer, never deleted, and the walk over the past makes nothing more of it. */
    { part: 'retired', types: ['day'], says: 'a day', optional: true, later: true },
  ],
};

/** The list each role was read from by name before the keys, and still is while no list declares the role. */
/**
 * The parts a list may play for the record's agents (`role:` on a register), which `packages/record` `agent-lists.ts`
 * reads: its skills, its tools, its learnings, its index of keys by name, the profiles its agents run under and what
 * carries from one machine to the next. Checked at install by `declare.ts`, which holds the last two to a personal list.
 */
export const AGENT_ROLES = ['skills', 'tools', 'learnings', 'keys-index', 'profiles', 'carry'] as const;

export const LEGACY: Readonly<Record<RoleName, string>> = { rates: 'fx', meets: 'people', org: 'organisations' };

/** What each role's list holds, for a sentence. */
export const HOLDS: Readonly<Record<RoleName, string>> = { rates: 'the rates', meets: 'the people meet writes', org: 'the organisations meet writes' };

/** The parts of the rates, each naming its field. */
export type RatesFields = { currency: string; base: string; rate: string; as_of: string };

/** The parts of the people `meet` writes, each naming its field. */
/** `in_touch` is the last day they were in touch, which `meet` moves to the day of the line it writes. */
export type MeetsFields = {
  name: string;
  email: string;
  met: string;
  merged_into: string;
  handles?: string;
  projects?: string;
  in_touch?: string;
  keys?: string;
  org?: string;
  self?: string;
  aliases?: string;
};

/** The parts of an organisation, each naming its field. Only `name` is required. */
export type OrgFields = { name: string; keys?: string; kind?: string; domain?: string; merged_into?: string; met?: string; projects?: string; retired?: string };

/** A role resolved: the list that plays it, each part's field, and whether the list declared it or was found by name. */
export type Role<F> = { register: string; fields: F; declared: boolean };

/** The parts under their own names: what the named list is read with. */
const named = (key: RoleName): Record<string, string> => Object.fromEntries(PARTS[key].map((p) => [p.part, p.part]));

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
function roleOf(key: RoleName, lists: Iterable<RoleList>): Role<Record<string, string>> | null {
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
  if (!legacy) return null;
  const fields = named(key);
  for (const p of PARTS[key]) if (p.later === true && !plays(p, legacy.fields?.find((f) => f.id === p.part))) delete fields[p.part];
  return { register: legacy.id, fields, declared: false };
}

/** The list holding the record's rates. */
export const ratesRole = (lists: Iterable<RoleList>): Role<RatesFields> | null => roleOf('rates', lists) as Role<RatesFields> | null;

/** The list `meet` writes. */
export const meetsRole = (lists: Iterable<RoleList>): Role<MeetsFields> | null => roleOf('meets', lists) as Role<MeetsFields> | null;

/**
 * The list `meet` writes organisations into: the one declaring `org:`, or, while none does, `organisations` read by its
 * parts' own names, each part kept only where a field of that name plays it. A keyless `organisations` without a `name`
 * text is no organisations list at all.
 */
export const orgRole = (lists: Iterable<RoleList>): Role<OrgFields> | null => {
  const all = [...lists];
  const role = roleOf('org', all) as Role<OrgFields> | null;
  if (role === null || role.declared) return role;
  const name = all.find((l) => l.id === role.register)?.fields?.find((f) => f.id === 'name');
  return plays(PARTS.org[0]!, name) ? role : null;
};

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
export function legacyShaped(key: RoleName, list: RoleList): boolean {
  if (list.id !== LEGACY[key] || list[key] !== undefined) return false;
  const fields = list.fields ?? [];
  return PARTS[key]
    .filter((p) => p.optional !== true)
    .every((p) => {
      const field = fields.find((f) => f.id === p.part);
      return field !== undefined && plays(p, field) && aims(p, field, list.id);
    });
}
