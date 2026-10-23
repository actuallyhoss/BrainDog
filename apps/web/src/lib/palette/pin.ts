/**
 * Pin an answer: what Slash answered in the palette, kept on a page the person picks, so it is still there after the
 * palette closes (PGS-B12, "answers you can pin").
 *
 * A LIST'S ANSWER PINS AS A TABLE, AND PROSE AS A NOTE. An answer drawn from one list by a filter is that list and that filter, so it
 * pins as a table the page reads again every time it opens: the rows are the record's on the day it is read, not a copy
 * of the day it was asked. An answer in prose has nothing behind it to read again, so it pins as a note that carries
 * its text, the day it was pinned and `{inferred}`, the record's mark for something worked out rather than checked.
 *
 * THE "PUT THIS ON A PAGE" ROAD FOR THE BLOCK, ITS OWN WRITE FOR THE PAGE. The block is `boundBlock`'s. The write is
 * `saveArrangement`'s one arrangement, made here because Today is not a page `bindTo` can reach: the record's Home page
 * requires only what its own blocks read, and a page may not read a list it does not require (06 §7), so `liveSheet`
 * never offers it and `bindTo` would be refused there. `place` adds the list to the page's `requires` in the same write,
 * so the block and the right to read it land together.
 *
 * NOTHING IS PINNED WITHOUT A PRESS. These functions answer what a press would do; `PinTo.svelte` is the press.
 */

import { day } from 'braindog-render';
import type { Reading, SlashWhere } from '@braindog/client';

import { copy } from '../copy.ts';
import { boundBlock, unkept, words as bindWords, type Destination, type ListDecl } from '../record/bind-write.ts';
import { listName } from '../record/names.ts';
import { arrangedBody, schemaOf, setBody, type Added, type Arranged, type Placed } from '../record/page-write.ts';
import { pagesReader, type BlockBody, type Fetch, type PageBody } from '../record/pages-live.ts';
import { homeSlugOf } from '../voice.ts';
import { FIGURES_TRACE, whereWords } from './slash.ts';

/** Kept here rather than in `copy.ts`, so this module owns its words, as `bind-write.ts` does. */
export const words = {
  pin: 'Pin',
  pinTo: 'Pin to',
  pinned: (page: string) => `Pinned to ${page}.`,
  pinnedOn: (when: string) => `Pinned ${when}`,
  rows: (list: string, where: string | null) =>
    where === null ? `A table of every row in ${list}, read again each time the page opens.` : `A table of ${list} where ${where}, read again each time the page opens.`,
  note: 'A note with this answer, the day it was pinned and a mark that it was worked out, not checked.',
  noPages: 'This record has no page an answer can go on yet.',
  failed: 'Nothing was pinned, because part of this screen could not be loaded. Reload the page and try again.',
} as const;

/** What an answer pins as: a list and its filter, a note, or the reason it cannot be kept. */
export type Pin =
  | { kind: 'rows'; register: string; predicate: string; heading: string }
  | { kind: 'note'; text: string }
  | { kind: 'refused'; fix: string };

/** A text match anywhere in the tree is a search, which the record's filter sentence cannot say. */
const searches = (w: SlashWhere): boolean => {
  if ('all' in w && Array.isArray(w.all)) return w.all.some(searches);
  if ('any' in w && Array.isArray(w.any)) return w.any.some(searches);
  if ('none' in w && Array.isArray(w.none)) return w.none.some(searches);
  return 'matches' in w;
};

/**
 * The one list an answer is about: the list every row came from, or, when nothing answered, the one list Slash read.
 * `null` when rows came from two lists, since one block reads one list.
 */
function oneList(r: Reading): string | null {
  const lists = new Set(
    r.rows.length > 0 ? r.rows.map((row) => row.register) : r.read.filter((t) => t.register !== FIGURES_TRACE && t.predicate !== 'refused').map((t) => t.register),
  );
  return lists.size === 1 ? [...lists][0]! : null;
}

/**
 * What this answer can be pinned as, or `null` when there is nothing to pin.
 *
 * A LIST ANSWER FIRST, because it stays true. A keyword search (`q`, no predicate) or a predicate with a text match in
 * it is what one person typed to look, not a filter a page can keep: it is refused in `bind-write.ts`'s own sentence,
 * unless the answer also has prose, which pins as a note instead. `prose` is Slash's sentence as plain words, already
 * flattened from its figures by the caller.
 */
export function pinnable(r: Reading | null, asked: string, prose?: string | null): Pin | null {
  const text = prose?.trim() ?? '';
  const note: Pin | null = text === '' ? null : { kind: 'note', text };
  if (r === null) return note;
  const register = oneList(r);
  if (register === null) return note;
  const name = listName(register);
  const said = asked.trim();
  const heading = said === '' ? name : said[0]!.toUpperCase() + said.slice(1);
  if (r.predicate === null) {
    const q = r.q?.trim() ?? '';
    if (q === '') return { kind: 'rows', register, predicate: copy.everything, heading };
    return note ?? { kind: 'refused', fix: unkept(q, `matching “${q}”`, name) ?? bindWords.searchNotKept(name) };
  }
  if (searches(r.predicate)) return note ?? { kind: 'refused', fix: bindWords.searchNotKept(name) };
  return { kind: 'rows', register, predicate: whereWords(r.predicate), heading };
}

/** The block a pin adds, as the record will store it. `now` is the moment of the press; the note is dated by it. */
export function pinBlock(p: Exclude<Pin, { kind: 'refused' }>, now: number, decl?: ListDecl | null): Added {
  if (p.kind === 'rows') return boundBlock(p.register, p.predicate, 'table', p.heading, decl);
  return { kind: 'note', span: 12, heading: words.pinnedOn(day(new Date(now).toISOString().slice(0, 10))), body: `${p.text} {inferred}` };
}

/** A page an answer can go on, with what the page already requires, so the write knows whether to add the list. */
export type PinPage = Destination & { requires: string[] };

export type PinSheet = { from: 'live'; name: string | null; pages: PinPage[]; declared: ListDecl | null } | { from: 'refused'; fix: string };

/**
 * Every page this record keeps that an answer can go on, Today first.
 *
 * EVERY PAGE, NOT ONLY THE ONES THAT READ THE LIST: a pin is a person saying "keep this here", and the write adds the
 * list to a page that lacks it. A page drawn once per row is left out by `pagesReader`, as for "Put this on a page".
 *
 * TODAY IS THE PAGE HOME DRAWS, by Home's own rule (`homeSlugOf` with no use case, as `Home.svelte` reads it): the
 * record's `home` where a person kept one, and nothing else. A use case's own Home page never stands in for the desk
 * since the audit of 22 October (U1), so it is offered as the page it is, under its own name, and Pin to Today no longer
 * writes onto the Solo founder's page. A record whose Today is the desk, which it does not store, has no Today to offer.
 */
export async function pinSheet(base: string, register: string | null, io?: Fetch): Promise<PinSheet> {
  const [read, declared] = await Promise.all([
    pagesReader(base, io).read(),
    register === null ? Promise.resolve(null) : (schemaOf(base, register, io) as Promise<ListDecl | null>),
  ]);
  if (read.from === 'absent') return { from: 'refused', fix: copy.recordNotReached };
  if (read.from === 'refused') return read;
  const pages = read.pages.map((p) => ({
    slug: p.slug,
    title: p.title || p.body.title,
    drawn: p.body.blocks.length,
    spans: p.body.blocks.map((b) => b.span),
    version: p.version,
    requires: Array.isArray(p.body.requires) ? (p.body.requires as unknown[]).filter((r): r is string => typeof r === 'string') : [],
  }));
  const today = homeSlugOf(null, pages.map((p) => p.slug));
  const first = pages.filter((p) => p.slug === today);
  const name = register === null ? null : typeof declared?.name === 'string' && declared.name !== '' ? declared.name : listName(register);
  return { from: 'live', name, pages: [...first, ...pages.filter((p) => p.slug !== today)], declared };
}

/**
 * The record's refusal in the words of the page it was about, the rule `bind-write.ts` keeps for `bindTo`: the block
 * this press added cannot be read, or a sentence written for an agent becomes the page not taking the block.
 */
function said(fix: string, to: PinPage): string {
  if (fix === copy.arrangeMoved) return bindWords.moved;
  const at = /^page\.\S+?\.blocks\[(\d+)\] cannot be read: /.exec(fix);
  if (at && Number(at[1]) === to.drawn) return bindWords.unread;
  return /\b(page|register|view|metric|rule)\.[\w-]+|\[\d+\]/.test(fix) ? bindWords.notTaken(to.title) : fix;
}

/**
 * A block as the record declared it, with `why` taken off: the kernel writes `why: 'empty'` beside `drawn: false` on a
 * block it hid for having nothing in it (`drawn.ts`), and `pagesReader` strips `drawn` but not `why`, so a body read back
 * from a page with a hidden empty block was refused on write (`why: is not a key a block has`). Home hides every empty
 * block, so that was most pins to Today. The fix belongs in `pages-live.ts`'s run keys; until it lands, this file cleans
 * the body it writes and the one its Undo writes.
 */
const declared = (b: BlockBody): BlockBody => {
  const { why: _run, ...rest } = b;
  return { ...rest, kind: b.kind };
};

/**
 * `saveArrangement` for one added block, with the list added to the page's `requires` when the page lacks it.
 *
 * THE SAME CHECKS, IN THE SAME ORDER: the body read again, refused when its block count or version is not the one the
 * sheet read, every block already there kept at the span it declared (including none), and the new block at the foot.
 * `before` is the body read, so the toast's Undo sets the page back whole, the list it did not require included.
 */
async function place(base: string, to: PinPage, block: Added, want: string | null, io?: Fetch): Promise<Arranged> {
  const read = await pagesReader(base, io).readOne(to.slug);
  if (read.from === 'absent') return { from: 'unreachable', fix: copy.recordNotReached };
  if (read.from === 'refused') return read;
  if (read.from === 'expanded') return { from: 'refused', fix: copy.arrangeTemplate };
  const before: PageBody = { ...read.page.body, blocks: read.page.body.blocks.map(declared) };
  const version = read.page.version;
  if (before.blocks.length !== to.drawn || (to.version !== null && version !== null && version !== to.version)) return { from: 'refused', fix: bindWords.moved };
  const placed: Placed[] = [
    ...to.spans.map((span, i) => ({ i, span: (typeof span === 'number' ? span : undefined) as number })),
    { i: to.drawn, span: typeof block.span === 'number' ? block.span : 12 },
  ];
  const body = arrangedBody(before, placed, [block]);
  if (!body) return { from: 'refused', fix: bindWords.moved };
  const had = Array.isArray(before.requires) ? (before.requires as unknown[]) : [];
  const requires = want === null || had.includes(want) ? {} : { requires: [...had, want] };
  const out = await setBody(base, { ...body, ...requires }, io, version);
  if (out.from === 'written') return { from: 'written', before, version: out.version, template: null };
  return out.from === 'unreachable' ? out : { from: 'refused', fix: said(out.fix, to) };
}

/**
 * Pin an answer to one page: one write, at the block count and version the sheet read the page at.
 *
 * NOT THROUGH `bindTo`, for two reasons measured here: Today does not require the list, so its write must add it, and a
 * page with a hidden empty block is refused by `bindTo` today (`declared` above). The block is still `boundBlock`'s.
 * A note reads no list, so it adds nothing to `requires`.
 */
export async function pinTo(base: string, to: PinPage, p: Exclude<Pin, { kind: 'refused' }>, now: number, io?: Fetch, decl?: ListDecl | null): Promise<Arranged> {
  return place(base, to, pinBlock(p, now, decl), p.kind === 'rows' ? `register.${p.register}` : null, io);
}
