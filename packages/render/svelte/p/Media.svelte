<!--
  `media` — a figure with a caption. Kinds: `code`, `tree`. (`diagram` is post-v1, and it is a
  constrained shape set of boxes, arrows and lanes, never arbitrary SVG.)

  Rows are verbatim: never split on a pipe, never trimmed. A code sample that loses its indentation
  is a code sample that is wrong.
-->
<script lang="ts">
  import type { Block, RenderOptions } from '../../src/index.ts';

  // `opts` is part of every primitive's signature and is not read here: `code` and `tree` rows are
  // verbatim, so nothing in them is interpolated or linked.
  let { block }: { block: Block; opts?: RenderOptions | undefined } = $props();

  const body = $derived(
    block.rows
      .map((r) => (block.kind === 'tree' ? '  '.repeat(r.depth ?? 0) + (r.cells[0] ?? '') : (r.cells[0] ?? '')))
      .join('\n'),
  );
</script>

<pre class="media" data-lang={block.kind === 'code' ? block.heading : undefined}><code>{body}</code></pre>
