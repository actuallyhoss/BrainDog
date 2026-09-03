<!--
  A thing's mark: one glyph, one frozen hue, and the name beside it.

  The hue is the ONE non-token colour the rendered-DOM gate admits, and only here: `oklch(L C h)`
  where `h` is the row's frozen `identity.accent` and `L`/`C` are the theme's two mark constants,
  `0.72 0.12` in dark and `0.55 0.09` in light. Chosen so every hue at that lightness is inside sRGB
  and clears 3:1 on every surface (13 §2.1b, 22 §7 gate 3).

  Never the only signal. The name always sits beside it, and past four marks the name is what
  carries identity anyway — which is why the generator stops looking for a fifth colour and starts
  trusting the word.
-->
<script lang="ts">
  import type { Identity } from '../record/api.ts';

  let { identity, size = 'sm' }: { identity: Identity; size?: 'sm' | 'md' } = $props();
</script>

<span class="thing" data-size={size} data-retired={identity.retired ? '' : undefined}>
  <span class="glyph" style="--hue:{identity.hue}" aria-hidden="true">{identity.mark}</span>
  <span class="name">{identity.name}</span>
</span>

<style>
  .thing {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-inline-size: 0;
  }

  .glyph {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
    font-size: 9px;
    line-height: 1;
    flex: none;
  }

  /* A retired row is achromatic. */
  .thing[data-retired] .glyph {
    color: var(--dim);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .thing[data-size='md'] .glyph {
    font-size: 12px;
  }
</style>
