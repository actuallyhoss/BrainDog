<!--
  One glyph of the site's set (`icons.ts`) at the drawing's own size, 18px unless the caller says otherwise, in
  currentColor and the prototype's stroke of 1.8. Always decorative: every glyph sits beside its words.
-->
<script lang="ts">
  import { GLYPHS, type IconName } from '../icons.ts';

  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{@html GLYPHS[name]}</svg>

<style>
  .ico {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
