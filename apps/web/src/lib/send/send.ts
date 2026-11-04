/**
 * "Send to…": a row, a question, a project, a run or a sign handed to Slash or to an agent, typed, with every address it
 * is sent through in this one file.
 *
 * THE DOORS. `targets` lists who can take it now (Slash, Claude on a machine, a session running now, the next agent on a
 * project). `send` hands it over and answers where it went, or that Slash should take it. `one` reads one instruction
 * back while its strip is open, `open` lists what is still in flight for the bell, and `withdraw` takes one back before
 * an agent has picked it up. Slash itself is asked through its own chat door (`slash-chat.ts`), with the mode and what
 * is attached.
 *
 * A HOST WITHOUT ONE OF THESE DOORS answers 404, 405 or 501, and that is `missing`, never an error: the sheet then lists
 * Slash alone, the bell no Sent section, and Auto goes to Slash. Slash always works.
 *
 * PURE BUT FOR THE FETCHES AND THE DEVICE'S MEMORY OF THE LAST TARGET, so `node --test` can hold the parsing.
 */

export type TargetKind = 'slash' | 'mac' | 'session' | 'next';

/** One who can take what is sent: its id for `send`, its name, one line under it, and whether it is running now. */
export type Target = {
  id: string;
  kind: TargetKind;
  label: string;
  detail: string;
  live: boolean;
  project?: string | undefined;
  /** The Claude Code profiles a machine's runner knows, where it said; the sheet offers them as a menu. */
  profiles?: string[] | undefined;
  /** The repositories a machine's runner works in, where it said. */
  repos?: string[] | undefined;
};

export type SendState = 'sent' | 'seen' | 'working' | 'done' | 'needs_you' | 'declined' | 'expired' | 'withdrawn';

export type Receipt = { batch: string; said: string };

/** One instruction as the record holds it. `at` is milliseconds since the epoch. */
export type Sent = { id: string; state: SendState; progress?: string | undefined; reply?: string | undefined; receipts: Receipt[]; at: number; run?: string | undefined };

/** Slash's two ways of answering, and Auto, where Slash picks. */
export type Mode = 'quick' | 'deep' | 'auto';

export type SendBody = {
  target: 'auto' | string;
  note?: string | undefined;
  attach: string[];
  may_change: boolean;
  profile?: string | undefined;
  repo?: string | undefined;
};

/** Where a send went: an instruction an agent will take, Slash (ask it with what is attached), or a plain line why not. */
export type Routed =
  | { ok: true; id: string; to: { kind: TargetKind; label: string } }
  | { ok: true; slash: true }
  | { ok: false; missing: boolean; text: string };

/** Every address this feature talks through, so a server that moves one is answered here and nowhere else. */
export const urls = {
  targets: '/api/send/targets',
  send: '/api/send',
  one: (id: string) => `/api/send/${encodeURIComponent(id)}`,
  open: '/api/send?open=1',
  withdraw: (id: string) => `/api/send/${encodeURIComponent(id)}/withdraw`,
  /** A follow-up to an instruction already sent, said on its strip. A host without it is sent a new instruction instead. */
  reply: (id: string) => `/api/send/${encodeURIComponent(id)}/reply`,
} as const;

/** The feature's words, said in the sheet, on a row's strip and in the bell. */
export const sendWords = {
  sendTo: 'Send to',
  sendToFull: (label: string) => `Send to ${label}`,
  /** The main half's word on a phone, where the full name does not fit beside the glyph. */
  short: 'Send',
  more: 'More ways to send',
  sheet: 'Send to…',
  sendMany: (n: number) => `Send ${n} to…`,
  auto: 'Auto',
  slash: 'Slash',
  quick: 'Quick',
  deep: 'Deep',
  running: 'Running now',
  /** The sheet's title, naming what goes: the one thing by its name, or how many. */
  titleOne: (label: string) => (label ? `Send “${label}”` : 'Send to…'),
  titleMany: (n: number) => `Send ${n} things`,
  to: 'Who takes it',
  find: 'Find who takes it',
  findNone: (q: string) => `No one matches “${q}”.`,
  machines: 'On a machine',
  nextUp: 'Next to start',
  note: 'Note',
  notePlaceholder: 'What should happen, in your words',
  attached: 'Attached',
  attach: 'Attach more',
  attachFind: 'Find a row to attach',
  attachNone: 'Nothing found',
  remove: (label: string) => `Remove ${label}`,
  mayChange: 'Let it make changes',
  mayLine: 'Money, keys, sharing and deletes still come back to you.',
  send: 'Send',
  sending: 'Sending it',
  close: 'Close',
  profile: 'Profile',
  repo: 'Repository',
  anyProfile: 'Its usual profile',
  anyRepo: 'Its usual repository',
  conversation: 'Conversation',
  sentTo: (label: string) => `Sent to ${label}`,
  reply: 'Reply',
  replyPlaceholder: 'Reply',
  undo: 'Undo',
  undone: 'Put back',
  doIt: 'Do it',
  notNow: 'Not now',
  withdraw: 'Withdraw',
  open: 'Open',
  tray: 'Sent',
  trayNone: 'Nothing in flight',
  askSlash: 'Ask Slash',
  handOff: 'Hand it off',
  thinkHarder: 'Think harder',
  thinking: 'Thinking harder…',
  routeMac: (label: string) => `Deep needs a key here. ${label} can take it instead.`,
  toMac: (label: string) => `Send to ${label}`,
  missing: 'That target is not reachable from here. Slash can still take it.',
  unreached: 'It could not be sent. Try again in a moment.',
  sent: (label: string) => `Sent to ${label}.`,
  withdrawn: 'Withdrawn.',
  firstAsk: (title: string) => (title ? `What does “${title}” need next?` : 'What does this need next?'),
  explain: 'Explain this question and compare its answers.',
  sentInPalette: (label: string) => `Sent to ${label}. Its answer shows on the row and under Sent in the bell.`,
} as const;

export const stateWords: Record<SendState, string> = {
  sent: 'Sent',
  seen: 'Seen',
  working: 'Working',
  done: 'Done',
  needs_you: 'Needs you',
  declined: 'Declined',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

/** The states nothing more happens after, so a strip stops asking. */
export const ENDED: ReadonlySet<SendState> = new Set(['done', 'declined', 'expired', 'withdrawn']);

/** How often an open strip, or the bell's tray while it is open, asks again. */
export const POLL_MS = 4000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const strs = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : undefined);
const KINDS: ReadonlySet<string> = new Set(['slash', 'mac', 'session', 'next']);
const STATES: ReadonlySet<string> = new Set(Object.keys(stateWords));
const json = { 'content-type': 'application/json' } as const;
const gone = (status: number) => status === 404 || status === 405 || status === 501;
/** A record method's answer is `{ ok, value }`; a door that answers flat is taken as it stands. */
const flat = (body: unknown): unknown => (isObj(body) && body.ok === true && isObj(body.value) ? body.value : body);

/** A refusal's one sentence, out of whatever JSON body a door answered with. */
function fixIn(body: unknown): string | null {
  if (!isObj(body)) return null;
  const r = isObj(body.refusal) ? body.refusal : isObj(body.error) ? body.error : body;
  return str(r.fix) ?? str(r.message) ?? str(r.text) ?? null;
}

/** One target as the record answered it, or `null` for anything this build does not know. */
export function targetOf(v: unknown): Target | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const label = str(v.label);
  if (!id || !label || typeof v.kind !== 'string' || !KINDS.has(v.kind)) return null;
  const profiles = strs(v.profiles);
  const repos = strs(v.repos);
  return {
    id,
    kind: v.kind as TargetKind,
    label,
    detail: str(v.detail) ?? '',
    live: v.live === true,
    ...(str(v.project) ? { project: v.project as string } : {}),
    ...(profiles && profiles.length > 0 ? { profiles } : {}),
    ...(repos && repos.length > 0 ? { repos } : {}),
  };
}

const atOf = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN);

/** One instruction as the record answered it, or `null`. */
export function sentOf(v: unknown): Sent | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  if (!id || typeof v.state !== 'string' || !STATES.has(v.state)) return null;
  const receipts = Array.isArray(v.receipts)
    ? v.receipts.flatMap((r): Receipt[] => (isObj(r) && str(r.batch) && str(r.said) ? [{ batch: r.batch as string, said: r.said as string }] : []))
    : [];
  const at = atOf(v.at);
  return {
    id,
    state: v.state as SendState,
    ...(str(v.progress) ? { progress: v.progress as string } : {}),
    ...(str(v.reply) ? { reply: v.reply as string } : {}),
    /* THE RUN THAT HAS IT, ELSE THE ONE IT WAS SENT TO. */
    ...(str(v.taken_by) || str(v.to_run) ? { run: (str(v.taken_by) ?? str(v.to_run)) as string } : {}),
    receipts,
    at: Number.isFinite(at) ? at : Date.now(),
  };
}

/** Who can take it now. `null` when the host has no such door, and only Slash is offered. */
export async function targets(base: string, signal?: AbortSignal): Promise<Target[] | null> {
  try {
    const res = await fetch(`${base}${urls.targets}`, signal ? { signal } : {});
    if (!res.ok) return null;
    const body: unknown = flat(await res.json());
    if (!isObj(body) || !Array.isArray(body.targets)) return null;
    return body.targets.flatMap((t) => targetOf(t) ?? []);
  } catch {
    return null;
  }
}

/** Hand it over. Never throws. */
export async function send(base: string, body: SendBody): Promise<Routed> {
  let res: Response;
  try {
    res = await fetch(`${base}${urls.send}`, { method: 'POST', headers: json, body: JSON.stringify(body) });
  } catch {
    return { ok: false, missing: false, text: sendWords.unreached };
  }
  if (gone(res.status)) return { ok: false, missing: true, text: sendWords.missing };
  const out: unknown = flat(await res.json().catch(() => null));
  if (!res.ok || !isObj(out)) return { ok: false, missing: false, text: fixIn(out) ?? sendWords.unreached };
  if (out.route === 'slash') return { ok: true, slash: true };
  const id = str(out.id);
  const to = isObj(out.routed_to) ? out.routed_to : null;
  if (!id) return { ok: false, missing: false, text: fixIn(out) ?? sendWords.unreached };
  const kind = to && typeof to.kind === 'string' && KINDS.has(to.kind) ? (to.kind as TargetKind) : 'next';
  return { ok: true, id, to: { kind, label: (to && str(to.label)) ?? sendWords.auto } };
}

/** One instruction read back. `null` when it could not be read this time. */
export async function one(base: string, id: string, signal?: AbortSignal): Promise<Sent | null> {
  try {
    const res = await fetch(`${base}${urls.one(id)}`, signal ? { signal } : {});
    if (!res.ok) return null;
    return sentOf(flat(await res.json()));
  } catch {
    return null;
  }
}

/** Everything still in flight, newest first. `null` when the host has no such door. */
export async function open(base: string, signal?: AbortSignal): Promise<Sent[] | null> {
  try {
    const res = await fetch(`${base}${urls.open}`, signal ? { signal } : {});
    if (!res.ok) return null;
    const body: unknown = flat(await res.json());
    if (!isObj(body) || !Array.isArray(body.sent)) return null;
    return body.sent.flatMap((s) => sentOf(s) ?? []).sort((a, b) => b.at - a.at);
  } catch {
    return null;
  }
}

/** Take one back before an agent has picked it up. */
export async function withdraw(base: string, id: string): Promise<{ ok: true } | { ok: false; text: string }> {
  try {
    const res = await fetch(`${base}${urls.withdraw(id)}`, { method: 'POST', headers: json, body: '{}' });
    if (res.ok) return { ok: true };
    return { ok: false, text: fixIn(await res.json().catch(() => null)) ?? sendWords.unreached };
  } catch {
    return { ok: false, text: sendWords.unreached };
  }
}

/** A follow-up to an instruction. `missing` where the host has no reply door, and the caller sends a new one instead. */
export async function reply(base: string, id: string, note: string): Promise<{ ok: true } | { ok: false; missing: boolean; text: string }> {
  try {
    const res = await fetch(`${base}${urls.reply(id)}`, { method: 'POST', headers: json, body: JSON.stringify({ note }) });
    if (res.ok) return { ok: true };
    if (gone(res.status)) return { ok: false, missing: true, text: sendWords.missing };
    return { ok: false, missing: false, text: fixIn(await res.json().catch(() => null)) ?? sendWords.unreached };
  } catch {
    return { ok: false, missing: false, text: sendWords.unreached };
  }
}

/* ── WHAT IS ATTACHED ── */

/** One thing attached: how the record names it (`<list>#<seq>`, `decide:<id>`, `run:<id>`, `sign:<id>`) and its name. */
export type Attached = { ref: string; label: string };

/** The kinds of thing a send starts from, each remembering its own last target. A row's kind is its list. */
export const refs = {
  row: (list: string, seq: number): string => `${list}#${seq}`,
  question: (id: string): string => `decide:${id}`,
  run: (id: string): string => `run:${id}`,
  sign: (id: string): string => `sign:${id}`,
} as const;

const ROW_HREF = /\/r\/([a-z][a-z0-9_]*)\/([1-9][0-9]*)(?:[/?#]|$)/u;

/** A row's ref from the address it is opened at, or `null` for anything that is not a row. */
export function refOfHref(href: string): string | null {
  const m = ROW_HREF.exec(href);
  return m ? `${m[1]}#${m[2]}` : null;
}

/** The address a ref opens at, where it is a row. */
export function hrefOfRef(ref: string): string | null {
  const run = /^run:S([1-9][0-9]*)$/u.exec(ref);
  if (run) return `/r/session/${run[1]}`;
  const m = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u.exec(ref);
  return m ? `/r/${m[1]}/${m[2]}` : null;
}

/* ── THE LAST TARGET, PER KIND OF THING ── */

/** What the main half of the button sends to: Slash with a mode, or a target by its id and name. */
export type Last = { target: 'slash'; mode: Mode; label: string } | { target: string; label: string; kind: TargetKind };

export const LAST_KEY = 'bd_send_last';
const SLASH_QUICK: Last = { target: 'slash', mode: 'quick', label: 'Slash' };

/** The last target for this kind of thing on this device, else Slash, quick. Storage that throws is Slash. */
export function lastFor(kind: string): Last {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
    const v = isObj(all) ? all[kind] : null;
    if (!isObj(v) || !str(v.target) || !str(v.label)) return SLASH_QUICK;
    if (v.target === 'slash') return { target: 'slash', mode: v.mode === 'deep' ? 'deep' : v.mode === 'auto' ? 'auto' : 'quick', label: v.label as string };
    return { target: v.target as string, label: v.label as string, kind: typeof v.kind === 'string' && KINDS.has(v.kind) ? (v.kind as TargetKind) : 'next' };
  } catch {
    return SLASH_QUICK;
  }
}

export function keepLast(kind: string, last: Last): void {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
    localStorage.setItem(LAST_KEY, JSON.stringify({ ...(isObj(all) ? all : {}), [kind]: last }));
  } catch {
    /* A full or blocked store: the button sends to Slash next time. */
  }
}

/* ── WHAT AUTO WILL DO, IN ONE LINE ── */

/**
 * Auto's one line, from who is reachable now: a session running on the thing's project takes it, else Slash answers and
 * passes it to Claude on a machine when it needs code or a machine, else Slash answers. The record decides; this says
 * what it most likely will, before the press.
 */
export function autoLine(list: readonly Target[] | null, project: string | null): string {
  const live = list?.find((t) => t.kind === 'session' && t.live && project !== null && t.project === project);
  if (live) return `The session working on it now takes it: ${live.label}.`;
  const mac = list?.find((t) => t.kind === 'mac');
  if (mac) return `Slash answers it, and hands it to ${mac.label} if it needs code or a machine.`;
  return 'Slash answers it here.';
}

/** "2 min ago", short, for a strip's line. */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
