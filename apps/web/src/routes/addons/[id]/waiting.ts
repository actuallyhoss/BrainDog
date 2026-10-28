/**
 * What of an add-on waits for the record to hold something, as its page says it: "1 part waits for People."
 *
 * WORKED OUT ON READ, NOT STORED. The record keeps no note of what waited when the add-on was installed,
 * so the page reads the add-on's own file at the version installed, lays it over what the record holds now, and counts
 * the parts that would still be left out (`resolveWhen` in `@braindog/declare`). A part that waits says
 * `when: { holds: [people] }`; BrainDog's own modules cut theirs another way and say none.
 *
 * Out of the component so `node --test` can run it, since a Svelte page does not mount there.
 */

import type { PackState } from '../../../lib/record/packs.ts';

/** One part that waits: where it sits in the add-on, and the lists or roles the record does not hold yet. */
export type Waiting = { at: string; holds: string[] };

/** What a person calls each role. */
const ROLE_WORDS: Readonly<Record<string, string>> = { rates: 'Exchange rates', meets: 'People', org: 'Organisations' };

/**
 * What the record holds: every list of every add-on that is on, every list the record has told this screen about, and the
 * roles those lists play. THE ROLES ARE THE PLAN'S OWN (`holdsOf` in `@braindog/declare`): a list that declares one, or
 * the list that plays it by its name alone before its add-on declares it, so this screen keeps no copy of either.
 */
export async function heldNames(packs: readonly Pick<PackState, 'disabled_at' | 'registers'>[], lists: Readonly<Record<string, unknown>> = {}): Promise<Set<string>> {
  const held = new Set<string>(Object.keys(lists));
  for (const p of packs) if (p.disabled_at === null) for (const r of p.registers) held.add(r);
  const { holdsOf } = await import('@braindog/declare/catalogue');
  const declarations = [...held].map((id) => ({ kind: 'register' as const, id: `register.${id}`, body: JSON.stringify(lists[id] ?? {}) }));
  return new Set([...held, ...holdsOf({ declarations } as never, { declarations: [] })]);
}

/** The parts of an add-on's file that wait on a record holding `held`; none when the file cannot be read. */
export async function waitingIn(text: string, held: ReadonlySet<string>): Promise<Waiting[]> {
  /* LOADED WHEN ASKED, so the file door stays out of the page's first chunk, as `packs.ts` loads it. */
  const { holdsOf, readPackFile, resolveWhen } = await import('@braindog/declare/catalogue');
  const file = await readPackFile(text);
  if (!file.ok) return [];
  /* THE ADD-ON'S OWN LISTS COUNT AS HELD, as its plan counts them, even while it is off. */
  const pack = file.value.pack;
  return resolveWhen(pack, new Set([...held, ...holdsOf({ declarations: [] }, pack)])).waiting;
}

/** What a person calls a list or a role a part waits for: its own name when the screen knows it, else its id in words. */
export function holdName(hold: string, titles: Readonly<Record<string, string>> = {}): string {
  const known = titles[hold] ?? ROLE_WORDS[hold];
  if (known) return known;
  const words = hold.replace(/_/gu, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Names in a sentence: "People", "People and Projects", "People, Projects and Money". */
const joined = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * The page's one line about what waits, or `null` when nothing does. Parts waiting on the same names are counted
 * together: "2 parts wait for People." and "1 part waits for People, and 2 for Projects."
 */
export function waitingLine(waiting: readonly Waiting[], name: (hold: string) => string = (h) => holdName(h)): string | null {
  if (waiting.length === 0) return null;
  const groups = new Map<string, number>();
  for (const w of waiting) {
    const said = joined(w.holds.map(name));
    groups.set(said, (groups.get(said) ?? 0) + 1);
  }
  const [[first, n], ...rest] = [...groups] as [[string, number], ...[string, number][]];
  const head = `${n} ${n === 1 ? 'part waits' : 'parts wait'} for ${first}`;
  return rest.length === 0 ? `${head}.` : `${head}, and ${rest.map(([said, m]) => `${m} for ${said}`).join(', ')}.`;
}
