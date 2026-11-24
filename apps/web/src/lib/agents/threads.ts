/**
 * WHAT HE TOLD AGENTS, AS CONVERSATIONS (the Agents page of 24 Nov: "the whole agents tab, agent communication, all that;
 * is horrendous"). Each instruction he sent is a thread; a reply he sends inside it is the thread's next word (`thread`
 * on the instruction, `sendReply`), and each answer the run gave is a message of its own (`replies`). The page draws a
 * thread as his words and the agent's in turn, one plain line of where it stands, and his box to reply.
 *
 * NOTHING HERE IS PLUMBING ON A SCREEN: no `IN4`, no `S883`, no row ids and no titles of what the run changed. What the
 * run changed while it held his words is one count, "4 changes", which opens What changed narrowed to that run.
 *
 * AND WHAT A LIVE SESSION IS DOING NOW (`nowOf`): the newer of what it last said it is doing and its newest note, never
 * the first thing it said, which a session says once and keeps for hours.
 *
 * PURE, so `node --test` reads every sentence (`threads.test.ts`).
 */

import { agentNamed, clockSaid, plural, projectName, type LiveRun, type Project, type RunKnown, type Thread } from '../record/instruct.ts';

/* ── threads ────────────────────────────────────────────────────────────── */

/** One thread: its first instruction, every word of it oldest first, and the newest. */
export type ThreadGroup = { key: string; first: Thread; words: Thread[]; latest: Thread };

const OPEN = new Set(['sent', 'seen', 'working']);

const seqOf = (id: string): number => Number(id.replace(/^IN/u, '')) || 0;

/** When a thread last moved: its newest word, or the newest answer in it. */
export function movedAt(g: ThreadGroup): number {
  let at = 0;
  for (const w of g.words) {
    at = Math.max(at, Date.parse(w.at) || 0, Date.parse(w.replied_at ?? '') || 0);
    for (const r of w.replies ?? []) at = Math.max(at, Date.parse(r.at) || 0);
  }
  return at;
}

/** The instructions of one page of `instructionList`, as threads: a reply under the thread it follows. */
export function threadsOf(rows: readonly Thread[]): ThreadGroup[] {
  const byKey = new Map<string, Thread[]>();
  for (const t of rows) {
    const key = t.thread ?? t.id;
    byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }
  const out: ThreadGroup[] = [];
  for (const [key, list] of byKey) {
    const words = [...new Map(list.map((t) => [t.id, t])).values()].sort((a, b) => seqOf(a.id) - seqOf(b.id));
    const first = words.find((w) => w.id === key) ?? words[0]!;
    out.push({ key, first, words, latest: words.at(-1)! });
  }
  return out;
}

/** Where a thread stands, by its words: one waiting on him, else one still with an agent, else the newest. */
export function threadState(g: ThreadGroup): Thread['state'] {
  if (g.words.some((w) => w.state === 'needs_you')) return 'needs_you';
  const open = [...g.words].reverse().find((w) => OPEN.has(w.state));
  return open?.state ?? g.latest.state;
}

/** The threads in the order he acts on them: waiting on him, then with an agent, then finished, each newest first. */
export function threadsInOrder(groups: readonly ThreadGroup[]): ThreadGroup[] {
  const rank = (g: ThreadGroup): number => {
    const s = threadState(g);
    return s === 'needs_you' ? 0 : OPEN.has(s) ? 1 : 2;
  };
  return [...groups].sort((a, b) => rank(a) - rank(b) || movedAt(b) - movedAt(a));
}

/** One message of a thread, as drawn. */
export type ThreadMessage = { key: string; from: 'you' | 'agent'; text: string; when: string; asks: boolean };

/** One thread, worded for `Threads.svelte`. */
export type ThreadCard = {
  key: string;
  /** His first words, which name the thread. */
  title: string;
  /** Who has it and where: "Claude · BrainDog". */
  who: string;
  /** Who has it alone, "Claude", and the project it is on with its picture, which the row draws before its name. */
  by: string;
  project: { key: string; name: string; picture: string | null } | null;
  /** The agent kind, for its mark. */
  agent: string | null;
  /** One plain line of where it stands: "Claude took it 23:03", "Claude asks you", "Done 23:14". */
  status: string;
  tone: 'needs' | 'open' | 'done' | 'ended';
  messages: ThreadMessage[];
  /** What the run changed while it held his words, as one count and where it opens. */
  changes: { said: string; href: string } | null;
  /** Finished, so it is drawn as one line until opened. */
  folded: boolean;
  /** He can write back inside it. */
  reply: boolean;
  /** The agent's name, for "Reply to Claude". */
  name: string;
  /** Answers one press gives, where the agent asked him a yes or no question. */
  quick: string[];
  /** The word he can still take back, while no agent has taken it. */
  takeBack: string | null;
  /** It is over, so he can close it off the list. */
  close: boolean;
};

export type CardContext = { now: number; zone?: string; runs: ReadonlyMap<string, RunKnown>; projects: ReadonlyMap<string, Project> };

/** His words on one line, cut at a word where they run long. */
export function oneLine(said: string, most = 90): string {
  const one = said.replace(/\s+/gu, ' ').trim();
  if (one.length <= most) return one;
  const cut = one.slice(0, most);
  const at = cut.lastIndexOf(' ');
  return `${(at > most / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/u, '')}…`;
}

/* A QUESTION A YES OR A NO ANSWERS: its last sentence asks, and opens as such a question does. "Which one?" is answered
   in words, so it gets the box and no buttons. */
const YES_NO = /^(?:should|shall|can|could|may|do|does|did|is|are|was|will|would|want|ok|okay|good to|happy to|merge|ship|deploy|push|go ahead)\b/iu;

/** Whether the agent's words end in a question a yes or a no answers. */
export function asksYesNo(said: string): boolean {
  const text = said.replace(/\s+/gu, ' ').trim();
  if (!text.endsWith('?')) return false;
  const last = text.split(/(?<=[.!?])\s+/u).at(-1) ?? text;
  return YES_NO.test(last.trim()) && !/\bor\b/iu.test(last);
}

/** The agent kind a thread is with: the run that took its newest word, else the kind it was sent to. */
function agentOf(g: ThreadGroup, runs: ReadonlyMap<string, RunKnown>): string | null {
  for (const w of [...g.words].reverse()) {
    const holder = w.taken_by ?? w.seen_by ?? w.to_run;
    const kind = (holder ? runs.get(holder)?.agent : null) ?? w.to_agent;
    if (kind) return kind;
  }
  return null;
}

/** One thread, worded: his words and the agent's in turn, where it stands, and what he can do about it. */
export function threadCardOf(g: ThreadGroup, ctx: CardContext): ThreadCard {
  const { now, zone, runs, projects } = ctx;
  const hm = (iso: string | null) => clockSaid(iso, now, zone);
  const kind = agentOf(g, runs);
  const name = agentNamed(kind) ?? (g.latest.to === 'anyone' ? 'the next agent' : 'the agent');
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const on = [g.first.project, g.latest.project].map((k) => (k === null ? undefined : projects.get(k))).find((p) => p !== undefined) ?? null;
  const by = agentNamed(kind) ?? (g.latest.to === 'anyone' ? 'Any agent' : 'An agent');
  const who = [by, on?.name].filter((x): x is string => !!x).join(' · ');

  const messages: ThreadMessage[] = [];
  for (const w of g.words) {
    messages.push({ key: `${w.id}:you`, from: 'you', text: w.said, when: hm(w.at), asks: false });
    const replies = w.replies ?? (w.reply !== null ? [{ said: w.reply, state: w.state === 'needs_you' ? 'needs_you' : 'done', at: w.replied_at ?? w.updated_at }] : []);
    for (const [n, r] of replies.entries()) messages.push({ key: `${w.id}:${String(n)}`, from: 'agent', text: r.said, when: hm(r.at), asks: r.state === 'needs_you' });
  }

  const state = threadState(g);
  const latest = g.latest;
  const status =
    state === 'needs_you'
      ? `${Name} asks you`
      : state === 'working'
        ? `${Name} took it ${hm(latest.taken_at)}`.trim()
        : state === 'seen'
          ? `${Name} saw it ${hm(latest.seen_at)}, not taken yet`
          : state === 'sent'
            ? `Sent ${hm(latest.at)}, waiting for ${name}`
            : state === 'done'
              ? `Done ${hm(latest.replied_at ?? latest.updated_at)}`
              : state === 'declined'
                ? `${Name} declined it`
                : state === 'expired'
                  ? 'No agent took it'
                  : 'You took it back';
  const tone: ThreadCard['tone'] = state === 'needs_you' ? 'needs' : OPEN.has(state) ? 'open' : state === 'done' ? 'done' : 'ended';

  /* WHAT THE RUNS CHANGED WHILE THEY HELD HIS WORDS, one count, opening What changed at the run that made them. */
  const changed = g.words.reduce((n, w) => n + (w.receipts?.changes ?? 0), 0);
  const run = [...g.words].reverse().find((w) => (w.receipts?.changes ?? 0) > 0)?.receipts?.run ?? null;
  const changes = changed > 0 && run !== null ? { said: plural(changed, 'change'), href: `/audit?by=${encodeURIComponent(run)}` } : null;

  const asked = [...messages].reverse().find((m) => m.from === 'agent');
  const open = latest.state === 'sent' || latest.state === 'seen';
  return {
    key: g.key,
    title: oneLine(g.first.said),
    who,
    by,
    project: on ? { key: on.key, name: on.name, picture: on.picture ?? null } : null,
    agent: kind,
    status,
    tone,
    messages,
    changes,
    folded: tone === 'done' || tone === 'ended',
    reply: latest.kind === 'tell' && latest.state !== 'withdrawn',
    name,
    quick: state === 'needs_you' && asked?.asks && asksYesNo(asked.text) ? ['Yes', 'No'] : [],
    takeBack: open && latest.taken_by === null ? latest.id : null,
    close: !g.words.some((w) => OPEN.has(w.state) || w.state === 'needs_you'),
  };
}

/** The thread whose word `id` is, among `groups`. */
export const groupOf = (groups: readonly ThreadGroup[], id: string): ThreadGroup | null => groups.find((g) => g.key === id || g.words.some((w) => w.id === id)) ?? null;

/* ── a question an agent asked him, as Needs you draws it ───────────────── */

/** A question an agent asked inside a thread, on one line, with who asks and what one press answers. */
export type AskCard = { key: string; question: string; who: string; agent: string | null; quick: string[]; name: string };

/** The newest question in a thread waiting on him: the agent's words cut to one line, never the whole message. */
export function askOf(t: Thread, agents: Readonly<Record<string, string>>, projects: ReadonlyMap<string, Project> = new Map()): AskCard {
  const kind = t.to_agent ?? (t.taken_by ? (agents[t.taken_by] ?? null) : null);
  const name = agentNamed(kind?.toLowerCase().replace(/^agent:/u, '') ?? null) ?? 'An agent';
  const asked = [...(t.replies ?? [])].reverse().find((r) => r.state === 'needs_you')?.said ?? t.reply ?? '';
  const words = asked.trim() === '' ? `About “${oneLine(t.said, 60)}”` : lastQuestion(asked);
  const project = projectName(t.project, projects);
  return { key: t.thread ?? t.id, question: oneLine(words, 120), who: [name, project].filter((x): x is string => !!x).join(' · '), agent: kind, quick: asksYesNo(asked) ? ['Yes', 'No'] : [], name };
}

/** How long an agent's question may be and still be said whole, the line it stands on at a laptop's width. */
const ASK_WHOLE = 120;

/**
 * THE AGENT'S QUESTION, WITH WHAT IT IS ABOUT: the sentence that asks (the last that ends in a question mark, else the
 * first), and the sentences before it while all of them fit on the line. "Should I send both a polite chaser today?"
 * alone did not say both of what; "Two are late: Studio Nine and Harbor Press. Should I send both…" does.
 */
export function lastQuestion(said: string): string {
  const parts = said.replace(/\s+/gu, ' ').trim().split(/(?<=[.!?])\s+/u);
  let at = parts.length - 1;
  while (at > 0 && !parts[at]!.endsWith('?')) at -= 1;
  if (!parts[at]?.endsWith('?')) return parts[0] ?? said;
  let from = at;
  while (from > 0 && parts.slice(from - 1, at + 1).join(' ').length <= ASK_WHOLE) from -= 1;
  return parts.slice(from, at + 1).join(' ');
}

/* ── who is working now ─────────────────────────────────────────────────── */

/**
 * WHAT A LIVE SESSION IS DOING NOW, in its own words: the newer of what it last said it is doing (its handoff's `doing`)
 * and its newest note. A `doing` with no line in the log is the name the record gave the run ("Claude Code in
 * BrainDog"), never what it is doing, so a note says it then. `null` when it has said neither.
 */
export function nowOf(r: Pick<LiveRun, 'doing' | 'doing_at' | 'note' | 'note_at' | 'asked' | 'name'>, own: (doing: string) => boolean = () => false): string | null {
  if (r.asked?.trim()) return `Asks you: “${oneLine(r.asked, 80)}”`;
  const doing = r.doing?.trim() || null;
  const note = r.note?.trim() || null;
  /* A `doing` WITH NO LINE OF ITS OWN WAS SAID AS THE RUN OPENED, older than any note it wrote since. */
  const doingAt = Date.parse(r.doing_at ?? '') || 0;
  const noteAt = Date.parse(r.note_at ?? '') || 0;
  const doingReal = doing !== null && !own(doing);
  if (note !== null && (!doingReal || noteAt >= doingAt)) return oneLine(note, 120);
  return doingReal ? oneLine(doing, 120) : null;
}
