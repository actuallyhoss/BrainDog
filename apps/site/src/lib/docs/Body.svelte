<!--
  One docs page's body, drawn by the product's own renderer from its dialect text.

  THE SAME DRAWERS `lib/app/Page.svelte` USES (`Block`, `Markdown` and `Degraded` from the renderer's
  Svelte half, over the skin's block styles), so a block on a docs page is the block a record draws, and
  a row written wrong degrades to its fence here as it would there. It is not `Page.svelte` itself for two
  reasons: a docs page is one column of reading, where Page lays blocks on twelve, and its `##` headings
  need anchors for the contents list, which the renderer's prose does not give. So `partsOf` cuts the
  headings out of the prose and this file draws them with their ids.

  Nothing here is interactive: a board or a task list on a docs page is drawn read-only, which is what
  the renderer draws when it is handed no callback.
-->
<script lang="ts">
  import '@braindog/skin/blocks.css';
  import '@braindog/skin/blocks-charts.css';
  import { inline } from 'braindog-render';
  import { Block, Degraded, Markdown, Text } from 'braindog-render/svelte';
  import { bodyOf, partsOf } from './pages.ts';

  let { src }: { src: string } = $props();

  const parts = $derived(partsOf(bodyOf(src)).parts);
</script>

<div class="document doc-body">
  {#each parts as part, at (at)}
    {#if part.t === 'heading'}
      <h2 class="doc-h" id={part.id}><Text nodes={inline(part.text)} /></h2>
    {:else if part.segment.type === 'markdown'}
      <Markdown segment={part.segment} />
    {:else if part.segment.type === 'degraded'}
      <Degraded segment={part.segment} />
    {:else}
      <Block block={part.segment} />
    {/if}
  {/each}
</div>

<style>
  /* THE SITE'S BODY STEP, not the app's: the skin sets prose at the app's dense size, and a page that
     is read from top to bottom wants the site's reading size and more air between lines. */
  .doc-body {
    min-inline-size: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
    line-height: 1.65;
  }

  /* A heading a reader jumps to lands below the site's sticky bar rather than under it. */
  .doc-h {
    margin-block: var(--sp-7) var(--sp-3);
    color: var(--ink);
    font-size: var(--t-site-h3);
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.015em;
    scroll-margin-block-start: calc(var(--sp-8) + var(--sp-4));
  }

  .doc-h:first-child {
    margin-block-start: 0;
  }

  .doc-body :global(h3) {
    margin-block: var(--sp-5) var(--sp-2);
    color: var(--ink);
    font-size: var(--t-md);
  }

  /* The renderer's figures sit in the reading column with the same air as a paragraph break. */
  .doc-body :global(.block) {
    margin-block: var(--sp-5);
  }
</style>
