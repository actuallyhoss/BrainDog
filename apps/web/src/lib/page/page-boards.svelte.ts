/**
 * THE PAGES HE LAYS OUT AS BOARDS (widgets plan §4.2, W6): a project's page and Money's home first, then any page, each
 * arranged on its own, with the same editor as Today's (`lib/board`).
 *
 * KEPT AS HIS, NOT AS THE PAGE'S. A page's board is his `boards.pages` preference, by the page's address: the order of its
 * widgets, their sizes, the ones he took off and the phone's own arrangement. Nothing is written into the page's
 * declaration, so a page an add-on wrote, or a project's page drawn from one template for every project, keeps taking
 * its updates and each project keeps its own board. Undo puts the arrangement before back, or none.
 *
 * READ FROM `boot` ONCE (`me.prefs`), then this tab's copy, which a write changes at once and puts back if the record
 * refuses.
 */

import { page } from '$app/state';

import type { Phone } from '../board/board-widgets.ts';

/** One page's board as kept: its widgets by key, in order, at their sizes, less the ones taken off. */
export type PageBoardKept = { order: string[]; sizes: Record<string, string>; hidden?: string[]; phone?: Phone };

/** The pages a board is offered on before he lays any other out: a project's page and Money's home. */
export const boardWords = {
  on: 'Lay out as a board',
  off: 'Back to a plain page',
  onSaid: (title: string) => `${title} is a board now. Drag, resize or hide what is on it, then Done.`,
  offSaid: (title: string) => `${title} is a plain page again.`,
  edit: 'Edit board',
  arranged: (title: string) => `${title} is arranged.`,
  notKept: 'That was not kept.',
  addNotMine: 'This page came with an add-on, so a new widget goes on Today instead.',
  added: (name: string) => `${name} is on the board.`,
} as const;

/** A page's address as a board is kept under it: no slash at either end. */
export const boardSlug = (slug: string): string => slug.replace(/^\/+|\/+$/gu, '');

async function send(value: Record<string, PageBoardKept>): Promise<{ ok: true } | { ok: false; fix: string }> {
  try {
    const [{ createClient }, { apiBase }] = await Promise.all([import('@braindog/client'), import('../at.ts')]);
    const out = await createClient({ base: apiBase() }).setPref('boards.pages' as never, (Object.keys(value).length === 0 ? null : value) as never);
    if (out.ok) return { ok: true };
    return { ok: false, fix: 'refusal' in out ? out.refusal.fix : boardWords.notKept };
  } catch {
    return { ok: false, fix: 'BrainDog could not be reached, so this was not kept.' };
  }
}

const isBoards = (v: unknown): v is Record<string, PageBoardKept> => v !== null && typeof v === 'object' && !Array.isArray(v);

class PageBoards {
  all = $state.raw<Record<string, PageBoardKept>>({});
  /** The page just laid out as a board, whose editor opens as it is drawn. */
  fresh = $state<string | null>(null);
  #adopted = false;

  #ensure(): void {
    if (this.#adopted) return;
    try {
      const prefs = (page.data as { me?: { prefs?: Record<string, unknown> } } | undefined)?.me?.prefs;
      if (prefs === undefined) return;
      this.#adopted = true;
      const v = prefs['boards.pages'];
      if (isBoards(v)) this.all = v;
    } catch {
      /* Outside a page (a test): nothing was said. */
    }
  }

  /** This page's board, or `null` where it is a plain page. */
  of(slug: string): PageBoardKept | null {
    this.#ensure();
    return this.all[boardSlug(slug)] ?? null;
  }

  /** Keep (or, with `null`, take away) this page's board; the answer carries what was there for Undo. */
  async put(slug: string, board: PageBoardKept | null): Promise<{ ok: true; before: PageBoardKept | null } | { ok: false; fix: string }> {
    this.#ensure();
    const at = boardSlug(slug);
    const was = this.all;
    const before = was[at] ?? null;
    const { [at]: _gone, ...rest } = was;
    const next = board === null ? rest : { ...rest, [at]: board };
    this.all = next;
    const out = await send(next);
    if (!out.ok) {
      this.all = was;
      return out;
    }
    return { ok: true, before };
  }
}

/** The tab's one copy. */
export const pageBoards = new PageBoards();
