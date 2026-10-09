/**
 * What the end of the first run offers, once the BrainDog is made (`/start#made`): one agent and one source, each saying
 * what it would find here, then Home (DIRECTION §37, research-firstrun-17's recommended flow).
 *
 * ONE OF EACH, CHOSEN FROM WHAT THIS BRAINDOG KEEPS, never a gallery. The agent is Claude Code, the one most people
 * connecting from a first run have, by the one command that connects it over sign-in (`device.ts` `connectLines`); the
 * rest are a press away in Settings. The source is the one whose finds land in a list this BrainDog has: a bank's mail
 * where money is kept, any mail where people are, a file from another app otherwise.
 *
 * WHAT EACH WOULD FIND IS SAID FROM THE LISTS KEPT, not promised in general: an agent finds your projects only where the
 * record holds a list of projects. Nothing here is a count the record does not hold yet.
 *
 * A LIST IS KNOWN BY THE PART IT PLAYS (`parts.ts`), never by a module's id: money is the list that keeps rates, people
 * the list `meet` writes, tasks the list work is handed in, projects the list people are linked to.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { firstRun } from '../first-run.ts';
import { plays } from './parts.ts';

/** The one agent offered, and what it would find here. */
export type AgentOffer = { name: string; finds: string };

/** The one source offered: what it is, what it would find, and where it is set up. */
export type SourceOffer = { kind: 'bank' | 'mail' | 'file'; name: string; finds: string; go: string; href: string };

/** What an agent working for this person would find in a BrainDog that keeps these lists, in the order they matter. */
function agentThings(lists: readonly string[]): string[] {
  const out: string[] = [];
  if (plays(lists, 'projects')) out.push(firstRun.agentProjects);
  if (plays(lists, 'meets')) out.push(firstRun.agentPeople);
  if (plays(lists, 'hand')) out.push(firstRun.agentTasks);
  return out;
}

/** The agent and the source the end of the first run offers for a BrainDog that keeps these lists. */
export function madeOffers(lists: readonly string[]): { agent: AgentOffer; source: SourceOffer } {
  const agent = { name: firstRun.agentName, finds: firstRun.agentFinds(agentThings(lists)) };
  /* WHERE MAIL IS SET UP: Settings, What comes in, which mints the forwarding address and says when a host has none. */
  const source: SourceOffer = plays(lists, 'rates')
    ? { kind: 'bank', name: firstRun.sourceBank, finds: firstRun.sourceBankFinds, go: firstRun.sourceGo, href: '/settings/ingest' }
    : plays(lists, 'meets')
      ? { kind: 'mail', name: firstRun.sourceMail, finds: firstRun.sourceMailFinds, go: firstRun.sourceGo, href: '/settings/ingest' }
      : { kind: 'file', name: firstRun.sourceFile, finds: firstRun.sourceFileFinds, go: firstRun.sourceFileGo, href: '/start' };
  return { agent, source };
}

/** How a person's work mostly arrives: the first run's one answer, kept as pref `arrivesBy` (`pref.ts`). */
export type ArrivesBy = 'messages' | 'app' | 'in-person';

/** One next step, the agent or the source, as Today's "When you want more" draws it (`home/WantMore.svelte`). */
export type MadeStep = { kind: 'agent'; agent: AgentOffer } | { kind: 'source'; source: SourceOffer };

/**
 * The same two offers as next steps, in the order this person's answer puts them (planner-45, the onboarding target,
 * step 6). The agent leads, as at `/start#made`, unless work arrives by messages: then forwarding leads, because the
 * next message she gets is the next thing that fills the record.
 *
 * WORK THAT ARRIVES BY MESSAGES IS FORWARDED, never brought in as a file. Where the lists alone would offer a file, the
 * answer says the source is her mail; a bank's mail stays a bank's, since it is mail too.
 */
export function madeSteps(lists: readonly string[], arrivesBy?: ArrivesBy): MadeStep[] {
  const { agent, source } = madeOffers(lists);
  if (arrivesBy !== 'messages') return [{ kind: 'agent', agent }, { kind: 'source', source }];
  const forward: SourceOffer =
    source.kind === 'file'
      ? { kind: 'mail', name: firstRun.sourceMail, finds: firstRun.sourceMailFinds, go: firstRun.sourceGo, href: '/settings/ingest' }
      : source;
  return [{ kind: 'source', source: forward }, { kind: 'agent', agent }];
}
