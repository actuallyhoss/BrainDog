<!--
  A project's mark alone in a square well tinted with its hue: 40px on its card (`s`), 48px in its page's hero band (`l`).
  The one accent a project wears (the plan of 20 October), drawn as `IdentityMark` draws a mark (`markOf`: the glyph the
  row names, else its first letter), through the theme's two mark constants so it clears contrast in light and dark.
  Decoration: the name is always written beside it, so it is hidden from a screen reader. No hue, no colour.
-->
<script lang="ts">
  import { markOf } from 'braindog-render';
  import Icon from './Icon.svelte';
  import { isGlyph } from './icons.ts';

  let { mark, name, hue, size = 's' }: { mark: string; name: string; hue: number | null; size?: 's' | 'l' } = $props();

  const said = $derived(markOf(mark, name));
  const glyph = $derived(said !== null && said.length > 1 && isGlyph(said) ? said : null);
</script>

<span class="well" data-size={size} data-hued={hue === null ? undefined : ''} style={hue === null ? undefined : `--hue:${hue}`} aria-hidden="true"
  >{#if glyph}<Icon name={glyph} size="l" />{:else if said}{said}{/if}</span
>

<style>
  .well {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-md);
    background: var(--field);
    color: var(--dim);
    font-family: var(--font-display);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 1;
  }

  .well[data-hued] {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
    background: color-mix(in oklab, oklch(var(--mark-l) var(--mark-c) var(--hue)) 14%, transparent);
  }

  .well[data-size='l'] {
    inline-size: 48px;
    block-size: 48px;
    font-size: var(--t-lg);
  }
</style>
