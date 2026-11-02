<!--
  One docs page's body, drawn by the product's own renderer from its dialect text, on one sheet.

  THE SAME DRAWERS `lib/app/Page.svelte` USES (`Block`, `Markdown` and `Degraded` from the renderer's Svelte half, over
  the skin's block styles), so a block on a docs page is the block a record draws, and a row written wrong degrades to
  its fence here as it would there. It is not `Page.svelte` itself for two reasons: a docs page is one column of
  reading, where Page lays blocks on twelve, and its `##` headings need anchors for the contents list, which the
  renderer's prose does not give. So `partsOf` cuts the headings out of the prose and this file draws them with ids.

  ONE SHEET, one of the app's tiles, read at 68ch: `head` first, which the page fills with the
  ways to take it as text, then the opening and each `##` part in turn, a heading with its anchor and no tile round it.

  Nothing here is interactive: a board or a task list on a docs page is drawn read-only, which is what the renderer
  draws when it is handed no callback. BUT A CODE BLOCK CAN BE COPIED (plan F25): once the script runs each one gains a
  Copy button at its top corner, which says Copied only when the browser did; with scripting off the code is there to
  select, as before.
-->
<script lang="ts">
  import '@braindog/skin/blocks.css';
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  import type { Snippet } from 'svelte';
  import { inline } from 'braindog-render';
  import { Block, Degraded, Markdown, Text } from 'braindog-render/svelte';
  import { tick } from 'svelte';
  import { bodyOf, partsOf, type Part } from './pages.ts';
  import { docsWords } from './words.ts';

  let { src, head }: { src: string; head?: Snippet } = $props();

  let sheet: HTMLElement | undefined = $state();

  /* EACH CODE BLOCK'S COPY BUTTON, added once the page has drawn and again when it draws another page. */
  $effect(() => {
    void src;
    const box = sheet;
    if (!box) return;
    void tick().then(() => {
      for (const pre of box.querySelectorAll<HTMLPreElement>('pre:not([data-copies])')) {
        pre.dataset.copies = '';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'code-copy';
        b.textContent = docsWords.codeCopy;
        b.setAttribute('aria-label', docsWords.codeLabel);
        b.addEventListener('click', async () => {
          const text = (pre.querySelector('code') ?? pre).textContent ?? '';
          try {
            await navigator.clipboard.writeText(text.replace(/\n$/u, ''));
            b.textContent = docsWords.codeCopied;
            setTimeout(() => (b.textContent = docsWords.codeCopy), 1600);
          } catch {
            b.textContent = docsWords.codeCopy;
          }
        });
        pre.prepend(b);
      }
    });
  });

  type Group = { heading: { id: string; text: string } | null; parts: Part[] };

  /* THE PARTS IN ORDER: the opening first, then one group for each `##` heading and what follows it. */
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

<div class="tile doc-body" bind:this={sheet}>
  {#if head}<div class="doc-head">{@render head()}</div>{/if}
  {#each groups as group, g (g)}
    {#if group.heading}
      <section class="doc-part" aria-labelledby={group.heading.id}>
        <h2 class="doc-h" id={group.heading.id}><Text nodes={inline(group.heading.text)} /></h2>
        <div class="document doc-text">{@render drawn(group.parts)}</div>
      </section>
    {:else if group.parts.length > 0}
      <div class="document doc-text">{@render drawn(group.parts)}</div>
    {/if}
  {/each}
</div>

<style>
  /* THE SHEET: one of the app's tiles, radius 16, no edge and no shadow, on the board the page lays it on. */
  .doc-body {
    display: grid;
    gap: var(--sp-6);
    min-inline-size: 0;
    padding: clamp(20px, 2vw + 12px, 44px) clamp(20px, 2.4vw + 12px, 48px) clamp(28px, 2vw + 16px, 52px);
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  .doc-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .doc-part {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE SITE'S READING TEXT, 17/28 in the second ink, at a measure a line can be read in. */
  .doc-text {
    max-inline-size: 68ch;
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
  }

  /* A THUMB'S TARGET WITHOUT MOVING A LINE: 13px above and below takes a 19px link past 44, and the negative margin
     gives it back, so the words sit where they did and the press lands on a 44px box. */
  @media (pointer: coarse) {
    .doc-text :global(a) {
      padding-block: 13px;
      margin-block: -13px;
    }
  }

  /* A part's heading in Lexend, set tight; a heading a reader jumps to keeps a little air above it. */
  .doc-h {
    max-inline-size: 34ch;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-site-21);
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.025em;
    text-wrap: balance;
    scroll-margin-block-start: 24px;
  }

  .doc-text :global(h3) {
    margin-block: var(--sp-5) var(--sp-2);
    color: var(--ink);
    font-size: var(--t-site-18);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .doc-text :global(a) {
    color: var(--red);
    text-underline-offset: 3px;
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

  /* A doc's tables are a few rows, so they draw at once: the skin's `content-visibility: auto` left them blank to a
     reader that does not scroll, a full-page capture and a printout. */
  .doc-text :global(.rowgroup) {
    content-visibility: visible;
  }

  /* And a cell wraps rather than cutting its words off: the reading column is too narrow for three whole lines. */
  .doc-text :global(.rowgroup .td) {
    padding-block: 8px;
    line-height: 1.45;
    white-space: normal;
  }

  /* CODE SITS IN A WELL OF THE TILE'S SECOND FILL, and a long line scrolls inside it, never the page. */
  .doc-text :global(pre) {
    position: relative;
    max-inline-size: 100%;
    overflow-x: auto;
    padding: var(--sp-4);
    background: var(--tile-2);
    border: 0;
    border-radius: 8px;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--t-site-14-5);
    line-height: 1.6;
  }

  /* ITS COPY BUTTON at the well's top corner, quiet until pointed at; the code keeps room for it on its first line. */
  .doc-text :global(pre[data-copies]) {
    padding-inline-end: 80px;
  }

  .doc-text :global(.code-copy) {
    position: absolute;
    inset-block-start: 8px;
    inset-inline-end: 8px;
    min-block-size: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink-2);
    font: 500 var(--t-site-13) / 1 var(--font-ui);
    cursor: pointer;
  }

  .doc-text :global(.code-copy:hover) {
    color: var(--ink);
  }

  @media (pointer: coarse) {
    .doc-text :global(.code-copy) {
      min-block-size: var(--tap);
      inset-block-start: 4px;
      inset-inline-end: 4px;
    }
  }

  .doc-text :global(:not(pre) > code) {
    padding: 1px 5px;
    background: var(--tile-2);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: 0.88em;
  }

  @media (max-width: 760px) {
    .doc-body {
      gap: var(--sp-5);
    }
  }
</style>
