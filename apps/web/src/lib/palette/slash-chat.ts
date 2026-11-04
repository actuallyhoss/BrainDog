/**
 * Slash as a conversation: the four doors the palette's Ask talks through, typed, and the rules the thread is drawn by.
 *
 * ONE ADAPTER, SO THE PALETTE NEVER SPEAKS HTTP. `chat` sends one message and streams the answer back as NDJSON, one event a
 * line: the thread's id, the steps Slash takes ("Reading Money…"), the answer's words as they come, the actions it took or
 * asks to take, a page to go to, and the end with what the ask spent. `act` answers an action, `thread` reads one back and
 * `now` says what matters before anything is asked.
 *
 * AT THE RECORD'S OWN BASE, as every other ask is (`apiBase`), with the browser's cookie and never a bearer, which is the
 * host doors' rule (`hostDoor` in the client).
 *
 * A HOST WITH NO CHAT DOOR YET answers 404 or 405, and `chat` says `missing` rather than an error, so the caller falls back
 * to the two-pass ask and the palette never breaks.
 *
 * PURE BUT FOR THE FETCHES AND THE DEVICE'S LIST OF THREADS, so `node --test` can hold the parsing and the starters.
 */

import { here } from '../at.ts';

/** Where the person is when they ask: the address inside the record, what the screen calls itself, and the row it shows. */
export type PageContext = { path: string; title?: string; row?: string };

export type ChatAction = {
  id: string;
  kind: 'done' | 'ask';
  title: string;
  detail?: string;
  undo?: { batch: string };
  href?: string;
};

export type Spent = { asks: number; left: number | null };

export type ChatEvent =
  | { type: 'thread'; id: string }
  | { type: 'step'; text: string }
  | { type: 'delta'; text: string; figures?: Record<string, unknown> }
  | ({ type: 'action' } & ChatAction)
  | { type: 'navigate'; href: string; label: string }
  /* SLASH COULD NOT TAKE IT THIS WAY (Deep with no key of one's own) and names who can: `mac`, Claude on a machine. */
  | { type: 'route'; to: string }
  | { type: 'error'; text: string }
  /* Which brain answers: the included model, or Deep on the owner's Anthropic key, with the model it asks. */
  | { type: 'brain'; depth: 'quick' | 'deep'; model?: string }
  | { type: 'done'; spent: Spent; figures?: Record<string, unknown> };

/** How deep a message goes: the included model, Deep on the owner's key, or the first and then the second. */
export type ChatMode = 'quick' | 'deep' | 'auto';

export type Turn = { role: 'you' | 'slash'; text: string; actions: ChatAction[] };
export type Thread = { id: string; turns: Turn[] };
export type NowLine = { text: string; href?: string };

/** How a chat ended: streamed to its end, a door this host does not have, or one plain line saying why not. */
export type ChatEnd = { ok: true } | { ok: false; missing: true } | { ok: false; missing: false; text: string; spent: boolean };

export const chatWords = {
  unreached: 'Slash could not be reached. Try again in a moment.',
  broke: 'The answer stopped before it finished. Ask again to pick it up.',
  refused: 'Slash could not answer that.',
} as const;

/** The thread's own words, in the palette and on the Slash page. */
export const threadWords = {
  label: 'Conversation with Slash',
  steps: 'What Slash did',
  now: 'What matters now',
  try: 'Try asking',
  loading: 'Reading the conversation back.',
  gone: 'That conversation could not be read back. Ask again and it starts a new one.',
  yes: 'Do it',
  no: 'Not now',
  open: 'Open',
  dismissed: 'Left as it is.',
  placeholder: 'Ask Slash anything',
  mention: 'Mention a row',
  followUp: 'Ask a follow-up',
  fresh: 'New',
  freshLabel: 'Start a new conversation',
  find: 'Find',
  findOrAsk: 'Find anything, or ask',
  askMode: 'Ask',
  askLabel: 'Ask Slash, ⌘J',
  findLabel: 'Back to find and go',
  ask: 'Ask',
  resume: (q: string) => `Continue: ${q}`,
  left: (n: number) => (n === 1 ? '1 question left this month' : `${n.toLocaleString('en')} questions left this month`),
  enterDoes: 'Enter does it, Esc leaves it',
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** One line of the stream as the event it is, or `null` for anything this build does not know (skipped, never thrown). */
export function eventOf(line: string): ChatEvent | null {
  const t = line.trim();
  if (t === '') return null;
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v.type) {
    case 'thread':
      return str(v.id) ? { type: 'thread', id: v.id as string } : null;
    case 'step':
    case 'error':
      return typeof v.text === 'string' ? { type: v.type, text: v.text } : null;
    case 'delta': {
      if (typeof v.text !== 'string') return null;
      /* THE ROWS THIS PIECE LINKS, so a link that streams in is drawn by its name before `done` comes. */
      const figures = figuresOf(v.figures);
      return { type: 'delta', text: v.text, ...(figures ? { figures } : {}) };
    }
    case 'brain':
      return v.depth === 'quick' || v.depth === 'deep' ? { type: 'brain', depth: v.depth, ...(str(v.model) ? { model: v.model as string } : {}) } : null;
    case 'route':
      return str(v.to) ? { type: 'route', to: v.to as string } : null;
    case 'navigate':
      return str(v.href) ? { type: 'navigate', href: v.href as string, label: str(v.label) ?? (v.href as string) } : null;
    case 'action': {
      const a = actionOf(v);
      return a ? { type: 'action', ...a } : null;
    }
    case 'done': {
      const s = isObj(v.spent) ? v.spent : {};
      const spent: Spent = { asks: typeof s.asks === 'number' ? s.asks : 0, left: typeof s.left === 'number' ? s.left : null };
      const figures = figuresOf(v.figures);
      return { type: 'done', spent, ...(figures ? { figures } : {}) };
    }
    default:
      return null;
  }
}

/**
 * The rows an answer named, keyed the way `cite.ts` reads a `{{ref:…}}`. The record sends a list of `{ref, label}`, one
 * per row, and a map already keyed is taken as it stands.
 */
function figuresOf(raw: unknown): Record<string, unknown> | null {
  if (isObj(raw)) return raw;
  if (!Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const f of raw) {
    if (!isObj(f) || !str(f.ref)) continue;
    const m = /^([a-z][a-z0-9_-]*)#(\d+)$/u.exec(f.ref as string);
    if (m) out[`ref:${f.ref as string}`] = { kind: 'row', register: m[1], seq: Number(m[2]), title: str(f.label) ?? '' };
  }
  return out;
}

function actionOf(v: Record<string, unknown>): ChatAction | null {
  const id = str(v.id);
  const title = str(v.title);
  if (!id || !title || (v.kind !== 'done' && v.kind !== 'ask')) return null;
  const batch = isObj(v.undo) ? str(v.undo.batch) : undefined;
  return {
    id,
    kind: v.kind,
    title,
    ...(str(v.detail) ? { detail: v.detail as string } : {}),
    ...(batch ? { undo: { batch } } : {}),
    ...(str(v.href) ? { href: v.href as string } : {}),
  };
}

/**
 * The stream cut into lines. A chunk may end mid-line, so what follows the last newline is held for the next one; `end`
 * hands back whatever was left once the stream closes.
 */
export function lines(): { push(chunk: string): string[]; end(): string[] } {
  let held = '';
  return {
    push(chunk) {
      held += chunk;
      const parts = held.split('\n');
      held = parts.pop() ?? '';
      return parts;
    },
    end() {
      const last = held;
      held = '';
      return last.trim() === '' ? [] : [last];
    },
  };
}

/** A refusal's one sentence out of whatever JSON body a door answered with, or `null` when it said none. */
function fixIn(body: unknown): { text: string; code: string | null } | null {
  if (!isObj(body)) return null;
  const r = isObj(body.refusal) ? body.refusal : isObj(body.error) ? body.error : body;
  const text = str(r.fix) ?? str(r.message) ?? str(r.text);
  return text ? { text, code: str(r.code) ?? null } : null;
}

const json = { 'content-type': 'application/json' } as const;

/**
 * One ask. `mode` is Quick, Deep or Auto, `attach` the rows and things it is about (`send.ts` `refs`), and `rethink` asks
 * the last answer of `thread` again, harder, with no new message.
 */
export type ChatBody = {
  thread?: string;
  message?: string;
  page?: PageContext;
  mode?: 'quick' | 'deep' | 'auto';
  attach?: string[];
  /** Which letters of `message` name which row, kept with the turn so its bubble draws them on any device. */
  mentions?: { at: number; len: number; ref: string }[];
  rethink?: boolean;
};

/**
 * Send one message and hand each event to `on` as it arrives. Never throws: a dead socket, a refusal and a stream that broke
 * off are each one plain line, and a host with no chat door is `missing`.
 */
export async function chat(
  base: string,
  body: ChatBody,
  on: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<ChatEnd> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/slash/chat`, { method: 'POST', headers: json, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  } catch {
    return { ok: false, missing: false, text: chatWords.unreached, spent: false };
  }
  if (res.status === 404 || res.status === 405 || res.status === 501) return { ok: false, missing: true };
  if (!res.ok || !res.body) {
    const said = fixIn(await res.json().catch(() => null));
    const spent = said?.code === 'SLASH_BUDGET_SPENT' || res.status === 402;
    return { ok: false, missing: false, text: said?.text ?? chatWords.refused, spent };
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const cut = lines();
  let ended = false;
  const take = (l: string) => {
    const e = eventOf(l);
    if (!e) return;
    if (e.type === 'done') ended = true;
    on(e);
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const l of cut.push(value)) take(l);
    }
    for (const l of cut.end()) take(l);
  } catch {
    if (signal?.aborted) return { ok: true };
    return { ok: false, missing: false, text: chatWords.broke, spent: false };
  }
  return ended ? { ok: true } : { ok: false, missing: false, text: chatWords.broke, spent: false };
}

/** Accept or dismiss one action Slash asked about. The receipt is the record's sentence for what it did. */
export async function act(base: string, id: string, accept: boolean): Promise<{ ok: true; receipt?: string; undo?: { batch: string } } | { ok: false; text: string }> {
  try {
    const res = await fetch(`${base}/api/slash/act`, { method: 'POST', headers: json, body: JSON.stringify({ id, accept }) });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok || !isObj(body) || body.ok === false) return { ok: false, text: fixIn(body)?.text ?? chatWords.refused };
    const batch = isObj(body.undo) ? str(body.undo.batch) : undefined;
    return { ok: true, ...(str(body.receipt) ? { receipt: body.receipt as string } : {}), ...(batch ? { undo: { batch } } : {}) };
  } catch {
    return { ok: false, text: chatWords.unreached };
  }
}

/** One thread read back, to continue it. `null` when it is gone or the host has no such door. */
export async function thread(base: string, id: string): Promise<Thread | null> {
  try {
    const res = await fetch(`${base}/api/slash/thread/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isObj(body) || !Array.isArray(body.turns)) return null;
    const turns = body.turns.flatMap((t): Turn[] => {
      if (!isObj(t) || (t.role !== 'you' && t.role !== 'slash') || typeof t.text !== 'string') return [];
      const actions = Array.isArray(t.actions) ? t.actions.flatMap((a) => (isObj(a) ? (actionOf(a) ?? []) : [])) : [];
      return [{ role: t.role, text: t.text, actions }];
    });
    return { id: str(body.id) ?? id, turns };
  } catch {
    return null;
  }
}

/** The conversations the record keeps, newest first, so one had on another device is listed too. `null` when the host has no such door. */
export async function threads(base: string): Promise<KeptThread[] | null> {
  try {
    const res = await fetch(`${base}/api/slash/threads`);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isObj(body) || !Array.isArray(body.threads)) return null;
    return body.threads.flatMap((t): KeptThread[] => {
      if (!isObj(t) || !str(t.id)) return [];
      const at = typeof t.at === 'number' ? t.at : typeof t.at === 'string' ? Date.parse(t.at) : NaN;
      return [{ id: t.id as string, title: str(t.title) ?? '', at: Number.isFinite(at) ? at : 0 }];
    });
  } catch {
    return null;
  }
}

/** What matters now, said before anything is asked, or `null` when the host does not say. */
export async function now(base: string, signal?: AbortSignal): Promise<NowLine[] | null> {
  try {
    const res = await fetch(`${base}/api/slash/now`, signal ? { signal } : {});
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isObj(body) || !Array.isArray(body.lines)) return null;
    const out = body.lines.flatMap((l): NowLine[] => (isObj(l) && typeof l.text === 'string' && l.text.trim() !== '' ? [{ text: l.text, ...(str(l.href) ? { href: l.href as string } : {}) }] : []));
    return out.length > 0 ? out.slice(0, 5) : null;
  } catch {
    return null;
  }
}

/* WHAT THE SCREEN BEHIND IS, read from its address. */
const ROW = /^\/r\/([a-z][a-z0-9_]*)\/([1-9][0-9]*)(?:[/?#]|$)/u;
const MONEY = /^\/(?:p\/money\b|count\b|r\/(?:ledger|transactions|expenses|budgets|accounts|payees|bills)\b)/u;

/** The page the person is on, as the ask sends it. `title` is the name the screen gave itself in the tab, when it gave one. */
export function pageOf(pathname: string, tab: string, product = 'BrainDog'): PageContext {
  const path = here(pathname);
  const first = tab.split(' · ')[0]?.trim() ?? '';
  const title = first !== '' && first !== product ? first : undefined;
  const m = ROW.exec(path);
  return { path, ...(title ? { title } : {}), ...(m ? { row: `${m[1]}#${m[2]}` } : {}) };
}

/** The three questions an empty Ask opens on, fitted to the page behind it. */
export function starters(p: PageContext): string[] {
  if (p.path === '/' || p.path === '') return ["What's late?", 'What needs me today?', 'What did my agents do today?'];
  if (MONEY.test(p.path)) return ['What did I spend most on this month?', 'What is coming up to pay?', 'How does this month compare with last?'];
  if (p.path.startsWith('/r/projects/') && p.title) return [`Where does ${p.title} stand?`, `What's late on ${p.title}?`, `What changed on ${p.title} this week?`];
  if (p.path.startsWith('/decide')) return ['What should I answer first?', 'What is waiting longest?', 'What did Slash suggest today?'];
  if (p.row && p.title) return [`What is ${p.title} waiting on?`, `What changed on ${p.title} lately?`, `What is linked to ${p.title}?`];
  if (p.title) return [`What stands out in ${p.title}?`, `What's late in ${p.title}?`, `What changed in ${p.title} this week?`];
  return ["What's late?", 'What needs me today?', 'What changed today?'];
}

/** One thread kept on this device for the Slash page: its id, the first question and when it was last asked in. */
export type KeptThread = { id: string; title: string; at: number };

export const THREADS_KEY = 'bd_slash_threads';
export const THREADS_CAP = 30;

/**
 * WHERE ONE PERSON'S THREADS ARE KEPT ON ONE BRAINDOG (sec-follow M4), or `null` where the person is not known, and then
 * none is kept or listed. One list for the device listed one person's questions to the next who signed in on another
 * BrainDog, or to a colleague after a switch, whenever no sign-out came between to wipe it (`signed-out.ts`).
 */
export const threadsKey = (base: string, person: string | null | undefined): string | null =>
  typeof person === 'string' && person !== '' && base !== '' ? `${THREADS_KEY}:${base}:${person}` : null;

export function keptThreads(key: string | null): KeptThread[] {
  if (key === null) return [];
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.filter((t): t is KeptThread => isObj(t) && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.at === 'number');
  } catch {
    return [];
  }
}

/** Keep `id` first in the person's list (`threadsKey`), with the question that opened it. Storage that throws keeps nothing, and nothing breaks. */
export function keepThread(key: string | null, id: string, title: string, at = Date.now()): void {
  if (key === null) return;
  try {
    const had = keptThreads(key);
    const was = had.find((t) => t.id === id);
    const next = [{ id, title: was?.title ?? title, at }, ...had.filter((t) => t.id !== id)].slice(0, THREADS_CAP);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* A full or blocked store: the thread still goes on, it is only not listed on the Slash page. */
  }
}
