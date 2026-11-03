<!--
  A PAGE THAT DRAWS ITS LAST LAYOUT WHILE IT LEARNS WHICH CARDS IT HAS (ui-perfect, 3 Nov). Some pages cannot draw a
  single card until one read says which cards there are (Today's board, a project's page). Until then this draws the
  cards this device saw there last time, where they stood and at their sizes, each a real card surface with its
  skeleton inside, so the page has its shape from the first frame and the answer lands on top of it.

    <ShapedPage id="board" ready={board !== null}>
      {#each board.cards as c (c.id)}
        <section class="surface-card" data-card={c.id} data-card-kind="rows">...</section>
      {/each}
    </ShapedPage>

  WHAT IT KEEPS: every element inside marked `data-card="<id>"`, its box relative to this one (left and width as a
  share of the width, so a slightly wider window still lines up), its height, its row count (`data-row`, or its first
  list's items) and `data-card-kind` (`rows`, `lines`, `figure`, `chips`, `table`; `rows` when absent). A card with a
  `.tile-head`, `header` or `[data-card-head]` gets a heading bar in its skeleton. Kept once the page is ready and
  again whenever it settles at a new size, per record, page and width (`shape.ts`).

  ONCE READY, ALWAYS READY: a read that goes out again never brings the outline back. With nothing kept yet it draws
  `fallback`, or three rows of skeleton.

  Each card then loads on its own inside the real page (`Loads.svelte`, or `Tile`'s `ready`), so this only covers the
  first moment, before the page knows its cards.
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import Skeleton from './Skeleton.svelte';
  import { keepPage, pageShape, rowsIn, shapeKey, type CardShape, type SkeletonKind } from './shape.ts';

  let {
    id = '',
    ready,
    fallback,
    children,
  }: {
    /** A name for this part when one page keeps two layouts. */
    id?: string | undefined;
    ready: boolean;
    fallback?: Snippet | undefined;
    children: Snippet;
  } = $props();

  const key = shapeKey(id);
  const kept = untrack(() => pageShape(key));
  const cards = kept ? (kept.order ?? Object.keys(kept.cards)).map((c) => [c, kept.cards[c]] as const).filter((c): c is readonly [string, CardShape] => c[1] !== undefined) : [];

  let shown = $state(untrack(() => ready));
  $effect.pre(() => {
    if (ready) shown = true;
  });

  const KINDS = new Set<SkeletonKind>(['rows', 'lines', 'figure', 'chips', 'table']);

  function measure(box: HTMLElement): () => void {
    if (typeof ResizeObserver === 'undefined') return () => undefined;
    let t: ReturnType<typeof setTimeout> | null = null;
    const take = (): void => {
      t = null;
      const at = box.getBoundingClientRect();
      if (at.width < 1) return;
      const out: Record<string, CardShape> = {};
      const order: string[] = [];
      for (const el of box.querySelectorAll<HTMLElement>('[data-card]')) {
        const name = el.dataset.card;
        if (!name || out[name]) continue;
        const r = el.getBoundingClientRect();
        if (r.height < 1) continue;
        const kind = el.dataset.cardKind as SkeletonKind | undefined;
        out[name] = {
          h: Math.round(r.height),
          x: Number(((r.left - at.left) / at.width).toFixed(4)),
          y: Math.round(r.top - at.top),
          w: Number((r.width / at.width).toFixed(4)),
          rows: rowsIn(el),
          kind: kind && KINDS.has(kind) ? kind : 'rows',
          head: el.querySelector('.tile-head, header, [data-card-head]') !== null,
        };
        order.push(name);
      }
      if (order.length > 0) keepPage(key, { w: Math.round(at.width), h: Math.round(at.height), cards: out, order });
    };
    const seen = new ResizeObserver(() => {
      if (t !== null) clearTimeout(t);
      t = setTimeout(take, 600);
    });
    seen.observe(box);
    return () => {
      seen.disconnect();
      if (t !== null) clearTimeout(t);
    };
  }
</script>

{#if shown}
  <div class="shaped" {@attach measure}>{@render children()}</div>
{:else if cards.length > 0 && kept}
  <div class="shaped-outline" aria-busy="true" style:block-size={`${kept.h ?? 0}px`}>
    {#each cards as [name, c] (name)}
      <div
        class="shaped-card surface-card"
        aria-hidden="true"
        style:inset-inline-start={`${((c.x ?? 0) * 100).toFixed(2)}%`}
        style:inset-block-start={`${c.y ?? 0}px`}
        style:inline-size={`${((c.w ?? 1) * 100).toFixed(2)}%`}
        style:block-size={`${c.h}px`}
      >
        {#if c.head}<span class="shaped-head"><span class="shaped-glyph"></span><span class="shaped-name"></span></span>{/if}
        <Skeleton kind={c.kind ?? 'rows'} count={c.rows} />
      </div>
    {/each}
  </div>
{:else if fallback}
  {@render fallback()}
{:else}
  <Skeleton kind="rows" count={3} />
{/if}

<style>
  /* A REAL BOX (not `display: contents`), so its cards can be measured against it. */
  .shaped {
    display: block;
    min-inline-size: 0;
  }

  /* THE OUTLINE: the page's last box, each card where it stood. Placed, not flowed, so it is exactly the last layout. */
  .shaped-outline {
    position: relative;
    min-inline-size: 0;
  }

  .shaped-card {
    position: absolute;
    display: grid;
    align-content: start;
    gap: var(--card-head-gap, 12px);
    box-sizing: border-box;
    overflow: clip;
    padding: var(--tile-pad, 20px);
  }

  /* THE CARD'S HEADING ROW: an 18 glyph and a name bar on the 28 head line. */
  .shaped-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    block-size: 28px;
  }

  .shaped-glyph {
    inline-size: 18px;
    block-size: 18px;
    background: color-mix(in oklab, var(--ink) 6%, transparent);
    border-radius: 6px;
  }

  .shaped-name {
    inline-size: 30%;
    block-size: 10px;
    background: color-mix(in oklab, var(--ink) 8%, transparent);
    border-radius: var(--r-pill);
  }
</style>
