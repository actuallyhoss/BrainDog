/**
 * The conversations with Slash, as both the panel and the Slash page see them: the list, and what this device remembers
 * about them. One module, so a rename in one is the same row in the other, and the two can never disagree.
 *
 * THE RECORD IS THE LIST. What this device keeps of it is only so the panel draws at once and has something to show when
 * the record cannot be reached; once the record answers, its list replaces what was kept, so a conversation deleted on
 * another device does not come back here. Other tabs hear about a change over one `BroadcastChannel`.
 *
 * WHAT THE DEVICE REMEMBERS, ALL UNDER `threadsKey`, so it is one person's on one BrainDog and a sign-out drops it
 * (`signed-out.ts`, by the prefix): the list, which conversation was open, and each half-typed question. How far a
 * conversation was scrolled is the tab's alone, in `sessionStorage`.
 *
 * A DRAFT IS THE SAME OBJECT IN BOTH PLACES (`draftOf`), so a field bound to it in the panel and one on the page show the
 * same words. `NEW` is the draft of a conversation that does not exist yet.
 */

import { apiBase } from '../at.ts';
import type { Mention } from '../mention/mention.ts';
import { keptThreads, threads as recordThreads, THREADS_CAP, type KeptThread } from './slash-chat.ts';

export const NEW = 'new';
const DRAFTS_KEPT = 30;
const SCROLL_KEY = 'bd_slash_scroll';

export const kept = $state({
  items: [] as KeptThread[],
  /** The record has answered at least once for this person. */
  read: false,
  /** When the list was last read, for its "2h". */
  now: Date.now(),
});

/** Who the device's memory is under (`threadsKey`): the person and the BrainDog, `null` while nobody is known. */
const device = $state({ key: null as string | null });

const stored = (key: string | null, suffix: string): string | null => {
  if (key === null) return null;
  try {
    return localStorage.getItem(`${key}:${suffix}`);
  } catch {
    return null;
  }
};
const store = (key: string | null, suffix: string, value: string | null): void => {
  if (key === null) return;
  try {
    if (value === null) localStorage.removeItem(`${key}:${suffix}`);
    else localStorage.setItem(`${key}:${suffix}`, value);
  } catch {
    /* A full or blocked store remembers nothing, and nothing breaks. */
  }
};

/** Whose this device's memory is now. A different person starts with their own list drawn and nothing of the last one's. */
export function deviceIs(key: string | null): void {
  if (key === device.key) return;
  device.key = key;
  kept.items = key === null ? [] : keptThreads(key);
  kept.read = false;
  closeChannel();
  openChannel();
}

/* ── the list ───────────────────────────────────────────────────────────────────────────────────────────────────── */

let asked = 0;
/** What to do when another tab says the conversations changed. */
let onOther: (() => void) | null = null;

/** Read the list again, the kept one standing until the record answers. Never throws. */
export async function refreshList(base = apiBase()): Promise<void> {
  const key = device.key;
  const mine = ++asked;
  const list = await recordThreads(base);
  if (mine !== asked || key !== device.key || list === null) return;
  kept.items = list;
  kept.read = true;
  kept.now = Date.now();
  if (key === null) return;
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, THREADS_CAP)));
  } catch {
    /* As above. */
  }
}

const json = { 'content-type': 'application/json' } as const;

async function door(base: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/slash/conversation`, { method: 'POST', headers: json, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Call a conversation something, or back to its first words with no words. Drawn at once; false when the record refused. */
export async function renameThread(id: string, name: string, base = apiBase()): Promise<boolean> {
  const said = name.replace(/\s+/gu, ' ').trim();
  const was = kept.items;
  if (said !== '') kept.items = kept.items.map((t) => (t.id === id ? { ...t, title: said } : t));
  const ok = await door(base, { id, name: said });
  if (!ok) kept.items = was;
  else if (said === '') await refreshList(base);
  tellTabs();
  return ok;
}

/** Delete a conversation for good, gone from the list at once. False when the record refused, and it is listed again. */
export async function removeFromRecord(id: string, base = apiBase()): Promise<boolean> {
  const was = kept.items;
  kept.items = kept.items.filter((t) => t.id !== id);
  const ok = await door(base, { id, remove: true });
  if (!ok) kept.items = was;
  else dropDraft(id);
  tellTabs();
  return ok;
}

/** The conversations matching what is typed: every word, as the start of a word or anywhere in one. */
export function matching(items: readonly KeptThread[], query: string): readonly KeptThread[] {
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((t) => {
    const title = t.title.toLowerCase();
    return words.every((w) => title.includes(w));
  });
}

/* ── other tabs ─────────────────────────────────────────────────────────────────────────────────────────────────── */

let channel: BroadcastChannel | null = null;

function closeChannel(): void {
  channel?.close();
  channel = null;
}
function openChannel(): void {
  if (device.key === null || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(device.key);
  channel.onmessage = () => onOther?.();
}

/** Tell this person's other tabs that the conversations changed. */
export function tellTabs(): void {
  try {
    channel?.postMessage(1);
  } catch {
    /* A closed channel has nobody to tell. */
  }
}

/** What this tab does when another changes something: `thread.svelte.ts` reads the list and the open thread again. */
export function whenOtherTab(f: () => void): void {
  onOther = f;
}

/* ── which one was open ─────────────────────────────────────────────────────────────────────────────────────────── */

/** The conversation left open on this device, or `null` for a new one. */
export const keptOpen = (): string | null => stored(device.key, 'open') || null;
export const keepOpen = (id: string | null): void => store(device.key, 'open', id);

/* ── half-typed questions ───────────────────────────────────────────────────────────────────────────────────────── */

export type Draft = { text: string; mentions: Mention[] };
type StoredDraft = { t: string; m: Mention[]; at: number };

const drafts = new Map<string, Draft>();

const allStored = (key: string | null): Record<string, StoredDraft> => {
  try {
    const v: unknown = JSON.parse(stored(key, 'drafts') ?? '{}');
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, StoredDraft>) : {};
  } catch {
    return {};
  }
};

/** The words waiting in a conversation's field, the same object wherever the field is drawn. */
export function draftOf(thread: string): Draft {
  const key = device.key;
  const at = `${key ?? ''}|${thread}`;
  const had = drafts.get(at);
  if (had) return had;
  const s = allStored(key)[thread];
  const made = $state<Draft>({ text: typeof s?.t === 'string' ? s.t : '', mentions: Array.isArray(s?.m) ? s.m : [] });
  drafts.set(at, made);
  return made;
}

/** Write a conversation's draft down, or take it off when the field is empty. */
export function keepDraft(thread: string, draft: Draft, now = Date.now()): void {
  const key = device.key;
  if (key === null) return;
  const all = allStored(key);
  const had = all[thread];
  if (draft.text === '') {
    if (had === undefined) return;
    delete all[thread];
  } else {
    if (had?.t === draft.text && (had.m ?? []).length === draft.mentions.length) return;
    all[thread] = { t: draft.text, m: $state.snapshot(draft.mentions) as Mention[], at: now };
  }
  const newest = Object.entries(all)
    .sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))
    .slice(0, DRAFTS_KEPT);
  store(key, 'drafts', newest.length === 0 ? null : JSON.stringify(Object.fromEntries(newest)));
}

function dropDraft(thread: string): void {
  const d = drafts.get(`${device.key ?? ''}|${thread}`);
  if (d) {
    d.text = '';
    d.mentions = [];
  }
  keepDraft(thread, { text: '', mentions: [] });
}

/** A new conversation was given its id: what was being typed in it goes with it, and the next new one starts empty. */
export function draftMoved(id: string): void {
  const from = draftOf(NEW);
  if (from.text === '') return;
  const to = draftOf(id);
  to.text = from.text;
  to.mentions = from.mentions;
  keepDraft(id, to);
  from.text = '';
  from.mentions = [];
  keepDraft(NEW, from);
}

/* ── how far it was scrolled ────────────────────────────────────────────────────────────────────────────────────── */

const readScroll = (): Record<string, number> => {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? '{}');
    return typeof v === 'object' && v !== null ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
};
let scrolled: Record<string, number> | null = null;

/** Where a conversation was left on one surface, or `null`: at its end, where a new answer is. */
export const scrollOf = (surface: string, id: string): number | null => (scrolled ??= readScroll())[`${surface}:${id}`] ?? null;

/** Remember where it is; `null` is at its end. */
export function keepScroll(surface: string, id: string, top: number | null): void {
  const all = (scrolled ??= readScroll());
  const at = `${surface}:${id}`;
  if ((all[at] ?? null) === top) return;
  if (top === null) delete all[at];
  else all[at] = Math.round(top);
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(all));
  } catch {
    /* As above. */
  }
}
