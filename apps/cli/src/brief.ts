/**
 * The card an agent starts from: what the start hook prints, which Claude Code adds to the model's context before its
 * first turn, and what `braindog context` prints on demand.
 *
 * FIVE SLOTS IN A FIXED ORDER, each left out when it has nothing (DIRECTION 37, the agent directions' briefing):
 *
 *   BrainDog · run S731 · project BrainDog · Claude Code on MacBook
 *   Next     Cut page answers to block summaries. (S729, Claude Code, 5h ago, check before acting)
 *   Waiting  2 on Sam: Update the prism tool to match this Mac? · ...
 *   Learned  Money is minor units plus currency. Never add two currencies.
 *   More     3 dead ends · 5 learnings · 4 keys by name · call context
 *
 * Who and where; the one next step, first; what waits on a person; what was learned here; what is there on demand. At
 * most three items to a slot and 1,500 characters in all, every item cut at a word, which keeps the card whole even
 * inside the preview Claude Code shows of a hook that says too much. Keys and skills are counts, never lists: the host
 * lists its own skills, and a key is asked for by name when it is needed. Tools are not work, so they are not here.
 *
 * ONE LINE MORE, AND ONLY WHEN IT IS TRUE: another run working in this repository, followed by the sentence
 * `docs/32-PARITY.md` pins word for word. The caller's own run is never in it, and neither is a run gone quiet.
 *
 * THE RECORD'S OWN CARD WINS. A host that sends `card` with its context drew this shape from what only it knows, so it
 * is printed as it came, each line scrubbed; this renderer is for a host that does not.
 *
 * NAMES, NEVER IDS. A row is its own words with its handle beside them, a run is its handle beside its agent, a
 * question is its words with a handle the context can name said by name, and a machine is what a person calls it,
 * never its network name, nor a path on it. Only string fields are read, so a key's sealed-state projection cannot
 * reach the model.
 */

import type { Attached, Brief, Context } from '@braindog/client';

import { clip, oneLine } from './clip.ts';

/** The whole card, in characters. Claude Code previews the first 2,000 of a hook's output that runs past its cap. */
export const MAX_CHARS = 1_500;

/** The most items one slot names. */
export const PER_SLOT = 3;

/** Learnings are the newest two: the card is for what a session would otherwise get wrong, not for all of them. */
const LEARNED = 2;

/** Said word for word whenever another run is working in the same repository (`docs/32-PARITY.md:142`). */
export const TWO_SESSIONS = 'Two sessions in one working tree overwrite each other. Coordinate or stop.';

/**
 * Who and where, for the first line. `device` is the machine as a person names it ("MacBook Pro"), and `agent` the app
 * the session runs in when it is known. `host` is the machine's network name, carried because a position has one, and
 * never printed.
 */
export type Where = { repo: string | null; host: string; device?: string | undefined; agent?: string | null | undefined };

/** Commits HEAD moved since the handoff; `null` when it moved and git cannot count it; `undefined` when it did not. */
export type Moved = number | null | undefined;

const DAY_S = 86_400;

/** How long ago, in words, as `braindog session show` says it. */
export function ago(seconds: number): string {
  if (seconds < 60) return 'just now';
  const [n, unit] = seconds < 3_600 ? [Math.floor(seconds / 60), 'minute'] : seconds < 86_400 ? [Math.floor(seconds / 3_600), 'hour'] : [Math.floor(seconds / 86_400), 'day'];
  return `${String(n)} ${unit}${n === 1 ? '' : 's'} ago`;
}

/** How long ago, as the card says it: "just now", "12m ago", "5h ago", "3d ago". */
export function since(seconds: number): string {
  if (!(seconds >= 60)) return 'just now';
  if (seconds < 3_600) return `${String(Math.floor(seconds / 60))}m ago`;
  if (seconds < DAY_S) return `${String(Math.floor(seconds / 3_600))}h ago`;
  return `${String(Math.floor(seconds / DAY_S))}d ago`;
}

/* An em dash, or an en dash with a space on each side, standing in for a comma. An en dash in a range is left. */
const DASH = /\s*\u2014\s*|\s+\u2013\s+/gu;

/**
 * Somebody else's words on one line, cut at a word once they pass `max` characters.
 *
 * AT A WORD, NEVER INSIDE ONE. `clip` cuts where the count runs out, and the old briefing printed one question twice as
 * "fix the ..." and "fix th...". A dash between two clauses becomes a comma, the house rule for what a person reads.
 */
export function words(said: string, max: number): string {
  const flat = [...oneLine(said).replace(DASH, ', ').replace(/^,\s*/u, '')];
  if (flat.length <= max) return flat.join('');
  const cut = flat.slice(0, Math.max(1, max - 1)).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/u, '')}…`;
}

/** A line of the card cut at a word, its own spacing kept, for the one case where whole lines are still too long. */
function cutLine(line: string, max: number): string {
  const points = [...line];
  if (points.length <= max) return line;
  const cut = points.slice(0, Math.max(1, max - 1)).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A sentence a person reads ends in a stop, whoever wrote the words inside it. */
const stopped = (text: string): string => (/[.!?…]$/u.test(text) ? text : `${text}.`);

const size = (text: string): number => [...text].length;

/** The apps a run's `agent` names, as a person says them. `other` is nobody in particular, so it is no name at all. */
const APPS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor' };

/** An agent as the card names it: `claude` is Claude Code; a name the record already wrote out is kept. */
export function agentName(agent: unknown): string | null {
  if (typeof agent !== 'string' || !agent.trim() || agent === 'other') return null;
  return Object.hasOwn(APPS, agent) ? APPS[agent]! : words(agent, 24);
}

/** A field the record may send and the client does not type yet, read only when it is a line of text. */
const lineOf = (from: unknown, key: string): string | null => {
  const value = typeof from === 'object' && from !== null ? (from as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' && value.trim() ? value : null;
};

const NOT_WORDS = new Set(['spoken', 'scope', 'state', 'version']);

/* A row's words: the named field when there is one, else its first string field. A value that is not a string is never read. */
const wordsOf = (row: Brief, field?: string): string => {
  const named = field === undefined ? undefined : row[field];
  if (typeof named === 'string' && named.trim()) return named;
  for (const [key, value] of Object.entries(row)) if (!NOT_WORDS.has(key) && typeof value === 'string' && value.trim()) return value;
  return '';
};

/* The three registers the agents pack declares, and what the card says of each. */
const OWN = new Set(['learnings', 'credentials', 'skills']);

const register = (c: Context, id: string) => c.registers.find((r) => r.id === id);
const rowsOf = (c: Context, id: string): Brief[] => {
  const r = register(c, id);
  return r ? [...r.rows, ...r.inherited] : [];
};

/** A run's state that is working or able to: anything else has ended, and is not where a session starts. */
export const live = (state: string | null): boolean => state === null || state === 'active' || state === 'idle';

/**
 * Whether another run is working now: active, and not gone quiet. The record works `quiet` out at fifteen minutes of
 * silence (`WORKING_MS` in `packages/kernel/src/presence.ts`), and `stale` at forty-five, which is all a host older than
 * `quiet` says.
 */
export const working = (r: Context['live']['same_repo'][number]): boolean => r.state === 'active' && r.quiet !== true && !r.stale;

/* ── words a person reads ──────────────────────────────────────────────── */

/* A machine's network name: the `.local` one a Mac answers to, or the `DESKTOP-` or `LAPTOP-` one Windows makes up. A
   `.local` inside a longer name or a path is a file's, `.env.local` or `~/.claude/settings.local.json`, and stays. */
const NETWORK = /(?<![\w./\\-])[A-Za-z0-9][A-Za-z0-9-]*\.local(?![\w-]|\.\w)|\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{4,}\b/gu;
/* A path on somebody's machine, from its home folder, its root, a drive, or here, with either kind of slash. */
const PATH = /(?<=^|[\s("'])(?:(?:~|\.{1,2}|[A-Za-z]:)?\/|(?:[A-Za-z]:|\.{1,2}|\\)\\)[^\s,;)"']+/gu;
/* A row's handle, `tools#8`. */
const HANDLE = /\b[a-z][a-z0-9_]*#[1-9][0-9]*\b/gu;

/** A machine by the kind it is, read off its network name: "MacBook" for `Maras-MacBook-Pro.local`. */
export function machineOf(network: string): string {
  const n = network.toLowerCase();
  if (n.includes('macbook')) return 'MacBook';
  if (n.includes('imac')) return 'iMac';
  if (/mac-?mini/u.test(n)) return 'Mac mini';
  if (/mac-?studio/u.test(n)) return 'Mac Studio';
  if (/^laptop-/u.test(n)) return 'Windows laptop';
  if (/^desktop-/u.test(n)) return 'Windows PC';
  return 'this machine';
}

/**
 * Somebody's sentence without what a person never reads: a network name becomes the kind of machine it is, and with
 * `all`, a path becomes its file's name and a handle the context can name becomes the row's words.
 *
 * THE QUESTIONS ARE WRITTEN BY OTHER RUNS AND BY THE RECORD'S OWN SCANS, and one on the owner's record read "Change
 * tools#8 to how fly-prism is set up in ~/.claude.json on Maras-MacBook-Pro.local?". A handoff's step keeps its
 * paths and handles, which the next run needs; only the machine's network name goes from it.
 */
export function plainly(said: string, c: Context, all: boolean): string {
  const out = said.replace(NETWORK, (network) => machineOf(network));
  if (!all) return out;
  return out
    .replace(PATH, (path) => path.replace(/[\\/]+$/u, '').split(/[\\/]/u).at(-1) || 'a folder')
    .replace(HANDLE, (handle) => {
      const row = c.registers.flatMap((r) => [...r.rows, ...r.inherited]).find((b) => b.spoken === handle);
      return (row && words(wordsOf(row), 40)) || handle;
    });
}

/* ── the first line ────────────────────────────────────────────────────── */

/** The folder's project, as the first line names it. */
export function placeOf(c: Context | undefined): string {
  if (c?.project) return `project ${words(c.project.name, 40)}`;
  if (c && c.ambiguous.length > 0) return `${String(c.ambiguous.length)} projects match this folder`;
  return 'no project';
}

/** The app and the machine: "Claude Code on MacBook Pro", or "on MacBook Pro" when nobody said which app. */
function whoOf(at: Where): string {
  const device = words(at.device ?? '', 40) || 'this machine';
  const agent = at.agent ? words(at.agent, 24) : '';
  return agent ? `${agent} on ${device}` : `on ${device}`;
}

/** The first line: BrainDog, the run, the project, and the app and machine it runs on, with nothing between left empty. */
export const firstLine = (run: string, place: string, at: Where): string => ['BrainDog', run, place, whoOf(at)].filter(Boolean).join(' · ');

/* ── the record's own card ─────────────────────────────────────────────── */

/**
 * The card the record drew, when its context carries one, each line scrubbed; else `null`.
 *
 * SCRUBBED AND NOT REWORDED. The record's words are printed as they came, but a terminal obeys what it is handed, so
 * every control and format character goes, as `clip` takes them out of every other line. The run of spaces after a
 * slot's label is the card's own layout, and stays.
 */
export function cardOf(c: Context | undefined): string[] | null {
  return scrubbed(c === undefined ? undefined : (c as { card?: unknown }).card);
}

/** A text the record drew, as lines with every control and format character gone and a slot's layout kept; else `null`. */
function scrubbed(text: unknown): string[] | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lines = text
    .split(/\r?\n/u)
    .map((line) => {
      const slot = /^(\S+)( {2,})(\S.*)$/u.exec(line);
      return slot ? `${oneLine(slot[1]!)}${slot[2]!}${oneLine(slot[3]!)}` : oneLine(line);
    })
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

/** Lines held to the cap: the first always, cut at a word when it alone is too long, then as many whole lines as fit. */
export function fitLines(lines: string[]): string {
  const kept: string[] = [];
  let left = MAX_CHARS;
  for (const line of lines) {
    const room = left - (kept.length > 0 ? 1 : 0);
    if (room <= 1) break;
    const shown = kept.length === 0 || size(line) <= room ? cutLine(line, room) : null;
    if (shown === null) break;
    kept.push(shown);
    left = room - size(shown);
  }
  return kept.join('\n');
}

/* ── the slots ─────────────────────────────────────────────────────────── */

/**
 * One slot: its label, the words before its items, the items, and what follows them, worked out from what is left
 * after the cap took its share. `least` is how many items it keeps when the card runs long, and `lastStays` says its
 * last item is the one that matters most, as the handoff is in Next.
 */
type Slot = { label: string; lead: string; items: string[]; tail: (shown: number) => string; least: number; lastStays?: boolean };

const LABEL = 9;
const lineOfSlot = (s: Slot): string => `${s.label.padEnd(LABEL - 1)} ${s.lead}${s.items.join(' · ')}${s.tail(s.items.length)}`;
const none = (): string => '';

/** What the card is drawn for, beyond the context. */
export type CardFor = {
  /** The caller's own run, which is never told about itself. The context's own session when this is left out. */
  own?: string | null | undefined;
  /** The agent the run signs as (`claude`), so the rows a person handed to it lead. */
  agent?: string | null | undefined;
  /** Items the caller adds to More, such as what the start hook's skills sync did. */
  more?: string[] | undefined;
  /** Whom the questions wait on, by name ("Sam"), when the record said; "the owner" otherwise. */
  decider?: string | null | undefined;
  /** How many questions wait in all, when the record counted them: `context` sends only the newest. */
  waiting?: number | null | undefined;
};

/**
 * The open rows somebody handed to this agent, by the name it signs with: the rows whose `agent` field holds it.
 *
 * THE FIELD'S OWN NAME, because Work's `hand:` names `agent` and `context` sends a row's string fields and not its
 * list's declaration. The kernel's own run register is left out, since every run there carries the agent that ran it.
 */
export function handedTo(c: Context, agent: string | null): Brief[] {
  const me = agent?.trim().toLowerCase().replace(/^agent:/u, '') ?? '';
  if (!me) return [];
  return c.registers
    .filter((r) => r.id !== 'session' && !OWN.has(r.id))
    .flatMap((r) => [...r.rows, ...r.inherited])
    .filter((row) => typeof row.agent === 'string' && row.agent.trim().toLowerCase() === me);
}

/**
 * The handoff as the Next slot says it: the step, then who left it, when, and whether to check it first.
 *
 * CHECK BEFORE ACTING when the step is more than a day old or another run left it: either way it may already be done,
 * or no longer true. How far HEAD moved under it is said beside, when git can tell. The author is the run's handle
 * beside the app it ran in, when the record says which or the run is still live.
 */
function handoffItem(c: Context, moved: Moved, own: string | null): string | null {
  const h = c.handoff;
  if (!h || !h.next.trim()) return null;
  const by = agentName(lineOf(h, 'agent') ?? [...c.live.same_repo, ...c.live.elsewhere].find((r) => r.spoken === h.from)?.agent ?? null);
  const shifted = moved === undefined ? [] : [moved === null ? 'HEAD moved' : `${String(moved)} commit${moved === 1 ? '' : 's'} since`];
  const check = !(h.age_s <= DAY_S) || own === null || h.from !== own;
  const notes = [clip(h.from, 16), ...(by === null ? [] : [by]), since(h.age_s), ...shifted, ...(check ? ['check before acting'] : [])];
  return `${stopped(words(plainly(h.next, c, false), 160))} (${notes.join(', ')})`;
}

/** The Next slot: what a person handed to this agent, then the step the last run left. */
function nextSlot(c: Context, moved: Moved, own: string | null, agent: string | null): { slot: Slot | null; handedLeft: number } {
  const handed = handedTo(c, agent);
  const step = handoffItem(c, moved, own);
  /* A PERSON'S "HAND TO" LEADS, because the row says it waits for this session; the handoff keeps a place beside it. */
  const shown = handed.slice(0, step === null ? PER_SLOT : PER_SLOT - 1);
  const items = [...shown.map((row) => `${words(wordsOf(row), 60)} (${clip(row.spoken, 24)}, handed to you)`), ...(step === null ? [] : [step])];
  return { slot: items.length > 0 ? { label: 'Next', lead: '', items, tail: none, least: 1, lastStays: step !== null } : null, handedLeft: handed.length - shown.length };
}

/**
 * The questions waiting, the ones that read the same once their ids and case are set aside folded into one, newest first.
 *
 * TWO QUESTIONS THAT READ THE SAME ARE ONE THING TO KNOW. A bank pattern asked "could not read account out of this one"
 * once per text, and the briefing printed the same words twice. The first of them is kept, with how many there are. A
 * question that is nothing but ids is compared by its own id, so it is still one thing waiting.
 */
export function asked(waiting: Context['waiting']): { question: string; count: number }[] {
  const out = new Map<string, { question: string; count: number }>();
  for (const w of waiting) {
    const key = sameWords(w.question) || `#${w.id}`;
    const had = out.get(key);
    if (had) had.count++;
    else out.set(key, { question: w.question, count: 1 });
  }
  return [...out.values()];
}

/** The most a question says on the card, the record's own card's measure. */
const ASKED = 90;

/**
 * A question's first sentence, which is the question: what follows it is how to answer it ("Accept it into
 * transactions, or fix the pattern."), and Decide shows that. A stop that comes too early to end a question, as in
 * "Dr." or "e.g.", is not taken for the end of one.
 */
export function questionOf(said: string): string {
  const line = oneLine(said);
  for (const end of line.matchAll(/[.?!](?=\s)/gu)) if (end.index >= 16) return line.slice(0, end.index + 1);
  return line;
}

/**
 * A question as the Waiting slot says it: whole when it fits, and its first sentence when it does not.
 *
 * WHOLE FIRST, because the record's own questions say the fact and then ask: "Ledger Post, sending plan was due 4 days
 * ago, GBP 39.00. Did it go through?" cut to its first sentence was a fact with no question in it.
 */
export function askedAs(said: string): string {
  const whole = words(said, Number.POSITIVE_INFINITY);
  return size(whole) <= ASKED ? whole : words(questionOf(said), ASKED);
}

/** A question with its ids, handles and case set aside, which is how two of them are compared. */
const sameWords = (question: string): string =>
  oneLine(question)
    .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/gu, ' ')
    .replace(/\b[a-z][a-z0-9_]*#[0-9]+\b/giu, ' ')
    /* A person's or a token's id, `p_` and a ULID: long enough that `bank_statements` is still words. */
    .replace(/\b[a-z]{1,4}_[0-9a-z]{20,}\b/giu, ' ')
    .replace(/\b[A-Z]{1,3}[0-9]+\b/gu, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const count = (n: number, one: string, many = `${one}s`): string => `${String(n)} ${n === 1 ? one : many}`;

/** Every slot but the first line, in the card's order, and the one line about another run working here. */
function slotsOf(c: Context, moved: Moved, o: CardFor): Slot[] {
  const own = o.own === undefined ? (c.session?.spoken ?? null) : o.own;
  const slots: Slot[] = [];

  /* ONLY A RUN STILL WORKING IS A COLLISION. The end hook leaves a run idle, a handoff waits for a pickup, and a run gone
     quiet is a crash nobody reported or a window left open, so none of those is working. THE CALLER'S OWN RUN IS NEVER
     ONE: the research found a session warned to coordinate with itself. */
  const others = c.live.same_repo.filter((r) => working(r) && r.spoken !== own);
  if (others.length > 0) {
    const runs = others.slice(0, PER_SLOT).map((r) => {
      const handle = clip(r.spoken, 16);
      const by = agentName(r.agent);
      const notes = [...(by === null ? [] : [by]), since(r.age_s)].join(', ');
      return r.doing ? `${words(r.doing, 40)} (${handle}, ${notes})` : `${handle} (${notes})`;
    });
    slots.push({
      label: 'Also',
      lead: '',
      items: runs,
      /* "AND 2 MORE" IS COUNTED FROM WHAT THE CAP LEFT, so a run it took off the line is still said to be there. */
      tail: (shown) => `${others.length > shown ? ` and ${String(others.length - shown)} more` : ''} ${others.length === 1 ? 'is' : 'are'} working in this repository too. ${TWO_SESSIONS}`,
      least: 1,
    });
  }

  const next = nextSlot(c, moved, own, o.agent ?? null);
  if (next.slot) slots.push(next.slot);

  const asks = asked(c.waiting);
  /* HOW MANY WAIT IS THE RECORD'S COUNT WHEN IT GAVE ONE. `context` sends the newest eight, so past them each question is
     one more thing to know, as none of them could be compared. */
  const waiting = asks.length + Math.max(0, (o.waiting ?? 0) - c.waiting.length);
  if (asks.length > 0)
    slots.push({
      label: 'Waiting',
      lead: `${String(waiting)} on ${o.decider ? words(o.decider, 40) : 'the owner'}: `,
      items: asks.slice(0, PER_SLOT).map((a) => `${askedAs(plainly(a.question, c, true))}${a.count > 1 ? ` (${String(a.count)} like this)` : ''}`),
      tail: none,
      least: 1,
    });

  /* THE PROJECT'S OWN FIRST, then those that apply everywhere, each list newest first. Only a lesson still standing. */
  const lessons = rowsOf(c, 'learnings').filter((row) => row.state === null || row.state === 'active');
  const learned = lessons.map((row) => words(wordsOf(row, 'lesson'), 120)).filter(Boolean).slice(0, LEARNED);
  if (learned.length > 0) slots.push({ label: 'Learned', lead: '', items: learned, tail: none, least: 0 });

  /* WHAT IS THERE ON DEMAND, the most useful first and three at most, then the call that has all of it. */
  const more: string[] = [];
  const tried = c.handoff?.tried.length ?? 0;
  if (tried > 0) more.push(count(tried, 'dead end'));
  if (next.handedLeft > 0) more.push(`${String(next.handedLeft)} more handed to you`);
  const grow = bearing(c)[0];
  if (grow) more.push(`${count(grow.learnings.length, 'learning')} for skill ${grow.skill}`);
  const plus = (id: string) => (register(c, id)?.truncated ? '+' : '');
  if (lessons.length > learned.length) more.push(`${String(lessons.length)}${plus('learnings')} learnings`);
  const keys = rowsOf(c, 'credentials').length;
  if (keys > 0) more.push(`${String(keys)}${plus('credentials')} ${keys === 1 && !plus('credentials') ? 'key' : 'keys'} by name`);
  const skills = rowsOf(c, 'skills').length;
  if (skills > 0) more.push(`${String(skills)}${plus('skills')} ${skills === 1 && !plus('skills') ? 'skill' : 'skills'}`);
  more.push(...(o.more ?? []));
  slots.push({ label: 'More', lead: '', items: more.slice(0, PER_SLOT), tail: (shown) => `${shown > 0 ? ' · ' : ''}call context`, least: 0 });
  return slots;
}

/* ── the card ──────────────────────────────────────────────────────────── */

/**
 * The card under a first line the caller writes.
 *
 * THE FIRST LINE IS PART OF IT, so the cap counts it, and a caller that has not attached can say what `attach` cannot
 * say for it. `braindog context` starts nothing and resumes nothing, so it writes its own.
 */
export function briefingOf(head: string, c: Context, moved: Moved, o: CardFor = {}): string {
  return fit(cutLine(oneLine(head), 200), slotsOf(c, moved, o));
}

/**
 * At most 1,500 characters. WHAT GOES FIRST IS WHAT MATTERS LEAST: a learning, then what is on demand, then the
 * questions past the first, the rows handed over (never the handoff), and the other runs past the first. A slot keeps
 * its count and one item to the end. Only when that is still too long is each line cut at a word.
 */
function fit(head: string, slots: Slot[]): string {
  const render = () => [head, ...slots.filter((s) => s.items.length > 0 || s.label === 'More').map(lineOfSlot)];
  const order = ['Learned', 'More', 'Waiting', 'Next', 'Also'];
  let lines = render();
  while (size(lines.join('\n')) > MAX_CHARS) {
    const slot = order.map((label) => slots.find((s) => s.label === label)).find((s) => s !== undefined && s.items.length > s.least);
    if (!slot) break;
    /* The handoff is Next's last item and its reason for being, so a row handed over goes before it does. */
    slot.items.splice(slot.lastStays === true ? slot.items.length - 2 : slot.items.length - 1, 1);
    lines = render();
  }
  if (size(lines.join('\n')) <= MAX_CHARS) return lines.join('\n');
  const share = Math.floor((MAX_CHARS - (lines.length - 1)) / lines.length);
  return fitLines(lines.map((line) => cutLine(line, share)));
}

/** The agent a run signs as, from its own row. */
const signsAs = (attached: Attached): string | null => (typeof attached.session.fields.agent === 'string' ? attached.session.fields.agent : null);

/**
 * The start hook's card: the record's own when it drew one, else this renderer's under the run the hook attached.
 *
 * A HOST OLDER THAN `context` SENDS NO BRIEFING, and is the first line and the call that has it.
 */
export function briefing(attached: Attached, at: Where, moved: Moved, o: Pick<CardFor, 'more' | 'decider' | 'waiting'> = {}): string {
  const c: Context | undefined = attached.context;
  const card = cardOf(c);
  if (card) return fitLines(card);
  const head = firstLine(`run ${clip(attached.spoken, 16)}`, placeOf(c), at);
  if (!c) return fitLines([head, lineOfSlot({ label: 'More', lead: '', items: [], tail: () => 'call context', least: 0 })]);
  return briefingOf(head, c, moved, { ...o, own: attached.spoken, agent: signsAs(attached) });
}

/**
 * The Next line alone, for a session that just compacted: the step it is on, without what it already read. `null` when
 * there is no step, and then the hook prints nothing.
 *
 * THE RECORD'S `card_next` WHEN IT DREW A CARD (AGT-B07): its Next line alone, scrubbed as the card is, and `null` from
 * it means there is no step. Only a record that drew a card without one has its card's Next line looked for.
 */
export function nextLine(attached: Attached, moved: Moved): string | null {
  const c = attached.context;
  const card = cardOf(c);
  if (card) {
    const said = (c as { card_next?: unknown }).card_next;
    if (said === null) return null;
    const next = scrubbed(said);
    if (next) return fitLines(next);
    const line = card.find((l) => /^Next\s/u.test(l));
    return line === undefined ? null : cutLine(line, MAX_CHARS);
  }
  if (!c) return null;
  const { slot } = nextSlot(c, moved, attached.spoken, signsAs(attached));
  return slot === null ? null : cutLine(lineOfSlot(slot), MAX_CHARS);
}

/* ── the skills that can grow ──────────────────────────────────────────── */

/** A skill with active learnings bearing on it that its `because` does not carry yet. */
export type Bearing = { skill: string; rev: number | null; learnings: string[] };

const MAX_BEARING = 3;
const PER_BEARING = 5;

/**
 * The skills whose next version is waiting to be written, nearest first, three at most. The card names the first in
 * More, which is how a lesson a run learned the hard way reaches the skill it bears on.
 *
 * A LEARNING BEARS ON A SKILL WHEN ITS `topic` IS THE SKILL'S NAME, the rule the learnings' `topic` field states
 * (`packages/seed/src/packs/agents.ts`); case and surrounding space are not a different skill. A learning the skill's
 * `because` already names is in the skill, so it is no reason for another version.
 *
 * A PROJECT'S SKILL COMES BEFORE THE GLOBAL ONE OF THE SAME NAME, and only the first is weighed, because the skills
 * sync writes the project's over the global one (`apps/cli/src/skills.ts`), so the global one is not what runs here.
 */
export function bearing(c: Context): Bearing[] {
  const learnings = register(c, 'learnings');
  const skills = register(c, 'skills');
  if (!learnings || !skills) return [];

  /* Only a lesson still standing bears on anything; a superseded or reverted one was taken back. */
  const byTopic = new Map<string, string[]>();
  for (const row of [...learnings.rows, ...learnings.inherited]) {
    if (row.state !== null && row.state !== 'active') continue;
    const topic = typeof row.topic === 'string' ? row.topic.trim().toLowerCase() : '';
    if (!topic) continue;
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), row.spoken]);
  }
  if (byTopic.size === 0) return [];

  const out: Bearing[] = [];
  const seen = new Set<string>();
  for (const row of [...skills.rows, ...skills.inherited]) {
    if (out.length >= MAX_BEARING) break;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    if (row.state !== null && row.state !== 'active') continue;
    const carried = new Set(Array.isArray(row.because) ? row.because.filter((id): id is string => typeof id === 'string') : []);
    const fresh = (byTopic.get(name.toLowerCase()) ?? []).filter((id) => !carried.has(id));
    if (fresh.length === 0) continue;
    out.push({ skill: clip(name, 60), rev: typeof row.rev === 'number' ? row.rev : null, learnings: fresh.slice(0, PER_BEARING) });
  }
  return out;
}
