/**
 * A VERB OF A PAGE, ASKED FROM A LINK TO IT. Some of what a page's "…" holds works on what the page has drawn (Change this
 * page, Edit layout, Display). A right-click on a link to that page offers the same items, so pressing one goes to the page
 * and has the page do it, the way pressing it there would: the page says what it answers to with `answerVerbs`, and `askPage`
 * goes there and asks. Kept in the tab and not the address, so a reload never does it twice. Pure but for `goto`.
 */

import { goto } from '$app/navigation';
import { at, here } from '../at.ts';

export type PageVerbs = Readonly<Record<string, (() => void) | null | undefined>>;

const answering = new Set<PageVerbs>();
let waiting: { verb: string; at: number } | null = null;
/** How long a verb waits for its page: longer is somebody who went elsewhere. */
const WAIT = 12_000;

function answer(verbs: PageVerbs): void {
  if (!waiting || Date.now() - waiting.at > WAIT) return;
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
  waiting = { verb, at: Date.now() };
  const onIt = (here(location.pathname) || '/') === href.split('?')[0];
  if (onIt) {
    for (const verbs of answering) answer(verbs);
    return;
  }
  void goto(at(href));
}
