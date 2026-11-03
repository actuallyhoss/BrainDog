<!--
  A chip: a short label in its own small box, or, given a tone, a state as its dot and its word.

  THE BOX IS NEVER A PILL. 28 tall, radius 8, `--tile-2`, the word at `--fs-ctl` in `--ink-2`: the shape of a control's
  label, so a chip beside a button reads as one family. Pills are for counts only (`Count.svelte`).

  A STATE IS NOT BOXED. Given `tone`, the chip is the dot and the word with nothing round them, as every status in the
  product is drawn: the glyph is part of the token, not a choice here. Under simulated dichromacy the four intent hues
  collapse (13 §2.3), so colour never carries meaning alone, and there is no API in this app that lets a caller render
  an intent without its glyph and its word.
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
  /* THE BOX: 28 tall, radius 8, the quiet fill, the control's label size. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--btn-h-sm);
    padding-inline: var(--sp-2);
    background: var(--soft-fill);
    border-radius: var(--r-pill);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: 20px;
    white-space: nowrap;
  }

  /* A STATE IS ITS DOT AND ITS WORD, AND NOTHING ROUND THEM. `blocks.css` draws every `.glyph` as the dot in
     `--tone-fill`, with its character indented out of sight and the intent's name kept for a screen reader: colour is
     the second channel, the word is the first. */
  .chip[data-intent] {
    min-block-size: 0;
    padding-inline: 0;
    background: none;
    border-radius: 0;
    font-size: var(--fs-meta);
    line-height: 18px;
  }
</style>
