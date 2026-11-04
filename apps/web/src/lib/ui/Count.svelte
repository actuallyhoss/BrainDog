<!--
  The one filled badge in the product, and the one pill ("pills only for counts"; 2.A.2): a red capsule
  with a count in it, for what needs the reader.

  EVERY NEEDS-YOU COUNT IS THIS ONE: the top bar's, the tab bar's, the rail's and the sidebar's. It was drawn four
  ways (a red square, a red circle with the ground's colour as its figure, a pink pill with red words, a plain grey
  number), so one count read as four things. Every other count is a plain number in `--ink-3` beside its word.

  THE FILL IS `--red-fill` AND THE FIGURE IS WHITE IN BOTH SCHEMES: the dark scheme drew a dark figure on a light red,
  which read as a different control. 20 tall, 12/20 at 600, tabular. `size="s"` is the tab bar's: 18 tall, with a 2px
  ring of the bar's own colour so it reads cut out of the glyph it sits on.

  THE NUMBER IS THE MEANING, so the name says what it counts for a screen reader where the caller knows (`label`); the
  shape and the hue only agree with it. A change rolls through `Figure`.
-->
<script lang="ts">
  import Figure from './Figure.svelte';

  let {
    n,
    label,
    size = 'm',
  }: {
    /** The count. Zero draws nothing: a badge that says nobody needs you is noise. */
    n: number;
    /** What the number counts, read out in place of the bare figure ("3 questions wait on you"). */
    label?: string | undefined;
    /** `m` beside a word; `s` on the corner of a tab's glyph. */
    size?: 'm' | 's';
  } = $props();

  /* PAST 99 IT SAYS 99+, so the capsule keeps its shape in a rail item and the count stays a glance. */
  const said = $derived(n > 99 ? '99+' : String(n));
</script>

{#if n > 0}<span class="badge num" data-needs-n data-size={size} role={label ? 'img' : undefined} aria-label={label}><Figure value={said} /></span>{/if}

<style>
  .badge {
    display: inline-grid;
    place-items: center;
    flex: none;
    box-sizing: border-box;
    min-inline-size: 20px;
    block-size: 20px;
    /* 6 either side of the figure: 2 more than the grid's 4, and allowed, since it is inside the control. */
    padding-inline: calc(var(--sp-1) + 2px);
    background: var(--red-fill);
    border-radius: var(--r-round);
    color: var(--on-red);
    font-family: var(--font-ui);
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
    line-height: calc(20px * var(--type, 1));
  }

  .badge[data-size='s'] {
    min-inline-size: 18px;
    block-size: 18px;
    padding-inline: var(--sp-1);
    line-height: calc(18px * var(--type, 1));
    box-shadow: 0 0 0 2px var(--tile);
  }

  @media (forced-colors: active) {
    .badge {
      border: 1px solid CanvasText;
    }
  }
</style>
