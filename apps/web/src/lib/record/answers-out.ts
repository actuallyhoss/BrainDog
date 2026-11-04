/**
 * THE ANSWERS THIS BROWSER HAS GIVEN AND THE RECORD HAS NOT YET SHOWN BACK, in `localStorage`, because it is the one store
 * that is written before a reload can happen and read before anything is drawn.
 *
 * WHY (the owner, 4 Nov: "i keep closing out the stuff in needs you, and when i refresh, they show back again"). An answer is
 * held six seconds for its Undo and sent as the page goes (`press.ts`), and a plain `fetch` begun then was answered
 * "This page is being left" by the client without going out, so a reload inside the six seconds lost the answer with no
 * word said. And an answer the record had taken still came back from every drawing older than it: the kept picture of
 * Today (`kept-frame.ts`), the local copy (`local.ts`), what the tab kept, the record's own last drawing (`behind`).
 *
 * SO A PRESS IS WRITTEN HERE FIRST, SYNCHRONOUSLY, and two rules read it:
 * - NOTHING DRAWS IT. The picture (`app.html`), Today and Needs you take a question listed here out of what they draw
 *   (`withoutClosed`), whichever store it came from, so kept copies stay kept and the open stays instant.
 * - IT IS NOT LOST. What is still `held` or `sent` when the next page opens is sent again (`replayAnswers` in
 *   `decide-write.ts`). The record refuses a second answer to a closed question, so a send that did land costs nothing.
 *   A refusal takes it off this list and says so, and the question is back, because it really is open.
 *
 * A LIST AND NOT A QUEUE. `offline.ts` keeps no writes for good reason, and this holds to it: only a press made moments
 * ago is sent again (`REPLAY_MS`). Older than that it is dropped, and said.
 *
 * HOW LONG. Landed, an answer stays until no copy can be older than it, `KEPT_MS`, the week the copies live, for a kept
 * copy being drawn. A read from the record itself is believed `LAG_MS` after the answer landed, so a question reopened
 * from another device comes back. Undo here takes it off at once. It goes with the copies on a sign-out (`wipeLocal`).
 *
 * PURE ENOUGH FOR NODE: no rune and no `$lib`, and every browser global is read inside a function.
 */

import type { Verdict } from './decide-write.ts';

/** The key, spelt again in `app.html`, which reads it before any of this has loaded. */
export const OUT_KEY = 'bd_answers_out';
/** How long a kept copy can be, so how long an answer that landed is kept from one (`WEEK` in `offline.ts`). */
export const KEPT_MS = 7 * 24 * 3_600_000;
/** How long after an answer landed a read from the record is still not believed about it. Reads have taken 8 s. */
export const LAG_MS = 60_000;
/** How old a press may be and still be sent again on the next open. */
export const REPLAY_MS = 10 * 60_000;
/** How long an answer is held for its Undo before it is sent (`hold` in `press.ts`, which says it to the screens). */
export const HOLD_MS = 6_000;
/** The most kept: a person does not answer this many in a week before a copy has been drawn again. */
const MOST = 200;

export type Out = {
  /** The question. */
  id: string;
  /** The record, as `apiBase()` says it. */
  b: string;
  /** When it was pressed. */
  at: number;
  /** `held` for its Undo, `sent` with no answer heard yet, `landed` once the record took it. */
  s: 'held' | 'sent' | 'landed';
  /** When it landed. `app.html` reads this. */
  l?: number;
  /** The decision it wrote, so an Undo of that decision takes it off. */
  d?: string;
  /** What was answered, for sending again. Gone once it landed. */
  v?: Verdict;
  /** The question's words, for saying it did not go through. */
  t?: string;
  /** How many `boot` said waited when it was pressed (`waits.svelte.ts`). */
  n?: number;
  /** It was put off, not answered: it stays out of what waits now, and is drawn where what is put off is. */
  p?: 1;
};

const store = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

function all(now: number = Date.now()): Out[] {
  try {
    const raw = store()?.getItem(OUT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as Out[]).filter((o) => typeof o?.id === 'string' && now - (o.l ?? o.at) < KEPT_MS) : [];
  } catch {
    return [];
  }
}

const watchers = new Set<() => void>();
const told = (): void => {
  for (const fn of watchers) fn();
};

function save(list: readonly Out[]): void {
  try {
    const s = store();
    if (s) list.length === 0 ? s.removeItem(OUT_KEY) : s.setItem(OUT_KEY, JSON.stringify(list.slice(-MOST)));
  } catch {
    /* A browser that keeps nothing still draws the screen it is on, and the answer still goes. */
  }
  told();
}

/** Told when the list moves, here or in another tab, for a screen to draw again. The function back stops it. */
export function onOut(fn: () => void): () => void {
  watchers.add(fn);
  return () => void watchers.delete(fn);
}
let hearing = false;
function hearTabs(): void {
  if (hearing || typeof globalThis.addEventListener !== 'function') return;
  hearing = true;
  globalThis.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === OUT_KEY || e.key === null) told();
  });
}

/** Whether this page is going: what fails now is not a refusal anybody can hear, and the next open sends it again. */
let going = false;
export const pageGoing = (): boolean => going;
if (typeof globalThis.addEventListener === 'function') {
  /* FROM `beforeunload`, AS THE CLIENT'S OWN LEAVING IS: a call out through the worker is failed before `pagehide` comes,
     and that failure says nothing about the record, which measured took the write. A leave called off is over in a moment. */
  globalThis.addEventListener('beforeunload', () => {
    going = true;
    setTimeout(() => (going = false), 3_000);
  });
  globalThis.addEventListener('pagehide', () => (going = true));
  globalThis.addEventListener('pageshow', () => (going = false));
}

const put = (one: Out): void => save([...all().filter((o) => !(o.id === one.id && o.b === one.b)), one]);

/** Pressed, and held for its Undo. */
export function heldOut(b: string, id: string, v: Verdict, t?: string, n?: number, at: number = Date.now()): void {
  hearTabs();
  put({ id, b, at, s: 'held', v, ...(t ? { t } : {}), ...(n === undefined ? {} : { n }) });
}

/** Going out now: from every way a question is answered (`writeDecision`), so a press with no hold is listed too. */
export function sentOut(b: string, id: string, v: Verdict, at: number = Date.now()): void {
  hearTabs();
  const was = all().find((o) => o.id === id && o.b === b);
  put({ ...(was ?? {}), id, b, at: was?.at ?? at, s: 'sent', v });
}

/** The record took it: no more to send, and still kept from anything older than now. */
export function landedOut(b: string, id: string, decision: string | null, at: number = Date.now()): void {
  const was = all().find((o) => o.id === id && o.b === b);
  const { v, t: _t, ...rest } = was ?? { id, b, at };
  /* PUT OFF, IT IS STILL A QUESTION, and now belongs on the put-off queue (`withoutClosed`). */
  const parked = v !== undefined && 'defer' in v;
  put({ ...rest, s: 'landed', l: at, ...(decision ? { d: decision } : {}), ...(parked ? { p: 1 as const } : {}) });
  /* AND ONCE THE RECORD'S OWN READS ARE BELIEVED AGAIN, the screen looks again, in case it was reopened meanwhile. */
  setTimeout(told, LAG_MS + 50);
}

/** Undo, or the record refused it, or it was taken only in part: the question is open, and may be drawn. */
export function dropOut(b: string, id: string): void {
  const list = all();
  if (list.some((o) => o.id === id && o.b === b)) save(list.filter((o) => !(o.id === id && o.b === b)));
}

/** A decision undone on the record, whichever screen did it: its question is open again. */
export function dropDecision(decision: string): void {
  const list = all();
  if (list.some((o) => o.d === decision)) save(list.filter((o) => o.d !== decision));
}

/** Everything: a sign-out, a 401, what goes with the copies. */
export function dropAllOut(): void {
  try {
    store()?.removeItem(OUT_KEY);
  } catch {
    /* Nothing was kept. */
  }
  told();
}

/** What is still to be heard of on `b`: pressed, and not known to have landed. */
export const outWaiting = (b: string, now: number = Date.now()): Out[] => all(now).filter((o) => o.b === b && o.s !== 'landed');


/* THE CARDS DRAWING THEIR OWN ANSWERED LINE NOW, with its Undo: that row stays until the card lets it go. */
const lines = new Set<string>();
export function lineHere(id: string): () => void {
  lines.add(id);
  return () => {
    lines.delete(id);
    told();
  };
}

/**
 * The questions not to draw on `b`. `kept`: what is being drawn is a copy, which may be older than any answer on the list.
 * Otherwise it is the record's own read: only an answer not landed yet, or landed within `LAG_MS`, can be missing from it.
 */
export function closedIds(b: string, kept: boolean, now: number = Date.now(), withLines = false): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const o of all(now)) {
    if (o.b !== b || (lines.has(o.id) && !withLines)) continue;
    if (kept || o.s !== 'landed' || now - (o.l ?? 0) < LAG_MS) ids.add(o.id);
  }
  return ids;
}

type Queued = { queue?: unknown; total?: unknown; counted?: unknown; waiting?: unknown; source?: unknown };

/**
 * A page's blocks with the questions in `ids` taken off every queue, and its counts with them. THE SAME ARRAY WHEN THERE
 * WAS NOTHING TO TAKE, so a screen holding its answer by identity draws nothing again for it. A count over the questions
 * the browser cannot move (`waiting`) goes, as the local copy's own `decideSpots` does.
 */
export function withoutClosed<B>(blocks: readonly B[], ids: ReadonlySet<string>): readonly B[] {
  if (ids.size === 0) return blocks;
  let moved = false;
  const parked = new Set(all().flatMap((o) => (o.p === 1 ? [o.id] : [])));
  const next = blocks.map((b) => {
    const q = (b as Queued | null)?.queue;
    if (!Array.isArray(q)) return b;
    const later = (b as Queued).source === 'governance.later';
    const rows = q.filter((r) => {
      const id = (r as { id?: unknown } | null)?.id as string;
      return !ids.has(id) || (later && parked.has(id));
    });
    if (rows.length === q.length) return b;
    moved = true;
    const gone = q.length - rows.length;
    const { waiting: _waiting, ...own } = b as Queued;
    return {
      ...own,
      queue: rows,
      ...(typeof own.total === 'number' ? { total: Math.max(0, own.total - gone) } : {}),
      ...(typeof own.counted === 'number' ? { counted: Math.max(0, own.counted - gone) } : {}),
    } as B;
  });
  return moved ? next : blocks;
}

/** An answer of a page's with `ids` taken out, or the same answer. */
export function pageWithout<G extends { from: string }>(got: G, ids: ReadonlySet<string>): G {
  if (got.from !== 'live' || ids.size === 0) return got;
  const live = got as unknown as { page: { blocks: readonly unknown[] } };
  const blocks = withoutClosed(live.page.blocks, ids);
  return blocks === live.page.blocks ? got : ({ ...got, page: { ...live.page, blocks } } as unknown as G);
}
