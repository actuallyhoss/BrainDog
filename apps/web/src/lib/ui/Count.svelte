<!--
  The one filled badge in the product: a red square with a count in it, for what needs the reader.

  EVERY OTHER COUNT IS A PLAIN NUMBER in the quiet ink, beside the word it counts. This one is filled because it is the
  one thing on a screen allowed to shout: Decide's open questions in the rail, a tab that holds something waiting on
  him. Red here is "needs you" and nothing else, so a count that does not need him is never drawn with this.

  THE NUMBER IS THE MEANING, so the name says what it counts for a screen reader where the caller knows (`label`); the
  shape and the hue only agree with it.
-->
<script lang="ts">
  let {
    n,
    label,
  }: {
    /** The count. Zero draws nothing: a badge that says nobody needs you is noise. */
    n: number;
    /** What the number counts, read out in place of the bare figure ("3 questions wait on you"). */
    label?: string | undefined;
  } = $props();

  /* PAST 99 IT SAYS 99+, so the square keeps its shape in a rail item and the count stays a glance. */
  const said = $derived(n > 99 ? '99+' : String(n));
</script>

{#if n > 0}<span class="badge num" role={label ? 'img' : undefined} aria-label={label}>{said}</span>{/if}

<style>
  .badge {
    display: inline-grid;
    place-items: center;
    flex: none;
    box-sizing: border-box;
    min-inline-size: 20px;
    block-size: 20px;
    padding-inline: 5px;
    /* THE BRAND RED ITSELF, with the tile's own colour as the figure: white on the light scheme's red, the dark tile on
       the dark scheme's lighter red, so the figure clears 4.5:1 in both. */
    background: var(--danger);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  @media (forced-colors: active) {
    .badge {
      border: 1px solid CanvasText;
    }
  }
</style>
