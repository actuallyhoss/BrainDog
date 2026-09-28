<!--
  Settings > Appearance: the record's colour, the scheme, contrast, text size and density.

  The theme control is a THREE-WAY SEGMENT, not a toggle offering the opposite. The predecessor's
  had three states and a one-way UI: once a person chose light or dark, only clearing local storage
  restored "match the system". "Match the system" must stay reachable (19 §4).

  Density switches on POINTER, never on width: a small laptop window is not a phone. Width may
  change layout; only the pointer may change size (05 §6).
-->
<script lang="ts">
  import * as pref from '$lib/pref.ts';
  import { ACCENTS, apply as accentApply } from '$lib/accent.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { redraw } from '$lib/theme/draw.ts';
  import LookEditor from '$lib/theme/LookEditor.svelte';
  import { takeFix } from '$lib/theme/staged.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import { ownsRecord } from '../../levels.ts';

  /* EVERY AREA TAKES THE SAME PROPS. The device's own choices read none of them; the record's look asks whether the
     person is the owner, whose save installs it, or a member, whose save goes to Decide. */
  let props: AreaProps = $props();
  const owner = $derived(ownsRecord(props.shell.me));

  /* A THEME REFUSED AT INSTALL, handed over by the add-on screen's Fix and install. Taken once, so a reload of this
     screen opens as it always does. */
  const staged = takeFix();

  /* SET IT AND REMEMBER IT, in one call. These were two things and the second was never written:
     every preference in this product was lost on refresh, and a setting that does not survive a
     reload is a setting somebody changes once and then stops trusting.

     A DENSITY PICKED HERE BEATS THE RECORD'S LOOK on this device, so the look is drawn again without its row height. */
  const set = (key: 'scheme' | 'text' | 'density', value: string) => {
    pref.apply(key, value);
    if (key === 'density') redraw();
  };

  /* SEEDED FROM WHAT IS REMEMBERED, so the controls show the state the page is already in rather
     than the default the state happens to start at. */
  const held = pref.read();
  let scheme = $state<'light' | 'system' | 'dark'>(held.scheme ?? 'system');
  let text = $state<'sm' | 'base' | 'md'>(held.text ?? 'base');
  let density = $state<'compact' | 'comfortable' | 'roomy'>(held.density ?? 'comfortable');
  /* THE HIGH-CONTRAST PALETTE, WHICH SHIPPED AND HAD NO CONTROL. Off unless somebody said
     otherwise: it is a second palette solved against a higher floor, not a correction to a broken
     one, so the default is the palette everything else is drawn against. */
  let moreContrast = $state(held.contrast ?? false);

  let accent = $state<string | null>(held.theme ?? null);
  let accentWrong = $state<string | null>(null);

  function pickAccent(hex: string | null) {
    const out = accentApply(hex);
    if (!out.ok) {
      /* THE FLOOR IT MISSED, NOT "THAT DID NOT WORK", AND IN THE TERMS OF THIS SCREEN. `out.refusals`
         are the theme AUTHOR's sentences: "the pair (faint on s3) is 3.61:1 in dark, it needs 4.5:1,
         move faint further from the ground". There is no control here that moves a hue, lowers a
         chroma or knows what `s3` is, so every one of them instructed an action this person cannot
         take, which is the failure `checks.ts` names in its own comment two lines above the string.
         The code is what survives the trip; the sentence is built here, where the swatch is. */
      accentWrong = copy.accentRefused(ACCENTS.find((a) => a.hex === hex)?.name ?? String(hex), out.codes);
      return;
    }
    accentWrong = null;
    accent = hex;
    toasts.push(hex ? copy.accentSet(ACCENTS.find((a) => a.hex === hex)?.name ?? hex) : copy.accentReset);
  }

  /* THE ONE PREFERENCE WHOSE ATTRIBUTE IS NOT ITS VALUE: the switch is a boolean and the attribute
     is the literal `hc`, so it has its own writer rather than a fourth key in `apply`. */
  function pickContrast(on: boolean) {
    moreContrast = on;
    pref.contrast(on);
  }

  function pickScheme(v: 'light' | 'system' | 'dark') {
    scheme = v;
    /* `system` IS AN ANSWER AND NOT AN ABSENCE, so it is written down: removing the attribute
       without recording the choice would make the next visit read a stale `dark` from the cookie. */
    pref.apply('scheme', v === 'system' ? null : v);
  }
</script>

<!--
  THE RECORD'S OWN COLOUR. `@braindog/theme` solves an entire coherent palette from one seed
  against every floor it defines, and until now nothing called it with anything but the house
  red, so a bakery and a type foundry looked identical. The swatches are suggestions, not the
  set: any colour that passes goes in, and one that does not says which floor it missed rather
  than being quietly approximated.
-->
<!--
  AND EVERY ONE OF THESE SAYS WHICH IS ON, to something that is not a stylesheet.

  Fifteen buttons on this screen (six swatches and nine segments) carried `data-on` and no
  `aria-pressed`. Measured on the deployed build: `aria-pressed` was `null` on all fifteen,
  so a screen reader heard "Light button, System button, Dark button" and could not tell
  which one the record was in. `13 §5.1` is that the meaning cannot live in the styling
  alone, and the People matrix cites that rule and gets it right, which is the tell: the fix
  was known, written down, and applied to one group.
-->
<Section title={copy.accentTitle}>
  <p class="hint">{copy.accentHint}</p>
  <div class="swatches" role="group" aria-label={copy.accentTitle}>
    {#each ACCENTS as a}
      <button
        type="button"
        class="swatch"
        aria-pressed={accent === a.hex}
        data-on={accent === a.hex ? '' : undefined}
        style="--swatch:{a.hex}"
        aria-label={a.name}
        onclick={() => pickAccent(a.hex)}
      >
        {#if accent === a.hex}<Icon name="check" size="s" />{/if}
      </button>
    {/each}
    <button
      type="button"
      class="swatch swatch-off"
      aria-pressed={accent === null}
      data-on={accent === null ? '' : undefined}
      onclick={() => pickAccent(null)}
    >
      {copy.accentHouse}
    </button>
  </div>
  {#if accentWrong}<p class="wrong">{accentWrong}</p>{/if}
</Section>

<!--
  THE RECORD'S LOOK, which is everybody's, under the device's colour, which is this screen's alone (GAP-3, `21 §6`).
  The editor is its own component with its own styles, because this file's style block is the device choices'.
-->
<Section title={copy.lookTitle}>
  <p class="hint">{copy.lookHint}</p>
  <LookEditor {owner} {staged} />
</Section>

<Section title={copy.scheme}>
  <div class="segmented" role="group" aria-label={copy.scheme}>
    {#each [['light', copy.schemeLight, 'sun'], ['system', copy.schemeSystem, 'monitor'], ['dark', copy.schemeDark, 'moon']] as const as [v, label, icon]}
      <button type="button" class="segment" aria-pressed={scheme === v} data-on={scheme === v ? '' : undefined} onclick={() => pickScheme(v)}>
        <Icon name={icon} size="s" />
        {label}
      </button>
    {/each}
  </div>
</Section>

<!--
  THE PALETTE THAT COULD NOT BE TURNED ON.

  `packages/theme` solves a second palette against a higher contrast floor, `theme.mjs` writes
  it into `house.css` behind `html[data-theme='hc']`, and `theme.mjs --check` byte-compares it
  on every build. Nothing in `apps/web/src` ever set that attribute, so sixteen checks' worth
  of generated work was unreachable by the reader it exists for.

  WHAT WAS IN ITS WAY WAS THE ACCENT. `data-theme` carried two meanings and only one of them
  was ever read: `house.css` has four `data-theme` selectors and all four say `hc`, while
  `accent.ts` builds its palette into an adopted stylesheet and needs no attribute at all. The
  one being written was the one nothing read.

  A SWITCH AND NOT A SEGMENT, because it is one thing that is on or off, and `13 §5.1` wants
  the state said in something other than styling: `aria-pressed` carries it.
-->
<Section title={copy.contrast}>
  <!-- ONE THING ON OR OFF IS A SWITCH beside the sentence that says what it does. It was two
       segments reading On and Off, which is a choice between two things. -->
  <div class="setting-row">
    <p class="hint">{copy.contrastHint}</p>
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={moreContrast}
      aria-label={copy.contrast}
      onclick={() => pickContrast(!moreContrast)}><span class="switch-track"></span></button
    >
  </div>
</Section>

<Section title={copy.textSize}>
  <div class="segmented" role="group" aria-label={copy.textSize}>
    {#each [['sm', copy.textSmall], ['base', copy.textNormal], ['md', copy.textLarge]] as const as [v, label]}
      <button
        type="button"
        class="segment"
        aria-pressed={text === v}
        data-on={text === v ? '' : undefined}
        onclick={() => ((text = v), set('text', v))}>{label}</button
      >
    {/each}
  </div>
</Section>

<Section title={copy.density}>
  <div class="segmented" role="group" aria-label={copy.density}>
    {#each [['compact', copy.densityCompact], ['comfortable', copy.densityComfortable], ['roomy', copy.densityRoomy]] as const as [v, label]}
      <button
        type="button"
        class="segment"
        aria-pressed={density === v}
        data-on={density === v ? '' : undefined}
        onclick={() => ((density = v), set('density', v))}>{label}</button
      >
    {/each}
  </div>
</Section>

<!-- DENSITY AND TEXT SHOW THEIR EFFECT WHERE THEY ARE SET. Their whole effect is `--row-h` and
     `--text`, which only lists read, so pressing Roomy here changed nothing on this screen and a
     person had to leave to find out what they had chosen. Three rows drawn the way a list draws
     them answer it in place, with no toast. -->
<Section title={copy.densityPreview}>
  <ul class="density-preview" aria-hidden="true">
    {#each copy.densityPreviewRows as row}<li>{row}</li>{/each}
  </ul>
</Section>

<style>
  /* Rows the height a list's rows are, at the body size a list uses, with the list's hairline. */
  .density-preview {
    margin: 0;
    padding: 0;
    list-style: none;
    max-inline-size: 36rem;
  }

  .density-preview li {
    display: flex;
    align-items: center;
    min-block-size: calc(var(--row-h) + 10px);
    border-block-end: 1px solid var(--line);
    color: var(--ink2);
    font-size: var(--text);
  }

  /* THE SENTENCE AND ITS SWITCH (`.setting-row`) ARE LAID OUT BY `settings.css`, which every area shares. */

  /* The hint sits above the control it explains, not beside it: a sentence in a column beside a
     row of swatches is read after the choice has been made. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A SWATCH IS THE COLOUR, and the tick is drawn ON it rather than beside it: a selected state
     that lives outside the thing selected is a state people read as belonging to the next one. */
  .swatch {
    display: grid;
    place-items: center;
    min-inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0 var(--sp-2);
    background: var(--swatch, var(--s1));
    /* THE LABEL ON A FILL, which is the token the theme solves for exactly this: a tick drawn in
       white on an ochre swatch is the one place a literal would be wrong twice over. */
    color: var(--accent-ink);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    cursor: pointer;
  }

  .swatch[data-on] {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .swatch-off {
    background: var(--s1);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  /* A refusal a person cannot act on teaches them the control is broken, so the floor it missed is
     printed rather than a shrug. */
  .wrong {
    margin: var(--sp-3) 0 0;
    padding-inline-start: var(--sp-4);
    color: var(--danger);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* THE SHARED PILLS FROM `controls.css`, with two things this screen needs on top.

     The track hugs its options: a settings choice is two to six short words, and a sunk track run
     to the far edge of the panel reads as a field with the words bunched at one end.

     And a segment is 44 on BOTH axes under a thumb. `a11y.css` names the failure, *"a control grown
     only in height measures 38x44 and fails"*, and `On` and `Off` are those labels: the shared
     segment sets a height and its width is the word. The icon beside Light, System and Dark sits on
     the label's line rather than above it. */
  .segmented {
    margin-block-end: var(--sp-3);
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-inline-size: var(--ctl-h);
  }
</style>
