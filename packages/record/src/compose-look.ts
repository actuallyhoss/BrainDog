/**
 * The model's half of a page's look: what leads after the lead note, the headline, and the one thing to do next.
 *
 * THE SHELL IS FIXED AND WHAT FILLS IT IS COMPOSED (DIRECTION §38). The kernel lays a `look.<page>` declaration over a
 * page at read time (`loop/contract-17.md`, "Look overlay"), and its rules answer one when none is stored. This file is
 * what the model adds to that, and it rides inside the night's headline ask (`headlines.ts`), so it costs Free no ask
 * beyond the line it already had: each page is handed its blocks by `key` and a few of the rows it draws by handle and
 * title, and may answer `{ headline, order, next }` in place of the bare line.
 *
 * NOTHING THE MODEL SAYS IS TRUSTED AS IT CAME. The headline passes `headlineFault` or the rules' line stands. An order
 * names only keys the page was handed, each once, and never moves anything ahead of the lead note. A next names a row the
 * page was handed and says it in one short plain phrase, with no number it was not handed and none of the system's
 * words. A part that fails is dropped on its own, with the record's sentence for why, and the rest is kept.
 *
 * VERSIONED, SO UNDO PUTS BACK THE ONE BEFORE. Every look Slash writes is a declaration (`by: 'slash'`) installed over
 * the live version it read, and Slash's pref `look.undo.<page>` keeps that version and the body it replaced. `undoLook`
 * reinstalls the body (or retires the look when there was none) only while the live look is still the one Slash wrote.
 *
 * AN OWNER'S LOOK IS NEVER TOUCHED. A look the person set ("Change this…", Pin) or a pack shipped is not Slash's to write
 * over, whatever the model answered, and while one fixes the headline, Slash's line is not sent on that page.
 *
 * CACHED ON WHAT IT WAS WRITTEN FROM. A look carries `basis`, the page's `headlineBasis` and its `factsBasis` together
 * (`lookBasis`), so its headline and next are sent only while the figures and the named things still hold
 * (`lookHeld`), and a page whose basis did not move is not asked about again (`slashHeadlines`'s `owed`).
 */

import type { Json, Kernel } from '@braindog/kernel';
import { SLASH } from '@braindog/kernel';
import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import {
  HEADLINE_BLOCKS_MOST,
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

/** The declaration kind a look is, beside `page`. */
export const LOOK_KIND = 'look';

/** A page's look by its declaration id: `look.money`. */
export const lookId = (page: string): string => `look.${page}`;

/** Slash's pref keeping what Undo restores: the version Slash wrote and the body it replaced. Not `headline.`, so no page's line is it. */
export const lookUndoKey = (page: string): string => `look.undo.${page}`;

/** Slash's pref keeping who kept its look over a page and which version they kept, for the history line "Slash arranged · Sam kept". */
export const lookKeptKey = (page: string): string => `look.kept.${page}`;

/** The next thing to do is a phrase under the headline, shorter than the line itself. */
export const NEXT_MOST = 80;

/** Who set a look: the kernel's rules, Slash, or the person. */
export type LookBy = 'rule' | 'slash' | 'owner';

/** One thing to do next: the handle of a row the page draws, and the phrase a person reads. */
export type LookNext = { row: string; text: string };

/**
 * A look as `look.<page>` declares it (`loop/contract-17.md`, the kernel's `compose.ts`). `look` is the page it is laid
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
};

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
  drawn?: unknown;
  refusals?: unknown;
  rows?: unknown;
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
 */
export function lookInputOf(blocks: readonly unknown[], titleOf: (list: string) => string | null): { blocks: HeadlineBlock[]; rows: HeadlineRow[] } {
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
    if (out.length < HEADLINE_BLOCKS_MOST || isLead)
      out.push({
        key,
        kind: typeof b.kind === 'string' ? b.kind : 'block',
        ...(typeof b.heading === 'string' && b.heading.trim() !== '' ? { heading: b.heading.trim() } : {}),
        ...(isLead ? { lead: true as const } : {}),
      });
    if (!Array.isArray(b.rows)) continue;
    for (const r of b.rows) {
      if (rows.length >= HEADLINE_ROWS_MOST) break;
      const row = r as { register?: unknown; seq?: unknown; fields?: unknown };
      if (typeof row?.register !== 'string' || typeof row.seq !== 'number' || row.fields === null || typeof row.fields !== 'object') continue;
      const field = titleOf(row.register);
      const title = field === null ? undefined : (row.fields as Record<string, unknown>)[field];
      if (typeof title !== 'string' || title.trim() === '') continue;
      const handle = `${row.register}#${row.seq}`;
      if (handles.has(handle)) continue;
      handles.add(handle);
      rows.push({ row: handle, title: title.trim().slice(0, 120) });
    }
  }
  /* THE LEAD NOTE FIRST, wherever the page drew it, since it is what an order may never move. */
  const at = out.findIndex((b) => b.lead === true);
  if (at > 0) out.unshift(...out.splice(at, 1));
  return { blocks: out, rows };
}

/** What a page's answer arranged, each part only when it passed, and why each part that did not was dropped. */
export type LookAnswer = { headline?: string; order?: string[]; next?: LookNext; faults: string[] };

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
 * One page's answer read as a look: the headline when `headlineFault` passes it, the order when `orderFault` does, and the
 * next when `nextFault` does. A bare line is a headline and nothing else, as it always was. The headline's own fault is
 * not among `faults`, since the headline step says it already.
 */
export function lookAnswerOf(answer: unknown, page: HeadlinePage): LookAnswer {
  const faults: string[] = [];
  const line = typeof answer === 'string' ? answer : answer !== null && typeof answer === 'object' && !Array.isArray(answer) ? (answer as { headline?: unknown }).headline : undefined;
  const out: LookAnswer = { faults };
  if (headlineFault(line, page) === null) out.headline = (line as string).trim();
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return out;
  const { order, next } = answer as { order?: unknown; next?: unknown };
  if (order !== undefined) {
    const got = orderFault(order, page);
    if ('fault' in got) faults.push(`${got.fault} The page keeps its order.`);
    else if (got.order !== null) out.order = got.order;
  }
  if (next !== undefined && next !== null) {
    const fault = nextFault(next, page);
    if (fault) faults.push(`${fault} No next step is shown.`);
    else out.next = { row: (next as LookNext).row, text: (next as LookNext).text.trim() };
  }
  return out;
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
  return out;
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
  /* THE PAGE IT IS LAID OVER IS THE ONE IT IS WRITTEN TO, since the kernel reads the declaration's id from it. */
  const body: LookBody = { ...given, look: page };
  const live = liveLook(kernel, page);
  if (!slashMay(live))
    return no('FORBIDDEN', live?.pack === null ? `${title} is arranged the way you set it, so Slash left it as it is.` : `${title} keeps the arrangement it came with, so Slash left it as it is.`);
  if (live !== null && sameLook(live.body, body)) return ok({ written: false });
  const id = lookId(page);
  const put = await kernel.install([{ id, kind: LOOK_KIND as never, body: body as never }], live === null ? undefined : { id, version: live.version }, { actor: SLASH });
  if (!put.ok) return put as Result<never>;
  const version = put.value.find((d) => d.id === id)?.version;
  if (version !== undefined) kernel.setPref(SLASH, lookUndoKey(page), { version, was: (live?.body ?? null) as unknown as Json });
  return ok({ written: true });
}

/**
 * Undo Slash's look over a page: the look it replaced installed again, or the page given back to the kernel's rules when
 * there was none. Only while the live look is still the version Slash wrote: a look the person or Slash changed since
 * is not put back over, and says so. `actor` is who pressed Undo, for the history.
 */
export async function undoLook(kernel: Kept, page: string, title: string, actor: string): Promise<Result<{ restored: 'previous' | 'rules' }>> {
  const key = lookUndoKey(page);
  const kept = undoOf(kernel.prefsOf(SLASH)[key], page);
  if (kept === null) return no('DECLARATION_UNKNOWN', `Slash has not arranged ${title}, so there is nothing to put back.`);
  const live = liveLook(kernel, page);
  if (live === null || live.version !== kept.version || live.body.by !== 'slash') {
    kernel.setPref(SLASH, key, null);
    return no('VERSION_STALE', `${title} was arranged again since Slash arranged it, so that is the one that stays.`);
  }
  const id = lookId(page);
  const done = kept.was === null ? kernel.retire([id], { actor }) : await kernel.install([{ id, kind: LOOK_KIND as never, body: kept.was as never }], { id, version: live.version }, { actor });
  if (!done.ok) return done as Result<never>;
  kernel.setPref(SLASH, key, null);
  return ok({ restored: kept.was === null ? 'rules' : 'previous' });
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
 * more than a line gets Slash's look, with the order and next that passed, written from the basis it was asked at. A
 * page whose answer was a bare line arranges nothing, and a page set by its owner is left alone with a line in the log.
 *
 * `next` NAMES ONE OF THE PERSON'S THINGS, so it goes out only through `lookHeld`, for the reader the row is drawn for.
 */
export async function composeLooks(
  kernel: Kept,
  due: readonly { page: HeadlinePage; basis: string; facts?: string }[],
  lines: Readonly<Record<string, unknown>>,
): Promise<{ said: string[]; dropped: string[] }> {
  const said: string[] = [];
  const dropped: string[] = [];
  for (const d of due) {
    if (d.page.page === HOME_PAGE || d.page.blocks === undefined) continue;
    const answer = Object.hasOwn(lines, d.page.page) ? lines[d.page.page] : undefined;
    if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) continue;
    const got = lookAnswerOf(answer, d.page);
    dropped.push(...got.faults);
    if (got.order === undefined && got.next === undefined) continue;
    /* NO `headline` IN SLASH'S LOOK: its line goes out through `headline.<page>` and `headlineFor`, which sends one naming
       things only to somebody who reads all of every list the page does. A declaration is laid over every reader's page. */
    const body: LookBody = {
      look: d.page.page,
      basis: lookBasis(d.basis, d.facts),
      by: 'slash',
      ...(got.order === undefined ? {} : { order: got.order }),
      ...(got.next === undefined ? {} : { next: got.next }),
    };
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
