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

import { versionKept } from '../data/local-tab.ts';
import { onForgetToday } from './today-kept.ts';

/** The body as the record draws it. */
export type PageAnswer = { read_at?: unknown; blocks?: unknown };
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
};

/** What `today` answers: the body as `previewPage` draws it, and each tile's part, `null` where it was refused. */
export type TodayAnswer = { page: PageAnswer; handled: unknown; shared: unknown; cards: TodayCards | null };

/** How long a held answer is read from, whatever the version says, as a kept read is (`KEPT_READ_MS`). */
export const TODAY_HELD_MS = 300_000;

/** Refusals that say the host has no `today` at all. */
const UNSERVED = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);
/** The records whose host answered `today` as a method it does not have. */
const without = new Set<string>();

type Held = { base: string; token: string; at: number; answer: Promise<TodayAnswer | null> };
let held: Held | null = null;
const tokenNow = (): string => `${versionKept()} w${wrote()}`;

/**
 * Today's body drawn by the record, as `previewPage` answers it, with each tile's part held here for the tiles. On a
 * host without `today`, `previewPage` itself.
 */
export async function askToday(client: Pick<Client, 'call'>, base: string, body: Record<string, unknown>): Promise<PageSaid> {
  if (without.has(base)) return client.call<PageAnswer>('previewPage', { body });
  const out = client.call<TodayAnswer>('today', { body });
  const entry: Held = { base, token: tokenNow(), at: Date.now(), answer: out.then((o) => (o.ok ? o.value : null), () => null) };
  held = entry;
  const got = await out;
  if (got.ok) return { ...got, value: got.value.page };
  if (held === entry) held = null;
  if ('refusal' in got && UNSERVED.has(got.refusal.code)) {
    without.add(base);
    return client.call<PageAnswer>('previewPage', { body });
  }
  return got as PageSaid;
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

/** The project cards' parts for the projects list `register`, from the held answer, or `null` to ask for them. */
export async function cardsHeld(base: string, register: string): Promise<TodayCards | null> {
  const got = await (todayHeld(base) ?? Promise.resolve(null));
  return got?.cards?.register === register ? got.cards : null;
}

/* DROPPED WITH THE REST OF TODAY (`forgetToday`), where the app's `forget` runs: a record switch, a sign-out. */
onForgetToday(() => {
  held = null;
});
