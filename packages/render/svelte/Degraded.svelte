<!--
  The visible fence.

  A malformed block degrades to exactly what the author typed, with the reason above it. It never
  renders wrong and never renders nothing, because silent omission in a record whose value is
  completeness is data loss with a tidy appearance, and when the author is an agent this is the
  only feedback channel that exists (05 §3).

  Note what this is NOT: a refusal. The write was accepted. A `document` is never parsed at write
  and never refused for its dialect; `DIALECT_ARITY` and `DIALECT_KIND_UNKNOWN` are render-time
  degradations (30 §6).

  A QUIET NOTE, THEREFORE, AND NOT AN ALARM. Nothing on it failed or is in danger, so it carries no
  red, no border and no warning glyph: the reason first, as the plain sentence the parser wrote, then
  what was written, small and in the identifier face on the sunk ground. The source has its own class
  and not `media`, because a code block scrolls sideways and takes a tab stop to do it, and this one
  WRAPS inside its column, which is what keeps a long line from pushing a phone page sideways. The
  host's stylesheet draws both classes, and `toHTML`'s `degraded` writes the same tree.

  The tags touch their text on purpose: a line break inside `figcaption` or `pre` is a space the
  static mirror does not write, and the two renderers would draw two trees.
-->
<script lang="ts">
  import type { Degraded } from '../src/index.ts';

  let { segment, onfix }: { segment: Degraded; onfix?: (() => void) | undefined } = $props();
</script>

<figure class="block block-degraded" data-code={segment.code}>
  <figcaption class="degraded-fix">{segment.fix}{#if onfix} <button type="button" class="degraded-action tap" onclick={onfix}>Fix this block</button>{/if}</figcaption>
  <pre class="degraded-source"><code>{segment.raw}</code></pre>
</figure>
