/**
 * The model's half of the briefing (ENG-B12): when a model is asked to write it, and the one answer that is kept.
 *
 * Pure: nothing here reads a table, holds a kernel or asks a model. A caller hands the facts it gathered, the instant,
 * the reader's zone, a pref's get and set, and an `ask` that goes through the meter to whatever model the host has.
 * `briefTick` asks once a slot of the day (before 08:00, 08:00 to 17:00, after 17:00) and again when the facts move,
 * `BRIEF_ASKS_DAY` times a day at most, and keeps the answer under one pref with the basis it was written from, so it
 * needs no table. `keptBrief` hands that answer back only while the facts are still the ones it was written from; the
 * read then makes the cards with `briefFrom`, which fills each hole from the record as it is now.
 */

import { BRIEF_CARDS_MOST, briefBasis, briefCandidates, briefFault, briefInput, briefOf, type BriefFact, type BriefInput } from './briefing.ts';

/** The pref the one kept briefing lives under, as Slash's own. */
export const BRIEF_KEPT = 'briefing';

/** The pref counting the day's briefing asks, with the slot and the basis last asked at. */
export const BRIEF_ASKED = 'briefing.asked';

/** At most this many briefing asks in one day: one a slot, and one more for facts that moved. */
export const BRIEF_ASKS_DAY = 4;

/** The hours, in the reader's zone, a new briefing is written at: the morning's and the evening's. */
export const BRIEF_HOURS = [8, 17] as const;

/** What is kept when the model was asked and nothing of its answer stands. */
export const BRIEF_NO_ANSWER = 'The model did not answer, so the rules wrote this.';

/**
 * The briefing as it is kept: the day and the slot it was written in, the basis it was written from, when, the cards
 * the model wrote that passed (each its handle and its line, holes unfilled), and `said`, `null` when cards stand and
 * else the sentence a reader is told beside the rules' cards.
 */
export type KeptBrief = { day: string; slot: number; basis: string; at: string; cards: { h: string; line: string }[]; said: string | null; lens?: string };

/**
 * THE LENS A KEPT BRIEF WAS WRITTEN THROUGH, and the only one it is shown through (sharing plan T16). The ticks gather
 * facts as somebody who reads the whole record, which is `WHOLE_LENS`; any other reader has a lens of their own
 * (`briefLensOf`), so a brief is never handed to somebody whose facts only happen to match. A kept brief from before
 * lenses carries none and was gathered whole.
 */
export const WHOLE_LENS = 'whole';

/**
 * A reader's lens as a kept brief is keyed by: `WHOLE_LENS` for whoever reads across the whole record with nothing
 * hidden, else everything their context narrows by (who, their rung, their lists, their rows and hidden fields), as
 * one text. `across` is the record's `readsAcross`; absent, the caller is taken to read it whole, as a method file built
 * without it is a test of the arithmetic.
 */
export function briefLensOf(
  ctx: { principal: { kind: string; id: string; person?: string; level?: unknown }; registers?: unknown; levels?: unknown; wheres?: unknown; hides?: Readonly<Record<string, readonly string[]>> | undefined; nots?: unknown },
  across?: (ctx: never) => boolean,
): string {
  const hidden = Object.values(ctx.hides ?? {}).some((f) => f.length > 0);
  if (!hidden && (across === undefined || across(ctx as never))) return WHOLE_LENS;
  const p = ctx.principal;
  return JSON.stringify([p.person ?? p.id, p.level ?? null, ctx.registers ?? null, ctx.levels ?? {}, ctx.wheres ?? {}, ctx.hides ?? {}, ctx.nots ?? {}]);
}

/** The day's asks: how many, and the slot and basis of the last one. */
export type BriefAsked = { day: string; asks: number; slot: number | null; basis: string | null };

/** How a briefing is asked for: through the meter, answering what the model said or the sentence saying why it was not asked. */
export type BriefAsk = (input: BriefInput) => Promise<{ raw: unknown } | { spent: string }>;

const partsIn = (now: number, zone: string): Intl.DateTimeFormatPart[] =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));

/**
 * The day and the slot an instant falls in, in a zone: slot 0 before the first of `BRIEF_HOURS`, 1 from it to the
 * second, 2 after. A zone nobody knows is read as UTC.
 */
export function briefSlot(now: number, zone: string): { day: string; slot: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = partsIn(now, zone);
  } catch {
    parts = partsIn(now, 'UTC');
  }
  const of = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(of('hour'));
  return { day: `${of('year')}-${of('month')}-${of('day')}`, slot: BRIEF_HOURS.filter((h) => hour >= h).length };
}

/** The day's asks as kept, or none yet for a new day or a value that is not one. */
function askedOn(value: unknown, day: string): BriefAsked {
  const none: BriefAsked = { day, asks: 0, slot: null, basis: null };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return none;
  const v = value as Partial<BriefAsked>;
  if (v.day !== day || typeof v.asks !== 'number' || !Number.isInteger(v.asks) || v.asks < 0) return none;
  return { day, asks: v.asks, slot: typeof v.slot === 'number' ? v.slot : null, basis: typeof v.basis === 'string' ? v.basis : null };
}

/** A kept briefing read back from its pref, or `null` for anything else. */
function keptOf(value: unknown): KeptBrief | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Partial<KeptBrief>;
  if (typeof v.day !== 'string' || typeof v.slot !== 'number' || typeof v.basis !== 'string' || typeof v.at !== 'string') return null;
  if (v.said !== null && typeof v.said !== 'string') return null;
  if (!Array.isArray(v.cards)) return null;
  const cards: KeptBrief['cards'] = [];
  for (const c of v.cards as unknown[]) {
    if (c === null || typeof c !== 'object') return null;
    const { h, line } = c as { h?: unknown; line?: unknown };
    if (typeof h !== 'string' || typeof line !== 'string') return null;
    cards.push({ h, line });
  }
  return { day: v.day, slot: v.slot, basis: v.basis, at: v.at, cards, said: v.said, ...(typeof v.lens === 'string' ? { lens: v.lens } : {}) };
}

/**
 * The kept briefing, only while it is about the facts as they are: `briefBasis(briefCandidates(facts))` is the basis
 * it was written from. Else `null`, and the rules say the cards until the model is asked again.
 */
export function keptBrief(kept: unknown, facts: readonly BriefFact[], lens: string = WHOLE_LENS): KeptBrief | null {
  const k = keptOf(kept);
  return k !== null && k.basis === briefBasis(briefCandidates(facts)) && (k.lens ?? WHOLE_LENS) === lens ? k : null;
}

/**
 * One tick of the briefing. It asks the model when this slot of the day has not been asked at this basis and the day
 * has asks left, and keeps what came back: the cards that pass, or none with the sentence saying why (unless cards
 * written from these same facts already stand, which are left). `asked` says
 * whether the model was asked, `kept` what was written, and `dropped` a sentence for the log when part of an answer or
 * all of it was left out. With nothing to say, nothing is asked.
 */
export async function briefTick(args: {
  facts: readonly BriefFact[];
  now: number;
  zone: string;
  read: (key: string) => unknown;
  write: (key: string, value: unknown) => void;
  ask: BriefAsk;
  /** The lens `facts` were gathered through (`briefLensOf`); the whole record's when left out. */
  lens?: string;
}): Promise<{ asked: boolean; kept: KeptBrief | null; dropped: string | null }> {
  const { now, read, write } = args;
  const idle = { asked: false, kept: null, dropped: null };
  const handed = briefCandidates(args.facts);
  if (handed.length === 0) return idle;
  const basis = briefBasis(handed);
  const { day, slot } = briefSlot(now, args.zone);
  const asked = askedOn(read(BRIEF_ASKED), day);
  if (asked.slot === slot && asked.basis === basis) return idle;
  if (asked.asks >= BRIEF_ASKS_DAY) return idle;
  /* COUNTED BEFORE THE MODEL IS ASKED, answered or not, as a headline's ask is: the ask awaits the meter and the model,
     and a tick that comes in meanwhile reads this count, slot and basis, so it never asks the same again. A model that
     fails is not asked again at the same basis in the same slot; a meter that refuses spends the day's ask too. */
  write(BRIEF_ASKED, { day, asks: asked.asks + 1, slot, basis } satisfies BriefAsked);
  let cards: KeptBrief['cards'] = [];
  let said: string | null = BRIEF_NO_ANSWER;
  let dropped: string | null = null;
  try {
    const got = await args.ask(briefInput(handed, day));
    if ('spent' in got) {
      said = got.spent;
      dropped = `${got.spent} The rules wrote the briefing.`;
    } else {
      /* KEPT AS THE MODEL WROTE IT, holes unfilled: the read checks each card again and fills it from the record. */
      const raw = (got.raw as { cards?: unknown } | null)?.cards;
      for (const c of Array.isArray(raw) ? (raw as { h: string; line: string }[]) : []) {
        if (cards.length === BRIEF_CARDS_MOST) break;
        if (briefOf({ cards: [c] }, handed).length === 0 || cards.some((k) => k.h === c.h)) continue;
        cards.push({ h: c.h, line: c.line.trim() });
      }
      if (cards.length > 0) said = null;
      dropped = briefFault(got.raw, handed);
    }
  } catch {
    cards = [];
    dropped = BRIEF_NO_ANSWER;
  }
  const kept: KeptBrief = { day, slot, basis, at: new Date(now).toISOString(), cards, said, lens: args.lens ?? WHOLE_LENS };
  /* A LATER ASK MAY HAVE GONE OUT WHILE THIS ONE WAITED (the facts moved): its answer is the newer, so this one is not kept over it. */
  const since = askedOn(read(BRIEF_ASKED), day);
  if (since.slot !== slot || since.basis !== basis) return { asked: true, kept: null, dropped };
  /* AN ANSWER THAT STANDS IS NOT WIPED BY A MODEL THAT FAILED: asked again in a new slot with the facts unmoved, a
     model that is down or a meter that is spent leaves the cards written from these same facts where they are. */
  const stands = keptOf(read(BRIEF_KEPT));
  if (cards.length === 0 && stands !== null && stands.basis === basis && stands.cards.length > 0) return { asked: true, kept: null, dropped };
  write(BRIEF_KEPT, kept);
  return { asked: true, kept, dropped };
}
