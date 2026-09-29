/**
 * `Put this on a page` against a live record: which of the record's pages a list's view can go on, the block that view
 * becomes, and the one write that adds it.
 *
 * A ROUTE-ONLY MODULE, loaded by `BindBlock.svelte` once `boot` has said the record is live, like `page-write.ts`: the
 * client carries the route table as a value. The sample never reaches this file; it says what it would have added, as
 * it always did, through the caller's `onbind`.
 *
 * WHAT IT REPLACED. The sheet offered the built-in sample's pages (`pages()`) and the build's own lists (`REGISTERS`)
 * whatever record was behind it, and both callers answered the press with a warning that nothing was written. On a live
 * record that named the fictional studio's pages as the places a real list could go, and put the block on none of them.
 *
 * THE WRITE IS AN ARRANGEMENT WITH ONE BLOCK ADDED, through `saveArrangement`, because that is already the one path that
 * sets a page body whole against the block count and the version it was read at. A second path would be a second
 * answer to "the page changed while you were looking at it", and the two would drift.
 */

import { KINDS, isKind } from 'braindog-render';

import { copy } from '../copy.ts';
import { saveArrangement, schemaOf, type Added, type Arranged, type Placed } from './page-write.ts';
import { pagesReader, type Fetch } from './pages-live.ts';

/** Kept here rather than in `copy.ts`, so this module owns its words. */
export const words = {
  bound: (kind: string, page: string) => `Added a ${kind.toLowerCase()} to ${page}.`,
  moved: 'This page changed while the sheet was open. Open the sheet again to see it as it is now.',
  emptyAll: 'Nothing in this list yet.',
  emptyFiltered: 'Nothing here matches this view right now.',
  /* The typed text is not quoted back: the sentence above this one in the sheet already shows it. */
  searchNotKept: (list: string) =>
    `A search cannot be kept as a block, because a page shows the same rows to everyone who opens it. A filter can: narrow ${list} by one of its fields, then put that on a page.`,
  unread: 'The list cannot read this filter, so the block was not added and the page is as it was. Narrow the list by one of its fields, then put that on a page.',
  notTaken: (page: string) => `${page} did not take the block, so nothing on it changed.`,
} as const;

/**
 * WHY THIS VIEW CANNOT BECOME A BLOCK, or `null` when it can: the sheet says it before the press, and offers no press.
 *
 * A SEARCH IS NOT A FILTER. The register screen hands the sheet its search text as `predicate` when no filter is set, and
 * the record reads a block's `where` as a sentence about the list's fields, so `kiln` was refused on every press with
 * `page.work.blocks[1] cannot be read: kiln: tasks has no field called kiln.` A search is what one person typed to look;
 * a block is what everybody who opens the page sees.
 *
 * TOLD APART BY THE SENTENCE THE ROUTE SAYS IT IN, `matching “<text>”`, because the route passes nothing else that says
 * which of the two it handed over, and this file does not own the route. `bind-write.test.ts` reads the route to hold it
 * to that spelling. A filter is the route's `whereOf`, which never reads that way.
 */
export function unkept(predicate: string, says: string, list: string): string | null {
  if (predicate === copy.everything || predicate.trim() === '') return null;
  return says === `matching “${predicate}”` ? words.searchNotKept(list) : null;
}

/**
 * The record's refusal of a page write, in the owner's words when the record's are its own.
 *
 * THE KERNEL WRITES FOR AN AGENT: a declaration's address, the block's index and the list's id, `page.work.blocks[1]
 * cannot be read: kiln: tasks has no field called kiln.` That is the right sentence in an MCP answer and the wrong one
 * in a sheet under a list somebody knows as Tasks. A refusal at the block this press added is a filter the list cannot
 * read; any other sentence that names an address or an index is about something else on the page (a block that was
 * there already, the page's own `requires`), so it is said by the page's title. A sentence with neither was written for
 * a person already and is kept.
 *
 * THE PAGE'S OWN ADDRESS AS THE SUBJECT IS NOT AN ID TO TRANSLATE AWAY, it is the page's name spelled for an agent. The
 * block ceiling reads `page.work declares 25 blocks. The ceiling is 24: a page longer than that is a report.`, and every
 * sentence naming `page.<slug>` used to become "Work did not take the block", which threw away the reason and the number
 * she needed to take a block off first. So the leading address becomes the title, and the sentence
 * is kept when nothing else in it is an id; one that still names another address or an index is translated as before.
 */
function owned(fix: string, to: Destination): string {
  const at = /^page\.\S+?\.blocks\[(\d+)\] cannot be read: /.exec(fix);
  if (at && Number(at[1]) === to.drawn) return words.unread;
  if (at) return words.notTaken(to.title);
  const lead = `page.${to.slug}`;
  const named = fix.startsWith(lead) && !/^[\w.[-]/.test(fix.slice(lead.length)) ? to.title + fix.slice(lead.length) : fix;
  if (/\b(page|register|view|metric|rule)\.[\w-]+|\[\d+\]/.test(named)) return words.notTaken(to.title);
  return named;
}

/**
 * THE KINDS THE LIVE SHEET OFFERS: the ones whose every cell can be any readable field.
 *
 * `seed.ts` fills the others by type from `REGISTERS`, and a `bar` or a `board` needs a number or a closed list in a
 * particular cell or it draws nothing. That table is the build's own lists and this file reads the record's, so the
 * kinds that need a typed cell are left to the sample and to arrange mode, rather than filled here by a second copy of
 * `seed.ts`'s rules.
 */
export const LIVE_KINDS = ['table', 'todo', 'spec', 'params'] as const;

/** What the record says about a list: the declaration `schema` answers, read loosely because a pack wrote it. */
export type ListDecl = {
  name?: unknown;
  title?: unknown;
  fields: readonly { id: string; type?: unknown; retired?: unknown }[];
};

/** A page the block can go on, with what `saveArrangement` must be handed back: its block count, spans and version. */
export type Destination = { slug: string; title: string; drawn: number; spans: unknown[]; version: number | null };

export type Sheet =
  | { from: 'live'; name: string; destinations: Destination[]; declared: ListDecl | null }
  | { from: 'refused'; fix: string };

/**
 * A SECRET IS NEVER A COLUMN, and neither is a document. A page is read by everybody who can open it, and a document is
 * a whole plan in one cell. A retired field is one the list no longer shows.
 */
const columnable = (f: ListDecl['fields'][number]): boolean => f.type !== 'secret' && f.type !== 'document' && f.retired !== true;

/**
 * The columns a kind draws, from the list the record declares: its title first, then its fields in the order declared.
 *
 * A `table` takes three because its arity is its columns (`cells: 0`); every other kind takes the cells a row must have,
 * leaving off the ones `KINDS` marks optional, so a `todo` is its title and one detail and not a row of four.
 */
export function columnsOf(kind: string, decl: ListDecl): { field: string }[] {
  const spec = isKind(kind) ? KINDS[kind] : undefined;
  const want = !spec || spec.cells === 0 ? 3 : Math.max(1, spec.cells - (spec.optional ?? 0));
  const title = typeof decl.title === 'string' ? decl.title : undefined;
  const rest = decl.fields.filter((f) => f.id !== title && columnable(f)).map((f) => f.id);
  return [...(title ? [title] : []), ...rest].slice(0, want).map((field) => ({ field }));
}

/**
 * The block the sheet describes, as the record will store it.
 *
 * `predicate` IS WHAT THE REGISTER SCREEN HANDS THE SHEET: its filter as a sentence, or the search text when there is no
 * filter, or `copy.everything` when there is neither. `everything` writes no `where`, since leaving the key off is how a
 * declaration says every row, and the kernel refuses an empty one. A search text never gets this far from the sheet,
 * which asks `unkept` first and offers no press; one that arrives anyway is written as it came, the record's page check
 * refuses it, and `bindTo` says that refusal in the owner's words instead of the page carrying it.
 *
 * `decl` IS THE RECORD'S OWN DECLARATION of the list, which is where the columns come from. Without it the block names
 * none, and the kernel still answers its rows, but the app draws each row with nothing in it.
 */
export function boundBlock(register: string, predicate: string, kind: string, heading: string, decl?: ListDecl | null): Added {
  const where = predicate === copy.everything ? '' : predicate.trim();
  return {
    kind,
    heading,
    span: isKind(kind) ? KINDS[kind].minSpan : 12,
    source: `register.${register}`,
    ...(decl ? { columns: columnsOf(kind, decl) } : {}),
    ...(where === '' ? {} : { where }),
    empty: where === '' ? words.emptyAll : words.emptyFiltered,
  };
}

/**
 * What the sheet offers on a live record: the list by the name the record gives it, and the record's pages that
 * require it.
 *
 * 06 §7, "a page cannot read a register it did not declare": a page whose `requires` does not hold the list is not
 * somewhere this block can live, so it is not offered. A page drawn once per row is left out by `pagesReader` already,
 * since writing an expansion back would turn one template into a page about one row.
 */
export async function liveSheet(base: string, register: string, io?: Fetch): Promise<Sheet> {
  const [read, declared] = await Promise.all([pagesReader(base, io).read(), schemaOf(base, register, io) as Promise<ListDecl | null>]);
  if (read.from === 'absent') return { from: 'refused', fix: copy.recordNotReached };
  if (read.from === 'refused') return read;
  const want = `register.${register}`;
  const destinations = read.pages
    .filter((p) => Array.isArray(p.body.requires) && (p.body.requires as unknown[]).includes(want))
    .map((p) => ({ slug: p.slug, title: p.title || p.body.title, drawn: p.body.blocks.length, spans: p.body.blocks.map((b) => b.span), version: p.version }));
  const name = typeof declared?.name === 'string' && declared.name !== '' ? declared.name : register;
  return { from: 'live', name, destinations, declared };
}

/**
 * Put one block at the foot of a page, at the block count and version the sheet read it at.
 *
 * EVERY BLOCK ALREADY THERE KEEPS THE SPAN IT DECLARED, INCLUDING NONE. `arrangedBody` writes each place's span onto its
 * block, so a place carrying a width for a block that declared none would freeze that width into a declaration nobody
 * edited. An undeclared span goes as `undefined`, which the body's JSON leaves out, and the test reads the stored block
 * back to prove it is unchanged.
 *
 * A PAGE THAT MOVED SINCE THE SHEET READ IT is `saveArrangement`'s refusal, said here in the sheet's own terms rather than
 * arrange mode's, and every other refusal the record answers goes through `owned`.
 */
export async function bindTo(base: string, to: Destination, block: Added, io?: Fetch): Promise<Arranged> {
  const placed: Placed[] = [
    ...to.spans.map((span, i) => ({ i, span: (typeof span === 'number' ? span : undefined) as number })),
    { i: to.drawn, span: typeof block.span === 'number' ? block.span : 12 },
  ];
  const out = await saveArrangement(base, to.slug, to.drawn, placed, [block], io, to.version);
  if (out.from !== 'refused') return out;
  return { from: 'refused', fix: out.fix === copy.arrangeMoved ? words.moved : owned(out.fix, to) };
}
