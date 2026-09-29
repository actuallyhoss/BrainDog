<!--
  One docs page's body, drawn by the product's own renderer from its dialect text, one tile a part.

  THE SAME DRAWERS `lib/app/Page.svelte` USES (`Block`, `Markdown` and `Degraded` from the renderer's Svelte half, over
  the skin's block styles), so a block on a docs page is the block a record draws, and a row written wrong degrades to
  its fence here as it would there. It is not `Page.svelte` itself for two reasons: a docs page is one column of
  reading, where Page lays blocks on twelve, and its `##` headings need anchors for the contents list, which the
  renderer's prose does not give. So `partsOf` cuts the headings out of the prose and this file draws them with ids.

  EACH `##` STARTS A TILE: the heading row with its glyph in a well, then the part.
  What comes before the first heading is the page's opening, and it goes in the first tile under `head`, which the
  page fills with where the page sits, its title and the ways to take it as text.

  Nothing here is interactive: a board or a task list on a docs page is drawn read-only, which is what the renderer
  draws when it is handed no callback.
-->
<script lang="ts">
  import '@braindog/skin/blocks.css';
  import '@braindog/skin/blocks-charts.css';
  import type { Snippet } from 'svelte';
  import { inline } from 'braindog-render';
  import { Block, Degraded, Markdown, Text } from 'braindog-render/svelte';
  import Icon from '../Icon.svelte';
  import { bodyOf, partsOf, type Part } from './pages.ts';

  let { src, head }: { src: string; head?: Snippet } = $props();

  type Group = { heading: { id: string; text: string } | null; parts: Part[] };

  /* THE PARTS IN TILES: the opening first, then one group for each `##` heading and what follows it. */
  const groups = $derived.by(() => {
    const out: Group[] = [{ heading: null, parts: [] }];
    for (const part of partsOf(bodyOf(src)).parts) {
      if (part.t === 'heading') out.push({ heading: { id: part.id, text: part.text }, parts: [] });
      else out[out.length - 1]?.parts.push(part);
    }
    return out;
  });
</script>

{#snippet drawn(parts: Part[])}
  {#each parts as part, at (at)}
    {#if part.t === 'segment'}
      {#if part.segment.type === 'markdown'}
        <Markdown segment={part.segment} />
      {:else if part.segment.type === 'degraded'}
        <Degraded segment={part.segment} />
      {:else}
        <Block block={part.segment} />
      {/if}
    {/if}
  {/each}
{/snippet}

<div class="doc-body">
  {#each groups as group, g (g)}
    {#if group.heading}
      <section class="tile lead doc-part" aria-labelledby={group.heading.id}>
        <header class="tile-head">
          <span class="well"><Icon name="file" /></span>
          <h2 class="doc-h" id={group.heading.id}><Text nodes={inline(group.heading.text)} /></h2>
        </header>
        <div class="document doc-text">{@render drawn(group.parts)}</div>
      </section>
    {:else if head || group.parts.length > 0}
      <div class="tile lead doc-part doc-open">
        {@render head?.()}
        {#if group.parts.length > 0}<div class="document doc-text">{@render drawn(group.parts)}</div>{/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .doc-body {
    display: grid;
    gap: var(--inset);
    min-inline-size: 0;
  }

  .doc-part {
    min-inline-size: 0;
  }

  /* THE SITE'S READING TEXT, 17/28 in the second ink, at a measure a line can be read in. */
  .doc-text {
    max-inline-size: 68ch;
    min-inline-size: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
  }

  /* A part's heading at the group step; a heading a reader jumps to lands below the floating bar, not under it. */
  .doc-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
    letter-spacing: -0.01em;
    scroll-margin-block-start: calc(56px + 3 * var(--inset));
  }

  .doc-text :global(h3) {
    margin-block: var(--sp-5) var(--sp-2);
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .doc-text > :global(:first-child) {
    margin-block-start: 0;
  }

  .doc-text > :global(:last-child) {
    margin-block-end: 0;
  }

  /* The renderer's figures sit in the reading column with the same air as a paragraph break. */
  .doc-text :global(.block) {
    margin-block: var(--sp-5);
  }

  /* CODE SITS IN A WELL OF THE TILE'S SECOND FILL, and a long line scrolls inside it, never the page. */
  .doc-text :global(pre) {
    max-inline-size: 100%;
    overflow-x: auto;
    padding: var(--sp-4);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font-size: var(--t-app-sm);
    line-height: 1.6;
  }

  .doc-text :global(:not(pre) > code) {
    padding: 1px 5px;
    background: var(--s1);
    border-radius: var(--r-sm);
    font-size: 0.88em;
  }
</style>
