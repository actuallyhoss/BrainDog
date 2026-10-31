/**
 * What landed on Today's desk: the things that arrived since the reader last looked, as the record's `whatsNew` says
 * them, each with who brought it, its name, when, and the list it was filed in.
 *
 * ARRIVALS ONLY. A row created, a thing that arrived, matched, extracted or pulled in: not every edit, which the page's
 * own feed already tells. A line with no name to say is left out (never an id), and so is a line in a list the kernel
 * declares itself (the runs' heartbeat, what he told an agent), known by its declaration (`own`) and never by a name.
 * Pure, so `landed.test.ts` holds the rules.
 */

import { handleName, since } from 'braindog-render';

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
  /** The record says the making of this BrainDog wrote it (PK1): a starter's own rows, not an arrival. */
  made?: true | undefined;
};

export type Landed = {
  key: string;
  /** "12 min ago", as the record's one clock says it. */
  at: string;
  /** When it landed, as the record stamped it: the hour lines are grouped by. */
  ts: string;
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

/* A handle, not a name: lowercase, one word or words joined by hyphens or underscores, as a tool or a key is filed. */
const SLUG = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u;

/**
 * THE NAME A LINE SAYS: the row's title as the list declares it, and where that is a handle ("nordhaven-dns") the same
 * words spaced and capitalised ("Nordhaven DNS"), so no slug is ever drawn as a name.
 */
export function displayName(title: string): string {
  const name = title.replaceAll(/\s*—\s*/gu, ', ').trim();
  /* AS EVERY OTHER SCREEN SAYS A HANDLE (`handleName`): "Nordhaven DNS", not "Nordhaven dns". */
  return SLUG.test(name) ? handleName(name) : name;
}

/** The lines to draw, newest first. */
export function landedOf(
  lines: readonly Line[],
  lists: ReadonlyMap<string, string>,
  me: string | null,
  now: number,
  names: ReadonlyMap<string, string> = new Map(),
  most = LANDED_MOST,
  /** The lists the kernel declares itself (`kernel` on boot's lists): nothing he filed. */
  own: ReadonlySet<string> = new Set(),
): Landed[] {
  const out: Landed[] = [];
  /* THE READER FILED UNDER HER OWN NAME IS HER, NOT NEWS: sign-up files the owner as a
     person of her own record, and "Arrivals 1, Mariam, You, People" was the only thing on her first Today. */
  const mine = me === null ? '' : (names.get(me) ?? '').trim();
  for (const l of lines) {
    if (!ARRIVED.has(l.kind) || (l.register !== null && own.has(l.register))) continue;
    /* A SCRIPT'S WORK IS SETUP, NOT AN ARRIVAL (audit 6f AF11): Arrivals led with "Give each plan a page and count what is
       left after each part added 2 to Plans", rows a script made out of what was already here. Activity says it. */
    if (/^script:/u.test(l.actor)) continue;
    /* NOR IS WHAT THE MAKING WROTE (PK1): "You added 6 to Milestones" was a Guide's own plan, written from the sentence. */
    if (l.made === true) continue;
    const name = displayName(l.title ?? '');
    if (name === '' || ULID.test(name)) continue;
    if (mine !== '' && l.actor === me && name === mine) continue;
    const who = actor(l.actor, me, names, l.run_by ?? null);
    const note = (l.note ?? '').replaceAll(/\s*—\s*/gu, ', ').trim();
    out.push({
      key: l.id,
      at: since(l.ts, now),
      ts: l.ts,
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

/** Several arrivals by one hand into one list within one hour, said as one line that opens to their names (today F10). */
export type LandedGroup = { key: string; group: true; at: string; who: string; kind: ActorKind; run: string; to: string; rows: Landed[] };

/** "BrainDog added 6 to Tools". */
export const groupSaid = (g: Pick<LandedGroup, 'who' | 'to' | 'rows'>): string => `${g.who} added ${g.rows.length.toLocaleString('en-GB')} to ${g.to}`;

/**
 * ARRIVALS AS THEY ARE READ (today F10): lines that share who brought them, the list they went into and the hour are one
 * line, "BrainDog filed 6 into Tools · 12h ago", which opens in place to the names; a line on its own stays a line. In
 * the order of the newest line of each, and at most `most` of them.
 */
export function arrivalsOf(rows: readonly Landed[], most = LANDED_MOST): (Landed | LandedGroup)[] {
  const hour = (ts: string): string => ts.slice(0, 13);
  const groups = new Map<string, Landed[]>();
  for (const r of rows) {
    if (r.to === null) continue;
    const k = `${r.who}|${r.to}|${hour(r.ts)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: (Landed | LandedGroup)[] = [];
  const done = new Set<string>();
  for (const r of rows) {
    const k = r.to === null ? null : `${r.who}|${r.to}|${hour(r.ts)}`;
    const held = k === null ? undefined : groups.get(k);
    if (k !== null && held && held.length > 1) {
      if (done.has(k)) continue;
      done.add(k);
      out.push({ key: `g:${held[0]!.key}`, group: true, at: r.at, who: r.who, kind: r.kind, run: r.run, to: r.to!, rows: held });
    } else out.push(r);
    if (out.length >= most) break;
  }
  return out;
}
