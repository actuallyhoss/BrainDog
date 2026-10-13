<!--
  A segmented control with a sliding selection (DIRECTION 39): one rectangle in the field's fill, and the chosen
  segment the tile's colour, which MOVES to the next choice instead of fading out in one place and in at another.

  IT WRAPS THE MARKUP THE PRODUCT ALREADY WRITES. The caller keeps its own `.segment` buttons, with `data-on` on the
  chosen one, and this draws the track round them:

    <Segmented role="group" aria-label={words.group}>
      <button type="button" class="segment" data-on={on ? '' : undefined} aria-pressed={on}>Table</button>
    </Segmented>

  Everything else it is given (`role`, `aria-*`, `id`, `class`) lands on the track. `tag` is for a track that is a
  `nav` of links.

  THE THUMB IS THE TRACK'S `::before` (`controls.css`), placed by `--x`, `--y`, `--w` and `--h`, which are READ FROM
  THE CHOSEN SEGMENT'S BOX and never worked out from a count: labels are different widths, and a word goes away below
  900. It is measured again whenever the choice, a label or the track changes size, and a change of size is a jump,
  so the thumb never lags the label it sits under.

  IT JUMPS, TOO, when the track has wrapped to two lines (a diagonal slide says nothing) and under reduced motion.
  Before the first measure, and with no script at all, the chosen segment is filled the way it always was.
-->
<script module lang="ts">
  /* thumb:start (`segmented.test.ts` reads the lines between these two marks and runs them) */
  /** A segment's box inside its track: from the track's padding edge, in px. */
  export type Box = { left: number; top: number; width: number; height: number };
  /** Where the thumb is drawn: moved by x and y from the track's starting corner, w by h. */
  export type Thumb = { x: number; y: number; w: number; h: number };

  /**
   * The thumb for the chosen segment's box, or null where there is nothing to draw one under: nothing chosen, or a
   * track that is not laid out. Right to left the thumb starts from the far edge, so it is moved back by what is left.
   */
  export function thumbOf(chosen: Box | null, trackWidth: number, rtl = false): Thumb | null {
    if (!chosen || chosen.width <= 0 || chosen.height <= 0) return null;
    const x = rtl ? chosen.left - (trackWidth - chosen.width) : chosen.left;
    return { x, y: chosen.top, w: chosen.width, h: chosen.height };
  }

  /** Whether the segments sit on more than one line, from their tops. A pixel of rounding is not a line. */
  export function wraps(tops: readonly number[]): boolean {
    return tops.some((top) => Math.abs(top - tops[0]!) > 1);
  }

  /**
   * Whether this placing is drawn as a move. Only a NEW choice slides, on one line, for a reader who has not asked
   * for less motion: the first placing has nowhere to come from, and the same choice at a new size is a resize.
   */
  export function slides(move: { had: boolean; changed: boolean; wrapped: boolean; reduced: boolean }): boolean {
    return move.had && move.changed && !move.wrapped && !move.reduced;
  }
  /* thumb:end */
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    tag = 'div',
    class: cls = '',
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, 'class' | 'children'> & {
    /** The track's element: a `div`, or a `nav` where the segments are links. */
    tag?: 'div' | 'nav';
    class?: string;
    children: Snippet;
  } = $props();

  let track = $state<HTMLElement | null>(null);
  let thumb = $state<Thumb | null>(null);
  let slide = $state(false);

  $effect(() => {
    const el = track;
    if (!el || typeof ResizeObserver !== 'function') return;

    /* The segment the thumb was last put under, so a resize of the same choice is told from a new one. It is kept
       here and not read back from `thumb`: reading state in this effect would run it again on every placing. */
    let under: Element | null = null;

    const place = () => {
      const segments = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
      const chosen = segments.find((s) => s.hasAttribute('data-on')) ?? null;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const next = thumbOf(
        chosen && { left: chosen.offsetLeft, top: chosen.offsetTop, width: chosen.offsetWidth, height: chosen.offsetHeight },
        el.clientWidth,
        rtl,
      );
      slide = slides({
        had: under !== null,
        changed: chosen !== under,
        wrapped: wraps(segments.map((s) => s.offsetTop)),
        reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
      under = next ? chosen : null;
      thumb = next;
    };

    /* A label that grows, a font that arrives and a track that wraps are all a size changing. */
    const sizes = new ResizeObserver(place);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(el);
      for (const child of el.children) sizes.observe(child);
    };

    /* The caller moves `data-on`, or draws a segment more or fewer. */
    const marks = new MutationObserver((changes) => {
      if (changes.some((c) => c.type === 'childList')) watch();
      place();
    });
    marks.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-on'] });

    watch();
    place();

    return () => {
      sizes.disconnect();
      marks.disconnect();
    };
  });
</script>

<svelte:element
  this={tag}
  {...rest}
  bind:this={track}
  class={['segmented', cls]}
  data-slides=""
  data-thumb={thumb ? (slide ? 'slide' : 'jump') : undefined}
  style:--x={thumb ? `${thumb.x}px` : undefined}
  style:--y={thumb ? `${thumb.y}px` : undefined}
  style:--w={thumb ? `${thumb.w}px` : undefined}
  style:--h={thumb ? `${thumb.h}px` : undefined}
>
  {@render children()}
</svelte:element>
