/**
 * THE DRAFTS FROM A STRANGER'S FIRST WORDS, held for the tab while the model reads and until each is kept or let go
 * (`first-drafts.ts` says what a draft is and why nothing here writes).
 *
 * BEGUN ON THE MADE SCREEN, SHOWN ON TODAY. The made screen starts the read the moment it opens and says, in one line,
 * that it is reading and then what it found; Today draws the drafts at its top, where the first things are told. The
 * read outlives the move between the two (this module's state), and a reload (the tab's `sessionStorage`, by the
 * BrainDog's own address), so the model is asked once for one sentence.
 *
 * LIGHT ON PURPOSE: Today imports this on every open, so the lists and the model's door are loaded only when a read
 * begins (`import()` below), never on Today's cold path.
 *
 * NEVER BLOCKS AND NEVER HANGS: the read has twelve seconds from when it began (`FIRST_DRAFTS_MS`) and no more, a host with no model or a month spent
 * is no drafts and no word, and what the rules built stands either way.
 */

import type { FirstDraft } from './first-drafts.ts';

export type DraftsState = 'reading' | 'ready' | 'none';

/** What a read is begun with, kept so a reload mid-read can ask again. */
export type Begin = {
  /** The BrainDog's own address (`apiBase()`), which keys what is kept. */
  base: string;
  said: string;
  /** What the build already wrote from the same words, never offered again. */
  built: { register: string; fields: Record<string, unknown> }[];
  /** The lists this BrainDog holds, by id. */
  registers: string[];
  currency: string | null;
  me: string | null;
  today: string;
};

export type Kept = {
  base: string;
  state: DraftsState;
  /** When the read began, so a reload long after an interrupted read does not ask again. */
  at: number;
  summary: string | null;
  /** What the model found, kept or not; the card adds Tell's own reading of the words beside it. */
  drafts: FirstDraft[];
  /** How many the model found, so the made screen can say it. */
  found: number;
  /** The drafts kept or let go, by key, whoever read them: never drawn again. */
  gone: string[];
  /** The card had nothing left to show: Today no longer loads it. */
  closed?: boolean;
  /**
   * The drafts put back by an Undo, by key: drawn again even where the tab still remembers the name it took out of the
   * record, until they are kept or let go again.
   */
  back?: string[];
  begin: Begin;
};

const KEY = 'braindog.first.drafts';
/**
 * HOW LONG THE READ HAS, FROM WHEN IT BEGAN, ACROSS A RELOAD (onboarding9, 2 Nov): Today said "Still reading for anything
 * else." 14 seconds after it opened, on a read the browser gave twenty from the made screen and a reload gave twenty
 * more. Twelve, all told, on the fast model that reads it now (`FIRST_DRAFTS_MODEL` in `@braindog/slash`); past it the
 * read is over, with nothing said, and a reload never asks again for longer than is left.
 */
export const FIRST_DRAFTS_MS = 12_000;

class Drafts {
  now = $state.raw<Kept | null>(null);
}

/** The one holder, read by the made screen and by Today. */
export const firstDrafts = new Drafts();

function tab(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function save(k: Kept | null): void {
  try {
    if (k === null) tab()?.removeItem(KEY);
    else tab()?.setItem(KEY, JSON.stringify(k));
  } catch {
    /* Storage off: the drafts live as long as this page does. */
  }
}

function load(base: string): Kept | null {
  try {
    const v = JSON.parse(tab()?.getItem(KEY) ?? 'null') as Kept | null;
    return v !== null && typeof v === 'object' && v.base === base && Array.isArray(v.drafts) && typeof v.begin?.said === 'string'
      ? { ...v, gone: Array.isArray(v.gone) ? v.gone : [], back: Array.isArray(v.back) ? v.back : [] }
      : null;
  } catch {
    return null;
  }
}

function set(k: Kept | null): void {
  firstDrafts.now = k;
  save(k);
}

/**
 * The drafts for this BrainDog, from this page or this tab; a read cut off by a reload is asked again if it is recent.
 * IT WRITES STATE, so it is called from a mount, an effect or a press, never from a `$derived` or the markup.
 */
export function draftsFor(base: string): Kept | null {
  const held = firstDrafts.now?.base === base ? firstDrafts.now : load(base);
  if (held === null) return null;
  if (firstDrafts.now !== held) {
    firstDrafts.now = held;
    if (held.state === 'reading' && !inFlight.has(base)) {
      if (Date.now() - held.at < FIRST_DRAFTS_MS - 1_000) void read(held.begin, held.at);
      else set({ ...held, state: 'none' });
    }
  }
  return firstDrafts.now;
}

/**
 * Whether Today loads the card for this BrainDog: there are words to read and the card has not said it is done. The card
 * itself works out what is left (Tell's reading is the device's, so only the card can). Reads only; `draftsFor` first.
 */
export const draftsWaiting = (base: string): boolean => {
  const k = firstDrafts.now;
  return k !== null && k.base === base && k.closed !== true;
};

/** The card had nothing left to show: kept, so Today stops loading it. */
export function closeDrafts(base: string): void {
  const k = draftsFor(base);
  if (k !== null && k.closed !== true && k.state !== 'reading') set({ ...k, closed: true });
}

const inFlight = new Set<string>();

/** Start the read once for these words; a second call for the same words, or for words already read, changes nothing. */
export function beginDrafts(b: Begin): void {
  if (typeof window === 'undefined' || b.said.trim() === '') return;
  const held = draftsFor(b.base);
  if (held !== null && held.begin.said === b.said) return;
  void read(b);
}

async function read(b: Begin, at = Date.now()): Promise<void> {
  if (inFlight.has(b.base)) return;
  inFlight.add(b.base);
  set({ base: b.base, state: 'reading', at, summary: null, drafts: [], found: 0, gone: firstDrafts.now?.base === b.base ? firstDrafts.now.gone : [], begin: b });
  /* NEVER LEFT READING: whatever holds the read up (the door, its code still loading), it is over at the deadline. */
  const left = Math.max(1_000, at + FIRST_DRAFTS_MS - Date.now());
  const over = (): boolean => firstDrafts.now?.base !== b.base || firstDrafts.now.at !== at || firstDrafts.now.state !== 'reading';
  const stop = setTimeout(() => {
    if (!over()) set({ ...firstDrafts.now!, state: 'none' });
  }, left + 250);
  try {
    const [{ draftOffer, draftsOf, modulesHeld, renamesOf, summaryOf }, { slashAsks }] = await Promise.all([import('./first-drafts.ts'), import('./ask.ts')]);
    const modules = modulesHeld(b.registers);
    if (over()) return;
    if (modules.length === 0) return void set({ ...firstDrafts.now!, state: 'none' });
    const out = await slashAsks(b.base, undefined, Math.max(1_000, at + FIRST_DRAFTS_MS - Date.now())).setup({ said: b.said, offer: draftOffer(modules), today: b.today, first: true });
    /* MOVED ON TO ANOTHER BRAINDOG MEANWHILE, OR PAST THE DEADLINE: what came back is not this one's to show. */
    if (over() || firstDrafts.now === null) return;
    if (!out.ok) return void set({ ...firstDrafts.now, state: 'none' });
    /* AND THE LISTS BY THE PERSON'S OWN WORDS, after the entries: a rename is kept by the record's `renameList`. */
    const drafts = [...draftsOf(out.value, { modules, currency: b.currency, built: b.built, me: b.me }), ...renamesOf(out.value, { modules })];
    set({ ...firstDrafts.now, state: drafts.length > 0 ? 'ready' : 'none', summary: summaryOf(out.value), drafts, found: drafts.length, closed: false });
  } catch {
    if (!over() && firstDrafts.now !== null) set({ ...firstDrafts.now, state: 'none' });
  } finally {
    clearTimeout(stop);
    inFlight.delete(b.base);
  }
}

/** Drafts handled (kept or let go), by key: off the card, and the card goes with the last. */
export function settleDrafts(base: string, keys: readonly string[]): void {
  const k = draftsFor(base);
  if (k === null) return;
  set({ ...k, gone: [...new Set([...k.gone, ...keys])], back: (k.back ?? []).filter((b) => !keys.includes(b)) });
}

/**
 * Drafts put back on the card: the record said no to keeping them, or the toast's Undo took them back out of it.
 * The keys may name every entry a draft wrote (`list:title`), each read as nobody kept yet until kept again.
 */
export function restoreDrafts(base: string, keys: readonly string[]): void {
  const k = draftsFor(base);
  if (k === null) return;
  set({ ...k, closed: false, gone: k.gone.filter((g) => !keys.includes(g)), back: [...new Set([...(k.back ?? []), ...keys])] });
}
