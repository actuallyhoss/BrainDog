<!--
  The closed markdown subset between fences: ATX headings, paragraphs, flat lists, a rule, and the
  inline spans of Text.svelte. A blockquote, a table, an image or raw HTML is TEXT — one parser, one
  escape function, and no {@html} anywhere in this package (36 §13 D12).

  Everything here is in the `measure` class: about 72 characters. Width is a property of the block
  kind, not of the page (13 §4.1).
-->
<script lang="ts">
  import { inline, type Markdown, type RenderOptions } from '../src/index.ts';
  import Text from './Text.svelte';

  let { segment, opts = {} }: { segment: Markdown; opts?: RenderOptions } = $props();

  type Node =
    | { t: 'h'; level: number; text: string }
    | { t: 'p'; text: string }
    | { t: 'ul'; items: string[] }
    | { t: 'hr' };

  const nodes = $derived.by(() => {
    const out: Node[] = [];
    let bullets: string[] = [];
    const flush = () => {
      if (bullets.length) out.push({ t: 'ul', items: bullets });
      bullets = [];
    };
    for (const raw of segment.text.split('\n')) {
      const line = raw.trim();
      if (line === '') {
        flush();
        continue;
      }
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) {
        flush();
        out.push({ t: 'h', level: h[1]!.length, text: h[2]! });
        continue;
      }
      if (/^([-*_])\1{2,}$/.test(line)) {
        flush();
        out.push({ t: 'hr' });
        continue;
      }
      const li = /^[-*]\s+(.*)$/.exec(line);
      if (li) {
        bullets.push(li[1]!);
        continue;
      }
      flush();
      out.push({ t: 'p', text: line });
    }
    flush();
    return out;
  });
</script>

{#each nodes as node}
  {#if node.t === 'hr'}<hr />
  {:else if node.t === 'ul'}
    <ul class="prose-list measure">
      {#each node.items as item}<li><Text nodes={inline(item, opts)} {opts} /></li>{/each}
    </ul>
  {:else if node.t === 'h'}
    <svelte:element this={`h${node.level}`} class="measure"><Text nodes={inline(node.text, opts)} {opts} /></svelte:element>
  {:else}
    <p class="measure"><Text nodes={inline(node.text, opts)} {opts} /></p>
  {/if}
{/each}
