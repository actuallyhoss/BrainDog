<!--
  A use case drawn small: the rail its pages make and the headings of its Home, read from its declarations (`previewOf`),
  and the lists it adds. The same drawing on a browse card and on the use case's own page.
-->
<script lang="ts">
  import type { Preview } from '@braindog/seed/usecases/share';
  import { copy } from '$lib/copy.ts';
  import { VOICE_LINES } from '$lib/voice.ts';
  import Icon from '$lib/ui/Icon.svelte';

  let { preview, large = false }: { preview: Preview; large?: boolean } = $props();
</script>

<div class="preview" data-large={large ? '' : undefined} aria-hidden="true">
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
  .preview {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: var(--sp-3);
    margin-block: var(--sp-2);
    padding: var(--sp-3);
    border-radius: var(--r-lg);
    background: var(--s1);
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
    gap: 5px;
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

  .mini-block {
    padding: var(--sp-1) var(--sp-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-sm);
    background: var(--bg);
    color: var(--ink2);
  }

  .mini-empty,
  .mini-lists {
    color: var(--dim);
  }

  .preview[data-large] {
    gap: var(--sp-5);
    padding: var(--sp-4);
    font-size: var(--t-sm);
  }
</style>
