/**
 * What landed on Today's desk: the things that arrived since the reader last looked, as the record's `whatsNew` says
 * them, each with who brought it, its name, when, and the list it was filed in.
 *
 * ARRIVALS ONLY. A row created, a thing that arrived, matched, extracted or pulled in: not every edit, which the page's
 * own feed already tells. A line with no name to say is left out (never an id), and so is the agents' own heartbeat.
 * Pure, so `landed.test.ts` holds the rules.
 */

import { since } from 'braindog-render';

import { actor, type ActorKind } from '../record/names.ts';

/** The part of a log line this reads. */
export type Line = {
  id: string;
  ts: string;
  actor: string;
  kind: string;
  register: string | null;
  seq: number | null;
  title: string | null;
  note: string | null;
  run_by?: { run?: string | null; agent: string; client: string | null; parent: string | null } | null | undefined;
};

export type Landed = {
  key: string;
  /** "12 min ago", as the record's one clock says it. */
  at: string;
  who: string;
  kind: ActorKind;
  /** The run an agent signed as, which its face is coloured by; empty for anybody else. */
  run: string;
  name: string;
  /** One quiet line beside the name, where the event left a note. */
  note: string | null;
  /** The list it was filed in, by the record's name for it. */
  to: string | null;
  href: string | null;
};

/** The kinds that are an arrival. */
export const ARRIVED: ReadonlySet<string> = new Set(['create', 'arrive', 'match', 'extract', 'pull']);

/** How many lines the desk draws. */
export const LANDED_MOST = 6;

/* A minted id is never a name. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** The lines to draw, newest first. */
export function landedOf(
  lines: readonly Line[],
  lists: ReadonlyMap<string, string>,
  me: string | null,
  now: number,
  names: ReadonlyMap<string, string> = new Map(),
  most = LANDED_MOST,
): Landed[] {
  const out: Landed[] = [];
  for (const l of lines) {
    if (!ARRIVED.has(l.kind) || l.register === 'session') continue;
    const name = (l.title ?? '').replaceAll(/\s*—\s*/gu, ', ').trim();
    if (name === '' || ULID.test(name)) continue;
    const who = actor(l.actor, me, names, l.run_by ?? null);
    const note = (l.note ?? '').replaceAll(/\s*—\s*/gu, ', ').trim();
    out.push({
      key: l.id,
      at: since(l.ts, now),
      who: who.name,
      kind: who.kind,
      run: /^S\d+$/u.test(l.actor) ? l.actor : '',
      name,
      note: note === '' || note === name ? null : note,
      to: l.register === null ? null : (lists.get(l.register) ?? null),
      href: l.register !== null && l.seq !== null ? `/r/${l.register}/${l.seq}` : null,
    });
    if (out.length >= most) break;
  }
  return out;
}

/** The keys that were not drawn before: a row that came while the reader looked, which is washed as it lands. */
export const freshOf = (before: ReadonlySet<string> | null, rows: readonly { key: string }[]): Set<string> =>
  before === null ? new Set() : new Set(rows.filter((r) => !before.has(r.key)).map((r) => r.key));
