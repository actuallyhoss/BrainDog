/**
 * Sharing on (sharing plan §2.1, the manage rung): somebody who manages part of the record shares it on with somebody
 * else here, at view, comment or edit and never manage, inside their own share and never past it. The record's
 * `shareOnward` keeps it under theirs, so it ends when theirs does. `OnwardSheet.svelte` draws this.
 *
 * WHAT THEIR SHARE CAN GIVE, FROM `myShares`. A row says whether it may be shared on (`onward`), and, from a record
 * that says them, what it is (`what`, `subject`), the lists it reaches whole (`lists`), which can be shared on alone,
 * and the people it may be shared on with (`to`). A record that does not say them yet is shared on whole, with the
 * people the record lets the caller list.
 *
 * THE SENTENCE IS THE RECORD'S OWN WORDS (`shareSentenceOf`), named from what the browser holds, then "Ends when yours
 * does." The record answers its own sentence when it keeps the share, and that is the one said after.
 *
 * PLAIN TYPESCRIPT WITH RELATIVE IMPORTS, so a test loads it in Node.
 */

import { shareSentenceOf, type Share, type ShareTarget } from '@braindog/kernel';

import { copy } from '../copy.ts';
import type { MyShare } from './sharing.ts';

/** The rungs a share can be passed on at: never manage, which is the owner's or an Admin's to give. */
export const ONWARD_RUNGS = ['view', 'comment', 'edit'] as const;
export type OnwardRung = (typeof ONWARD_RUNGS)[number];

/** Somebody or a list, by name: what the sheet offers. */
export type Named = { id: string; name: string };

/** What somebody chose: who, at which rung, and all of their share or one list it reaches whole. */
export type OnwardPick = { from: string; to: Named | null; can: OnwardRung; list: string | null };

/** The caller's shares they may share on now (`sharing.ts`, where Settings reads it without this file's sentences). */
export { onwardOf } from './sharing.ts';

/** A picked share's start: View, all of it, nobody yet. */
export const onwardStart = (from: string): OnwardPick => ({ from, to: null, can: 'view', list: null });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The parent's target as the grammar says it, or `null` from a record that does not send it. */
export function parentTarget(m: Pick<MyShare, 'what'>): ShareTarget | null {
  return isObj(m.what) ? (m.what as ShareTarget) : null;
}

/**
 * What to ask for when one list is picked out of the share: that list inside the same project, or that list alone for
 * a share of the record or of named lists. `undefined` is all of it, which the record reads as the parent's own target.
 * A share of rows or of a condition is given on whole.
 */
export function onwardTarget(parent: ShareTarget | null, list: string | null): ShareTarget | undefined {
  if (list === null || parent === null) return undefined;
  if ('project' in parent) return { project: parent.project, lists: [list] };
  if ('record' in parent || ('lists' in parent && Array.isArray(parent.lists))) return { lists: [list] };
  return undefined;
}

/** The lists a share may be passed on one at a time: what the record says it reaches whole, where it can be split. */
export function listsOffered(m: Pick<MyShare, 'what' | 'lists'>): Named[] {
  const t = parentTarget(m);
  if (t === null || onwardTarget(t, 'x') === undefined) return [];
  return [...(m.lists ?? [])];
}

/** Whether Share can be pressed: somebody picked who is not the caller. */
export const onwardReady = (p: OnwardPick, me: string): boolean => p.to !== null && p.to.id !== me;

/**
 * The share as the record will keep it, for its sentence: the child of `m`, for `p.to`, at `p.can`, ending when the
 * parent does. `null` from a record that does not send the parent's target, or while nobody is picked.
 */
export function onwardShare(m: Pick<MyShare, 'what' | 'until'>, p: OnwardPick): Share | null {
  const parent = parentTarget(m);
  if (parent === null || p.to === null) return null;
  const what = onwardTarget(parent, p.list) ?? parent;
  return { effect: 'allow', who: { kind: 'person', id: p.to.id }, what, can: p.can, ...(m.until ? { when: { until: m.until } } : {}) };
}

/**
 * The sentence before the record answers: "Sam can edit tasks in Kiln until 19 Nov. Ends when yours does." A list is
 * named by `listName` (the tab's declarations) else by the record's own names for the share's lists, and a project by
 * the share's subject. From a record that does not send the target: "Sam can edit Kiln. Ends when yours does."
 */
export function onwardSentence(
  m: Pick<MyShare, 'what' | 'until' | 'subject' | 'lists'>,
  p: OnwardPick,
  now: number,
  listName: (id: string) => string | undefined = () => undefined,
): string {
  if (p.to === null) return '';
  const share = onwardShare(m, p);
  const to = p.to;
  const subject = m.subject ?? copy.shareOnwardYours;
  const said =
    share === null
      ? copy.shareOnwardPlain(to.name, copy.shareOnwardVerbs[p.can]!, subject)
      : shareSentenceOf(
          share,
          {
            person: (id) => (id === to.id ? to.name : undefined),
            list: (id) => (listName(id) ?? m.lists?.find((l) => l.id === id)?.name)?.toLowerCase(),
            project: () => m.subject,
            row: () => m.subject,
          },
          { now },
        );
  return `${said} ${copy.shareOnwardEnds}`;
}

/** The people a share may be passed on to: the record's own list for it, else the people the caller can list, never themselves. */
export function onwardPeople(m: Pick<MyShare, 'to'>, listed: readonly Named[], me: string): Named[] {
  const from = m.to ?? listed;
  return from.filter((p) => p.id !== me && p.name.trim() !== '').sort((a, b) => a.name.localeCompare(b.name));
}
