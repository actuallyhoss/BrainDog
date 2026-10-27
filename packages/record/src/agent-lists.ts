/**
 * Which list plays a part the record reads for its agents: the skills, the tools, the learnings, the index of keys
 * by name, the profiles its agents run under and what carries between machines ("with nothing in the core
 * that a module could own").
 *
 * BEFORE THIS THE RECORD READ THEM BY THEIR IDS. The card, `skillsBehind`, `offered` and `toolsSeen` each spelled
 * `skills`, `tools`, `learnings` or `credentials`, so the agents add-on could not be renamed, replaced or left out:
 * the same lists under other ids answered nothing, and a record with none of them was refused where it should have been
 * told, in a sentence, that it keeps no skills.
 *
 * A LIST DECLARES THE PART IT PLAYS, `role: skills` on its register, read off the declaration the record already holds,
 * as `rates:` and `meets:` are in `packages/kernel/src/roles.ts`. One part, one list: two lists claiming one role answer
 * the older (the one the record installed first, which is the order it hands its lists in), and the second is said
 * once in a log line, never in an answer.
 *
 * THE OLD ID STILL READS, AND ONLY WHILE NO LIST DECLARES THE ROLE. A record installed before the agents add-on says
 * `role:` has `skills` with no key, and losing its skills on the day this landed would be a regression nobody asked for.
 * The four old ids are held in `AGENT_LIST_FALLBACK` and nowhere else, so the day the add-on file lands one file holds
 * them. A list under an old id that declares another role plays that role, never the old one.
 *
 * THE FADE IS A RULE THE LIST DECLARES, `fade: { field, after }`: the day field a row fades by and how long after it.
 * A list that declares none and has the old `confirmed_on` day fades by it after ninety days, as `context` has.
 *
 * NOTHING HERE READS THE KERNEL. It is handed the registers, the parsed declarations `kernel.registers()` holds or the
 * lists `context` sends, and it answers an id or `null`.
 */

/** Every part a list can play for the record's agents. `profiles` and `carry` are only ever played by a personal list. */
export const AGENT_ROLES = ['skills', 'tools', 'learnings', 'keys-index', 'profiles', 'carry'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * The id each part was read by before a list declared it: the agents add-on's own four, held in this one place. The
 * two parts that came after the keys were never read by an id, so a list plays them only by declaring them.
 */
export const AGENT_LIST_FALLBACK: Readonly<Partial<Record<AgentRole, string>>> = {
  skills: 'skills',
  tools: 'tools',
  learnings: 'learnings',
  'keys-index': 'credentials',
};

/** A list as far as a role asks: its id, its name, and the two keys it may declare. */
export type RoleCarrier = { id: string; name?: unknown; role?: unknown; fade?: unknown; fields?: unknown };

/** The registers as they come: the kernel's map of parsed declarations, or a list of them as `context` sends it. */
export type Registers = ReadonlyMap<string, object> | Iterable<object>;

const carriers = (registers: Registers): RoleCarrier[] => {
  const all = registers instanceof Map ? [...registers.values()] : [...(registers as Iterable<object>)];
  return all.filter((r): r is RoleCarrier => typeof (r as { id?: unknown }).id === 'string');
};

const isRole = (role: unknown): role is AgentRole => typeof role === 'string' && (AGENT_ROLES as readonly string[]).includes(role);

/** The pairs already said in a log line, so two lists claiming one role are said once a process, not once a read. */
const said = new Set<string>();

/** A list by its name in a log line, and by its id only when it has none. */
const nameOf = (r: RoleCarrier): string => (typeof r.name === 'string' && r.name.trim() !== '' ? r.name : r.id);

/**
 * The id of the one list that plays `role`: the first that declares it, else the list under the role's old id when
 * that list declares no other role, else `null`.
 */
export function listFor(role: AgentRole, registers: Registers): string | null {
  const lists = carriers(registers);
  const claiming = lists.filter((r) => r.role === role);
  if (claiming.length > 1) {
    const key = `${role}:${claiming.map((r) => r.id).join(',')}`;
    if (!said.has(key)) {
      said.add(key);
      console.warn(`${claiming.length} lists say they keep the record's ${role}: ${claiming.map(nameOf).join(' and ')}. The first, ${nameOf(claiming[0]!)}, is read.`);
    }
  }
  if (claiming.length > 0) return claiming[0]!.id;
  const fallback = AGENT_LIST_FALLBACK[role];
  const old = fallback === undefined ? undefined : lists.find((r) => r.id === fallback);
  return old !== undefined && !isRole(old.role) ? old.id : null;
}

/** Every list that plays one of the agents' parts, by role. A part no list plays is left out. */
export function agentLists(registers: Registers): Partial<Record<AgentRole, string>> {
  const out: Partial<Record<AgentRole, string>> = {};
  for (const role of AGENT_ROLES) {
    const id = listFor(role, registers);
    if (id !== null) out[role] = id;
  }
  return out;
}

/** The day field a list of learnings faded by before a list declared its fade, and how long after. */
const OLD_FADE = { field: 'confirmed_on', after: '90d' } as const;

/** How long after its day a row fades, as `after` says it: a whole number of days, `90d`. `null` for anything else. */
export const fadeDays = (after: string): number | null => {
  const m = /^([1-9][0-9]{0,4})d$/u.exec(after);
  return m === null ? null : Number(m[1]);
};

/**
 * The rule a list's rows fade by: its declared `fade: { field, after }` when both are said and `after` is a number of
 * days, else the old `confirmed_on` day when the list has one, else `null`, which is a list whose rows never fade.
 */
export function fadeOf(register: object): { field: string; after: string } | null {
  const r = register as RoleCarrier;
  const fade = r.fade as { field?: unknown; after?: unknown } | undefined;
  if (fade && typeof fade === 'object' && typeof fade.field === 'string' && fade.field !== '' && typeof fade.after === 'string' && fadeDays(fade.after) !== null)
    return { field: fade.field, after: fade.after };
  const fields = Array.isArray(r.fields) ? (r.fields as { id?: unknown; type?: unknown; retired?: unknown }[]) : [];
  return fields.some((f) => f.id === OLD_FADE.field && f.type === 'day' && f.retired !== true) ? { ...OLD_FADE } : null;
}

/** The one sentence a read answers when the record keeps no list that plays a part: whole sentences, never an id. */
const NO_LIST: Readonly<Record<AgentRole, string>> = {
  skills: 'This record keeps no skills.',
  tools: 'This record keeps no tools.',
  learnings: 'This record keeps no learnings.',
  'keys-index': 'This record keeps no keys by name.',
  profiles: 'This record keeps no profiles.',
  carry: 'This record keeps nothing to carry between machines.',
};

/** The one sentence a read answers when the record keeps no list that plays `role`. */
export const noListSaid = (role: AgentRole): string => NO_LIST[role];
