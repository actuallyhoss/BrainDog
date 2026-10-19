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
  /* A STATUS IS A 6px DOT AND ITS WORD, and nothing round them. The pill on the hold wash is gone:
     the only filled badge in the product is the red square count (`Count.svelte`), and a row of washed capsules beside
     a page's one primary was the loudest thing in Needs you, a thread and a run.

     THE WORD IS `--ink2` AND THE DOT CARRIES THE HUE. `blocks.css` draws every `.glyph` as the dot in `--tone-fill`,
     with its character indented out of sight and the intent's name kept for a screen reader (`13 §2.3`): colour is the
     second channel, the word is the first, and an intent has no contrast headroom to spend as text. A chip with no tone
     is the word alone. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 18px;
    white-space: nowrap;
  }
</style>
