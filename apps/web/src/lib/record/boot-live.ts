/**
 * The shell's one read: the record's `boot`, or the sample when there is no record here.
 *
 * LOADED DYNAMICALLY, beside `api.ts`, and never from the root layout's entry chunk. `@braindog/client` carries the
 * route table as a value, and the entry chunk has half a kilobyte of room.
 *
 * `UNREACHABLE` and `UNAUTHORIZED` mean there is no record here (a static host's fallback page, or a Worker with no
 * demo record), and the shell draws the sample exactly as it did. Any other refusal is the record's own answer, and the
 * shell draws itself empty so the screen under it can say what the record said.
 *
 * KEPT FOR THE TAB once decided, the way `lib/data/record.ts` always kept its probe: the layout's `load` runs on every
 * navigation, and the shell must not cost a request each time. A refusal is not kept, because it is about the record's
 * state rather than about whether there is one. `forget` drops the answer after a write that changes it.
 */

import { createClient, type Boot, type ClientOptions, type EventLine } from '@braindog/client';
import { useCaseName } from '@braindog/seed/usecases/names';

import { iconFor, NOW, PACKS, REGISTERS, setupSaid, type boot, type NavEntry } from './api.ts';
import { copy } from '../copy.ts';
import { noRecord } from './device.ts';
import { noteOf } from './history-live.ts';
import type { NewsItem } from './schema.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

export type Booted = { from: 'live'; boot: Boot } | { from: 'sample' } | { from: 'refused'; code: string; fix: string };

type Sample = ReturnType<typeof boot>;

/**
 * What the root layout hands every screen: the sample's shape, whichever source drew it.
 *
 * `live` says which, `now` is the clock a screen reads ages against (the record's, or the sample's frozen one), and
 * `upTo` is the newest line of what is new, which is what marking it all read sends.
 */
export type Shell = Omit<Sample, 'me'> & {
  me: { person: string; level: string; owner: boolean; records: { slug: string; name: string; level: string }[] };
  /**
   * Why the records this person can reach could not be listed, when they could not.
   *
   * THE SWITCHER OWES A READER THE REASON. A menu that quietly holds the one record you are already
   * in reads as a product with one record in it, which is a different claim from "this list could
   * not be read just now". The root layout fills it from `/account/records`, and it is absent on
   * every shell that could list them.
   */
  recordsRefused?: string | undefined;
  /**
   * EVERY LIST THE RECORD HOLDS, the empty ones too, for the places that put something INTO a list.
   *
   * `index.registers` is the rail's, and the rail draws only lists that hold something. Filing an arrival and giving
   * somebody an exception read that same list, so a record whose Clients list had no row yet could neither file its
   * first client nor give a bookkeeper access to it: the one way to fill a list was hidden until it was full.
   */
  lists: { id: string; name: string }[];
  inbox: number;
  /* HOW MANY QUESTIONS ARE OPEN, which `questions` cannot say: `boot` caps that list at twenty, and the count is the record's. */
  open: number;
  now: number;
  live: boolean;
  upTo: number | null;
};

let kept: Promise<Booted> | null = null;

export function readBoot(base: string, io?: Fetch): Promise<Booted> {
  kept ??= (async (): Promise<Booted> => {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    const out = await client.boot();
    if (out.ok) return { from: 'live', boot: out.value };
    const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'The record changed while it was being read.' };
    if (noRecord(refusal.code)) return { from: 'sample' };
    kept = null;
    return { from: 'refused', code: refusal.code, fix: refusal.fix };
  })();
  return kept;
}

/**
 * Whether anybody signs in on the host that answered `boot`.
 *
 * ONLY A HOST THAT SAID NO IS ONE WITHOUT SIGN-IN. A self-host started without a key answers `/account/records`
 * 401 on every load, the same answer an ended session gets, so the host says so in `boot` and the app stops
 * asking. A host older than the field says nothing, and is asked as before.
 */
export const signsIn = (b: Boot): boolean => (b as Boot & { signIn?: unknown }).signIn !== false;

/** Drop the kept answer, so the next screen asks the record again. */
export function forget(): void {
  kept = null;
}

/* A RULE IS `rule:<id>` ON THE RECORD AND `rule.<id>` IN THE SAMPLE, and `actorOf` words the second. The reader's own
   lines are "you", as the sample's are. */
export const actorFor = (actor: string, me: string | null): string =>
  me !== null && actor === me ? 'you' : actor.replace(/^rule:/u, 'rule.');

const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A pack event in the words of the lists it brought.
 *
 * `install` HAS NO REGISTER, NO TITLE AND NO NOTE, so it fell through to the kind itself and Home
 * drew "The record itself / Install" twice on a first run, naming nothing. The lists a pack holds
 * are what a person chose on `/start`, so the line names them: "Added the Services list". A pack
 * this build does not know keeps its id, which is still more than the verb alone.
 */
const PACK_VERB: Record<string, string> = { install: 'Added', uninstall: 'Removed', upgrade: 'Updated', retire: 'Retired' };
function packText(e: EventLine): string | null {
  /* A PACK'S SETTINGS SAVED reached Home as "Edit". Said as what it did: a use case chosen to speak, or kept beside. */
  if (e.kind === 'edit' && e.target_kind === 'pack' && e.target) {
    const id = e.target.replace(/^pack:/u, '');
    const usecase = /^usecase-([a-z][a-z0-9-]*)$/u.exec(id)?.[1];
    const name = usecase ? useCaseName(usecase) : (PACKS.find((p) => p.id === id)?.name ?? id);
    const to = typeof e.to === 'object' && e.to !== null && !Array.isArray(e.to) ? (e.to as Record<string, unknown>) : {};
    const only = Object.keys(to).length === 1;
    if (usecase && only && to.speaks === true) return copy.useCaseSpeaks(name);
    if (usecase && only && to.speaks === false) return copy.useCaseBeside(name);
    return copy.settingsChanged(name);
  }
  const verb = PACK_VERB[e.kind];
  if (e.target_kind !== 'pack' || !verb || !e.target) return null;
  const id = e.target.replace(/^pack:/u, '');
  /* A USE CASE'S PACK IS NAMED AS THE USE CASE, never by its id: "Added the usecase-student add-on" reached Home, and then
     "Added the Team use case" for Team board. */
  const usecase = /^usecase-([a-z][a-z0-9-]*)$/u.exec(id)?.[1];
  if (usecase) return copy.useCaseEvent(verb, useCaseName(usecase));
  const names = (PACKS.find((p) => p.id === id)?.registers ?? []).map((r) => REGISTERS[r]?.name ?? r);
  if (names.length === 0) return `${verb} the ${id} add-on`;
  if (names.length === 1) return `${verb} the ${names[0]} list`;
  return `${verb} ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * AN EXPORT'S NOTE IS THE KERNEL'S, not a sentence: "snapshot 2026-09-16T20-14-56Z-now 786432 bytes" and
 * "sections header, data, grants redacted" reached Home word for word. The record's own two shapes, said plainly.
 */
function exportText(e: EventLine): string | null {
  if (e.kind !== 'export' || !e.note) return null;
  if (/^snapshot /u.test(e.note)) return 'Took a copy of the record';
  if (/^sections all(?:,|$)/u.test(e.note)) return 'Exported the whole record';
  if (/^sections /u.test(e.note)) return 'Exported part of the record';
  return null;
}

/**
 * ACCESS GIVEN OR TAKEN AWAY, AS A SENTENCE. The kind is the record's (`access.grant`) and it reached Home as "Access
 * grant": a key made for an agent, a device let in, or a person given a level. What it reaches is in `to`, a key's or a
 * device's label in `note`, and a person's level may be on one list, named in `field`.
 */
const SCOPES: Readonly<Record<string, string>> = { read: 'read', propose: 'read and propose', write: 'read and write' };
function accessText(e: EventLine): string | null {
  if (e.kind !== 'access.grant' && e.kind !== 'access.revoke') return null;
  const given = e.kind === 'access.grant';
  const label = e.note && e.note.trim() !== '' ? `: ${e.note.trim()}` : '';
  const level = typeof (given ? e.to : e.from) === 'string' ? String(given ? e.to : e.from).replaceAll('_', ' ') : null;
  if (e.target_kind === 'token') {
    const can = typeof e.to === 'string' ? SCOPES[e.to] : undefined;
    return given ? `Made a key${can ? ` that can ${can}` : ''}${label}` : `Took back a key${label}`;
  }
  if (e.target_kind === 'device_grant') return given ? `Let a device sign in${label}` : `Signed a device out${label}`;
  const list = e.field && e.field !== '*' ? (REGISTERS[e.field]?.name ?? e.field) : null;
  const on = list ? ` on ${list}` : ' to this record';
  if (given) return level ? `Gave someone ${level} access${on}` : `Gave someone access${on}`;
  return level ? `Took away someone's ${level} access${on}` : `Took away someone's access${on}`;
}

/** One line of the log in the words the feed draws. */
function textOf(e: EventLine): string {
  if (e.kind === 'setup') return setupText(e);
  if (e.register !== null) {
    if (e.kind === 'create' && e.title) return `Added ${e.title}`;
    const what = noteOf(e.register, e);
    return e.title ? `${e.title}: ${what}` : sentence(what);
  }
  if (e.kind === 'suggest' && e.title) return `Asked: ${e.title}`;
  if (e.kind === 'decide' && e.title) return `Decided: ${e.title}`;
  const pack = packText(e) ?? exportText(e) ?? accessText(e);
  if (pack) return pack;
  return sentence(e.note ?? e.kind.replace(/[._]/gu, ' '));
}

/** A record setting itself up is one line (`api.ts` `setupSaid`). */
const setupText = (e: EventLine): string => setupSaid(e.target, typeof e.to === 'number' ? e.to : 0);

/** Where a line goes: the row, the question, or the log for anything that is neither. */
function hrefOf(e: EventLine): string {
  if (e.register !== null && e.seq !== null) return `/r/${e.register}/${e.seq}`;
  const question = /^(?:suggestion:)?(SG\d+)$/u.exec(e.target ?? '');
  if (e.target_kind === 'suggestion' && question) return `/decide/${question[1]}`;
  return '/audit';
}

/** The record's lines as the feed's items, newest first as they came. */
export const newsOf = (events: readonly EventLine[], me: string | null): NewsItem[] =>
  events.map((e) => ({ at: e.ts, by: actorFor(e.actor, me), text: textOf(e), href: hrefOf(e) }));

/**
 * The record's `boot` in the shape the shell draws.
 *
 * WHAT THE RECORD DOES NOT SEND IS EMPTY, NOT SAMPLED. Saved views, the pen of unplaced pages and the people with access
 * are not in `boot`, so a live shell has none of them rather than the sample's.
 *
 * THE SWITCHER STARTS AT THE RECORD YOU ARE IN, and the root layout replaces that row with the account's own list. `boot`
 * names this record and no other, so one row is the most this function can honestly claim.
 */
export function layoutOf(b: Boot): Shell {
  const record = b.record ?? null;
  const person = b.me?.person ?? null;
  const level = b.me?.level ?? 'read';
  const nav: NavEntry[] = (b.pages ?? []).flatMap((p) =>
    p.nav
      ? [{ id: p.slug, title: p.title, href: `/p/${p.slug}`, section: p.nav.section, order: p.nav.order, icon: iconFor(p.icon ?? undefined, 'doc') }]
      : [],
  );
  return {
    index: {
      slug: record?.slug ?? '',
      name: record?.name ?? '',
      locale: record?.locale ?? 'en',
      /* THE LISTS THAT HOLD SOMETHING, the sample's rule, and an icon from the declaration this build knows. */
      registers: b.registers
        .filter((r) => r.count > 0)
        .map((r) => ({ id: r.id, name: r.name, count: r.count, icon: iconFor(REGISTERS[r.id]?.icon, 'rows'), views: [] })),
    },
    lists: b.registers.map((r) => ({ id: r.id, name: r.name })),
    nav,
    pen: [],
    me: { person: person ?? '', level, owner: level === 'owner', records: record ? [{ slug: record.slug, name: record.name, level }] : [] },
    people: [],
    /* THE FIRST SCREEN'S QUESTIONS, capped as `boot` caps them. Their options and cost are one `governance` read away. */
    questions: (b.waiting ?? []).map((w, i) => ({ id: w.id, title: w.question || w.id, cost: '', rank: i + 1, opened: w.opened_at, options: [] })),
    whatsNew: newsOf(b.whatsNew?.events ?? [], person),
    sinceCapped: b.whatsNew?.sinceCapped ?? false,
    /* THE NEWEST LINE THIS CALLER MAY SEE, which is as near the record's version as `boot` says. */
    version: b.whatsNew?.upTo ?? 0,
    assistant: false,
    inbox: b.counts?.inbox ?? 0,
    open: b.counts?.decide ?? (b.waiting ?? []).length,
    now: Number.isFinite(Date.parse(b.now)) ? Date.parse(b.now) : Date.now(),
    live: true,
    upTo: b.whatsNew?.upTo ?? null,
  };
}

/** The shell over a record that refused `boot`: nothing in the rail, and the screen says why. */
export const refusedShell = (): Shell => layoutOf({ registers: [], now: new Date().toISOString() });

/** The sample's shell, with what only a shell carries. */
export const sampleShell = (sample: Sample, inbox: number): Shell => ({
  ...sample,
  lists: Object.entries(REGISTERS).map(([id, r]) => ({ id, name: r.name })),
  inbox,
  open: sample.questions.length,
  now: NOW,
  live: false,
  upTo: null,
});
