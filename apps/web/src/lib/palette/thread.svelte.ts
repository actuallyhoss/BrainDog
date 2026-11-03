/**
 * The conversation with Slash the palette holds: one thread, kept while the tab lives, so closing the palette and opening
 * it again (⌘J) finds the thread where it was. "New" clears it.
 *
 * EACH ANSWER IS BUILT AS IT STREAMS (`slash-chat.ts`): the steps Slash takes, its words, what it did and what it asks. An
 * action it took is a receipt with Undo for six seconds, and stays in the thread after; an action it asks about waits for
 * Enter or Esc.
 *
 * A HOST WITH NO CHAT DOOR YET is asked the two-pass way, the read and then the proposal (`slash.ts`), and that answer is
 * drawn as one turn of the same thread, so the palette never breaks while the door is missing.
 */

import { apiBase } from '../at.ts';
import { copy } from '../copy.ts';
import { history } from '../data/undo.ts';
import type { QueueQuestion } from '@braindog/kernel';
import type { Reading } from '@braindog/client';
import { act, chat, chatWords, keepThread, type ChatAction, type ChatBody, type PageContext } from './slash-chat.ts';
import { drawProposal, drawReading, pass2Refused, secondPass, slashWords, type DrawnRow } from './slash.ts';

/** How long a receipt offers its Undo. */
export const UNDO_MS = 6000;

export type LiveAction = ChatAction & {
  state: 'open' | 'busy' | 'done' | 'dismissed' | 'undone' | 'failed';
  /** The record's sentence for what was done, once it is. */
  receipt?: string | undefined;
  /** Until when Undo is offered, in ms since the epoch. */
  until?: number | undefined;
  /** One plain line when the answer or the undo did not go through. */
  note?: string | undefined;
};

/** The two-pass answer, as one turn: what it looked for, the rows, the proposal's card and its model. */
export type Legacy = {
  question: string;
  reading: Reading;
  where: string | null;
  rows: DrawnRow[];
  fold: string[];
  card: QueueQuestion | null;
  footer: string | null;
};

export type SlashTurn = {
  role: 'slash';
  steps: string[];
  text: string;
  figures: Record<string, unknown>;
  actions: LiveAction[];
  go: { href: string; label: string }[];
  error: string | null;
  spent: boolean;
  streaming: boolean;
  /** Who Slash says can take this instead, when it could not (`mac`: Claude on a machine), else absent. */
  route?: string | undefined;
  legacy?: Legacy;
};
export type YouTurn = { role: 'you'; text: string };
export type LiveTurn = YouTurn | SlashTurn;

export const convo = $state({
  /** The thread's id on the record, once the first answer named it. */
  id: null as string | null,
  turns: [] as LiveTurn[],
  /** An answer is streaming. */
  busy: false,
  /** Asks left this month as the last answer said, `null` when uncounted or not said. */
  left: null as number | null,
  /** Reading a thread back to continue it. */
  loading: false,
});

/** Whether the host has no chat door, learned once, so every later ask goes the two-pass way at once. */
let missing = false;
let stream: AbortController | null = null;

const live = (): SlashTurn | undefined => {
  const t = convo.turns.at(-1);
  return t?.role === 'slash' ? t : undefined;
};

/** Where this tab's reader keeps their threads (`threadsKey`): the person and the BrainDog, set by the palette. */
let keptAs: string | null = null;
/** The last reader named, kept through a moment the shell names nobody (a page with no shell), so that is no switch. */
let lastAs: string | null = null;

/**
 * WHO ASKS HERE NOW, as the shell names them (sec-follow M4): their threads are kept under them, and a thread open for
 * somebody else, or on another BrainDog, is let go of, so a switch never carries one person's conversation to the next.
 */
export function askingAs(key: string | null): void {
  keptAs = key;
  if (key === null || key === lastAs) return;
  if (lastAs !== null) clear();
  lastAs = key;
}

/** Start again: the thread is let go of, and an answer still streaming is stopped. */
export function clear(): void {
  stream?.abort();
  stream = null;
  convo.id = null;
  convo.turns = [];
  convo.busy = false;
}

/** Read a thread back to continue it. False when it could not be read. */
export async function open(id: string, base = apiBase()): Promise<boolean> {
  if (convo.id === id && convo.turns.length > 0) return true;
  clear();
  convo.loading = true;
  /* READ BACK AS SLASH'S OWN PAGE READS IT (`routes/slash/read-back.ts`, 3 Nov): each row an answer named by its name,
     where the bare thread door drew "something in Tasks", and each action in the state it was left in, so a card already
     done no longer offers Do it again. */
  const t = await import('../../routes/slash/read-back.ts').then((m) => m.readBack(base, id)).catch(() => null);
  convo.loading = false;
  if (!t) return false;
  convo.id = t.id;
  convo.turns = t.turns;
  return true;
}

const fresh = (): SlashTurn => ({ role: 'slash', steps: [], text: '', figures: {}, actions: [], go: [], error: null, spent: false, streaming: true });

/** How an ask is sent: Quick or Deep, and the rows it is about. Left out, the host's own way. */
export type AskWith = { mode?: 'quick' | 'deep' | 'auto' | undefined; attach?: readonly string[] | undefined };

/** Ask one question in this thread, with the page it was asked on. */
export async function ask(message: string, page: PageContext, base = apiBase(), how: AskWith = {}): Promise<void> {
  const said = message.trim();
  if (said === '' || convo.busy) return;
  convo.turns.push({ role: 'you', text: said }, fresh());
  convo.busy = true;
  if (missing) return twoPass(said, base);
  return stream_({ ...(convo.id ? { thread: convo.id } : {}), message: said, page, ...(how.mode ? { mode: how.mode } : {}), ...(how.attach && how.attach.length > 0 ? { attach: [...how.attach] } : {}) }, said, base);
}

/** Whether the last answer is finished and whole, so it can be asked again harder. */
export function rethinkable(): boolean {
  const t = convo.turns.at(-1);
  return !convo.busy && convo.id !== null && t?.role === 'slash' && !t.streaming && t.error === null && t.legacy === undefined && t.text !== '';
}

/** "Think harder": the last answer asked again on the deep model, as a new turn of the same thread. */
export async function rethink(base = apiBase()): Promise<void> {
  if (!rethinkable() || convo.id === null) return;
  convo.turns.push(fresh());
  convo.busy = true;
  return stream_({ thread: convo.id, mode: 'deep', rethink: true }, firstQuestion() ?? '', base);
}

/** One answer streamed into the last turn, for an ask and for a rethink alike. */
async function stream_(body: ChatBody, said: string, base: string): Promise<void> {
  stream = new AbortController();
  const signal = stream.signal;
  const end = await chat(
    base,
    body,
    (e) => {
      if (signal.aborted) return;
      const turn = live();
      if (!turn) return;
      switch (e.type) {
        case 'thread':
          convo.id = e.id;
          keepThread(keptAs, e.id, firstQuestion() ?? said);
          break;
        case 'step':
          turn.steps.push(e.text);
          break;
        case 'delta':
          if (e.figures) turn.figures = { ...turn.figures, ...e.figures };
          turn.text += e.text;
          break;
        case 'action': {
          const { type: _t, ...a } = e;
          turn.actions.push(a.kind === 'done' ? landed(a, a.detail ?? a.title) : { ...a, state: 'open' });
          break;
        }
        case 'navigate':
          turn.go.push({ href: e.href, label: e.label });
          break;
        case 'route':
          turn.route = e.to;
          break;
        case 'error':
          turn.error = e.text;
          break;
        case 'done':
          convo.left = e.spent.left;
          if (e.figures) turn.figures = { ...turn.figures, ...e.figures };
          break;
      }
    },
    signal,
  );
  if (signal.aborted) return;
  stream = null;
  if (!end.ok && end.missing) {
    missing = true;
    return twoPass(said, base);
  }
  const turn = live();
  if (turn) {
    turn.streaming = false;
    /* THE UNDO'S SECONDS START WHEN THE ANSWER IS THERE TO READ. An action lands before the model's last step, which took
       seconds on the included model, so a window started on landing had closed by the time the receipt's sentence came. */
    const from = Date.now();
    for (const a of turn.actions) if (a.state === 'done' && a.until !== undefined) a.until = from + UNDO_MS;
    if (!end.ok) {
      turn.error = end.text;
      turn.spent = end.spent;
    }
  }
  convo.busy = false;
  if (convo.id) keepThread(keptAs, convo.id, firstQuestion() ?? said);
}

const firstQuestion = (): string | undefined => convo.turns.find((t) => t.role === 'you')?.text;

/** A done action as its receipt, held for ⌘Z too while it can be put back. */
function landed(a: ChatAction, receipt: string): LiveAction {
  if (a.undo) history.push({ batch: a.undo.batch, said: receipt });
  return { ...a, state: 'done', receipt, ...(a.undo ? { until: Date.now() + UNDO_MS } : {}) };
}

/** Answer an action Slash asked about: yes does it and shows the receipt, no puts the card away. */
export async function answer(a: LiveAction, accept: boolean, base = apiBase()): Promise<void> {
  if (a.state !== 'open') return;
  a.state = 'busy';
  const out = await act(base, a.id, accept);
  if (!out.ok) {
    a.state = 'open';
    a.note = out.text;
    return;
  }
  a.note = undefined;
  if (!accept) {
    a.state = 'dismissed';
    return;
  }
  Object.assign(a, landed({ ...a, ...(out.undo ? { undo: out.undo } : {}) }, out.receipt ?? a.title));
}

/** Put back what an action did, by its batch, the way every other Undo in the app does. */
export async function undo(a: LiveAction, base = apiBase()): Promise<void> {
  if (a.state !== 'done' || !a.undo) return;
  const batch = a.undo.batch;
  a.state = 'busy';
  history.spend(batch);
  try {
    const { undoChange } = await import('../record/undo-write.ts');
    const out = await undoChange(base, batch);
    if (out.from === 'undone') {
      a.state = 'undone';
      a.receipt = out.said;
      void import('../data/live.svelte.ts').then((m) => m.reread());
      return;
    }
    a.state = 'done';
    a.until = undefined;
    a.note = 'fix' in out ? out.fix : chatWords.refused;
  } catch {
    a.state = 'done';
    a.note = copy.recordNotReached;
  }
}

/**
 * THE TWO-PASS ASK, as one turn of the thread: the read, drawn by code as rows, then what Slash proposes about them.
 * The client is loaded on the first ask that needs it.
 */
async function twoPass(question: string, base: string): Promise<void> {
  const turn = live();
  if (!turn) return;
  turn.steps.push(copy.slashAsking);
  const c = await import('@braindog/client').then(({ createClient }) => createClient({ base }), () => null);
  const read = c
    ? await c
        .slashRead(question, {
          busy: () => {
            if (live() === turn && !turn.steps.includes(copy.slashBusy)) turn.steps.push(copy.slashBusy);
          },
        })
        .catch(() => null)
    : null;
  const at = live();
  if (at !== turn) return;
  if (!read || !read.ok) {
    const r = read && !read.ok && 'refusal' in read ? read.refusal : null;
    turn.error = r?.fix ?? chatWords.unreached;
    turn.spent = r?.code === 'SLASH_BUDGET_SPENT';
    return void finish(turn);
  }
  const drawn = drawReading(read.value);
  turn.legacy = { question, reading: read.value, where: drawn.where !== null ? `${copy.slashWhere} ${drawn.where}` : drawn.q === null ? null : copy.slashSearched(drawn.q), rows: drawn.rows, fold: drawn.fold, card: null, footer: null };
  if (!secondPass(read.value)) {
    if (drawn.rows.length === 0) turn.text = copy.slashNothing;
    return void finish(turn);
  }
  turn.steps.push(slashWords.proposing);
  const said = c ? await c.slashAnswer(question, read.value.ask_id).catch(() => null) : null;
  if (live() !== turn) return;
  if (said?.ok) {
    const p = drawProposal(said.value, question);
    turn.text = p.text;
    turn.figures = p.figures;
    turn.legacy.card = p.card;
    turn.legacy.footer = p.footer;
    if (p.decide) turn.go.push({ href: p.decide, label: slashWords.decide });
  } else {
    const r = pass2Refused(said && !said.ok && 'refusal' in said ? said.refusal : { code: 'UNREACHABLE', fix: chatWords.unreached });
    turn.error = r.fix;
    turn.spent = r.spent;
  }
  finish(turn);
}

function finish(turn: SlashTurn): void {
  turn.streaming = false;
  convo.busy = false;
}
