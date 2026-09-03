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
  /* A TAG, not a pill. The fully rounded capsule is the shape of a count or a notification —
     something with a number in it — and a state word wearing that shape reads as a badge that has
     been stuck onto the row rather than as a property of it. A 4px corner, the same corner every
     control in the product has, reads as part of the row. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 7px;
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;
  }

  .chip[data-intent] {
    background: color-mix(in srgb, var(--tone) 12%, transparent);
    border-color: color-mix(in srgb, var(--tone) 28%, transparent);
    color: var(--tone);
  }

  .chip[data-filled][data-intent] {
    background: color-mix(in srgb, var(--tone-fill) 20%, transparent);
    border-color: color-mix(in srgb, var(--tone-fill) 40%, transparent);
  }
</style>
