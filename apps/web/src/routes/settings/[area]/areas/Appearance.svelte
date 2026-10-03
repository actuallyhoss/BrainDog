<!--
  Settings > Appearance: how BrainDog looks to this person, in one section, and the record's own look under it.

  THE PERSON'S LOOK FOLLOWS THEM (`35`). Scheme, text size, density, contrast and accent are kept by the record as their
  own `look.*` prefs, so every device they sign in on looks the same; the cookie is only the first-paint copy
  (`pref.ts`). A record too old to keep them leaves them on the device, and the hint says which.

  ONE SECTION, FOUR CHOICES AND THE THING THEY CHANGE (DIRECTION §35: calm, few controls per screen). The scheme, the
  text size, the density and the colour were four sections, the scheme drawn as three large pictures of the app, and a
  person changing how the product reads scrolled past a screen of chrome to find the next choice. They are one column of
  short choices now, beside a preview that is the app itself in small: drawn from the same tokens every screen reads, so
  every press changes it the moment it is made, in the scheme, size, row height and colour chosen, with no toast.

  AND THE SCHEME IS STILL A THREE-WAY CHOICE, not a toggle offering the opposite. The predecessor's had three states and
  a one-way UI: once a person chose light or dark, only clearing local storage restored "match the system". "Match the
  system" must stay reachable (19 §4).

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
  import { untrack } from 'svelte';
  import { redraw } from '$lib/theme/draw.ts';
  import { follow } from '$lib/theme/follow.ts';
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
    looks: 'How it looks',
    hint: 'Yours, on every device you sign in on.',
    hintDevice: 'Kept on this device.',
    /* THE PREVIEW'S SENTENCE, with its one phrase that needs the person in red, as a page's headline draws it. */
    said: 'Three things need you today,',
    needs: 'one is late.',
  };

  /* A THEME REFUSED AT INSTALL, handed over by the add-on screen's Fix and install. Taken once, so a reload of this
     screen opens as it always does. */
  const staged = takeFix();

  /* SET IT AND REMEMBER IT, in one call. These were two things and the second was never written:
     every preference in this product was lost on refresh, and a setting that does not survive a
     reload is a setting somebody changes once and then stops trusting.

     A DENSITY PICKED HERE BEATS THE RECORD'S LOOK for this person, so the look is drawn again without its row height. */
  const set = (key: 'scheme' | 'text' | 'density', value: string) => {
    pref.apply(key, value);
    if (key === 'density') redraw();
    settle();
  };

  /* THE RECORD'S WORD FIRST, when this screen is the first a tab opens: the root layout's `draw` adopts it behind a
     dynamic import that can land after this runs, and these controls and the hint would then be the cookie's. Once per
     tab, so it is nothing when the layout got there first. */
  follow({ me: untrack(() => props.shell.me) });

  /* SEEDED FROM WHAT IS REMEMBERED, so the controls show the state the page is already in rather
     than the default the state happens to start at. */
  const held = pref.read();
  /* WHERE A CHOICE IS KEPT, said in the hint: the record, or this device when there is no record or it refused a key.
     Read again after each choice settles, so a host that refuses one is not left claiming "every device". */
  let follows = $state(pref.follows());
  const settle = () => void pref.settled().then(() => (follows = pref.follows()));
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
    settle();
    toasts.push(hex ? copy.accentSet(ACCENTS.find((a) => a.hex === hex)?.name ?? hex) : copy.accentReset);
  }

  /* THE ONE PREFERENCE WHOSE ATTRIBUTE IS NOT ITS VALUE: the switch is a boolean and the attribute
     is the literal `hc`, so it has its own writer rather than a fourth key in `apply`. */
  function pickContrast(on: boolean) {
    moreContrast = on;
    pref.contrast(on);
    settle();
  }

  function pickScheme(v: 'light' | 'system' | 'dark') {
    scheme = v;
    /* `system` IS AN ANSWER AND NOT AN ABSENCE, so it is written down: removing the attribute
       without recording the choice would make the next visit read a stale `dark` from the cookie. */
    pref.apply('scheme', v === 'system' ? null : v);
    settle();
  }

  const SCHEMES = [
    ['light', copy.schemeLight, 'sun'],
    ['system', copy.schemeSystem, 'monitor'],
    ['dark', copy.schemeDark, 'moon'],
  ] as const;

  const TEXTS = [
    ['sm', copy.textSmall],
    ['base', copy.textNormal],
    ['md', copy.textLarge],
  ] as const;

  const DENSITIES = [
    ['compact', copy.densityCompact],
    ['comfortable', copy.densityComfortable],
    ['roomy', copy.densityRoomy],
  ] as const;

  /* THE PREVIEW'S ROWS, each with the glyph its kind of row carries in a list. */
  const SPECIMEN = ['doc', 'obligation', 'calendar'] as const;
</script>

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
<Section title={words.looks}>
  <p class="hint">{follows ? words.hint : words.hintDevice}</p>
  <div class="looks">
    <div class="choices">
      <div class="choice">
        <span class="choice-name" id="choice-scheme">{copy.scheme}</span>
        <div class="segmented" role="group" aria-labelledby="choice-scheme">
          {#each SCHEMES as [v, label, icon] (v)}
            <button type="button" class="segment" aria-pressed={scheme === v} data-on={scheme === v ? '' : undefined} onclick={() => pickScheme(v)}
              ><Icon name={icon} size="s" />{label}</button
            >
          {/each}
        </div>
      </div>

      <div class="choice">
        <span class="choice-name" id="choice-text">{copy.textSize}</span>
        <div class="segmented" role="group" aria-labelledby="choice-text">
          {#each TEXTS as [v, label] (v)}
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

      <div class="choice">
        <span class="choice-name" id="choice-density">{copy.density}</span>
        <div class="segmented" role="group" aria-labelledby="choice-density">
          {#each DENSITIES as [v, label] (v)}
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

      <!--
        THE PERSON'S OWN COLOUR, over the record's look. `@braindog/theme` solves an entire coherent palette from one seed
        against every floor it defines, and until now nothing called it with anything but the house
        red, so a bakery and a type foundry looked identical. The swatches are suggestions, not the
        set: any colour that passes goes in, and one that does not says which floor it missed rather
        than being quietly approximated.
      -->
      <div class="choice">
        <span class="choice-name" id="choice-accent">{copy.accentTitle}</span>
        <span class="choice-line">{copy.accentHint}</span>
        <div class="swatches" role="group" aria-labelledby="choice-accent">
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
      </div>
    </div>

    <!--
      THE PREVIEW: the app in small, drawn from the tokens every screen reads, so it is never a picture of a choice but
      the choice itself. The mark wears the record's colour, the sentence carries its one red phrase, and the rows are a
      list drawn the way every list is drawn, at the chosen row height and text size. Shapes and sample words, never a
      control, so it is hidden from a screen reader: the choices beside it say what they are.
    -->
    <div class="preview" aria-hidden="true">
      <p class="preview-name">{copy.densityPreview}</p>
      <div class="pv">
        <div class="pv-bar">
          <span class="pv-mark"></span>
          <span class="pv-place" data-on></span>
          <span class="pv-place"></span>
          <span class="pv-place"></span>
        </div>
        <div class="pv-tile">
          <div class="pv-head">
            <IconWell name="today" />
            <span class="pv-title">{copy.today}</span>
          </div>
          <p class="pv-said">{words.said} <span class="pv-needs">{words.needs}</span></p>
          <ul class="ledger ledger-lead pv-rows">
            {#each copy.densityPreviewRows as row, i (row)}
              <li>
                <div class="line">
                  <span class="line-mark"><IconWell name={SPECIMEN[i % SPECIMEN.length] ?? 'doc'} size="l" /></span>
                  <span class="line-main"><span class="line-title pv-row">{row}</span></span>
                  <span class="line-amount"></span>
                  <span class="line-when"></span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
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
  THE RECORD'S LOOK, which is everybody's, under the person's own choices, which are theirs alone (`21 §6`).
  The editor is its own component with its own styles, because this file's style block is the device choices'.
-->
<Section title={copy.lookTitle}>
  <p class="hint">{copy.lookHint}</p>
  <LookEditor {owner} {staged} />
</Section>

<style>
  /* The hint sits above the control it explains, not beside it: a sentence in a column beside a
     row of swatches is read after the choice has been made. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* ONE COLUMN ON A PHONE, THE PREVIEW FIRST: a person sees what they are changing before the choices that change it.
     From 1100px up the choices stand beside it, and the preview stays in view while they are pressed. */
  .looks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
    margin-block-end: var(--sp-4);
  }

  .preview {
    order: -1;
  }

  @media (width >= 1100px) {
    .looks {
      grid-template-columns: minmax(0, 1fr) minmax(0, 24rem);
      align-items: start;
    }

    .preview {
      order: 0;
      position: sticky;
      inset-block-start: var(--sp-6);
    }
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .choice {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--sp-2);
  }

  .choice-name {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
  }

  .choice-line {
    margin-block-start: calc(var(--sp-1) * -1);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ── the segments ── */

  /* THE SEGMENTS CARRY A PICTURE OF THEIR EFFECT before their word: a glyph for the scheme, "Aa" at three sizes, three
     lines at three spacings. A segment is 44 on BOTH axes under a thumb (`controls.css`), and the picture sits on the
     word's line. */
  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-inline-size: var(--ctl-h);
  }

  .segment :global(svg),
  .aa,
  .spacing {
    color: var(--dim);
  }

  .segment[data-on] :global(svg),
  .segment[data-on] .aa,
  .segment[data-on] .spacing {
    color: var(--ink);
  }

  .aa {
    font-weight: 600;
    line-height: 1;
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

  /* ── the record's colour ── */

  .swatches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  /* A SWATCH IS THE COLOUR, round, and the tick is drawn ON it rather than beside it: a selected state that lives
     outside the thing selected is a state people read as belonging to the next one. Chosen, it is ringed in ink a gap
     away. */
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
    margin: var(--sp-1) 0 0;
    max-inline-size: var(--measure);
    color: var(--danger-text);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* ── the preview ── */

  .preview-name {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* THE GROUND AND ITS LIGHT, as the app's own ground, with the glass bar and one tile on it. */
  .pv {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border-radius: var(--r-lg);
    background: radial-gradient(120% 60% at 50% -20%, var(--ground-glow), transparent), var(--sunk);
    box-shadow: inset 0 0 0 1px var(--line-soft);
  }

  .pv-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    background: var(--glass);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 7%, transparent);
  }

  /* THE MARK WEARS THE RECORD'S COLOUR, which is where a person sees the colour they chose. */
  .pv-mark {
    inline-size: 18px;
    block-size: 14px;
    border-radius: 4px;
    background: var(--accent);
    transition: background var(--d-state) var(--ease-out);
  }

  .pv-place {
    inline-size: 36px;
    block-size: 6px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--ink) 18%, transparent);
  }

  .pv-place[data-on] {
    background: var(--ink);
  }

  .pv-tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    background: var(--bg);
    box-shadow: var(--e1);
  }

  .pv-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .pv-title {
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
  }

  /* THE SENTENCE AND THE ROWS READ `--text`, the size chosen, and the rows `--row-h` through the list they sit in. */
  .pv-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--text);
    line-height: var(--lh-body);
    transition: font-size var(--d-state) var(--ease-out);
  }

  .pv-needs {
    color: var(--danger-text);
    font-weight: 500;
  }

  .pv-row {
    color: var(--ink2);
    font-size: var(--text);
    transition: font-size var(--d-state) var(--ease-out);
  }
</style>
