/**
 * Slash and the agents running now: who is there, how to reach one, and what the ones before them did.
 *
 * LIVE, FROM THE RECORD'S OWN READS. Who is there is `presence` and the runs list, read when asked and never kept, so
 * "working", "quiet" and "gone" are the one clock's (`liveStateOf`): working is a call in the last 15 minutes with the
 * window open, quiet is open with no call for longer, gone is open with no pulse.
 *
 * A QUESTION PLAINLY ABOUT THEM IS ANSWERED HERE, WITH NO MODEL (`agentsDirect`). The first words wait on nothing but
 * the record, the ask costs nothing, and nothing an agent wrote passes through a model on its way to the screen. A
 * sentence these rules do not read goes to the model, which has the same reads as tools (`AGENT_TOOLS`).
 *
 * A MESSAGE GOES THROUGH `sendTo`, THE ONE DOOR, AS THE PERSON. Who may send is the record's to say (the owner, a person
 * and never a token); nothing here decides it again. Slash decides only whether a yes is needed first:
 *   - the person's own sentence, read by these rules, with one target: it goes at once, in their words.
 *   - two could match: a card for each, and nothing goes until one is pressed. Enter does not press a choice.
 *   - the model wants to send: at once only when this message asks for a message and this turn has read no agent's words;
 *     otherwise it is held for a yes that shows who and what.
 *   - a machine: held, since it starts a job there.
 *
 * WHAT AN AGENT WROTE IS DATA. Its doing line, its handoff, what it tried and its reply are text nobody here wrote: each
 * read marks the turn `outside`, which drops the rest of it to asking (`run.askOnly`), and a reply is said between marks
 * that say whose words they are. That is the same rule a row from a feed is under, and the test holds it.
 */

import { fixOf, type Result } from '@braindog/ports';
import { liveStateOf, type LiveState } from '@braindog/kernel';

import { runnerOf } from './words.ts';

type Args = Record<string, unknown>;
type Answer<T = unknown> = Promise<Result<T>>;

/** A run's fields, as the runs list keeps them. */
type Fields = Record<string, unknown>;
type RunRow = { id: string; register: string; seq: number | null; state?: string | null; fields: Fields };

/** One place a message can go, as `sendTargets` lists it. */
export type AgentTarget = { id: string; kind: string; label: string; detail?: string; live?: boolean; project?: string; machine?: string; run?: string; repos?: string[] };

/** The record's methods this file reads and sends through. Each optional, as a host may not answer it. */
export type AgentSurface<C> = {
  list(args: { register: string; where?: unknown; limit?: number; cursor?: string | null }, ctx: C): Answer<{ rows: unknown[] }>;
  get(args: { spoken: string }, ctx: C): Answer;
  boot(ctx: C): Answer<{ registers: { id: string; name: string }[] }>;
  presence?(args: undefined, ctx: C): Answer<unknown>;
  sendTargets?(args: { row?: string; project?: string } | undefined, ctx: C): Answer<unknown>;
  sendTo?(args: Args, ctx: C): Answer<unknown>;
  sentList?(args: { open?: string } | undefined, ctx: C): Answer<unknown>;
  instructionList?(args: { limit?: number } | undefined, ctx: C): Answer<unknown>;
};

/** What a message that went says back: the instruction, who it went to, and the run where it went to one. */
export type SentReceipt = { id: string; to: string; said?: string; run?: string };

/** What the words of one read ran as, in the shape of a Slash tool's answer. */
export type AgentRan = {
  text: string;
  outside?: string | null;
  step?: string;
  action?: AgentAction;
  actions?: AgentAction[];
};
export type AgentAction = { kind: 'done' | 'ask'; title: string; detail?: string; href?: string; sent?: SentReceipt; group?: string; op?: Args };

/** How the engine's run stands, as `slash-tools.ts` has it. */
export type AgentRun = { askOnly: boolean; asked: boolean; said: string; outside: string | null };

/** What came with a person's words: the rows and runs they mentioned, and the row of the page behind. */
export type DirectWith = { attach?: readonly string[] | undefined; mentions?: readonly { at: number; len: number; ref: string }[] | undefined; page?: { row?: string | undefined } | undefined };

/** The reads and the door, as the model is told of them. */
export const AGENT_TOOLS = [
  { name: 'agents', args: 'about?', about: 'Who is running right now, read live: what each is doing, on which project and computer, how long since it was heard, and what waits on them. Use for any question about agents, sessions, who is working or what is stuck, and never answer those from memory. about narrows it to a project' },
  { name: 'ran', args: 'about', about: 'What agents did on a project or a run: the last runs, what they finished, the step they left, what they tried, and what was decided there. "what happened on Marsh": ran("Marsh")' },
  { name: 'told', args: '', about: 'What you sent agents and what came back: whether each arrived, and its reply' },
  { name: 'tell', args: 'to, message', about: 'Send a message to one running agent or a machine: tell("the one on Bake", "stop and write what you found"). to is a project, a computer, an agent or a run (S12). The message is in their words. Never say a message went unless this says it did', writes: true },
  { name: 'handover', args: 'about?, note?', about: 'Start an agent on something, or hand on what a run left: "pick this up", "start something on this". about is a row, a run or a project, else what they sent or are looking at', writes: true },
] as const;

const REF_ROW = /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u;
const SHOWN_MOST = 8;
const CARDS_MOST = 4;
const REPLY_MOST = 600;
/** Runs read at most, to tell who was gone or ended: newest first, and what a person means by lately. */
const RUNS_READ = 60;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const clip = (s: string, most: number): string => {
  const one = s.replace(/\s+/gu, ' ').trim();
  return one.length <= most ? one : `${one.slice(0, most - 1).trimEnd()}…`;
};
/** What an agent wrote, in one line: never a brace the screen would read as a link it did not ask for. */
const theirs = (s: string, most: number): string => clip(s.replace(/[{}]/gu, ''), most);
const isRun = (x: unknown): x is RunRow => isObject(x) && typeof x.id === 'string' && isObject(x.fields);

/** How long ago, as a person says it. Said and never compared: the one clock answers what a run is. */
export function agoSaid(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} days ago`;
}

/** The three words a person is told, from the clock's finer five. */
export type RunWord = 'working' | 'quiet' | 'gone';
export const wordOf = (s: LiveState): RunWord | null => (s === 'working' || s === 'thinking' ? 'working' : s === 'waiting' ? 'quiet' : s === 'gone' ? 'gone' : null);

/** One run now, as these answers say it. */
export type Live = { run: string; ref: string | null; who: string; project: string | null; projectRef: string | null; repo: string | null; doing: string | null; word: RunWord; heardMs: number; asked: string | null };

/** Everything a reply or a step said, as one line, with a mark on each end saying it is an agent's words and nothing more. */
export const agentWords = (s: string, most = REPLY_MOST): string => `«${theirs(s.replace(/[«»]/gu, ''), most)}»`;

/** A field a run keeps as one line or a list of lines, as one line. */
const lines = (v: unknown): string => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').slice(-3).join('; ');
  if (typeof v !== 'string' || v.trim() === '') return '';
  const t = v.trim();
  if (!t.startsWith('[')) return t;
  try {
    const parsed: unknown = JSON.parse(t);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').join('; ') : t;
  } catch {
    return t;
  }
};

/** Words that say a person means an agent, in the part of a sentence that names who. */
const MEANS_AGENT = /\b(?:agents?|sessions?|runs?|the one|one (?:on|in|for)|whoever|anyone|anybody|claude|codex|cursor|gemini|copilot|windsurf|machine|computer|mac|macbook|laptop|studio|s[1-9][0-9]*)\b/iu;
/** Words that name no one in particular. */
const NO_NAME = new Set(['the', 'a', 'an', 'one', 'that', 'this', 'on', 'in', 'at', 'for', 'of', 'my', 'our', 'your', 'agent', 'agents', 'session', 'sessions', 'run', 'working', 'running', 'who', 'is', 's', 'thats', 'whos', 'to', 'computer', 'machine']);

/** The message a sentence asks to be sent: who it names and the words to send, or `null` where it asks for none. */
export function tellOf(said: string): { to: string; message: string } | null {
  const s = said.trim();
  const m =
    /^(?:please\s+|hey\s+|ok\s+|okay\s+)*(?:tell|ask|message|msg|ping|nudge|have|get|send(?:\s+(?:a\s+)?(?:message|note|word))?(?:\s+to)?)\s+(.+?)(?:\s+to\s+|\s*:\s*|\s*,\s*|\s+that\s+|\s+(?=(?:what|why|how|when|where|whether|if)\b))(.+)$/iu.exec(s);
  if (m === null) return null;
  const message = m[2]!.trim().replace(/^to\s+/iu, '');
  if (message === '') return null;
  /* "ASK S4 WHAT IT FOUND" IS A QUESTION TO IT, and says so. */
  const asking = /^(?:what|why|how|when|where|whether|if)\b/iu.test(message) && !/[?.!]$/u.test(message);
  return { to: m[1]!.trim(), message: `${message.charAt(0).toUpperCase()}${message.slice(1)}${asking ? '?' : ''}` };
}

/** Whether a person's words ask for a message to go: the model's send lands at once only on these. */
export const asksToSend = (said: string): boolean => /\b(tell|ask|message|msg|ping|nudge|send|let\s+\S+(?:\s+\S+){0,3}\s+know)\b/iu.test(said);

/* THE QUESTIONS THESE READS ANSWER WITH NO MODEL. Tight on purpose: what they miss goes to the model, which has the same
   reads, and a wrong match here would answer the wrong question. */
const MONEYISH = /\b(cost|costs|spend|spent|pay|paid|price|budget|bill|tokens?|usage|money)\b/iu;
const OVERVIEW =
  /^(?:(?:so|ok|okay|hey)[, ]+)?(?:(?:what(?:'s| is| are)?|who(?:'s| is| are)?|how(?:'s| are)?|are|is|any|which)\b[^?]*\b(?:my\s+)?(?:agents?|sessions?|runs?|anyone|anybody|claude|codex)\b[^?]*\b(?:doing|running|working|up to|busy|active|at work|live|open)\b|who(?:'s| is)\s+(?:working|running|on|at work|around|there)\b(?:\s+(?:now|right now|today))?|what(?:'s| is)\s+running\b(?:\s+(?:now|right now))?|what(?:'s| are)\s+(?:my\s+)?(?:the\s+)?agents?\b.*)[\s?.!]*$/iu;
const WHO_ON = /^(?:(?:so|ok|okay|hey)[, ]+)?(?:who(?:'s| is| are)?|is\s+(?:anyone|anybody|an agent|something|any agent)|are\s+(?:any\s+)?agents?|any\s+agents?|anyone|anybody)\s+(?:working\s+on|on|in|running\s+on|at\s+work\s+on|looking\s+at|doing)\s+(.+?)[\s?.!]*$/iu;
const STUCK = /^(?:(?:so|ok|okay|hey)[, ]+)?(?:is|are|any|anything|anyone|what(?:'s| is)?|who(?:'s| is)?|which)\b[^?]*\b(?:stuck|blocked|stalled|hung|frozen|waiting on me|need(?:s|ing)? me)\b[\s?.!]*$/iu;
const LAST_ON =
  /\b(?:what\s+(?:did|has|have|was)\b.*\b(?:last|previous|latest)\b.*\b(?:agent|session|run|one)\b|what\s+happened|where\s+(?:did|are|were)\b.*\bleft\s+off|what\s+did\b.*\b(?:agents?|sessions?|runs?)\b|last\s+(?:agent|session|run))\b/iu;
const TOLD = /^(?:(?:so|ok|okay|hey)[, ]+)?(?:(?:did|has|have)\s+(?:it|they|that|the\s+\S+|s[1-9][0-9]*)\b.*\b(?:repl\w*|answer\w*|respond\w*|see|seen|saw|get|got|hear\w*|back)\b|what\s+did\s+(?:it|they)\s+(?:say|reply|answer|come back with)|any\s+(?:reply|replies|answer|word)\b.*|what\s+came\s+back)[\s?.!]*$/iu;
const PICK_UP = /^(?:(?:please|ok|okay|so)[, ]+)?(?:pick\s+(?:this|it|that)\s+up|pick\s+up\b.*|hand\s+(?:this|it|that)\s+(?:off|on|over)\b.*|start\s+(?:something|an?\s+agent|work|someone)\b.*|get\s+(?:an?\s+agent|someone)\s+(?:on|to)\b.*|take\s+(?:this|it|that)\s+(?:over|on)\b.*)[\s?.!]*$/iu;

/**
 * Who is running and what they did, over one asker's reads. Built per turn with the tools: every read is the record's,
 * under the asker, and what they may not read is refused in the record's words.
 */
export function agentReads<C>(surface: AgentSurface<C>, ctx: C, now: () => number = Date.now) {
  /* EACH READ ONCE A TURN: a question that wants the runs twice reads them once. */
  let runsRead: Promise<RunRow[] | string> | null = null;
  const runsNow = (): Promise<RunRow[] | string> =>
    (runsRead ??= surface.list({ register: 'session', limit: RUNS_READ }, ctx).then(
      (got) => (got.ok ? (got.value.rows.filter(isRun) as RunRow[]) : fixOf(got) || "You can't read the agents on this BrainDog."),
      () => 'The agents could not be read just now.',
    ));
  let presenceRead: Promise<Map<string, { asked: string | null; heard: number }>> | null = null;
  const presenceNow = () =>
    (presenceRead ??= (async () => {
      const out = new Map<string, { asked: string | null; heard: number }>();
      if (!surface.presence) return out;
      const got = await surface.presence(undefined, ctx);
      if (got.ok && Array.isArray(got.value))
        for (const r of got.value)
          if (isObject(r) && typeof r.run === 'string')
            out.set(r.run, { asked: typeof r.asked === 'string' ? r.asked : null, heard: typeof r.heard_s === 'number' ? r.heard_s * 1000 : Number.NaN });
      return out;
    })());

  const titles = new Map<string, Promise<string | null>>();
  const projectTitle = (spoken: string): Promise<string | null> => {
    const known = titles.get(spoken);
    if (known) return known;
    const asked = surface.get({ spoken }, ctx).then(
      (got) => {
        if (!got.ok || !isObject(got.value) || !isObject(got.value.fields)) return null;
        const f = got.value.fields;
        for (const k of ['name', 'title', 'what', 'summary']) if (text(f[k]) !== '') return text(f[k]);
        return null;
      },
      () => null,
    );
    titles.set(spoken, asked);
    return asked;
  };

  const spokenOf = (r: RunRow): string => (typeof r.seq === 'number' ? `S${r.seq}` : r.id);
  const refOf = (r: RunRow): string | null => (typeof r.seq === 'number' ? `${r.register}#${r.seq}` : null);
  /* WHEN IT WAS LAST HEARD, FOR SAYING: the later of a call and a pulse. Runs are ordered by it; nothing is decided by it. */
  const heardOf = (f: Fields): number => {
    const stamps = [f['last_seen'], f['pulse_at'], f['seen_before']].filter((v): v is string => typeof v === 'string' && v !== '').map((v) => Date.parse(v));
    return stamps.length === 0 ? 0 : Math.max(...stamps);
  };
  const callHeardOf = (f: Fields): number => (typeof f['last_seen'] === 'string' ? Date.parse(f['last_seen']) : heardOf(f));
  /* A QUIET RUN'S WINDOW STILL SAYS IT IS OPEN, so how long it has been quiet is since its last call and not its last pulse. */
  const lastHeard = (r: RunRow): number => (wordOf(liveStateOf(r as never, now())) === 'quiet' ? callHeardOf(r.fields) : heardOf(r.fields));

  /** The runs open now, each with its word, helpers left to the run they work for, newest heard first. */
  const roster = async (): Promise<Live[] | string> => {
    const rows = await runsNow();
    if (typeof rows === 'string') return rows;
    const present = await presenceNow();
    const t = now();
    const out: Live[] = [];
    for (const r of rows) {
      const f = r.fields;
      if (text(f['parent']) !== '') continue;
      const word = wordOf(liveStateOf(r as never, t));
      if (word === null) continue;
      const project = text(f['project']);
      const seen = present.get(spokenOf(r));
      /* WHAT A QUIET RUN IS ASKED: how long since it last did anything, not since its window last said it was open. */
      const heard = word === 'working' ? (seen?.heard ?? t - heardOf(f)) : t - callHeardOf(f);
      out.push({
        run: spokenOf(r),
        ref: refOf(r),
        who: runnerOf(f),
        project: project === '' ? null : ((await projectTitle(project)) ?? null),
        projectRef: project === '' ? null : project,
        repo: text(f['repo']) || null,
        doing: text(f['doing']) || text(f['title']) || null,
        word,
        heardMs: heard,
        asked: seen?.asked ?? null,
      });
    }
    const rank: Record<RunWord, number> = { working: 0, quiet: 1, gone: 2 };
    return out.sort((a, z) => rank[a.word] - rank[z.word] || a.heardMs - z.heardMs);
  };

  const refSaid = (l: { ref: string | null; run: string }): string => (l.ref === null ? l.run : `{{ref:${l.ref}}}`);

  /** One run as an item of an answer: who and where, then under it what it is doing and when it was heard. */
  const lineOf = (l: Live, showProject = true): string => {
    const where = showProject && l.project !== null ? ` on ${l.project}` : '';
    const doing = l.doing === null ? 'Between steps.' : `${theirs(l.doing, 110).replace(/[.]$/u, '')}.`;
    const heard = l.word === 'working' ? `Heard ${agoSaid(l.heardMs)}.` : `Last heard ${agoSaid(l.heardMs)}.`;
    const asks = l.asked === null ? '' : `\n  It asks you: ${theirs(l.asked, 110)}`;
    return `- ${refSaid(l)}${where}\n  ${doing} ${heard}${asks}`;
  };

  /** Runs under the word each stands at, Working, Quiet and Gone, each word with how many, the first `SHOWN_MOST` drawn. */
  const groupedLines = (roll: readonly Live[], showProject = true): string[] => {
    const out: string[] = [];
    let left = SHOWN_MOST;
    for (const [word, label] of [['working', 'Working'], ['quiet', 'Quiet'], ['gone', 'Gone']] as const) {
      const here = roll.filter((l) => l.word === word);
      const drawn = here.slice(0, left);
      left -= drawn.length;
      if (drawn.length === 0) continue;
      if (out.length > 0) out.push('');
      out.push(`${label} (${here.length})`, ...drawn.map((l) => lineOf(l, showProject)));
    }
    return out;
  };

  /** A project or repository named in a person's words, among those agents have been on. */
  const projectNamed = async (said: string): Promise<{ ref: string; title: string } | null> => {
    const want = said.toLowerCase().replace(/^(?:the\s+)/u, '').replace(/[^\p{L}\p{N} .&-]+/gu, ' ').trim();
    if (want === '') return null;
    const rows = await runsNow();
    if (typeof rows === 'string') return null;
    const seen = new Map<string, string | null>();
    for (const r of rows) {
      const p = text(r.fields['project']);
      if (p !== '' && !seen.has(p)) seen.set(p, await projectTitle(p));
    }
    const named = [...seen].flatMap(([ref, title]) => (title === null ? [] : [{ ref, title }]));
    const exact = named.find((p) => p.title.toLowerCase() === want);
    if (exact) return exact;
    const by = named.filter((p) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${want.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(p.title));
    return by.length === 1 ? by[0]! : null;
  };

  /**
   * What a sentence is about, at its end: "on Marsh finish" is Marsh. The words after on, for or in, a word fewer each time,
   * until they name a project agents have been on.
   */
  const aboutIn = async (said: string): Promise<string | null> => {
    const at = /\b(?:on|for|in|at|with|about)\s+(.+?)[?.!]*$/iu.exec(said)?.[1];
    if (at === undefined) return null;
    const words = at.split(/\s+/u);
    for (let n = words.length; n > 0; n--) {
      const tried = words.slice(0, n).join(' ');
      if ((await projectNamed(tried)) !== null) return tried;
    }
    return null;
  };

  /** What waits on the person from agents: the questions they asked, and what they sent back as needing them. */
  const waitingLines = async (roll: readonly Live[]): Promise<string[]> => {
    const out: string[] = [];
    if (surface.sentList) {
      const got = await surface.sentList({ open: '1' }, ctx);
      const sent = got.ok && isObject(got.value) && Array.isArray(got.value['sent']) ? got.value['sent'].filter(isObject) : [];
      for (const s of sent) if (s['state'] === 'needs_you') out.push(`- ${routedLabel(s)} needs you on what you sent: ${agentWords(text(s['reply']) || text(s['said']), 140)}`);
    }
    const asking = new Set(roll.flatMap((l) => (l.asked === null ? [] : [l.asked])));
    const boot = await surface.boot(ctx);
    const said: unknown = boot.ok ? (boot.value as { waiting?: unknown }).waiting : undefined;
    const waiting = Array.isArray(said) ? said.length : 0;
    const others = waiting - asking.size;
    if (others > 0) out.push(others === 1 ? '- One more question waits for you in Decide.' : `- ${others} more questions wait for you in Decide.`);
    return out.length === 0 ? [] : ['', 'Waiting on you', ...out];
  };

  /** Who is running, all of them or on one project: `agents`. */
  const agentsNow = async (about?: string): Promise<AgentRan> => {
    const roll = await roster();
    if (typeof roll === 'string') return { text: roll, step: 'Reading who is running' };
    const step = 'Reading who is running';
    const outside = "what agents wrote about their own work";
    const named = about === undefined || about.trim() === '' ? null : await projectNamed(about);
    if (about !== undefined && about.trim() !== '' && named === null) {
      const word = about.trim().toLowerCase();
      const hits = roll.filter((l) => `${l.repo ?? ''} ${l.who} ${l.doing ?? ''}`.toLowerCase().includes(word));
      if (hits.length === 0) return { text: `Nothing running is on ${clip(about, 40)}, and I don't know a project by that name.`, step };
      return { text: groupedLines(hits).join('\n'), outside, step };
    }
    const shown = named === null ? roll : roll.filter((l) => l.projectRef === named.ref);
    if (shown.length === 0) {
      if (named === null) {
        const last = await lastEnded();
        return { text: last === null ? 'Nothing is running right now.' : `Nothing is running right now. The last was ${last}.`, ...(last === null ? {} : { outside }), step };
      }
      const last = await lastEnded(named.ref);
      return { text: last === null ? `Nothing is on ${named.title} right now.` : `Nothing is on ${named.title} right now. The last was ${last}.`, ...(last === null ? {} : { outside }), step };
    }
    const waits = named === null ? await waitingLines(roll) : [];
    const more = shown.length > SHOWN_MOST ? ['', `And ${shown.length - SHOWN_MOST} more on the Agents page.`] : [];
    return { text: [...groupedLines(shown, named === null), ...more, ...waits].join('\n'), outside, step };
  };

  const endedRows = async (projectRef?: string): Promise<RunRow[]> => {
    const rows = await runsNow();
    if (typeof rows === 'string') return [];
    return rows
      .filter((r) => text(r.fields['parent']) === '' && liveStateOf(r as never, now()) === 'ended' && (projectRef === undefined || text(r.fields['project']) === projectRef))
      .sort((a, z) => heardOf(z.fields) - heardOf(a.fields));
  };

  /** The run that ended last, in a few words. */
  const lastEnded = async (projectRef?: string): Promise<string | null> => {
    const [r] = await endedRows(projectRef);
    if (r === undefined) return null;
    const doing = text(r.fields['doing']);
    const ref = refOf(r);
    return `${ref === null ? spokenOf(r) : `{{ref:${ref}}}`}, ${agoSaid(now() - lastHeard(r))}${doing === '' ? '' : `: ${theirs(doing, 110)}`}`;
  };

  /** What is stuck: runs gone quiet or gone, and what waits on the person from them. */
  const stuck = async (): Promise<AgentRan> => {
    const roll = await roster();
    const step = 'Reading who is running';
    if (typeof roll === 'string') return { text: roll, step };
    const held = roll.filter((l) => l.word !== 'working' || l.asked !== null);
    const waits = await waitingLines(roll);
    if (held.length === 0 && waits.length === 0) {
      const working = roll.length;
      return { text: working === 0 ? 'Nothing is stuck, and nothing is running.' : `Nothing looks stuck. ${working === 1 ? 'One agent is' : `${working} agents are`} working and heard from.`, step };
    }
    const lead = held.length === 0 ? 'Nothing has gone quiet, but something waits for you.' : held.length === 1 ? 'One looks stuck.' : `${held.length} look stuck.`;
    return { text: [lead, '', ...groupedLines(held), ...waits].join('\n').replace(/\n{3,}/gu, '\n\n'), outside: 'what agents wrote about their own work', step };
  };

  /** One ended or open run as the lines of "what happened". */
  const runStory = (r: RunRow, lead: string): string[] => {
    const f = r.fields;
    const out = [lead];
    const doing = text(f['doing']);
    const note = lines(f['notes']);
    const next = lines(f['next']);
    const tried = lines(f['tried']);
    if (doing !== '') out.push(`- Was on: ${theirs(doing, 200)}`);
    if (note !== '') out.push(`- Said: ${theirs(note, 240)}`);
    if (tried !== '') out.push(`- Tried: ${theirs(tried, 240)}`);
    if (next !== '') out.push(`- Left for the next one: ${theirs(next, 240)}`);
    if (text(f['branch']) !== '') out.push(`- On branch ${clip(text(f['branch']), 80)}`);
    return out;
  };

  /** What happened on a project or a run: `ran`. */
  const ran = async (about: string): Promise<AgentRan> => {
    const step = 'Reading what agents did';
    const rows = await runsNow();
    if (typeof rows === 'string') return { text: rows, step };
    const said = about.trim();
    const outside = 'what agents wrote about their own work';
    const asRun = /^(?:run:)?(S[1-9][0-9]*)$/u.exec(said)?.[1];
    if (asRun !== undefined) {
      const r = rows.find((x) => spokenOf(x) === asRun);
      if (r === undefined) return { text: `I can't find ${said} among the recent runs.`, step };
      return { text: runStory(r, `${refSaid({ ref: refOf(r), run: spokenOf(r) })}, ${stateSaid(r)}, last heard ${agoSaid(now() - lastHeard(r))}.`).join('\n'), outside, step };
    }
    const project = await projectNamed(said);
    if (project === null) return { text: `No agent has worked on anything called ${clip(said, 40)} lately.`, step };
    const here = rows.filter((r) => text(r.fields['project']) === project.ref && text(r.fields['parent']) === '').sort((a, z) => heardOf(z.fields) - heardOf(a.fields));
    if (here.length === 0) return { text: `No agent has worked on ${project.title} lately.`, step };
    const [first, second] = here;
    const out = runStory(first!, `Last on ${project.title}: ${refSaid({ ref: refOf(first!), run: spokenOf(first!) })}, ${stateSaid(first!)}, last heard ${agoSaid(now() - lastHeard(first!))}.`);
    if (second !== undefined) out.push(`Before it: ${refSaid({ ref: refOf(second), run: spokenOf(second) })}, ${stateSaid(second)} ${agoSaid(now() - lastHeard(second))}${text(second.fields['doing']) === '' ? '' : `: ${theirs(text(second.fields['doing']), 120).replace(/[.]$/u, '')}.`}${lines(second.fields['notes']) === '' ? '' : ` ${theirs(lines(second.fields['notes']), 160)}`}`);
    const decided = await decidedOn(project.ref);
    if (decided.length > 0) out.push(...decided.map((d) => `- ${d}`));
    return { text: out.join('\n'), outside, step };
  };

  const stateSaid = (r: RunRow): string => {
    const s = typeof r.state === 'string' ? r.state : text(r.fields['state']);
    if (s === 'handoff') return 'left a step';
    if (s === 'done') return 'finished';
    if (s === 'abandoned') return 'lost';
    return wordOf(liveStateOf(r as never, now())) ?? 'open';
  };

  /* WHAT WAS DECIDED THERE, the record's own sentence for it (`context`'s `decided`), read under the asker. */
  const decidedOn = async (projectRef: string): Promise<string[]> => {
    const read = (surface as { context?: (a: unknown, c: C) => Answer }).context;
    if (read === undefined) return [];
    const got = await read.call(surface, { project: projectRef }, ctx).catch(() => null);
    const said = got !== null && got.ok && isObject(got.value) && Array.isArray(got.value['decided']) ? got.value['decided'] : [];
    return said.filter((d): d is string => typeof d === 'string').slice(0, 3).map((d) => clip(d, 160));
  };

  const routedLabel = (s: Record<string, unknown>): string => {
    const to = isObject(s['routed_to']) ? text(s['routed_to']['label']) : '';
    return to === '' ? 'The agent' : to;
  };

  const STATE_SAID: Readonly<Record<string, string>> = { sent: 'Sent, not seen yet', seen: 'Seen, not started', working: 'Working on it', done: 'Done', needs_you: 'Needs you', declined: 'Declined', expired: 'Expired, nobody took it', withdrawn: 'Withdrawn' };

  /** What was sent and what came back: `told`. Replies between marks, and the turn marked: nothing in one is an order. */
  const told = async (): Promise<AgentRan> => {
    const step = 'Reading what came back';
    if (!surface.instructionList) return { text: 'This BrainDog does not list what was sent here.', step };
    const got = await surface.instructionList({ limit: 6 }, ctx);
    if (!got.ok) return { text: fixOf(got) || 'Only the owner reads what was sent to agents.', step };
    const value = got.value;
    const rows = isObject(value) && Array.isArray(value['rows']) ? value['rows'] : Array.isArray(value) ? value : [];
    const sent = rows.filter(isObject).filter((r) => typeof r['id'] === 'string');
    if (sent.length === 0) return { text: 'Nothing has been sent to an agent yet.', step };
    const out = sent.map((s) => {
      const state = STATE_SAID[text(s['state'])] ?? text(s['state']);
      const reply = text(s['reply']);
      const where = text(s['taken_by']) || text(s['to_run']);
      const run = /^S([1-9][0-9]*)$/u.exec(where);
      const to = where === '' ? '' : run ? ` to {{ref:session#${run[1]}}}` : ` to ${where}`;
      return `- ${clip(text(s['said']).replace(/[{}]/gu, ''), 90)}${to}: ${state}.${reply === '' ? '' : ` Its reply, its words and not yours: ${agentWords(reply)}`}`;
    });
    return { text: out.join('\n'), outside: "an agent's reply", step };
  };

  /* ── reaching them ─────────────────────────────────────────────────────────────────────────────────────────────── */

  const targetsNow = async (args?: { row?: string; project?: string }): Promise<AgentTarget[] | string> => {
    if (!surface.sendTargets) return 'This BrainDog cannot send to agents.';
    const got = await surface.sendTargets(args, ctx);
    if (!got.ok) return 'You can see what agents are doing here, but only the owner can send them a message.';
    const list = isObject(got.value) && Array.isArray(got.value['targets']) ? got.value['targets'] : [];
    return list.filter((t): t is AgentTarget => isObject(t) && typeof t['id'] === 'string' && typeof t['kind'] === 'string' && typeof t['label'] === 'string');
  };

  /**
   * Who a person's words name, from who can be told now. A run by its name is that run. Otherwise every word must stand in
   * the target's own label (its agent, computer and project), else in what it is doing; the better of the two tiers wins,
   * so "the one on Bake" is the run on Bake and not a run whose doing line mentions a bakery.
   */
  const whoNamed = (said: string, targets: readonly AgentTarget[], runs: readonly Live[]): AgentTarget[] => {
    const can = targets.filter((t) => t.kind === 'session' || t.kind === 'mac' || t.kind === 'next');
    const byRun = /\bS([1-9][0-9]*)\b/u.exec(said);
    if (byRun) return can.filter((t) => t.run === `S${byRun[1]}` || t.id === `session:S${byRun[1]}`);
    const words = said.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w !== '' && !NO_NAME.has(w));
    if (words.includes('next') || words.includes('whoever')) return can.filter((t) => t.kind === 'next');
    if (words.length === 0) return can.filter((t) => t.kind === 'session');
    const has = (hay: string, w: string): boolean => hay.split(/[^\p{L}\p{N}]+/u).some((h) => h.startsWith(w));
    const repoOf = (t: AgentTarget): string => runs.find((l) => l.run === t.run)?.repo ?? '';
    const hayOf = (t: AgentTarget): string => `${t.label} ${t.machine ?? ''} ${repoOf(t)} ${(t.repos ?? []).join(' ')}`.toLowerCase();
    const live = can.filter((t) => t.kind !== 'next');
    const first = live.filter((t) => words.every((w) => has(hayOf(t), w)));
    if (first.length > 0) return first;
    return live.filter((t) => words.every((w) => has(`${hayOf(t)} ${t.detail ?? ''}`.toLowerCase(), w)));
  };

  const sendNow = async (op: Args): Promise<Result<{ receipt: string; sent: SentReceipt }>> => {
    if (!surface.sendTo) return { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot send to agents.' } };
    const attach = Array.isArray(op['attach']) ? op['attach'].filter((r): r is string => typeof r === 'string') : [];
    const row = text(op['row']);
    const project = text(op['project']);
    const note = text(op['note']);
    const out = await surface.sendTo({ target: text(op['target']), ...(note === '' ? {} : { note }), attach, may_change: false, ...(row === '' ? {} : { row }), ...(project === '' ? {} : { project }) }, ctx);
    if (!out.ok) return out as Result<never>;
    const value = out.value;
    const id = isObject(value) ? text(value['id']) : '';
    if (id === '') return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'It did not go through. Try again.' } };
    const to = isObject(value) && isObject(value['routed_to']) ? text(value['routed_to']['label']) : text(op['label']);
    const run = text(op['run']);
    return {
      ok: true,
      value: {
        receipt: `Sent to ${text(op['label']) || to}.`,
        sent: { id, to: text(op['label']) || to, ...(note === '' ? {} : { said: note }), ...(run === '' ? {} : { run }) },
      },
    };
  };

  const opFor = (t: AgentTarget, note: string, attach: readonly string[], extra: Args = {}): Args => ({ do: 'tell', target: t.id, label: t.label, note, attach: [...attach], ...(t.run ? { run: t.run } : {}), ...extra });

  const attachOf = (w: DirectWith): string[] => {
    const named = (w.mentions ?? []).map((m) => m.ref).filter((r) => REF_ROW.test(r));
    return [...new Set(named)];
  };

  /**
   * A message, from a person's words or the model's. `from` says which: only the person's own sentence, read by rules with
   * no model in it, or a model's send on a turn that asked for one and read no agent's words, lands with no yes. A machine
   * always waits: it starts a job there.
   */
  const sendFrom = async (to: string, message: string, run: AgentRun | null, w: DirectWith = {}): Promise<AgentRan> => {
    const step = 'Finding who to tell';
    const note = message.trim();
    if (note === '') return { text: 'tell needs a message: what to say, in their words.', step };
    /* THE MODEL NAMES WHO, or it is asked to: an empty name would offer the message to everyone running. */
    if (run !== null && to.trim() === '') return { text: 'tell needs to: a project, a computer, an agent or a run (S12). Ask them who they mean.', step };
    const roll = await roster();
    /* WHO MAY NOT EVEN SEE THE RUNS IS TOLD THAT, and not that they can see them. */
    if (typeof roll === 'string') return { text: roll, step };
    const targets = await targetsNow();
    if (typeof targets === 'string') return { text: targets, step };
    const roster_ = roll;
    const attach = attachOf(w);
    /* A RUN THEY MENTIONED WITH @ IS THAT RUN, whatever else the words say. */
    const mentioned = (w.mentions ?? []).map((m) => /^run:(S[1-9][0-9]*)$/u.exec(m.ref)?.[1]).find((x) => x !== undefined);
    const named = whoNamed(mentioned ?? to, targets, roster_);
    if (named.length === 0) return nobody(mentioned ?? to, note, targets, attach, step, roster_);
    if (named.length > 1) {
      const group = `who-${note.length}-${to.length}`;
      /* AND WHERE IT CAME FROM, WHEN IT WAS NOT THEIR OWN SENTENCE: the model chose these words after reading an agent's. */
      const read = run !== null && run.askOnly ? `This turn read ${run.outside ?? 'what an agent wrote'}, so check these words are yours. ` : '';
      const actions = named.slice(0, CARDS_MOST).map((t) => {
        const card = cardFor(t, note, attach, group, roster_);
        return read === '' ? card : { ...card, detail: `${read}${card.detail ?? ''}`.trim() };
      });
      return {
        text: `${named.length === 2 ? 'Two' : named.length === 3 ? 'Three' : 'Several'} could match. Which one should get it? Nothing has gone yet.`,
        actions,
        step,
      };
    }
    const t = named[0]!;
    const fromModel = run !== null;
    const held =
      t.kind === 'mac'
        ? `It starts Claude on that machine, so it waits for your yes.`
        : fromModel && run.askOnly
          ? `This turn read ${run.outside ?? 'what an agent wrote'}, so it waits for your yes.`
          : fromModel && !asksToSend(run.said)
            ? 'You asked a question rather than for this, so it waits for your yes.'
            : null;
    if (held !== null) {
      const title = `Send to ${t.label}: “${clip(note, 120)}”`;
      return { text: `Held for their yes: ${title}. ${held} Tell them it waits for them.`, action: { kind: 'ask', title, detail: held, op: opFor(t, note, attach), ...(t.run ? { href: `/r/session/${t.run.slice(1)}` } : {}) }, step };
    }
    const out = await sendNow(opFor(t, note, attach));
    if (!out.ok) return { text: `That did not go: ${fixOf(out) || 'it was refused'}`, step };
    const known = roster_.find((l) => l.run === t.run);
    const warn = known?.word === 'quiet' ? ` It was last heard ${agoSaid(known.heardMs)}, so it may not see this soon.` : '';
    /* THE CARD SAYS IT WENT AND FOLLOWS IT, so for the person's own sentence there is nothing to add (`quiet` is its warning). */
    return {
      text: run === null ? warn.trim() : `${out.value.receipt}${warn}`,
      action: { kind: 'done', title: out.value.receipt.replace(/\.$/u, ''), sent: out.value.sent },
      step,
    };
  };

  const cardFor = (t: AgentTarget, note: string, attach: readonly string[], group: string, roll: readonly Live[]): AgentAction => {
    const known = roll.find((l) => l.run === t.run);
    const doing = (t.detail ?? '').replace(/[.]$/u, '');
    const detail = [doing === '' ? '' : `${doing}.`, known === undefined ? '' : known.word === 'working' ? `Heard ${agoSaid(known.heardMs)}.` : `Last heard ${agoSaid(known.heardMs)}.`].filter((s) => s !== '').join(' ');
    /* WHAT WOULD GO STANDS ON THE CARD, the same as who: a press never sends words the person has not been shown. */
    return { kind: 'ask', title: `Send to ${t.label}: “${clip(note, 120)}”`, ...(detail === '' ? {} : { detail: clip(detail, 180) }), op: { ...opFor(t, note, attach), group }, group, ...(t.run ? { href: `/r/session/${t.run.slice(1)}` } : {}) };
  };

  /** Nobody fits: say so, say who was last there, and offer to leave it for whoever starts next, which is a real door. */
  const nobody = async (said: string, note: string, targets: readonly AgentTarget[], attach: readonly string[], step: string, roll: readonly Live[]): Promise<AgentRan> => {
    const byRun = /\bS([1-9][0-9]*)\b/u.exec(said);
    const rows = await runsNow();
    if (byRun && typeof rows !== 'string') {
      const r = rows.find((x) => spokenOf(x) === `S${byRun[1]}`);
      const project = r === undefined ? '' : text(r.fields['project']);
      const left = r === undefined ? `I can't find S${byRun[1]}.` : `S${byRun[1]} can't hear this: it ${stateSaid(r) === 'gone' ? 'has gone' : stateSaid(r) === 'finished' ? 'finished' : 'stopped'}, last heard ${agoSaid(now() - lastHeard(r))}.`;
      const next = project === '' ? null : await nextOn(project, note, attach);
      return { text: `${left}${next === null ? '' : ' You can leave it for whoever starts next.'}`, ...(next === null ? {} : { action: next }), step };
    }
    const words = said.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w !== '' && !NO_NAME.has(w)).join(' ');
    const project = words === '' ? null : await projectNamed(words);
    const running = roll.filter((l) => l.word !== 'gone').length;
    const lead = project !== null ? `Nothing is running on ${project.title} right now.` : running === 0 ? 'Nothing is running right now.' : `Nothing running matches “${clip(said, 40)}”.`;
    if (project === null) {
      const nextT = targets.find((t) => t.kind === 'next');
      return { text: `${lead} Nothing has gone.${nextT === undefined ? '' : ' You can leave it for whoever starts next.'}`, ...(nextT === undefined ? {} : { action: { kind: 'ask' as const, title: `Leave for ${nextT.label}: “${clip(note, 120)}”`, op: opFor(nextT, note, attach) } }), step };
    }
    const next = await nextOn(project.ref, note, attach);
    const last = await lastEnded(project.ref);
    return { text: `${lead}${last === null ? '' : ` The last was ${last}.`} Nothing has gone.${next === null ? '' : ' You can leave it for whoever starts next there.'}`, ...(next === null ? {} : { action: next }), step };
  };

  const nextOn = async (project: string, note: string, attach: readonly string[]): Promise<AgentAction | null> => {
    const targets = await targetsNow({ project });
    if (typeof targets === 'string') return null;
    const t = targets.find((x) => x.kind === 'next');
    return t === undefined ? null : { kind: 'ask', title: `Leave for ${t.label}: “${clip(note, 120)}”`, op: { ...opFor(t, note, attach), project } };
  };

  /**
   * "Pick this up", "start something on this": what it is about, then who could take it, each a card through `sendTo` with
   * the row or the run on it, which is the door the Send to sheet uses. Always a press: it starts someone working.
   */
  const handover = async (about: string, note: string, w: DirectWith): Promise<AgentRan> => {
    const step = 'Finding who can take it';
    const row = (w.mentions ?? []).map((m) => m.ref).find((r) => REF_ROW.test(r)) ?? (w.attach ?? []).find((r) => REF_ROW.test(r)) ?? (REF_ROW.test(w.page?.row ?? '') ? w.page!.row! : null);
    const mentionedRun = (w.mentions ?? []).map((m) => m.ref).find((r) => r.startsWith('run:')) ?? (w.attach ?? []).find((r) => r.startsWith('run:')) ?? null;
    const said = about.trim();
    const project = said === '' || /^(?:this|it|that)$/iu.test(said) ? null : await projectNamed(said);
    let attach: string[] = [];
    let word = note;
    let scope: { row?: string; project?: string } = {};
    if (mentionedRun !== null) {
      attach = [mentionedRun];
      word ||= `Pick up where ${mentionedRun.slice(4)} left off.`;
    } else if (project !== null) {
      scope = { project: project.ref };
      const [last] = await endedRows(project.ref);
      if (last !== undefined && typeof last.seq === 'number') {
        attach = [`run:${spokenOf(last)}`];
        const next = lines(last.fields['next']);
        word ||= `Pick up where ${spokenOf(last)} left off on ${project.title}.${next === '' ? '' : ` It left: ${clip(next, 200)}`}`;
      } else word ||= `Start on ${project.title}.`;
    } else if (row !== null) {
      attach = [row];
      scope = { row };
    } else return { text: 'Say what to pick up: mention a row or a run with @, or open it first.', step };
    const targets = await targetsNow(scope);
    if (typeof targets === 'string') return { text: targets, step };
    const roll = await roster();
    const roster_ = typeof roll === 'string' ? [] : roll;
    const can = targets.filter((t) => t.kind === 'session' || t.kind === 'mac' || t.kind === 'next');
    /* WHO IS ON IT ALREADY FIRST, THEN A MACHINE THAT CAN START, THEN WHOEVER IS NEXT. */
    const wanted = project?.ref ?? targets.find((t) => t.kind === 'next')?.project ?? null;
    const on = can.filter((t) => t.kind === 'session' && wanted !== null && t.project === wanted);
    const macs = can.filter((t) => t.kind === 'mac');
    const next = can.filter((t) => t.kind === 'next');
    const picks = [...on, ...macs, ...next].slice(0, CARDS_MOST);
    if (picks.length === 0) return { text: 'Nothing can take it right now.', step };
    const group = `hand-${attach.join('-').slice(0, 40)}`;
    return {
      text: 'Who should take it? Nothing has gone yet.',
      actions: picks.map((t) => ({ ...cardFor(t, word, attach, group, roster_), op: { ...opFor(t, word, attach), group, ...(scope.project === undefined ? {} : { project: scope.project }), ...(scope.row === undefined ? {} : { row: scope.row }) } })),
      step,
    };
  };

  /**
   * A sentence plainly about agents, answered with no model, or `null` for the model to read. `mentions` are offsets into
   * the words; a mention of a run names it. A person who may not read the runs is told so here too.
   */
  const direct = async (said: string, w: DirectWith): Promise<AgentRan | null> => {
    const s = said.trim();
    if (s === '' || s.length > 300) return null;
    const mentionsRun = (w.mentions ?? []).some((m) => m.ref.startsWith('run:'));
    const told_ = tellOf(s);
    if (told_ !== null && !MONEYISH.test(told_.to)) {
      const named = mentionsRun || MEANS_AGENT.test(told_.to);
      if (named) return sendFrom(told_.to, told_.message, null, w);
      /* NOT A WORD THAT MEANS AN AGENT: it may still be the name of what one is on ("tell Bake to stop"). A person's
         name ("ask Ada to review") goes to the model. */
      if (await projectNamed(told_.to.toLowerCase().replace(/^the\s+/u, ''))) return sendFrom(told_.to, told_.message, null, w);
      return null;
    }
    if (TOLD.test(s)) return told();
    if (PICK_UP.test(s)) {
      const about = (await aboutIn(s)) ?? /^pick\s+up\s+(.+?)[\s?.!]*$/iu.exec(s)?.[1] ?? '';
      return handover(about, '', w);
    }
    if (MONEYISH.test(s)) return null;
    if (STUCK.test(s)) return stuck();
    const on = WHO_ON.exec(s);
    if (on) {
      const about = on[1]!.trim();
      if (/^(?:it|this|that|now|right now|today)$/iu.test(about)) return agentsNow();
      const named = (await projectNamed(about)) !== null ? about : await aboutIn(`on ${about}`);
      return named === null ? null : agentsNow(named);
    }
    if (LAST_ON.test(s)) {
      const about = await aboutIn(s);
      return about === null ? null : ran(about);
    }
    if (OVERVIEW.test(s)) return agentsNow();
    return null;
  };

  /** The runs heard from since a moment, as lines: what the record's own activity folds away. */
  const ranSince = async (at: number, head = 'What agents were on since then:'): Promise<string> => {
    const rows = await runsNow();
    if (typeof rows === 'string') return '';
    const did = rows.filter((r) => text(r.fields['parent']) === '' && heardOf(r.fields) >= at && text(r.fields['doing']) !== '').slice(0, 6);
    if (did.length === 0) return '';
    return [head, ...did.map((r) => `- ${refSaid({ ref: refOf(r), run: spokenOf(r) })}, ${stateSaid(r)}: ${theirs(text(r.fields['doing']), 110)}`)].join('\n');
  };

  /** A run's ref as a link names it: its agent and computer. */
  const nameOfRun = (fields: Fields): string => runnerOf(fields);

  return { roster, agentsNow, ran, told, stuck, sendFrom, sendNow, handover, direct, nameOfRun, ranSince, targetsNow };
}
