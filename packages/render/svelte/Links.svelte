<!--
  `link`: a list of addresses, each titled, with the host it leaves for under the title and a note after
  (`src/links.ts`). `links` in `src/html.ts` is this file's twin, and `src/parity.test.ts` holds the two to one tree.

  ON THE LIST'S OWN CLASSES, so a host that draws a `todo` draws a list of links as a list before it has a rule for one.
  The title is the anchor's words as plain text, because a title written as a link of its own would be an anchor
  inside an anchor. Nothing is fetched: no favicon, no preview, only the host read off the address.

  A ROW'S FOURTH CELL IS A GLYPH'S NAME, drawn in a well before the title and hidden, because the title says what the
  row is; a row with a well that stays in this BrainDog ends in a chevron, as a settings row does.
-->
<script lang="ts">
  import { MISSING, hrefFor, inline, text, type Block, type RenderOptions } from '../src/index.ts';
  import { glyphPath } from '../src/inline.ts';
  import { LINKS_NONE, linkPlan } from '../src/links.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const lines = $derived(linkPlan(block.rows, opts));
</script>

<!-- A GLYPH AS `glyphSvg` IN `src/html.ts` DRAWS ONE: one 24 box, stroked in the words' colour. -->
{#snippet art(d: string)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
    ><path {d}></path></svg
  >{/snippet}

{#if lines.length === 0}
  <p class="links-empty">{LINKS_NONE}</p>
{:else}
  <ul class="list" data-kind="link">
    {#each lines as l}
      {@const words = text(inline(l.title, opts)) || MISSING}
      {@const d = l.icon ? glyphPath(l.icon, opts) : null}
      {@const chevron = l.icon && l.inApp ? glyphPath('chevron-right', opts) : null}
      <li class="item"
        >{#if l.icon}<span class="link-well" aria-hidden="true">{#if d}{@render art(d)}{/if}</span>{/if}{#if l.href}<a class="item-title" href={hrefFor(opts, l.href)} rel={l.away ? 'noreferrer' : undefined}>{words}</a
          >{:else}<span class="item-title">{words}</span>{/if}{#if l.host}<span class="item-detail link-host">{l.host}</span
          >{/if}{#if l.note}<span class="item-meta link-note"><Text nodes={inline(l.note, opts)} {opts} /></span>{/if}{#if chevron}<span
            class="link-chevron"
            aria-hidden="true">{@render art(chevron)}</span
          >{/if}</li
      >
    {/each}
  </ul>
{/if}
