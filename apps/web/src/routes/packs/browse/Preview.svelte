<!--
  A use case drawn small: the rail its pages make and the headings of its Home, read from its declarations (`previewOf`),
  and the lists it adds.

  ON A CARD IT IS A THUMBNAIL OF THE HOME IT INSTALLS, and nothing else: a rail beside it left the Home a column too
  narrow for its own headings at every card width (design.md §2.8). The large drawing, on the use case's own page and
  on share, keeps the rail beside the Home. Either way it is one surface: the card's well, or this drawing's own when
  large, with the Home's blocks as lines under hairlines and never a box inside it.
-->
<script lang="ts">
  import type { Preview } from '@braindog/seed/usecases/share';
  import { copy } from '$lib/copy.ts';
  import { VOICE_LINES } from '$lib/voice.ts';
  import Icon from '$lib/ui/Icon.svelte';

  let { preview, large = false }: { preview: Preview; large?: boolean } = $props();
</script>

<div class="preview" data-large={large ? '' : undefined} aria-hidden="true">
  {#if large}
  <div class="mini-rail">
    <span class="mini-h">{copy.browseRail}</span>
    <span class="mini-item"><Icon name="home" size="s" />{preview.spine.home ?? copy.home}</span>
    <span class="mini-item"><Icon name="decide" size="s" />{preview.spine.decide ?? copy.decide}</span>
    {#each preview.rail as section (section.section)}
      <span class="mini-section">{section.section}</span>
      {#each section.pages as title (title)}<span class="mini-item"><Icon name="doc" size="s" />{title}</span>{/each}
    {/each}
    {#if preview.rail.length === 0}<span class="mini-empty">{copy.browseNoRail}</span>{/if}
  </div>
  {/if}
  <div class="mini-home">
    <span class="mini-h">{copy.browseHome}</span>
    <span class="mini-title">{preview.spine.home ?? copy.home}</span>
    {#each preview.home as heading, i (i)}
      <span class="mini-block">{'voice' in heading ? (heading.text ?? VOICE_LINES[heading.voice]) : heading.text}</span>
    {/each}
    {#if preview.home.length === 0}<span class="mini-empty">{copy.browseHouseHome}</span>{/if}
    {#if preview.lists.length > 0}
      <span class="mini-h lists-h">{copy.browseLists}</span>
      <span class="mini-lists">{preview.lists.join(', ')}</span>
    {/if}
  </div>
</div>

<style>
  /* SMALL, IT HAS NO GROUND OF ITS OWN: the card's well is the surface it is drawn on. */
  .preview {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    font-size: var(--t-xs);
  }

  .mini-rail,
  .mini-home {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .mini-h {
    color: var(--dim);
    font-weight: 600;
  }

  .lists-h {
    margin-block-start: var(--sp-2);
  }

  .mini-item {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink2);
  }

  .mini-section {
    margin-block-start: var(--sp-1);
    color: var(--dim);
  }

  .mini-title {
    color: var(--ink);
    font-weight: 600;
  }

  /* A BLOCK OF THE HOME AS A LINE UNDER A HAIRLINE, the way a page reads, and never a bordered box inside the drawing. */
  .mini-block {
    overflow: hidden;
    padding-block: var(--sp-1);
    border-block-start: 1px solid var(--line-soft);
    color: var(--ink2);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mini-empty,
  .mini-lists {
    color: var(--dim);
  }

  /* LARGE, IT IS A SURFACE OF ITS OWN (nothing holds it), with the rail beside the Home from 640px and above it on a
     phone, where two columns would halve each. */
  .preview[data-large] {
    gap: var(--sp-5);
    padding: var(--sp-4);
    border-radius: var(--r-md);
    background: var(--sunk);
    font-size: var(--t-sm);
  }

  @media (width >= 640px) {
    .preview[data-large] {
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    }
  }
</style>
