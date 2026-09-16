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
  }: { label: string; tone?: Tone | undefined } = $props();

  /* Sentence case, whatever the stored value was: `running` and `on track` are words a person reads. */
  const said = $derived(label ? label.charAt(0).toUpperCase() + label.slice(1) : label);
</script>

<span class="chip" data-intent={tone}>
  {#if tone}<span class="glyph" role="img" aria-label={TONES[tone].label}>{TONES[tone].glyph}</span>{/if}
  {said}
</span>

<style>
  /* A pill with no edge, the shape every button and choice in the product has. The wash alone sets
     it off the row, and the padding keeps the pixel the border used to take. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    background: var(--hold-wash);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 500;
    line-height: 1.35;
    white-space: nowrap;
  }

  /**
   * THE LABEL IS INK, AND IT USED TO BE THE TONE.
   *
   * `color: var(--tone)` sat on this rule, over this rule's own `--tone-wash`. The wash is that
   * same hue at 12%, so the chip was asking a colour to be read against a dilution of itself.
   * Measured on the shipped palette, `danger` on its own wash: 4.10:1 over `--bg` in light, 3.83
   * over `--sunk`, 4.34 over `--s1` in dark, 3.82 over `--s3` in dark, 4.40 over `--bg` in
   * high-contrast light. Body text needs 4.5.
   *
   * AND THERE IS NO FILLED CHIP ANY MORE, because it was worse and nothing ever asked for one. Its
   * ground was 20% of the louder `-fill` band, where `danger` measured 3.17 over `--sunk` in light
   * and 3.44 in high-contrast light, a third under the floor. No caller in the app passed the
   * `filled` prop, so `data-filled` never reached the DOM and the rule keyed on it never applied:
   * an unreachable variant that fails the contrast floor is not a spare option, it is a contrast
   * failure nobody has shipped yet. The prop and its rule are gone rather than waiting to be
   * reached for.
   *
   * WEAKENING THE TINT DOES NOT RESCUE IT, and that is what makes this a colour decision rather
   * than a number. The same pair is 4.34 at 8% and 4.84 with no tint at all. `28 §4.4` check G
   * certifies an intent as text at 4.5 against the five DECLARED surfaces, and the house theme
   * clears it by 0.01 in its worst cell (`danger` on `--s3` in dark, 4.51), so an intent has no
   * headroom as text to spend and ANY tint under one of them fails by construction. There is no
   * `--danger-text` to reach for either: `--accent-text` exists because the accent is used as text
   * over its own wash in six places, and the generator emits no sibling for the four intents.
   *
   * SO THE LABEL MOVES AND THE WASH STAYS, and the base rule above already says where it moves to.
   * `blocks.css:1030` made this exact call on the selected row, and its argument is the whole of
   * `13 §2.3`: the glyph carries the meaning, the colour is the second channel. The glyph moves
   * with the label, because a glyph is text and takes the same pair. What still says `bad` is the
   * mark and the tint, which is the two channels the rule asks for.
   *
   * `--ink2` on these grounds measures 5.67 at its worst, over every surface, plain and filled, in
   * all four palettes.
   */
  /* FRESH EYES, APPENDIX C1: THE WASH WENT TOO. A green, amber or blue capsule beside a page's primary
     was the loudest thing on Decide, a thread and a run, and rule 1.2 allows a status capsule only on
     `--hold-wash`. The shape stays neutral and the glyph alone is the colour. */
  .chip[data-intent] .glyph {
    color: var(--tone);
  }
</style>
