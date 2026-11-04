<!--
  Where a row applies, as one chip: the project's 8px dot in its slot and its name, or the globe and "Everywhere". It is `Chip`'s box: 28 tall, radius 8, `--tile-2`, the name at `--fs-ctl`.

  Every row of a list with a `scope` field wears it, on its list, on its page and in Needs you, so the answer to "which
  project is this for" reads the same wherever the row is. IN A META LINE (`inline`) it is no box at all: the dot and
  the name at 13, in the sentence ("on ● Kiln").

  THE DOT IS THE PROJECT'S SLOT (`slotOf` in `face.ts`): its hue picks one of the eight category colours, which clear
  3:1 as a mark on every surface in light and dark. The name always sits beside it, so colour is never the only signal.

  "EVERYWHERE" IS A PLACE AND NOT A GAP. An empty scope field was drawn as an unset chip, "+ Where it applies", which
  says the row is missing something when it applies to every project there is. The globe says it as the answer it is.

  A BUTTON ONLY WHERE A PRESS DOES SOMETHING. Given `onmove`, the chip opens the place a row can be moved to and says
  so to a screen reader; without it, the chip is words and draws no control, because a control that cannot act is
  absent and never greyed.

  THE NAME KEEPS TWELVE CHARACTERS before it gives way: a chip that cut "Marlow & Co Studio" to "Marl…" in a narrow
  cell would name a different project to anybody who has two starting the same way.
-->
<script lang="ts">
  import { slotOf } from './face.ts';
  import Icon from './Icon.svelte';
  import { words, type Scope } from '../record/scope-move.ts';

  let {
    scope,
    size = 's',
    inline = false,
    onmove,
  }: {
    /** The project the row applies to, or `null` for everywhere. */
    scope: Scope | null;
    /** `s` in a list's row and in Decide; `m` in a row's own header. */
    size?: 's' | 'm';
    /** In a meta line: the dot and the name in the sentence, no box. */
    inline?: boolean;
    /** Opens the move, where the reader may make one. */
    onmove?: (() => void) | undefined;
  } = $props();

  const name = $derived(scope?.name ?? words.everywhere);
  /* ONLY A NAME LONGER THAN TWELVE CHARACTERS IS HELD AT TWELVE: a shorter one is as wide as its words. */
  const long = $derived(name.length > 12);
  const slot = $derived(scope === null ? null : slotOf(scope.hue));
  /* "EVERYWHERE" SAYS WHAT IT MEANS when a pointer rests on it: a row tied to no one project. */
  const hint = $derived(scope === null ? words.everywhereSaid : undefined);
</script>

{#snippet body()}
  {#if scope === null}<Icon name="globe" size="s" />{:else}<span class="scope-dot" data-slot={slot} aria-hidden="true"></span>{/if}<span
    class="scope-name"
    data-long={long ? '' : undefined}>{name}</span
  >
{/snippet}

{#if onmove}
  <button type="button" class="scope-chip scope-move tap" title={hint} data-size={size} aria-label={words.moveLabel(name)} onclick={onmove}>
    {@render body()}<Icon name="chevronDown" size="s" />
  </button>
{:else}
  <span class="scope-chip" title={hint} data-size={size} data-inline={inline ? '' : undefined}>{@render body()}</span>
{/if}

<style>
  /* CHIP'S BOX: 28 tall at every width, inside the 44px target `.tap` grows under a thumb. */
  .scope-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-inline-size: 0;
    max-inline-size: 100%;
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-2);
    background: var(--tile-2, var(--hover));
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: calc(20px * var(--type, 1));
    vertical-align: middle;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .scope-chip[data-size='m'] {
    padding-inline: var(--sp-3);
  }

  /* IN A META LINE: no box, the dot and the name at the meta size, in the sentence's own ink. */
  .scope-chip[data-inline] {
    gap: var(--sp-1);
    min-block-size: 0;
    padding-inline: 0;
    background: none;
    border-radius: 0;
    color: inherit;
    font-size: var(--fs-meta);
    font-weight: inherit;
    line-height: inherit;
    vertical-align: baseline;
  }

  .scope-move {
    cursor: pointer;
  }

  /* A FILL ONLY UNDER A MOUSE: a tapped chip on a phone would keep it after the finger lifted. */
  @media (hover: hover) and (pointer: fine) {
    .scope-move:hover {
      background: var(--hover, var(--tile-2));
      color: var(--ink);
    }
  }

  /* THE PROJECT'S DOT, 8px, in its slot's colour. */
  .scope-dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    background: var(--ph, var(--ink-3));
    border-radius: var(--r-round);
  }

  .scope-dot[data-slot='blue'] {
    --ph: var(--cat-blue-fill, var(--cat-blue, var(--info)));
  }

  .scope-dot[data-slot='violet'] {
    --ph: var(--cat-violet-fill, var(--cat-violet, var(--info)));
  }

  .scope-dot[data-slot='pink'] {
    --ph: var(--cat-pink-fill, var(--cat-pink, var(--ink-2)));
  }

  .scope-dot[data-slot='teal'] {
    --ph: var(--cat-teal-fill, var(--cat-teal, var(--good)));
  }

  .scope-dot[data-slot='sky'] {
    --ph: var(--cat-sky-fill, var(--cat-sky, var(--info)));
  }

  .scope-dot[data-slot='yellow'] {
    --ph: var(--cat-yellow-fill, var(--cat-yellow, var(--warn)));
  }

  .scope-dot[data-slot='lime'] {
    --ph: var(--cat-lime-fill, var(--cat-lime, var(--good)));
  }

  .scope-dot[data-slot='slate'] {
    --ph: var(--cat-slate-fill, var(--cat-slate, var(--ink-3)));
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

  @media (forced-colors: active) {
    .scope-dot {
      background: CanvasText;
    }
  }
</style>
