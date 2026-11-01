/**
 * The ladder of trust as a person reads it: one sentence for each agent and each kind of change (`trust`,
 * a ladder per agent and kind).
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
 *
 * AND THE OWNER TAKES A RUNG BACK HERE: a kind an agent does on its own carries "Ask again" (`trustTakeBack`, the
 * ladder's undo), which puts it back to asking. Under the lines, two more say what no rung reaches: what the agent
 * was not lifted on, and the floor the ladder never lifts at all.
 */

import type { TrustStanding } from '@braindog/client';

export const words = {
  title: 'Permissions',
  empty: 'None yet, so every agent asks you first.',
  backMark: 'Put back',
  askAgain: 'Ask again',
  asksFirst: 'Asks first: everything else this agent does.',
  alwaysAsks: 'Always asks: amounts of money, keys, sharing, and deleting.',
} as const;

/**
 * One sentence of the ladder. `back` marks a kind taken back to asking, with `why` as the record worded it. `take` is
 * what "Ask again" sends for a kind the agent does on its own, the agent and the kind as the record said them, and
 * `null` where it already asks.
 */
export type TrustLine = { key: string; text: string; back: boolean; why: string | null; take: { agent: string; kind: string } | null };

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
/**
 * HOW FAR AN AGENT MAY GO, BY ITS SETTINGS ROW (Settings > Agents, `lib/agents/profile.ts`), so a line here and the
 * level the page draws beside the agent are one fact (live check, 1 Nov: Permissions said Cursor "asks before every
 * change" over a page that drew Cursor at Write). Without it, an agent with no rung climbed asks, as before.
 */
export type LevelOf = (agent: string) => 'write' | 'propose' | 'read' | null;

const NO_RUNG: Record<'write' | 'read', string> = {
  write: 'makes changes itself; money, keys and deletes still wait',
  read: 'changes nothing',
};

export function trustLines(standing: TrustStanding, now: number, plain?: (i: number) => boolean, level?: LevelOf): TrustLine[] {
  const alike = new Map<string, number>();
  for (const a of standing.agents) alike.set(fold(a.agent), (alike.get(fold(a.agent)) ?? 0) + 1);
  const out: TrustLine[] = [];
  standing.agents.forEach((a, i) => {
    const twice = (alike.get(fold(a.agent)) ?? 0) > 1 && a.connected !== null;
    /* The day sits between commas, so the sentence reads on past it. */
    const who = twice ? `${a.agent}, connected ${dayOf(a.connected!, now)},` : a.agent;
    if (a.kinds.length === 0) {
      const at = level?.(a.agent) ?? null;
      const text = at === 'write' || at === 'read' ? `${who} ${NO_RUNG[at]}` : `${who} asks before every change`;
      out.push({ key: `${i}`, text, back: false, why: null, take: null });
      return;
    }
    a.kinds.forEach((k, j) => {
      const back = k.rung === 'ask' && k.dropped !== null;
      const take = k.rung === 'ask' ? null : { agent: a.agent, kind: k.kind };
      out.push({ key: `${i}:${j}`, text: kindSaid(who, k, now), back, why: back ? (k.dropped?.why ?? null) : null, take });
    });
  });
  if (plain === undefined) return out;
  /* EVERY AGENT THAT ASKS BEFORE EVERY CHANGE IS ONE LINE, where `plain` says nothing more is said under it (UI audit
     of 22 October, 11): five keys made one line each, "… asks before every change", five times. The line stands where
     the first of them stood, keyed by it, so whatever follows that agent still follows the line. */
  const asks = standing.agents
    .map((a, i) => {
      const at = level?.(a.agent) ?? null;
      return a.kinds.length === 0 && at !== 'write' && at !== 'read' && plain(i) ? i : -1;
    })
    .filter((i) => i >= 0);
  if (asks.length < 2) return out;
  const folded = new Set(asks.slice(1).map(String));
  /* IN A LIST THE DAY GOES IN BRACKETS: the commas round it in a sentence of its own read as ",," once the names were
     joined by commas themselves ("kiln-mbp, connected 3 Sep,, Codex"). */
  const names = LIST.format(
    asks.map((i) =>
      out
        .find((l) => l.key === `${i}`)!
        .text.replace(/ asks before every change$/u, '')
        .replace(/, connected ([^,]+),$/u, ' (connected $1)'),
    ),
  );
  return out
    .filter((l) => !folded.has(l.key))
    .map((l) => (l.key === `${asks[0]}` ? { ...l, text: `${names} ask before every change` } : l));
}

const LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

const RUNGS = new Set(['ask', 'tell', 'quiet']);

const isKind = (v: unknown): v is Kind => {
  const k = v as Kind | null;
  return typeof k === 'object' && k !== null && typeof k.kind === 'string' && RUNGS.has(k.rung) && typeof k.since === 'string';
};

const isStanding = (v: unknown): v is TrustStanding => {
  const agents = (v as TrustStanding | null)?.agents;
  return Array.isArray(agents) && agents.every((a) => typeof a?.agent === 'string' && Array.isArray(a.kinds) && a.kinds.every(isKind));
};

const count = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Whether an agent's `kept` is the shape the record answers: counts that are whole numbers, and each kind in words. */
const keptOf = (v: unknown): v is NonNullable<Agent['kept']> => {
  const k = v as Agent['kept'] | null | undefined;
  return (
    typeof k === 'object' &&
    k !== null &&
    count(k.accepted) &&
    count(k.answered) &&
    k.accepted <= k.answered &&
    count(k.days) &&
    Array.isArray(k.kinds) &&
    k.kinds.every((x) => typeof x?.kind === 'string' && count(x.accepted) && count(x.answered) && x.accepted <= x.answered)
  );
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
      asking: a.asking && typeof a.asking.from === 'string' ? { from: a.asking.from, at: String(a.asking.at ?? '') } : null,
      kinds: a.kinds.map((k) => ({ kind: k.kind, rung: k.rung, since: k.since, lifted: k.lifted === true, dropped: k.dropped && typeof k.dropped.at === 'string' ? { at: k.dropped.at, why: typeof k.dropped.why === 'string' ? k.dropped.why : null } : null })),
      /* THE ACCEPTED-UNCHANGED SHARE, carried only where the record said one: a host a release behind says none. */
      ...(keptOf(a.kept) ? { kept: a.kept } : {}),
    })),
  };
}

/** The client's `call`, and nothing else of it, so a test hands in one function. */
export type TakeBackClient = { call: (name: string, args: Record<string, unknown>) => Promise<unknown> };

/** What a press of "Ask again" came to: done, or the record's sentence for why not. */
export type TakeBackOut = { ok: true } | { ok: false; fix: string };

const NOT_DONE = 'That could not be done just now. Nothing was changed.';

/**
 * Put one kind back to asking, by the agent and the kind as the record said them. The typed client has no line for
 * `trustTakeBack` yet, so it goes by name through `call`, as the record's other new doors do.
 */
export async function takeBack(client: TakeBackClient, take: { agent: string; kind: string }): Promise<TakeBackOut> {
  let out: unknown;
  try {
    out = await client.call('trustTakeBack', { agent: take.agent, kind: take.kind });
  } catch {
    return { ok: false, fix: NOT_DONE };
  }
  const answer = out as { ok?: unknown; refusal?: { fix?: unknown } } | null;
  if (typeof answer === 'object' && answer !== null && answer.ok === true) return { ok: true };
  const fix = answer?.refusal?.fix;
  return { ok: false, fix: typeof fix === 'string' && fix.trim() !== '' ? fix : NOT_DONE };
}
