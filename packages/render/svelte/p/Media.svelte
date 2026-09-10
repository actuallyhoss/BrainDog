<!--
  `media` — a figure with a caption. Kinds: `code`, `tree`. (`diagram` is post-v1, and it is a
  constrained shape set of boxes, arrows and lanes, never arbitrary SVG.)

  Rows are verbatim: never split on a pipe, never trimmed. A code sample that loses its indentation
  is a code sample that is wrong.
-->
<script lang="ts">
  import { verbatimText, type Block, type RenderOptions } from '../../src/index.ts';

  // `opts` is part of every primitive's signature and is not read here: `code` and `tree` rows are
  // verbatim, so nothing in them is interpolated or linked.
  let { block }: { block: Block; opts?: RenderOptions | undefined } = $props();

  /* THE INDENT COMES BACK ON IN ONE PLACE NOW. This component rebuilt it from `Row.depth` and
     `toHTML` did not read `depth` at all, so a tree drew nested here and flat in the mirror, in
     the exports and in the digest: two renderers held to one accessibility tree, differing in
     text content on every `tree` block there is. */
  const body = $derived(verbatimText(block));
</script>

<!-- FOCUSABLE, and the same in `html.ts`: the two renderers are held to one accessibility tree.
     A `pre` does not wrap, so on a phone it is always the widest thing on the page and always
     scrolls sideways, and a scrolling box a keyboard cannot focus is a box a keyboard cannot read
     (WCAG 2.1.1). Named, so tabbing to it announces what it is rather than reading a line of code
     at somebody. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<pre
  class="media"
  data-lang={block.kind === 'code' ? block.heading : undefined}
  tabindex="0"
  role="group"
  aria-label={block.heading || (block.kind === 'tree' ? 'Tree' : 'Code')}><code>{body}</code></pre>
