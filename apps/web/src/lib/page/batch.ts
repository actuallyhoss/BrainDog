/**
 * Several questions on a declared page answered at once: which of the chosen ones one press can answer, with what, and
 * which it leaves for their own press. Decide's rule (`routes/decide/+page.svelte` `answerPicked`), said once here so a
 * queue on any page keeps it.
 *
 * ONE ANSWER TO EIGHT QUESTIONS IS EIGHT DECISIONS, so it takes a reason, said once for all of them, and answers each
 * with what it suggests: its recommended option, or accepting a change. A question with no suggestion is left for its
 * own press. AN ARRANGEMENT IS NEVER IN A BATCH: it installs, renames and calls out, and each is read on its own.
 *
 * PURE, AND NODE LOADS IT, so `batch.test.ts` holds each rule.
 */

import type { QueueQuestion } from '@braindog/kernel';

import { isArranging } from '../../routes/decide/[id]/arranging.ts';

type Asked = Pick<QueueQuestion, 'id' | 'kind' | 'options'> & { body_kind?: string | undefined };

/** What a question takes without a choice: its suggested option, or accepting a change; `null` when it suggests none. */
export const suggestedOf = (q: Pick<QueueQuestion, 'options'>): string | null =>
  q.options.find((o) => o.recommended)?.key ?? (q.options.length === 0 || q.options.some((o) => o.key === 'accept') ? 'accept' : null);

/** Whether a question arranges the record (a pack, a settings change, a whole arrangement), by what was filed. */
export const arranges = (q: Asked): boolean => isArranging(q.body_kind ?? q.kind);

/** What one press answers among the chosen: each with the option it is answered with, and whether any was held back. */
export function batchOf<Q extends Asked>(chosen: readonly Q[]): { answers: { q: Q; option: string }[]; heldBack: boolean; unsuggested: boolean } {
  const answers: { q: Q; option: string }[] = [];
  let heldBack = false;
  let unsuggested = false;
  for (const q of chosen) {
    if (arranges(q)) {
      heldBack = true;
      continue;
    }
    const option = suggestedOf(q);
    if (option === null) unsuggested = true;
    else answers.push({ q, option });
  }
  return { answers, heldBack, unsuggested };
}
