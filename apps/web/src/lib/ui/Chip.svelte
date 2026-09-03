<!--
  A state or an intent, as a chip.

  The glyph is part of the token, not a choice here: under simulated dichromacy the four intent hues
  collapse — measured, and the mechanism is inescapable, because tuning five hues to the same
  contrast target against the same ground necessarily gives them the same luminance (13 §2.3).

  So colour never carries meaning alone, and there is no API in this app that lets a caller render
  an intent without its glyph.
-->
<script lang="ts">
  import { TONES } from 'braindog-render';
  import type { Tone } from 'braindog-render';

  let {
    label,
    tone,
    filled = false,
  }: { label: string; tone?: Tone | undefined; filled?: boolean | undefined } = $props();
</script>

<span class="chip" data-intent={tone} data-filled={filled ? '' : undefined}>
  {#if tone}<span class="glyph" role="img" aria-label={TONES[tone].label}>{TONES[tone].glyph}</span>{/if}
  {label}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink2);
    font-size: var(--t-xs);
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  .chip[data-intent] {
    border-color: color-mix(in srgb, var(--tone) 45%, transparent);
    color: var(--tone);
  }

  .chip[data-filled][data-intent] {
    background: color-mix(in srgb, var(--tone-fill) 18%, transparent);
  }
</style>
