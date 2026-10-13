/**
 * The ladder of trust as a person reads it: one sentence for each agent and each kind of change (`trust`, ENG-A12,
 * DIRECTION §37 "a ladder per agent and kind").
 *
 * PURE, SO `node --test` CAN IMPORT IT. The words and the rules live here and `TrustRows.svelte` only draws what these
 * answer, as `slash-reads.ts` is to `SlashReads.svelte`.
 *
 * THE RECORD ALREADY SAYS NAMES AND WORDS. An agent arrives as the name its owner gave the grant and a kind as the rest
 * of a sentence ("add tasks", "mark tasks done"), so a line here is those two joined by what the rung means: asks first,
 * does it and tells you, or does it quietly. A rung's key (`ask`, `tell`, `quiet`) is never shown.
 *
 * TWO GRANTS OF ONE NAME SAY THE DAY EACH WAS CONNECTED. The record numbers the later one ("Claude Code 2"), which tells
 * the lines apart and not the grants: the day is what a person remembers. Names are compared as a person reads them,
 * whatever their case or spacing, with that number set aside, so a host a release behind that names both alike reads
 * the same way.
 *
 * ONLY THE OWNER IS ANSWERED. Anyone the record refuses, and a host built before the call, reads as `null`, and nothing
 * is drawn: there is no ladder of theirs to show.
 */

import type { TrustStanding } from '@braindog/client';

export const words = {
  title: 'What each agent may do on its own',
  empty: 'No agent is connected yet, so nothing is done without you.',
  backMark: 'Put back',
} as const;

/** One sentence of the ladder. `back` marks a kind taken back to asking, with `why` as the record worded it. */
export type TrustLine = { key: string; text: string; back: boolean; why: string | null };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `3 Oct`, and `30 Dec 2025` in another year than this one. The day is the reader's own, as a clock on their wall says it. */
const dayOf = (instant: string, now: number): string => {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return instant;
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${d.getFullYear()}`;
};

/** A name as two grants are compared: case and spacing folded, and the number the record adds to a second one set aside. */
const fold = (name: string): string =>
  name
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/ \d+$/u, '');

type Agent = TrustStanding extends { agents: readonly (infer A)[] } ? A : never;
type Kind = Agent['kinds'][number];

const kindSaid = (who: string, k: Kind, now: number): string => {
  if (k.rung === 'quiet') return `${who} may ${k.kind} and do it quietly since ${dayOf(k.since, now)}`;
  if (k.rung === 'tell') return `${who} may ${k.kind} and tell you since ${dayOf(k.since, now)}`;
  return k.dropped ? `${who} asks before it may ${k.kind}, put back on ${dayOf(k.dropped.at, now)}` : `${who} asks before it may ${k.kind}`;
};

/**
 * Every line of the ladder, in the record's order: agents oldest first, and each one's kinds by their words. An agent
 * with no rung yet is one line, since everything it does asks.
 */
export function trustLines(standing: TrustStanding, now: number): TrustLine[] {
  const alike = new Map<string, number>();
  for (const a of standing.agents) alike.set(fold(a.agent), (alike.get(fold(a.agent)) ?? 0) + 1);
  const out: TrustLine[] = [];
  standing.agents.forEach((a, i) => {
    const twice = (alike.get(fold(a.agent)) ?? 0) > 1 && a.connected !== null;
    /* The day sits between commas, so the sentence reads on past it. */
    const who = twice ? `${a.agent}, connected ${dayOf(a.connected!, now)},` : a.agent;
    if (a.kinds.length === 0) {
      out.push({ key: `${i}`, text: `${who} asks before every change`, back: false, why: null });
      return;
    }
    a.kinds.forEach((k, j) => {
      const back = k.rung === 'ask' && k.dropped !== null;
      out.push({ key: `${i}:${j}`, text: kindSaid(who, k, now), back, why: back ? (k.dropped?.why ?? null) : null });
    });
  });
  return out;
}

const RUNGS = new Set(['ask', 'tell', 'quiet']);

const isKind = (v: unknown): v is Kind => {
  const k = v as Kind | null;
  return typeof k === 'object' && k !== null && typeof k.kind === 'string' && RUNGS.has(k.rung) && typeof k.since === 'string';
};

const isStanding = (v: unknown): v is TrustStanding => {
  const agents = (v as TrustStanding | null)?.agents;
  return Array.isArray(agents) && agents.every((a) => typeof a?.agent === 'string' && Array.isArray(a.kinds) && a.kinds.every(isKind));
};

/** The client's `trust`, and nothing else of it, so a test hands in one function. */
export type TrustClient = { trust: () => Promise<unknown> };

/**
 * Where every agent stands, or `null` when there is nothing to draw: the caller is refused (a member, a colleague, a
 * grant held to part of the record), the host was built before the call, or it answered something else.
 */
export async function readTrust(client: TrustClient): Promise<TrustStanding | null> {
  let out: unknown;
  try {
    out = await client.trust();
  } catch {
    return null;
  }
  const answer = out as { ok?: unknown; value?: unknown } | null;
  if (typeof answer !== 'object' || answer === null || answer.ok !== true || !isStanding(answer.value)) return null;
  /* A host a release behind says no `connected` or `dropped`: both read as not said. */
  return {
    agents: answer.value.agents.map((a) => ({
      agent: a.agent,
      connected: typeof a.connected === 'string' ? a.connected : null,
      kinds: a.kinds.map((k) => ({ kind: k.kind, rung: k.rung, since: k.since, lifted: k.lifted === true, dropped: k.dropped && typeof k.dropped.at === 'string' ? { at: k.dropped.at, why: typeof k.dropped.why === 'string' ? k.dropped.why : null } : null })),
    })),
  };
}
