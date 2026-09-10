<!--
  What a section is about, in a word or three, over its heading.

  IT REPLACED AN UPPERCASE EYEBROW with a red bar in front of it. Eleven-pixel tracked capitals are
  a label the eye skips, which is why nine of them down one page separated nothing. This is the
  same words in sentence case beside a tinted glyph, so the top of a section is a small coloured
  object you can find while still reading the one above, not a line of small print.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Hue, IconName } from './icons.ts';

  let { icon, hue, label }: { icon: IconName; hue: Hue; label: string } = $props();
</script>

<p class="tag">
  <span class="glyph" data-hue={hue}><Icon name={icon} /></span>
  {label}
</p>

<style>
  .tag {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }
</style>
