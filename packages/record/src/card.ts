/**
 * THE CARD AN AGENT STARTS FROM, composed in the record (AGT-B07), so the start hook, `context` and `braindog context`
 * print one text made by one set of rules, whatever build of the command sits on the machine.
 *
 *   BrainDog · run S731 · Claude Code on MacBook · project BrainDog · branch main
 *   Next     Cut page answers to block summaries. (S729, Claude Code, 5h ago, check before acting)
 *   Waiting  2 on Mara: Update the prism tool to match this Mac? · ...
 *   Learned  Money is minor units plus currency. Never add two currencies.
 *   More     3 dead ends · 5 learnings · 4 keys by name · call context
 *
 * LINE ONE SAYS WHO AND WHERE: the run, the app on the machine as a person names it, the project, the branch. Then the
 * line about another run working in the same tree, only when it is true. Then the slots in this order, each left out
 * when it has nothing true to say: `Next`, `Signs`, `Waiting`, `Learned`, `More`. At most three things a slot. No Who
 * slot: the people of a project are a call away, and the card is for what a session would otherwise get wrong.
 *
 * ABOUT 120 WORDS, NEVER MORE THAN 150. Past 120 it cuts what `More` names, then the second learning, then the third
 * question, then the runs named after the first on the same-tree line. Past 150 it keeps cutting, in the order of what
 * matters least, and never cuts line one, the same-tree warning, the handoff in `Next` or the line saying the command is
 * older than the record. A word count, not characters, because the card is read and a name in Arabic letters is no
 * longer to read than one in Latin ones.
 *
 * NAMES PRINT AS WRITTEN, accents and other scripts kept. Every control and format character is removed (`oneLine`, the
 * command's own scrub copied here), since a terminal obeys what it is handed. A machine's network name, a path and a
 * row's handle are never printed: a person reads the kind of machine, the file's name and the row's own words.
 *
 * Typed on `Context` alone, by a type-only import, so the record's `briefing()` can call it without a cycle.
 */

import type { Brief, Context } from './index.ts';

/** About this many words. Past it, the first cuts are made. */
export const CARD_AIM = 120;

/** Never more words than this. */
export const CARD_MOST = 150;

/** The most things one slot names. */
const PER_SLOT = 3;

/** Learnings are the newest two: the card is for what a session would otherwise get wrong, not for all of them. */
const LEARNED = 2;

/** Said word for word whenever another run is working in the same repository (`docs/32-PARITY.md:142`). */
export const TWO_SESSIONS = 'Two sessions in one working tree overwrite each other. Coordinate or stop.';

/** Said when the command's build is older than the oldest the record's door still works with. */
export const OLDER = 'Run braindog update and restart this session.';

const DAY_S = 86_400;
const DAY_MS = DAY_S * 1_000;

/**
 * Who and where the card is drawn for, beyond the context: what the session's headers and its run's row say.
 *
 * `host` is the machine's network name, read only for the kind of machine it is and never printed. `build` is the build
 * of the command that called (`last_build` on its key), and `min_cli` the oldest the door still works with, which the
 * host hands in because the record cannot import the door. `ahead` is how many commits HEAD moved since the handoff,
 * the `x-braindog-ahead` header, a whole number from 0 to 9,999 and nothing else.
 */
export type CardAt = {
  /** The caller's run, which is never told about itself. The context's own session when this is left out. */
  run?: string | null | undefined;
  /** The app the run signs as (`claude`), so the rows a person handed to it lead and the first line names it. */
  agent?: string | null | undefined;
  /** The machine as a person names it ("MacBook Pro"). */
  device?: string | null | undefined;
  host?: string | null | undefined;
  branch?: string | null | undefined;
  ahead?: number | null | undefined;
  build?: string | null | undefined;
  min_cli?: string | null | undefined;
  /** Whom the questions wait on, by name, when the record said; "the owner" otherwise. */
  decider?: string | null | undefined;
  /** How many questions wait in all, when the record counted them: `context` sends only the newest. */
  waiting?: number | null | undefined;
  /** Things the caller adds to More, such as what the start hook's skills sync did. */
  more?: string[] | undefined;
  /**
   * A row by its handle or its id, as its name, when the caller may read it; `null` otherwise. A question's words may
   * hold a bare id or a handle whose row the context did not send, and those print as the row's name, never as an id.
   */
  named?: ((handleOrId: string) => string | null) | undefined;
};

/** The card, its `Next` line alone for a session that just compacted (`null` when there is no step), and its size. */
export type Card = { card: string; next: string | null; words: number };

/* ── somebody else's words, made safe to print ─────────────────────────── */

/**
 * Bidirectional controls and invisible characters, copied from `apps/cli/src/clip.ts`: nothing a person can see, and
 * some that reorder what they can. Removed, not spaced, because each sits inside a word when it is honest. U+200D and
 * U+200C stay: a flag is drawn from one, and Persian spells words with the other.
 */
const FORMAT = /[\u00ad\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;

/** One line of somebody else's words: format characters gone, every control character and run of space one space, trimmed. */
export const oneLine = (said: string): string =>
  said
    .replace(FORMAT, '')
    .replace(/[\x00-\x1f\x7f-\x9f\s]+/g, ' ')
    .trim();

/** A handle cut to `max` code points, never inside a surrogate pair. */
const clip = (said: string, max: number): string => {
  const one = [...oneLine(said)];
  return one.length > max ? `${one.slice(0, max - 3).join('')}...` : one.join('');
};

/* An em dash, or an en dash with a space on each side, standing in for a comma. An en dash in a range is left. */
const DASH = /\s*—\s*|\s+–\s+/gu;

/** Somebody else's words on one line, cut at a word once they pass `max` characters, a dash between clauses a comma. */
export function words(said: string, max: number): string {
  const flat = [...oneLine(said).replace(DASH, ', ').replace(/^,\s*/u, '')];
  if (flat.length <= max) return flat.join('');
  const cut = flat.slice(0, Math.max(1, max - 1)).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/u, '')}…`;
}

/** A sentence a person reads ends in a stop, whoever wrote the words inside it. */
const stopped = (text: string): string => (/[.!?…]$/u.test(text) ? text : `${text}.`);

/** How many words a text holds: runs of anything but space that carry a letter or a digit, so `·` is not one. */
export const wordCount = (text: string): number => (text.match(/\S+/gu) ?? []).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** How long ago, as the card says it: "just now", "12m ago", "5h ago", "3d ago". */
export function since(seconds: number): string {
  if (!(seconds >= 60)) return 'just now';
  if (seconds < 3_600) return `${String(Math.floor(seconds / 60))}m ago`;
  if (seconds < DAY_S) return `${String(Math.floor(seconds / 3_600))}h ago`;
  return `${String(Math.floor(seconds / DAY_S))}d ago`;
}

const count = (n: number, one: string, many = `${one}s`): string => `${String(n)} ${n === 1 ? one : many}`;

/* ── words a person reads ──────────────────────────────────────────────── */

/* A machine's network name: the `.local` one a Mac answers to, or the `DESKTOP-` or `LAPTOP-` one Windows makes up. A
   `.local` inside a longer name or a path is a file's, `.env.local` or `~/.claude/settings.local.json`, and stays. */
const NETWORK = /(?<![\w./\\-])[A-Za-z0-9][A-Za-z0-9-]*\.local(?![\w-]|\.\w)|\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{4,}\b/gu;
/* A path on somebody's machine, from its home folder, its root, a drive, or here, with either kind of slash. */
const PATH = /(?<=^|[\s("'])(?:(?:~|\.{1,2}|[A-Za-z]:)?\/|(?:[A-Za-z]:|\.{1,2}|\\)\\)[^\s,;)"']+/gu;
/* A row's handle, `tools#8`. */
const HANDLE = /\b([a-z][a-z0-9_]*)#[1-9][0-9]*\b/gu;
/* An address, alone or in angle brackets beside a name. */
const ADDRESS = /\s*<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?/gu;

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

/* The words a row is said by: the named field when there is one, else its first string field. */
const NOT_WORDS = new Set(['spoken', 'scope', 'state', 'version']);
const wordsOf = (row: Brief, field?: string): string => {
  const named = field === undefined ? undefined : row[field];
  if (typeof named === 'string' && named.trim()) return named;
  for (const [key, value] of Object.entries(row)) if (!NOT_WORDS.has(key) && typeof value === 'string' && value.trim()) return value;
  return '';
};

const register = (c: Context, id: string) => c.registers.find((r) => r.id === id);
const rowsOf = (c: Context, id: string): Brief[] => {
  const r = register(c, id);
  return r ? [...r.rows, ...r.inherited] : [];
};

/**
 * Somebody's sentence without what a person never reads: a network name becomes the kind of machine it is, and with
 * `all`, a path becomes its file's name and a handle becomes the row's own words, or the list it is one of.
 *
 * THE QUESTIONS ARE WRITTEN BY OTHER RUNS AND BY THE RECORD'S OWN SCANS, and one on the owner's record read "Change
 * tools#8 to how fly-prism is set up in ~/.claude.json on Maras-MacBook-Pro.local?". A handoff's step keeps its
 * paths and handles, which the next run needs; only the machine's network name goes from it.
 */
export function plainly(said: string, c: Context, all: boolean, at?: CardAt): string {
  const out = said.replace(NETWORK, (network) => machineOf(network));
  if (!all) return out;
  return out
    .replace(ROW_ID, (id) => at?.named?.(id) ?? 'an entry you cannot see')
    .replace(PATH, (path) => path.replace(/[\\/]+$/u, '').split(/[\\/]/u).at(-1) || 'a folder')
    .replace(HANDLE, (handle, list: string) => {
      const row = c.registers.flatMap((r) => [...r.rows, ...r.inherited]).find((b) => b.spoken === handle);
      const said = row ? words(wordsOf(row), 40) : '';
      return said || at?.named?.(handle) || `one of ${register(c, list)?.name ?? list.replace(/_/gu, ' ')}`;
    });
}

/** A row's id as the kernel mints it, a ULID: 26 characters of Crockford's base 32. */
const ROW_ID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/gu;

/** The apps a run's `agent` names, as a person says them. `other` is nobody in particular, so it is no name at all. */
const APPS: Record<string, string> = { claude: 'Claude Code', 'claude-code': 'Claude Code', codex: 'Codex', cursor: 'Cursor' };

/** An agent as the card names it: `claude` is Claude Code; a name the record already wrote out is kept. */
export function agentName(agent: unknown): string | null {
  if (typeof agent !== 'string' || !agent.trim() || agent === 'other') return null;
  const bare = agent.trim().replace(/^agent:/u, '');
  return Object.hasOwn(APPS, bare.toLowerCase()) ? APPS[bare.toLowerCase()]! : words(bare, 24);
}

/** A field the record may send and the type does not name, read only when it is a line of text. */
const lineOf = (from: unknown, key: string): string | null => {
  const value = typeof from === 'object' && from !== null ? (from as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' && value.trim() ? value : null;
};

/* ── the first line ────────────────────────────────────────────────────── */

/**
 * The project as a person reads its name: never its folder, an address or a machine's network name. A name that is
 * nothing but those is no name, and the line says the project has none rather than print an id.
 */
function projectOf(c: Context): string {
  if (c.project) {
    const name = words(plainly(c.project.name.replace(ADDRESS, ' '), c, true), 40);
    return name ? `project ${name}` : 'a project with no name';
  }
  if (c.ambiguous.length > 0) return `${String(c.ambiguous.length)} projects match this folder`;
  return 'no project';
}

/** The app and the machine: "Claude Code on MacBook Pro", "on MacBook", or nothing when neither is known. */
function machineLine(at: CardAt): string | null {
  const device = (at.device ? words(at.device, 40) : '') || (at.host ? machineOf(at.host) : '');
  const app = agentName(at.agent);
  if (!device) return app;
  return app ? `${app} on ${device}` : `on ${device}`;
}

/** Line one: BrainDog, the run, the app and machine, the project, the branch, with nothing between left empty. */
function firstLine(c: Context, at: CardAt, own: string | null): string {
  const run = own ? `run ${clip(own, 16)}` : 'no run yet';
  const branch = at.branch ? words(at.branch, 40) : '';
  return ['BrainDog', run, machineLine(at), projectOf(c), branch ? `branch ${branch}` : null].filter(Boolean).join(' · ');
}

/* ── the slots ─────────────────────────────────────────────────────────── */

/**
 * One line under the first: its label, the words before its things, the things, and what follows them, worked out from
 * how many are still shown. `least` is how many things it keeps when the card runs long, `lastStays` says its last
 * thing matters most, as the handoff does in Next, and `kept` that the line itself is never taken off.
 */
type Slot = { label: string; lead: string; items: string[]; tail: (shown: number) => string; least: number; lastStays?: boolean; kept?: boolean };

const LABEL = 9;
const none = (): string => '';
const lineOfSlot = (s: Slot): string => `${s.label.padEnd(LABEL - 1)} ${s.lead}${s.items.join(' · ')}${s.tail(s.items.length)}`;

/** A run's state that is working: active, and not gone quiet nor stale. */
const working = (r: Context['live']['same_repo'][number]): boolean => r.state === 'active' && r.quiet !== true && !r.stale;

/** The line about other runs working in the same tree, said only when it is true. The caller's own run is never one. */
function alsoSlot(c: Context, own: string | null): Slot | null {
  const others = c.live.same_repo.filter((r) => working(r) && r.spoken !== own);
  if (others.length === 0) return null;
  const runs = others.slice(0, PER_SLOT).map((r) => {
    const by = agentName(r.agent);
    const notes = [...(by === null ? [] : [by]), since(r.age_s)].join(', ');
    return r.doing ? `${words(plainly(r.doing, c, true), 40)} (${clip(r.spoken, 16)}, ${notes})` : `${clip(r.spoken, 16)} (${notes})`;
  });
  return {
    label: 'Also',
    lead: '',
    items: runs,
    /* "AND 2 MORE" IS COUNTED FROM WHAT THE CUT LEFT, so a run taken off the line is still said to be there. */
    tail: (shown) => `${others.length > shown ? ` and ${String(others.length - shown)} more` : ''} ${others.length === 1 ? 'is' : 'are'} working in this repository too. ${TWO_SESSIONS}`,
    least: 1,
    kept: true,
  };
}

/** The open rows somebody handed to this agent, by the name it signs with: the rows whose `agent` field holds it. */
function handedTo(c: Context, agent: string | null): Brief[] {
  const me = agent?.trim().toLowerCase().replace(/^agent:/u, '') ?? '';
  if (!me) return [];
  return c.registers
    .filter((r) => !['session', 'learnings', 'credentials', 'skills'].includes(r.id))
    .flatMap((r) => [...r.rows, ...r.inherited])
    .filter((row) => typeof row.agent === 'string' && row.agent.trim().toLowerCase().replace(/^agent:/u, '') === me);
}

/** Commits HEAD moved since the handoff, as the header carried it: a whole number from 0 to 9,999, or nothing. */
const aheadOf = (ahead: unknown): number | null => (typeof ahead === 'number' && Number.isInteger(ahead) && ahead >= 0 && ahead <= 9_999 ? ahead : null);

/**
 * The handoff as Next says it: the step, then who left it, when, how far HEAD moved since, and whether to check first.
 *
 * CHECK BEFORE ACTING when the step is more than a day old or another run left it: either way it may already be done,
 * or no longer true.
 */
function handoffItem(c: Context, at: CardAt, own: string | null): string | null {
  const h = c.handoff;
  if (!h || !h.next.trim()) return null;
  const by = agentName(lineOf(h, 'agent') ?? [...c.live.same_repo, ...c.live.elsewhere].find((r) => r.spoken === h.from)?.agent ?? null);
  const ahead = aheadOf(at.ahead);
  const moved = ahead === null || ahead === 0 ? [] : [`${count(ahead, 'commit')} since`];
  const check = !(h.age_s <= DAY_S) || own === null || h.from !== own;
  const notes = [clip(h.from, 16), ...(by === null ? [] : [by]), since(h.age_s), ...moved, ...(check ? ['check before acting'] : [])];
  return `${stopped(words(plainly(h.next, c, false), 160))} (${notes.join(', ')})`;
}

/** Next: what a person handed to this agent, then the step the last run left, which is the one thing never cut. */
function nextSlot(c: Context, at: CardAt, own: string | null): { slot: Slot | null; handedLeft: number } {
  const handed = handedTo(c, at.agent ?? null);
  const step = handoffItem(c, at, own);
  const shown = handed.slice(0, step === null ? PER_SLOT : PER_SLOT - 1);
  const items = [...shown.map((row) => `${words(plainly(wordsOf(row), c, true, at), 60)} (${clip(row.spoken, 24)}, handed to you)`), ...(step === null ? [] : [step])];
  if (items.length === 0) return { slot: null, handedLeft: 0 };
  return { slot: { label: 'Next', lead: '', items, tail: none, least: 1, lastStays: step !== null, kept: true }, handedLeft: handed.length - shown.length };
}

/** The red signs, by name, and the one sentence when only one is red. Said only to a caller the record sent them to. */
function signsSlot(c: Context): Slot | null {
  const red = (c.signs ?? []).filter((s) => oneLine(s.name) !== '');
  if (red.length === 0) return null;
  const items = red.slice(0, PER_SLOT).map((s) => words(s.name, 48));
  if (red.length === 1 && oneLine(red[0]!.said)) items[0] = `${items[0]!}. ${stopped(words(red[0]!.said, 120))}`;
  return {
    label: 'Signs',
    lead: `${String(red.length)} read red: `,
    items,
    tail: (shown) => (red.length > shown ? ` · ${String(red.length - shown)} more` : ''),
    least: 1,
  };
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

/**
 * The questions waiting, the ones that read the same once their ids and case are set aside folded into one, newest first.
 * A bank pattern asked "could not read account out of this one" once per text, and the briefing printed it twice.
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

/** The most a question says on the card. */
const ASKED = 90;

/** A question's first sentence, which is the question. A stop too early to end one, as in "Dr.", is not its end. */
function questionOf(said: string): string {
  const line = oneLine(said);
  for (const end of line.matchAll(/[.?!](?=\s)/gu)) if (end.index >= 16) return line.slice(0, end.index + 1);
  return line;
}

/** A question whole when it fits, and its first sentence when it does not: the record's own say the fact, then ask. */
function askedAs(said: string): string {
  const whole = words(said, Number.POSITIVE_INFINITY);
  return [...whole].length <= ASKED ? whole : words(questionOf(said), ASKED);
}

function waitingSlot(c: Context, at: CardAt): Slot | null {
  const asks = asked(c.waiting);
  if (asks.length === 0) return null;
  /* HOW MANY WAIT IS THE RECORD'S COUNT WHEN IT GAVE ONE: `context` sends only the newest. */
  const total = asks.length + Math.max(0, (at.waiting ?? 0) - c.waiting.length);
  return {
    label: 'Waiting',
    lead: `${String(total)} on ${at.decider && oneLine(at.decider) ? words(at.decider, 40) : 'the owner'}: `,
    items: asks.slice(0, PER_SLOT).map((a) => `${askedAs(plainly(a.question, c, true, at))}${a.count > 1 ? ` (${String(a.count)} like this)` : ''}`),
    tail: none,
    least: 1,
  };
}

/** The skills a standing learning bears on (its `topic` is the skill's name) that the skill's `because` does not carry. */
function bearing(c: Context): { skill: string; learnings: number } | null {
  const byTopic = new Map<string, string[]>();
  for (const row of rowsOf(c, 'learnings')) {
    if (row.state !== null && row.state !== 'active') continue;
    const topic = typeof row.topic === 'string' ? row.topic.trim().toLowerCase() : '';
    if (topic) byTopic.set(topic, [...(byTopic.get(topic) ?? []), row.spoken]);
  }
  if (byTopic.size === 0) return null;
  const seen = new Set<string>();
  for (const row of rowsOf(c, 'skills')) {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    if (row.state !== null && row.state !== 'active') continue;
    const carried = new Set(Array.isArray(row.because) ? row.because.filter((id): id is string => typeof id === 'string') : []);
    const fresh = (byTopic.get(name.toLowerCase()) ?? []).filter((id) => !carried.has(id));
    if (fresh.length > 0) return { skill: words(name, 60), learnings: fresh.length };
  }
  return null;
}

/** Learned and More: the two newest lessons still standing, then what is there on demand, three at most. */
function learnedAndMore(c: Context, at: CardAt, handedLeft: number): Slot[] {
  const lessons = rowsOf(c, 'learnings').filter((row) => row.state === null || row.state === 'active');
  const learned = lessons.map((row) => words(plainly(wordsOf(row, 'lesson'), c, true, at), 120)).filter(Boolean).slice(0, LEARNED);
  const more: string[] = [];
  const tried = c.handoff?.tried.length ?? 0;
  if (tried > 0) more.push(count(tried, 'dead end'));
  if (handedLeft > 0) more.push(`${String(handedLeft)} more handed to you`);
  const grow = bearing(c);
  if (grow) more.push(`${count(grow.learnings, 'learning')} for skill ${grow.skill}`);
  const plus = (id: string) => (register(c, id)?.truncated ? '+' : '');
  if (lessons.length > learned.length) more.push(`${String(lessons.length)}${plus('learnings')} learnings`);
  const keys = rowsOf(c, 'credentials').length;
  if (keys > 0) more.push(`${String(keys)}${plus('credentials')} ${keys === 1 && !plus('credentials') ? 'key' : 'keys'} by name`);
  const skills = rowsOf(c, 'skills').length;
  if (skills > 0) more.push(`${String(skills)}${plus('skills')} ${skills === 1 && !plus('skills') ? 'skill' : 'skills'}`);
  more.push(...(at.more ?? []).map((m) => words(m, 60)).filter(Boolean));
  return [
    ...(learned.length > 0 ? [{ label: 'Learned', lead: '', items: learned, tail: none, least: 0 }] : []),
    { label: 'More', lead: '', items: more.slice(0, PER_SLOT), tail: (shown: number) => `${shown > 0 ? ' · ' : ''}call context`, least: 0 },
  ];
}

/* ── an older command ──────────────────────────────────────────────────── */

/** The day of a build (`2026.10.07+1a2b3c4`), or of a bare day when `bare`; `null` for anything else. */
const dayOf = (build: string | null | undefined, bare: boolean): string | null => {
  const day = (bare ? /^(\d{4}\.\d{2}\.\d{2})(?:\+[0-9a-f]{7,40})?$/u : /^(\d{4}\.\d{2}\.\d{2})\+[0-9a-f]{7,40}$/u).exec(build ?? '');
  return day?.[1] ?? null;
};

/**
 * The line that ends the card when the command that called was built on a day before the oldest the door still works
 * with, and how long ago it was built. A build that is not a build, a checkout's, says nothing: it is not called behind.
 */
function olderSlot(at: CardAt, now: number): Slot | null {
  const built = dayOf(at.build, false);
  const min = dayOf(at.min_cli, true);
  if (built === null || min === null || built >= min) return null;
  const [y, m, d] = built.split('.').map(Number) as [number, number, number];
  const days = Math.floor((now - Date.UTC(y, m - 1, d)) / DAY_MS);
  const ago = Number.isFinite(days) && days >= 1 ? ` (built ${count(days, 'day')} ago)` : '';
  return { label: 'Update', lead: '', items: [`This command is older than the record${ago}. ${OLDER}`], tail: none, least: 1, kept: true };
}

/* ── the card ──────────────────────────────────────────────────────────── */

/** What is cut past 120 words, in this order, each down to the number beside it: the brief's order. */
const AIM_CUTS: [string, number][] = [['More', 0], ['Learned', 1], ['Waiting', 2], ['Also', 1]];
/** What is cut past 150 as well, after those. `More` at -1 is the line itself. */
const MOST_CUTS: [string, number][] = [['Waiting', 1], ['Learned', 0], ['Signs', 1], ['Next', 1], ['More', -1]];

/** The card's lines, every slot with nothing to say left out, and `More` while it stands. */
const render = (head: string, slots: Slot[]): string[] => [head, ...slots.filter((s) => s.items.length > 0 || (s.label === 'More' && s.least >= 0)).map(lineOfSlot)];

/** One cut from the first rule that still has something to cut; false when none has. */
function cutOnce(slots: Slot[], rules: [string, number][]): boolean {
  for (const [label, floor] of rules) {
    const slot = slots.find((s) => s.label === label);
    if (slot === undefined) continue;
    if (floor < 0) {
      if (slot.least < 0) continue;
      slot.items = [];
      slot.least = -1;
      return true;
    }
    if (slot.items.length <= floor) continue;
    /* The handoff is Next's last thing and its reason for being, so a row handed over goes before it does. */
    slot.items.splice(slot.lastStays === true ? slot.items.length - 2 : slot.items.length - 1, 1);
    return true;
  }
  return false;
}

/** The lines that lose words first in the last resort: none of them is line one, the same-tree warning, Next or Update. */
const SOFT = new Set(['Signs', 'Waiting', 'Learned', 'More']);
const labelOf = (line: string): string => line.slice(0, LABEL).trim();

/**
 * THE LAST RESORT, when what is left is still past 150 words: the longest line loses words off its end. The lesser lines
 * go first, down to eight words each, so a sign's long sentence never costs the handoff its "check before acting" nor
 * the same-tree line its warning; only then any line but the one saying the command is older, down to four. No real
 * card comes here; a handoff, a sign or a question a run wrote as a paragraph could.
 */
function cutWords(lines: string[]): string[] {
  const out = [...lines];
  const passes: [(line: string) => boolean, number][] = [[(line) => SOFT.has(labelOf(line)), 8], [(line) => labelOf(line) !== 'Update', 4]];
  for (const [may, least] of passes) {
    for (let total = wordCount(out.join('\n')); total > CARD_MOST; total = wordCount(out.join('\n'))) {
      const at = out.map((line, i) => ({ i, n: wordCount(line) })).filter(({ i }) => may(out[i]!)).sort((a, z) => z.n - a.n)[0];
      if (at === undefined || at.n <= least) break;
      const keep = Math.max(least, at.n - (total - CARD_MOST));
      const parts = out[at.i]!.split(/(\s+)/u);
      let seen = 0;
      let end = 0;
      for (; end < parts.length && seen < keep; end++) if (/[\p{L}\p{N}]/u.test(parts[end]!)) seen++;
      out[at.i] = `${parts.slice(0, end).join('').replace(/[\s,;:.·]+$/u, '')}…`;
    }
  }
  return out;
}

/**
 * The card for a context, drawn for who and where the session is (`at`) at the instant `now`.
 *
 * `next` is the Next line alone, as it stood before any cut, for a session that just compacted: the step it is on
 * without what it already read. `words` is the card's size as the sign `agent-card-words` reads it.
 */
export function card(c: Context, at: CardAt, now: number): Card {
  const own = at.run === undefined ? (c.session?.spoken ?? null) : at.run;
  const head = firstLine(c, at, own);
  const next = nextSlot(c, at, own);
  const nextLine = next.slot === null ? null : lineOfSlot(next.slot);
  const slots = [alsoSlot(c, own), next.slot, signsSlot(c), waitingSlot(c, at), ...learnedAndMore(c, at, next.handedLeft), olderSlot(at, now)].filter((s): s is Slot => s !== null);
  const size = () => wordCount(render(head, slots).join('\n'));
  while (size() > CARD_AIM && cutOnce(slots, AIM_CUTS));
  while (size() > CARD_MOST && cutOnce(slots, [...AIM_CUTS, ...MOST_CUTS]));
  const said = cutWords(render(head, slots)).join('\n');
  return { card: said, next: nextLine, words: wordCount(said) };
}
