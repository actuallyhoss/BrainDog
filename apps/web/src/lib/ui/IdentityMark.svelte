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
    /* Left as a literal on purpose: the type scale's floor is `--t-xs` at 12px, and this one glyph
       is drawn at 9px so it reads as a mark beside the name rather than a second word. Rounding up
       to `--t-xs` would grow it a third again, which is a real, visible size change on the one
       thing in this component with no name beside it to lean on — not a fix this gate should make
       silently. Route to a design decision: either the type scale grows a step below `--t-xs`, or
       this stays a spec carve-out. */
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
    font-size: var(--t-xs);
  }
</style>
