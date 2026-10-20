/**
 * A person makes a new page (PGS-C30): a title in, an empty page out, with a place on the rail.
 *
 * ONE BODY, TWO WAYS IN. Whoever owns the record sets the page through `setDeclaration`, as "Save as a view" does
 * (`rows-write.ts`). Anybody else files the very same body as a change on Decide, and nothing is written until it is
 * accepted there. The body is built once, so a suggested page and a made one differ in one thing only: the sentence of
 * the note, which is written for whoever made the page.
 *
 * ITS SHAPE IS NOT SET HERE. A page holds 1 to 24 blocks (`packages/record/src/grammar.ts`), so an empty one cannot be
 * declared: it carries one note that says it is empty and how to fill it, which the first thing put on the page
 * replaces. The side column, tabs, icon and section are the page's settings.
 *
 * THE CLIENT IS HANDED IN, so the palette and the rail share one function and a test runs it over a real kernel.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from './row-live.ts';
import { pageWords } from './page-words.ts';

/* THE WORDS ARE `page-words.ts`'s, so the rail can say them without this file and the client behind it. */
export { pageWords };

/** The longest title taken, in characters: what the rail can draw on one line of a wide screen. */
const TITLE_MOST = 80;
/** The longest slug made here, before the number that tells two pages of one name apart. */
const SLUG_MOST = 48;
/** Where a made page sits in its section: after the pages a template brought, as a saved view does. */
const NAV_ORDER = 900;

/** The four calls a new page can make, and nothing else of the client. */
export type PageClient = {
  call(method: string, args?: Record<string, unknown>): Promise<{ ok: true; value?: unknown } | Failed>;
};
type Failed = { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: { current: unknown } };

export type NewPageDeps = {
  client: PageClient;
  /** The slugs `boot` lists, so a second page of one name lands beside the first. */
  pages: readonly string[];
  /** Whether the person owns the record. Anybody else suggests the page. */
  owner: boolean;
};

export type Refused = { ok: false; why: 'refused' | 'unreachable'; fix: string };
/** `as` says which way in it took; `said` is the toast's one sentence. */
export type MadePage = { ok: true; slug: string; id: string; as: 'made' | 'suggested'; said: string } | Refused;

/** The client the app talks to its record with, for the two ways in. */
export function pageClient(base: string, io?: Fetch): PageClient {
  return createClient({ base, ...(io ? { fetch: io } : {}) }) as unknown as PageClient;
}

/**
 * A slug from a title, unique against the pages already there: `wedding`, then `wedding-2`.
 *
 * LOWER-CASE LETTERS, DIGITS AND DASHES, which is all the grammar takes. An accent is dropped and its letter kept, and a
 * title with none of them at all (one written in another script) is addressed as `page`.
 */
export function slugFor(title: string, taken: readonly string[]): string {
  const plain = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .slice(0, SLUG_MOST + 1)
    .replace(/^-+|-+$/gu, '');
  const stem = (plain.length > SLUG_MOST ? plain.slice(0, SLUG_MOST).replace(/-+$/u, '') : plain) || 'page';
  const held = new Set(taken);
  if (!held.has(stem)) return stem;
  for (let n = 2; ; n++) if (!held.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/**
 * An empty page, as a declaration the kernel already validates: its title, its place on the rail, and one note.
 *
 * `owner` IS WHETHER ITS MAKER OWNS THE RECORD, which picks the note's sentence. A page made before this keeps the one
 * it was stored with.
 */
export function pageBody(slug: string, title: string, owner: boolean): Record<string, unknown> {
  return {
    page: slug,
    title,
    nav: { section: pageWords.section, order: NAV_ORDER },
    blocks: [{ kind: 'note', span: 12, body: owner ? pageWords.empty : pageWords.emptySuggested }],
  };
}

/** A write that answers no row: the record's sentence, or the calm one when nothing answered. */
function refusedAs(out: Failed): Refused {
  if (!('refusal' in out)) return { ok: false, why: 'refused', fix: pageWords.raced };
  if (out.refusal.code === 'UNREACHABLE') return { ok: false, why: 'unreachable', fix: pageWords.notReached };
  return { ok: false, why: 'refused', fix: out.refusal.fix };
}

/**
 * Make a page called `title`, or suggest it when the person does not own the record.
 *
 * A BLANK TITLE IS REFUSED BEFORE THE RECORD IS ASKED, because a sentence under the box beats a round trip.
 */
export async function newPage(title: string, deps: NewPageDeps): Promise<MadePage> {
  const named = title.replace(/\s+/gu, ' ').trim();
  if (named === '') return { ok: false, why: 'refused', fix: pageWords.blank };
  if ([...named].length > TITLE_MOST) return { ok: false, why: 'refused', fix: pageWords.long };

  const slug = slugFor(named, deps.pages);
  const id = `page.${slug}`;
  const body = pageBody(slug, named, deps.owner);

  if (deps.owner) {
    const out = await deps.client.call('setDeclaration', { body });
    return out.ok ? { ok: true, slug, id, as: 'made', said: pageWords.made(named) } : refusedAs(out);
  }
  /* THE KERNEL'S FORM OF THE SAME DECLARATION: its id and kind beside the body, which for a page keeps its `page`. */
  const out = await deps.client.call('propose', {
    question: pageWords.question(named),
    body_kind: 'change',
    body: { declaration_id: id, to: { id, kind: 'page', body } },
  });
  return out.ok ? { ok: true, slug, id, as: 'suggested', said: pageWords.suggested(named) } : refusedAs(out);
}

/**
 * Undo: retire the page that was just made. Whatever was added to it meanwhile goes with it, and no list loses an item,
 * since a page is a shape. The owner's, as making it was; a suggestion has nothing to undo until it is accepted.
 */
export async function dropPage(id: string, deps: Pick<NewPageDeps, 'client'>): Promise<{ ok: true } | Refused> {
  const out = await deps.client.call('retireDeclaration', { id });
  return out.ok ? { ok: true } : refusedAs(out);
}
