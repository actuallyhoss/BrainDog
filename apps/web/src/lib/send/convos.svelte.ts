/**
 * What was sent from each row, and what came back: the conversations a row's strip draws.
 *
 * ONE CONVERSATION A SEND. Sent to Slash, it streams its answer through the chat door with the mode and what is
 * attached, and a reply on the strip goes on in the same thread. Sent to an agent, it is an instruction the record
 * holds, read again every few seconds while its strip is open (`watch`), with the agent's progress, its reply and the
 * receipts of what it changed, each with Undo by its batch, the way every other Undo in the app is.
 *
 * KEPT ON THIS DEVICE, newest first and sixty at most, so a row opened again tomorrow still shows its strips. A
 * conversation is filed under every row it was sent with, so five rows sent at once each show the one strip.
 */

import { apiBase } from '../at.ts';
import { copy } from '../copy.ts';
import { history } from '../data/undo.ts';
import { act, chat, chatWords, type ChatAction, type ChatBody } from '../palette/slash-chat.ts';
import {
  ENDED,
  keepLast,
  one,
  reply as replyTo,
  send,
  sendWords,
  withdraw as withdrawOne,
  type Mode,
  type Receipt,
  type SendState,
  type TargetKind,
} from './send.ts';

export type Act = ChatAction & { state: 'open' | 'busy' | 'done' | 'dismissed'; note?: string | undefined };
export type Said = { role: 'you'; text: string };
export type Answer = { role: 'them'; text: string; steps: string[]; streaming: boolean; error: string | null; actions: Act[]; route?: string | undefined };
export type Turn = Said | Answer;
export type Kept = Receipt & { state: 'done' | 'busy' | 'undone'; note?: string | undefined };

export type Convo = {
  key: string;
  refs: string[];
  to: { kind: TargetKind; label: string };
  at: number;
  via: 'slash' | 'agent';
  /** The instruction's id, for an agent. */
  id: string | null;
  /** The target it was sent to by id, so a reply where the host has no reply door goes to the same one. */
  target: string | null;
  /** Slash's thread, once its first answer named it. */
  thread: string | null;
  mode: Mode;
  /** Where an agent's instruction stands; `null` for Slash. */
  state: SendState | null;
  progress: string | null;
  turns: Turn[];
  receipts: Kept[];
  /** One plain line when a reply or an undo did not go through. */
  fix: string | null;
};

const KEY = 'bd_send_convos';
const CAP = 60;
/** The words of a kept answer, cut so the device's store stays small. */
const KEPT_TEXT = 4000;

export const convos = $state({ list: load() as Convo[] });

/** Counts the sends this tab made, so a button naming the last target reads it again after each. */
export const sends = $state({ n: 0 });

function load(): Convo[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is Convo => typeof c === 'object' && c !== null && typeof (c as Convo).key === 'string' && Array.isArray((c as Convo).refs) && Array.isArray((c as Convo).turns));
  } catch {
    return [];
  }
}

/** Write the list back, each answer cut and nothing marked as still streaming. */
function save(): void {
  try {
    const kept = convos.list.slice(0, CAP).map((c) => ({
      ...c,
      fix: null,
      turns: c.turns.map((t) => (t.role === 'you' ? t : { ...t, text: t.text.slice(0, KEPT_TEXT), streaming: false })),
      receipts: c.receipts.map((r) => ({ ...r, state: r.state === 'busy' ? 'done' : r.state })),
    }));
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* A full or blocked store: the strip lives as long as the tab. */
  }
}

/** The conversations sent with one row, newest first. */
export const forRef = (ref: string): Convo[] => convos.list.filter((c) => c.refs.includes(ref));

export const byId = (id: string): Convo | undefined => convos.list.find((c) => c.id === id);

const answer = (): Answer => ({ role: 'them', text: '', steps: [], streaming: true, error: null, actions: [] });

function made(c: Omit<Convo, 'key' | 'at' | 'turns' | 'receipts' | 'fix' | 'progress' | 'state' | 'thread' | 'target'> & { first: string; target?: string | null }): Convo {
  const { first, ...rest } = c;
  const convo: Convo = {
    ...rest,
    key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    thread: null,
    target: c.target ?? null,
    state: rest.via === 'agent' ? 'sent' : null,
    progress: null,
    turns: first === '' ? [] : [{ role: 'you', text: first }],
    receipts: [],
    fix: null,
  };
  convos.list = [convo, ...convos.list].slice(0, CAP);
  /* THE STORE'S OWN PROXY, so what changes below is what the strip is drawing. */
  return convos.list[0]!;
}

/* ── SLASH ── */

/** Ask Slash about what is attached, in a conversation of its own, streamed into it. */
export function askSlash(o: { refs: string[]; message: string; mode: Mode; attach: string[] }, base = apiBase()): Convo {
  const c = made({ refs: o.refs, to: { kind: 'slash', label: o.mode === 'deep' ? `${sendWords.slash} · ${sendWords.deep}` : sendWords.slash }, via: 'slash', id: null, mode: o.mode, first: o.message });
  void streamInto(c, { message: o.message, mode: o.mode, ...(o.attach.length > 0 ? { attach: o.attach } : {}) }, base);
  return c;
}

/** Go on with a Slash conversation from its strip. */
export function replySlash(c: Convo, message: string, base = apiBase()): void {
  const said = message.trim();
  if (said === '' || busy(c)) return;
  c.turns.push({ role: 'you', text: said });
  void streamInto(c, { ...(c.thread ? { thread: c.thread } : {}), message: said, mode: c.mode, ...(c.thread ? {} : { attach: c.refs }) }, base);
}

/** Whether an answer is still coming. */
export const busy = (c: Convo): boolean => c.turns.some((t) => t.role === 'them' && t.streaming);

async function streamInto(c: Convo, body: ChatBody, base: string): Promise<void> {
  c.turns.push(answer());
  const turn = c.turns.at(-1) as Answer;
  const end = await chat(base, body, (e) => {
    switch (e.type) {
      case 'thread':
        c.thread = e.id;
        break;
      case 'step':
        turn.steps.push(e.text);
        break;
      case 'delta':
        turn.text += e.text;
        break;
      case 'action': {
        const { type: _t, ...a } = e;
        turn.actions.push({ ...a, state: a.kind === 'done' ? 'done' : 'open' });
        if (a.kind === 'done' && a.undo) keep(c, { batch: a.undo.batch, said: a.detail ?? a.title });
        break;
      }
      case 'route':
        turn.route = e.to;
        break;
      case 'error':
        turn.error = e.text;
        break;
      default:
        break;
    }
  });
  turn.streaming = false;
  if (!end.ok) turn.error = end.missing ? chatWords.unreached : end.text;
  save();
}

/** Answer an action Slash asked about on a strip: yes does it and keeps its receipt, no puts it away. */
export async function answerAct(c: Convo, a: Act, accept: boolean, base = apiBase()): Promise<void> {
  if (a.state !== 'open') return;
  a.state = 'busy';
  const out = await act(base, a.id, accept);
  if (!out.ok) {
    a.state = 'open';
    a.note = out.text;
    return;
  }
  a.note = undefined;
  a.state = accept ? 'done' : 'dismissed';
  if (accept && out.undo) keep(c, { batch: out.undo.batch, said: out.receipt ?? a.title });
  save();
}

/* ── AN AGENT ── */

/** An instruction the record took, kept on the rows it was about. */
export function addAgent(o: { refs: string[]; id: string; to: { kind: TargetKind; label: string }; note: string; target: string | null }): Convo {
  const c = made({ refs: o.refs, to: o.to, via: 'agent', id: o.id, mode: 'auto', first: o.note, target: o.target });
  save();
  return c;
}

/** Read an agent's instruction once more, and take what changed. */
export async function poll(c: Convo, base = apiBase()): Promise<void> {
  if (c.id === null || (c.state !== null && ENDED.has(c.state))) return;
  const s = await one(base, c.id);
  if (!s) return;
  c.state = s.state;
  c.progress = s.progress ?? null;
  if (s.reply) {
    const last = c.turns.at(-1);
    if (last?.role === 'them') last.text = s.reply;
    else c.turns.push({ ...answer(), streaming: false, text: s.reply });
  }
  for (const r of s.receipts) keep(c, r);
  save();
}

/** A reply on an agent's strip: to the same instruction where the host can, else a new one to the same agent. */
export async function replyAgent(c: Convo, note: string, base = apiBase()): Promise<void> {
  const targetId = c.target;
  const said = note.trim();
  if (said === '' || c.id === null) return;
  c.turns.push({ role: 'you', text: said });
  c.fix = null;
  const out = await replyTo(base, c.id, said);
  if (out.ok) {
    if (c.state !== null && ENDED.has(c.state)) c.state = 'sent';
    save();
    return;
  }
  if (!out.missing || targetId === null) {
    c.fix = out.text;
    return;
  }
  const again = await send(base, { target: targetId, note: said, attach: c.refs, may_change: false });
  if (again.ok && 'id' in again) {
    c.id = again.id;
    c.state = 'sent';
    save();
    return;
  }
  c.fix = again.ok ? sendWords.missing : again.text;
}

/** Take an instruction back before an agent has it. */
export async function withdrawConvo(c: Convo, base = apiBase()): Promise<void> {
  if (c.id === null) return;
  const out = await withdrawOne(base, c.id);
  if (out.ok) c.state = 'withdrawn';
  else c.fix = out.text;
  save();
}

/* ── RECEIPTS ── */

function keep(c: Convo, r: Receipt): void {
  if (c.receipts.some((k) => k.batch === r.batch)) return;
  c.receipts.push({ ...r, state: 'done' });
  history.push({ batch: r.batch, said: r.said });
}

/** Put back what one receipt says was done, by its batch. */
export async function undoKept(k: Kept, base = apiBase()): Promise<void> {
  if (k.state !== 'done') return;
  k.state = 'busy';
  history.spend(k.batch);
  try {
    const { undoChange } = await import('../record/undo-write.ts');
    const out = await undoChange(base, k.batch);
    if (out.from === 'undone') {
      k.state = 'undone';
      k.said = out.said;
      k.note = undefined;
      void import('../data/live.svelte.ts').then((m) => m.reread());
    } else {
      k.state = 'done';
      k.note = out.fix;
    }
  } catch {
    k.state = 'done';
    k.note = copy.recordNotReached;
  }
  save();
}

/* ── ONE SEND, FROM ANYWHERE ── */

export type Delivery = {
  /** The thing it started from, whose last target this becomes (a row's list, `decide`, `run`, `sign`). */
  kind: string;
  /** `slash`, `auto` or a target's id. */
  target: string;
  /** The target's name and kind, where it is not Slash or Auto. */
  label?: string | undefined;
  targetKind?: TargetKind | undefined;
  mode: Mode;
  note: string;
  /** What the message to Slash is when no note was written. */
  fallback: string;
  attach: string[];
  mayChange: boolean;
  profile?: string | undefined;
  repo?: string | undefined;
};

/**
 * Send it: Slash streams onto the rows' strips; Auto and an agent go through the send door, which answers where it
 * went, or that Slash should take it. A host with no send door sends Auto to Slash. The last target is kept for the kind.
 */
export async function deliver(d: Delivery, base = apiBase()): Promise<{ ok: true; label: string; convo: Convo } | { ok: false; text: string }> {
  const rows = d.attach;
  const remember = (l: Parameters<typeof keepLast>[1]) => {
    keepLast(d.kind, l);
    sends.n++;
  };
  const message = d.note.trim() || d.fallback;
  const toSlash = (mode: Mode) => {
    const convo = askSlash({ refs: rows, message, mode, attach: rows }, base);
    return { ok: true as const, label: convo.to.label, convo };
  };
  if (d.target === 'slash') {
    remember({ target: 'slash', mode: d.mode, label: sendWords.slash });
    return toSlash(d.mode);
  }
  if (d.target === 'auto') remember({ target: 'auto', label: sendWords.auto, kind: 'next' });
  const out = await send(base, {
    target: d.target,
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    attach: rows,
    may_change: d.mayChange,
    ...(d.profile ? { profile: d.profile } : {}),
    ...(d.repo ? { repo: d.repo } : {}),
  });
  if (!out.ok) {
    if (out.missing && d.target === 'auto') return toSlash('auto');
    return { ok: false, text: out.text };
  }
  if ('slash' in out) return toSlash(d.mode === 'deep' ? 'deep' : d.target === 'auto' ? 'auto' : 'quick');
  if (d.target !== 'auto') remember({ target: d.target, label: d.label ?? out.to.label, kind: d.targetKind ?? out.to.kind });
  const convo = addAgent({ refs: rows, id: out.id, to: out.to, note: d.note.trim(), target: d.target === 'auto' ? null : d.target });
  return { ok: true, label: out.to.label, convo };
}
