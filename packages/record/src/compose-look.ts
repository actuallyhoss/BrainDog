/**
 * The model's half of a page's look: what leads after the lead note, the headline, and the one thing to do next.
 *
 * THE SHELL IS FIXED AND WHAT FILLS IT IS COMPOSED. The kernel lays a `look.<page>` declaration over a
 * page at read time ("Look overlay"), and its rules answer one when none is stored. This file is
 * what the model adds to that, and it rides inside the night's headline ask (`headlines.ts`), so it costs Free no ask
 * beyond the line it already had: each page is handed its blocks by `key` and a few of the rows it draws by handle and
 * title, and may answer `{ headline, lead, order, hide, next }` in place of the bare line.
 *
 * NOTHING THE MODEL SAYS IS TRUSTED AS IT CAME. The headline passes `headlineFault` or the rules' line stands. An order
 * names only keys the page was handed, each once, and never moves anything ahead of the lead note. A next names a row the
 * page was handed and says it in one short plain phrase, with no number it was not handed and none of the system's
 * words. A lead names one part it was handed, of the main column, that is not a heading or a line that keeps its place.
 * What it leaves out is never pinned, never a part that could not be drawn, never what leads, never the questions, and
 * never the last thing the main column shows. A part that fails is dropped on its own, with the record's sentence for
 * why, and the rest is kept.
 *
 * VERSIONED, SO UNDO PUTS BACK THE ONE BEFORE. Every look Slash writes is a declaration (`by: 'slash'`) installed over
 * the live version it read, and Slash's pref `look.undo.<page>` keeps that version and the body it replaced. `undoLook`
 * reinstalls the body (or retires the look when there was none) while the live look is still the one Slash wrote, and
 * any other look, the person's own included, goes back one kept version a press (Put back).
 * A look put back is a no: `look.undone.<page>` keeps what it was written from, and Slash writes none over that page
 * until that moves (`undoneFor`).
 *
 * AN OWNER'S LOOK IS NEVER TOUCHED. A look the person set ("Change this…", Pin) or a pack shipped is not Slash's to write
 * over, whatever the model answered, and while one fixes the headline, Slash's line is not sent on that page.
 *
 * CACHED ON WHAT IT WAS WRITTEN FROM. A look carries `basis`, the page's `headlineBasis` and its `factsBasis` together
 * (`lookBasis`), so its headline and next are sent only while the figures and the named things still hold
 * (`lookHeld`), and a page whose basis did not move is not asked about again (`slashHeadlines`'s `owed`).
 *
 * AND WHAT IS STORED IS WHAT A READ DRAWS. The kernel never lets the engine lead a page with the questions, nor move
 * them, unless the page is Today, Decide or nothing but questions (`questionsLead`, `applyLook`). An order naming them
 * anywhere else is stored without them (`lookKept`), so Undo, the history and the next night's "did anything change"
 * all read the arrangement the person was shown.
 */

import type { BlockResult, Json, Kernel } from '@braindog/kernel';
import { GROUPED_BY_FIELD, GROUP_VALUES_LEAST as VALUES_LEAST, GROUP_VALUES_MOST as VALUES_MOST, LOOK_GROUPS_MOST, SLASH, queuesKept } from '@braindog/kernel';
import type { Refusal, Result, Sql } from '@braindog/ports';
import { ok } from '@braindog/ports';

import {
  HEADLINE_BLOCKS_MOST,
  HEADLINE_RAW_MOST,
  HEADLINE_ROWS_MOST,
  HOME_PAGE,
  SYSTEM_WORDS,
  headlineFault,
  numbersIn,
  numbersOf,
  type HeadlineBlock,
  type HeadlinePage,
  type HeadlineRow,
} from './headlines.ts';
import { scrubbed } from './scrub.ts';

/** The declaration kind a look is, beside `page`. */
export const LOOK_KIND = 'look';

/** A page's look by its declaration id: `look.money`. */
export const lookId = (page: string): string => `look.${page}`;

/** Slash's pref keeping what Undo restores: the version Slash wrote and the body it replaced. Not `headline.`, so no page's line is it. */
export const lookUndoKey = (page: string): string => `look.undo.${page}`;

/** Slash's pref keeping what the look the person put back was written from, so the same one is not written again (`undoneFor`). */
export const lookUndoneKey = (page: string): string => `look.undone.${page}`;

/** Slash's pref keeping who kept its look over a page and which version they kept, for the history line "Slash arranged · Mara kept". */
export const lookKeptKey = (page: string): string => `look.kept.${page}`;

/**
 * The pref keeping where Put back last stepped to: the version it wrote and the older version it wrote again, so a
 * second press walks on from that one and does not step back onto the look the first press took off.
 */
export const lookBackKey = (page: string): string => `look.back.${page}`;

/** The next thing to do is a phrase under the headline, shorter than the line itself. */
export const NEXT_MOST = 80;

/** Who set a look: the kernel's rules, Slash, or the person. */
export type LookBy = 'rule' | 'slash' | 'owner';

/** One thing to do next: the handle of a row the page draws, and the phrase a person reads. */
export type LookNext = { row: string; text: string };

/**
 * A look as `look.<page>` declares it (the kernel's `compose.ts`). `look` is the page it is laid
 * over, which the kernel reads the declaration's id from; every key but `look`, `basis` and `by` is optional.
 */
export type LookBody = {
  look: string;
  basis: string;
  by: LookBy;
  lead?: string;
  order?: string[];
  hide?: string[];
  headline?: string;
  next?: LookNext;
  pinned?: string[];
  /** Which parts are drawn in groups, and by which field of their list (the kernel's `LookBody.group`). */
  group?: Record<string, string>;
  /** How wide each part is drawn, in twelfths, and which column it sits in (the kernel's `LookBody.span`, `.area`). The person's own look only. */
  span?: Record<string, number>;
  area?: Record<string, 'main' | 'rail'>;
};

/** The widths a look may give a part: the kernel's `LOOK_SPANS`, the board's five. */
const SPANS: ReadonlySet<number> = new Set([12, 8, 6, 4, 3]);

/** The live look over a page as the record holds it: its version, the pack that shipped it, and its body. */
export type LiveLook = { version: number; pack: string | null; body: LookBody };

/** What a page's look was written from: the figures' basis and the named things', as `HEADLINES_ASKED` keeps them. */
export const lookBasis = (basis: string, facts: string | undefined): string => (facts === undefined ? basis : `${basis}:${facts}`);

/** What a look is read from, as far as these rules ask. */
type Kept = Pick<Kernel, 'declarations' | 'install' | 'retire' | 'prefsOf' | 'setPref'>;

/** A block as a page read answered it, read here only for the keys the look asks of. */
type ReadBlock = {
  key?: unknown;
  kind?: unknown;
  source?: unknown;
  heading?: unknown;
  lead?: unknown;
  area?: unknown;
  drawn?: unknown;
  refusals?: unknown;
  rows?: unknown;
  group?: unknown;
};

/** A block key the kernel reads (`block-keys.ts` `BLOCK_KEY`), so a look naming it installs. */
const BLOCK_KEY = /^[a-z][a-z0-9_-]{0,47}$/u;

/**
 * A block's key: the one the kernel answers on every block (declared, or its hash of kind, source and heading), or, on a
 * read from before the kernel answered one, the same three hashed here the way the kernel's `defaultBlockKey` hashes
 * them (32-bit FNV-1a in base 36), so an order written from it names the block the kernel will.
 */
export function blockKeyOf(block: unknown): string {
  const b = (block ?? {}) as ReadBlock;
  if (typeof b.key === 'string' && BLOCK_KEY.test(b.key)) return b.key;
  const part = (v: unknown): string => (typeof v === 'string' ? v : '');
  const text = JSON.stringify([part(b.kind), part(b.source), part(b.heading)]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `k${h.toString(36).padStart(7, '0')}`;
}

/** Whether a block was drawn and refused nothing: one the person sees, and so one a look may place. */
const shown = (b: ReadBlock): boolean => b.drawn !== false && !(Array.isArray(b.refusals) && b.refusals.length > 0);

/**
 * What a page's ask is handed for its look: its drawn blocks by key, the lead note first and marked, and the first few
 * rows its blocks draw, each by its handle (`tasks#4`) beside its title. A row with no number or no title is not handed,
 * since the model could only name it by something a person does not read.
 *
 * `titleOf` IS THE LIST'S TITLE FIELD, so the title is the one the record shows for the row, never a field picked here.
 *
 * `lists` ARE THE LISTS AS DECLARED (`groupListsOf`). Handed them, a part that could be drawn in groups says the fields
 * it may be grouped by in `group` (`groupChoices`), so the model names a field it was handed and never guesses one.
 */
export function lookInputOf(blocks: readonly unknown[], titleOf: (list: string) => string | null, lists?: GroupLists): { blocks: HeadlineBlock[]; rows: HeadlineRow[] } {
  const choices = lists === undefined ? {} : groupChoices(blocks, lists);
  const out: HeadlineBlock[] = [];
  const rows: HeadlineRow[] = [];
  const keys = new Set<string>();
  const handles = new Set<string>();
  let lead = false;
  for (const raw of blocks) {
    if (raw === null || typeof raw !== 'object') continue;
    const b = raw as ReadBlock;
    if (!shown(b)) continue;
    const key = blockKeyOf(b);
    /* TWO BLOCKS OF ONE KEY CANNOT BE TOLD APART BY AN ORDER, so the second is not handed. */
    if (keys.has(key)) continue;
    keys.add(key);
    const isLead = !lead && b.kind === 'note' && b.lead === true;
    if (isLead) lead = true;
    /* NO ADDRESS, LINK OR KEY GOES TO THE MODEL (`scrub.ts`): a heading a person wrote may hold one, and is said without it. */
    const heading = typeof b.heading === 'string' ? scrubbed(b.heading) : null;
    if (out.length < HEADLINE_BLOCKS_MOST || isLead)
      out.push({
        key,
        kind: typeof b.kind === 'string' ? b.kind : 'block',
        ...(heading === null ? {} : { heading }),
        ...(isLead ? { lead: true as const } : {}),
        ...(Object.hasOwn(choices, key) ? { group: choices[key]! } : {}),
      });
    if (!Array.isArray(b.rows)) continue;
    for (const r of b.rows) {
      if (rows.length >= HEADLINE_ROWS_MOST) break;
      const row = r as { register?: unknown; seq?: unknown; fields?: unknown };
      if (typeof row?.register !== 'string' || typeof row.seq !== 'number' || row.fields === null || typeof row.fields !== 'object') continue;
      const field = titleOf(row.register);
      const title = field === null ? undefined : (row.fields as Record<string, unknown>)[field];
      /* AND A TITLE IS SAID WITHOUT THEM: a person met with only an address is named by it, and a model reads "someone at
         orchardline.example" in its place. A title that is nothing but a key is not handed at all. */
      const said = typeof title === 'string' ? scrubbed(title) : null;
      if (said === null) continue;
      const handle = `${row.register}#${row.seq}`;
      if (handles.has(handle)) continue;
      handles.add(handle);
      rows.push({ row: handle, title: said.slice(0, 120) });
    }
  }
  /* THE LEAD NOTE FIRST, wherever the page drew it, since it is what an order may never move. */
  const at = out.findIndex((b) => b.lead === true);
  if (at > 0) out.unshift(...out.splice(at, 1));
  return { blocks: out, rows };
}

/**
 * The longest answer one page may give the headline ask, in tokens at four bytes a token: its entry in `lines` with every
 * part the instructions allow at its most. A line of `HEADLINE_RAW_MOST`, a lead, an order of every key it was handed and
 * a hide of all but one, a next naming its longest handle in `NEXT_MOST` characters, and a group for each part handed one,
 * by its longest field. A page handed no blocks (Home) answers the bare line.
 *
 * READ OFF WHAT THE PAGE WAS HANDED AND NOT A GUESS AT A TYPICAL ONE, because the ask's ceiling is a wall: the ask holds
 * no more pages than this fits into `HEADLINE_ANSWER_TOKENS` (`index.ts` `slashHeadlines`), and a typical answer that
 * fits says nothing about the night one does not.
 */
export function lookAnswerMost(page: HeadlinePage): number {
  const line = 'x'.repeat(HEADLINE_RAW_MOST);
  const keys = (page.blocks ?? []).map((b) => b.key);
  const longest = (all: readonly string[]): string => all.reduce((a, b) => (b.length > a.length ? b : a), '');
  const grouped = (page.blocks ?? []).filter((b) => (b.group?.length ?? 0) > 0).slice(0, LOOK_GROUPS_MOST);
  const handles = (page.rows ?? []).map((r) => r.row);
  const answer =
    keys.length === 0
      ? line
      : {
          headline: line,
          lead: longest(keys),
          order: keys,
          hide: keys.slice(1),
          ...(handles.length === 0 ? {} : { next: { row: longest(handles), text: 'x'.repeat(NEXT_MOST) } }),
          ...(grouped.length === 0 ? {} : { group: Object.fromEntries(grouped.map((b) => [b.key, longest(b.group ?? [])])) }),
        };
  return Math.ceil(new TextEncoder().encode(JSON.stringify({ [page.page]: answer })).length / 4);
}

/** What a page's answer arranged, each part only when it passed, and why each part that did not was dropped. */
export type LookAnswer = { headline?: string; lead?: string; order?: string[]; hide?: string[]; next?: LookNext; group?: Record<string, string>; faults: string[] };

/** The kinds a look neither leads with nor leaves out: the page's own words, the line a thing is typed into, its forms and its headings (the kernel's `STAYS`). */
const STAYS: ReadonlySet<string> = new Set(['note', 'capture', 'inputs', 'section']);

/** One part of a page as the checks on a lead and a hide read it. */
type Part = { key: string; kind: string; main: boolean; drawn: boolean; refused: boolean; leadNote: boolean; queue: boolean };

/**
 * The page's parts in the order it draws them: from `read`, its blocks as its read answered them, which say what could
 * not be drawn and what stands beside the main column; without it, from the blocks the ask was handed, every one of
 * which was drawn, refused nothing, and is taken to be in the main column. Two blocks of one key are the first of them.
 */
function partsOf(page: HeadlinePage, read?: readonly unknown[]): Part[] {
  if (read === undefined)
    return (page.blocks ?? []).map((b) => ({ key: b.key, kind: b.kind, main: true, drawn: true, refused: false, leadNote: b.lead === true, queue: b.kind === 'queue' }));
  const out: Part[] = [];
  const met = new Set<string>();
  let lead = false;
  for (const raw of read) {
    if (raw === null || typeof raw !== 'object') continue;
    const b = raw as ReadBlock;
    const key = blockKeyOf(b);
    if (met.has(key)) continue;
    met.add(key);
    const refused = Array.isArray(b.refusals) && b.refusals.length > 0;
    const leadNote = !lead && b.drawn !== false && !refused && b.kind === 'note' && b.lead === true;
    if (leadNote) lead = true;
    out.push({
      key,
      kind: typeof b.kind === 'string' ? b.kind : 'block',
      main: b.area !== 'rail',
      drawn: b.drawn !== false,
      refused,
      leadNote,
      queue: b.kind === 'queue' || b.source === 'governance.open',
    });
  }
  return out;
}

/**
 * Why an order the model answered is not kept, or `null` with the order to keep. Only keys the page was handed, each
 * once, and the lead note nowhere but first; an order that leaves the page as it stands is no order at all.
 */
export function orderFault(raw: unknown, page: HeadlinePage): { fault: string } | { order: string[] | null } {
  const handed = page.blocks ?? [];
  if (!Array.isArray(raw) || raw.some((k) => typeof k !== 'string')) return { fault: `The order for ${page.title} did not name the parts of the page.` };
  const keys = raw as string[];
  const known = new Set(handed.map((b) => b.key));
  const unknown = keys.find((k) => !known.has(k));
  if (unknown !== undefined) return { fault: `The order for ${page.title} named a part the page does not have.` };
  if (new Set(keys).size !== keys.length) return { fault: `The order for ${page.title} named one part twice.` };
  const lead = handed.find((b) => b.lead === true)?.key;
  if (lead !== undefined && keys.includes(lead) && keys[0] !== lead) return { fault: `The order for ${page.title} moved something ahead of its lead line.` };
  const order = lead === undefined ? keys : keys.filter((k) => k !== lead);
  /* THE SAME ORDER THE PAGE ALREADY HAS, among the keys it names, arranges nothing and is not written. */
  const now = handed.map((b) => b.key).filter((k) => order.includes(k));
  if (order.length < 2 || now.every((k, i) => k === order[i])) return { order: null };
  return { order };
}

/**
 * Why a next the model answered is not kept, or `null`. It names a row the page was handed by its handle, and says what
 * to do in one short plain phrase: no markup, no number it was not handed (the page's and the row's title's), and none
 * of the system's words outside the row's own title.
 */
export function nextFault(raw: unknown, page: HeadlinePage): string | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return `The next step for ${page.title} was not a thing to do.`;
  const { row, text } = raw as { row?: unknown; text?: unknown };
  const handed = (page.rows ?? []).find((r) => r.row === row);
  if (handed === undefined) return `The next step for ${page.title} named something the page does not show.`;
  if (typeof text !== 'string' || text.trim() === '') return `The next step for ${page.title} said nothing to do.`;
  const said = text.trim();
  if (said.length > NEXT_MOST) return `The next step for ${page.title} was longer than ${NEXT_MOST} characters.`;
  if (/[\n\r{}[\]*`<>#]/u.test(said)) return `The next step for ${page.title} was not one plain phrase.`;
  if (SYSTEM_WORDS.test(said.split(handed.title).join(' '))) return `The next step for ${page.title} used the system's words rather than the person's.`;
  const numbers = new Set([...numbersOf(page), ...numbersIn(handed.title)]);
  const made = numbersIn(said).find((n) => !numbers.has(n));
  if (made !== undefined) return `The next step for ${page.title} said ${made}, which nothing it was handed holds.`;
  return null;
}

/**
 * Why a lead the model answered is not kept, or the lead to keep. It names one part the page was handed: not a heading
 * or a line that keeps its place, and, where `read` says which column a part is in, not one beside the main column.
 * The lead line itself, and the part already first under the page's opening, lead as it stands, so naming either
 * chooses nothing and is not written.
 */
export function leadFault(raw: unknown, page: HeadlinePage, read?: readonly unknown[]): { fault: string } | { lead: string | null } {
  if (typeof raw !== 'string') return { fault: `The lead for ${page.title} did not name a part of the page.` };
  const handed = (page.blocks ?? []).find((b) => b.key === raw);
  if (handed === undefined) return { fault: `The lead for ${page.title} named a part the page does not have.` };
  if (handed.lead === true) return { lead: null };
  if (STAYS.has(handed.kind)) return { fault: `The lead for ${page.title} named a heading or a line that keeps its place.` };
  const parts = partsOf(page, read);
  if (parts.find((p) => p.key === raw)?.main === false) return { fault: `The lead for ${page.title} named a part beside the main column, which cannot lead.` };
  const first = parts.find((p) => p.main && p.drawn && !STAYS.has(p.kind));
  return { lead: first?.key === raw ? null : raw };
}

/**
 * Why what the model left out is not kept, or the keys to hide. Only parts the page was handed, each once, and never
 * one the person pinned, one that could not be drawn (he needs to see what broke), what leads (the lead line, or `lead`,
 * the part this answer leads with), the questions waiting on him, a heading or a line that keeps its place, nor so many
 * that the main column is left showing nothing. ONE BAD NAME AND NOTHING IS HIDDEN: a page half emptied is worse than
 * one left whole.
 *
 * `read` is the page's blocks as its read answered them, which say what was refused and what stands beside the main
 * column. Without it the blocks handed stand in, and a refused part reads as one the page lacks, since it was never handed.
 */
export function hideFault(
  raw: unknown,
  page: HeadlinePage,
  pinned: readonly string[],
  at: { lead?: string; read?: readonly unknown[] } = {},
): { fault: string } | { hide: string[] | null } {
  const said = (why: string): { fault: string } => ({ fault: `What to leave out of ${page.title} ${why}` });
  if (!Array.isArray(raw) || raw.some((k) => typeof k !== 'string')) return said('did not name the parts of the page.');
  const keys = raw as string[];
  if (new Set(keys).size !== keys.length) return said('named one part twice.');
  const handed = new Map((page.blocks ?? []).map((b) => [b.key, b]));
  const parts = partsOf(page, at.read);
  const pins = new Set(pinned);
  for (const key of keys) {
    const part = parts.find((p) => p.key === key);
    if (part?.refused) return said('named a part that could not be drawn, which stays where you can see what broke.');
    const block = handed.get(key);
    if (block === undefined) return said('named a part the page does not have.');
    if (block.lead === true || key === at.lead) return said('named what leads the page.');
    if (pins.has(key)) return said('named a part you pinned.');
    if (block.kind === 'queue' || part?.queue) return said('named the questions waiting on you.');
    if (block.kind === 'section') return said('named a heading, which goes only when everything under it does.');
    if (STAYS.has(block.kind)) return said('named a line that keeps its place.');
  }
  if (keys.length === 0) return { hide: null };
  /* A PAGE WITH NOTHING IN IT SAYS NOTHING: something the main column draws, other than its lead line and its headings,
     is left standing (the kernel's own rule for what its rules hide, `composeLook`). A part that could not be drawn does
     not count: a page showing only what broke shows nothing of his. */
  const left = parts.some((p) => p.main && p.drawn && !p.refused && p.kind !== 'section' && !p.leadNote && !keys.includes(p.key));
  if (!left) return said('left nothing on the page.');
  return { hide: keys };
}

/* ── grouping ────────────────────────────────────────────────────────────── */

/** The kinds a look may draw in groups: the kernel's own `GROUPED_BY_FIELD`, under the name this file has always said. */
export const GROUP_KINDS: ReadonlySet<string> = GROUPED_BY_FIELD;

/** The most parts one look groups, and how many values the things shown may hold of the field: the kernel's own. */
export const GROUPS_MOST = LOOK_GROUPS_MOST;
export const GROUP_VALUES_LEAST = VALUES_LEAST;
export const GROUP_VALUES_MOST = VALUES_MOST;

/** The field types that make groups: a choice and a link. A list's state is a choice. */
const GROUP_TYPES: ReadonlySet<string> = new Set(['enum', 'ref']);

/** What a list says of itself that a grouping is checked against: the field its state is kept in, and its live fields. */
export type GroupList = { state: string | null; fields: readonly { id: string; type: string }[] };

/** A list by its id, or `null` for one the record does not declare. */
export type GroupLists = (list: string) => GroupList | null;

/**
 * Every list's own declaration, read once and asked by id. A retired field is no field of its list, and a declaration
 * that cannot be read is a list nothing is grouped over.
 */
export function groupListsOf(kernel: Pick<Kernel, 'declarations'>): GroupLists {
  let all: Map<string, GroupList> | undefined;
  const read = (): Map<string, GroupList> => {
    const out = new Map<string, GroupList>();
    for (const d of kernel.declarations()) {
      if (d.kind !== 'register' || !d.id.startsWith('register.')) continue;
      let body: unknown = d.body;
      if (typeof body === 'string')
        try {
          body = JSON.parse(body);
        } catch {
          continue;
        }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) continue;
      const { state, fields } = body as { state?: unknown; fields?: unknown };
      if (!Array.isArray(fields)) continue;
      const live = fields.flatMap((f) => {
        const { id, type, retired } = (f ?? {}) as { id?: unknown; type?: unknown; retired?: unknown };
        return typeof id === 'string' && typeof type === 'string' && retired !== true ? [{ id, type }] : [];
      });
      out.set(d.id.slice('register.'.length), { state: typeof state === 'string' && live.some((f) => f.id === state) ? state : null, fields: live });
    }
    return out;
  };
  return (list) => (all ??= read()).get(list) ?? null;
}

/** How many values of `field` the things a part shows hold. One that holds none is not counted (the kernel's `valuesShown`). */
function valuesShown(b: ReadBlock, field: string): number {
  const met = new Set<string>();
  for (const r of Array.isArray(b.rows) ? b.rows : []) {
    const fields = (r as { fields?: unknown } | null)?.fields;
    if (fields === null || typeof fields !== 'object') continue;
    const v = Object.hasOwn(fields, field) ? (fields as Record<string, unknown>)[field] : undefined;
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    met.add(typeof v === 'string' ? v : JSON.stringify(v));
  }
  return met.size;
}

/** The list a part is over, by its id, or `null`. */
const listOfPart = (b: ReadBlock): string | null => (typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null);

/** The page's parts as read, by key, the first of two alike. */
function readByKey(read: readonly unknown[]): Map<string, ReadBlock> {
  const out = new Map<string, ReadBlock>();
  for (const raw of read) {
    if (raw === null || typeof raw !== 'object') continue;
    const key = blockKeyOf(raw);
    if (!out.has(key)) out.set(key, raw as ReadBlock);
  }
  return out;
}

/**
 * What each part of a page could be grouped by, by key: the fields of its list that `groupFault` would pass for the
 * things it shows now, its state first. For whoever hands the model the page, so it names a field and does not guess
 * one. A part that draws no groups, names its own, or has nothing to group by is left out.
 */
export function groupChoices(read: readonly unknown[], lists: GroupLists): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, b] of readByKey(read)) {
    const list = listOfPart(b);
    const shape = list === null ? null : lists(list);
    if (shape === null || typeof b.kind !== 'string' || !GROUP_KINDS.has(b.kind) || b.group !== undefined || !shown(b)) continue;
    const fields = shape.fields.filter((f) => GROUP_TYPES.has(f.type)).map((f) => f.id);
    const good = [...fields.filter((f) => f === shape.state), ...fields.filter((f) => f !== shape.state)].filter((f) => {
      const n = valuesShown(b, f);
      return n >= GROUP_VALUES_LEAST && n <= GROUP_VALUES_MOST;
    });
    if (good.length > 0) out[key] = good;
  }
  return out;
}

/**
 * Why a grouping the model answered is not kept, or the map to keep: a part of the page by its key, and the field of
 * its list it is drawn in groups by. Each part is one the page was handed, of a kind that draws groups, over a list,
 * and could be drawn; each field is one its list has, a choice, a link or the state, with two to eight values among the
 * things shown. One is a heading over everything, and past eight most headings stand over a single thing. ONE BAD NAME
 * AND NOTHING IS GROUPED, as with what is left out.
 *
 * A PART THAT NAMES ITS OWN GROUP IS PASSED OVER, not refused: the page's own declaration stands over any look
 * (`applyLook`), and the model is not told which parts those are.
 *
 * `read` is the page's blocks as its read answered them and `lists` the lists as they are declared (`groupListsOf`).
 * Without both nothing can be counted or told apart, so nothing is grouped.
 */
export function groupFault(raw: unknown, page: HeadlinePage, read?: readonly unknown[], lists?: GroupLists): { fault: string } | { group: Record<string, string> | null } {
  const said = (why: string): { fault: string } => ({ fault: `How to group ${page.title} ${why}` });
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return said('did not say which part is grouped by what.');
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.some(([, f]) => typeof f !== 'string' || f === '')) return said('did not say which part is grouped by what.');
  if (entries.length > GROUPS_MOST) return said(`named more than ${GROUPS_MOST} parts.`);
  if (entries.length === 0) return { group: null };
  if (read === undefined || lists === undefined) return said('could not be checked against what the page shows.');
  const handed = new Set((page.blocks ?? []).map((b) => b.key));
  const parts = readByKey(read);
  const group: Record<string, string> = {};
  for (const [key, field] of entries as [string, string][]) {
    const part = parts.get(key);
    if (part !== undefined && Array.isArray(part.refusals) && part.refusals.length > 0) return said('named a part that could not be drawn.');
    if (!handed.has(key) || part === undefined) return said('named a part the page does not have.');
    const list = listOfPart(part);
    const shape = list === null ? null : lists(list);
    if (typeof part.kind !== 'string' || !GROUP_KINDS.has(part.kind) || shape === null) return said('named a part that is not drawn in groups.');
    if (part.group !== undefined) continue;
    const spec = shape.fields.find((f) => f.id === field);
    if (spec === undefined) return said('named a field its list does not have.');
    if (!GROUP_TYPES.has(spec.type)) return said('named a field that is not a choice, a link or the state.');
    const n = valuesShown(part, field);
    if (n < GROUP_VALUES_LEAST) return said('would put everything shown under one heading.');
    if (n > GROUP_VALUES_MOST) return said(`would make more than ${GROUP_VALUES_MOST} groups.`);
    group[key] = field;
  }
  return { group: Object.keys(group).length === 0 ? null : group };
}

/**
 * One page's answer read as a look: the headline when `headlineFault` passes it, the order when `orderFault` does, and the
 * next when `nextFault` does, the lead when `leadFault` does, what is left out when `hideFault` does and how its lists
 * are grouped when `groupFault` does. A bare line is a
 * headline and nothing else, as it always was. The headline's own fault is not among `faults`, since the headline step
 * says it already.
 *
 * `at` IS WHAT THE CHECKS ON A HIDE AND A GROUPING ARE READ AGAINST: the keys the person pinned, the page's blocks as
 * its read answered them, and the lists as they are declared. Whoever writes the answer as a look asks `undoneFor` first: a look he put back is not written again.
 */
export function lookAnswerOf(answer: unknown, page: HeadlinePage, at: { pinned?: readonly string[]; read?: readonly unknown[]; lists?: GroupLists; today?: string } = {}): LookAnswer {
  const faults: string[] = [];
  const line = typeof answer === 'string' ? answer : answer !== null && typeof answer === 'object' && !Array.isArray(answer) ? (answer as { headline?: unknown }).headline : undefined;
  const out: LookAnswer = { faults };
  if (headlineFault(line, page, at.today) === null) out.headline = (line as string).trim();
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return out;
  const { lead, order, hide, next, group } = answer as { lead?: unknown; order?: unknown; hide?: unknown; next?: unknown; group?: unknown };
  if (lead !== undefined && lead !== null) {
    const got = leadFault(lead, page, at.read);
    if ('fault' in got) faults.push(`${got.fault} The page keeps its lead.`);
    else if (got.lead !== null) out.lead = got.lead;
  }
  if (order !== undefined) {
    const got = orderFault(order, page);
    if ('fault' in got) faults.push(`${got.fault} The page keeps its order.`);
    else if (got.order !== null) out.order = got.order;
  }
  if (hide !== undefined && hide !== null) {
    const got = hideFault(hide, page, at.pinned ?? [], { ...(out.lead === undefined ? {} : { lead: out.lead }), ...(at.read === undefined ? {} : { read: at.read }) });
    if ('fault' in got) faults.push(`${got.fault} Nothing is left out.`);
    else if (got.hide !== null) out.hide = got.hide;
  }
  if (next !== undefined && next !== null) {
    const fault = nextFault(next, page);
    if (fault) faults.push(`${fault} No next step is shown.`);
    else out.next = { row: (next as LookNext).row, text: (next as LookNext).text.trim() };
  }
  if (group !== undefined && group !== null) {
    const got = groupFault(group, page, at.read, at.lists);
    if ('fault' in got) faults.push(`${got.fault} The page keeps its lists as they are.`);
    else if (got.group !== null) out.group = got.group;
  }
  return out;
}

/**
 * The questions the engine leaves where they are on a page, by key (the kernel's `queuesKept`): every queue, unless the
 * page is Today, Decide or made of nothing but questions. `read` is the page's blocks as its read answered them. Without
 * it the blocks the ask was handed stand in, which say each block's kind and no more.
 *
 * A BLOCK THE READ HID STILL COUNTS AS PART OF THE PAGE. The read comes back under the look it was drawn with, and the
 * rules' look hides a list that drew nothing, where Slash's look hides nothing and is laid over the page before any
 * look: so an empty Bills table hidden tonight is drawn again under the look written from it, and the page is about
 * bills, not questions. Read as hidden, the questions were stored moved on a page the kernel then would not move them on.
 */
export function questionsKept(page: HeadlinePage, read?: readonly unknown[]): Set<string> {
  const blocks = read ?? (page.blocks ?? []).map((b) => ({ key: b.key, kind: b.kind, rows: [], matched: 0, refusals: [] }));
  const whole = blocks.filter((b) => b !== null && typeof b === 'object').map((b) => {
    const { drawn: _hidden, ...block } = b as BlockResult;
    return block as BlockResult;
  });
  return queuesKept(page.page, whole);
}

/**
 * A look as Slash may store it over a page whose questions keep their place: no lead that is one of them, and an order
 * that names none of them. What is left of the order is kept only while it still moves something, read against `now`,
 * the page's keys in the order it draws them. The same look comes back when nothing in it touched the questions.
 */
export function lookKept(body: LookBody, kept: ReadonlySet<string>, now: readonly string[]): LookBody {
  const leads = body.lead !== undefined && kept.has(body.lead);
  if (!leads && !(body.order ?? []).some((k) => kept.has(k))) return body;
  const { lead, order, ...rest } = body;
  const left = (order ?? []).filter((k) => !kept.has(k));
  const stands = now.filter((k) => left.includes(k));
  const moves = left.length > 1 && !(stands.length === left.length && stands.every((k, i) => k === left[i]));
  return { ...rest, ...(lead !== undefined && !leads ? { lead } : {}), ...(moves ? { order: left } : {}) };
}

/** A stored look's body over `page`, or `null` for one these rules cannot read. */
export function lookBodyOf(raw: unknown, page: string): LookBody | null {
  let body = raw;
  if (typeof raw === 'string')
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.basis !== 'string') return null;
  const by: LookBy = b.by === 'slash' || b.by === 'rule' || b.by === 'owner' ? b.by : 'owner';
  const keys = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((k) => typeof k === 'string') ? (v as string[]) : undefined);
  const next = b.next as { row?: unknown; text?: unknown } | undefined;
  const out: LookBody = { look: typeof b.look === 'string' ? b.look : page, basis: b.basis, by };
  if (typeof b.lead === 'string') out.lead = b.lead;
  const order = keys(b.order);
  if (order) out.order = order;
  const hide = keys(b.hide);
  if (hide) out.hide = hide;
  if (typeof b.headline === 'string') out.headline = b.headline;
  if (next && typeof next.row === 'string' && typeof next.text === 'string') out.next = { row: next.row, text: next.text };
  const pinned = keys(b.pinned);
  if (pinned) out.pinned = pinned;
  /* A MAP OF TEXT TO TEXT, its keys sorted so two looks that group alike read alike (`sameLook`). */
  const group = b.group !== null && typeof b.group === 'object' && !Array.isArray(b.group) ? Object.entries(b.group as Record<string, unknown>) : [];
  if (group.length > 0 && group.every(([, f]) => typeof f === 'string'))
    out.group = Object.fromEntries((group as [string, string][]).sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0)));
  /* HIS WIDTHS AND COLUMNS, WHOLE, and only on his own look: Slash and the rules arrange a page, and never say how wide
     a part is or where it sits. Sorted as the grouping is, so two looks that place alike read alike. */
  if (by === 'owner') {
    const span = placed(b.span, (w): w is number => typeof w === 'number' && SPANS.has(w));
    if (span) out.span = span;
    const area = placed(b.area, (a): a is 'main' | 'rail' => a === 'main' || a === 'rail');
    if (area) out.area = area;
  }
  return out;
}

/** A map of part keys to a width or a column, sorted by key, keeping the entries that are one; `undefined` for none. */
function placed<T>(raw: unknown, fits: (v: unknown) => v is T): Record<string, T> | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const kept = Object.entries(raw as Record<string, unknown>).filter((e): e is [string, T] => BLOCK_KEY.test(e[0]) && fits(e[1]));
  return kept.length === 0 ? undefined : Object.fromEntries(kept.sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0)));
}

/** The live look over a page, or `null` when none is stored. */
export function liveLook(kernel: Pick<Kernel, 'declarations'>, page: string): LiveLook | null {
  const id = lookId(page);
  const row = kernel.declarations().find((d) => d.id === id);
  if (!row) return null;
  const body = lookBodyOf(row.body, page);
  /* A LOOK THESE RULES CANNOT READ IS NOBODY'S TO OVERWRITE, so it reads as the owner's. */
  return { version: row.version, pack: row.pack_id, body: body ?? { look: page, basis: '', by: 'owner' } };
}

/**
 * Whether Slash may write over a look: none stored, or one Slash or the kernel's rules wrote and no pack shipped. A look
 * the person set, one a pack brought, and one these rules cannot read are never Slash's.
 */
export const slashMay = (live: LiveLook | null): boolean => live === null || (live.pack === null && (live.body.by === 'slash' || live.body.by === 'rule'));

/** What Undo restores, as `lookUndoKey` keeps it, or `null`. */
type Undo = { version: number; was: LookBody | null };

const undoOf = (raw: unknown, page: string): Undo | null => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { version, was } = raw as { version?: unknown; was?: unknown };
  if (typeof version !== 'number' || !Number.isInteger(version)) return null;
  return { version, was: was === null || was === undefined ? null : lookBodyOf(was, page) };
};

/**
 * Whether the look written from `basis` over this page is one the person put back: Undo said no to it, so whoever reads
 * an answer for the page (`lookAnswerOf`) writes no look from that basis again. Once the basis moves the page is
 * Slash's to arrange again, and the next look written forgets the no (`writeLook`).
 */
export function undoneFor(kernel: Pick<Kernel, 'prefsOf'>, page: string, basis: string): boolean {
  const raw = kernel.prefsOf(SLASH)[lookUndoneKey(page)];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return (raw as { basis?: unknown }).basis === basis;
}

/** Two looks that say the same, whatever order their keys came in, so writing the second would be a version that changes nothing. */
const sameLook = (a: LookBody, b: LookBody): boolean => JSON.stringify(lookBodyOf(a, a.look)) === JSON.stringify(lookBodyOf(b, b.look));

/** A refusal said as the record says one. */
const no = (code: Refusal['code'], fix: string): Result<never> => ({ ok: false, refusal: { code, fix } });

/**
 * Slash's look over one page, installed as a new version over the live one it read, with what it replaced kept for Undo.
 * Nothing is written over a look that is not Slash's (`slashMay`), and a look that says what the live one says is not
 * written again. `title` is the page's, for the sentence.
 */
export async function writeLook(kernel: Kept, page: string, title: string, given: LookBody): Promise<Result<{ written: boolean }>> {
  /* THE PAGE IT IS LAID OVER IS THE ONE IT IS WRITTEN TO, since the kernel reads the declaration's id from it. A width
     and a column are the person's alone, so Slash's look carries neither. */
  const { span: _span, area: _area, ...said } = given;
  const body: LookBody = { ...said, look: page };
  const live = liveLook(kernel, page);
  if (!slashMay(live))
    return no('FORBIDDEN', live?.pack === null ? `${title} is arranged the way you set it, so Slash left it as it is.` : `${title} keeps the arrangement it came with, so Slash left it as it is.`);
  if (live !== null && sameLook(live.body, body)) return ok({ written: false });
  const id = lookId(page);
  const put = await kernel.install([{ id, kind: LOOK_KIND as never, body: body as never }], live === null ? undefined : { id, version: live.version }, { actor: SLASH });
  if (!put.ok) return put as Result<never>;
  const version = put.value.find((d) => d.id === id)?.version;
  if (version !== undefined) kernel.setPref(SLASH, lookUndoKey(page), { version, was: (live?.body ?? null) as unknown as Json });
  /* A NEW LOOK IS A NEW OFFER, so the one he put back before it is no longer what stands between Slash and the page. */
  if (kernel.prefsOf(SLASH)[lookUndoneKey(page)] !== undefined) kernel.setPref(SLASH, lookUndoneKey(page), null);
  return ok({ written: true });
}

/** Who wrote the look a Put back took off, and when it was written. */
export type LookWas = { by: LookBy; at: string };

/**
 * What a Put back answers: whether the look before came back or the page went back to the rules, and who wrote the look
 * it took off and when. Slash's own Undo answers as it always did, without `was`.
 */
export type PutBack = { restored: 'previous' | 'rules'; was?: LookWas };

/** Where Put back last stepped to, as `lookBackKey` keeps it, or `null`. */
const backOf = (raw: unknown): { version: number; to: number } | null => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { version, to } = raw as { version?: unknown; to?: unknown };
  return Number.isInteger(version) && Number.isInteger(to) ? { version: version as number, to: to as number } : null;
};

/** A stored body as JSON, or `null` when it does not read. */
const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * PUT BACK, ONE STEP, WHOEVER WROTE THE LOOK (a composition is a proposal the person can pin, change or
 * undo). The live look's version before it is installed again, held to the live version, or the page is given back to
 * the kernel's rules when it had none. `actor` is who pressed it, for the history.
 *
 * SLASH'S OWN UNDO IS FIRST AND STAYS AS IT WAS: while the live look is still the version Slash wrote, the body Slash
 * kept (`lookUndoKey`) comes back, and what the look was written from is kept (`lookUndoneKey`), so the same look is not
 * written again the next time the page is asked about. A Slash look taken off by the longer way is kept the same.
 *
 * ANY OTHER LOOK, A PIN, AN ARRANGEMENT, ANY DAY AFTER, is read from the versions the kernel keeps, as `pageVersions`
 * reads a page's: `sql` is the record's, and without it only Slash's Undo is there. The newest older version that says
 * something else comes back; a retired version below means the page had no look before, so it goes back to the rules.
 * Pressed again it walks on from the version it wrote back (`lookBackKey`), not onto the one it took off.
 *
 * A LOOK NOBODY WROTE IS NOT PUT BACK: none stored, or one an add-on shipped, is refused in words.
 */
export async function undoLook(kernel: Kept, page: string, title: string, actor: string, sql?: Pick<Sql, 'all'>): Promise<Result<PutBack>> {
  const key = lookUndoKey(page);
  const kept = undoOf(kernel.prefsOf(SLASH)[key], page);
  const live = liveLook(kernel, page);
  const id = lookId(page);
  if (kept !== null && live !== null && live.version === kept.version && live.body.by === 'slash') {
    const done = kept.was === null ? kernel.retire([id], { actor }) : await kernel.install([{ id, kind: LOOK_KIND as never, body: kept.was as never }], { id, version: live.version }, { actor });
    if (!done.ok) return done as Result<never>;
    kernel.setPref(SLASH, key, null);
    if (live.body.basis !== '') kernel.setPref(SLASH, lookUndoneKey(page), { basis: live.body.basis });
    return ok({ restored: kept.was === null ? 'rules' : 'previous' });
  }
  if (kept !== null) kernel.setPref(SLASH, key, null);
  if (sql === undefined)
    return kept === null
      ? no('DECLARATION_UNKNOWN', `Slash has not arranged ${title}, so there is nothing to put back.`)
      : no('VERSION_STALE', `${title} was arranged again since Slash arranged it, so that is the one that stays.`);
  if (live === null) return no('DECLARATION_UNKNOWN', `Nobody has arranged ${title}, so there is nothing to put back.`);
  if (live.pack !== null) return no('DECLARATION_UNKNOWN', `${title} keeps the arrangement it came with, so there is nothing to put back.`);
  const rows = sql.all<{ version: number; body: string; retired: number; created_at: string }>(
    'SELECT version, body, retired, created_at FROM declaration WHERE id = ? AND kind = ? ORDER BY version DESC',
    id,
    LOOK_KIND,
  );
  const back = backOf(kernel.prefsOf(SLASH)[lookBackKey(page)]);
  const from = back !== null && back.version === live.version ? back.to : live.version;
  let before: { body: LookBody; version: number } | null = null;
  for (const row of rows) {
    if (row.version >= from) continue;
    if (row.retired === 1) break;
    const body = lookBodyOf(parsed(row.body), page);
    if (body === null || sameLook(body, live.body)) continue;
    before = { body, version: row.version };
    break;
  }
  const was: LookWas = { by: live.body.by, at: rows.find((r) => r.version === live.version)?.created_at ?? '' };
  if (before === null) {
    const done = kernel.retire([id], { actor });
    if (!done.ok) return done as Result<never>;
    kernel.setPref(SLASH, lookBackKey(page), null);
  } else {
    const put = await kernel.install([{ id, kind: LOOK_KIND as never, body: before.body as never }], { id, version: live.version }, { actor });
    if (!put.ok) return put as Result<never>;
    const version = put.value.find((d) => d.id === id)?.version;
    kernel.setPref(SLASH, lookBackKey(page), version === undefined ? null : { version, to: before.version });
  }
  /* SLASH'S LOOK TAKEN OFF IS A NO TO WHAT IT WAS WRITTEN FROM, as its Undo is. */
  if (live.body.by === 'slash' && live.body.basis !== '') kernel.setPref(SLASH, lookUndoneKey(page), { basis: live.body.basis });
  return ok({ restored: before === null ? 'rules' : 'previous', was });
}

/**
 * Keep Slash's look over a page: the person who let its Undo pass is written beside the version they saw, so the page's
 * history says who kept it after a reload. The look itself is not written again. `person` is who kept it, by their id;
 * the name a reader is shown is resolved when the page is read (`keptBy`). Only a look Slash wrote and no pack shipped
 * can be kept: anything else was never offered Undo.
 */
export function keepLook(kernel: Pick<Kernel, 'declarations' | 'setPref'>, page: string, title: string, person: string): Result<{ kept: boolean }> {
  const live = liveLook(kernel, page);
  if (live === null || live.pack !== null || live.body.by !== 'slash') return no('DECLARATION_UNKNOWN', `Slash has not arranged ${title}, so there is nothing to keep.`);
  kernel.setPref(SLASH, lookKeptKey(page), { version: live.version, by: person });
  return ok({ kept: true });
}

/**
 * Who kept the live look over a page, by their id, or `null`: only while the look is still the Slash version they kept,
 * so an arrangement Slash wrote since is offered Undo again.
 */
export function keptBy(kernel: Pick<Kernel, 'declarations' | 'prefsOf'>, page: string): string | null {
  const live = liveLook(kernel, page);
  if (live === null || live.pack !== null || live.body.by !== 'slash') return null;
  const raw = kernel.prefsOf(SLASH)[lookKeptKey(page)];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { version, by } = raw as { version?: unknown; by?: unknown };
  return version === live.version && typeof by === 'string' && by !== '' ? by : null;
}

/**
 * THE LOOK STEP, after the headline step has read the model's answer: each page that was handed its blocks and answered
 * more than a line gets Slash's look, with the lead, the order, what is left out, the next and the grouping that passed, written from
 * the basis it was asked at. A page whose answer was a bare line arranges nothing, a page set by its owner is left alone
 * with a line in the log, and so is a page whose look from this same basis the person put back (`undoneFor`).
 *
 * WHAT THE PERSON PINNED IS READ FROM THE LIVE LOOK, never left out by the answer, and carried into the look written.
 *
 * `read` IS THE PAGE'S BLOCKS AS ITS READ ANSWERED THEM, which say where the questions are and whether the page is
 * anything else (`questionsKept`).
 *
 * `next` NAMES ONE OF THE PERSON'S THINGS, so it goes out only through `lookHeld`, for the reader the row is drawn for.
 *
 * `rehearsed` IS ASKED OF EACH LOOK ABOUT TO BE WRITTEN and answers a sentence when it may not be: the record hands the
 * rehearsal (`compose-rehearse.ts`), which reads the page, and this file reads none.
 */
export async function composeLooks(
  kernel: Kept,
  due: readonly { page: HeadlinePage; basis: string; facts?: string; read?: readonly unknown[] }[],
  lines: Readonly<Record<string, unknown>>,
  rehearsed?: (page: string, title: string, body: LookBody) => string | null,
  /** The record's day, so a line's days are said against the record's year (`dayWords`). */
  today?: string,
): Promise<{ said: string[]; dropped: string[] }> {
  const said: string[] = [];
  const dropped: string[] = [];
  const lists = groupListsOf(kernel);
  for (const d of due) {
    if (d.page.page === HOME_PAGE || d.page.blocks === undefined) continue;
    const answer = Object.hasOwn(lines, d.page.page) ? lines[d.page.page] : undefined;
    if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) continue;
    const pinned = liveLook(kernel, d.page.page)?.body.pinned ?? [];
    const got = lookAnswerOf(answer, d.page, { pinned, lists, ...(d.read === undefined ? {} : { read: d.read }), ...(today === undefined ? {} : { today }) });
    dropped.push(...got.faults);
    /* THE QUESTIONS KEEP THEIR PLACE on a page that is about something else, as the kernel lays any look of Slash's. */
    const held = lookKept(
      { look: d.page.page, basis: '', by: 'slash', ...(got.lead === undefined ? {} : { lead: got.lead }), ...(got.order === undefined ? {} : { order: got.order }) },
      questionsKept(d.page, d.read),
      d.page.blocks.map((b) => b.key),
    );
    if (got.lead !== undefined && held.lead === undefined) {
      dropped.push(`The lead for ${d.page.title} was the questions waiting on you, which keep their place on that page. The page keeps its lead.`);
      delete got.lead;
    }
    if (got.order !== undefined && held.order !== got.order) {
      dropped.push(`The order for ${d.page.title} moved the questions waiting on you, which keep their place on that page. ${held.order === undefined ? 'The page keeps its order.' : 'The rest of the order is kept.'}`);
      if (held.order === undefined) delete got.order;
      else got.order = held.order;
    }
    if (got.lead === undefined && got.order === undefined && got.hide === undefined && got.next === undefined && got.group === undefined) continue;
    const basis = lookBasis(d.basis, d.facts);
    /* HE PUT THIS ONE BACK. The same page read from the same figures and the same named things is answered much the same,
       and a look he undid that came back the next night would be Slash not listening. */
    if (undoneFor(kernel, d.page.page, basis)) {
      dropped.push(`You put ${d.page.title} back the way it was, so Slash leaves it as it is until something on it changes.`);
      continue;
    }
    /* NO `headline` IN SLASH'S LOOK: its line goes out through `headline.<page>` and `headlineFor`, which sends one naming
       things only to somebody who reads all of every list the page does. A declaration is laid over every reader's page. */
    const body: LookBody = {
      look: d.page.page,
      basis,
      by: 'slash',
      ...(got.lead === undefined ? {} : { lead: got.lead }),
      ...(got.order === undefined ? {} : { order: got.order }),
      ...(got.hide === undefined ? {} : { hide: got.hide }),
      ...(got.next === undefined ? {} : { next: got.next }),
      ...(pinned.length === 0 ? {} : { pinned: [...pinned] }),
      ...(got.group === undefined ? {} : { group: got.group }),
    };
    /* REHEARSED FIRST, when the caller can (`compose-rehearse.ts`): a look that would print a fault is not written, and
       the caller's sentence says why in the log. */
    const refused = rehearsed?.(d.page.page, d.page.title, body) ?? null;
    if (refused !== null) {
      dropped.push(refused);
      continue;
    }
    let put: Result<{ written: boolean }>;
    try {
      put = await writeLook(kernel, d.page.page, d.page.title, body);
    } catch {
      put = no('INTERNAL', `${d.page.title}'s look could not be written.`);
    }
    if (!put.ok) dropped.push('refusal' in put ? put.refusal.fix : `${d.page.title} changed while Slash arranged it, so it was left as it is.`);
    else if (put.value.written) said.push(d.page.page);
  }
  return { said, dropped };
}

/**
 * What a page read sends of the looks: whether the owner's look fixes the headline (then Slash's line is not sent), and
 * Slash's next step while what it was written from still holds and the row it names is still drawn on the page.
 *
 * `basis` IS THE PAGE'S `headlineBasis` NOW, and `facts` its `factsBasis` now, asked only when the look was written from
 * named things, since reading what is pressing costs three block reads.
 */
export function lookHeld(
  kernel: Pick<Kernel, 'declarations'>,
  page: string,
  basis: string,
  facts: () => string | undefined,
  blocks: readonly unknown[],
): { ownerHeadline: boolean; next: LookNext | null } {
  const live = liveLook(kernel, page);
  if (live === null) return { ownerHeadline: false, next: null };
  if (!slashMay(live)) return { ownerHeadline: live.body.headline !== undefined, next: null };
  const next = live.body.next;
  if (next === undefined || live.body.by !== 'slash') return { ownerHeadline: false, next: null };
  const held = live.body.basis === basis || (live.body.basis.startsWith(`${basis}:`) && live.body.basis === lookBasis(basis, facts()));
  if (!held) return { ownerHeadline: false, next: null };
  const drawn = blocks.some((raw) => {
    const b = (raw ?? {}) as ReadBlock;
    return shown(b) && Array.isArray(b.rows) && b.rows.some((r) => `${(r as { register?: unknown }).register}#${(r as { seq?: unknown }).seq}` === next.row);
  });
  return { ownerHeadline: false, next: drawn ? next : null };
}
