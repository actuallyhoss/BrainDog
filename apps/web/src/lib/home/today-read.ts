/**
 * Today's tiles from Today's one read (`today`, the record's `packages/record/src/today.ts`, scope 2026-10-24 A13).
 *
 * TODAY ASKED FOR ITS BODY, AND THEN EACH TILE ASKED FOR ITS OWN PART: what BrainDog did itself, what is shared out, each
 * project card's late work (a read a list that falls due), who worked on each last and the number it leads with. The
 * record now answers all of them with the body, in one turn of its thread, and this module holds that answer for the
 * tiles: Home asks it (`askToday`) where it asked `previewPage`, and each tile's reader takes its part here first
 * (`todayHeld`, `cardsHeld`) and asks the record only where none is held.
 *
 * HELD AT THE VERSION IT WAS ASKED AT: the version the poll last heard and this tab's writes as they were, the token a
 * read kept by version is held under (`ref-rows.ts`). A move of either, or `TODAY_HELD_MS`, and a tile asks for itself.
 * A HOST BUILT BEFORE `today` is asked `previewPage` from then on, and every tile asks for itself, as before.
 *
 * LOADED BY TODAY AND THE TILES, never with the shell, and pure enough for Node: no rune, no `$lib`.
 */

import { wrote, type Client } from '@braindog/client';

import { versionHeard, versionKept } from '../data/local-tab.ts';
import { onForgetToday } from './today-kept.ts';
import { hearOffer } from '../board/offer-heard.ts';

/** The body as the record draws it. */
export type PageAnswer = { read_at?: unknown; blocks?: unknown; declared_version?: unknown; declared?: unknown };
declare const said: Client;
/** What a client says of a read of the body: its answer, or why not. */
export type PageSaid = Awaited<ReturnType<typeof said.call<PageAnswer>>>;

/** The project cards' parts, as the record answers them beside Today's body. */
export type TodayCards = {
  register: string;
  /** How many open rows past their day point at each project, by its number. */
  lates: Readonly<Record<string, number>>;
  /** The runs that name a project, newest heard first, and the field that names it; `null` where the record keeps none. */
  runs: { list: string; field: string; rows: unknown[] } | null;
  /** The key numbers the cards lead with; `null` where they were refused. */
  leads: unknown[] | null;
  /** The day each project's row last changed, by its number; left out by a host built before it. */
  moved?: Readonly<Record<string, string>>;
};

/**
 * What `today` answers: the body as `previewPage` draws it, and each tile's part, `null` where it was refused. `behind`
 * when it is Today as the record last drew it, which the record may have moved past: the screen draws it and asks again.
 */
export type TodayAnswer = { page: PageAnswer; handled: unknown; shared: unknown; cards: TodayCards | null; behind?: true };

/** How long a held answer is read from, whatever the version says, as a kept read is (`KEPT_READ_MS`). */
export const TODAY_HELD_MS = 300_000;

/** What a host without `today` answers a kept Today: the caller reads the page by `page` instead. */
const UNKEPT = { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog cannot draw Today yet.' } } as const;

/** Refusals that say the host has no `today` at all. */
const UNSERVED = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);
/** The records whose host answered `today` as a method it does not have. */
const without = new Set<string>();

type Held = { base: string; token: string; at: number; answer: Promise<TodayAnswer | null> };
let held: Held | null = null;
const tokenNow = (): string => `${versionKept()} w${wrote()}`;

/** The record whose last answer to `askToday` was `behind`, until `wasBehind` takes it. */
let behindAt: string | null = null;

/**
 * Whether the last Today read from `base` was the record's last drawing rather than one drawn now, said once: the
 * screen that drew it asks again with `fresh`.
 */
export function wasBehind(base: string): boolean {
  const was = behindAt === base;
  if (was) behindAt = null;
  return was;
}

/** The records built before `today` took `offer`, which still answer the offer in Today's read. */
const offerIn = new Set<string>();
/** The records built before `today` took `shape`, asked without it. */
const shapeless = new Set<string>();

/** The shape of screen Today is asked on: a phone (under 720px, Home's `narrow`), which asks without what it hides, or wider. */
export type TodayShape = 'phone' | 'wide';

/** What `app.html` left of the Today it asked beside `boot`: where, on what shape of screen, and its answer read whole. */
type Early = { url?: unknown; shape?: unknown; at?: unknown };

/** SHA-256 of `text`, hex, as the record digests what it was asked (`todayLast` in `packages/record`). */
async function digestOf(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * TODAY AS THE PAGE ASKED IT BESIDE `boot` (`app.html`), with the body this shape of screen asked last time: taken once,
 * by the first read that asks on that shape at that address, and drawn only when the record says it drew what this read
 * asks (`asked`, the digest of `[{ body } or { page }, offer]`). Anything else is `null`, and the read asks as it always
 * did: a guess that was wrong costs the request the page sent early and nothing else.
 */
async function earlyToday(base: string, shape: TodayShape, what: Record<string, unknown>, offer: boolean): Promise<{ ok: true; value: TodayAnswer } | null> {
  const g = globalThis as { __bdToday?: Early | undefined };
  const early = g.__bdToday;
  if (early === undefined || early.url !== `${base}/api/today` || early.shape !== shape || !(early.at instanceof Promise)) return null;
  g.__bdToday = undefined;
  try {
    /* READ WHOLE BY THE PAGE AS IT LANDED (`app.html`), so an answer nobody takes is still a finished request. */
    const res = (await early.at) as { ok?: unknown; body?: unknown } | null;
    if (res?.ok !== true || typeof res.body !== 'string') return null;
    const said = JSON.parse(res.body) as { ok?: unknown; value?: unknown } | null;
    const value = said?.ok === true ? (said.value as (TodayAnswer & { asked?: unknown; version?: unknown }) | null) : null;
    if (value === null || typeof value !== 'object' || typeof value.asked !== 'string') return null;
    if (value.asked !== (await digestOf(JSON.stringify([what, offer])))) return null;
    const { asked: _asked, version, ...answer } = value;
    /* ASKED BEFORE THE TAB HEARD THE RECORD MOVE: drawn, as Today as the record last drew it is, and asked again at once. */
    const heard = versionHeard();
    if (typeof version === 'number' && heard !== null && heard > version) answer.behind = true;
    return { ok: true, value: answer };
  } catch {
    return null;
  }
}

/** One widget of the board as `widgetSuggest` reads it (`boardRead` in the record's `today.ts`). */
export type BoardRead = { key: string; heading?: string; source?: string; where?: string; metric?: string; empty: boolean };
/** The board Today was last drawn with, for the offer asked apart (`askOffer`), by the record it was read from. */
let boardAt: { base: string; board: BoardRead[] } | null = null;

/**
 * THE BOARD AS THE WIDGET SIGNALS READ IT, the record's own `boardRead` (`packages/record/src/today.ts`) over the body
 * asked and the page drawn of it, block for block: each keyed block, what it reads, and whether it drew nothing. A widget
 * the phone left out of its ask (`left`, `phone-ask.ts`) is on the board and is not called empty: nothing was drawn of
 * it because nothing was asked.
 */
export function boardReadOf(body: Record<string, unknown>, page: unknown, left: readonly Record<string, unknown>[] = []): BoardRead[] {
  const one = (b: Record<string, unknown>, d: Record<string, unknown> | null): BoardRead => {
    const cells = Array.isArray(b.cells) ? (b.cells as { metric?: unknown }[]) : [];
    const readings = d && Array.isArray(d.readings) ? (d.readings as { reading?: { value?: unknown } | null }[]) : [];
    const listed = d !== null && ['rows', 'queue', 'feed', 'kpis'].some((k) => Array.isArray(d[k]) && (d[k] as unknown[]).length > 0);
    const figured = readings.some((r) => typeof r.reading?.value === 'number' && r.reading.value !== 0);
    return {
      key: b.key as string,
      ...(typeof b.heading === 'string' ? { heading: b.heading } : {}),
      ...(typeof b.source === 'string' ? { source: b.source } : {}),
      ...(typeof b.where === 'string' ? { where: b.where } : {}),
      ...(typeof cells[0]?.metric === 'string' ? { metric: cells[0].metric } : {}),
      empty: d !== null && !listed && !figured,
    };
  };
  const declared = Array.isArray(body.blocks) ? (body.blocks as Record<string, unknown>[]) : [];
  const drawn = Array.isArray((page as { blocks?: unknown } | null)?.blocks) ? (page as { blocks: Record<string, unknown>[] }).blocks : [];
  const keyed = (b: unknown): b is Record<string, unknown> => b !== null && typeof b === 'object' && typeof (b as { key?: unknown }).key === 'string';
  return [...declared.flatMap((b, i) => (keyed(b) ? [one(b, drawn[i] ?? {})] : [])), ...left.filter(keyed).map((b) => one(b, null))];
}

/**
 * Today's body drawn by the record, as `previewPage` answers it, with each tile's part held here for the tiles. On a
 * host without `today`, `previewPage` itself.
 *
 * A FIRST READ MAY BE ANSWERED TODAY AS THE RECORD LAST DREW IT (`behind`), at once, where drawing it took the record
 * over a second on a lived-in record; `fresh` asks for it drawn now, which every read after the screen's first does.
 * The tiles take their parts from it as from any answer, so they say what the body says, and the fresh one replaces it.
 *
 * WITHOUT THE WIDGET OFFER (`offer: false`): the board's last cell is no part of the screen, and the record took about
 * 0.2 s a read to draw it, and 2 s on the first read after it woke (F13, 30 Oct). The screen asks it once Today has
 * drawn (`askOffer`). A record built before `offer` refuses it, and is asked as before, with the offer in the read.
 * `left` is what a phone left out of `body` (`phone-ask.ts`), which the offer still reads as on the board.
 */
export async function askToday(
  client: Pick<Client, 'call'>,
  base: string,
  body: Record<string, unknown>,
  fresh = false,
  kept: string | null = null,
  left: readonly Record<string, unknown>[] = [],
  shape?: TodayShape,
): Promise<PageSaid> {
  /* A KEPT TODAY (`kept`, its slug) IS ASKED BY ITS SLUG, and a host without `today` has no such read: the caller reads the
     page itself. */
  if (without.has(base)) return kept === null ? client.call<PageAnswer>('previewPage', { body }) : (UNKEPT as PageSaid);
  const apart = !offerIn.has(base);
  const what = kept === null ? { body } : { page: kept };
  /* THE FIRST READ OF AN OPEN SAYS THE SHAPE OF SCREEN IT WAS ASKED ON (`shape`), so the record remembers its body for the
     next open to ask beside `boot` (`earlyToday`). */
  const shaped = shape !== undefined && !fresh && !shapeless.has(base);
  const asked = { ...what, ...(fresh ? { fresh: true } : {}), ...(apart ? { offer: false } : {}), ...(shaped ? { shape } : {}) };
  const out = (async () => (shape !== undefined && !fresh ? await earlyToday(base, shape, what, !apart) : null) ?? client.call<TodayAnswer>('today', asked))();
  const entry: Held = { base, token: tokenNow(), at: Date.now(), answer: out.then((o) => (o.ok ? o.value : null), () => null) };
  held = entry;
  const got = await out;
  if (got.ok) {
    /* THE WIDGET SLASH WOULD ADD, held for the board's last cell and the palette: carried by a record built before
       `offer`, and otherwise asked apart once Today has drawn, from the board it was drawn with. */
    if (apart) {
      const declared = kept === null ? body : (got.value.page as { declared?: unknown }).declared;
      boardAt = { base, board: boardReadOf(declared !== null && typeof declared === 'object' ? (declared as Record<string, unknown>) : {}, got.value.page, left) };
    } else hearOffer((got.value as { widget?: unknown }).widget);
    if (got.value.behind === true) behindAt = base;
    else if (behindAt === base) behindAt = null;
    return { ...got, value: got.value.page };
  }
  if (held === entry) held = null;
  if ('refusal' in got && apart && got.refusal.at === 'offer') {
    offerIn.add(base);
    return askToday(client, base, body, fresh, kept, left, shape);
  }
  /* A RECORD BUILT BEFORE `shape` refuses it, and is asked without it from then on. */
  if ('refusal' in got && shaped && got.refusal.at === 'shape') {
    shapeless.add(base);
    return askToday(client, base, body, fresh, kept, left, shape);
  }
  if ('refusal' in got && UNSERVED.has(got.refusal.code)) {
    without.add(base);
    return kept === null ? client.call<PageAnswer>('previewPage', { body }) : (UNKEPT as PageSaid);
  }
  return got as PageSaid;
}

/**
 * THE BOARD'S LAST CELL, asked apart once Today has drawn: what Slash would add from use, for the board Today was last
 * drawn with from `base`. Nothing where the record carried it in Today's read, or Today has not been read from it.
 */
export async function askOffer(client: Pick<Client, 'call'>, base: string): Promise<void> {
  const at = boardAt;
  if (at === null || at.base !== base || offerIn.has(base)) return;
  const out = await client.call<{ offers?: unknown[] }>('widgetSuggest', { board: at.board, cell: true });
  if (out.ok) hearOffer(Array.isArray(out.value.offers) ? out.value.offers[0] : undefined);
}

/**
 * Today's answer for the record at `base`, while it is held at the version it was asked at, or `null`: a tile then asks
 * for itself. An answer asked before any version was heard stands at the first one heard, as a kept walk does.
 */
export function todayHeld(base: string, now: number = Date.now()): Promise<TodayAnswer | null> | null {
  const h = held;
  if (h === null || h.base !== base || now < h.at || now - h.at >= TODAY_HELD_MS) return null;
  const token = tokenNow();
  if (h.token === `v null w${wrote()}`) h.token = token;
  return h.token === token ? h.answer : null;
}

/**
 * THE ANSWER OF THE LAST `today` READ FROM `base`, whatever version was heard since it was asked: the one a screen is about
 * to draw, for the parts beside its body (what was handled, what is shared out). `todayHeld` says no to it once a version
 * has been heard, which on a cold open is often before the read lands, and the foot's line then waited on a read of its
 * own and drew after the page (speed5).
 */
export function lastToday(base: string): Promise<TodayAnswer | null> | null {
  return held !== null && held.base === base ? held.answer : null;
}

/** The project cards' parts for the projects list `register`, from the held answer, or `null` to ask for them. */
export async function cardsHeld(base: string, register: string): Promise<TodayCards | null> {
  const got = await (todayHeld(base) ?? Promise.resolve(null));
  return got?.cards?.register === register ? got.cards : null;
}

/* DROPPED WITH THE REST OF TODAY (`forgetToday`), where the app's `forget` runs: a record switch, a sign-out. */
onForgetToday(() => {
  held = null;
  boardAt = null;
});
