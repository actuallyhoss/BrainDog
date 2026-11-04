/**
 * The conversation with Slash that is open, the one thing the panel and the Slash page both draw.
 *
 * THE RECORD HOLDS IT, AND THIS TAB ONLY LOOKS. Each turn is written to the record as it comes, so anything this tab does
 * (close the panel, reload, go to another conversation, open a new tab) costs nothing: it reads the thread back, and an
 * answer still being written is watched until it lands or the record says it stopped (`watch`). Going elsewhere during an
 * answer never stops it: the stream goes on unheard, so the turn behind it is not left alone, and it is there on return.
 * Only a person changing stops one.
 *
 * WHICH ONE WAS OPEN is remembered on the device (`conversations.svelte.ts`), so ⌘J and / reopen it after a reload.
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
import type { SentMention } from '../mention/mention.ts';
import { ATTACH_MOST } from '../../routes/slash/with.ts';
import { act, chat, chatWords, keepThread, type ChatAction, type ChatBody, type PageContext } from './slash-chat.ts';
import { deviceIs, draftMoved, keepOpen, keptOpen, NEW, refreshList, removeFromRecord, tellTabs, whenOtherTab } from './conversations.svelte.ts';
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
  /** As `YouTurn`'s. */
  local?: boolean | undefined;
  legacy?: Legacy;
};
export type YouTurn = {
  role: 'you';
  text: string;
  mentions?: readonly SentMention[] | undefined;
  /** Said here and sent to a machine, so it is under Sent and not on the conversation's record. */
  local?: boolean | undefined;
};
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
/** Which stream the thread on screen is hearing. One that is no longer heard goes on to its end, and its turn with it. */
let heard = 0;
const streams = new Set<AbortController>();
/** Which read of the thread is the latest, so an older one landing late draws nothing. */
let readNo = 0;
/** Which watch of an answer still being written is the latest. */
let watchNo = 0;

const live = (): SlashTurn | undefined => {
  const t = convo.turns.at(-1);
  return t?.role === 'slash' ? t : undefined;
};

/* WHAT THIS TAB HAS READ, so going back to a conversation draws it at once and reads it again behind that. In memory, and
   let go of when the person changes, as the names of the rows in it are. */
const seen = new Map<string, LiveTurn[]>();
const known = new Map<string, string>();

/** Where this tab's reader keeps their threads (`threadsKey`): the person and the BrainDog, set by the palette. */
let keptAs: string | null = null;
/** The last reader named, kept through a moment the shell names nobody (a page with no shell), so that is no switch. */
let lastAs: string | null = null;

/**
 * WHO ASKS HERE NOW, as the shell names them (sec-follow M4): their threads are kept under them, and a thread open for
 * somebody else, or on another BrainDog, is let go of, so a switch never carries one person's conversation to the next.
 * Nor does anything else: a stream still running is stopped, and what was read goes.
 */
export function askingAs(key: string | null): void {
  keptAs = key;
  if (key === null || key === lastAs) return;
  if (lastAs !== null) {
    for (const s of streams) s.abort();
    streams.clear();
    letGo();
    convo.id = null;
    convo.turns = [];
    convo.busy = false;
    convo.loading = false;
    convo.left = null;
    seen.clear();
    known.clear();
  }
  lastAs = key;
  woke = false;
  deviceIs(key);
}

/** This tab stops listening: nothing is cancelled, the stream goes on unheard, and any read or watch under way is let go of. */
function letGo(): void {
  heard++;
  readNo++;
  watchNo++;
}

/** Start again: a new conversation. One still being answered goes on, and is there to come back to. */
export function clear(): void {
  remember();
  letGo();
  convo.id = null;
  convo.turns = [];
  convo.busy = false;
  convo.loading = false;
  keepOpen(null);
}

/** Note what this thread has so far, so going back to it draws at once. */
function remember(): void {
  if (convo.id !== null && convo.turns.length > 0) seen.set(convo.id, $state.snapshot(convo.turns) as LiveTurn[]);
}

/** Whether a read-back says something this tab is not already showing. An action pressed here stays as it was if not. */
function moved(next: readonly LiveTurn[]): boolean {
  if (next.length !== convo.turns.length) return true;
  return next.some((t, i) => {
    const had = convo.turns[i]!;
    if (t.role !== had.role || t.text !== had.text) return true;
    if (t.role !== 'slash' || had.role !== 'slash') return false;
    return t.streaming !== had.streaming || t.error !== had.error || t.steps.length !== had.steps.length || t.actions.length !== had.actions.length;
  });
}

/** Draw what the record said, and if its last answer is still being written, watch it. */
function drew(id: string, turns: LiveTurn[], base: string): void {
  if (moved(turns)) convo.turns = turns;
  const going = turns.at(-1)?.role === 'slash' && (turns.at(-1) as SlashTurn).streaming;
  convo.busy = going;
  seen.set(id, turns);
  if (going) void watch(id, base);
}

/**
 * Read a conversation back, drawing what this tab already has of it at once, and make it the open one. False when it could
 * not be read and there is nothing to draw of it. The field is never held up: it has the conversation's own draft from
 * this moment, and only sending waits for the read.
 */
export async function open(id: string, base = apiBase()): Promise<boolean> {
  if (convo.id === id && (convo.turns.length > 0 || convo.loading)) return true;
  remember();
  letGo();
  const had = seen.get(id);
  convo.id = id;
  convo.turns = had ? [...had] : [];
  const lastHad = had?.at(-1);
  convo.busy = lastHad?.role === 'slash' && lastHad.streaming;
  convo.loading = !had;
  keepOpen(id);
  return read(id, base);
}

/** The record's copy of a thread, drawn. Returns false when nothing could be read and nothing is drawn. */
async function read(id: string, base: string): Promise<boolean> {
  const mine = ++readNo;
  /* READ BACK AS SLASH'S OWN PAGE READS IT (`routes/slash/read-back.ts`, 3 Nov): each row an answer named by its name,
     where the bare thread door drew "something in Tasks", and each action in the state it was left in, so a card already
     done no longer offers Do it again. */
  const t = await import('../../routes/slash/read-back.ts').then((m) => m.readBack(base, id, known)).catch(() => null);
  if (mine !== readNo || convo.id !== id) return true;
  convo.loading = false;
  if (!t) {
    if (convo.turns.length > 0) return true;
    convo.id = null;
    seen.delete(id);
    keepOpen(null);
    return false;
  }
  drew(id, t.turns, base);
  return true;
}

/**
 * AN ANSWER STILL BEING WRITTEN BY A TURN THIS TAB IS NOT HEARING: read until it lands. The record decides when one has
 * stopped (`ANSWER_QUIET_MS`), so this always ends. A moment where the record cannot be reached is only a moment.
 */
async function watch(id: string, base: string): Promise<void> {
  const mine = ++watchNo;
  const { readBack } = await import('../../routes/slash/read-back.ts');
  for (let failed = 0; failed < 40; ) {
    await new Promise((r) => setTimeout(r, typeof document !== 'undefined' && document.hidden ? 4000 : 900));
    if (mine !== watchNo || convo.id !== id) return;
    const t = await readBack(base, id, known);
    if (mine !== watchNo || convo.id !== id) return;
    if (!t) {
      failed++;
      continue;
    }
    if (moved(t.turns)) convo.turns = t.turns;
    seen.set(id, t.turns);
    const last = t.turns.at(-1);
    if (!(last?.role === 'slash' && last.streaming)) {
      convo.busy = false;
      void refreshList(base);
      return;
    }
  }
  /* THE RECORD STOPPED ANSWERING AT ALL. Said plainly, and the next read tells the truth if it comes back. */
  const turn = live();
  if (turn) {
    turn.streaming = false;
    turn.error = chatWords.broke;
  }
  convo.busy = false;
}

/** Read the open thread again if another tab or device may have moved it. Quiet: nothing is drawn unless it changed. */
async function reread(base: string): Promise<void> {
  const id = convo.id;
  /* WORDS SENT TO A MACHINE ARE NOT ON THE RECORD'S COPY, so its copy would take them off the screen. */
  if (id === null || convo.busy || convo.loading || convo.turns.some((t) => t.local)) return;
  const mine = ++readNo;
  const t = await import('../../routes/slash/read-back.ts').then((m) => m.readBack(base, id, known)).catch(() => null);
  if (mine !== readNo || convo.id !== id || convo.busy || !t) return;
  drew(id, t.turns, base);
}

let woke = false;
let listening = false;

/**
 * THE PANEL OR THE PAGE IS BEING LOOKED AT: the list is read, and the first time in a tab the panel opens, the conversation
 * left open on this device is opened again. Not awaited by anyone: the field is drawn and typable whatever this is doing.
 * The page says `resume: false`, since its address says which conversation it is on.
 */
export function wake(base = apiBase(), resume = true): void {
  void refreshList(base);
  const again = (): void => {
    void refreshList(base);
    void reread(base);
  };
  whenOtherTab(again);
  if (!listening && typeof document !== 'undefined') {
    listening = true;
    /* BACK TO THIS TAB FROM ANOTHER WINDOW OR ANOTHER DEVICE: whatever was said there is here. */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) again();
    });
  }
  if (woke) return void reread(base);
  if (!resume) return;
  woke = true;
  if (convo.id !== null || convo.turns.length > 0) return;
  const id = keptOpen();
  if (id !== null) void open(id, base);
}

/** The key the open conversation's draft is under. */
export const draftKey = (): string => convo.id ?? NEW;

/** Delete a conversation; if it is the open one, what is open becomes a new one. False when the record refused. */
export async function removeThread(id: string, base = apiBase()): Promise<boolean> {
  const ok = await removeFromRecord(id, base);
  if (!ok) return false;
  seen.delete(id);
  if (convo.id === id) clear();
  return true;
}

const fresh = (): SlashTurn => ({ role: 'slash', steps: [], text: '', figures: {}, actions: [], go: [], error: null, spent: false, streaming: true });

/** How an ask is sent: Quick or Deep, and the rows it is about. Left out, the host's own way. */
export type AskWith = { mode?: 'quick' | 'deep' | 'auto' | undefined; attach?: readonly string[] | undefined; mentions?: readonly SentMention[] | undefined };

/**
 * THE ROWS A MESSAGE GOES WITH, nearest first, since a quick answer reads only the first few: the ones it mentions, then
 * those it is sent from (the page behind), then those mentioned earlier in the thread, which stay with it as attached
 * rows always have. Each once, and no more than the door takes.
 */
export function sentWith(mentions: readonly SentMention[] = [], from: readonly string[] = []): string[] {
  const earlier = convo.turns.flatMap((t) => (t.role === 'you' ? [...(t.mentions ?? [])].reverse().map((m) => m.ref) : [])).reverse();
  return [...new Set([...mentions.map((m) => m.ref), ...from, ...earlier])].slice(0, ATTACH_MOST);
}

/** Ask one question in this thread, with the page it was asked on. */
export async function ask(message: string, page: PageContext, base = apiBase(), how: AskWith = {}): Promise<void> {
  const said = message.trim();
  if (said === '' || convo.busy || convo.loading) return;
  const mentions = how.mentions ?? [];
  const attach = sentWith(mentions, how.attach);
  convo.turns.push({ role: 'you', text: said, ...(mentions.length > 0 ? { mentions: [...mentions] } : {}) }, fresh());
  convo.busy = true;
  if (missing) return twoPass(said, base);
  return stream_({ ...(convo.id ? { thread: convo.id } : {}), message: said, page, ...(how.mode ? { mode: how.mode } : {}), ...(attach.length > 0 ? { attach } : {}), ...(mentions.length > 0 ? { mentions: [...mentions] } : {}) }, said, base);
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
  const mine = ++heard;
  /* WHAT ELSE WAS UNDER WAY FOR THIS THREAD IS OVER: this stream's answer is the one being drawn now. */
  readNo++;
  watchNo++;
  const stop = new AbortController();
  streams.add(stop);
  const signal = stop.signal;
  const end = await chat(
    base,
    body,
    (e) => {
      if (signal.aborted) return;
      /* NOBODY IS LOOKING AT THIS ONE NOW. It is the record's to keep; only what this tab alone can do is still done. */
      if (mine !== heard) {
        if (e.type === 'action' && e.kind === 'done' && e.undo) history.push({ batch: e.undo.batch, said: e.detail ?? e.title });
        return;
      }
      const turn = live();
      if (!turn) return;
      switch (e.type) {
        case 'thread':
          if (convo.id === null) draftMoved(e.id);
          convo.id = e.id;
          keepOpen(e.id);
          keepThread(keptAs, e.id, firstQuestion() ?? said);
          void refreshList(base);
          tellTabs();
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
  streams.delete(stop);
  if (signal.aborted) return;
  if (mine !== heard) return void refreshList(base);
  if (!end.ok && end.missing) {
    missing = true;
    return twoPass(said, base);
  }
  /* THE LINE BROKE, WHICH IS NOT TO SAY THE ANSWER DID: the turn behind it may well be writing still, and the record knows. */
  if (!end.ok && end.text === chatWords.broke && convo.id !== null) {
    const id = convo.id;
    return read(id, base).then(() => {});
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
  if (convo.id) {
    keepThread(keptAs, convo.id, firstQuestion() ?? said);
    void refreshList(base);
    tellTabs();
  }
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
  /* WHAT WENT TO AN AGENT IS FOLLOWED BY `SentLine`, which has the way to its run. */
  if (out.sent) delete a.href;
  Object.assign(a, landed({ ...a, ...(out.undo ? { undo: out.undo } : {}), ...(out.sent ? { sent: out.sent } : {}) }, out.receipt ?? a.title));
  /* A CHOICE OF WHO TAKES IT WAS ANSWERED: it went to this one, so the others are put away (the record has declined them). */
  if (a.group !== undefined)
    for (const t of convo.turns) if (t.role === 'slash') for (const other of t.actions) if (other !== a && other.group === a.group && other.state === 'open') other.state = 'dismissed';
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
