/**
 * THE RESERVED SLOT (d2: "a shape per kind, one slot for suggestions"; the design book's `reserved_slot`):
 * the one place on a page, at its head, where BrainDog's own suggestion shows, one at a time, with its suggested answer
 * as the button and Not now beside it. Nothing else is drawn there, and it is empty when there is nothing to suggest.
 *
 * WHAT IT SUGGESTS COMES FROM THE QUESTIONS ALREADY OPEN, never from a source of its own, and only two kinds of them:
 * a question about this very page or the row it is about (a project's page and a question about that project), and
 * after it what BrainDog asked itself, a rule (`rule:<id>`) or Slash. Each in the record's own ranking
 * (`governance.open` is read ranked). NEVER A BORROWED ONE: the first of Needs you used to fill the slot when nothing
 * else did, so one question about Portage's mail headed Today, Work, Money, People and Settings alike. A question that is about nothing on the page waits in Needs you, where it is asked.
 *
 * AND NOWHERE IT IS NOT A PLACE TO DECIDE (`slotPlace`): Settings, a person, a skill, a run, Health and Calendar draw no
 * slot at all.
 *
 * ONLY WHAT ONE PRESS MAY ANSWER. A question with one suggested answer, and not one that is hard to undo (`cost: undo`),
 * which Needs you asks with its whole card. A question the page already draws in its own queue is not drawn twice.
 *
 * NOT NOW IS THE READER'S OWN AND CHANGES NOTHING IN THE RECORD: the question leaves the slot on this device and stays
 * where it waits, in Needs you, for whenever. So there is nothing to undo, and the next suggestion takes its place.
 *
 * PURE BUT FOR THE READ AND THE DEVICE'S MEMORY, both handed in or guarded, so `slot.test.ts` holds it in Node.
 */

import { createClient } from '@braindog/client';

import { askEarly, takeEarly } from '../data/early-asks.ts';

type Fetch = typeof fetch;

/** A question as the slot reads it: the few parts of a `governance.open` queue's question it draws and answers. */
export type SlotQuestion = {
  id: string;
  who: string;
  question: string;
  why: string;
  cost?: string | undefined;
  about?: string | undefined;
  drafted_by?: string | undefined;
  /** What it is about as one key (`cause.ts`): `drew:` on a drawing BrainDog made unasked (`packages/record/src/drew.ts`). */
  cause?: string | undefined;
  options: readonly { key: string; label: string; because: string; recommended: boolean }[];
};

/** The one suggestion drawn: the question, the answer the button gives, and whose it is. */
export type SlotPick = { question: SlotQuestion; answer: { key: string; label: string; because: string }; own: boolean };

export const slotWords = {
  label: 'BrainDog suggests',
  own: 'BrainDog suggests',
  asked: 'Waiting on you',
  notNow: 'Not now',
  open: 'Open in Needs you',
  done: (label: string) => `Done: ${label}.`,
  drew: 'BrainDog drew this',
  keep: 'Keep it',
  later: 'Set aside here. It still waits in Needs you.',
  why: 'This one needs a reason, so it opens in Needs you.',
};

const isBag = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether a question is a drawing BrainDog made unasked: its cause says so (`drew.ts` `DREW_CAUSE`). */
export const isDrawing = (q: Pick<SlotQuestion, 'cause'>): boolean => typeof q.cause === 'string' && q.cause.startsWith('drew:');

/**
 * The answers a question offers in the slot: its own, or for a drawing that is a change to a page, which carries none
 * (the drawer names accept and reject), Keep it as the one suggested answer. Throw away is asked in Needs you.
 */
const answersOf = (q: SlotQuestion): SlotQuestion['options'] =>
  q.options.length === 0 && isDrawing(q) ? [{ key: 'accept', label: slotWords.keep, because: q.why, recommended: true }] : q.options;

/** Whether BrainDog itself asked: a rule, or Slash, or a question Slash drafted for whoever filed it. */
export const isOwn = (q: Pick<SlotQuestion, 'who' | 'drafted_by'>): boolean =>
  q.who === 'slash' || q.who.startsWith('rule:') || (typeof q.drafted_by === 'string' && q.drafted_by.startsWith('slash'));

/** The row a page is about, as a question's `about` may name it: by its spoken id (`things#1`) or by its title. */
export type SlotRow = { spoken: string; title: string };

/**
 * Whether a question is about this page: its `about` names the page by its declaration or its address, or names the
 * row the page is about, by its spoken id or its title, in any case.
 */
const aboutPage = (q: SlotQuestion, page: string | null, row: SlotRow | null): boolean => {
  const about = q.about?.trim().toLowerCase();
  if (!about) return false;
  if (page !== null && (about === `page.${page}` || about === page)) return true;
  return row !== null && (about === row.spoken.toLowerCase() || (row.title.trim() !== '' && about === row.title.trim().toLowerCase()));
};

/**
 * The suggestion the slot draws, or `null`.
 *
 * `drawn` is every question the page already shows in its own queue, and `dismissed` every one this device set aside.
 * `row` is the row the page is about, and `own: false` a page where only a question about it may stand.
 */
export function slotPick(
  questions: readonly SlotQuestion[],
  o: { page: string | null; row?: SlotRow | null; own?: boolean; drawn: ReadonlySet<string>; dismissed: ReadonlySet<string> },
): SlotPick | null {
  const answerable = questions.flatMap((question) => {
    if (o.drawn.has(question.id) || o.dismissed.has(question.id) || question.cost === 'undo') return [];
    const suggested = answersOf(question).filter((x) => x.recommended);
    if (suggested.length !== 1) return [];
    const [answer] = suggested;
    return answer ? [{ question, answer: { key: answer.key, label: answer.label, because: answer.because }, own: isOwn(question) }] : [];
  });
  const row = o.row ?? null;
  /* A DRAWING IS NEVER BORROWED: it is a change to one page, so it is offered on that page and waits in Needs you
     everywhere else. Lent as BrainDog's own, "I drew Pocketlab's plan as a path of stages" headed every Money page,
     Agents, Dashboard and Scripts (live verify, 2 Nov). */
  return answerable.find((p) => aboutPage(p.question, o.page, row)) ?? (o.own === false ? null : answerable.find((p) => p.own && !isDrawing(p.question))) ?? null;
}

/** What a page tells the slot about itself: its address, the row it is about, and the template it was drawn from. */
export type SlotPage = {
  page: string;
  param?: { register: string; seq: number; title: string } | undefined;
  for?: { register: string } | undefined;
  look?: { page: string | null } | null | undefined;
};

/**
 * THE PAGES THAT DRAW NO SLOT: Settings, a person, a skill, a run, Health and Calendar. Each is a place to read or set
 * something, not to decide, and a question there was always someone else's. Named by the page's address or the template
 * its look was laid over; no list is named, since a page that is a row of a list carries the look it was drawn from.
 */
const QUIET_PAGES: ReadonlySet<string> = new Set(['settings', 'health', 'calendar']);
const QUIET_LOOKS: ReadonlySet<string> = new Set(['someone', 'skill', 'run', 'health', 'calendar']);

/** Where the slot stands on a page, or `null` on a page that draws none: the page's address and the row it is about. */
export function slotPlace(p: SlotPage): { page: string; row: SlotRow | null } | null {
  if (QUIET_PAGES.has(p.page) || (p.look?.page && QUIET_LOOKS.has(p.look.page))) return null;
  return { page: p.page, row: p.param ? { spoken: `${p.param.register}#${String(p.param.seq)}`, title: p.param.title } : null };
}

/**
 * The questions a page's own queues already draw: every one where the queue is drawn whole, and the first few where it
 * is drawn compact (`compact`, `queue-answer.ts` `COMPACT_MOST`), which is all a reader sees of it without a press.
 */
export function drawnIn(blocks: readonly { kind: string; source?: string | undefined; drawn?: boolean | undefined; queue?: readonly unknown[] | undefined }[], compact: number | null): Set<string> {
  const out = new Set<string>();
  for (const b of blocks) {
    if (b.kind !== 'queue' || b.source !== 'governance.open' || b.drawn === false) continue;
    for (const q of compact === null ? (b.queue ?? []) : (b.queue ?? []).slice(0, compact)) if (isBag(q) && typeof q.id === 'string') out.add(q.id);
  }
  return out;
}

/** A question the record sent, when it is one the slot can draw, checked field by field as `page-live.ts` checks a queue. */
export function slotQuestion(v: unknown): SlotQuestion | null {
  if (!isBag(v) || typeof v.id !== 'string' || typeof v.who !== 'string' || typeof v.question !== 'string' || typeof v.why !== 'string' || !Array.isArray(v.options)) return null;
  const options = v.options.filter(
    (x): x is SlotQuestion['options'][number] => isBag(x) && typeof x.key === 'string' && typeof x.label === 'string' && typeof x.because === 'string' && typeof x.recommended === 'boolean',
  );
  if (options.length !== v.options.length) return null;
  return {
    id: v.id,
    who: v.who,
    question: v.question,
    why: v.why,
    ...(typeof v.cost === 'string' ? { cost: v.cost } : {}),
    ...(typeof v.about === 'string' ? { about: v.about } : {}),
    ...(typeof v.drafted_by === 'string' ? { drafted_by: v.drafted_by } : {}),
    ...(typeof v.cause === 'string' ? { cause: v.cause } : {}),
    options,
  };
}

/** How many open questions the slot reads on a page that draws no queue of its own. */
export const SLOT_READ = 20;

/**
 * The open questions, ranked as Needs you ranks them and then agents' suggestions from their shelf, on a page that has
 * no queue of its own to read them from: a `governance.open` queue and a `governance.apart` one drawn by `previewPage`,
 * which writes nothing. A drawing BrainDog made unasked waits on the shelf, and the slot is where it is offered. A read
 * that fails is no suggestion.
 */
export async function readSlot(base: string, io?: Fetch, ahead = false): Promise<SlotQuestion[]> {
  const body = {
    page: 'slot',
    title: 'Suggestion',
    blocks: [
      { kind: 'queue', source: 'governance.open', limit: SLOT_READ },
      { kind: 'queue', source: 'governance.apart', limit: SLOT_READ },
    ],
  };
  try {
    const out = await createClient({ base, ...(io ? { fetch: io } : {}), ...(ahead ? { ahead } : {}) }).call<{ blocks?: unknown }>('previewPage', { body });
    if (!out.ok) return [];
    const blocks: unknown[] = Array.isArray(out.value.blocks) ? out.value.blocks : [];
    const queue = blocks.flatMap((block) => (isBag(block) && Array.isArray(block.queue) ? (block.queue as unknown[]) : []));
    return queue.map(slotQuestion).filter((q): q is SlotQuestion => q !== null);
  } catch {
    return [];
  }
}

/* ── asked with the page's first read ───────────────────────────────────── */

const slotKey = (base: string): string => `${base} slot`;

/**
 * The page's suggestion, asked as soon as the page's own first answer is in hand (`page-live.ts`, the page opened by its
 * address), and taken by the slot when it draws (`SuggestionSlot.svelte`), which asked only after the page had drawn
 * and the browser was next idle (speed-e SE3). Not for a page that is no place to decide (`slotPlace`), nor one that
 * draws its own queue of questions, where the slot reads from that queue and asks nothing.
 */
export function askSlot(base: string, page: SlotPage, blocks: readonly { kind?: unknown; source?: unknown; drawn?: unknown; where?: unknown }[]): void {
  /* A QUEUE OF ITS OWN, drawn, or narrowed to the page's own questions (`where`), which keeps the slot off the page
     whether or not it drew (`PageBody.svelte` `ownQuestions`). */
  const own = (b: (typeof blocks)[number]): boolean => b.kind === 'queue' && b.source === 'governance.open' && (b.drawn !== false || b.where !== undefined);
  if (slotPlace(page) === null || blocks.some(own)) return;
  askEarly(slotKey(base), () => readSlot(base, undefined, true));
}

/** The suggestion asked ahead for the page at `base`, handed once while fresh: `null` when the slot reads for itself. */
export const takeSlot = (base: string): Promise<SlotQuestion[] | null> | null => takeEarly<SlotQuestion[]>(slotKey(base));

/** Where this device keeps what it set aside, and the most it keeps. */
const KEPT = 'braindog:slot:aside';
const KEPT_MOST = 200;

/** The questions this device set aside. Storage that cannot be read is none set aside. */
export function setAside(store: Pick<Storage, 'getItem'> | null = guarded()): Set<string> {
  try {
    const got = JSON.parse(store?.getItem(KEPT) ?? '[]') as unknown;
    return new Set(Array.isArray(got) ? got.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Sets one aside on this device, keeping the newest `KEPT_MOST`. Storage that cannot be written forgets it on reload. */
export function putAside(id: string, store: Pick<Storage, 'getItem' | 'setItem'> | null = guarded()): Set<string> {
  const now = [...setAside(store)].filter((x) => x !== id);
  now.push(id);
  const kept = now.slice(-KEPT_MOST);
  try {
    store?.setItem(KEPT, JSON.stringify(kept));
  } catch {
    /* A private window, or storage turned off: it is set aside until the page is read again. */
  }
  return new Set(kept);
}

function guarded(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
