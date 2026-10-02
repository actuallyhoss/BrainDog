/**
 * The questions chosen on a declared page, to answer several at once with one reason (`batch.ts`), and the send.
 *
 * ONE PER PAGE, held by `PageView`, so every queue on the page adds to the one choice and one bar answers it. A card
 * leads with its box only where a page holds one of these (`QueueAnswer.svelte`), so a home and a preview draw the
 * cards they always drew.
 */

import type { QueueQuestion } from '@braindog/kernel';

import { answerQuestion } from '../record/decide-write.ts';
import type { toasts } from '../ui/toast.svelte.ts';
import { copy } from '../copy.ts';
import { batchOf } from './batch.ts';

export class Picked {
  /** The chosen questions, by id, in the order they were chosen. */
  chosen = $state.raw(new Map<string, QueueQuestion>());
  reason = $state('');
  busy = $state(false);
  /** What the record refused, by question, said on its card. */
  fixes = $state.raw(new Map<string, string>());

  #base: () => string;
  #reread: () => Promise<void>;
  #toasts: Pick<typeof toasts, 'push'>;

  constructor(deps: { base: () => string; reread: () => Promise<void>; toasts: Pick<typeof toasts, 'push'> }) {
    this.#base = deps.base;
    this.#reread = deps.reread;
    this.#toasts = deps.toasts;
  }

  has(id: string): boolean {
    return this.chosen.has(id);
  }

  toggle(q: QueueQuestion) {
    const next = new Map(this.chosen);
    if (!next.delete(q.id)) next.set(q.id, q);
    this.chosen = next;
  }

  clear() {
    this.chosen = new Map();
    this.reason = '';
  }

  /** What the bar would answer now. */
  get plan() {
    return batchOf([...this.chosen.values()]);
  }

  /**
   * EVERY CHOSEN QUESTION WITH A SUGGESTION, ANSWERED WITH IT, AND ONE REASON FOR ALL, each in turn. One the record
   * refuses keeps its sentence on its card and the rest carry on; the page is read again once all have gone.
   */
  async send() {
    const reason = this.reason.trim();
    const { answers } = this.plan;
    if (this.busy || reason === '' || answers.length === 0) return;
    this.busy = true;
    let done = 0;
    const fixes = new Map(this.fixes);
    try {
      for (const { q, option } of answers) {
        const out = await answerQuestion(this.#base(), q.id, option, reason);
        if (out.from === 'written') {
          fixes.delete(q.id);
          done++;
        } else fixes.set(q.id, out.fix);
      }
    } finally {
      this.busy = false;
    }
    this.fixes = fixes;
    this.clear();
    if (done) this.#toasts.push(copy.decideBatchDone(done), { intent: 'good' });
    await this.#reread();
  }
}
