<!--
  One inline run. Mirrors `renderInline` in src/html.ts node for node, so the two renderers produce
  the same accessibility tree and the parity gate can assert it.

  Nothing here is rendered from a string of HTML. There is no {@html}, ever.
-->
<script lang="ts">
  import type { Inline, RenderOptions } from '../src/index.ts';
  import { MISSING, holeLabel } from '../src/index.ts';
  import Self from './Text.svelte';

  let { nodes, opts = {} }: { nodes: Inline[]; opts?: RenderOptions } = $props();

  /* NEITHER LINK IS INVENTED HERE. `row` has always asked the host; `day` was hard-coded to a
     `/calendar/` route no host in this workspace serves, so every date in a document was an anchor
     to the error page. */
  const href = (n: Extract<Inline, { type: 'typed' }>) =>
    n.link === 'row' ? (opts.link?.(n.arg) ?? null) : n.link === 'day' ? (opts.dayHref?.(n.arg) ?? null) : null;

  /** A hole is a control only where the host can act on it. See `RenderOptions.hole`. */
  const onHole = (path: string | null) => {
    if (typeof opts.hole === 'function') opts.hole(path);
  };
</script>

{#each nodes as node}
  {#if node.type === 'text'}{node.text}
  {:else if node.type === 'code'}<code>{node.text}</code>
  {:else if node.type === 'strong'}<strong><Self nodes={node.body} {opts} /></strong>
  {:else if node.type === 'em'}<em><Self nodes={node.body} {opts} /></em>
  {:else if node.type === 'link'}<a href={node.href}><Self nodes={node.body} {opts} /></a>
  {:else if node.type === 'path'}
    {#if node.resolved === null}
      <!-- A hole is a task, not a value: an unknown never participates in a scale, never sorts
           among the knowns, and is always the affordance that fixes it (05 §7.5). -->
      {#if opts.hole}
        <button type="button" class="hole" data-path={node.path} onclick={() => onHole(node.path)}
          >{holeLabel(node.path)} {MISSING}</button
        >
      {:else}<span class="hole" data-path={node.path}>{holeLabel(node.path)} {MISSING}</span>{/if}
    {:else}<span class="figure num">{node.resolved}</span>{/if}
  {:else if node.type === 'typed'}
    {#if href(node)}
      <a href={href(node)}><span class="typed num" data-form={node.form}>{node.text}</span></a>
    {:else}<span class="typed num" data-form={node.form}>{node.text}</span>{/if}
  {:else if node.type === 'evidence'}
    {#if node.kind === 'unknown'}
      {#if opts.hole}<button type="button" class="hole" onclick={() => onHole(null)}>unknown</button>
      {:else}<span class="hole">unknown</span>{/if}
    {:else}
      <span class="evidence" data-evidence={node.kind} title={node.source}
        >{node.kind}{#if node.source}: {node.source}{/if}</span
      >
    {/if}
  {:else if node.type === 'unresolved'}<span class="unresolved">{node.text}</span>{/if}
{/each}
