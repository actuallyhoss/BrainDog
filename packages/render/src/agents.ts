/**
 * What `agents` decides, as functions both drawers call: what the record's agents did, one group per agent.
 *
 * `feed` groups by the KIND of actor, so every agent's work sits under one "Agents" head and a team with three
 * agents cannot tell whose was whose. This groups by WHO: one head per agent, named as the page's evaluator names
 * it, with its rows under it, newest first. It is drawn with `feed`'s classes, so a host that styles one styles both.
 *
 * THE ROWS ARE WHAT A PAGE'S EVALUATOR WRITES FROM `activity`, newest first, agents only:
 *
 *   who | count | what | when | tone
 *
 * A burst is one row: `Claude | 14 | changed Write the release notes | 3h ago`. A row with no `what` is the rest of
 * that agent's work past the block's `first:` rows, folded into one count.
 */

/** The renderer's own words, for the reason `FEED_GROUPS` is in `feed.ts`: it cannot import the app's copy. */
export const AGENTS_NOTHING = 'No agent has done anything here yet.';
export const AGENTS_EARLIER = 'earlier';

/** What an event of each kind did, as a verb before the thing it was done to. A kind not here is said as it is written. */
export const AGENT_VERBS: Readonly<Record<string, string>> = {
  create: 'added',
  edit: 'changed',
  state: 'moved',
  link: 'linked',
  tag: 'tagged',
  untag: 'untagged',
  delete: 'deleted',
  restore: 'restored',
  note: 'noted on',
  suggest: 'suggested',
  propose: 'proposed',
  decide: 'decided',
  resolve: 'resolved',
  pull: 'pulled',
  import: 'imported',
  install: 'installed',
};

/** A row's `what`: the event's own note when it has one, else the verb and the thing, as `changed Write the notes`. */
export function agentDoing(kind: string | null, thing: string | null, note: string | null): string {
  if (note !== null && note.trim() !== '') return note;
  if (kind === null) return '';
  const verb = AGENT_VERBS[kind] ?? kind;
  return thing ? `${verb} ${thing}` : verb;
}

/** How many things a row stands for. A row without a number is still one thing, never zero. */
const weight = (count: string | undefined): number => {
  const n = Number((count ?? '').trim().replace(/,/gu, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
};

export type AgentGroup<R> = { who: string; rows: R[]; total: number };

/**
 * The rows in one group per agent, in the order each agent first appears, which is newest first. A row with no
 * `who` is left out rather than filed under a nameless head.
 */
export function agentsPlan<R extends { cells: readonly string[] }>(rows: readonly R[]): { groups: AgentGroup<R>[]; empty: string } {
  const groups = new Map<string, AgentGroup<R>>();
  for (const row of rows) {
    const who = (row.cells[0] ?? '').trim();
    if (who === '') continue;
    const group = groups.get(who) ?? { who, rows: [], total: 0 };
    group.rows.push(row);
    group.total += weight(row.cells[1]);
    groups.set(who, group);
  }
  return { groups: [...groups.values()], empty: AGENTS_NOTHING };
}
