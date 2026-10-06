/**
 * What the end of the first run offers, once the BrainDog is made (`/start#made`): one agent and one source, each saying
 * what it would find here, then Home (DIRECTION §37, research-firstrun-17's recommended flow).
 *
 * ONE OF EACH, CHOSEN FROM WHAT THIS BRAINDOG KEEPS, never a gallery. The agent is Claude Code, the one most people
 * connecting from a first run have, by the one command that connects it over sign-in (`device.ts` `connectLines`); the
 * rest are a press away in Settings. The source is the one whose finds land in a list this BrainDog has: a bank's mail
 * where Money is kept, any mail where People is, a file from another app otherwise.
 *
 * WHAT EACH WOULD FIND IS SAID FROM THE MODULES KEPT, not promised in general: an agent finds your projects only where
 * Portfolio is on. Nothing here is a count the record does not hold yet.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { firstRun } from '../first-run.ts';

/** The one agent offered, and what it would find here. */
export type AgentOffer = { name: string; finds: string };

/** The one source offered: what it is, what it would find, and where it is set up. */
export type SourceOffer = { kind: 'bank' | 'mail' | 'file'; name: string; finds: string; go: string; href: string };

/** What an agent working for this person would find in a BrainDog that keeps these modules, in the order they matter. */
function agentThings(modules: readonly string[]): string[] {
  const out: string[] = [];
  if (modules.includes('portfolio')) out.push(firstRun.agentProjects);
  if (modules.includes('people')) out.push(firstRun.agentPeople);
  if (modules.includes('work')) out.push(firstRun.agentTasks);
  return out;
}

/** The agent and the source the end of the first run offers for these modules. */
export function madeOffers(modules: readonly string[]): { agent: AgentOffer; source: SourceOffer } {
  const agent = { name: firstRun.agentName, finds: firstRun.agentFinds(agentThings(modules)) };
  /* WHERE MAIL IS SET UP: Settings, What comes in, which mints the forwarding address and says when a host has none. */
  const source: SourceOffer = modules.includes('money-core')
    ? { kind: 'bank', name: firstRun.sourceBank, finds: firstRun.sourceBankFinds, go: firstRun.sourceGo, href: '/settings/ingest' }
    : modules.includes('people')
      ? { kind: 'mail', name: firstRun.sourceMail, finds: firstRun.sourceMailFinds, go: firstRun.sourceGo, href: '/settings/ingest' }
      : { kind: 'file', name: firstRun.sourceFile, finds: firstRun.sourceFileFinds, go: firstRun.sourceFileGo, href: '/start' };
  return { agent, source };
}

/** The modules a record holds, from the packs it answers: every pack that is on. */
export const modulesOn = (packs: readonly { id: string; disabled_at: string | null }[]): string[] => packs.filter((p) => p.disabled_at === null).map((p) => p.id);
