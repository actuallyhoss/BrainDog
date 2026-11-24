/**
 * What came back from what he told agents, as the shell reads it (agents and MCP plan §2.3 "What the app shows", §7.2):
 * the instructions a run answered Needs you, which count in Needs you and on Today, and the ones it finished, which land
 * in Handled. Both ring once as the app's alert (`instructionAlert` in `shell/alerts.ts`).
 *
 * READ ONLY WHERE `boot` SAYS THERE IS SOMETHING TO READ (`toldReadable` in `home/need-you.ts`, which the shell holds
 * without loading this file): a record where he never told an agent anything costs no request at all.
 *
 * PURE BUT FOR `readToldBack`, which takes the base and an optional `fetch`, so `node --test` reads every line.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from './boot-live.ts';
import type { Thread } from './instruct.ts';
import { AGENT_NAMES } from './names.ts';
import { askOf } from '../agents/threads.ts';

export { TOLD_LIST, toldReadable } from '../home/need-you.ts';
export { recordNow } from './boot-live.ts';

/** How many of each the shell reads: a run asks him back a few times a day, never twenty at once. */
export const TOLD_READ = 20;

/** How recent a move must be to ring: the first read after a load would otherwise ring for every old one. */
export const TOLD_RING_MS = 120_000;

/**
 * What came back: the threads waiting on him and the threads finished, each newest first, and the kind of agent each
 * run that answered is, by its handle (`S883` to `claude`), so a line names the agent and never the run.
 */
export type ToldBack = { needs: Thread[]; done: Thread[]; agents: Readonly<Record<string, string>> };

export const NOTHING_BACK: ToldBack = { needs: [], done: [], agents: {} };

/** How many runs one read names: the runs behind the newest few answers. */
const RUNS_NAMED = 10;

const isThread = (v: unknown): v is Thread => typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string' && typeof (v as { state?: unknown }).state === 'string';

/** The rows of one `instructionList` answer, or none for a refusal or another shape. */
export function rowsOf(answer: unknown): Thread[] {
  const a = answer as { ok?: unknown; value?: { rows?: unknown } } | null | undefined;
  return a?.ok === true && Array.isArray(a.value?.rows) ? a.value.rows.filter(isThread) : [];
}

/** Ask the record what waits on him and what was finished. `null` when it could not be read, which keeps what was heard. */
export async function readToldBack(base: string, io?: Fetch): Promise<ToldBack | null> {
  try {
    const c = createClient({ base, ...(io ? { fetch: io } : {}) });
    const [needs, done] = await Promise.all([c.instructionList({ state: 'needs_you', limit: TOLD_READ }), c.instructionList({ state: 'done', limit: TOLD_READ })]);
    if (!needs.ok && !done.ok) return null;
    const back = { needs: rowsOf(needs), done: rowsOf(done) };
    /* THE AGENT BEHIND EACH ANSWER, from its run's own row, for a thread that does not say it (`to_agent`). */
    const handles = [...new Set([...back.needs, ...back.done].filter((t) => t.to_agent === null).map((t) => t.taken_by).filter((h): h is string => h !== null && /^S[1-9][0-9]*$/u.test(h)))].slice(0, RUNS_NAMED);
    const agents: Record<string, string> = {};
    await Promise.all(
      handles.map(async (h) => {
        const got = await c.get('session', Number(h.slice(1))).catch(() => null);
        const agent = got?.ok ? (got.value as { fields?: { agent?: unknown } } | null)?.fields?.agent : undefined;
        if (typeof agent === 'string' && agent.trim() !== '') agents[h] = agent.trim();
      }),
    );
    return { ...back, agents };
  } catch {
    return null;
  }
}

/** The moves recent enough to ring (`TOLD_RING_MS`), as `instructionAlert` takes them. */
export const toldMoves = (back: ToldBack, now: number): { id: string; state: string }[] =>
  [...back.needs, ...back.done].filter((t) => {
    const at = Date.parse(t.replied_at ?? t.updated_at);
    return Number.isFinite(at) && now - at < TOLD_RING_MS;
  });

/** The day an instant falls on, in the record's zone where it is known: `2026-09-03`. */
const dayOf = (ms: number, zone?: string): string =>
  new Intl.DateTimeFormat('en-CA', { ...(zone ? { timeZone: zone } : {}), year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** The threads finished today, on the record's clock: what Handled lists beside what BrainDog did by itself. */
export function doneToday(done: readonly Thread[], now: number, zone?: string): Thread[] {
  const today = done.filter((t) => {
    const at = Date.parse(t.replied_at ?? t.updated_at);
    return Number.isFinite(at) && dayOf(at, zone) === dayOf(now, zone);
  });
  /* ONE LINE A CONVERSATION (the Agents page of 24 Nov): his answer inside a thread is its next word, so a thread he
     answered once finished twice, as "finished “yes”" over "finished “Merge wave 1”" with the question as its reply.
     Its newest finished word stands for it, under the words that opened it. */
  const roots = new Map(done.map((t) => [t.id, t]));
  const newest = new Map<string, Thread>();
  for (const t of today) {
    const key = t.thread ?? t.id;
    const was = newest.get(key);
    if (!was || (t.replied_at ?? t.updated_at) > (was.replied_at ?? was.updated_at)) newest.set(key, t);
  }
  return today.filter((t) => newest.get(t.thread ?? t.id) === t).map((t) => (t.thread && roots.has(t.thread) ? { ...t, said: roots.get(t.thread)!.said } : t));
}

/** The agent that answered, by name: "Claude", or "An agent" where neither the thread nor its run says which. */
export function answeredBy(t: Pick<Thread, 'to_agent' | 'taken_by'>, agents: Readonly<Record<string, string>>): string {
  const kind = t.to_agent ?? (t.taken_by ? (agents[t.taken_by] ?? null) : null);
  const key = kind?.toLowerCase().replace(/^agent:/u, '') ?? '';
  return (key && AGENT_NAMES[key]) || 'An agent';
}

/** What he said, on one line and in his words, cut where it runs long. */
export const saidShort = (said: string, most = 60): string => {
  const one = said.replace(/\s+/gu, ' ').trim();
  return one.length > most ? `${one.slice(0, most - 1).trimEnd()}…` : one;
};

/**
 * A QUESTION AN AGENT ASKED HIM, as Today's Needs you and the Needs you page draw it (the Agents page of 24 Nov): the
 * question on one line in the agent's words (`line`), who asks (`who`, the agent by name) and on which project (by its
 * handle, named where it is drawn), and what one press answers (`quick`, Yes and No for a yes or no question). Never the
 * agent's whole message: "Claude needs you on “Following up IN2: check”" over the reply in full was the old card.
 */
export type ToldNeed = { key: string; line: string; who: string; agent: string | null; project: string | null; quick: string[]; about: string };

export const toldNeedOf = (t: Thread, agents: Readonly<Record<string, string>>): ToldNeed => {
  const ask = askOf(t, agents);
  return { key: t.id, line: ask.question, who: answeredBy(t, agents), agent: ask.agent, project: t.project, quick: ask.quick, about: saidShort(t.said) };
};
