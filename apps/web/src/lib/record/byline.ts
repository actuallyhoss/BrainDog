/**
 * WHO LAST CHANGED A ROW, AS A BYLINE (DIRECTION §37, "Trust and his screens: bylines, undo"): a row an agent, an app, a
 * rule or Slash changed wears "Claude for Sam · 2h ago" and a faint tint until the reader has seen it, and its Undo puts
 * back that one change (`undo-write.ts` `undoChange`, by `batch`).
 *
 * READ FROM THE RECORD'S `changes`, one a row (`packages/kernel/src/pages.ts` `changesOf`): who signed the row's newest
 * event, the kind of actor and when, and on a current record the batch it wrote under and the run it came from. Every
 * key past `who` and `at` is narrowed here, so a record on an older build draws a byline without an Undo rather than none.
 *
 * NAMES, NEVER IDS. The actor is said by `names.ts` `actor`, so a run is its agent's name and a ULID is never printed; a
 * run's handle rides beside the name as `run`, for the link to its page, and is not in `said`. Who it acted for is a
 * name the caller holds, or "you", or left out.
 *
 * A PERSON'S OWN CHANGE CARRIES NO BYLINE. The row is theirs, and a list where every row says "You" says nothing.
 *
 * PURE, so `node --test` reads it.
 */

import { since } from 'braindog-render';

import { actor, type ActorKind } from './names.ts';

/** What kind of thing changed the row: an agent (a run of one), an app (an import, an ingest), a rule, or Slash. */
export type BylineBy = 'agent' | 'app' | 'rule' | 'slash';

export type Byline = {
  by: BylineBy;
  /** Its name: "Claude", "Slash", "Late reply", "Bank texts". */
  name: string;
  /** Where it ran, when the record says it ("Claude Code · MacBook"). */
  app: string | null;
  /** The person it acted for, by name, "you" for the reader, or `null` when the record does not say. */
  for: string | null;
  /** When it changed the row. */
  at: string;
  /** The write it made, which `undoChange` puts back. `null` on a record that does not say. */
  batch: string | null;
  /** The run it came from (`S42`), a handle for the link beside the name and never a name itself. */
  run: string | null;
  /** Whether the reader has not seen the change yet, which the row draws as a faint tint. */
  unseen: boolean;
  /** The line itself: "Claude for Sam · 2h ago", and "Claude · 2h ago" when it acted for the reader. */
  said: string;
};

export const bylineWords = {
  forWhom: (who: string, whom: string) => `${who} for ${whom}`,
  you: 'you',
  at: (who: string, when: string) => `${who} · ${when}`,
} as const;

const KIND: Partial<Record<ActorKind, BylineBy>> = { agent: 'agent', slash: 'slash', rule: 'rule', automation: 'app', system: 'app' };

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const RUN = /^S\d+$/u;
/* WHAT IS NOT A NAME: a ULID, a person's id, a handle or a path. Such a value from the record is dropped, never printed. */
const NOT_A_NAME = /[0-9A-HJKMNP-TV-Z]{26}|^[pt]_|#\d|[\\/]/u;

/**
 * Row `n`'s byline from the record's change, or `null` for a row a person changed, a row nobody changed, and a change
 * this build cannot read.
 *
 * `me` is the reader's id and `names` the people the caller holds a name for; `seen` is the reader's read mark, an
 * instant, used only when the record does not say itself whether this change is new to them.
 */
export function bylineOf(change: unknown, me: string | null = null, names: ReadonlyMap<string, string> = new Map(), now: number = Date.now(), seen: string | null = null): Byline | null {
  if (!isObject(change)) return null;
  const who = text(change.who);
  const at = text(change.at);
  if (who === null || at === null) return null;
  /* AN AGENT'S RUN IS SAID BY ITS AGENT when the record names one (`agent: 'claude'`), and as An agent when it does not. */
  const agent = text(change.agent);
  const signed = RUN.test(who) && agent !== null && !NOT_A_NAME.test(agent) ? `agent:${agent.toLowerCase()}` : who;
  const said = actor(signed, me, names);
  const by = KIND[said.kind];
  if (by === undefined) return null;
  const whom = forOf(change.for, me, names);
  const run = text(change.run) ?? (RUN.test(who) ? who : null);
  const app = text(change.app);
  /* FOR THE READER GOES UNSAID: on a record of one, every agent's row would read "for you", which says nothing. */
  const name = whom === null || whom === bylineWords.you ? said.name : bylineWords.forWhom(said.name, whom);
  return {
    by,
    name: said.name,
    app: app !== null && !NOT_A_NAME.test(app) ? app : null,
    for: whom,
    at,
    batch: text(change.batch),
    run: run !== null && RUN.test(run) ? run : null,
    unseen: unseenOf(change, at, seen),
    said: bylineWords.at(name, since(at, now)),
  };
}

/** Who the change was made for, by name: the reader is "you", a person the caller holds is their name, anyone else is left out. */
function forOf(v: unknown, me: string | null, names: ReadonlyMap<string, string>): string | null {
  const id = text(v);
  if (id === null) return null;
  const whom = actor(id, me, names);
  if (whom.kind === 'you') return bylineWords.you;
  /* A NAME THE RECORD WROTE OUT ("Sam") is kept as it is; an id nobody named is not a name, and is left out. */
  if (whom.kind === 'person' && whom.name === id && !NOT_A_NAME.test(id)) return id;
  return whom.kind === 'person' && names.has(id) ? whom.name : null;
}

/**
 * NEW TO THE READER: the record's own word first (`unseen`, or `seen` the other way round), then the reader's read mark,
 * a change after it being new. With neither, nothing is claimed new: a tint that never goes away is worse than none.
 */
function unseenOf(change: Record<string, unknown>, at: string, seen: string | null): boolean {
  if (typeof change.unseen === 'boolean') return change.unseen;
  if (typeof change.seen === 'boolean') return !change.seen;
  if (seen === null) return false;
  const a = Date.parse(at);
  const s = Date.parse(seen);
  return Number.isFinite(a) && Number.isFinite(s) && a > s;
}
