/**
 * EACH AGENT ITS OWN PAGE (G14): `/settings/agents/<agent>`, so "Claude's settings" is a link a person can keep, send
 * and come Back to, where it was a sheet over the list. The address is a word a person can read: the kind for an agent
 * (`claude`), `defaults` for Defaults for new agents, `<kind>-as-<profile>` for a Claude Code profile, and a row bound to
 * one key by its own id (it has no other name that stays put).
 *
 * THE PAGE'S NAME is said by the Settings head (`[area]/+page.svelte`), which draws before the agents are read; the
 * Agents area says it here once it has the row, and the head reads a kind's name off the address until then.
 */
import type { AgentRow } from './profile.ts';

/** The address word for one row. */
export function agentSlug(row: Pick<AgentRow, 'key' | 'kind' | 'seat'>): string {
  if (row.key === 'default') return 'defaults';
  if (row.key.startsWith('kind:')) return row.key.slice('kind:'.length);
  if (row.seat && row.kind) return `${row.kind}-as-${row.seat}`;
  return row.key;
}

/** The app path of one row's page. */
export const agentHref = (row: Pick<AgentRow, 'key' | 'kind' | 'seat'>): string => `/settings/agents/${encodeURIComponent(agentSlug(row))}`;

/** The row an address names, or `undefined`. */
export const agentAt = <R extends Pick<AgentRow, 'key' | 'kind' | 'seat'>>(rows: readonly R[], slug: string): R | undefined =>
  rows.find((r) => agentSlug(r) === slug);

/** The open agent's name, for the head: empty until the Agents area has read its row. */
export const agentHead = $state({ name: '' });

/** What the head says before the row is read: a kind's name, a profile's, or Defaults'. */
export function nameOfSlug(slug: string, names: Readonly<Record<string, string>>): string {
  if (slug === 'defaults') return 'Defaults for new agents';
  const as = slug.indexOf('-as-');
  const kind = names[as > 0 ? slug.slice(0, as) : slug];
  if (kind === undefined) return 'Agents';
  return as > 0 ? `${kind} as ${slug.slice(as + 4)}` : kind;
}
