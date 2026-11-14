/**
 * THE CARD AN AGENT STARTS FROM, composed in the record, so the start hook, `context` and `braindog context`
 * print one text made by one set of rules, whatever build of the command sits on the machine.
 *
 * THE BRIEF COMES FIRST AND IS FIVE SHORT TRUE LINES, NAMES FIRST, each under about 100
 * characters and none of them an id:
 *
 *   Claude Code on MacBook, working on BrainDog
 *   Next     Cut page answers to block summaries. (Claude Code, 5h ago, check before acting)
 *   Waiting  2 on Mara, first: Change how copperleaf starts?
 *   Learned  Money is minor units plus currency. Never add two currencies.
 *   More     call context for the full picture
 *
 * Next, Waiting and Learned are left out when they have nothing true to say. A `Signs` line comes only when a red sign
 * names this project. Two lines are added only when true and are never cut: the warning about another run in the same
 * tree, and the line saying the command is older than the record. Ids stay in `context`'s `format: "full"` answer and in
 * `card_next`, the whole Next line kept for a session that just compacted; the brief itself never leans on one.
 *
 * NAMES PRINT AS WRITTEN, accents and other scripts kept. Every control and format character is removed (`oneLine`, the
 * command's own scrub copied here), since a terminal obeys what it is handed. A machine's network name, a path and a
 * row's handle are never printed: a person reads the kind of machine, the file's name and the row's own words.
 *
 * Typed on `Context` alone, by a type-only import, so the record's `briefing()` can call it without a cycle.
 */

import { listFor, type AgentRole } from './agent-lists.ts';
import { RULE, rulesOf, type Rules } from './context-caps.ts';
import type { Brief, Context } from './index.ts';
import { ALSO_HERE_MOST, TRIED_MOST } from './same-tree.ts';

/** About this many words: five lines of about a dozen, with room for the two lines that are added when true. */
export const CARD_AIM = 80;

/** Never more words than this. */
export const CARD_MOST = 130;

/** The longest a brief line runs, label included. */
const LINE = 100;

/** The most things one slot names. */
const PER_SLOT = 3;

/** The read that lists every step left here and not taken, newest first, which Next names when older ones wait. */
const HANDOFFS_READ = 'braindog:handoffs';

/** Said word for word whenever another run is working in the same repository (`docs/32-PARITY.md:142`). */
export const TWO_SESSIONS = 'Two sessions in one working tree overwrite each other. Coordinate or stop.';

/** Said when the command's build is older than the oldest the record's door still works with, or than the host's own. */
export const OLDER = 'Run braindog update, or switch on updates by itself in Settings > Agents.';

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
  /** The build this host serves (`Build.app`): a command built on an earlier day is behind it too. */
  serves?: string | null | undefined;
  /** Whom the questions wait on, by name, when the record said; "the owner" otherwise. */
  decider?: string | null | undefined;
  /** How many questions wait in all, when the record counted them: `context` sends only the newest. */
  waiting?: number | null | undefined;
  /** Things the caller adds to More, such as what the start hook's skills sync did. */
  more?: string[] | undefined;
  /** The Home page the record declares, by its title, which More names with the read that opens it. */
  home?: string | null | undefined;
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
const NOT_WORDS = new Set(['spoken', 'scope', 'state', 'version', 'created_at']);
const wordsOf = (row: Brief, field?: string): string => {
  const named = field === undefined ? undefined : row[field];
  if (typeof named === 'string' && named.trim()) return named;
  for (const [key, value] of Object.entries(row)) if (!NOT_WORDS.has(key) && typeof value === 'string' && value.trim()) return value;
  return '';
};

/**
 * The list that plays one of the agents' parts, found by the role it declares and never by its id (`listFor`), and its
 * rows. A record that keeps no such list has none, so the card leaves that line out.
 */
const register = (c: Context, role: AgentRole) => {
  const id = listFor(role, c.registers);
  return id === null ? undefined : c.registers.find((r) => r.id === id);
};
const rowsOf = (c: Context, role: AgentRole): Brief[] => {
  const r = register(c, role);
  return r ? [...r.rows, ...r.inherited] : [];
};

/**
 * Somebody's sentence without what a person never reads: a network name becomes the kind of machine it is, and with
 * `all`, a path becomes its file's name and a handle becomes the row's own words, or the list it is one of.
 *
 * THE QUESTIONS ARE WRITTEN BY OTHER RUNS AND BY THE RECORD'S OWN SCANS, and one on the owner's record read "Change
 * tools#8 to how fly-copperleaf is set up in ~/.claude.json on Maras-MacBook-Pro.local?". A handoff's step keeps its
 * paths and handles, which the next run needs; only the machine's network name goes from it.
 */
export function plainly(said: string, c: Context, all: boolean, at?: CardAt): string {
  const out = said.replace(NETWORK, (network) => machineOf(network));
  if (!all) return out;
  return moneyPlain(out)
    .replace(ROW_ID, (id) => at?.named?.(id) ?? 'an entry you cannot see')
    .replace(PATH, (path) => path.replace(/[\\/]+$/u, '').split(/[\\/]/u).at(-1) || 'a folder')
    .replace(HANDLE, (handle, list: string) => {
      const row = c.registers.flatMap((r) => [...r.rows, ...r.inherited]).find((b) => b.spoken === handle);
      const said = row ? words(wordsOf(row), 40) : '';
      return said || at?.named?.(handle) || `one of ${c.registers.find((r) => r.id === list)?.name ?? list.replace(/_/gu, ' ')}`;
    });
}

/**
 * The currencies a person writes by a sign, as the kernel's messages do (`SIGN` in `packages/kernel/src/rules.ts`). Any
 * other is left by its code.
 */
const MONEY_SIGN: Readonly<Record<string, string>> = {
  GBP: '£', EUR: '€', USD: '$', JPY: '¥', CNY: 'CN¥', INR: '₹', KRW: '₩', ILS: '₪',
  CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', MXN: 'MX$', BRL: 'R$',
};

/**
 * An amount a question was written with, as a person says it (door audit D32): "GBP 39.00" is "£39", and "GBP 39.50"
 * "£39.50". A code with no sign is left as written, so three capitals that are no currency are never touched.
 */
export function moneyPlain(text: string): string {
  return text.replace(/\b([A-Z]{3}) ([−-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,3}))?(?![\d.,]*\d)/gu, (whole, code: string, minus: string, units: string, minor: string | undefined) => {
    const sign = MONEY_SIGN[code];
    const cents = minor !== undefined && /[1-9]/u.test(minor) ? `.${minor}` : '';
    if (sign === undefined) return whole;
    return `${minus === '' ? '' : '−'}${sign}${units}${cents}`;
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

/** The app and the machine: "Claude Code on MacBook Pro", "on MacBook", or nothing when neither is known. */
function machineLine(at: CardAt): string | null {
  const device = (at.device ? words(at.device, 40) : '') || (at.host ? machineOf(at.host) : '');
  const app = agentName(at.agent);
  if (!device) return app;
  return app ? `${app} on ${device}` : `on ${device}`;
}

/**
 * Line one: who and where, by name. The project as a person reads it, never its folder, an address or a machine's
 * network name; with none, the one thing to do about it.
 */
function whoLine(c: Context, at: CardAt): string {
  const where = machineLine(at);
  const app = where === null ? 'This session' : where.startsWith('on ') ? `This session ${where}` : where;
  if (c.project) {
    const name = words(plainly(c.project.name.replace(ADDRESS, ' '), c, true), 40);
    return name ? `${app}, working on ${name}` : `${app}, working in a project with no name`;
  }
  if (c.ambiguous.length > 0) return `${app}, no project yet: ${String(c.ambiguous.length)} match this folder, name one to context as project`;
  return `${app}, no project yet: name it to context as project`;
}

/* ── the slots ─────────────────────────────────────────────────────────── */

/**
 * One line under the first: its label, the words before its things, the things, and what follows them, worked out from
 * how many are still shown. `least` is how many things it keeps when the card runs long, `stays` how many of its last
 * things are never cut, as the record's own Next lines are, `kept` that the line itself is never taken off, and `sep`
 * what stands between its things when it is not ` · `.
 */
type Slot = { label: string; lead: string; items: string[]; tail: (shown: number) => string; least: number; stays?: number; kept?: boolean; sep?: string };

const LABEL = 9;
const none = (): string => '';
const lineOfSlot = (s: Slot): string => `${s.label.padEnd(LABEL - 1)} ${s.lead}${s.items.join(s.sep ?? ' · ')}${s.tail(s.items.length)}`;

/** A run's state that is working: active, and not gone quiet nor stale. */
const working = (r: Context['live']['same_repo'][number]): boolean => r.state === 'active' && r.quiet !== true && !r.stale;

/**
 * The line about other runs working in the same tree, said only when it is true. The caller's own run is never one.
 *
 * THE RECORD'S `also_here` WHEN IT SENT ONE: it knows the machine and the helpers, which a run's brief does not, so a
 * `null` there means nobody shares this tree, whatever `same_repo` holds. The warning, word for word, then "Also here:"
 * and the runs by name, each with what it says it is doing, and "and 2 more" counted from what the cut left.
 */
function alsoSlot(c: Context, own: string | null, at: CardAt): Slot | null {
  if (c.also_here !== undefined) {
    const here = c.also_here;
    if (here === null) return null;
    const runs = here.runs.slice(0, ALSO_HERE_MOST).map((r) => {
      const name = words(plainly(r.name, c, true, at), 40);
      return r.doing ? `${name}, ${words(plainly(r.doing, c, true, at), 60)}` : name;
    });
    const all = here.runs.length + (Number.isInteger(here.more) && here.more > 0 ? here.more : 0);
    return {
      label: 'Also',
      lead: `${oneLine(here.warning) || TWO_SESSIONS} Also here: `,
      items: runs,
      sep: '; ',
      tail: (shown) => `${all > shown ? `, and ${String(all - shown)} more` : ''}.`,
      least: 1,
      kept: true,
    };
  }
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
  /* THE RUNS AND THREE OF THE AGENTS' OWN LISTS ARE NOT WORK ANYBODY IS HANDED, each found by the part it plays. */
  const kept = new Set(['session', ...(['learnings', 'keys-index', 'skills'] as const).map((role) => listFor(role, c.registers))]);
  return c.registers
    .filter((r) => !kept.has(r.id))
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

/** What the step's writer tried, as one "Tried:" line of at most `TRIED_MOST` characters, or `null` when nothing was. */
function triedItem(c: Context): string | null {
  const tried = (c.handoff?.tried ?? []).map((t) => oneLine(plainly(String(t), c, false)).replace(/[.;]+$/u, '')).filter((t) => t !== '');
  return tried.length === 0 ? null : words(`Tried: ${tried.join('; ')}`, TRIED_MOST);
}

/** "2 older steps were left here", with the read that lists them, when the record counted any past the one handed over. */
function earlierItem(c: Context): string | null {
  const n = c.handoff?.earlier;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) return null;
  return `${count(n, 'older step')} ${n === 1 ? 'was' : 'were'} left here: read ${HANDOFFS_READ}`;
}

/**
 * The step as the record says it: its own Next lines (`next_lines`), each whole and on one line, else the card's
 * wording of a `handoff` with what was tried; then how many older steps wait. Empty when there is nothing true to say.
 */
function stepItems(c: Context, at: CardAt, own: string | null): string[] {
  const told = (Array.isArray(c.next_lines) ? c.next_lines : [])
    .map((line) => (typeof line === 'string' ? words(plainly(line, c, false), Number.POSITIVE_INFINITY) : ''))
    .filter((line) => line !== '');
  const worded = handoffItem(c, at, own);
  const step = told.length > 0 ? told : worded === null ? [] : [worded, triedItem(c)];
  return [...step, earlierItem(c)].filter((s): s is string => s !== null);
}

/** Next: what a person handed to this agent, then the record's lines about the step, which are never cut. */
function nextSlot(c: Context, at: CardAt, own: string | null): { slot: Slot | null; handedLeft: number } {
  const handed = handedTo(c, at.agent ?? null);
  const step = stepItems(c, at, own);
  const shown = handed.slice(0, step.length === 0 ? PER_SLOT : PER_SLOT - 1);
  const items = [...shown.map((row) => `${words(plainly(wordsOf(row), c, true, at), 60)} (${clip(row.spoken, 24)}, handed to you)`), ...step];
  if (items.length === 0) return { slot: null, handedLeft: 0 };
  return { slot: { label: 'Next', lead: '', items, tail: none, least: 1, stays: step.length, kept: true }, handedLeft: handed.length - shown.length };
}

/** A run's id as a step's words carry it, "" or "(" ahead of more notes: a name stands in its place. */
const tidy = (said: string): string => said.replace(/\(([A-Z]{1,3}\d+),\s*/gu, '(').replace(/\s*\([A-Z]{1,3}\d+\)/gu, '');

/** Room for the words of a brief line once its label is on. */
const ROOM = LINE - LABEL;

/** A brief line: the label padded as every slot's is, then its words. */
export const labeled = (label: string, said: string): string => `${label.padEnd(LABEL - 1)} ${said}`;

/**
 * Next as one short line: the first thing a person handed to this agent, else the record's first Next line, else the
 * handoff with who left it (by app, not by run) and when. The whole of it is `card_next`.
 */
function nextBrief(c: Context, at: CardAt, own: string | null): string | null {
  const handed = handedTo(c, at.agent ?? null)[0];
  if (handed) return `${words(tidy(plainly(wordsOf(handed), c, true, at)), ROOM - 16)} (handed to you)`;
  const told = (Array.isArray(c.next_lines) ? c.next_lines : []).map((l) => (typeof l === 'string' ? tidy(plainly(l, c, true, at)) : '')).find((l) => oneLine(l) !== '');
  if (told) {
    /* "LEFT BY CLAUDE 1h ago. Check before acting." IS THE PART THAT KEEPS A STEP TRUE: it stays whole and the step gives way. */
    const left = told.indexOf(' Left by ');
    if (left <= 0) return words(told, ROOM);
    const tail = words(told.slice(left + 1), 60);
    return `${words(told.slice(0, left), ROOM - [...tail].length - 1)} ${tail}`;
  }
  const h = c.handoff;
  if (!h || !h.next.trim()) return null;
  const by = agentName(lineOf(h, 'agent') ?? [...c.live.same_repo, ...c.live.elsewhere].find((r) => r.spoken === h.from)?.agent ?? null);
  const check = !(h.age_s <= DAY_S) || own === null || h.from !== own;
  const notes = [...(by === null ? [] : [by]), since(h.age_s), ...(check ? ['check before acting'] : [])].join(', ');
  return `${stopped(words(tidy(plainly(h.next, c, true, at)), ROOM - notes.length - 3))} (${notes})`;
}

/** The red signs that name this project, and only those: a sign about the whole record is in `context`, not the brief. */
function signsBrief(c: Context): string | null {
  const here = c.project ? oneLine(c.project.name).toLowerCase() : '';
  if (!here) return null;
  const red = (c.signs ?? []).filter((s) => oneLine(s.name) !== '' && `${s.name} ${s.said}`.toLowerCase().includes(here));
  if (red.length === 0) return null;
  return words(`${String(red.length)} read red here: ${red.slice(0, 2).map((s) => words(s.name, 40)).join(' · ')}`, ROOM);
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

/** A question's first sentence, which is the question. A stop too early to end one, as in "Dr.", is not its end. */
function questionOf(said: string): string {
  const line = oneLine(said);
  for (const end of line.matchAll(/[.?!](?=\s)/gu)) if (end.index >= 16) return line.slice(0, end.index + 1);
  return line;
}

/**
 * Waiting as a count and the top one in plain words. The count is this project's when the record gave it (the questions
 * this agent can act on), said beside all of them when fewer; the questions come project first, so the top one is the nearest.
 */
function waitingBrief(c: Context, at: CardAt): string | null {
  const asks = asked(c.waiting);
  if (asks.length === 0) return null;
  const total = asks.length + Math.max(0, (at.waiting ?? 0) - c.waiting.length);
  const n = typeof c.waiting_here === 'number' && c.waiting_here > 0 ? c.waiting_here : total;
  const who = at.decider && oneLine(at.decider) ? words(at.decider, 24) : 'the owner';
  /* BOTH NUMBERS WHEN THEY DIFFER: "1 on the owner" beside a badge of 8 read as a count that disagreed. */
  const lead = n < total ? `${String(n)} here of ${String(total)} on ${who}, first: ` : `${String(n)} on ${who}, first: `;
  return `${lead}${words(questionOf(tidy(plainly(asks[0]!.question, c, true, at))), ROOM - lead.length)}`;
}

/** The day the record wrote a row, when the row carries it; '' when it does not, which sorts as the oldest. */
const writtenOn = (row: Brief): string => (typeof row.created_at === 'string' ? row.created_at : '');

/**
 * WHICH LESSON COMES FIRST (the order `braindog:learnings` reads in): a method before a fact, this
 * project's before the ones that apply everywhere, then the newest. Read off the row's own `kind`, `scope` and
 * `created_at`, so it costs no read. A lesson with no kind, or a kind that is not a method, is a fact: nothing unnamed
 * outranks a method. Two the record gives no day for are equal, and a stable sort leaves them as the record sent them,
 * which is newest first.
 */
export function learnedFirst(a: Brief, z: Brief): number {
  const fact = (row: Brief): number => (row.kind === 'method' ? 0 : 1);
  const far = (row: Brief): number => (row.scope === 'project' ? 0 : 1);
  const [on, zon] = [writtenOn(a), writtenOn(z)];
  return fact(a) - fact(z) || far(a) - far(z) || (on === zon ? 0 : on > zon ? -1 : 1);
}

/**
 * The rules the card leads Learned with: the ones `context` read from every learning (`rulesOf`, so a rule older than
 * the newest lessons is still here), else the ones among the learnings it sent.
 */
function rulesFor(c: Context): Rules<Brief> {
  const sent = (c as Context & { rules?: unknown }).rules as Partial<Rules<Brief>> | undefined;
  if (sent && Array.isArray(sent.rows)) return { rows: sent.rows, more: typeof sent.more === 'number' && sent.more > 0 ? sent.more : 0 };
  return rulesOf(rowsOf(c, 'learnings'), c.project?.spoken ?? null);
}

/**
 * Learned: the one learning that applies here, cut to a line. The record's rules lead, this project's first and then
 * the newest; then the standing lessons by `learnedFirst` (a method before a fact, this project's before everywhere,
 * then the newest). Nothing when there is none.
 *
 * THE FIRST, NOT THE SHORTEST: picking the shortest put one short lesson from an older system ("On a 409 from PUT
 * /api/db…") on every card for a month, however many newer and nearer ones the record held.
 */
function learnedBrief(c: Context, at: CardAt): string | null {
  const rules = rulesFor(c);
  const isRule = new Set(rules.rows.map((row) => row.spoken));
  const lessons = rowsOf(c, 'learnings').filter((row) => row.state === null || row.state === 'active').sort(learnedFirst);
  const first = [...[...rules.rows].sort(learnedFirst), ...lessons.filter((row) => row.kind !== RULE && !isRule.has(row.spoken))]
    .map((row) => words(tidy(plainly(wordsOf(row, 'lesson'), c, true, at)), 400))
    .find(Boolean);
  return first === undefined ? null : words(first, ROOM);
}

/* ── an older command ──────────────────────────────────────────────────── */

/** The day of a build (`2026.10.07+1a2b3c4`), or of a bare day when `bare`; `null` for anything else. */
const dayOf = (build: string | null | undefined, bare: boolean): string | null => {
  const day = (bare ? /^(\d{4}\.\d{2}\.\d{2})(?:\+[0-9a-f]{7,40})?$/u : /^(\d{4}\.\d{2}\.\d{2})\+[0-9a-f]{7,40}$/u).exec(build ?? '');
  return day?.[1] ?? null;
};

/**
 * The line that ends the card when the command that called was built on a day before the oldest the door still works
 * with, or before the build this host serves, and how long ago it was built. A build that is not a build, a checkout's,
 * says nothing: it is not called behind.
 *
 * THE HOST'S OWN BUILD TOO: held only to the oldest the door works with, a command five days behind the host was told
 * nothing, while What shipped has arrived said it had not arrived.
 */
function olderSlot(at: CardAt, now: number): Slot | null {
  const built = dayOf(at.build, false);
  const floors = [dayOf(at.min_cli, true), dayOf(at.serves, true)].filter((d): d is string => d !== null);
  if (built === null || !floors.some((floor) => built < floor)) return null;
  const [y, m, d] = built.split('.').map(Number) as [number, number, number];
  const days = Math.floor((now - Date.UTC(y, m - 1, d)) / DAY_MS);
  const ago = Number.isFinite(days) && days >= 1 ? ` (built ${count(days, 'day')} ago)` : '';
  return { label: 'Update', lead: '', items: [`This command is older than this BrainDog${ago}. ${OLDER}`], tail: none, least: 1, kept: true };
}

/* ── the card ──────────────────────────────────────────────────────────── */

/** The lines that lose words first in the last resort: none of them is line one, the same-tree warning, Next or Update. */
const SOFT = new Set(['Signs', 'Waiting', 'Learned', 'More']);
const labelOf = (line: string): string => line.slice(0, LABEL).trim();

/**
 * THE LAST RESORT, when what is left is still past 150 words: the longest line loses words off its end. The lesser lines
 * go first, down to eight words each, so a sign's long sentence never costs the handoff its "check before acting" nor
 * the same-tree line its warning; only then any line but the one saying the command is older, down to four. No real
 * card comes here; a handoff, a sign or a question a run wrote as a paragraph could.
 */
function cutWords(lines: string[], most = CARD_MOST): string[] {
  const out = [...lines];
  const passes: [(line: string) => boolean, number][] = [[(line) => SOFT.has(labelOf(line)), 8], [(line) => labelOf(line) !== 'Update', 4]];
  for (const [may, least] of passes) {
    for (let total = wordCount(out.join('\n')); total > most; total = wordCount(out.join('\n'))) {
      const at = out.map((line, i) => ({ i, n: wordCount(line) })).filter(({ i }) => may(out[i]!)).sort((a, z) => z.n - a.n)[0];
      if (at === undefined || at.n <= least) break;
      const keep = Math.max(least, at.n - (total - most));
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
 * The card's lines one by one, each whole and labelled, `null` where it has nothing true to say: what `card` joins, and
 * what the context plan (`context-plan.ts`) draws its own card from. `who` is line one; `placed` says whether it names a
 * project; `step` is the whole Next line for a session that just compacted.
 */
export type CardParts = {
  who: string;
  placed: boolean;
  also: string | null;
  next: string | null;
  signs: string | null;
  waiting: string | null;
  learned: string | null;
  update: string | null;
  step: string | null;
};

/** The card's lines for a context, drawn for who and where the session is (`at`) at the instant `now`, not yet cut. */
export function cardParts(c: Context, at: CardAt, now: number): CardParts {
  const own = at.run === undefined ? (c.session?.spoken ?? null) : at.run;
  const step = nextSlot(c, at, own).slot;
  const slot = (s: Slot | null): string | null => (s === null ? null : lineOfSlot(s));
  const brief = (label: string, said: string | null): string | null => (said === null || oneLine(said) === '' ? null : labeled(label, said));
  return {
    who: whoLine(c, at),
    placed: c.project !== null,
    also: slot(alsoSlot(c, own, at)),
    next: brief('Next', nextBrief(c, at, own)),
    signs: brief('Signs', signsBrief(c)),
    waiting: brief('Waiting', waitingBrief(c, at)),
    learned: brief('Learned', learnedBrief(c, at)),
    update: slot(olderSlot(at, now)),
    step: slot(step),
  };
}

/** Lines cut, last resort first, to at most `most` words (`CARD_MOST` for the card): what `card` does past its size. */
export const cutTo = (lines: readonly string[], most = CARD_MOST): string[] => cutWords([...lines], most);

/**
 * The card for a context, drawn for who and where the session is (`at`) at the instant `now`.
 *
 * `next` is the Next line alone, whole and as it stood, for a session that just compacted: the step it is on without
 * what it already read. `words` is the card's size as the sign `agent-card-words` reads it.
 */
export function card(c: Context, at: CardAt, now: number): Card {
  const p = cardParts(c, at, now);
  const lines = [p.who, p.also, p.next, p.signs, p.waiting, p.learned, labeled('More', 'call context for the full picture'), p.update].filter((l): l is string => l !== null);
  const said = cutWords(lines).join('\n');
  return { card: said, next: p.step, words: wordCount(said) };
}
