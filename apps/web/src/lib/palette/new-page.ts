/**
 * The palette's way in to a new page (PGS-C30): `New page: Wedding`, read out of the query and made on the press.
 *
 * THE SENTENCE IS THE WHOLE INTERFACE, as it is for the add row (`create.ts`): there is no form behind the row, the box
 * already holds the name. `paging()` reads it, a pure function over the words and who is asking.
 *
 * AND THE ROW IS THERE BEFORE THE NAME, which the add row is not. `Add to` with no list has nothing to say, but a page
 * needs only a name, and somebody who has not learned the sentence looks for the words New page. So with no name yet
 * the row is found like any command, by its own words, and a press writes the sentence into the box for its last word.
 * Half a sentence still makes nothing: `new pages` is a query, never a page called "s".
 *
 * SOMEBODY WHO DOES NOT OWN THE RECORD READS `Suggest a page`. The press is the same and the record is asked a
 * question in place of a write, which is `record/page-new.ts`'s to decide and this file's only to say.
 *
 * `record/page-new.ts` IS LOADED ON THE PRESS, NOT WITH THE PALETTE, for `create.ts`'s reason: it carries the client,
 * and the palette is in the layout every screen waits for. That is also why the two labels are spelled here and held
 * to that file's by `new-page.test.ts`, where a static import costs nothing.
 */

import { terms, tokensOf } from '../record/find.ts';
import type { Fetch } from '../record/row-live.ts';

/** Kept here, so the palette's row owns its own words. The receipts are `record/page-new.ts`'s sentences. */
export const words = {
  /** The declaration's title, which `admits()` checks, and the owner's row with no name yet. */
  declared: 'New page',
  suggest: 'Suggest a page',
} as const;

/** What the plain row writes into the box: the sentence up to the name, in either reader's case. */
export const FILL = `${words.declared}: `;

/** Who is asking: the owner makes the page, anybody else on the record suggests it, and nobody is offered nothing. */
export type Who = 'owner' | 'member';

/** The page a query names. `title` is empty while the row is found and the name is not typed yet. */
export type Paging = { title: string; suggest: boolean };

/**
 * `new page` or `suggest a page`, then the name. A COLON IS ALLOWED AND NOT ASKED FOR, since nothing has to end before
 * the name starts, and what follows the words has to be a space, a colon or the end, so `new pages` is not the sentence.
 */
const SENTENCE = /^\s*(?:new\s+page|suggest\s+a\s+page)(?:\s*:\s*|\s+|$)(.*?)\s*$/iu;

/** The words on the row a reader of this kind is shown, before any name. */
const label = (suggest: boolean): string => (suggest ? words.suggest : words.declared);

/** The shell, as far as this file reads it. */
type Asker = { live?: boolean | undefined; me?: { owner?: boolean | undefined } | undefined };

/**
 * Who the shell says is asking. WITH NO RECORD THERE IS NO PAGE TO MAKE, and a refused `boot` names nobody, so both
 * are `null` and the row is absent (`admit.ts`'s standing rule) rather than drawn to fail.
 */
export function whoOf(shell: Asker): Who | null {
  if (shell.live !== true || !shell.me) return null;
  return shell.me.owner === true ? 'owner' : 'member';
}

/**
 * The row a query asks for, or `null` when it asks for none.
 *
 * EITHER SENTENCE IS READ FOR EITHER READER, and the row says what the press will do: a colleague who types
 * `new page Wedding` is shown `Suggest a page: Wedding`. A NAME'S RUNS OF SPACE ARE ONE SPACE, which is how the record
 * keeps it, so the row reads as the page will.
 *
 * WITH NO NAME, the palette's own grammar decides (`find.ts`): every word typed starts a word of the row, and nothing
 * typed is the freshly opened list, which holds it.
 */
export function paging(query: string, who: Who | null): Paging | null {
  if (who === null) return null;
  const suggest = who !== 'owner';
  const said = SENTENCE.exec(query);
  if (said) return { title: (said[1] ?? '').replace(/\s+/gu, ' '), suggest };
  const want = terms(query);
  if (!want) return query.trim() === '' ? { title: '', suggest } : null;
  const has = tokensOf(label(suggest));
  return want.every((w) => has.some((token) => token.startsWith(w))) ? { title: '', suggest } : null;
}

/** The words on the row: its label, and the name after a colon once there is one. */
export const rowTitle = (p: Paging): string => (p.title === '' ? label(p.suggest) : `${label(p.suggest)}: ${p.title}`);

/** Where a page lives. */
export const pageHref = (slug: string): string => `/p/${slug}`;

/**
 * Where a page just made opens: its address, asking for "Describe it" to be open already (ENG-B11), so one sentence
 * builds it. The page's own menu reads the mark and takes it out of the address (`page/change-open.ts`), and where
 * Slash has no model there it opens the page as it is. SPELLED HERE, since the palette is in the layout every screen
 * waits for; `change-open.test.ts` holds it to that file's reading.
 */
export const describedHref = (slug: string): string => `${pageHref(slug)}?describe=1`;

/** What a press answered: the page and the sentence that says so, with its way back when there is one; or a sentence. */
export type Made =
  | { ok: true; slug: string; as: 'made' | 'suggested'; said: string; back?: (() => Promise<{ ok: true; said: string } | { ok: false; fix: string }>) | undefined }
  | { ok: false; fix: string };

/** What a press needs of the screen it is on. `Palette.svelte` hands these in; `new-page.test.ts` hands in its own. */
export type Desk = {
  make: (title: string) => Promise<Made>;
  /** Open an address of this app. */
  go: (href: string) => unknown;
  toast: (text: string, opts?: { undo?: () => void; intent?: 'good' | 'warn' }) => unknown;
  /** Read the shell again, so the rail follows the page in and out. */
  refresh: () => unknown;
  /** Leave a page that has just been taken away, when the reader is still on it. */
  leave: (href: string) => unknown;
  /** The calm sentence for a record that did not answer. */
  notReached: string;
};

/**
 * THE ROW, PRESSED: the page asked for once, opened on its describe field, and one receipt that can take it back.
 *
 * THE SHELL IS READ BEFORE THE PAGE OPENS, so the rail lists the page by the time it is on screen. UNDO RETIRES THE
 * PAGE, says so, and leaves it when the reader is still there, because what is left at that address is nothing. It
 * leaves the page's plain address, which is where the reader is once the page has read the mark.
 *
 * A SUGGESTION OPENS NOTHING AND OFFERS NO UNDO. There is no page until the owner accepts it on Decide, which the
 * receipt says, and a question once asked is the owner's to answer.
 */
export async function pressed(p: Paging, desk: Desk): Promise<void> {
  let out: Made;
  try {
    out = await desk.make(p.title);
  } catch {
    /* THE PAGE MODULE IS LOADED ON THE PRESS, so a dropped connection can fail the import before any request. */
    return void desk.toast(desk.notReached, { intent: 'warn' });
  }
  if (!out.ok) return void desk.toast(out.fix, { intent: 'warn' });
  await desk.refresh();
  if (out.as === 'suggested') return void desk.toast(out.said, { intent: 'good' });
  const href = pageHref(out.slug);
  const back = out.back;
  await desk.go(describedHref(out.slug));
  desk.toast(out.said, {
    intent: 'good',
    ...(back
      ? {
          undo: () =>
            void back().then(async (undone) => {
              if (!undone.ok) return void desk.toast(undone.fix, { intent: 'warn' });
              await desk.leave(href);
              await desk.refresh();
              desk.toast(undone.said);
            }),
        }
      : {}),
  });
}

/**
 * The real page maker, over `record/page-new.ts` and the record at `base`.
 *
 * `pages` ARE THE SLUGS `boot` LISTS, so a second Wedding lands at its own address beside the first, and `owner`
 * decides between the write and the question exactly as the row's words did.
 */
export function maker(base: string, pages: readonly string[], owner: boolean, io?: Fetch): Desk['make'] {
  return async (title) => {
    const { newPage, dropPage, pageClient, pageWords } = await import('../record/page-new.ts');
    const client = pageClient(base, io);
    const out = await newPage(title, { client, pages, owner });
    if (!out.ok) return { ok: false, fix: out.fix };
    const { slug, id, said } = out;
    if (out.as === 'suggested') return { ok: true, slug, as: 'suggested', said };
    const named = title.replace(/\s+/gu, ' ').trim();
    return {
      ok: true,
      slug,
      as: 'made',
      said,
      back: async () => {
        const gone = await dropPage(id, { client });
        return gone.ok ? { ok: true, said: pageWords.undone(named) } : { ok: false, fix: gone.fix };
      },
    };
  };
}

/**
 * Whether the query is the sentence itself, name or no name, and not only words that find the row. The palette draws
 * a sentence above everything, as it does the add row, and a row merely found among the commands.
 */
export const asked = (query: string): boolean => SENTENCE.test(query);
