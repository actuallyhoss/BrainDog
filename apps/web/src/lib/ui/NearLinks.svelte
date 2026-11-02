<!--
  The few places nearest to an address that led nowhere, as links (`record/nearest.ts`), drawn among a not-found
  screen's actions and before its buttons: a line of their own, the likeliest first, each a press away.

  IN PLACE OF THE WHOLE INDEX. `/p/nope` read thirty-eight addresses aloud in one sentence and `/r/nope` drew thirty
  chips; nothing in the sentence could be pressed and nothing in the chips said which was likeliest.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import type { Place } from '../record/nearest.ts';

  let {
    places,
    said,
  }: {
    /** The nearest places, already chosen and in order. */
    places: readonly Place[];
    /** The line over them, which names the list for a screen reader too. */
    said: string;
  } = $props();
</script>

{#if places.length > 0}
  <nav class="near" aria-label={said}>
    <p class="near-said" aria-hidden="true">{said}</p>
    <ul class="near-list">
      {#each places as p (p.href)}<li><a class="near-link tap" href={at(p.href)}>{p.title}</a></li>{/each}
    </ul>
  </nav>
{/if}

<style>
  /* A LINE OF ITS OWN IN THE ACTIONS' ROW, over the buttons. */
  .near {
    display: flex;
    flex-basis: 100%;
    flex-direction: column;
    gap: var(--sp-1);
    margin-block-end: var(--sp-2);
  }

  .near-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .near-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: var(--row-justify, flex-start);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* THE HOUSE LINK: the ink, a quiet underline, red when pointed at. */
  .near-link {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  @media (hover: hover) and (pointer: fine) {
    .near-link:hover {
      color: var(--red);
      text-decoration-color: currentColor;
    }
  }
</style>
