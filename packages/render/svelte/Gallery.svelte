<!--
  `gallery`: a tile a row, the picture where the host serves the file and the file's name where it is not a picture,
  with the caption under either (`src/gallery.ts`). `gallery` in `src/html.ts` is this file's twin, and
  `src/parity.test.ts` holds the two to one tree.

  The host lays the tiles out (`repeat(auto-fill, minmax(10rem, 1fr))`, two columns in a narrow container, each picture
  cut to 4:3), so nothing here counts columns. A picture has no text of its own: the caption beside it is its name.
-->
<script lang="ts">
  import { WORKING_GLYPH, WORKING_LABEL, hrefFor, inline, takeWorking, type Block, type RenderOptions } from '../src/index.ts';
  import { GALLERY_NONE, galleryPlan } from '../src/gallery.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const tiles = $derived(galleryPlan(block.rows, opts.file));
</script>

{#if tiles.length === 0}
  <p class="gallery-empty">{GALLERY_NONE}</p>
{:else}
  <ul class="gallery">
    {#each tiles as t}
      {@const caption = takeWorking(t.caption)}
      <li class="gallery-item"
        >{#if t.src}<img class="gallery-picture" src={hrefFor(opts, t.src)} alt="" loading="lazy" />{/if}{#if t.name}<span class="gallery-file"
            >{t.name}</span
          >{/if}{#if t.caption}<span class="gallery-caption"
            >{#if caption.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text
              nodes={inline(caption.text ?? '', opts)}
              {opts}
            /></span
          >{/if}</li
      >
    {/each}
  </ul>
{/if}
