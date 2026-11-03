<!--
  ONE CARD'S BODY, LOADING ON ITS OWN (ui-perfect, 3 Nov). The card's heading is drawn at once; its body is a skeleton
  at the height and row count this card had the last time this device drew this page at this width (`shape.ts`), and
  the answer takes the skeleton's place in the same box, so nothing under it moves. Every card reads for itself: the
  page draws each one as soon as its own answer is in, never all of them behind one spinner.

    <Tile icon="money" title="Cash ahead">
      <Loads id="cash" ready={cash !== null} kind="figure">
        <CashFigure {cash} />
      </Loads>
    </Tile>

  Or through the tile itself: `<Tile ... ready={cash !== null} skeleton="figure">` (`Tile.svelte`).

  ONCE READY, ALWAYS READY. A read that goes out again (a poll, a pull, a write) never brings the skeleton back: the
  content that was there stays until the next answer replaces it. Keep the last answer while the next is out
  (`keep()` in `shape.ts`) so the content has something to draw.

  AN ANSWER IN THE FIRST 300MS JUST APPEARS (the skeleton was never shown); a later one fades up over 160ms. Under
  reduced motion it simply appears.

  `id` names the card on its page; two cards on one page need two ids. `kind` and `rows` are the skeleton's shape when
  nothing is kept yet; once the card has drawn, the kept row count wins.
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import Skeleton from './Skeleton.svelte';
  import { cardShape, keepCard, rowsIn, shapeKey, type SkeletonKind } from './shape.ts';

  let {
    id,
    ready,
    kind = 'rows',
    rows,
    skeleton,
    children,
  }: {
    /** The card's name on its page, kept with its shape. */
    id: string;
    /** Whether the card's own answer is in. Once true, the body stays drawn. */
    ready: boolean;
    kind?: SkeletonKind | undefined;
    /** The skeleton's row (or line, chip) count until this card has drawn once. */
    rows?: number | undefined;
    /** A skeleton of the card's own, in place of the shared one. */
    skeleton?: Snippet | undefined;
    children: Snippet;
  } = $props();

  /* THE PAGE IS NAMED ONCE, AS THE CARD MOUNTS: the shell redraws the work on a new path. */
  const key = shapeKey();
  const kept = untrack(() => cardShape(key, id));
  const born = typeof performance !== 'undefined' ? performance.now() : 0;

  /* LATCHED: once the answer has been in, a read that goes out again does not take the content away. */
  let shown = $state(untrack(() => ready));
  /* WHETHER THE SKELETON HAD SHOWN (300ms), which is when the answer fades up rather than just appearing. */
  let late = $state(false);
  $effect.pre(() => {
    if (ready && !shown) {
      late = (typeof performance !== 'undefined' ? performance.now() : 0) - born > 300;
      shown = true;
    }
  });

  /* THE CARD'S SHAPE IS KEPT EACH TIME IT SETTLES at a new height or row count, for the next load of this page. */
  function measure(el: HTMLElement): () => void {
    if (typeof ResizeObserver === 'undefined') return () => undefined;
    let t: ReturnType<typeof setTimeout> | null = null;
    const take = (): void => {
      t = null;
      const h = Math.round(el.offsetHeight);
      if (h > 0) keepCard(key, id, { h, rows: rowsIn(el), kind });
    };
    const seen = new ResizeObserver(() => {
      if (t !== null) clearTimeout(t);
      t = setTimeout(take, 400);
    });
    seen.observe(el);
    return () => {
      seen.disconnect();
      if (t !== null) clearTimeout(t);
    };
  }
</script>

{#if shown}
  <div class="loads" data-card-body={id} data-late={late ? '' : undefined} {@attach measure}>{@render children()}</div>
{:else}
  <div class="loads" data-card-body={id} aria-busy="true" style:block-size={kept ? `${kept.h}px` : undefined}>
    {#if skeleton}{@render skeleton()}{:else}<Skeleton kind={kept?.kind ?? kind} count={kept?.rows ?? rows} />{/if}
  </div>
{/if}

<style>
  .loads {
    min-inline-size: 0;
  }

  /* THE SKELETON'S BOX IS THE KEPT HEIGHT EXACTLY, so the answer lands in it and nothing under the card moves. */
  .loads[aria-busy] {
    overflow: clip;
  }

  .loads[data-late] {
    animation: loads-in var(--d-swap, 160ms) var(--ease-out) backwards;
  }

  @keyframes loads-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loads[data-late] {
      animation: none;
    }
  }
</style>
