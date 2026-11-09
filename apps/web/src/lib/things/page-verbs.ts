/**
 * A VERB OF A PAGE, ASKED FROM A LINK TO IT. Some of what a page's "…" holds works on what the page has drawn (Change this
 * page, Edit layout, Display). A right-click on a link to that page offers the same items, so pressing one goes to the page
 * and has the page do it, the way pressing it there would: the page says what it answers to with `answerVerbs`, and `askPage`
 * goes there and asks. Kept in the tab and not the address, so a reload never does it twice. Pure but for `goto`.
 *
 * AND RENAME, FROM A DOUBLE CLICK (`lib/ui/dbl.ts`): a name double-clicked anywhere is renamed by the page it opens, so a
 * page that can rename what it is about answers `rename` (a row its title, a list its name), and a value of a row
 * answers `edit:<field>` on the row's own page. `askHere` asks the page on the screen now and leaves nothing waiting.
 */

import { goto } from '$app/navigation';
import { navigating } from '$app/state';
import { at, here } from '../at.ts';
import { dbl } from '../ui/dbl.ts';

export type PageVerbs = Readonly<Record<string, (() => void) | null | undefined>>;

const answering = new Set<PageVerbs>();
let waiting: { verb: string; at: number; path: string } | null = null;
/** How long a verb waits for its page: longer is somebody who went elsewhere. */
const WAIT = 12_000;

/** The address a page is drawn at, as a verb names it: record-relative, without its query. */
const pathOf = (href: string): string => here(href.split(/[?#]/u)[0] ?? href) || '/';

function answer(verbs: PageVerbs): void {
  if (!waiting || Date.now() - waiting.at > WAIT) return;
  /* A VERB IS FOR THE PAGE IT NAMED: one asked of a row's page and not answered there is not answered by the next page that
     knows the word. */
  if (pathOf(location.pathname) !== waiting.path) return;
  const go = verbs[waiting.verb];
  if (!go) return;
  waiting = null;
  go();
}

/** A page's answers, attached for as long as it is drawn. A verb asked on the way here is answered now. */
export function answerVerbs(verbs: PageVerbs): () => void {
  answering.add(verbs);
  queueMicrotask(() => answer(verbs));
  return () => void answering.delete(verbs);
}

/** Go to `href`, unless already there, and have its page do `verb`. */
export function askPage(href: string, verb: string): void {
  const path = pathOf(href);
  waiting = { verb, at: Date.now(), path };
  const onIt = pathOf(location.pathname) === path;
  if (onIt) {
    for (const verbs of answering) answer(verbs);
    return;
  }
  /* A PAGE ALREADY ON ITS WAY IS NOT ASKED FOR TWICE: the click a double click starts with is going there now. */
  const going = navigating.to?.url.pathname;
  if (going !== undefined && pathOf(going) === path) return;
  void goto(at(href));
}

/** Whether the page on the screen answers `verb` now. */
export function answers(verb: string): boolean {
  for (const verbs of answering) if (verbs[verb]) return true;
  return false;
}

/** Have the page on the screen do `verb`, now or not at all. Whether it did. */
export function askHere(verb: string): boolean {
  for (const verbs of answering) {
    const go = verbs[verb];
    if (!go) continue;
    go();
    return true;
  }
  return false;
}

/**
 * `{@attach renamesPage}`: THE PAGE'S NAME, WHEREVER IT IS DRAWN (its head, the desk's crumb, the phone's bar, a lead
 * tile), renamed by a double click as the page renames itself (`rename`). A page that answers no `rename` keeps the
 * browser's double click on its name, which selects a word.
 */
export const renamesPage = dbl(() => askHere('rename'), { can: () => answers('rename') });
