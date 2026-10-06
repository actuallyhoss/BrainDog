<!--
  The one next action under a page's headline, as the engine's look names it (`look.ts` `nextOf`): a line in the
  page's own words with an arrow, and nothing else.

  ONE QUIET ACTION, NOT A BUTTON ROW (DIRECTION §37: fewer things on screen). The headline says what is true; this says
  the one thing to do about it, in ink one step down from the headline's, so the eye meets the sentence first.

  A ROW OF THE RECORD OPENS BESIDE THE PAGE, in the docked panel, as every row on the page does; one the page does not
  hold opens at its own address. A next action the record names no row for is the line alone, since a control that goes
  nowhere is worse than none.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import type { RowAt } from './row-verbs.ts';
  import type { RowHost } from './row-host.svelte.ts';
  import { words } from './words.ts';

  let { next, host = null }: { next: { text: string; row: RowAt | null; href: string | null }; host?: RowHost | null } = $props();

  function open(e: MouseEvent) {
    /* A KEY HELD WITH THE PRESS IS THE BROWSER'S: a new tab, a new window. */
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (host && next.row && host.open(next.row)) e.preventDefault();
  }
</script>

<div class="next" role="group" aria-label={words.next}>
  {#if next.href}
    <a class="next-act" href={at(next.href)} onclick={open}><span class="next-said">{next.text}</span><Icon name="arrow" size="s" /></a>
  {:else}
    <p class="next-said next-line">{next.text}</p>
  {/if}
</div>

<style>
  /* THE WHOLE ROW, straight under the headline and before what narrows the page. */
  .next {
    grid-column: 1 / -1;
    min-inline-size: 0;
    margin-block-start: calc(-1 * var(--sp-2));
  }

  .next-act {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    max-inline-size: 100%;
    min-block-size: var(--ctl-h);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-decoration: none;
    transition: color var(--d-state) var(--ease-out);
  }

  .next-said {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .next-line {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
  }

  /* THE ARROW MOVES A STEP ON HOVER, so the line reads as a way somewhere before it is pressed. */
  .next-act :global(svg) {
    flex: none;
    transition: transform var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .next-act:hover {
      color: var(--ink);
    }

    .next-act:hover .next-said {
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .next-act:hover :global(svg) {
      transform: translateX(2px);
    }
  }

  .next-act:focus-visible {
    color: var(--ink);
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
    border-radius: var(--r-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .next-act,
    .next-act :global(svg) {
      transition: none;
    }
  }
</style>
