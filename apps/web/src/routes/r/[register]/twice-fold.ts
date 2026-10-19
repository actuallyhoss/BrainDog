/**
 * THE THINGS HERE TWICE, ON A LIST THAT SAYS WHAT MAKES TWO OF ITS ROWS THE SAME (`same:`), AND THE ONE PRESS THAT
 * FOLDS THEM.
 *
 * A list of people has its words in `twiceWords` (`api.ts`), and they say people. Skills, tools, keys and learnings
 * are not people, so a list that declares `same:` speaks of itself by its own name: "3 skills are here twice", the
 * way back to all of them, and the one button its `keep` names. The record says which rows they are (`heldTwice`) and
 * files the one question that folds them (`askFoldTwice`); Decide asks it, and its Undo brings them all back.
 *
 * HERE AND NOT IN `api.ts`, because `api.ts` rides in the entry every screen loads and this is read by the list route
 * alone, which is loaded when it is opened.
 *
 * NOTHING HERE FOLDS. The press files a question signed by whoever pressed, and the fold is that question's answer.
 */

import type { RegisterDecl } from '../../../lib/record/schema.ts';
import { inSentence } from '../../../lib/voice.ts';

/** Which row of each group the fold keeps, as the list declares it. `oldest` when it says nothing. */
export type Keep = 'oldest' | 'latest' | 'sealed';

/** The one button, by the list's `keep`. */
export const keepWords: Readonly<Record<Keep, string>> = {
  oldest: 'Keep the oldest of each',
  latest: 'Keep the newest of each',
  sealed: 'Keep the one with the sealed value',
};

/**
 * The list's `same:` as this screen reads it, or `null`: a list that declares none, a list still being read, and the
 * list that keeps people, which keeps the words it always had whatever else it declares.
 */
export function sameOf(decl: RegisterDecl | undefined): { keep: Keep } | null {
  if (decl === undefined || (decl as { meets?: unknown }).meets !== undefined) return null;
  const same = decl.same;
  if (same == null || typeof same !== 'object') return null;
  const keep: unknown = same.keep;
  return { keep: keep === 'latest' || keep === 'sealed' ? keep : 'oldest' };
}

/** The line above the list: "3 skills are here twice". Nothing at all for nought, or for a list with no `same:`. */
export function twiceLine(decl: RegisterDecl | undefined, count: number): string | null {
  if (!sameOf(decl) || !decl || !(count > 0)) return null;
  return count === 1 ? `1 ${inSentence(decl.one)} is here twice` : `${String(count)} ${inSentence(decl.name)} are here twice`;
}

/** What the list says while `?twice=1` narrows it to the things here twice, in the list's own name. */
export function thingWords(decl: RegisterDecl, keep: Keep) {
  const name = inSentence(decl.name);
  const clear = `Show all ${name}`;
  return {
    showing: `Showing the ${name} that are here twice`,
    clear,
    none: `No ${name} are here twice.`,
    /** Why nothing is saved while the word narrows the list. It names `clear`, as the people's sentence does. */
    unsaved: `A view cannot keep the ${name} that are here twice. Choose ${clear} first.`,
    keep: keepWords[keep],
  };
}

/** A call's answer as far as this file reads one. */
type Called = { ok: true; value: unknown } | { ok: false; refusal?: { code: string; fix: string } };

/** What the press answers: where the question waits on Decide, or the record's own sentence and whether to stop asking. */
export type Folded = { ok: true; href: string } | { ok: false; said: string; gone: boolean };

/** A host built before the call: it has nothing to fold with, so the button goes rather than refusing every press. */
const ABSENT = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']);

/**
 * File the one question that folds every group of the list, and answer its address on Decide.
 *
 * `call` IS THE CLIENT'S OWN, handed in so this is driven without a record. A second press answers the question already
 * waiting, so pressing twice opens one question. A refusal is handed back in the record's own words; nothing here to
 * fold, which the record says by answering no question, is said plainly and opens nothing.
 *
 * `rows`, THE ONES PICKED ON THE LIST by their numbers, folds only what they are here twice with (the bar's "Fold into
 * one"). Absent, the press is the whole list's, as the button over the list is.
 */
export async function foldAsk(
  call: (name: string, args: Record<string, unknown>) => Promise<Called>,
  register: string,
  rows?: readonly number[],
): Promise<Folded> {
  const out = await call('askFoldTwice', rows === undefined ? { register } : { register, rows: [...rows] });
  if (!out.ok) {
    const code = out.refusal?.code ?? '';
    if (ABSENT.has(code)) return { ok: false, said: 'This BrainDog cannot fold these yet.', gone: true };
    return { ok: false, said: out.refusal?.fix ?? 'Could not put the question in Needs you. Try again.', gone: false };
  }
  const question = (out.value as { question?: unknown } | null)?.question;
  if (typeof question !== 'string' || question === '') return { ok: false, said: 'Nothing on this list is here twice now.', gone: true };
  return { ok: true, href: `/decide/${encodeURIComponent(question)}` };
}
