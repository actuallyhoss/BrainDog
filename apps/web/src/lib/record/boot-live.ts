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

import { iconFor, NOW, REGISTERS, type boot, type NavEntry } from './api.ts';
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
  inbox: number;
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

/** Drop the kept answer, so the next screen asks the record again. */
export function forget(): void {
  kept = null;
}

/* A RULE IS `rule:<id>` ON THE RECORD AND `rule.<id>` IN THE SAMPLE, and `actorOf` words the second. The reader's own
   lines are "you", as the sample's are. */
export const actorFor = (actor: string, me: string | null): string =>
  me !== null && actor === me ? 'you' : actor.replace(/^rule:/u, 'rule.');

const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One line of the log in the words the feed draws. */
function textOf(e: EventLine): string {
  if (e.register !== null) {
    if (e.kind === 'create' && e.title) return `Added ${e.title}`;
    const what = noteOf(e.register, e);
    return e.title ? `${e.title}: ${what}` : sentence(what);
  }
  if (e.kind === 'suggest' && e.title) return `Asked: ${e.title}`;
  if (e.kind === 'decide' && e.title) return `Decided: ${e.title}`;
  return sentence(e.note ?? e.kind.replace(/[._]/gu, ' '));
}

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
 * WHAT THE RECORD DOES NOT SEND IS EMPTY, NOT SAMPLED. Saved views, the pen of unplaced pages, the people with access and
 * the second record in the switcher are not in `boot`, so a live shell has none of them rather than the sample's.
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
    now: Number.isFinite(Date.parse(b.now)) ? Date.parse(b.now) : Date.now(),
    live: true,
    upTo: b.whatsNew?.upTo ?? null,
  };
}

/** The shell over a record that refused `boot`: nothing in the rail, and the screen says why. */
export const refusedShell = (): Shell => layoutOf({ registers: [], now: new Date().toISOString() });

/** The sample's shell, with what only a shell carries. */
export const sampleShell = (sample: Sample, inbox: number): Shell => ({ ...sample, inbox, now: NOW, live: false, upTo: null });
