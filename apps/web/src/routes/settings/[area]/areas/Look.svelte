<!--
  Settings > Look: the two sheets the product's look is judged by (EXP-C01), and the design book beside them (DIRECTION §45).

  "Controls and rows" and "Charts and marks", each drawn by the product's own parts from the record this is opened on.
  Any record opens them. A sheet is looked at by a person and said yes to once; a later build is judged beside the
  photograph of the one that was approved. This area draws the sheets and keeps no answer: the yes is written by the
  board kit, not here.

  ONE SHEET AT A TIME, CHOSEN IN THE ADDRESS. `#charts` is the second sheet and anything else the first, so each has an
  address a person can send and the photographer can open, and the choice survives a reload. The address is rewritten
  in place: choosing a sheet is not a step to go back over.

  THE WORDS ARE IN HERE, with the area. `copies.ts` holds the copy of the areas that came before it.
-->
<script lang="ts">
  import SheetCharts from '$lib/design/SheetCharts.svelte';
  import DesignBook from '$lib/design/DesignBook.svelte';
  import SheetControls from '$lib/design/SheetControls.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';

  /* EVERY AREA TAKES THE SAME PROPS. The charts sheet reads the record's pages through the shell; the controls sheet reads nothing. */
  let props: AreaProps = $props();

  const SHEETS = ['controls', 'charts', 'design'] as const;
  type Sheet = (typeof SHEETS)[number];

  const words = {
    lead: 'Every control and every chart, drawn by the product itself from what this record holds.',
    which: 'Which sheet',
    controls: 'Controls and rows',
    charts: 'Charts and marks',
    design: 'Design book',
  } as const;

  const named = (): Sheet => (location.hash === '#charts' ? 'charts' : location.hash === '#design' ? 'design' : 'controls');
  let sheet = $state<Sheet>(named());

  function choose(next: Sheet): void {
    sheet = next;
    history.replaceState(history.state, '', `${location.pathname}${location.search}${next === 'controls' ? '' : `#${next}`}`);
  }
</script>

<!-- A LINK SOMEBODY FOLLOWS WHILE THE AREA IS OPEN changes the hash and loads nothing, so the sheet follows it here. -->
<svelte:window onhashchange={() => (sheet = named())} />

<div class="look">
  <p class="look-lead">{words.lead}</p>
  <Segmented class="look-which" role="group" aria-label={words.which}>
    {#each SHEETS as s (s)}
      <button type="button" class="segment" aria-pressed={sheet === s} data-on={sheet === s ? '' : undefined} onclick={() => choose(s)}>{words[s]}</button>
    {/each}
  </Segmented>

  {#if sheet === 'charts'}
    <SheetCharts shell={props.shell} />
  {:else if sheet === 'design'}
    <DesignBook />
  {:else}
    <SheetControls />
  {/if}
</div>

<style>
  /* THE WHOLE WIDTH OF THE AREA, which is the page's: the sheets lay their own tiles out in it. */
  .look {
    display: grid;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* The one headline sentence under the page's name. */
  .look-lead {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.4;
  }

  /* The track is `Segmented`'s own element, so the rule reaches it by this area's name for it. */
  .look :global(.look-which) {
    justify-self: start;
  }
</style>
