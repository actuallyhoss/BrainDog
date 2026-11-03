<!--
  A chip: a short label in its own small capsule, a LINK to the thing it names when given `href`, or, given a tone, a
  state as its dot and its word.

    <Chip label="Northbound" href="/p/northbound" icon="target" />   one linked thing
    <Chip label="Mail" />                                          a label
    <Chip label="running" tone="good" />                           a state: the dot and the word, nothing round them

  ONE CHIP PER LINKED THING, EACH ITS OWN LINK (ui-perfect, 3 Nov): never "Lists: Mail, Events." as one sentence. Several
  go in a `ChipList`, which wraps them.

  THE BOX: 28 tall, a capsule, the soft fill, the word at `--fs-ctl` 500 in `--ink-2`, an optional 16 glyph 4 before it.
  A linked chip takes the row wash on hover and the focus ring, and is a 44 target under a thumb (`.tap`). The word is
  cut with an ellipsis past 24ch, its whole name kept in the title.

  A STATE IS NOT BOXED. Given `tone`, the chip is the dot and the word with nothing round them, as every status in the
  product is drawn: the glyph is part of the token, not a choice here. Under simulated dichromacy the four intent hues
  collapse (13 §2.3), so colour never carries meaning alone, and there is no API in this app that lets a caller render
  an intent without its glyph and its word.
-->
<script lang="ts">
  import { TONES } from 'braindog-render';
  import type { Tone } from 'braindog-render';
  import { at } from '../at.ts';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons.ts';

  let {
    label,
    tone,
    href,
    icon,
  }: {
    label: string;
    tone?: Tone | undefined;
    /** Where the chip goes: an app path (said inside the record, as every link here is) or a full address. */
    href?: string | undefined;
    /** A 16px glyph before the word. Not drawn on a state chip, whose dot is its glyph. */
    icon?: IconName | undefined;
  } = $props();

  /* Sentence case, whatever the stored value was: `running` and `on track` are words a person reads. */
  const said = $derived(label ? label.charAt(0).toUpperCase() + label.slice(1) : label);
  const outside = $derived(href !== undefined && /^[a-z][a-z0-9+.-]*:/iu.test(href));
  const to = $derived(href === undefined ? undefined : outside ? href : at(href));
</script>

{#if to !== undefined && !tone}
  <a class="chip chip-link tap" href={to} title={said.length > 24 ? said : undefined} target={outside ? '_blank' : undefined} rel={outside ? 'noopener noreferrer' : undefined}>
    {#if icon}<Icon name={icon} size="s" />{/if}<span class="chip-word">{said}</span>
  </a>
{:else}
  <span class="chip" data-intent={tone} title={!tone && said.length > 24 ? said : undefined}>
    {#if tone}<span class="glyph" role="img" aria-label={TONES[tone].label}>{TONES[tone].glyph}</span>{:else if icon}<Icon name={icon} size="s" />{/if}
    <span class="chip-word">{said}</span>
  </span>
{/if}

<style>
  /* THE BOX: 28 tall, a capsule, the quiet fill, the control's label size. */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    box-sizing: border-box;
    max-inline-size: 100%;
    min-block-size: var(--btn-h-sm);
    padding-inline: var(--ctl-pad-sm, 12px);
    background: var(--soft-fill);
    border-radius: var(--r-pill);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: 20px;
    white-space: nowrap;
    vertical-align: middle;
  }

  /* A GLYPH LEADS BY A HAIR LESS PADDING, so the capsule's two ends look even. */
  .chip:has(> :global(.icon)) {
    padding-inline-start: 10px;
  }

  .chip-word {
    min-inline-size: 0;
    max-inline-size: 24ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip-link {
    color: var(--ink);
    text-decoration: none;
    transition: background-color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .chip-link:hover {
      background: color-mix(in oklab, var(--ink) 9%, transparent);
    }
  }

  .chip-link:focus-visible {
    outline: 2px solid var(--focus-ring, var(--focus));
    outline-offset: 2px;
  }

  /* A STATE IS ITS DOT AND ITS WORD, AND NOTHING ROUND THEM. `blocks.css` draws every `.glyph` as the dot in
     `--tone-fill`, with its character indented out of sight and the intent's name kept for a screen reader: colour is
     the second channel, the word is the first. */
  .chip[data-intent] {
    gap: var(--sp-2);
    min-block-size: 0;
    padding-inline: 0;
    background: none;
    border-radius: 0;
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .chip[data-intent] .chip-word {
    max-inline-size: none;
  }

  @media (forced-colors: active) {
    .chip:not([data-intent]) {
      border: 1px solid CanvasText;
    }
  }
</style>
