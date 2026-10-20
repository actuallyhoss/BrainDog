<!--
  The one line over every screen while the record is seen as somebody (sharing plan §3.3): "Seeing as Priya. Nothing
  you do here counts. Exit." Exit loads the page again as yourself (`see-as.svelte.ts`).

  IN THE FLOW, as `LapseBanner.svelte` is, so it never covers the phone's tab bar and pushes the screen down rather than
  sitting over it.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { exitSeeAs, seeingAs } from './see-as.svelte.ts';

  const as = seeingAs();
</script>

{#if as}
  <div class="see-as" role="status">
    <p class="see-as-text"><span class="see-as-glyph"><Icon name="eye" size="s" /></span><span>{copy.seeAsBanner(as.name)}</span></p>
    <Button weight="primary" onclick={() => exitSeeAs()}>{copy.seeAsExit}</Button>
  </div>
{/if}

<style>
  .see-as {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-3);
    margin: var(--inset) var(--gutter) 0;
    padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-5);
    border-radius: var(--r-lg);
    background: var(--bg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .see-as-text {
    display: flex;
    flex: 1 1 24ch;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .see-as-glyph {
    flex: none;
    color: var(--ink2);
  }

  .see-as :global(.btn) {
    min-block-size: var(--tap);
  }
</style>
