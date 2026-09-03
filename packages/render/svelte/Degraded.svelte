<!--
  The visible fence.

  A malformed block degrades to exactly what the author typed, with the reason above it. It never
  renders wrong and never renders nothing, because silent omission in a record whose value is
  completeness is data loss with a tidy appearance — and when the author is an agent, this is the
  only feedback channel that exists (05 §3).

  Note what this is NOT: a refusal. The write was accepted. A `document` is never parsed at write
  and never refused for its dialect; `DIALECT_ARITY` and `DIALECT_KIND_UNKNOWN` are render-time
  degradations (30 §6).
-->
<script lang="ts">
  import type { Degraded } from '../src/index.ts';

  let { segment, onfix }: { segment: Degraded; onfix?: (() => void) | undefined } = $props();
</script>

<figure class="block block-degraded" data-code={segment.code}>
  <figcaption class="degraded-fix">
    {segment.fix}
    {#if onfix}<button type="button" class="degraded-action tap" onclick={onfix}>Fix</button>{/if}
  </figcaption>
  <pre class="media"><code>{segment.raw}</code></pre>
</figure>
