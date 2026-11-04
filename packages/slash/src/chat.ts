/**
 * A conversation with Slash: a thread of turns, a model that reads the record through tools and does what it is asked
 * through them, and an answer held to what the tools said.
 *
 * WHY THIS AND NOT THE PALETTE'S TWO PASSES. Those read one fixed projection, drafted once, and answer in braces with no
 * digit allowed; a follow-up starts from nothing and nothing can be done. Here a turn is a short loop: the model asks for
 * a read, the host runs it over the record's own methods as the asker, the model reads the result and asks again or
 * answers. The palette's passes are left as they were.
 *
 * TOOLS BY JSON. The call shape has no `tools` field and that is kept (`types.ts`): each step is one JSON answer under
 * `CHAT_SCHEMA`, `{ calls, say }`, which every host's model already speaks.
 *
 * TRUTH IS CHECKED, NOT BANNED. The answer may say a figure; every figure it says must stand in something this turn
 * read, a calc it ran, the person's own words or the conversation before. One that does not is taken out with the
 * sentence it was in, and the answer says a figure was left out (`held`).
 *
 * ONE ASK A TURN. The first model call holds the person's ask, as `read` holds one (`core.reserve`), before anything is
 * awaited; every later step of the same turn is its own ledger row and spends nobody's month, as a question's second
 * pass does. The steps are bounded (`STEPS_MOST`, `CALLS_MOST`) and the prompt is fitted under the template's cap.
 *
 * WHAT IS KEPT. The conversation, in Slash's own store beside the ledger (`slash_thread`, `slash_turn`), for the person
 * who had it; and each action held for a yes, with the write it would make (`slash_act`), which never leaves this store.
 * `eraseSlash` takes a person's words out of all three.
 */

import { codeOf, fixOf, no, ok, type Result, type Sql } from '@braindog/ports';

import { ulid, type Core } from './call.ts';
import {
  ATTACH_MOST,
  DEEP_CALLS_MOST,
  DEEP_DDL,
  DEEP_HARDER,
  DEEP_MAX_TOKENS,
  DEEP_MODEL,
  DEEP_RESULT_CHARS,
  DEEP_STEPS_MOST,
  DEEP_SYSTEM,
  DEEP_TURN_CHARS,
  DEEP_TURNS_READ,
  deepSetupOf,
  deepSpend,
  deepSpent,
  deepToolOf,
  wantsDeep,
} from './deep.ts';
import { CHAT_ANSWER_SCHEMA, PROMPTS } from './prompts.ts';
import { firstBytes, isRecord, tokens } from './project.ts';
import type {
  CallContext,
  ChatAction,
  ChatActed,
  ChatEvent,
  ChatFigure,
  ChatInput,
  ChatMention,
  ChatMode,
  ChatRan,
  ChatRun,
  ChatThread,
  ChatThreads,
  ChatTool,
  ChatTools,
  Deep,
  DeepBlock,
  DeepInference,
  DeepMessage,
  Inference,
} from './types.ts';

/** The most model calls one turn makes: read, read again, answer, and one to spare. */
export const STEPS_MOST = 4;
/** The most tool calls one turn runs, across its steps. */
export const CALLS_MOST = 6;
/** What a person may send in one message, in bytes. */
const MESSAGE_BYTES = 1_000;
/** The most of one result the model reads; a longer one is cut and says so. */
const RESULT_CHARS = 2_400;
/** An older result this turn, once the prompt is too long, is cut to this. */
const RESULT_SHORT = 500;
/** The turns before this one the model is shown, newest kept when the prompt is too long. */
const TURNS_READ = 8;
/** The most of one earlier turn the model is shown. */
const TURN_CHARS = 1_200;
/** The turns one thread keeps; the oldest go first. */
const TURNS_KEPT = 40;
/** The most ids one answer has turned into links. */
const REFS_MOST = 10;
/** The most of the line naming the lists the model is shown. */
const LISTS_CHARS = 1_600;

/** Slash's own tables for a conversation, beside the ledger, each made once and never altered. */
const DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS slash_thread (
     id      TEXT PRIMARY KEY,
     person  TEXT NOT NULL,
     ts      TEXT NOT NULL,
     updated TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS slash_turn (
     thread  TEXT NOT NULL,
     n       INTEGER NOT NULL,
     role    TEXT NOT NULL CHECK (role IN ('you','slash')),
     text    TEXT NOT NULL,
     actions TEXT NOT NULL DEFAULT '[]',
     ts      TEXT NOT NULL,
     PRIMARY KEY (thread, n)
   )`,
  `CREATE TABLE IF NOT EXISTS slash_act (
     id      TEXT PRIMARY KEY,
     thread  TEXT NOT NULL,
     person  TEXT NOT NULL,
     title   TEXT NOT NULL,
     op      TEXT NOT NULL,
     state   TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','accepted','declined')),
     receipt TEXT,
     undo    TEXT,
     ts      TEXT NOT NULL
   )`,
];

/** Make the conversation's tables where they are not yet. */
export const openChat = (sql: Sql): void => {
  for (const statement of DDL) sql.exec(statement);
  sql.exec(DEEP_DDL);
};

/** The tool the engine answers itself: arithmetic, so a total the answer says is one code worked out. */
const CALC: ChatTool = { name: 'calc', args: 'expr', about: 'Work out a sum: + - * / and brackets over figures the results showed, e.g. "1250.50 + 300"' };

/**
 * Whether the person's words ask for something to be done, and not only to be told: the one condition on which a write
 * lands at once. A question that happens to make the model want to write gets a held action instead.
 */
const DOING =
  /\b(add|adds|create|make|new|put|log|record|note|track|remind|schedule|set|change|update|edit|rename|move|mark|close|finish|complete|assign|draft|write|build|start|plan|open|go|take me|show me|bring up|file|book|save|keep|do it|go ahead|yes|yep|sure|please do|ok|okay)\b/iu;

const who = (ctx: CallContext): string => ctx.principal.id;

/* ── checking an answer ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A figure as it is written in prose: digits with their thousands commas and decimals, and a `k` or `m` after, never one
 * inside a word or an id (`TK3`, `Q4`, `2nd` are not figures).
 */
const FIGURE = /(?<![A-Za-z0-9#_.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:\s?([kKmM])\b)?(?![A-Za-z0-9_])/gu;
/** Any number at all, as evidence: digit runs with commas and decimals, wherever they sit. */
const ANY_NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/gu;

const valueOf = (whole: string, decimals: string | undefined, scale: string | undefined): number => {
  const n = Number(`${whole.replaceAll(',', '')}${decimals ?? ''}`);
  const s = scale?.toLowerCase();
  return s === 'k' ? n * 1_000 : s === 'm' ? n * 1_000_000 : n;
};

/** Every number a text holds, as values. */
export const numbersIn = (text: string): number[] => {
  const out: number[] = [];
  for (const m of text.matchAll(ANY_NUMBER)) {
    const n = Number(m[0].replaceAll(',', ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
};

/**
 * Whether a figure the answer says stands in the evidence: the same value, or the same value rounded the way a person
 * rounds when they speak (to the whole number, or to the thousand behind a `k`). A small whole number is a count or a
 * day of the month and is let through; a calc's result is evidence like any other.
 */
const holds = (value: number, evidence: readonly number[], scaled: boolean): boolean => {
  if (Number.isInteger(value) && value >= 0 && value <= 12 && !scaled) return true;
  return evidence.some((e) => {
    if (Math.abs(e - value) < 1e-9) return true;
    if (Math.abs(e) >= 100 && Math.round(e) === value) return true;
    if (scaled) return Math.abs(e - value) <= Math.max(Math.abs(e) * 0.05, 1);
    return false;
  });
};

/**
 * The sentences of an answer, each with the space that followed it, so they join back as they were written. A line is a
 * sentence too: an answer that lists a few things one to a line keeps its lines, where joining on a space ran them into
 * one paragraph.
 */
const sentences = (text: string): string[] => (text.match(/[^\n]*?(?:[.!?](?=\s|$)|\n|$)\s*/gu) ?? []).filter((s) => s.trim() !== '');

/* ── reading a step as it streams ────────────────────────────────────────────────────────────────────────────────── */

const SPACE = /\s/u;

/** A JSON string from the quote at `at`: its value so far, and the index past its closing quote, or -1 while it is open. */
const stringAt = (text: string, at: number): { value: string; end: number } => {
  let value = '';
  let i = at + 1;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') return { value, end: i + 1 };
    if (c !== '\\') {
      value += c;
      i++;
      continue;
    }
    /* AN ESCAPE IS TAKEN WHOLE OR NOT YET, so a piece never ends half a character. */
    const e = text[i + 1];
    if (e === undefined) break;
    if (e === 'u') {
      const hex = text.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/u.test(hex)) break;
      const code = parseInt(hex, 16);
      /* A HIGH SURROGATE WAITS FOR ITS PAIR. */
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = /^\\u([0-9a-fA-F]{4})/u.exec(text.slice(i + 6, i + 12));
        if (low === null) break;
        value += String.fromCharCode(code, parseInt(low[1]!, 16));
        i += 12;
        continue;
      }
      value += String.fromCharCode(code);
      i += 6;
      continue;
    }
    value += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === 'b' ? '\b' : e === 'f' ? '\f' : e;
    i += 2;
  }
  return { value, end: -1 };
};

/** The index past the JSON value at `at`, or -1 while it is still arriving. */
const valueEnd = (text: string, at: number): number => {
  const c = text[at];
  if (c === undefined) return -1;
  if (c === '"') return stringAt(text, at).end;
  if (c === '{' || c === '[') {
    let depth = 0;
    for (let i = at; i < text.length; i++) {
      const d = text[i]!;
      if (d === '"') {
        const end = stringAt(text, i).end;
        if (end < 0) return -1;
        i = end - 1;
      } else if (d === '{' || d === '[') depth++;
      else if (d === '}' || d === ']') {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }
  for (let i = at; i < text.length; i++) if (text[i] === ',' || text[i] === '}' || text[i] === ']' || SPACE.test(text[i]!)) return i;
  return -1;
};

/**
 * One step's answer read while it is still arriving: whether it calls anything (`none`, `some`, or not said yet) and the
 * words of its `say` so far. Only the object's own two keys are read, so a `say` inside a call's arguments is not the
 * answer.
 */
export const peekStep = (text: string): { calls: 'none' | 'some' | null; say: string | null } => {
  let calls: 'none' | 'some' | null = null;
  let say: string | null = null;
  let i = text.indexOf('{');
  if (i < 0) return { calls, say };
  i++;
  const skip = (): void => {
    while (i < text.length && SPACE.test(text[i]!)) i++;
  };
  for (;;) {
    skip();
    if (text[i] === ',') {
      i++;
      continue;
    }
    if (text[i] !== '"') break;
    const key = stringAt(text, i);
    if (key.end < 0) break;
    i = key.end;
    skip();
    if (text[i] !== ':') break;
    i++;
    skip();
    if (i >= text.length) break;
    if (key.value === 'calls' && calls === null) {
      if (text[i] !== '[') calls = 'none';
      else {
        let j = i + 1;
        while (j < text.length && SPACE.test(text[j]!)) j++;
        if (j < text.length) calls = text[j] === ']' ? 'none' : 'some';
      }
    }
    if (key.value === 'say' && text[i] === '"') {
      const said = stringAt(text, i);
      say = said.value;
      if (said.end < 0) break;
      i = said.end;
      continue;
    }
    const end = valueEnd(text, i);
    if (end < 0) break;
    i = end;
  }
  return { calls, say };
};

/**
 * The answer with every figure no evidence holds taken out, the sentence it stood in with it, and how many went.
 * Braces are not read: an id inside `{{ref:…}}` is not a figure.
 */
export const checkFigures = (answer: string, evidence: readonly number[]): { text: string; dropped: number } => {
  let dropped = 0;
  const kept = sentences(answer).filter((sentence) => {
    const bare = sentence.replace(/\{\{[^}]*\}\}/gu, ' ');
    for (const m of bare.matchAll(FIGURE)) {
      const value = valueOf(m[1] ?? '', m[2], m[3]);
      if (!Number.isFinite(value) || holds(value, evidence, m[3] !== undefined)) continue;
      dropped++;
      return false;
    }
    return true;
  });
  return { text: kept.join('').trim(), dropped };
};

/** `tasks#41`, the one form a link is drawn from. */
const QUALIFIED = /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u;
/** What a person may send with their words: a row, or a question in Decide, an agent's run or a vital sign by its id. */
const SENT = /^(?:[a-z][a-z0-9_]*#[1-9][0-9]*|(?:decide|run|sign):[A-Za-z0-9_.:-]{1,80})$/u;
/** The name a sent thing's read is kept under in the turn's reads, which no tool of the model's is called. */
const SENT_READ = 'sent';

/**
 * Every `{{ref:ID}}` made the `register#seq` a link is drawn from, through the host's own lookup, and every other brace
 * taken out: the answer is prose, and a brace the screen cannot draw would print as itself. `figures` names each row
 * linked, so the screen draws a link by the row's own name.
 */
/**
 * What `linked` has looked up so far in one answer, so an answer drawn a sentence at a time looks each id up once, links
 * at most `REFS_MOST` across the whole of it, and names each row once in `figures`.
 */
type Looked = { to: Map<string, string | null>; figures: ChatFigure[] };

const linked = async (said: string, tools: ChatTools, looked: Looked = { to: new Map(), figures: [] }): Promise<{ text: string; figures: ChatFigure[] }> => {
  /* AN ID AS THE RESULTS PRINT IT, `(tasks#3)` or bare, IS A LINK TOO: the included model copies an id the way it read
     it as often as it writes the brace it was asked for, and an id left as text is a code a person cannot press. */
  const answer = said
    /* A BRACE WRITTEN LOOSELY, `{{ref:obligations SG9}}` or `{{ ref: tasks#3 }}`, is read for the id it ends with. */
    .replace(/\{\{\s*ref\s*:\s*(?:[^}]*\s)?([^}\s]+)\s*\}\}/gu, '{{ref:$1}}')
    .replace(/\s*\(\s*([a-z][a-z0-9_]*#[1-9][0-9]*)\s*\)/gu, ' {{ref:$1}}')
    .replace(/(?<![{:\w#])([a-z][a-z0-9_]*#[1-9][0-9]*)(?![\w}])/gu, '{{ref:$1}}');
  const { to, figures } = looked;
  const asked = [...new Set([...answer.matchAll(/\{\{\s*ref:\s*([^}\s]+)\s*\}\}/gu)].map((m) => m[1] ?? ''))].filter(
    (id) => to.has(id) || to.size < REFS_MOST,
  );
  const cited: ChatFigure[] = [];
  for (const id of asked) {
    if (to.has(id)) {
      const known = figures.find((f) => f.ref === to.get(id));
      if (known !== undefined && !cited.includes(known)) cited.push(known);
      continue;
    }
    if (to.size >= REFS_MOST) continue;
    let at: { ref: string; label: string } | null = null;
    try {
      at = tools.ref ? await tools.ref(id) : QUALIFIED.test(id) ? { ref: id, label: '' } : null;
    } catch {
      at = null;
    }
    to.set(id, at?.ref ?? null);
    if (at !== null && at.label !== '') {
      const known = figures.find((f) => f.ref === at.ref) ?? { ref: at.ref, label: at.label };
      if (!figures.includes(known)) figures.push(known);
      if (!cited.includes(known)) cited.push(known);
    }
  }
  /* A ROW IS NAMED ONCE, BY ITS LINK. The screen draws a brace as the row's own name, so "Studio rent
     {{ref:obligations#16}}" printed the name twice, and "Studio rent is late (obligations#16)" printed it at the end. Where
     the row's name stands in the answer, the first place it stands becomes the link and the brace goes; where it does not,
     the brace stays where it was written. */
  let named = answer;
  for (const id of asked) {
    const at = to.get(id);
    const label = figures.find((f) => f.ref === at)?.label;
    if (label === undefined || label.trim() === '') continue;
    const escape = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const brace = new RegExp(`\\s*\\(?\\s*\\{\\{\\s*ref:\\s*${escape(id)}\\s*\\}\\}\\s*\\)?`, 'gu');
    const bare = named.replace(brace, ' ');
    const said = new RegExp(`(["“'‘]?)${escape(label)}(["”'’]?)`, 'iu');
    if (!said.test(bare.replace(/\{\{[^}]*\}\}/gu, (m) => ' '.repeat(m.length)))) continue;
    named = bare.replace(said, `{{ref:${id}}}`);
  }
  const text = named
    .replace(/\{\{\s*ref:\s*([^}\s]+)\s*\}\}/gu, (_, id: string) => {
      const at = to.get(id);
      return at ? `{{ref:${at}}}` : '';
    })
    .replace(/\{\{(?!ref:[a-z][a-z0-9_]*#[1-9][0-9]*\}\})[^}]*\}\}/gu, '')
    /* AND THE PUNCTUATION A NAME OR A BRACE LEFT BEHIND WHEN IT MOVED OR WENT: "two of them:, " and ", and, ". */
    .replace(/([:,;])\s*,/gu, '$1')
    /* A LINK THE MODEL BRACKETED, "({{ref:obligations#2}}) is late", is drawn as the name it is, without the brackets. */
    .replace(/\(\s*(\{\{ref:[a-z][a-z0-9_]*#[1-9][0-9]*\}\})\s*\)/gu, '$1')
    .replace(/^([ \t]*-)[ \t]*[:,][ \t]*/gmu, '$1 ')
    .replace(/\band,\s/gu, 'and ')
    .replace(/\(\s*\)/gu, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([.,;:!?])/gu, '$1')
    .trim();
  return { text, figures: cited };
};

/* ── calc ────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** `+ - * /` and brackets over decimal numbers, worked out in code. `null` for anything else. */
export const calc = (expr: string): number | null => {
  const src = expr.replace(/(\d),(?=\d{3}\b)/gu, '$1').replace(/[\s ]/gu, '');
  if (src === '' || src.length > 200 || !/^[0-9+\-*/().]+$/u.test(src)) return null;
  let at = 0;
  const peek = (): string => src.charAt(at);
  const sum = (): number => {
    let v = product();
    while (peek() === '+' || peek() === '-') v = src.charAt(at++) === '+' ? v + product() : v - product();
    return v;
  };
  const product = (): number => {
    let v = unary();
    while (peek() === '*' || peek() === '/') v = src.charAt(at++) === '*' ? v * unary() : v / unary();
    return v;
  };
  const unary = (): number => (peek() === '-' ? (at++, -unary()) : peek() === '+' ? (at++, unary()) : atom());
  const atom = (): number => {
    if (peek() === '(') {
      at++;
      const v = sum();
      if (peek() !== ')') throw new Error('bracket');
      at++;
      return v;
    }
    const m = /^\d+(?:\.\d+)?|^\.\d+/u.exec(src.slice(at));
    if (!m) throw new Error('number');
    at += m[0].length;
    return Number(m[0]);
  };
  try {
    const v = sum();
    return at === src.length && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  } catch {
    return null;
  }
};

/* ── the prompt ──────────────────────────────────────────────────────────────────────────────────────────────────── */

type Turn = { role: 'you' | 'slash'; text: string; actions?: string };
type Done = { tool: string; args: Record<string, unknown>; text: string };

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

const cut = (text: string, most: number): string => (text.length <= most ? text : `${text.slice(0, most)}… (cut here)`);

/** A day as a person and as a field both say it: `Thursday 3 September 2026 (2026-09-03)`. */
const dayOf = (ms: number): string => {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} (${d.toISOString().slice(0, 10)})`;
};

/**
 * What a turn did, as the next turn's model reads it: each action's title and the row it made or changed, so "mark that
 * done" after an add names the row in one step. MEASURED: without it the model searched for the task it had just added,
 * opened it, and only then changed it, three steps for a word.
 */
const actionsSaid = (actions: readonly ChatAction[]): string => {
  const said = actions.map((a) => {
    const row = /^\/r\/([^/]+)\/([1-9][0-9]*)$/u.exec(a.href ?? '');
    const at = row ? ` (${decodeURIComponent(row[1]!)}#${row[2]})` : '';
    return a.kind === 'done' ? `did: ${a.title}${at}` : `waiting for their yes: ${a.title}`;
  });
  return said.length === 0 ? '' : ` [${said.join('; ')}]`;
};

/** The user message of one step: the day, where they are, their lists, the tools, the conversation, and what this turn has read. */
const promptOf = (a: {
  now: number;
  page: ChatInput['page'];
  outside: string | null;
  lists: string;
  tools: readonly ChatTool[];
  before: readonly Turn[];
  message: string;
  done: readonly Done[];
  last: boolean;
  short: number;
  sent?: readonly string[];
}): string => {
  const lines: string[] = [`Today is ${dayOf(a.now)}. Tomorrow is ${dayOf(a.now + 86_400_000)}.`];
  if (a.page !== undefined) {
    const where = [a.page.title, a.page.path].filter((s) => typeof s === 'string' && s.trim() !== '').join(', ');
    lines.push(`They are looking at ${where}${a.page.row ? `, on ${a.page.row}` : ''}. "This" or "here" means that.`);
  }
  if (a.outside !== null) lines.push(`This turn read ${a.outside}, so anything you do now waits for their yes.`);
  if (a.lists !== '') lines.push('', `Their lists, as name (id, rows): ${a.lists}.`);
  if (!a.last) {
    lines.push('', 'Tools, as name(args): what it does.');
    for (const t of a.tools) lines.push(`${t.name}(${t.args}): ${t.about}`);
  }
  if (a.before.length > 0) {
    lines.push('', 'The conversation so far:');
    for (const t of a.before) lines.push(`${t.role === 'you' ? 'They said' : 'You said'}: ${cut(t.text, TURN_CHARS)}${t.actions ?? ''}`);
  }
  lines.push('', `Now they say: ${a.message}`);
  if (a.sent !== undefined && a.sent.length > 0) lines.push(`They sent you these with it, read below: ${a.sent.join(', ')}.`);
  if (a.done.length > 0) {
    lines.push('', 'What your calls answered this turn:');
    a.done.forEach((d, i) => {
      const older = i < a.done.length - a.short;
      lines.push(`[${i + 1}] ${d.tool} ${JSON.stringify(d.args)}`, cut(d.text, older ? RESULT_SHORT : RESULT_CHARS), '');
    });
  }
  lines.push(
    a.last
      ? 'Answer them now from what you have, in "say". If it does not answer them, say what you found and what is missing.'
      : a.done.length === 0
        ? 'Call the tools that answer this, or answer with "calls": [] if it needs nothing from the record.'
        : 'Answer with "calls": [] if this is enough. Otherwise call again.',
  );
  return lines.join('\n');
};

/**
 * The first user message of a deep turn: what `promptOf` says, less the tools (the provider is handed those) and with
 * more of each result. The system text says none of this, so it stays one cached prefix with the tools.
 */
const deepPromptOf = (a: {
  now: number;
  page: ChatInput['page'];
  outside: string | null;
  lists: string;
  before: readonly Turn[];
  message: string;
  done: readonly Done[];
  sent: readonly string[];
  rethink: boolean;
}): string => {
  const lines: string[] = [`Today is ${dayOf(a.now)}. Tomorrow is ${dayOf(a.now + 86_400_000)}.`];
  if (a.page !== undefined) {
    const where = [a.page.title, a.page.path].filter((s) => typeof s === 'string' && s.trim() !== '').join(', ');
    lines.push(`They are looking at ${where}${a.page.row ? `, on ${a.page.row}` : ''}. "This" or "here" means that.`);
  }
  if (a.outside !== null) lines.push(`This turn read ${a.outside}, so anything you do now waits for their yes.`);
  if (a.lists !== '') lines.push('', `Their lists, as name (id, rows): ${a.lists}.`);
  if (a.before.length > 0) {
    lines.push('', 'The conversation so far:');
    for (const t of a.before) lines.push(`${t.role === 'you' ? 'They said' : 'You said'}: ${cut(t.text, DEEP_TURN_CHARS)}${t.actions ?? ''}`);
  }
  lines.push('', `Now they say: ${a.message}`);
  if (a.rethink) lines.push('They asked you to think harder about this than the answer they had: look again, more carefully.');
  if (a.sent.length > 0) lines.push(`They sent you these with it, read below: ${a.sent.join(', ')}.`);
  if (a.done.length > 0) {
    lines.push('', 'Already read for this turn:');
    a.done.forEach((d, i) => lines.push(`[${i + 1}] ${d.tool} ${JSON.stringify(d.args)}`, cut(d.text, DEEP_RESULT_CHARS), ''));
  }
  return lines.join('\n');
};

/** Dollars as a person reads a cap: `$10`, `$12.50`. */
const dollars = (cents: number): string => `$${cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)}`;

/** What a deep call's throw says to the person, by the status the provider answered where it answered one. */
const deepFailed = (e: unknown): string => {
  const status = typeof e === 'object' && e !== null ? (e as { refused?: unknown }).refused : undefined;
  if (status === 401 || status === 403) return 'Anthropic refused your key for Deep. Check the key in Keys, or pick another in Settings › Agents.';
  if (status === 404) return 'Anthropic does not know the model Deep asked for on your key.';
  if (status === 400) return 'Anthropic could not read what Deep sent. Try asking again.';
  if (typeof e === 'object' && e !== null && (e as { sent?: unknown }).sent === false) return e instanceof Error ? e.message : 'Your key did not open for Deep.';
  return "Deep couldn't reach Anthropic just now. Try again in a moment.";
};

/** The sentence when Deep has no key here: the two ways it can answer. */
const NO_DEEP_KEY = 'Deep answers on your own Anthropic key, and none is set. Add one in Settings › Agents, or send this to Claude on your Mac.';

/* ── the answer as it streams ────────────────────────────────────────────────────────────────────────────────────── */

/** Where the first whole sentence of `text` ends, its space after it included, or -1 while it is still being written. */
const sentenceEnd = (text: string): number => {
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const ends = c === '\n' || (/[.!?]/u.test(c) && i + 1 < text.length && SPACE.test(text[i + 1]!));
    if (!ends) continue;
    let end = i + 1;
    while (end < text.length && SPACE.test(text[end]!)) end++;
    return end;
  }
  return -1;
};

/**
 * The answer, put on the screen a sentence at a time as the model writes it, each sentence held until it ends and then
 * held to the same two rules the whole answer was: its figures checked against what this turn read (`checkFigures`), and
 * its ids made links (`linked`). NOTHING UNCHECKED GOES OUT: the sentence still being written waits, and a sentence a
 * figure fails is dropped with it, as it was from the whole answer.
 *
 * `feed` takes the answer's words so far, as often as more arrive, and `end` once they are all there. `evidence` is read
 * when each sentence is checked, so it must be whole before the answering step is asked, which it is: every call of the
 * turn has run by then.
 */
const flowing = (evidence: readonly number[], tools: ChatTools, emit: (event: ChatEvent) => void) => {
  let taken = 0;
  let pending = '';
  /* THE SPACE AFTER THE LAST SENTENCE OUT goes out before the next, so a dropped sentence takes its own with it and an
     answer never ends on a space. */
  let gap = '';
  let out = '';
  let dropped = 0;
  const looked: Looked = { to: new Map(), figures: [] };
  let queue: Promise<void> = Promise.resolve();

  const send = async (piece: string): Promise<void> => {
    const core = piece.trim();
    if (core === '') {
      if (out !== '') gap += piece;
      return;
    }
    const lead = piece.slice(0, piece.length - piece.trimStart().length);
    const trail = piece.slice(piece.trimEnd().length);
    const checked = checkFigures(core, evidence);
    if (checked.dropped > 0) {
      dropped += checked.dropped;
      return;
    }
    const drawn = await linked(checked.text, tools, looked);
    if (drawn.text === '') return;
    const text = `${out === '' ? '' : `${gap}${lead}`}${drawn.text}`;
    gap = trail;
    out += text;
    emit({ type: 'delta', text, ...(drawn.figures.length === 0 ? {} : { figures: drawn.figures }) });
  };
  const later = (piece: string): void => {
    queue = queue.then(() => send(piece)).catch(() => undefined);
  };

  return {
    feed(said: string, end: boolean): void {
      if (said.length > taken) {
        pending += said.slice(taken);
        taken = said.length;
      }
      for (let at = sentenceEnd(pending); at > 0; at = sentenceEnd(pending)) {
        later(pending.slice(0, at));
        pending = pending.slice(at);
      }
      if (end && pending !== '') {
        later(pending);
        pending = '';
      }
    },
    /** Every sentence fed so far, out. */
    async done(): Promise<void> {
      for (let q = queue; ; q = queue) {
        await q;
        if (q === queue) return;
      }
    },
    shown: (): string => out,
    dropped: (): number => dropped,
    cited: (): ChatFigure[] => looked.figures,
  };
};

/* ── the engine ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export type Chat = {
  chat(input: ChatInput, ctx: CallContext, tools: ChatTools, emit: (event: ChatEvent) => void, inference?: Inference, deep?: Deep): Promise<void>;
  act(id: string, accept: boolean, ctx: CallContext, tools: Pick<ChatTools, 'apply'>): Promise<Result<ChatActed>>;
  thread(id: string, ctx: CallContext): Result<ChatThread>;
  threads(ctx: CallContext): Result<ChatThreads>;
};

/** The conversations `threads` lists, newest first. */
const THREADS_LISTED = 30;
/** A conversation's title: its first words, this long at most. */
const TITLE_CHARS = 80;

const ASKED = { purpose: 'ask', spends: 'person' } as const;
const STEPPED = { purpose: 'ask', spends: 'none' } as const;

export const chats = (core: Core): Chat => {
  const { sql, clock } = core;
  let opened = false;
  const open = (): void => {
    if (opened) return;
    openChat(sql);
    opened = true;
  };
  const now = (): string => new Date(clock.now()).toISOString();

  /** The thread a message continues, when it is this person's; else a new one. */
  const threadFor = (asked: string | undefined, person: string): { id: string; fresh: boolean } => {
    if (typeof asked === 'string' && asked !== '') {
      const row = sql.one<{ person: string }>('SELECT person FROM slash_thread WHERE id = ?', asked);
      if (row !== undefined && row.person === person) return { id: asked, fresh: false };
    }
    const id = ulid(clock.now());
    sql.exec('INSERT INTO slash_thread (id, person, ts, updated) VALUES (?, ?, ?, ?)', id, person, now(), now());
    return { id, fresh: true };
  };

  const turnsOf = (thread: string, most: number): Turn[] =>
    sql
      .all<{ role: 'you' | 'slash'; text: string; actions: string }>('SELECT role, text, actions FROM slash_turn WHERE thread = ? ORDER BY n DESC LIMIT ?', thread, most)
      .reverse()
      .map((t) => {
        let acted: ChatAction[] = [];
        try {
          const parsed: unknown = JSON.parse(t.actions);
          acted = Array.isArray(parsed) ? (parsed.filter(isRecord) as unknown as ChatAction[]) : [];
        } catch {
          acted = [];
        }
        return { role: t.role, text: t.text, actions: actionsSaid(acted) };
      });

  const addTurn = (thread: string, role: 'you' | 'slash', text: string, actions: readonly ChatAction[] = [], mentions: readonly ChatMention[] = []): void => {
    const n = (sql.one<{ n: number | null }>('SELECT MAX(n) AS n FROM slash_turn WHERE thread = ?', thread)?.n ?? 0) + 1;
    /* A MODEL'S U+0000 IS DROPPED, NOT STORED: the port refuses a text holding one (`guard`), and what the model said is
       ours to keep, where what a person typed is refused at the door instead. */
    const kept = role === 'slash' ? text.replaceAll('\u0000', '') : text;
    /* A QUESTION'S MENTIONS GO WHERE AN ANSWER'S ACTIONS GO, the same column and no new one: as an object, which everything
       reading actions takes for none. */
    sql.exec('INSERT INTO slash_turn (thread, n, role, text, actions, ts) VALUES (?, ?, ?, ?, ?, ?)', thread, n, role, kept, JSON.stringify(mentions.length > 0 ? { mentions } : actions), now());
    sql.exec('DELETE FROM slash_turn WHERE thread = ? AND n <= ?', thread, n - TURNS_KEPT);
    sql.exec('UPDATE slash_thread SET updated = ? WHERE id = ?', now(), thread);
  };

  const left = (): number | null => {
    const s = core.settings();
    return s.tier === 'a' ? Math.max(0, s.ask_cap - core.asksUsed()) : null;
  };

  /** The thread's last question and the turns before it, for "Think harder", or `null` where it has none. */
  const askedLast = (thread: string, most: number): { message: string; before: Turn[] } | null => {
    const all = turnsOf(thread, TURNS_KEPT);
    for (let i = all.length - 1; i >= 0; i--) if (all[i]!.role === 'you') return { message: all[i]!.text, before: all.slice(Math.max(0, i - most), i) };
    return null;
  };

  /**
   * Why Deep cannot answer now, or `null` where it can: no key set, a key the host could not open for this asker, the cap
   * at zero, or the month's spend at the cap. Read on each turn, so a cap raised a second ago counts.
   */
  const deepNo = (deep: Deep | undefined): string | null => {
    if (deep === undefined) return NO_DEEP_KEY;
    if ('refused' in deep) return deep.refused;
    const cap = deepSetupOf(sql).cap_cents;
    if (cap <= 0) return 'Deep is off, since its monthly cap is zero. Raise it in Settings › Agents, or send this to Claude on your Mac.';
    if (deepSpent(sql, core.monthStart()) >= cap * 10_000)
      return `Deep has spent this month's cap of ${dollars(cap)} on your key. Raise it in Settings › Agents, or send this to Claude on your Mac.`;
    return null;
  };

  const chat: Chat['chat'] = async (input, ctx, tools, emit, inference, deep) => {
    open();
    const person = who(ctx);
    const rethink = input.rethink === true;
    const mode: ChatMode = rethink ? 'deep' : input.mode === 'deep' || input.mode === 'auto' ? input.mode : 'quick';
    /* A PLAIN ANSWER WITH NO MODEL ASKED: one line, the hand-off where it is Deep that cannot answer, and the end. */
    const plain = (text: string, mac: boolean): void => {
      emit({ type: 'delta', text });
      if (mac) emit({ type: 'route', to: 'mac' });
      emit({ type: 'done', spent: { asks: 0, left: left() } });
    };

    /* "THINK HARDER" ASKS THE THREAD'S OWN LAST QUESTION AGAIN, in a thread of this person's and nobody else's. */
    let message: string;
    let again: { message: string; before: Turn[] } | null = null;
    if (rethink) {
      const owned = typeof input.thread === 'string' ? sql.one<{ person: string }>('SELECT person FROM slash_thread WHERE id = ?', input.thread) : undefined;
      again = owned !== undefined && owned.person === person ? askedLast(input.thread!, DEEP_TURNS_READ) : null;
      if (again === null) {
        emit({ type: 'error', text: 'There is no question in this conversation to think harder about.' });
        emit({ type: 'done', spent: { asks: 0, left: left() } });
        return;
      }
      message = again.message;
    } else message = firstBytes((typeof input.message === 'string' ? input.message : '').trim(), MESSAGE_BYTES);
    if (message === '') {
      emit({ type: 'error', text: 'Say something first.' });
      emit({ type: 'done', spent: { asks: 0, left: left() } });
      return;
    }

    const why = deepNo(deep);
    const brain: DeepInference | null = why === null && deep !== undefined && 'inference' in deep ? deep.inference : null;
    if (mode === 'deep' && brain === null) {
      plain(why ?? NO_DEEP_KEY, true);
      return;
    }

    /* THE MONTH'S CHECK AND THE HOLD, WITH NO `await` BETWEEN THEM, for `read`'s reason (`propose.ts`). Deep spends none of
       the included month: it is his key and his cap. `auto` goes deep at once for an ask that wants a plan or a why, and for
       one quick could not take because its month is spent. */
    const s = core.settings();
    let goDeep = mode === 'deep' || (mode === 'auto' && brain !== null && wantsDeep(message));
    const quickOut = s.tier === 'a' && core.asksUsed() >= s.ask_cap;
    const quickClosed = s.tier === 'b' && inference === undefined;
    if (!goDeep && mode === 'auto' && brain !== null && (quickOut || quickClosed)) goDeep = true;
    if (!goDeep && quickOut) {
      core.turnedAway('read', s.tier);
      emit({ type: 'error', text: `Slash is out of asks until ${core.resets().slice(0, 10)}. Add your own key in Settings, or wait.` });
      if (mode === 'auto') emit({ type: 'route', to: 'mac' });
      emit({ type: 'done', spent: { asks: 0, left: 0 } });
      return;
    }
    if (!goDeep && quickClosed) {
      emit({ type: 'error', text: 'Your key is not open in this session. Open the keychain, or switch Slash to the included model.' });
      emit({ type: 'done', spent: { asks: 0, left: null } });
      return;
    }
    const model = s.model ?? PROMPTS.chat.model;
    const holds: string[] = goDeep ? [] : [core.reserve('read', s.tier, model, ASKED)];

    const thread = rethink ? { id: input.thread!, fresh: false } : threadFor(input.thread, person);
    emit({ type: 'thread', id: thread.id });
    const before = rethink ? again!.before.slice(-TURNS_READ) : thread.fresh ? [] : turnsOf(thread.id, TURNS_READ);
    const beforeDeep = rethink ? again!.before : thread.fresh ? [] : turnsOf(thread.id, DEEP_TURNS_READ);
    if (!rethink) addTurn(thread.id, 'you', message, [], input.mentions);

    const list = [...tools.list.filter((t) => t.name !== CALC.name), CALC];
    /* THE LISTS ARE READ WHILE THE PREFETCH RUNS, and awaited before the first model call reads them. */
    const listing = (async (): Promise<string> => {
      try {
        return tools.context ? cut(await tools.context(), LISTS_CHARS) : '';
      } catch {
        return '';
      }
    })();
    let lists = '';
    const named = new Map(list.map((t) => [t.name, t]));
    const run: ChatRun = { askOnly: false, asked: DOING.test(message), said: message, outside: null };
    const done: Done[] = [];
    const actions: ChatAction[] = [];
    /* WHAT A FIGURE MAY STAND IN BESIDE THE RESULTS: their words, the conversation, the lists' counts, today and tomorrow. */
    const figures: number[] = [
      ...numbersIn(message),
      ...beforeDeep.flatMap((t) => numbersIn(t.text)),
      ...numbersIn(dayOf(clock.now())),
      ...numbersIn(dayOf(clock.now() + 86_400_000)),
    ];
    let reached = false;
    let calls = 0;
    let answer = null as string | null;
    let failed = null as string | null;
    let mac = false as boolean;

    /** A tool call the engine runs, by the name the model gave it. */
    type Asked = { name: string; args: Record<string, unknown> };
    const runOne = async (c: Asked): Promise<ChatRan> => {
      if (c.name === SENT_READ) {
        const ref = typeof c.args['ref'] === 'string' ? c.args['ref'] : '';
        try {
          if (tools.attached) return await tools.attached(ref);
          if (QUALIFIED.test(ref) && named.has('open')) return await tools.call('open', { id: ref }, { ...run });
          return { text: `${ref} could not be read here.` };
        } catch (e) {
          return { text: `${ref} could not be read just now: ${e instanceof Error ? e.message : String(e)}.` };
        }
      }
      const tool = named.get(c.name);
      if (tool === undefined) return { text: `There is no tool called ${c.name}. The tools are ${list.map((t) => t.name).join(', ')}.` };
      if (tool.name === CALC.name) {
        const v = calc(typeof c.args['expr'] === 'string' ? c.args['expr'] : '');
        return v === null
          ? { text: 'calc takes numbers with + - * / and brackets, such as "1250.50 + 300".', step: 'Working it out' }
          : { text: `= ${String(v)}`, figures: [v], step: 'Working it out' };
      }
      try {
        return await tools.call(c.name, c.args, { ...run });
      } catch (e) {
        return { text: `${c.name} could not be read just now: ${e instanceof Error ? e.message : String(e)}.` };
      }
    };

    /* THE CALLS OF ONE STEP RUN TOGETHER, reads at once and writes one after another in the order asked, and are told in
       that order, so a step that asks for cash and runway waits for the slower of the two and not for both. What each
       answered comes back in the order asked, for a deep step to hand each result to the call that asked it. */
    const runCalls = async (asked: readonly Asked[]): Promise<ChatRan[]> => {
      const reads = asked.map((c) => (named.get(c.name)?.writes === true ? null : runOne(c)));
      const outs: ChatRan[] = [];
      for (const [i, c] of asked.entries()) outs.push(await (reads[i] ?? runOne(c)));
      for (const [i, c] of asked.entries()) {
        const out = outs[i]!;
        const tool = named.get(c.name);
        if (tool !== undefined || out.step !== undefined) emit({ type: 'step', text: out.step ?? tool?.about.split(/[.:,]/u)[0] ?? c.name });
        /* OUTSIDE TEXT DROPS THE REST OF THE TURN TO ASKING, whatever the model reads next (the record's own rule). */
        if (out.outside) {
          run.outside ??= out.outside;
          run.askOnly = true;
        }
        figures.push(...numbersIn(out.text), ...(out.figures ?? []));
        done.push({ tool: c.name, args: c.args, text: out.text });
        if (out.action !== undefined) {
          const { op, ...shown } = out.action;
          const action: ChatAction = { id: ulid(clock.now()), ...shown };
          if (action.kind === 'ask')
            sql.exec(
              'INSERT INTO slash_act (id, thread, person, title, op, ts) VALUES (?, ?, ?, ?, ?, ?)',
              action.id,
              thread.id,
              person,
              action.title,
              JSON.stringify(op ?? {}),
              now(),
            );
          actions.push(action);
          emit({ type: 'action', ...action });
        }
        if (out.navigate !== undefined) emit({ type: 'navigate', href: out.navigate.href, label: out.navigate.label });
      }
      return outs;
    };

    const flow = flowing(figures, tools, emit);

    /* THE ROWS THEY SENT, read through the tools before any model is asked, as the asker, so a row they may not read is
       refused in the tool's own words. Quick reads a few, to stay under its template's cap; deep reads them all. */
    const sent = [...new Set((input.attach ?? []).filter((r): r is string => typeof r === 'string' && SENT.test(r)))].slice(0, goDeep || mode === 'auto' ? ATTACH_MOST : 3);

    /**
     * A deep turn, on the owner's key: the model is handed the tools themselves and the turn's reads so far, calls what it
     * wants, and its answer streams through the same check every quick answer passes (`flow`). Each call is a row on the
     * ledger under his key's tier and a line of Deep's spend, and the month's cap is read before each one.
     */
    const deepLoop = async (brainOf: DeepInference, deepModel: string): Promise<void> => {
      emit({ type: 'brain', depth: 'deep', model: deepModel });
      const offered = list.map(deepToolOf);
      const messages: DeepMessage[] = [
        {
          role: 'user',
          content: deepPromptOf({ now: clock.now(), page: input.page, outside: run.outside, lists, before: beforeDeep, message, done, sent, rethink }),
        },
      ];
      const cap = deepSetupOf(sql).cap_cents * 10_000;
      let used = 0;
      /* WHAT HAS GONE OUT AS THE ANSWER, across steps, which `flow.feed` takes whole each time. */
      let spoken = '';
      for (let step = 0; step < DEEP_STEPS_MOST; step++) {
        const last = step === DEEP_STEPS_MOST - 1 || used >= DEEP_CALLS_MOST;
        if (deepSpent(sql, core.monthStart()) >= cap) {
          failed = `Deep reached this month's cap on your key partway through, so it stopped there. Raise the cap in Settings › Agents.`;
          mac = true;
          return;
        }
        const id = core.reserve('read', 'b', deepModel, step === 0 ? ASKED : STEPPED);
        holds.push(id);
        /* THE WORDS OF A STEP ARE HELD until they are clearly an answer: the step ends without a call, or they run past a
           sentence or two. Words the model wrote before calling a tool are its own note, said as a step and not the answer. */
        let words = '';
        let released = false;
        const base = spoken === '' ? '' : `${spoken}\n\n`;
        const started = clock.now();
        let reply: Awaited<ReturnType<DeepInference['turn']>>;
        try {
          reply = await brainOf.turn(
            { model: deepModel, system: DEEP_SYSTEM, tools: offered, messages, maxTokens: DEEP_MAX_TOKENS, effort: deepModel === DEEP_HARDER ? 'high' : 'medium', ...(last ? { toolChoice: 'none' as const } : {}) },
            {
              text: (piece) => {
                words += piece;
                if (!released && words.length >= 240) released = true;
                if (released) flow.feed(`${base}${words}`, false);
              },
              tool: () => {
                if (released || words.trim() === '') return;
                emit({ type: 'step', text: cut(words.trim().split(/(?<=[.!?])\s/u)[0] ?? words.trim(), 120).replace(/ \(cut here\)$/u, '') });
                words = '';
              },
            },
          );
        } catch (e) {
          const answered = typeof e === 'object' && e !== null && (e as { answered?: unknown }).answered === true;
          const usage = answered ? (e as { usage?: { in: number; out: number } }).usage : undefined;
          if (answered)
            core.account({ id, kind: 'read', tier: 'b', model: deepModel, usage: usage ?? { in: 0, out: 0 }, ms: clock.now() - started, status: 'error', code: 'UNREACHABLE', purpose: 'ask', spends: step === 0 ? 'person' : 'none', served: true });
          failed = deepFailed(e);
          return;
        }
        const u = reply.usage;
        core.account({
          id,
          kind: 'read',
          tier: 'b',
          model: reply.model,
          usage: { in: u.in + u.cacheRead + u.cacheWrite, out: u.out },
          ms: clock.now() - started,
          status: 'ok',
          ...(step === 0 ? { question: message } : {}),
          read: done.map((d) => ({ register: `@${d.tool}`, rows: 1, predicate: 'tool' })),
          ...(step === 0 ? ASKED : STEPPED),
          served: true,
        });
        deepSpend(sql, { id, ts: now(), model: reply.model, usage: u });

        if (reply.stop === 'refusal') {
          failed = 'Deep declined to answer that one.';
          return;
        }
        const text = reply.content
          .filter((b): b is DeepBlock & { text: string } => b.type === 'text' && typeof b['text'] === 'string')
          .map((b) => b.text)
          .join('');
        const uses = reply.content.filter((b) => b.type === 'tool_use' && typeof b['id'] === 'string' && typeof b['name'] === 'string');
        if (uses.length === 0 || last) {
          /* THE ANSWER: whatever streamed of it, finished from the whole text, which is the same words. */
          spoken = `${base}${released ? text : text.trim()}`;
          answer = spoken.trim();
          flow.feed(spoken, true);
          return;
        }
        if (released) spoken = `${base}${text}`;
        messages.push({ role: 'assistant', content: reply.content });
        const room = Math.max(0, DEEP_CALLS_MOST - used);
        const asked = uses.slice(0, room).map((b) => ({ name: String(b['name']), args: isRecord(b['input']) ? b['input'] : {} }));
        used += asked.length;
        const outs = await runCalls(asked);
        const results: DeepBlock[] = uses.map((b, i) =>
          i < outs.length
            ? { type: 'tool_result', tool_use_id: String(b['id']), content: cut(outs[i]!.text, DEEP_RESULT_CHARS) }
            : { type: 'tool_result', tool_use_id: String(b['id']), content: 'Not run: this turn has used its tool calls.', is_error: true },
        );
        if (step + 1 === DEEP_STEPS_MOST - 1 || used >= DEEP_CALLS_MOST)
          results.push({ type: 'text', text: 'Answer them now from what you have. If it does not answer them, say what you found and what is missing.' });
        messages.push({ role: 'user', content: results });
      }
    };

    try {
      /* THE READS THE MESSAGE PLAINLY WANTS, BEFORE THE FIRST MODEL CALL, so "how much cash do I have" is one call and not
         two. Reads only, never a tool that writes, and they spend none of the turn's calls: they are the host's guess,
         and the model may still call what it wants. */
      const first = (tools.prefetch?.(message) ?? []).filter((c) => named.has(c.tool) && named.get(c.tool)?.writes !== true).slice(0, 2);
      if (first.length > 0) await runCalls(first.map((c) => ({ name: c.tool, args: { ...c.args } })));
      if (sent.length > 0) await runCalls(sent.map((ref) => ({ name: SENT_READ, args: { ref } })));
      lists = await listing;
      figures.push(...numbersIn(lists));

      if (goDeep) {
        if (mode === 'auto') emit({ type: 'step', text: 'Thinking harder…' });
        await deepLoop(brain!, rethink ? DEEP_HARDER : DEEP_MODEL);
      } else {
        emit({ type: 'brain', depth: 'quick' });
        /* `auto` HANDS A TURN QUICK CANNOT FINISH TO DEEP: one that would have to answer because its steps or calls ran out,
           or whose model failed, before any word of it was shown. */
        let handOff = false;
        for (let step = 0; step < STEPS_MOST && answer === null; step++) {
          const last = step === STEPS_MOST - 1 || calls >= CALLS_MOST;
          if (last && mode === 'auto') {
            if (brain !== null) {
              handOff = true;
              break;
            }
            mac = true;
          }
          /* FITTED UNDER THE TEMPLATE'S CAP, the conversation's oldest turns first and then this turn's older results, so a
             result the model is about to read is never the part that goes. */
          let kept = [...before];
          let short = done.length;
          const prompt = (): string =>
            promptOf({ now: clock.now(), page: input.page, outside: run.outside, lists, tools: list, before: kept, message, done, last, short, sent });
          let text = prompt();
          const room = PROMPTS.chat.capIn - tokens(PROMPTS.chat.system) - 100;
          while (tokens(text) > room && kept.length > 0) {
            kept = kept.slice(1);
            text = prompt();
          }
          while (tokens(text) > room && short > 1) {
            short--;
            text = prompt();
          }

          const id = step === 0 ? holds[0]! : core.reserve('read', s.tier, model, STEPPED);
          if (step > 0) holds.push(id);
          /* THE LAST STEP CAN ONLY ANSWER: its schema has no calls, so a model that would have called again says what it has,
             where before it called again, the calls were dropped and the person was told nothing was found. */
          /* THE ANSWER STREAMS AS IT IS WRITTEN, once the step says it calls nothing (the last step always answers), a
             checked sentence at a time (`flow`). A step that calls is read whole, as before. */
          const ran = await core.run({
            id: 'chat',
            slots: { '%TRANSCRIPT%': text },
            inference,
            model: s.model ?? undefined,
            ...(last ? { schema: CHAT_ANSWER_SCHEMA } : {}),
            onText: (sofar) => {
              const seen = peekStep(sofar);
              if (seen.say !== null && (last || seen.calls === 'none')) flow.feed(seen.say, false);
            },
          });
          reached ||= ran.served;
          core.account({
            id,
            kind: 'read',
            tier: s.tier,
            model: ran.model,
            usage: ran.usage,
            ms: ran.ms,
            status: ran.out.ok ? 'ok' : 'error',
            code: ran.out.ok ? undefined : codeOf(ran.out),
            ...(step === 0 ? { question: message } : {}),
            read: done.map((d) => ({ register: `@${d.tool}`, rows: 1, predicate: 'tool' })),
            ...(step === 0 ? ASKED : STEPPED),
            served: ran.served,
            candidate: ran.candidate,
            raw: ran.raw,
          });
          if (!ran.out.ok) {
            if (mode === 'auto' && brain !== null && flow.shown() === '') {
              handOff = true;
              break;
            }
            failed = codeOf(ran.out) === 'UNREACHABLE' ? "Slash couldn't reach its model just now. Try again in a moment." : "Slash's model answered in a shape it could not read. Try asking again.";
            if (mode === 'auto') mac = true;
            break;
          }

          const spoken = typeof ran.out.value['say'] === 'string' ? ran.out.value['say'] : '';
          const said = spoken.trim();
          const wanted = (Array.isArray(ran.out.value['calls']) ? ran.out.value['calls'] : []).filter(isRecord).slice(0, 3);
          if (wanted.length === 0 || last) {
            answer = said;
            /* AS IT WAS WRITTEN AND NOT TRIMMED, so it lines up with what streamed of it. */
            flow.feed(spoken, true);
            break;
          }

          const asked = wanted.slice(0, Math.max(0, CALLS_MOST - calls)).map((call) => ({
            name: typeof call['tool'] === 'string' ? call['tool'] : '',
            args: isRecord(call['args']) ? call['args'] : {},
          }));
          calls += asked.length;
          await runCalls(asked);
        }
        if (handOff) {
          emit({ type: 'step', text: 'Thinking harder…' });
          await deepLoop(brain!, DEEP_MODEL);
        } else if (mode === 'auto' && wantsDeep(message)) mac = true;
      }
    } catch (e) {
      failed = `Slash stopped partway: ${e instanceof Error ? e.message : String(e)}.`;
    } finally {
      for (const id of holds) core.release(id);
    }

    /* WHAT STREAMED WAS FINISHED FROM THE ANSWER AS IT WAS READ WHOLE, which is the same words, so the last sentence that
       had no end yet went out then; an answer that did not stream (its calls were said after its words) went out the same
       way, all at once. Every sentence is out once the flow is done. */
    await flow.done();
    let text = flow.shown();
    if (answer !== null && answer !== '') {
      if (flow.dropped() > 0) {
        const note =
          text === ''
            ? "I found something, but I couldn't check its figures against the record, so I've left them out. Ask me to look again."
            : " (I left out a figure I couldn't check.)";
        emit({ type: 'delta', text: note });
        text += note;
      }
    } else if (failed === null && text === '') {
      text = actions.length > 0 ? 'Done.' : "I couldn't find that in the record.";
      emit({ type: 'delta', text });
    }

    if (failed !== null) emit({ type: 'error', text: failed });
    addTurn(thread.id, 'slash', text !== '' ? text : (failed ?? ''), actions);
    /* AND WHERE DEEP WAS WANTED AND COULD NOT ANSWER HERE, THE HAND-OFF, so the screen can offer Claude on their Mac. */
    if (mac) emit({ type: 'route', to: 'mac' });
    const cited = flow.cited();
    emit({ type: 'done', spent: { asks: reached ? 1 : 0, left: left() }, ...(cited.length === 0 ? {} : { figures: cited }) });
  };

  const act: Chat['act'] = async (id, accept, ctx, tools) => {
    open();
    const row = sql.one<{ person: string; op: string; state: string }>('SELECT person, op, state FROM slash_act WHERE id = ?', id);
    if (row === undefined || row.person !== who(ctx)) return no('REF_UNKNOWN', 'There is nothing waiting under that name. It may have been answered already.', { at: 'id' });
    if (row.state !== 'open') return no('ALREADY_KNOWN', `You ${row.state === 'accepted' ? 'said yes to' : 'turned down'} this already.`, { at: 'id' });
    if (!accept) {
      sql.exec("UPDATE slash_act SET state = 'declined' WHERE id = ?", id);
      return ok({ ok: true });
    }
    /* TAKEN BEFORE THE WRITE, so two presses at once write once; given back if the write is refused. */
    sql.exec("UPDATE slash_act SET state = 'accepted' WHERE id = ? AND state = 'open'", id);
    let op: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.op);
      if (isRecord(parsed)) op = parsed;
    } catch {
      op = {};
    }
    let applied: Awaited<ReturnType<ChatTools['apply']>>;
    try {
      applied = await tools.apply(op);
    } catch (e) {
      applied = no('INTERNAL', `That could not be done: ${e instanceof Error ? e.message : String(e)}.`);
    }
    if (!applied.ok) {
      sql.exec("UPDATE slash_act SET state = 'open' WHERE id = ?", id);
      return no(codeOf(applied) || 'INTERNAL', fixOf(applied) || 'That could not be done.');
    }
    sql.exec('UPDATE slash_act SET receipt = ?, undo = ? WHERE id = ?', applied.value.receipt, applied.value.undo?.batch ?? null, id);
    return ok({ ok: true, receipt: applied.value.receipt, ...(applied.value.undo === undefined ? {} : { undo: applied.value.undo }) });
  };

  const thread: Chat['thread'] = (id, ctx) => {
    open();
    const row = sql.one<{ person: string }>('SELECT person FROM slash_thread WHERE id = ?', id);
    if (row === undefined || row.person !== who(ctx)) return no('REF_UNKNOWN', 'There is no conversation under that name.', { at: 'id' });
    const held = new Map(
      sql
        .all<{ id: string; state: string; receipt: string | null; undo: string | null }>('SELECT id, state, receipt, undo FROM slash_act WHERE thread = ?', id)
        .map((a) => [a.id, a] as const),
    );
    const turns = sql.all<{ role: 'you' | 'slash'; text: string; actions: string }>('SELECT role, text, actions FROM slash_turn WHERE thread = ? ORDER BY n', id).map((t) => {
      let actions: ChatAction[] = [];
      let mentions: ChatMention[] = [];
      try {
        const parsed: unknown = JSON.parse(t.actions);
        actions = Array.isArray(parsed) ? (parsed.filter(isRecord) as unknown as ChatAction[]) : [];
        if (isRecord(parsed) && Array.isArray(parsed['mentions'])) mentions = parsed['mentions'].filter(isRecord) as unknown as ChatMention[];
      } catch {
        actions = [];
      }
      return {
        role: t.role,
        text: t.text,
        ...(mentions.length > 0 ? { mentions } : {}),
        actions: actions.map((a) => {
          const h = held.get(a.id);
          if (h === undefined) return a;
          const state = h.state === 'accepted' ? 'accepted' : h.state === 'declined' ? 'declined' : 'open';
          return { ...a, state, ...(h.undo === null ? {} : { undo: { batch: h.undo } }), ...(h.receipt === null ? {} : { detail: h.receipt }) } as ChatAction;
        }),
      };
    });
    return ok({ id, turns });
  };

  /* THIS PERSON'S CONVERSATIONS, NEWEST FIRST, each titled by the first thing they said in it, so a conversation
     started on one device is there on the next. */
  const threads: Chat['threads'] = (ctx) => {
    open();
    const rows = sql.all<{ id: string; updated: string; first: string | null }>(
      `SELECT t.id AS id, t.updated AS updated,
              (SELECT text FROM slash_turn WHERE thread = t.id AND role = 'you' ORDER BY n LIMIT 1) AS first
       FROM slash_thread t WHERE t.person = ? ORDER BY t.updated DESC LIMIT ?`,
      who(ctx),
      THREADS_LISTED,
    );
    return ok({
      threads: rows
        .filter((r) => r.first !== null && r.first.trim() !== '')
        .map((r) => ({ id: r.id, title: cut(r.first!.replace(/\s+/gu, ' ').trim(), TITLE_CHARS).replace(/ \(cut here\)$/u, ''), at: r.updated })),
    });
  };

  return { chat, act, thread, threads };
};
