<!--
  One glyph from `icons.ts`, inline, in `currentColor` and nothing else. Always decorative here:
  every glyph on this site sits beside the words that say what it means.

  THE SET'S OWN STROKE, 1.5 (SPEC 4.7 S6), with round caps and joins (the design system's glyphs), and 2.75 for the two glyphs
  drawn as dots. The shapes are the set's markup, written in by `{@html}` because a glyph is circles,
  rects and paths and not one path; every string is a constant in `icons.ts`, never a reader's text.
-->
<script lang="ts">
  import { DOTTED, GLYPHS, type IconName } from './icons.ts';

  let { name, size = 'm' }: { name: IconName; size?: 's' | 'm' | 'l' | 'xl' } = $props();
</script>

<svg
  class="icon"
  data-size={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={DOTTED.has(name) ? 2.75 : 1.5}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {@html GLYPHS[name]}
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }

  .icon[data-size='s'] {
    inline-size: var(--icon-s);
    block-size: var(--icon-s);
  }

  .icon[data-size='m'] {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
  }

  .icon[data-size='l'] {
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
  }

  .icon[data-size='xl'] {
    inline-size: var(--icon-xl);
    block-size: var(--icon-xl);
  }

  /* IN AN ICON WELL THE GLYPH IS 18, whatever size was asked for (the design system): the well sets the size, so every
     heading row on the site draws the same glyph in the same box. Written here because a component's own rule
     outranks the site sheet's layer. */
  :global(.well) > .icon[data-size] {
    inline-size: 18px;
    block-size: 18px;
  }

  /* A WAY ON'S ARROW FOLLOWS ITS LAST WORD (`.onward` in `app.css`): inline, 16 whatever size was asked for, set on the
     words' middle, so a way on that wraps keeps its arrow with it. */
  :global(.onward) > .icon[data-size] {
    display: inline-block;
    inline-size: 16px;
    block-size: 16px;
    margin-inline-start: 6px;
    vertical-align: -3px;
  }
</style>
