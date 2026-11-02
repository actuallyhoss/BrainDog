<!--
  RECENT OR A TO Z, for a list of people in groups: two quiet words in the list's toolbar, the one in use in ink on the
  tile's tint. It stood on a row of its own under the toolbar, whose start was empty on People, so the list opened on
  two rows of controls (pages polish, 2 Nov). One choice with the phone's "⋯" Sort (`people-order.svelte.ts`), where a
  phone keeps it, so below 640 it is not drawn.
-->
<script lang="ts">
  import { seenWords } from '../folk.ts';
  import { peopleOrder, setPeopleOrder } from './people-order.svelte.ts';

  const order = $derived(peopleOrder.value);
</script>

<div class="order" role="group" aria-label={seenWords.orderBy}>
  <button type="button" class="tap" aria-pressed={order === 'recent'} onclick={() => setPeopleOrder('recent')}>{seenWords.recent}</button>
  <button type="button" class="tap" aria-pressed={order === 'az'} onclick={() => setPeopleOrder('az')}>{seenWords.az}</button>
</div>

<style>
  .order {
    display: inline-flex;
    flex: none;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-pop);
    background: var(--tile-2);
  }
  .order button {
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    border: 0;
    border-radius: calc(var(--r-pop) - 2px);
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }
  .order button[aria-pressed='true'] {
    background: var(--tile);
    color: var(--ink);
    font-weight: var(--fw-medium);
    box-shadow: 0 0 0 1px var(--rule);
  }
  @media (pointer: coarse) {
    .order button {
      min-block-size: var(--tap);
    }
  }
  @media (width < 640px) {
    .order {
      display: none;
    }
  }
</style>
