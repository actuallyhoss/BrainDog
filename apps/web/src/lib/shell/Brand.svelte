<!--
  The product's mark and name, top-left on every screen, as the site draws them: the mark in red and the name in the
  display face at 600. A link to Today. `bare` draws the mark alone, for the narrow rail and the phone's bar. Not drawn in the Mac app. The record
  you are in and the others you can open are the face's (`YouMenu.svelte`), top-right.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { PRODUCT } from '../title.ts';
  import Mark from '../ui/Mark.svelte';

  let { bare = false, size = 20 }: { bare?: boolean; size?: number } = $props();
</script>

<a class="brand tap" href={at('/')} aria-label={PRODUCT} data-bare={bare ? '' : undefined}>
  <Mark height={size} />
  {#if !bare}<span class="brand-word" aria-hidden="true">{PRODUCT}</span>{/if}
</a>

<style>
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    min-block-size: 36px;
    padding-inline: var(--sp-1) var(--sp-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    text-decoration: none;
  }

  /* NOT IN THE MAC APP (Sam, 4 Nov): the head there holds the traffic lights and the sidebar's button, and Today has its own row. */
  :global(:root[data-shell='mac']) .brand {
    display: none;
  }

  .brand[data-bare] {
    justify-content: center;
    inline-size: 40px;
    block-size: 40px;
    padding: 0;
  }

  .brand-word {
    font-family: var(--font-display);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
</style>
