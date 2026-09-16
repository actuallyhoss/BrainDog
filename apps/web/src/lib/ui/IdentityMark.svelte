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
  <span class="glyph thing-glyph" data-shape={identity.mark} style="--hue:{identity.hue}" aria-hidden="true"></span>
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
    /* Drawn by `.thing-glyph` in `rows.css`, one 8px shape, so the name beside it starts on one edge. */
    margin-inline-end: 0;
    align-self: center;
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

  /* IT IS A NAME, SO IT WRAPS RATHER THAN LOSING ITS END. At 320 `Marlow & Co` came back as
     `Marlow & C` — a project's name, one character short, on the row that is about that project. */
  @media (width < 400px) {
    .name {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }
  }

  .thing[data-size='md'] .glyph {
    inline-size: 10px;
    block-size: 10px;
  }
</style>
