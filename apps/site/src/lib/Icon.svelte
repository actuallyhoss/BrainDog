<!--
  One glyph from `icons.ts`, inline, in `currentColor` and nothing else. Always decorative here:
  every glyph on this site sits beside the words that say what it means.
-->
<script lang="ts">
  import { PATHS, type IconName } from './icons.ts';

  let { name, size = 'm' }: { name: IconName; size?: 's' | 'm' | 'l' } = $props();
</script>

<svg
  class="icon"
  data-size={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
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
</style>
