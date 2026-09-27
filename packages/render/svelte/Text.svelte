<!--
  One inline run. Mirrors `renderInline` in src/html.ts node for node, so the two renderers produce
  the same accessibility tree and the parity gate can assert it.

  Nothing here is rendered from a string of HTML. There is no {@html}, ever.
-->
<script lang="ts">
  import type { Inline, RenderOptions } from '../src/index.ts';
  import { MISSING, holeLabel, hrefFor } from '../src/index.ts';
  /* From the module and not the root, because it is the drawers' shared question and not something a
     host asks: the host answers `opts.icon` and never calls this. */
  import { glyphPath } from '../src/inline.ts';
  import Self from './Text.svelte';

  let { nodes, opts = {} }: { nodes: Inline[]; opts?: RenderOptions } = $props();

  /* NEITHER LINK IS INVENTED HERE. `row` has always asked the host; `day` was hard-coded to a
     `/calendar/` route no host in this workspace serves, so every date in a document was an anchor
     to the error page. */
  const href = (n: Extract<Inline, { type: 'typed' }>) => {
    const to = n.link === 'row' ? (opts.link?.(n.arg) ?? null) : n.link === 'day' ? (opts.dayHref?.(n.arg) ?? null) : null;
    return to === null ? null : hrefFor(opts, to);
  };

  /** A hole is a control only where the host can act on it. See `RenderOptions.hole`. */
  const onHole = (path: string | null) => {
    if (typeof opts.hole === 'function') opts.hole(path);
  };

  /* A GLYPH AMONG WORDS NAMES ITSELF, with the host's art as `glyphSvg` in src/html.ts draws it, and
     without the art it is the same named span with nothing in it, so the words around it never move.
     The markup below has no whitespace between its tags on purpose: a line break there is a space the
     other renderer does not draw. */
</script>

{#each nodes as node}
  {#if node.type === 'text'}{node.text}
  {:else if node.type === 'code'}<code>{node.text}</code>
  {:else if node.type === 'strong'}<strong><Self nodes={node.body} {opts} /></strong>
  {:else if node.type === 'em'}<em><Self nodes={node.body} {opts} /></em>
  {:else if node.type === 'link'}<a href={hrefFor(opts, node.href)}><Self nodes={node.body} {opts} /></a>
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
  {:else if node.type === 'icon'}
    {@const d = glyphPath(node.name, opts)}
    {#if d}<svg
        class="glyph-inline"
        role="img"
        aria-label={node.name}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"><path {d} /></svg
      >{:else}<span class="glyph-inline" data-glyph={node.name} role="img" aria-label={node.name}></span>{/if}
  {:else if node.type === 'unresolved'}<span class="unresolved">{node.text}</span>{/if}
{/each}
