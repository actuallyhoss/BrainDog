<!--
  One open question on Today's classic list (`/?classic`), answered where it is shown: the 32px well with the Decide glyph
  in the list's lead column, and beside it the one decision card (`lib/decide/DecisionCard.svelte`, DIRECTION §37), the
  same card every page and Decide draw: why first, who asked, what it moves, the suggestion as an outline with a small
  dot, and one press with Undo.

  THE NUMBER KEYS ARE TODAY'S: with the keyboard's cursor on this row, 1 to 9 press the option (`choose`), so the cap on
  each pill is the key that does it. The question is the door to its own page, since Today has no other.

  A READER WHO MAY NOT ANSWER READS THE OPTIONS AS WORDS, and the question still opens on Decide.
-->
<script lang="ts">
  import type { QueueQuestion } from '@braindog/kernel';
  import DecisionCard from '$lib/decide/DecisionCard.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';

  let { question, onanswered }: { question: QueueQuestion; now?: number; onanswered: () => void } = $props();

  let card = $state<ReturnType<typeof DecisionCard> | null>(null);

  /** The option at `i` (from 0), as its number key presses it; a reader who may not answer presses nothing. */
  export function choose(i: number): boolean {
    return card?.choose(i) ?? false;
  }
</script>

<div class="q">
  <span class="line-mark"><IconWell name="decide" size="l" /></span>
  <div class="q-card">
    <DecisionCard bind:this={card} {question} {onanswered} keys link />
  </div>
</div>

<style>
  /* THE ROW: the 32px well in the lead column, then the card, 12 in from the wash's edge. */
  .q {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: start;
    padding: var(--sp-3);
    border-radius: var(--r-md);
  }

  .line-mark {
    display: grid;
    place-items: center;
  }

  /* THE CARD ANSWERS THE WIDTH IT IS GIVEN, and sits on the row with no hairline or air of its own above it. */
  .q-card {
    min-inline-size: 0;
    container-type: inline-size;
  }

  .q-card > :global(.queue-card) {
    padding-block: 0;
    border-block-start: 0;
  }
</style>
