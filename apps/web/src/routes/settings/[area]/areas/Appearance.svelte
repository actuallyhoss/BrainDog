<!--
  Settings > Appearance: the scheme and its contrast, the reading size and density, the record's colour and its look.

  THE SCHEME IS THREE PICTURES OF THE PRODUCT, not three words. Each is the app in miniature, drawn from the tokens it
  would wear: the ground and its light, the glass rail with the mark and an ink "here", a title with its sentence, two
  tiles with a chart and the rows under them. System is both, split on the diagonal. A person choosing how the product
  looks is shown how it looks.

  AND IT IS STILL A THREE-WAY CHOICE, not a toggle offering the opposite. The predecessor's had three states and a
  one-way UI: once a person chose light or dark, only clearing local storage restored "match the system". "Match the
  system" must stay reachable (19 §4).

  THE PICTURE OF THE SCHEME THE PAGE IS NOT IN IS DRAWN FROM THE ONE IT IS IN. The two palettes are generated behind
  `html[data-scheme]`, so an element cannot ask for the other scheme's tokens; and a colour literal here would be the
  one this product forbids. The other picture swaps the current ink and ground (dark from light is an ink ground with
  near-ink tiles and ground-coloured words), which is the same relationship the generated dark palette has. The one
  the page is in is drawn from its real tokens, so it is exact, and it changes the moment the choice does.

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
  import IconWell from '$lib/ui/IconWell.svelte';
  import { redraw } from '$lib/theme/draw.ts';
  import LookEditor from '$lib/theme/LookEditor.svelte';
  import { takeFix } from '$lib/theme/staged.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import { ownsRecord } from '../../levels.ts';
  import StateRow from './StateRow.svelte';

  /* EVERY AREA TAKES THE SAME PROPS. The device's own choices read none of them; the record's look asks whether the
     person is the owner, whose save installs it, or a member, whose save goes to Decide. */
  let props: AreaProps = $props();
  const owner = $derived(ownsRecord(props.shell.me));

  /* THIS AREA'S OWN WORDS, the ones the copy modules do not already hold. */
  const words = {
    reading: 'Reading',
    textLine: 'The size of the words in lists, tables and pages.',
    densityLine: 'How much room each row of a list takes.',
    now: (dark: boolean) => (dark ? 'Dark now' : 'Light now'),
  };

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

  /* WHICH SCHEME THE PAGE IS IN NOW, which decides which picture is drawn from the real tokens. `system` is the
     device's answer, and it is followed while the area is open: a laptop that turns dark at sunset turns this too. */
  const DARK = '(prefers-color-scheme: dark)';
  let deviceDark = $state(typeof matchMedia === 'function' && matchMedia(DARK).matches);
  $effect(() => {
    const mq = matchMedia(DARK);
    const heard = () => (deviceDark = mq.matches);
    heard();
    mq.addEventListener('change', heard);
    return () => mq.removeEventListener('change', heard);
  });
  const inNow = $derived<'light' | 'dark'>(scheme === 'system' ? (deviceDark ? 'dark' : 'light') : scheme);

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

  const SCHEMES = [
    ['light', copy.schemeLight, 'sun'],
    ['system', copy.schemeSystem, 'monitor'],
    ['dark', copy.schemeDark, 'moon'],
  ] as const;

  /* THE SPECIMEN'S ROWS, each with the glyph its kind of row carries in a list. */
  const SPECIMEN = ['doc', 'obligation', 'calendar'] as const;
</script>

<!--
  THE APP IN MINIATURE, in one scheme. Every piece is a shape and none is a word, so it is hidden from a screen reader:
  the button it sits in says which scheme it is. `other` is the scheme the page is not in, drawn from the swapped
  tokens (the file's head says why).
-->
{#snippet look(which: 'light' | 'dark', half = false)}
  <span class="look" data-look={which} data-other={which === inNow ? undefined : ''} data-half={half ? '' : undefined}>
    <span class="look-rail">
      <span class="look-mark"></span>
      <span class="look-item" data-on></span>
      <span class="look-item"></span>
      <span class="look-item"></span>
      <span class="look-item"></span>
      <span class="look-item look-live"></span>
    </span>
    <span class="look-main">
      <span class="look-title"></span>
      <span class="look-sentence"><span class="look-words"></span><span class="look-needs"></span></span>
      <span class="look-tiles">
        <span class="look-tile">
          <span class="look-well"></span>
          <span class="look-bars"><span></span><span></span><span></span><span></span><span class="look-high"></span></span>
          <span class="look-line"></span>
        </span>
        <span class="look-tile">
          <span class="look-well"></span>
          <span class="look-ring"></span>
          <span class="look-line"></span>
        </span>
      </span>
      <span class="look-row"></span>
      <span class="look-row"></span>
    </span>
  </span>
{/snippet}

<!-- ONE THING ON OR OFF IS A SWITCH at the end of the row that says what it does. It was two segments reading On and
     Off, which is a choice between two things. -->
{#snippet contrastSwitch()}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={moreContrast}
    aria-label={copy.contrast}
    onclick={() => pickContrast(!moreContrast)}><span class="switch-track"></span></button
  >
{/snippet}

<!--
  AND EVERY ONE OF THESE SAYS WHICH IS ON, to something that is not a stylesheet.

  Fifteen buttons on this screen (six swatches and nine segments) carried `data-on` and no
  `aria-pressed`. Measured on the deployed build: `aria-pressed` was `null` on all fifteen,
  so a screen reader heard "Light button, System button, Dark button" and could not tell
  which one the record was in. `13 §5.1` is that the meaning cannot live in the styling
  alone, and the People matrix cites that rule and gets it right, which is the tell: the fix
  was known, written down, and applied to one group.
-->
<Section title={copy.scheme}>
  <div class="pictures" role="group" aria-label={copy.scheme}>
    {#each SCHEMES as [v, label, icon] (v)}
      <button type="button" class="picture" aria-pressed={scheme === v} data-on={scheme === v ? '' : undefined} onclick={() => pickScheme(v)}>
        <span class="picture-shot" aria-hidden="true">
          {#if v === 'system'}
            {@render look('light')}
            {@render look('dark', true)}
          {:else}
            {@render look(v)}
          {/if}
        </span>
        <span class="picture-name">
          <Icon name={icon} size="m" />
          <span>{label}</span>
          {#if v === 'system'}<span class="picture-meta">{words.now(deviceDark)}</span>{/if}
        </span>
      </button>
    {/each}
  </div>

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
    the state said in something other than styling: `aria-checked` carries it.
  -->
  <StateRow icon="eye" title={copy.contrast} line={copy.contrastHint} action={contrastSwitch} />
</Section>

<!--
  THE READING SETTINGS, AND WHAT THEY DO, IN ONE PLACE. Text and density change `--text` and `--row-h`, which only lists
  read, so pressing Roomy here once changed nothing on this screen and a person had to leave to find out what they had
  chosen. The rows under the two choices are a list drawn the way every list is drawn, on the ground with a well per row,
  so each press shows its effect where it was made, with no toast.
-->
<Section title={words.reading}>
  <StateRow icon="doc" title={copy.textSize} line={words.textLine} />
  <div class="setting-under">
    <div class="segmented" role="group" aria-label={copy.textSize}>
      {#each [['sm', copy.textSmall], ['base', copy.textNormal], ['md', copy.textLarge]] as const as [v, label] (v)}
        <button
          type="button"
          class="segment"
          aria-pressed={text === v}
          data-on={text === v ? '' : undefined}
          onclick={() => ((text = v), set('text', v))}><span class="aa" data-size={v} aria-hidden="true">Aa</span>{label}</button
        >
      {/each}
    </div>
  </div>

  <StateRow icon="rows" title={copy.density} line={words.densityLine} />
  <div class="setting-under">
    <div class="segmented" role="group" aria-label={copy.density}>
      {#each [['compact', copy.densityCompact], ['comfortable', copy.densityComfortable], ['roomy', copy.densityRoomy]] as const as [v, label] (v)}
        <button
          type="button"
          class="segment"
          aria-pressed={density === v}
          data-on={density === v ? '' : undefined}
          onclick={() => ((density = v), set('density', v))}
          ><span class="spacing" data-density={v} aria-hidden="true"><span></span><span></span><span></span></span>{label}</button
        >
      {/each}
    </div>
  </div>

  <div class="specimen" aria-hidden="true">
    <p class="specimen-title">{copy.densityPreview}</p>
    <ul class="ledger ledger-lead specimen-rows">
      {#each copy.densityPreviewRows as row, i (row)}
        <li>
          <div class="line">
            <span class="line-mark"><IconWell name={SPECIMEN[i % SPECIMEN.length] ?? 'doc'} size="l" /></span>
            <span class="line-main"><span class="line-title specimen-name">{row}</span></span>
            <span class="line-amount"></span>
            <span class="line-when"></span>
          </div>
        </li>
      {/each}
    </ul>
  </div>
</Section>

<!--
  THE RECORD'S OWN COLOUR. `@braindog/theme` solves an entire coherent palette from one seed
  against every floor it defines, and until now nothing called it with anything but the house
  red, so a bakery and a type foundry looked identical. The swatches are suggestions, not the
  set: any colour that passes goes in, and one that does not says which floor it missed rather
  than being quietly approximated.
-->
<Section title={copy.accentTitle}>
  <p class="hint">{copy.accentHint}</p>
  <div class="swatches" role="group" aria-label={copy.accentTitle}>
    {#each ACCENTS as a (a.hex)}
      <button
        type="button"
        class="swatch"
        aria-pressed={accent === a.hex}
        data-on={accent === a.hex ? '' : undefined}
        style="--swatch:{a.hex}"
        aria-label={a.name}
        title={a.name}
        onclick={() => pickAccent(a.hex)}
      >
        {#if accent === a.hex}<Icon name="check" size="m" />{/if}
      </button>
    {/each}
    <button
      type="button"
      class="swatch swatch-off"
      aria-pressed={accent === null}
      data-on={accent === null ? '' : undefined}
      onclick={() => pickAccent(null)}
    >
      {#if accent === null}<Icon name="check" size="s" />{/if}{copy.accentHouse}
    </button>
  </div>
  {#if accentWrong}<p class="wrong" role="alert">{accentWrong}</p>{/if}
</Section>

<!--
  THE RECORD'S LOOK, which is everybody's, under the device's colour, which is this screen's alone (`21 §6`).
  The editor is its own component with its own styles, because this file's style block is the device choices'.
-->
<Section title={copy.lookTitle}>
  <p class="hint">{copy.lookHint}</p>
  <LookEditor {owner} {staged} />
</Section>

<style>
  /* A CONTROL UNDER A ROW (`.setting-under`) AND THE FRAME OF A CHOICE SHOWN AS PICTURES (`.pictures`) ARE
     `settings.css`'s, which every area shares; the drawing inside each frame is this file's. */

  /* The hint sits above the control it explains, not beside it: a sentence in a column beside a
     row of swatches is read after the choice has been made. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* ── the picture: one scheme's app, in proportions of the picture's own width (`cqi`) ── */

  /* WHAT A PICTURE IS DRAWN FROM. The scheme the page is in takes its real tokens; the other takes the current ink and
     ground swapped. Everything drawn in words or marks is a share of the picture's ink, so it holds in all four. */
  .look {
    --l-ground: var(--sunk);
    --l-glow: var(--ground-glow);
    --l-tile: var(--bg);
    --l-glass: var(--glass);
    --l-ink: var(--ink);
    --l-lift: 0 0.4cqi 1.6cqi color-mix(in srgb, var(--l-ink) 10%, transparent);

    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: 23cqi minmax(0, 1fr);
    gap: 4cqi;
    padding: 4cqi;
    background: radial-gradient(90cqi 40cqi at 50% -12cqi, var(--l-glow), transparent), var(--l-ground);
  }

  /* DARK, DRAWN FROM A LIGHT PAGE: the ink is the ground, the tiles a step off it, the words the page's own ground. */
  .look[data-other][data-look='dark'] {
    --l-ground: var(--ink);
    --l-glow: color-mix(in srgb, var(--bg) 9%, transparent);
    --l-tile: color-mix(in srgb, var(--ink) 93%, var(--bg));
    --l-glass: color-mix(in srgb, var(--ink) 89%, var(--bg));
    --l-ink: var(--bg);
  }

  /* LIGHT, DRAWN FROM A DARK PAGE: the ink is the tile, the ground a step under it, the words the page's own ground. */
  .look[data-other][data-look='light'] {
    --l-ground: color-mix(in srgb, var(--ink) 92%, var(--bg));
    --l-glow: color-mix(in srgb, var(--ink) 90%, transparent);
    --l-tile: var(--ink);
    --l-glass: color-mix(in srgb, var(--ink) 97%, var(--bg));
    --l-ink: var(--bg);
  }

  /* IN DARK A TILE IS TOLD FROM THE GROUND BY ITS FILL ALONE, so the dark picture's tiles carry no lift. */
  .look[data-look='dark'] {
    --l-lift: 0 0 0 0 transparent;
  }

  /* SYSTEM IS BOTH: the dark picture over the light one, cut on the diagonal. */
  .look[data-half] {
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }

  .look[data-half]:dir(rtl) {
    clip-path: polygon(0 0, 100% 100%, 0 100%);
  }

  /* The rail: a glass card with the mark, five places and the one that is here. */
  .look-rail {
    display: flex;
    flex-direction: column;
    gap: 2.2cqi;
    padding: 3cqi 2.2cqi;
    border-radius: 3.4cqi;
    background: var(--l-glass);
    box-shadow:
      0 0 0 0.4cqi color-mix(in srgb, var(--l-ink) 7%, transparent),
      var(--l-lift);
  }

  .look-mark {
    inline-size: 5.4cqi;
    block-size: 3.8cqi;
    margin-block-end: 1.4cqi;
    border-radius: 1cqi;
    background: var(--accent);
  }

  .look-item {
    display: flex;
    align-items: center;
    gap: 1.6cqi;
    padding: 0.7cqi;
    margin: -0.7cqi;
    border-radius: 1.4cqi;
  }

  .look-item::before {
    content: '';
    flex: none;
    inline-size: 3.6cqi;
    block-size: 3.6cqi;
    border-radius: 1.1cqi;
    background: color-mix(in srgb, var(--l-ink) 14%, transparent);
  }

  .look-item::after {
    content: '';
    flex: 1;
    max-inline-size: 9cqi;
    block-size: 1.3cqi;
    border-radius: 1cqi;
    background: color-mix(in srgb, var(--l-ink) 22%, transparent);
  }

  /* "HERE": the ink well and the white row, as the real rail draws it. */
  .look-item[data-on] {
    background: color-mix(in srgb, var(--l-tile) 70%, transparent);
  }

  .look-item[data-on]::before,
  .look-item[data-on]::after {
    background: var(--l-ink);
  }

  /* An agent at work: its face ringed in `live`. */
  .look-live {
    margin-block-start: auto;
  }

  .look-live::before {
    border-radius: 50%;
    background: transparent;
    box-shadow: inset 0 0 0 0.6cqi var(--live);
  }

  .look-main {
    display: flex;
    flex-direction: column;
    gap: 2.2cqi;
    min-inline-size: 0;
    padding-block-start: 0.8cqi;
  }

  .look-title {
    inline-size: 26cqi;
    block-size: 3.4cqi;
    border-radius: 1cqi;
    background: var(--l-ink);
  }

  /* The sentence, and its phrase that needs him in red. */
  .look-sentence {
    display: flex;
    gap: 1cqi;
    block-size: 1.6cqi;
  }

  .look-words,
  .look-needs {
    border-radius: 1cqi;
  }

  .look-words {
    inline-size: 34cqi;
    background: color-mix(in srgb, var(--l-ink) 26%, transparent);
  }

  .look-needs {
    inline-size: 10cqi;
    background: var(--danger);
  }

  .look-tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2.4cqi;
    margin-block-start: 0.6cqi;
  }

  .look-tile {
    display: flex;
    flex-direction: column;
    gap: 1.8cqi;
    padding: 2.4cqi;
    border-radius: 3cqi;
    background: var(--l-tile);
    box-shadow: var(--l-lift);
  }

  .look-well {
    inline-size: 4cqi;
    block-size: 4cqi;
    border-radius: 1.2cqi;
    background: color-mix(in srgb, var(--l-ink) 8%, transparent);
  }

  /* A trend in greys with one ink highlight. */
  .look-bars {
    display: flex;
    align-items: end;
    gap: 1cqi;
    block-size: 8cqi;
  }

  .look-bars > span {
    flex: 1;
    border-radius: 0.6cqi 0.6cqi 0 0;
    background: color-mix(in srgb, var(--l-ink) 24%, transparent);
  }

  .look-bars > span:nth-child(1) {
    block-size: 45%;
  }

  .look-bars > span:nth-child(2) {
    block-size: 70%;
  }

  .look-bars > span:nth-child(3) {
    block-size: 55%;
  }

  .look-bars > span:nth-child(4) {
    block-size: 80%;
  }

  .look-bars > .look-high {
    block-size: 100%;
    background: var(--l-ink);
  }

  /* Progress as a ring, three quarters round in ink over its grey track. */
  .look-ring {
    box-sizing: border-box;
    inline-size: 8cqi;
    block-size: 8cqi;
    border: 1.4cqi solid color-mix(in srgb, var(--l-ink) 14%, transparent);
    border-block-start-color: var(--l-ink);
    border-inline-end-color: var(--l-ink);
    border-block-end-color: var(--l-ink);
    border-radius: 50%;
  }

  .look-line {
    inline-size: 80%;
    block-size: 1.2cqi;
    border-radius: 1cqi;
    background: color-mix(in srgb, var(--l-ink) 18%, transparent);
  }

  /* Rows on the ground: a well and a title, with a hairline between them and no box. */
  .look-row {
    display: flex;
    align-items: center;
    gap: 1.8cqi;
    padding-block: 1.2cqi;
  }

  .look-row + .look-row {
    border-block-start: 0.3cqi solid color-mix(in srgb, var(--l-ink) 10%, transparent);
  }

  .look-row::before {
    content: '';
    flex: none;
    inline-size: 3.4cqi;
    block-size: 3.4cqi;
    border-radius: 1cqi;
    background: color-mix(in srgb, var(--l-ink) 12%, transparent);
  }

  .look-row::after {
    content: '';
    inline-size: 30cqi;
    block-size: 1.4cqi;
    border-radius: 1cqi;
    background: color-mix(in srgb, var(--l-ink) 30%, transparent);
  }

  /* ── reading ── */

  /* THE SEGMENTS CARRY A PICTURE OF THEIR EFFECT before their word: "Aa" at three sizes, three lines at three
     spacings. A segment is 44 on BOTH axes under a thumb (`controls.css`), and the picture sits on the word's line. */
  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-inline-size: var(--ctl-h);
  }

  .aa {
    color: var(--dim);
    font-weight: 600;
    line-height: 1;
  }

  .segment[data-on] .aa {
    color: var(--ink);
  }

  .aa[data-size='sm'] {
    font-size: var(--t-xs);
  }

  .aa[data-size='base'] {
    font-size: var(--t-row);
  }

  .aa[data-size='md'] {
    font-size: var(--t-group);
  }

  .spacing {
    display: inline-grid;
    align-content: center;
    inline-size: 14px;
    color: var(--dim);
  }

  .segment[data-on] .spacing {
    color: var(--ink);
  }

  .spacing > span {
    block-size: 1.5px;
    border-radius: 1px;
    background: currentColor;
  }

  .spacing[data-density='compact'] {
    row-gap: 2px;
  }

  .spacing[data-density='comfortable'] {
    row-gap: 3.5px;
  }

  .spacing[data-density='roomy'] {
    row-gap: 5px;
  }

  /* THE SPECIMEN: a list as every list is drawn, at the chosen row height and the chosen body step, under its own small
     label, starting where the rows above it start their titles. */
  .specimen {
    margin-block-start: var(--sp-2);
    padding-inline-start: calc(var(--well) + var(--sp-3));
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .specimen-title {
    margin: 0 0 var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .specimen-rows {
    max-inline-size: 36rem;
  }

  .specimen-name {
    color: var(--ink2);
    font-size: var(--text);
    transition: font-size var(--d-state) var(--ease-out);
  }

  /* ── the record's colour ── */

  .swatches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  /* A SWATCH IS THE COLOUR, round, and the tick is drawn ON it rather than beside it: a selected state that lives
     outside the thing selected is a state people read as belonging to the next one. Chosen, it is ringed in ink a gap
     away, the same ring the chosen scheme wears. */
  .swatch {
    display: inline-grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--swatch, var(--s1));
    /* THE LABEL ON A FILL, which is the token the theme solves for exactly this: a tick drawn in
       white on an ochre swatch is the one place a literal would be wrong twice over. */
    color: var(--accent-ink);
    border: 0;
    border-radius: var(--r-pill);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
    cursor: pointer;
    transition: box-shadow var(--d-state) var(--ease-out);
  }

  .swatch[data-on] {
    box-shadow:
      0 0 0 2px var(--sunk),
      0 0 0 4px var(--ink);
  }

  /* HOUSE IS A WORD, the product's own colour: a quiet pill on the ground. */
  .swatch-off {
    gap: 6px;
    grid-auto-flow: column;
    inline-size: auto;
    padding-inline: var(--sp-4);
    background: var(--hover-wash);
    box-shadow: none;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
  }

  @media (pointer: coarse) {
    .swatch {
      inline-size: var(--tap);
      block-size: var(--tap);
    }

    .swatch-off {
      inline-size: auto;
    }
  }

  /* A refusal a person cannot act on teaches them the control is broken, so the floor it missed is
     printed rather than a shrug. */
  .wrong {
    margin: var(--sp-3) 0 0;
    max-inline-size: var(--measure);
    color: var(--danger);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* AT A PHONE'S WIDTH the specimen's rows take the column, one gutter in. */
  @media (width < 640px) {
    .specimen {
      padding-inline-start: 0;
    }
  }
</style>
