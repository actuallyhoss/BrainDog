<!--
  The specimen (`21 §6`): a small page drawn in the look being edited, beside the editor.

  DRAWN BY THE REAL CONTROLS, NOT BY PICTURES OF THEM. The buttons, the chip, the field and the switch are the app's own,
  and every one reads its colours through `var(--x)`. The wrapper sets each role as a custom property on itself, so
  everything inside resolves to the edited value and nothing outside it moves. The derived tokens `tokens.css` mixes
  from the roles at the root (`--red-tint`, `--red-fill`, `--hover` and the rest) are mixed again here, because a mix
  computed at the root has already taken the house values by the time it is inherited.

  INERT, because it is a sample: nothing in it can be pressed or reached by Tab, and a screen reader is told the same
  thing in words by the gate beside it, pair by pair.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { varsOf, type Draft } from './look.ts';

  let { palette, draft }: { palette: Record<string, string>; draft: Draft } = $props();

  const vars = $derived(varsOf(palette, draft));
  /* THE ACCENT IS SHOWN AS A SWATCH OF ITS OWN VALUE and not through the accent token, which only the mark, the tile,
     /start, /signin and the selection may read. */
  const accentVars = $derived(`--swatch: ${palette.accent ?? ''}; --swatch-ink: ${palette['accent-ink'] ?? ''}`);
  const intents = [
    ['earn', copy.lookSampleEarn, 'money'],
    ['warn', copy.lookSampleWarn, 'clock'],
    ['danger', copy.lookSampleDanger, 'alert'],
    ['info', copy.lookSampleInfo, 'play'],
  ] as const;
</script>

<div class="specimen" style={vars} inert>
  <p class="spec-head">{copy.lookSampleHead}</p>
  <ul class="spec-rows">
    {#each copy.lookSampleRows as row, i}
      <li class="spec-row">
        <span class="spec-row-title">{row}</span>
        <span class="spec-row-when">{copy.lookSampleWhen[i] ?? ''}</span>
      </li>
    {/each}
  </ul>

  <div class="spec-panel">
    <p class="spec-note">{copy.lookSampleNote}</p>
    <p class="spec-quiet">{copy.lookSampleQuiet}</p>
    <p class="spec-faint">{copy.lookSampleFaint}</p>
  </div>

  <div class="spec-intents">
    {#each intents as [intent, word, glyph]}
      <span class="spec-intent" data-tone={intent}><Icon name={glyph} size="s" title={word} />{word}</span>
    {/each}
  </div>

  <div class="spec-fills" aria-hidden="true">
    {#each intents as [intent]}<span class="spec-fill" data-tone={intent}></span>{/each}
  </div>

  <div class="spec-figure">
    <span class="spec-figure-label">{copy.lookSampleFigure}</span>
    <span class="spec-figure-value">{copy.lookSampleFieldValue}</span>
  </div>

  <div class="spec-controls">
    <Button weight="primary">{copy.lookSampleAdd}</Button>
    <Button>{copy.lookSampleCancel}</Button>
    <Chip label={copy.lookSampleChip} />
    <span class="spec-accent" style={accentVars}>{copy.lookSampleChip}</span>
  </div>

  <div class="spec-field">
    <span class="spec-quiet">{copy.lookSampleField}</span>
    <div class="field">
      <input class="field-input" type="text" value={copy.lookSampleFieldValue} aria-label={copy.lookSampleField} readonly />
    </div>
  </div>

  <div class="spec-switch">
    <span class="spec-note">{copy.lookSampleSwitch}</span>
    <span class="switch" role="switch" aria-checked="true" aria-label={copy.lookSampleSwitch}><span class="switch-track"></span></span>
  </div>
</div>

<style>
  /* THE PAGE IN MINIATURE: the ground, the panel, the hairlines and the mixes the root would have made. */
  .specimen {
    --red-tint: color-mix(in srgb, var(--ink) 8%, var(--tile));
    --red-fill: var(--ink);
    --on-red: var(--tile);
    --red: var(--ink);
    --hover: color-mix(in srgb, var(--ink) 6%, transparent);
    --red-fill-hover: color-mix(in srgb, var(--ink) 88%, var(--tile));
    display: grid;
    gap: var(--sp-4);
    padding: var(--sp-4);
    background: var(--tile);
    color: var(--ink);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-tile);
    min-inline-size: 0;
  }

  .spec-head {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .spec-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .spec-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
    border-block-end: 1px solid var(--rule);
  }

  .spec-row-title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spec-row-when {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  .spec-panel {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--tile-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-pop);
  }

  .spec-note {
    margin: 0;
    color: var(--ink-2);
    line-height: var(--lh-body);
  }

  .spec-quiet {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* Faint is kept for large type, and the sample obeys the rule it illustrates. */
  .spec-faint {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-page);
  }

  .spec-intents {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-3);
  }

  .spec-intent {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    font-size: var(--fs-meta);
  }

  .spec-intent[data-tone='earn'] {
    color: var(--good);
  }

  .spec-intent[data-tone='warn'] {
    color: var(--warn);
  }

  .spec-intent[data-tone='danger'] {
    color: var(--red);
  }

  .spec-intent[data-tone='info'] {
    color: var(--info);
  }

  .spec-fills {
    display: flex;
    gap: var(--sp-2);
  }

  .spec-fill {
    inline-size: var(--sp-6);
    block-size: var(--sp-3);
    border-radius: var(--r-xs);
  }

  .spec-fill[data-tone='earn'] {
    background: var(--good);
  }

  .spec-fill[data-tone='warn'] {
    background: var(--warn-fill);
  }

  .spec-fill[data-tone='danger'] {
    background: var(--red-fill);
  }

  .spec-fill[data-tone='info'] {
    background: var(--info);
  }

  .spec-figure {
    display: grid;
    gap: var(--sp-1);
  }

  .spec-figure-label {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .spec-figure-value {
    font-size: var(--fs-head);
    font-weight: 600;
  }

  .spec-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .spec-accent {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-4);
    background: var(--swatch);
    color: var(--swatch-ink);
    border-radius: var(--r-ctl);
    font-size: var(--fs-meta);
  }

  .spec-field {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: 24rem;
  }

  .spec-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }
</style>
