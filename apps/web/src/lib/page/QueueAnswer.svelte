<!--
  One question from a `queue` block, answered where it is shown: on Home, Money, Work, a project's page, the Agents page
  and Decide, a press on an option is the answer, and nobody is sent to Decide.

  THE CARD IS THE ONE DECISION CARD (`lib/decide/DecisionCard.svelte`, DIRECTION §37): why first, who asked with the app
  and the run, what it moves, the suggestion as an outline with a small dot, and one press with Undo. This is the row it
  sits in on a page: a row of the page by the question's id, so a home's cursor walks to it, its number keys press the
  card's own buttons (`PageBody.svelte`), and Enter opens it on Decide.

  COMPACT OUTSIDE DECIDE (`compact`): Home and a declared page show the question and its answers as buttons only, and
  at most three of them (`queue-answer.ts` `compactOf`), then "N more on Decide". Decide draws the whole form.

  A READER WHO MAY NOT ANSWER READS THE SAME CARD WITH THE OPTIONS AS WORDS, which is the renderer's rule: a control
  that cannot act is absent, not greyed (`19 §6`).
-->
<script lang="ts">
  import type { QueueQuestion } from '@braindog/kernel';
  import { at } from '$lib/at.ts';
  import DecisionCard from '$lib/decide/DecisionCard.svelte';
  import type { Picked } from './picked.svelte.ts';

  let {
    question,
    onanswered,
    pick = null,
    lead = false,
    n = 0,
    compact = false,
  }: {
    question: QueueQuestion;
    onanswered: () => void;
    /** The page's choice of questions to answer at once: the card leads with its box only where a page holds one. */
    pick?: Picked | null;
    /** The queue's lead question, drawn whole: what accepting it does, and what it would put on the screen. */
    lead?: boolean;
    /** Where the card sits in its queue, which decides whether it says each option's reason in the open. */
    n?: number;
    /** A question shown outside Decide: its line and its answers as buttons, nothing else (`DecisionCard.svelte`). */
    compact?: boolean;
  } = $props();
</script>

<!-- A ROW OF THE PAGE, by the question's id, so a home's cursor walks to it and Enter opens it on Decide. -->
<div
  class="qa"
  data-row="q:{question.id}"
  data-open={at(`/decide/${encodeURIComponent(question.id)}`)}
  data-picking={pick && pick.chosen.size > 0 && !compact ? '' : undefined}
>
  <DecisionCard {question} {onanswered} pick={compact ? null : pick} lead={lead && !compact} {n} {compact} />
</div>

<style>
  /* THE CARD IS ITS OWN CONTAINER, so it answers the width of the slot it sits in, as a queue block does. */
  .qa {
    container-type: inline-size;
  }
</style>
