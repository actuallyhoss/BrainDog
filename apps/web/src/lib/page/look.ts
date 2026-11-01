/**
 * A page's look on screen: the order the engine put its blocks in, the one next action under its headline, a person's
 * pin, and the Undo on what Slash arranged.
 *
 * THE RECORD APPLIES THE LOOK AND THE PAGE APPLIES IT AGAIN, AS A VIEW. `readPage` answers the blocks in the look's
 * order (`applyLook` in `packages/kernel/src/compose.ts`), and `lookOrder` is the same rule, so it puts them in that order
 * once more without moving any block's index, which every id, write and Edit layout place on the page is kept by.
 * Applied to blocks already in the look's order it changes nothing, so it is the same page whichever side applied it,
 * and a record that answers the look beside blocks it left in declared order is drawn the same way.
 *
 * THE PAGE'S SENTENCE STAYS FIRST. The look's lead goes straight under it: the head rides over the headline tile
 * (`lead.ts`), and a lead put above the sentence would leave the head over a figure.
 *
 * A PIN IS THE PERSON'S, AND IT WINS (§38: "his pins always win"). Pin this writes the person's own look, the page as it
 * is drawn now with every block pinned in place, and the engine still writes its headline and next action around them;
 * Unpin retires it, and the engine arranges the page again.
 *
 * WHAT SLASH ARRANGES WHILE THE PERSON IS LOOKING IS OFFERED BACK FOR SIX SECONDS (§37's Undo), and kept once they
 * pass, so its history reads "Slash arranged · Mara kept". What it arranged overnight was arranged while nobody was
 * there, as a suggestion is filed to Decide rather than offered: it is the page as it opens, the menu says who arranged
 * it, and Pin or Change this page answers it.
 *
 * PURE BUT FOR THE WRITES, AND NODE LOADS IT, so `look.test.ts` holds the order, the bodies and the Undo's timing.
 */

import { createClient } from '@braindog/client';
import { copy } from '../copy.ts';
import { UNDO_MS } from '../data/optimistic.ts';
import type { LiveLook } from '../record/page-live.ts';
import { rowOfKey, type RowAt } from './row-verbs.ts';
import { words } from './words.ts';

type Fetch = NonNullable<Parameters<typeof createClient>[0]['fetch']>;

/**
 * What the order reads off a block: its key, its kind, whether it is the page's sentence (`note lead`), the column it is
 * in, and whether it is drawn.
 */
export type Placed = {
  readonly key: string;
  readonly kind?: string;
  readonly head?: boolean;
  readonly area?: string | undefined;
  readonly drawn?: boolean;
};

const areaOf = (b: Placed): 'main' | 'rail' => (b.area === 'rail' ? 'rail' : 'main');

/** The kinds the rules never move, which a lead goes after when the page opens on them (the kernel's `STAYS`). */
const STAYS: ReadonlySet<string> = new Set(['note', 'capture', 'inputs', 'section']);

/**
 * Where a lead goes, as the kernel's `topOf` finds it: the first block of the main column after the page's opening (its
 * sentence and notes, the line a row is typed into, its forms, and what is not drawn among them). A heading ends the
 * opening. Anything else would put the lead somewhere the record did not, and every read would move it again.
 */
const opens = (b: Placed): boolean => b.head === true || STAYS.has(b.kind ?? '');
const isTop = (b: Placed): boolean => areaOf(b) === 'main' && (b.kind === 'section' || (!opens(b) && b.drawn !== false));

/** A block as the order reads it, under the key the page knows it by. */
export const placedOf = (b: { kind: string; drawn: boolean; lead?: unknown; area?: unknown }, key: string): Placed => ({
  key,
  kind: b.kind,
  head: b.kind === 'note' && b.lead === true,
  area: typeof b.area === 'string' ? b.area : undefined,
  drawn: b.drawn,
});

/**
 * The blocks' indexes in the order the look draws them: the kernel's `applyLook`, rule for rule.
 *
 * `order` REORDERS ONLY THE BLOCKS IT NAMES, IN THE PLACES THEY HELD, A COLUMN AT A TIME: in each column the first place
 * one of them held takes the first it names there, and so on, so a look that names two blocks swaps those two and moves
 * nothing else. That is what "order may only reorder existing keys" leaves the rest of the page, and it is why the order
 * is the same applied twice. A block the person pinned moves only under the person's own look.
 *
 * THE LEAD GOES TO THE TOP OF THE MAIN COLUMN, after the page's opening (`isTop`), when it is drawn and in the main
 * column.
 */
export function lookOrder(blocks: readonly Placed[], look: Pick<LiveLook, 'lead' | 'order' | 'pinned' | 'by'> | null): number[] {
  const out = blocks.map((_, i) => i);
  if (!look) return out;
  const at = new Map<string, number>();
  blocks.forEach((b, i) => {
    if (!at.has(b.key)) at.set(b.key, i);
  });
  const pins = new Set(look.pinned);
  const order = [...new Set(look.order)].filter((k) => at.has(k) && (look.by === 'owner' || !pins.has(k)));
  const named = new Set(order);
  for (const area of ['main', 'rail'] as const) {
    const places = blocks.flatMap((b, i) => (areaOf(b) === area && named.has(b.key) ? [i] : []));
    const placed = order.filter((k) => areaOf(blocks[at.get(k)!]!) === area).map((k) => at.get(k)!);
    places.forEach((place, n) => {
      out[place] = placed[n]!;
    });
  }
  /* THE LEAD, STRAIGHT UNDER THE PAGE'S SENTENCE. */
  const lead = look.lead === null ? undefined : at.get(look.lead);
  if (lead === undefined) return out;
  const block = blocks[lead]!;
  const from = out.indexOf(lead);
  const top = out.findIndex((i) => isTop(blocks[i]!));
  if (areaOf(block) === 'main' && block.drawn !== false && top !== -1 && top < from) {
    out.splice(from, 1);
    out.splice(top, 0, lead);
  }
  return out;
}

/** Whether the person pinned the page: their own look, with blocks pinned in it. */
export const isPinned = (look: LiveLook | null): boolean => look !== null && look.by === 'owner' && look.pinned.length > 0;

/** Whether Slash arranged the page and nobody has kept it yet, which is the arrangement the Undo is offered on. */
export const slashOpen = (look: LiveLook | null): boolean => look !== null && look.by === 'slash' && look.kept === null;

/**
 * The page a look is written under: the declaration it is laid over, as the record answered it, which a page drawn from
 * a template shares with every page like it, else the page's own address.
 */
export const lookPage = (slug: string, look: LiveLook | null): string => look?.page ?? slug;

/** One arrangement of one page: what a Slash arrangement is offered Undo by, and kept by. */
export const offerKey = (slug: string, look: LiveLook): string => `${slug}|${look.by}|${look.basis ?? ''}|${look.lead ?? ''}|${look.order.join(',')}`;

/** The arrangements this tab has offered Undo on already, by `offerKey`, so a page read again is not offered it twice. */
export const offered = new Set<string>();

/** Who kept each arrangement offered here, by `offerKey`, for the history line when the record does not say it. */
export const keptHere = new Map<string, string>();

/**
 * Whether Slash's look over a page is a new arrangement landing while the person looks at it: Slash's, kept by nobody,
 * and not the arrangement the page was drawn with a moment ago. The first look a page is drawn with is the one it opened
 * on, whoever arranged it.
 */
export function arrivedNow(slug: string, before: LiveLook | null | undefined, now: LiveLook | null): boolean {
  if (before === undefined || !slashOpen(now)) return false;
  return before === null || offerKey(slug, before) !== offerKey(slug, now!);
}

/** How the page came to look as it does, in a line, or `null` where the rules arranged it and there is nothing to say. */
export function historyOf(look: LiveLook | null, kept: string | null = null): string | null {
  if (look?.by === 'slash') return (look.kept ?? kept) ? words.slashKept((look.kept ?? kept)!) : words.slashArranged;
  if (look?.by === 'owner' && look.pinned.length > 0) return words.pinnedLine;
  return null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A day as a person says it, "7 October", or `null` when the record sent none that reads. */
const dayOf = (at: string | null | undefined): string | null => {
  const d = typeof at === 'string' && at !== '' ? new Date(at) : null;
  return d === null || Number.isNaN(d.getTime()) ? null : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/**
 * PUT BACK, NAMED BY WHOSE LOOK IT TAKES OFF: "Put back: Slash's arrangement of 7 October", or "your
 * arrangement" for the person's own pin or arrangement, any day after. `at` is when the look was written, when the record
 * says; without it the line names no day. `null` where the rules arranged the page and there is nothing to put back.
 */
export function putBackWords(look: LiveLook | null, at: string | null | undefined): string | null {
  if (look === null || (look.by !== 'slash' && look.by !== 'owner')) return null;
  const whose = look.by === 'slash' ? "Slash's arrangement" : 'your arrangement';
  const day = dayOf(at);
  return `Put back: ${whose}${day === null ? '' : ` of ${day}`}`;
}

/** What came back once Put back was pressed, said over the page by its title. */
export const putBackSaid = (title: string, restored: 'previous' | 'rules'): string =>
  restored === 'rules' ? `${title} is back as BrainDog arranges it.` : `${title} is back as it was before.`;

/**
 * Where the look's next action goes: a row it names by its handle (`tasks#4`), opened beside the page, else at its own
 * address; a question waiting on the reader, on Decide; anything else is the line alone.
 */
export function nextOf(look: LiveLook | null, questions: ReadonlySet<string> = new Set()): { text: string; row: RowAt | null; href: string | null } | null {
  if (!look?.next) return null;
  const row = rowOfKey(look.next.row);
  if (row) return { text: look.next.text, row, href: `/r/${row.register}/${row.seq}` };
  if (questions.has(look.next.row)) return { text: look.next.text, row: null, href: `/decide/${encodeURIComponent(look.next.row)}` };
  return { text: look.next.text, row: null, href: null };
}

/** What `repeatsFirst` reads off the first tile on the board: its questions, its list and the rows it draws. */
export type FirstTile = {
  readonly queue?: readonly { readonly id: string }[] | undefined;
  readonly register?: string | undefined;
  readonly entries?: readonly { readonly seq: number; readonly fields?: Readonly<Record<string, unknown>> }[] | undefined;
};

/**
 * WHETHER THE NEXT STEP IS ALREADY THE FIRST THING ON THE BOARD: the first question of the first tile,
 * or its first row. The line under the header then says nothing the eye does not meet straight after it, and is not
 * drawn: Money's "Invoice 2026-041 was due 38 days ago. Chase it?" stood over the same question as the first card.
 */
export function repeatsFirst(look: LiveLook | null, first: FirstTile | null | undefined): boolean {
  const next = look?.next?.row;
  if (!next || !first) return false;
  if (first.queue?.[0]?.id === next) return true;
  const row = rowOfKey(next);
  const lead = first.entries?.[0];
  /* OR A LIST OF WHAT FALLS DUE, whose first line names the row it is from (`fields.row`): Coming up opens on Late, and
     "Legal review, June is 64 days late" stood over the same bill as Late's first line (design pass 1 Nov, M25). */
  if (lead?.fields?.row === next) return true;
  return row !== null && lead !== undefined && first.register === row.register && lead.seq === row.seq;
}

/* ── the bodies ─────────────────────────────────────────────────────────── */

type Body = Record<string, unknown>;

/** A block's key as a look may name it (the kernel's `BLOCK_KEY`): a key the record answered, never one the page made up. */
const BLOCK_KEY = /^[a-z][a-z0-9_-]{0,47}$/u;

/** What a pin is composed from, when the look it pins over says nothing: the person, pinning the page as drawn. */
const PIN_BASIS = 'pinned';

/**
 * A look as the record is sent it: `look` FIRST, because a declaration's first key is its kind and its id is that kind
 * and the page (`look.money`), then only the keys a look has (`LOOK_KEYS`), each only when it says something. Who kept
 * it is not one: the record keeps that in the look's history.
 */
export function bodyOf(slug: string, look: Omit<LiveLook, 'kept'>): Body {
  return {
    look: slug,
    basis: look.basis ?? PIN_BASIS,
    by: look.by,
    ...(look.lead !== null ? { lead: look.lead } : {}),
    ...(look.order.length ? { order: [...look.order] } : {}),
    ...(look.hide.length ? { hide: [...look.hide] } : {}),
    ...(look.headline !== null ? { headline: look.headline } : {}),
    ...(look.next !== null ? { next: { ...look.next } } : {}),
    ...(look.pinned.length ? { pinned: [...look.pinned] } : {}),
  };
}

/**
 * PIN THIS: the page as it is drawn now, every block in its place and pinned there, as the person's own look. What the
 * engine hid stays hidden (but never a block now pinned, which the record refuses), and the lead stays the lead; the
 * headline and the next action are left out, so the engine still writes them around the pinned blocks (`mergeLook`).
 * Only keys the record answered are named: a block on a record older than the look has none, and is left as it is.
 */
export function pinBody(slug: string, look: LiveLook | null, keys: readonly string[]): Body {
  const kept = [...new Set(keys.filter((k) => BLOCK_KEY.test(k)))];
  const pinned = new Set(kept);
  const lead = look?.lead ?? null;
  return bodyOf(slug, {
    basis: look?.basis ?? null,
    lead: lead !== null && BLOCK_KEY.test(lead) ? lead : null,
    order: kept,
    hide: (look?.hide ?? []).filter((k) => !pinned.has(k) && k !== lead),
    headline: null,
    next: null,
    pinned: kept,
    by: 'owner',
    page: slug,
  });
}

/** A block the look hides, by its key and its heading, and whether the person's own look hid it or the engine did. */
export type Hidden = { readonly key: string; readonly heading: string; readonly by: 'you' | 'engine' };

/** A block as Hidden names it: its key, and its heading when it has one. */
export type Headed = { readonly key: string; readonly heading?: string | null | undefined };

/** A key in words, for a block whose heading the page did not hand over: `open-tasks` is "Open tasks". */
const keyWords = (key: string): string => key.replace(/[-_]+/gu, ' ').trim().replace(/^./u, (c) => c.toUpperCase());

/**
 * WHAT THE LOOK HIDES, so the page menu can say "Hidden (2)" and offer Show beside each. The person's own look
 * hid what it hides, and any other look is the engine's (Slash's or the rules'). A pinned block is never hidden
 * (`mergeLook`), so none is listed. Each by its heading, else its key in words, never the key itself.
 */
export function hiddenOf(look: LiveLook | null, blocks: readonly Headed[]): Hidden[] {
  if (look === null) return [];
  const pins = new Set(look.pinned);
  const heads = new Map(blocks.map((b) => [b.key, b.heading?.trim() || null]));
  const by = look.by === 'owner' ? 'you' : 'engine';
  return [...new Set(look.hide)].filter((k) => !pins.has(k)).map((key) => ({ key, heading: heads.get(key) ?? keyWords(key), by }));
}

/**
 * SHOW ONE HIDDEN BLOCK: the person's own look with that key out of `hide` and in `pinned`, the one way his look outranks
 * the engine's hide (`mergeLook` hides nothing he pinned). The record answers the look already merged, his over the
 * engine's, so a key on his own look may be the engine's to hide as well: it is pinned either way, or it would stay
 * hidden. Over a look that is not his, his own is written with that one pin and nothing else, so the engine still
 * arranges the rest. His headline and next action are left out, as Pin leaves them, for the engine to fill in.
 */
export function showBody(slug: string, look: LiveLook | null, key: string): Body {
  const his = look?.by === 'owner';
  const hide = (his ? look!.hide : []).filter((k) => k !== key);
  const pinned = [...new Set([...(his ? look!.pinned : []), key])].filter((k) => BLOCK_KEY.test(k));
  return bodyOf(slug, {
    basis: look?.basis ?? null,
    lead: his ? look!.lead : null,
    order: his ? look!.order : [],
    hide,
    headline: null,
    next: null,
    pinned,
    by: 'owner',
    page: slug,
  });
}

/* ── the writes ─────────────────────────────────────────────────────────── */

export type Wrote = { ok: true } | { ok: false; fix: string; code?: string };

/** A write's answer as one line: done, or the record's own sentence for why not. */
async function said(out: Promise<{ ok: boolean }>): Promise<Wrote> {
  const got = await out;
  if (got.ok) return { ok: true };
  const refusal = (got as { refusal?: { fix?: unknown; code?: unknown } }).refusal;
  return {
    ok: false,
    fix: typeof refusal?.fix === 'string' ? refusal.fix : copy.recordNotReached,
    ...(typeof refusal?.code === 'string' ? { code: refusal.code } : {}),
  };
}

/** A method this build of the record or of its client does not route yet. */
const unrouted = (w: Wrote): boolean => !w.ok && w.code === 'ROUTE_UNKNOWN';

/** Writes a look, the owner's call as every declaration set from the app is. */
export function writeLook(base: string, body: Body, io?: Fetch): Promise<Wrote> {
  return said(createClient({ base, ...(io ? { fetch: io } : {}) }).call('setDeclaration', { body }));
}

/** Retires the page's look, so the engine arranges it again from the record. */
export function retireLook(base: string, slug: string, io?: Fetch): Promise<Wrote> {
  return said(createClient({ base, ...(io ? { fetch: io } : {}) }).call('retireDeclaration', { id: `look.${slug}` }));
}

/**
 * UNDO ON WHAT SLASH ARRANGED: the record's own `undoLook` (`packages/record/src/compose-look.ts`), which puts back the
 * look Slash's replaced, or none, and only while Slash's is still the live one. Where the record routes no such method
 * yet, Slash's look is retired and the page arranged by the rules again, which is the look before it on a page Slash
 * arranged first. Never the person's own pin, which Slash never replaces.
 */
export async function undoLook(base: string, slug: string, io?: Fetch): Promise<Wrote> {
  const out = await said(createClient({ base, ...(io ? { fetch: io } : {}) }).call('undoLook', { page: slug }));
  return unrouted(out) ? retireLook(base, slug, io) : out;
}

/**
 * KEEPING WHAT SLASH ARRANGED: the record's `keepLook`, which writes "Slash arranged · <person> kept" into the look's
 * history. Keeping changes nothing on the page, so where the record routes no such method yet there is nothing to do,
 * and the history line is said from this tab's own memory (`keptHere`).
 */
export async function keepLook(base: string, slug: string, io?: Fetch): Promise<Wrote> {
  const out = await said(createClient({ base, ...(io ? { fetch: io } : {}) }).call('keepLook', { page: slug }));
  return unrouted(out) ? { ok: true } : out;
}

/** What Put back answers: what came back, or the record's sentence for why nothing did. */
export type PutBack = { ok: true; restored: 'previous' | 'rules' } | { ok: false; fix: string; code?: string };

/**
 * PUT BACK, ANY DAY AFTER: the record's `undoLook`, one step back whoever wrote the look, the person's pin as much as
 * Slash's arrangement. Unlike the six-second Undo it has no stand-in where the record does not route it: retiring the
 * look is not one step back from a pin, so the line says the record cannot yet.
 */
export async function putBack(base: string, slug: string, io?: Fetch): Promise<PutBack> {
  const got = (await createClient({ base, ...(io ? { fetch: io } : {}) }).call('undoLook', { page: slug })) as { ok: boolean; value?: { restored?: unknown } };
  if (got.ok) return { ok: true, restored: got.value?.restored === 'rules' ? 'rules' : 'previous' };
  const out = await said(Promise.resolve(got));
  if (out.ok) return { ok: true, restored: 'previous' };
  return unrouted(out) ? { ok: false, fix: 'This BrainDog cannot put a page back yet.', code: 'ROUTE_UNKNOWN' } : out;
}

/* ── the six seconds ────────────────────────────────────────────────────── */

/** How often a waiting offer looks to see whether its line is still on screen. */
const LOOK_EVERY = 400;
/** How long an offer waits at most: a line held open under a resting pointer is kept once this has passed. */
const WAIT_MOST = 120_000;

/**
 * Offers Undo on what Slash arranged, and keeps it once the offer is gone unanswered.
 *
 * THE LINE'S OWN LIFE IS THE CLOCK. The stack pauses a line while the pointer is over it (`toast.svelte.ts`), so the
 * six seconds are the ones the person had, and the arrangement is kept once the line has left the screen without its
 * Undo pressed, not at a timer of this file's that a resting pointer would have outrun.
 */
export function offerUndo(d: {
  push: (undo: () => void, life: number) => number;
  alive: (id: number) => boolean;
  undo: () => void;
  keep: () => void;
  later?: (run: () => void, ms: number) => unknown;
}): void {
  const later = d.later ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  let undone = false;
  const id = d.push(() => {
    undone = true;
    d.undo();
  }, UNDO_MS);
  let waited = 0;
  const check = () => {
    if (undone) return;
    if (d.alive(id) && waited < WAIT_MOST) {
      waited += LOOK_EVERY;
      later(check, LOOK_EVERY);
      return;
    }
    d.keep();
  };
  later(check, LOOK_EVERY);
}
