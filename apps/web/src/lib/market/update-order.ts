/**
 * Which update goes in first, when one waits on another.
 *
 * A DECLARATION MOVES FROM ONE PACK TO ANOTHER BY THE HOLDER'S UPDATE HANDING IT OVER (`hands` in the holder's
 * document: Personal 2.4.0 hands the count of budgets set to Money). The pack that takes it is refused until that
 * update has landed, so Money's update taken first read as a dead end: a plan with one conflict, Approve greyed, and
 * the step that would clear it sitting unnamed in the same list of updates.
 *
 * THE ORDER IS READ FROM THE DOCUMENTS, NOT GUESSED FROM THE REFUSAL. A conflict is waited out only when the pack that
 * holds the declaration has an update here whose document hands that declaration to the pack being planned. A conflict
 * the owner made, a holder with no update, and a holder whose update hands it elsewhere are left as the record said
 * them.
 *
 * PURE AND NODE-LOADABLE: relative `.ts` imports only.
 */

import type { ListingKind } from './listing.ts';

type Body = Record<string, unknown>;

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An update that waits, as the Updates tab holds it: what it is, and the file its plan is read from. */
export type Waiting = {
  key: string;
  kind: ListingKind;
  id: string;
  title: string;
  /** An add-on's document, or a use case's file as text. A module carries neither: its document is built for the record. */
  file: { doc: Record<string, unknown> | null; text: string | null };
};

/** The pack id a record holds an update under: a use case's is `usecase-<id>` (`listing.ts` `installedId`). */
export const heldAs = (u: Pick<Waiting, 'kind' | 'id'>): string => (u.kind === 'usecase' ? `usecase-${u.id}` : u.id);

/** What the Updates tab says on an update that waits on another, and the press that opens the other's plan. */
export const orderWords = {
  waits: (title: string, what: string, holder: string) => `${what} is under ${holder} until ${holder} is updated, so ${title} goes in after it.`,
  first: (holder: string) => `Update ${holder} first`,
} as const;

/** A use case's file read from its text, or `null` for text that is not one. */
function parsed(text: string): Body | null {
  try {
    const v: unknown = JSON.parse(text);
    return isMap(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * What an update's document hands on, each declaration id to the pack that takes it. An add-on says it on its
 * document; a use case on the pack inside its file. A file that says none, or cannot be read, hands nothing.
 */
export function handsOf(file: Waiting['file']): Record<string, string> {
  const whole = file.doc ?? (file.text === null ? null : parsed(file.text));
  if (!whole) return {};
  const doc = isMap(whole.hands) ? whole : isMap(whole.pack) ? whole.pack : whole;
  const hands = isMap(doc.hands) ? doc.hands : {};
  return Object.fromEntries(Object.entries(hands).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
}

/** A plan's conflicts and the pack it is for, or `null` for a use case's plan or an answer that is no plan. */
function conflictsOf(diff: unknown): { taker: string; conflicts: unknown[] } | null {
  if (!isMap(diff) || !isMap(diff.pack) || typeof diff.pack.id !== 'string') return null;
  return { taker: diff.pack.id, conflicts: Array.isArray(diff.conflicts) ? diff.conflicts : [] };
}

/**
 * The update whose landing clears this conflict, or `null`. THE OWNER'S OWN ARE NOBODY'S TO WAIT FOR: a declaration
 * written or changed in this record (`changed`, `(this record)`), and one of theirs that reads something the version
 * takes away (`reads`, `field`), are cleared by the owner and by no update.
 */
function clears<U extends Waiting>(c: unknown, taker: string, updates: readonly U[]): U | null {
  if (!isMap(c) || typeof c.id !== 'string' || typeof c.pack !== 'string') return null;
  if (c.changed === true || c.pack === '(this record)' || typeof c.reads === 'string' || typeof c.field === 'string') return null;
  const id = c.id;
  const pack = c.pack;
  return updates.find((u) => heldAs(u) === pack && handsOf(u.file)[id] === taker) ?? null;
}

/**
 * The update to take first for a plan the record would refuse: the first conflict's holder, when its update hands the
 * declaration to this pack. `null` when the plan has no such conflict, which leaves the refusal as the record said it.
 */
export function holderFirst<U extends Waiting>(diff: unknown, updates: readonly U[]): U | null {
  const plan = conflictsOf(diff);
  if (!plan) return null;
  for (const c of plan.conflicts) {
    const first = clears(c, plan.taker, updates);
    if (first) return first;
  }
  return null;
}

/**
 * The updates in the order they go in: a holder before the pack its update hands to, and everything else where it was.
 * TWO THAT HAND TO EACH OTHER KEEP THE ORDER THEY CAME IN, since neither can be first and the record refuses the one
 * that cannot land, as it did before.
 */
export function inOrder<U extends Waiting>(updates: readonly U[]): U[] {
  /* Who hands to whom, read once: each update's holders are the others whose document hands something to it. */
  const holders = new Map<U, U[]>(updates.map((u) => [u, updates.filter((h) => h !== u && Object.values(handsOf(h.file)).includes(heldAs(u)))]));
  const waitsOn = (u: U, on: U, seen = new Set<U>()): boolean => {
    if (seen.has(u)) return false;
    seen.add(u);
    return (holders.get(u) ?? []).some((h) => h === on || waitsOn(h, on, seen));
  };
  const out: U[] = [];
  const place = (u: U): void => {
    if (out.includes(u)) return;
    /* A holder that itself waits on this one is a ring, and is not pulled ahead. */
    for (const h of holders.get(u) ?? []) if (!waitsOn(h, u)) place(h);
    if (!out.includes(u)) out.push(u);
  };
  for (const u of updates) place(u);
  return out;
}

/**
 * A plan as the sheet is handed it, with each conflict an update clears marked `waits`: `after` when the holder's
 * update is in the same run (`run`, "Update all"), `first` when it waits on the tab and is not. `plan.ts` reads the
 * mark. THE MARKS GO ON A COPY, and a plan with nothing to mark comes back as it was: what installs is the plan the
 * record made, by its hash.
 */
export function marked(diff: unknown, updates: readonly Waiting[], run: readonly Waiting[]): unknown {
  const plan = conflictsOf(diff);
  if (!plan || !isMap(diff)) return diff;
  let any = false;
  const conflicts = plan.conflicts.map((c) => {
    const holder = clears(c, plan.taker, updates);
    if (!holder || !isMap(c)) return c;
    any = true;
    return { ...c, waits: run.some((r) => r.key === holder.key) ? 'after' : 'first' };
  });
  return any ? { ...diff, conflicts } : diff;
}
