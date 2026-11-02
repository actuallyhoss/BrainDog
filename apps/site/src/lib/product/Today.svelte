<!--
  Maya's Today, as the app draws it on 1 November: the greeting, then a board of tiles, Needs you and Cash ahead
  first, Working now and Numbers under them. Inside `Window.svelte` it is the hero's picture of the product; every
  figure is `demo/maya.ts`'s and every word of the app's own is `copy/product.ts`'s.

  THE GREETING IS THE VISITOR'S OWN HOUR once the page runs (the app's `greetingOf`); the prerendered page says the
  morning's.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { FOUNDER } from '../demo/maya.ts';
  import { today as w } from '../copy/product.ts';
  import CashTile from './CashTile.svelte';
  import NeedsTile from './NeedsTile.svelte';
  import NumbersTile from './NumbersTile.svelte';
  import WorkingTile from './WorkingTile.svelte';

  let hour = $state(9);
  onMount(() => void (hour = new Date().getHours()));
</script>

<h2 class="greet">{w.greet(hour, FOUNDER.short)}</h2>
<div class="board">
  <div class="a"><NeedsTile /></div>
  <div class="b"><CashTile /></div>
  <div class="c"><WorkingTile /></div>
  <div class="d"><NumbersTile /></div>
</div>

<style>
  /* THE GREETING IS TODAY'S HEADING, as in the app, so the tiles' names sit under it in the outline. */
  .greet {
    margin: 0 0 14px;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: 500;
    line-height: 24px;
    letter-spacing: 0;
  }

  /* THE BOARD: twelve columns a tile gap apart, Needs you the widest, as the app lays Today out at this width. */
  .board {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--tile-gap);
    align-items: stretch;
  }

  .board > div {
    display: grid;
    min-inline-size: 0;
  }

  .a {
    grid-column: span 7;
  }

  .b {
    grid-column: span 5;
  }

  .c {
    grid-column: span 5;
  }

  .d {
    grid-column: span 7;
  }

  .board > div > :global(.tile) {
    block-size: 100%;
  }

  @container desk (width < 760px) {
    .board > div {
      grid-column: span 12;
    }
  }
</style>
