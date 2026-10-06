<!--
  How the list is drawn, from 640px up: the table, the board or the cards (a segmented control in the
  toolbar). Glass on the ground, and the chosen view a white pill lifted by a tiny shadow (`controls.css`).

  THE CHOICE IS THE ADDRESS'S (`?view=`), written by the page's `setView`, so a link to a board opens on the board and
  Back undoes a switch. The board is offered only where the list has lanes to draw (`laneFieldOf`). Below 640 there is
  no choice to make: a phone draws the list as cards, so the control is not drawn there.

  A SEGMENT IS ITS GLYPH AND ITS WORD, and the word goes below 900 where the toolbar is short of room; it stays in the
  button for a screen reader, and the glyph keeps a tooltip.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import type { View } from './list.ts';

  let { view, board, onview }: { view: View; board: boolean; onview: (view: View) => void } = $props();

  /* This part's own words. */
  const words = { group: 'Show the list as', table: 'Table', board: 'Board', cards: 'Cards' } as const;

  const views = $derived(
    (
      [
        ['table', 'rows'],
        ['board', 'board'],
        ['cards', 'grid'],
      ] as const satisfies readonly (readonly [View, IconName])[]
    ).filter(([v]) => v !== 'board' || board),
  );
</script>

<div class="segmented view-switch" role="group" aria-label={words.group}>
  {#each views as [v, glyph] (v)}
    <button
      type="button"
      class="segment view-seg"
      data-on={view === v ? '' : undefined}
      aria-pressed={view === v ? 'true' : 'false'}
      title={words[v]}
      onclick={() => {
        if (view !== v) onview(v);
      }}
    >
      <Icon name={glyph} size="s" /><span class="view-word">{words[v]}</span>
    </button>
  {/each}
</div>

<style>
  /* 36 HIGH ON THE TOOLBAR'S LINE: the track is `--ctl-h` and each segment sits 3px inside it. The word is
     the meta size the blend draws its segments at. */
  .view-switch {
    flex-wrap: nowrap;
    flex: none;
  }

  .view-seg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-inline: var(--sp-3);
    font-size: var(--t-sm);
  }

  /* IN THE COMPACT BAR THE TRACK DROPS ITS OWN GLASS, because the bar is glass already and glass never holds glass. */
  :global(.head[data-under]) .view-switch {
    background: var(--hover-wash);
    backdrop-filter: none;
    box-shadow: none;
  }

  /* Safari before 18 knows the blur only by its prefixed name, and lightningcss folds a same-rule pair into one. */
  @supports (-webkit-backdrop-filter: none) {
    :global(.head[data-under]) .view-switch {
      -webkit-backdrop-filter: none;
    }
  }

  @media (width < 900px) {
    .view-seg {
      padding-inline: var(--sp-2);
    }

    .view-word {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  /* A PHONE DRAWS CARDS, so there is nothing here to choose. */
  @media (width < 640px) {
    .view-switch {
      display: none;
    }
  }
</style>
