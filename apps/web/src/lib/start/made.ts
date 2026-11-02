/**
 * What the end of the first run offers, once the BrainDog is made (`/start#made`): one agent and one source, each saying
 * what it would find here, then Home (research-firstrun-17's recommended flow).
 *
 * ONE OF EACH, CHOSEN FROM WHAT THIS BRAINDOG KEEPS, never a gallery. The agent is Claude, the app (it was Claude Code,
 * a terminal tool, until the first-hour audit's E22); the paragraph below is the older reasoning. Claude Code was the one most people
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

import { USE_CASES } from '@braindog/seed/usecases';

import { firstRun } from '../first-run.ts';
import { playedBy, plays } from './parts.ts';

/** The one agent offered, and what it would find here. */
export type AgentOffer = { name: string; finds: string };

/** The one source offered: what it is, what it would find, and where it is set up. */
export type SourceOffer = { kind: 'bank' | 'mail' | 'file'; name: string; finds: string; go: string; href: string };

/**
 * A list as the next steps read it: its id, or its id and the name this record gives it ("Clients" where the people are
 * called so). A name is what a person reads; an id is only ever looked up, never said.
 */
export type KeptList = string | { id: string; name?: string | undefined; count?: number | undefined };

const idOf = (l: KeptList): string => (typeof l === 'string' ? l : l.id);

type Own = { name: string; somebodys: boolean };
let owned: ReadonlyMap<string, Own> | null = null;

/**
 * THE LISTS A USE CASE BRINGS OF ITS OWN (a shop's Orders and Products), each with its name and whether its entries are
 * somebody's: a link to the list that plays `meets`, as an order is for a client and a product is nobody's. Read once off
 * the use cases this build ships, by shape and never by a list's name (§27).
 */
function ownLists(): ReadonlyMap<string, Own> {
  if (owned !== null) return owned;
  const people = playedBy('meets');
  const out = new Map<string, Own>();
  for (const u of USE_CASES)
    for (const d of (u.pack?.declarations ?? []) as Record<string, unknown>[]) {
      if (typeof d.register !== 'string' || d.page !== undefined || d.rule !== undefined || out.has(d.register)) continue;
      const fields = Array.isArray(d.fields) ? (d.fields as Record<string, unknown>[]) : [];
      out.set(d.register, {
        name: typeof d.name === 'string' ? d.name : '',
        somebodys: people !== null && fields.some((f) => f.type === 'ref' && f.to === people && f.retired !== true),
      });
    }
  owned = out;
  return owned;
}

/** A list's name as it sits after "your": "Orders" is "orders", and a name in capitals ("CRM") keeps them. */
const lower = (name: string): string => (/^\p{Lu}\p{Ll}/u.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name);

/**
 * WHAT AN AGENT WORKING FOR THIS PERSON WOULD SEE in a BrainDog that keeps these lists, in the order they matter, each by
 * the name this record gives it: the projects, then the use case's own lists whose entries are somebody's (a shop's
 * orders), then the people, then the work handed out. So a shop reads "your orders and clients", never projects it does
 * not keep. A list the caller names by id alone is said by the use case's name for it, else the house word.
 */
function agentThings(all: readonly KeptList[]): string[] {
  /* ONLY WHAT SHE HAS (first-hour audit E22): a list the record says is empty is not named, so a bakery whose Projects
     came with the house is not told about its projects. A list given without its count is named as before. */
  const lists = all.filter((l) => typeof l === 'string' || l.count === undefined || l.count > 0);
  const ids = lists.map(idOf);
  const given = new Map(lists.flatMap((l) => (typeof l !== 'string' && l.name?.trim() ? [[l.id, l.name.trim()] as const] : [])));
  const own = ownLists();
  const said = (id: string | null, house: string): string => lower(given.get(id ?? '') ?? (own.get(id ?? '')?.name || house));
  const out: string[] = [];
  if (plays(ids, 'projects')) out.push(said(playedBy('projects'), firstRun.agentProjects));
  for (const id of ids) if (own.get(id)?.somebodys && (given.has(id) || own.get(id)!.name)) out.push(said(id, ''));
  if (plays(ids, 'meets')) out.push(said(playedBy('meets'), firstRun.agentPeople));
  if (plays(ids, 'hand')) out.push(said(playedBy('hand'), firstRun.agentTasks));
  return [...new Set(out)];
}

/** The agent and the source the end of the first run offers for a BrainDog that keeps these lists. */
export function madeOffers(lists: readonly KeptList[]): { agent: AgentOffer; source: SourceOffer } {
  const agent = { name: firstRun.agentName, finds: firstRun.agentFinds(agentThings(lists)) };
  const ids = lists.map(idOf);
  /* WHERE MAIL IS SET UP: Settings, What comes in, which mints the forwarding address and says when a host has none. */
  const source: SourceOffer = plays(ids, 'rates')
    ? { kind: 'bank', name: firstRun.sourceBank, finds: firstRun.sourceBankFinds, go: firstRun.sourceGo, href: '/settings/ingest#texts' }
    : plays(ids, 'meets')
      ? { kind: 'mail', name: firstRun.sourceMail, finds: firstRun.sourceMailFinds, go: firstRun.sourceGo, href: '/settings/ingest' }
      : { kind: 'file', name: firstRun.sourceFile, finds: firstRun.sourceFileFinds, go: firstRun.sourceFileGo, href: '/start?more=1' };
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
export function madeSteps(lists: readonly KeptList[], arrivesBy?: ArrivesBy): MadeStep[] {
  const { agent, source } = madeOffers(lists);
  if (arrivesBy !== 'messages') return [{ kind: 'agent', agent }, { kind: 'source', source }];
  const forward: SourceOffer =
    source.kind === 'file'
      ? { kind: 'mail', name: firstRun.sourceMail, finds: firstRun.sourceMailFinds, go: firstRun.sourceGo, href: '/settings/ingest' }
      : source;
  return [{ kind: 'source', source: forward }, { kind: 'agent', agent }];
}

/* ── the words, handed to the made screen (1 Nov) ─────────────────────────── */

/** Where sign-up leaves the words and what they built, in the tab the made screen opens in. */
export const MADE_SAID = 'braindog.made.said';

/**
 * What the made screen is handed: the words as kept, the entries the build wrote from them, and the use case it was made
 * as, by id, so the read after the build is told the kind in one line (onboarding11).
 */
export type SaidMade = { said: string; built: { register: string; fields: Record<string, unknown> }[]; kind?: string | null };

/** The words and what they built, as kept: at most 2,000 characters and twenty entries, as the first run reads them. */
export const saidMade = (said: string, rows: readonly { register: string; fields: Record<string, unknown> }[], kind: string | null = null): SaidMade => ({
  said: said.trim().slice(0, 2000),
  built: rows.slice(0, 20).map((r) => ({ register: r.register, fields: r.fields })),
  ...(kind !== null && kind !== '' ? { kind: kind.slice(0, 64) } : {}),
});

/** The words handed over, read back off what was kept, or `null` when it is not that. */
export function saidMadeOf(raw: string | null): SaidMade | null {
  try {
    const v = JSON.parse(raw ?? 'null') as unknown;
    if (typeof v !== 'object' || v === null) return null;
    const { said, built, kind } = v as { said?: unknown; built?: unknown; kind?: unknown };
    if (typeof said !== 'string' || said.trim() === '' || !Array.isArray(built)) return null;
    const rows = built.flatMap((r): SaidMade['built'] =>
      typeof r === 'object' && r !== null && typeof (r as { register?: unknown }).register === 'string' && typeof (r as { fields?: unknown }).fields === 'object' && (r as { fields?: unknown }).fields !== null
        ? [{ register: (r as { register: string }).register, fields: (r as { fields: Record<string, unknown> }).fields }]
        : [],
    );
    return saidMade(said, rows, typeof kind === 'string' ? kind : null);
  } catch {
    return null;
  }
}
