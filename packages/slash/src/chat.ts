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
import { CHAT_ANSWER_SCHEMA, PROMPTS } from './prompts.ts';
import { firstBytes, isRecord, tokens } from './project.ts';
import type { CallContext, ChatAction, ChatActed, ChatEvent, ChatFigure, ChatInput, ChatRan, ChatRun, ChatThread, ChatThreads, ChatTool, ChatTools, Inference } from './types.ts';

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

/**
 * Every `{{ref:ID}}` made the `register#seq` a link is drawn from, through the host's own lookup, and every other brace
 * taken out: the answer is prose, and a brace the screen cannot draw would print as itself. `figures` names each row
 * linked, so the screen draws a link by the row's own name.
 */
const linked = async (said: string, tools: ChatTools): Promise<{ text: string; figures: ChatFigure[] }> => {
  /* AN ID AS THE RESULTS PRINT IT, `(tasks#3)` or bare, IS A LINK TOO: the included model copies an id the way it read
     it as often as it writes the brace it was asked for, and an id left as text is a code a person cannot press. */
  const answer = said
    /* A BRACE WRITTEN LOOSELY, `{{ref:obligations SG9}}` or `{{ ref: tasks#3 }}`, is read for the id it ends with. */
    .replace(/\{\{\s*ref\s*:\s*(?:[^}]*\s)?([^}\s]+)\s*\}\}/gu, '{{ref:$1}}')
    .replace(/\s*\(\s*([a-z][a-z0-9_]*#[1-9][0-9]*)\s*\)/gu, ' {{ref:$1}}')
    .replace(/(?<![{:\w#])([a-z][a-z0-9_]*#[1-9][0-9]*)(?![\w}])/gu, '{{ref:$1}}');
  const asked = [...new Set([...answer.matchAll(/\{\{\s*ref:\s*([^}\s]+)\s*\}\}/gu)].map((m) => m[1] ?? ''))].slice(0, REFS_MOST);
  const to = new Map<string, string | null>();
  const figures: ChatFigure[] = [];
  for (const id of asked) {
    let at: { ref: string; label: string } | null = null;
    try {
      at = tools.ref ? await tools.ref(id) : QUALIFIED.test(id) ? { ref: id, label: '' } : null;
    } catch {
      at = null;
    }
    to.set(id, at?.ref ?? null);
    if (at !== null && at.label !== '' && !figures.some((f) => f.ref === at.ref)) figures.push({ ref: at.ref, label: at.label });
  }
  /* A ROW IS NAMED ONCE, BY ITS LINK. The screen draws a brace as the row's own name, so "Studio rent
     {{ref:obligations#16}}" printed the name twice, and "Studio rent is late (obligations#16)" printed it at the end. Where
     the row's name stands in the answer, the first place it stands becomes the link and the brace goes; where it does not,
     the brace stays where it was written. */
  let named = answer;
  for (const [id, at] of to) {
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
    .replace(/\band,\s/gu, 'and ')
    .replace(/\(\s*\)/gu, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([.,;:!?])/gu, '$1')
    .trim();
  return { text, figures };
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

/* ── the engine ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export type Chat = {
  chat(input: ChatInput, ctx: CallContext, tools: ChatTools, emit: (event: ChatEvent) => void, inference?: Inference): Promise<void>;
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

  const addTurn = (thread: string, role: 'you' | 'slash', text: string, actions: readonly ChatAction[] = []): void => {
    const n = (sql.one<{ n: number | null }>('SELECT MAX(n) AS n FROM slash_turn WHERE thread = ?', thread)?.n ?? 0) + 1;
    sql.exec('INSERT INTO slash_turn (thread, n, role, text, actions, ts) VALUES (?, ?, ?, ?, ?, ?)', thread, n, role, text, JSON.stringify(actions), now());
    sql.exec('DELETE FROM slash_turn WHERE thread = ? AND n <= ?', thread, n - TURNS_KEPT);
    sql.exec('UPDATE slash_thread SET updated = ? WHERE id = ?', now(), thread);
  };

  const left = (): number | null => {
    const s = core.settings();
    return s.tier === 'a' ? Math.max(0, s.ask_cap - core.asksUsed()) : null;
  };

  const chat: Chat['chat'] = async (input, ctx, tools, emit, inference) => {
    open();
    const person = who(ctx);
    const message = firstBytes((typeof input.message === 'string' ? input.message : '').trim(), MESSAGE_BYTES);
    if (message === '') {
      emit({ type: 'error', text: 'Say something first.' });
      emit({ type: 'done', spent: { asks: 0, left: left() } });
      return;
    }

    /* THE MONTH'S CHECK AND THE HOLD, WITH NO `await` BETWEEN THEM, for `read`'s reason (`propose.ts`). */
    const s = core.settings();
    if (s.tier === 'a' && core.asksUsed() >= s.ask_cap) {
      core.turnedAway('read', s.tier);
      emit({ type: 'error', text: `Slash is out of asks until ${core.resets().slice(0, 10)}. Add your own key in Settings, or wait.` });
      emit({ type: 'done', spent: { asks: 0, left: 0 } });
      return;
    }
    if (s.tier === 'b' && inference === undefined) {
      emit({ type: 'error', text: 'Your key is not open in this session. Open the keychain, or switch Slash to the included model.' });
      emit({ type: 'done', spent: { asks: 0, left: null } });
      return;
    }
    const model = s.model ?? PROMPTS.chat.model;
    const holds: string[] = [core.reserve('read', s.tier, model, ASKED)];

    const thread = threadFor(input.thread, person);
    emit({ type: 'thread', id: thread.id });
    const before = thread.fresh ? [] : turnsOf(thread.id, TURNS_READ);
    addTurn(thread.id, 'you', message);

    const list = [...tools.list.filter((t) => t.name !== CALC.name), CALC];
    let lists = '';
    try {
      lists = tools.context ? cut(await tools.context(), LISTS_CHARS) : '';
    } catch {
      lists = '';
    }
    const named = new Map(list.map((t) => [t.name, t]));
    const run: ChatRun = { askOnly: false, asked: DOING.test(message), said: message, outside: null };
    const done: Done[] = [];
    const actions: ChatAction[] = [];
    /* WHAT A FIGURE MAY STAND IN BESIDE THE RESULTS: their words, the conversation, the lists' counts, today and tomorrow. */
    const figures: number[] = [
      ...numbersIn(message),
      ...before.flatMap((t) => numbersIn(t.text)),
      ...numbersIn(lists),
      ...numbersIn(dayOf(clock.now())),
      ...numbersIn(dayOf(clock.now() + 86_400_000)),
    ];
    let reached = false;
    let calls = 0;
    let answer: string | null = null;
    let failed: string | null = null;

    /** A tool call the engine runs, by the name the model gave it. */
    type Asked = { name: string; args: Record<string, unknown> };
    const runOne = async (c: Asked): Promise<ChatRan> => {
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
       that order, so a step that asks for cash and runway waits for the slower of the two and not for both. */
    const runCalls = async (asked: readonly Asked[]): Promise<void> => {
      const reads = asked.map((c) => (named.get(c.name)?.writes === true ? null : runOne(c)));
      const outs: ChatRan[] = [];
      for (const [i, c] of asked.entries()) outs.push(await (reads[i] ?? runOne(c)));
      for (const [i, c] of asked.entries()) {
        const out = outs[i]!;
        const tool = named.get(c.name);
        if (tool !== undefined) emit({ type: 'step', text: out.step ?? tool.about.split(/[.:,]/u)[0] ?? c.name });
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
    };

    try {
      /* THE READS THE MESSAGE PLAINLY WANTS, BEFORE THE FIRST MODEL CALL, so "how much cash do I have" is one call and not
         two. Reads only, never a tool that writes, and they spend none of the turn's calls: they are the host's guess,
         and the model may still call what it wants. */
      const first = (tools.prefetch?.(message) ?? []).filter((c) => named.has(c.tool) && named.get(c.tool)?.writes !== true).slice(0, 2);
      if (first.length > 0) await runCalls(first.map((c) => ({ name: c.tool, args: { ...c.args } })));

      for (let step = 0; step < STEPS_MOST && answer === null; step++) {
        const last = step === STEPS_MOST - 1 || calls >= CALLS_MOST;
        /* FITTED UNDER THE TEMPLATE'S CAP, the conversation's oldest turns first and then this turn's older results, so a
           result the model is about to read is never the part that goes. */
        let kept = [...before];
        let short = done.length;
        const prompt = (): string =>
          promptOf({ now: clock.now(), page: input.page, outside: run.outside, lists, tools: list, before: kept, message, done, last, short });
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
        const ran = await core.run({ id: 'chat', slots: { '%TRANSCRIPT%': text }, inference, model: s.model ?? undefined, ...(last ? { schema: CHAT_ANSWER_SCHEMA } : {}) });
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
          failed = codeOf(ran.out) === 'UNREACHABLE' ? "Slash couldn't reach its model just now. Try again in a moment." : "Slash's model answered in a shape it could not read. Try asking again.";
          break;
        }

        const said = typeof ran.out.value['say'] === 'string' ? ran.out.value['say'].trim() : '';
        const wanted = (Array.isArray(ran.out.value['calls']) ? ran.out.value['calls'] : []).filter(isRecord).slice(0, 3);
        if (wanted.length === 0 || last) {
          answer = said;
          break;
        }

        const asked = wanted.slice(0, Math.max(0, CALLS_MOST - calls)).map((call) => ({
          name: typeof call['tool'] === 'string' ? call['tool'] : '',
          args: isRecord(call['args']) ? call['args'] : {},
        }));
        calls += asked.length;
        await runCalls(asked);
      }
    } catch (e) {
      failed = `Slash stopped partway: ${e instanceof Error ? e.message : String(e)}.`;
    } finally {
      for (const id of holds) core.release(id);
    }

    let text = '';
    let cited: ChatFigure[] = [];
    if (answer !== null && answer !== '') {
      const checked = checkFigures(answer, figures);
      const drawn = await linked(checked.text, tools);
      text = drawn.text;
      cited = drawn.figures;
      if (checked.dropped > 0)
        text =
          text === ''
            ? "I found something, but I couldn't check its figures against the record, so I've left them out. Ask me to look again."
            : `${text} (I left out a figure I couldn't check.)`;
    } else if (failed === null) {
      text = actions.length > 0 ? 'Done.' : "I couldn't find that in the record.";
    }

    /* EACH PIECE WITH THE SPACE IT WAS WRITTEN WITH, so the lines of a short list stay lines on the screen. */
    if (text !== '') for (const piece of sentences(text)) emit({ type: 'delta', text: piece });
    if (failed !== null) emit({ type: 'error', text: failed });
    addTurn(thread.id, 'slash', text !== '' ? text : (failed ?? ''), actions);
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
      try {
        const parsed: unknown = JSON.parse(t.actions);
        actions = Array.isArray(parsed) ? (parsed.filter(isRecord) as unknown as ChatAction[]) : [];
      } catch {
        actions = [];
      }
      return {
        role: t.role,
        text: t.text,
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
