<!--
  A `document` field: `parse()` segments, drawn as markdown, blocks and degraded fences.

  The read view IS the renderer. There is no separate preview pipeline, so what you are looking at
  is the artefact (22 §8).
-->
<script lang="ts">
  import { parse, type RenderOptions } from '../src/index.ts';
  import Block from './Block.svelte';
  import Markdown from './Markdown.svelte';
  import Degraded from './Degraded.svelte';

  let {
    src,
    opts = {},
    onfix,
  }: { src: string; opts?: RenderOptions; onfix?: (start: number, end: number) => void } = $props();

  const segments = $derived(parse(src));
</script>

<div class="document">
  {#each segments as segment}
    {#if segment.type === 'block'}
      <Block block={segment} {opts} />
    {:else if segment.type === 'degraded'}
      <Degraded {segment} onfix={onfix ? () => onfix(segment.start, segment.end) : undefined} />
    {:else}
      <Markdown {segment} {opts} />
    {/if}
  {/each}
</div>
