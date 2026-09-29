<!--
  Where a row applies, as one chip: the project's mark in its hue and its name, or the globe and "Everywhere".
  Every row of a list with a `scope` field wears it, on its list, on its page and in Decide, so the
  answer to "which project is this for" reads the same wherever the row is.

  "EVERYWHERE" IS A PLACE AND NOT A GAP. An empty scope field was drawn as an unset chip, "+ Where it applies", which
  says the row is missing something when it applies to every project there is. The globe says it as the answer it is.

  A BUTTON ONLY WHERE A PRESS DOES SOMETHING. Given `onmove`, the chip opens the place a row can be moved to and says
  so to a screen reader; without it, the chip is words and draws no control, because a control that cannot act is
  absent and never greyed.

  THE NAME KEEPS TWELVE CHARACTERS before it gives way: a chip that cut "Marlow & Co Studio" to
  "Marl…" in a narrow cell would name a different project to anybody who has two starting the same way.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { words, type Scope } from '../record/scope-move.ts';

  let {
    scope,
    size = 's',
    onmove,
  }: {
    /** The project the row applies to, or `null` for everywhere. */
    scope: Scope | null;
    /** `s` in a list's row and in Decide; `m` in a row's own header. */
    size?: 's' | 'm';
    /** Opens the move, where the reader may make one. */
    onmove?: (() => void) | undefined;
  } = $props();

  const name = $derived(scope?.name ?? words.everywhere);
  /* ONLY A NAME LONGER THAN TWELVE CHARACTERS IS HELD AT TWELVE: a shorter one is as wide as its words. */
  const long = $derived(name.length > 12);
</script>

{#snippet body()}
  <!-- THE MARK IS DRAWN, NOT TYPESET, by `rows.css`'s `.thing-glyph`, so a chip's mark and a list's row mark are one
       shape; its hue is the project's own, set here and read by the rule below. -->
  {#if scope === null}<Icon name="globe" size="s" />{:else if scope.mark !== null}<span
      class="scope-mark thing-glyph"
      data-shape={scope.mark}
      style={scope.hue === null ? undefined : `--hue:${scope.hue}`}
      aria-hidden="true"
    ></span>{/if}<span class="scope-name" data-long={long ? '' : undefined}>{name}</span>
{/snippet}

{#if onmove}
  <button type="button" class="scope-chip scope-move tap" data-size={size} aria-label={words.moveLabel(name)} onclick={onmove}>
    {@render body()}<Icon name="chevronDown" size="s" />
  </button>
{:else}
  <span class="scope-chip" data-size={size}>{@render body()}</span>
{/if}

<style>
  /* A PILL ON THE WASH, the shape every choice in the product has, and 28px tall at every width, inside
     the 44px target `.tap` grows under a thumb. */
  .scope-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
    max-inline-size: 100%;
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-2);
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: var(--lh-tight);
    vertical-align: middle;
  }

  .scope-chip[data-size='m'] {
    padding-inline: var(--sp-3);
    font-size: var(--t-sm);
  }

  .scope-move {
    cursor: pointer;
  }

  /* A WASH ONLY UNDER A MOUSE: a tapped chip on a phone would keep it after the finger lifted. */
  @media (hover: hover) and (pointer: fine) {
    .scope-move:hover {
      background: var(--hold-wash);
      color: var(--ink);
    }
  }

  /* The project's own hue, the one identity accent, and the name's colour where it declares none. */
  .scope-mark {
    margin-inline-end: 0;
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .scope-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* TWELVE CHARACTERS AND THE ELLIPSIS, at the least, before a long name gives way. */
  .scope-name[data-long] {
    min-inline-size: 13ch;
  }
</style>
