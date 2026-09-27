<!--
  `link`: a list of addresses, each titled, with the host it leaves for under the title and a note after
  (`src/links.ts`). `links` in `src/html.ts` is this file's twin, and `src/parity.test.ts` holds the two to one tree.

  ON THE LIST'S OWN CLASSES, so a host that draws a `todo` draws a list of links as a list before it has a rule for one.
  The title is the anchor's words as plain text, because a title written as a link of its own would be an anchor
  inside an anchor. Nothing is fetched: no favicon, no preview, only the host read off the address.
-->
<script lang="ts">
  import { MISSING, hrefFor, inline, text, type Block, type RenderOptions } from '../src/index.ts';
  import { LINKS_NONE, linkPlan } from '../src/links.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const lines = $derived(linkPlan(block.rows));
</script>

{#if lines.length === 0}
  <p class="links-empty">{LINKS_NONE}</p>
{:else}
  <ul class="list" data-kind="link">
    {#each lines as l}
      {@const words = text(inline(l.title, opts)) || MISSING}
      <li class="item"
        >{#if l.href}<a class="item-title" href={hrefFor(opts, l.href)} rel={l.away ? 'noreferrer' : undefined}>{words}</a
          >{:else}<span class="item-title">{words}</span>{/if}{#if l.host}<span class="item-detail link-host">{l.host}</span
          >{/if}{#if l.note}<span class="item-meta link-note"><Text nodes={inline(l.note, opts)} {opts} /></span>{/if}</li
      >
    {/each}
  </ul>
{/if}
