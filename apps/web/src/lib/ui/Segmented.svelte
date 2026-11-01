<!--
  A segmented control with a sliding selection: one rectangle in the field's fill, and the chosen
  segment the tile's colour, which MOVES to the next choice instead of fading out in one place and in at another.

  IT WRAPS THE MARKUP THE PRODUCT ALREADY WRITES. The caller keeps its own `.segment` buttons, with `data-on` on the
  chosen one, and this draws the track round them:

    <Segmented role="group" aria-label={words.group}>
      <button type="button" class="segment" data-on={on ? '' : undefined} aria-pressed={on}>Table</button>
    </Segmented>

  Everything else it is given (`role`, `aria-*`, `id`, `class`) lands on the track. `tag` is for a track that is a
  `nav` of links, or an `ol` where the segments are steps in order, each in an `li`.

  THE THUMB IS THE TRACK'S `::before` (`controls.css`), placed by `--x`, `--y`, `--w` and `--h`, which are READ FROM
  THE CHOSEN SEGMENT'S BOX and never worked out from a count: labels are different widths, and a word goes away below
  900. It is measured again whenever the choice, a label or the track changes size, and a change of size is a jump,
  so the thumb never lags the label it sits under.

  IT JUMPS, TOO, when the track has wrapped to two lines (a diagonal slide says nothing) and under reduced motion.
  Before the first measure, and with no script at all, the chosen segment is filled the way it always was.

  ITS HEIGHT IS HELD BEFORE ITS LABELS LAND (motion F2.4): the track is 36 tall at
  least, 48 under a thumb or on a phone, so a segment whose count arrives a beat late does not push the page down.

  `full` IS A PAGE'S OWN CONTROL ON A PHONE: below 640px the track is the page's width and its segments share it by
  their words, each at 15. When a label would be cut, or there are more than four, a group of choices wraps, every
  choice whole, and a `nav` scrolls on its own row, with 16 of room at its end and the last 24px fading out.

  `many` IS A TRACK WHERE MORE THAN ONE CAN BE CHOSEN (toggles pressed in and out). One thumb cannot sit under two
  segments, and a thumb under the first slid across to a second that already looked chosen when the first was switched
  off. So a `many` track draws no thumb and measures nothing: every chosen segment keeps its own flat fill.
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
  /**
   * Whether a full-width track on a phone scrolls rather than shares: more than four segments, or segments whose words
   * need more room than the track has (their natural widths, which `scrollWidth` reads even while a segment is cut).
   */
  export function scrolls(segments: number, needs: number, room: number): boolean {
    return segments > 4 || needs > room + 1;
  }
  /* thumb:end */
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { frameResizeObserver } from './resize.ts';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    tag = 'div',
    many = false,
    full = false,
    class: cls = '',
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, 'class' | 'children'> & {
    /** The track's element: a `div`, a `nav` where the segments are links, or an `ol` where the segments are steps
        in order, each in an `li`. */
    tag?: 'div' | 'nav' | 'ol';
    /** More than one segment can be chosen at once: no thumb is drawn, and each chosen segment fills itself. */
    many?: boolean;
    /** A page's own control: the page's width on a phone, its segments sharing it, scrolling when they do not fit. */
    full?: boolean;
    class?: string;
    children: Snippet;
  } = $props();

  let track = $state<HTMLElement | null>(null);
  let thumb = $state<Thumb | null>(null);
  let slide = $state(false);
  let scroll = $state(false);


  $effect(() => {
    const el = track;
    if (!el || typeof ResizeObserver !== 'function') return;

    /* Nothing to place, so nothing to watch: a thumb left from before `many` was set is taken away. */
    if (many) {
      thumb = null;
      return;
    }

    /* The segment the thumb was last put under, so a resize of the same choice is told from a new one. It is kept
       here and not read back from `thumb`: reading state in this effect would run it again on every placing. */
    let under: Element | null = null;
    /* When the thumb last set off for a new choice. The move itself resizes the labels (the chosen one is set heavier),
       and that resize landed a frame later as "the same choice at a new size", which put the thumb back to `jump` and
       cut the slide it had just started (skills pass, 2 Nov: it never travelled). A resize while the slide is still
       going keeps it going, to the new place. */
    let setOff = -Infinity;
    const SLIDING_MS = 320;
    let went = false;

    /* A step in an ordered track is read through its list item. */
    const segmentsOf = (of: HTMLElement) =>
      Array.from(of.children)
        .map((c) => (c instanceof HTMLLIElement ? c.firstElementChild : c))
        .filter((c): c is HTMLElement => c instanceof HTMLElement);

    const place = () => {
      const segments = segmentsOf(el);
      const chosen = segments.find((s) => s.hasAttribute('data-on')) ?? null;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const next = thumbOf(
        chosen && { left: chosen.offsetLeft, top: chosen.offsetTop, width: chosen.offsetWidth, height: chosen.offsetHeight },
        el.clientWidth,
        rtl,
      );
      const moving = {
        had: under !== null,
        changed: chosen !== under,
        wrapped: wraps(segments.map((s) => s.offsetTop)),
        reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
      const now = performance.now();
      if (slides(moving)) setOff = now;
      /* `went` mirrors `slide` here: reading the state in this effect would run it again on every placing. */
      went = slides(moving) || (went && !moving.changed && !moving.wrapped && !moving.reduced && now - setOff < SLIDING_MS);
      slide = went;
      under = next ? chosen : null;
      thumb = next;
    };

    /* A label that grows, a font that arrives and a track that wraps are all a size changing. */
    const sizes = frameResizeObserver(place);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(el);
      for (const child of el.children) sizes.observe(child);
      for (const segment of segmentsOf(el)) if (segment.parentElement !== el) sizes.observe(segment);
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

  /* A FULL TRACK ON A PHONE: whether it shares its width or scrolls, measured again whenever it or a segment changes
     size. Only below 640px, where `full` draws anything. */
  $effect(() => {
    const el = track;
    if (!el || !full || typeof ResizeObserver !== 'function') {
      scroll = false;
      return;
    }
    const phone = matchMedia('(width < 640px)');
    const measure = () => {
      if (!phone.matches) {
        scroll = false;
        return;
      }
      const segments = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const needs = segments.reduce((sum, s) => sum + s.scrollWidth, 0) + gap * Math.max(0, segments.length - 1);
      const pad = parseFloat(getComputedStyle(el).paddingInlineStart) * 2 || 0;
      scroll = scrolls(segments.length, needs, el.clientWidth - pad);
    };
    const sizes = frameResizeObserver(measure);
    sizes.observe(el);
    for (const child of el.children) sizes.observe(child);
    phone.addEventListener('change', measure);
    measure();
    return () => {
      sizes.disconnect();
      phone.removeEventListener('change', measure);
    };
  });
</script>

<svelte:element
  this={tag}
  {...rest}
  bind:this={track}
  class={['segmented', cls]}
  data-slides=""
  data-many={many ? '' : undefined}
  data-full={full ? '' : undefined}
  data-scroll={full && scroll && tag === 'nav' ? '' : undefined}
  data-wrap={full && scroll && tag !== 'nav' ? '' : undefined}
  data-thumb={thumb ? (slide ? 'slide' : 'jump') : undefined}
  style:--x={thumb ? `${thumb.x}px` : undefined}
  style:--y={thumb ? `${thumb.y}px` : undefined}
  style:--w={thumb ? `${thumb.w}px` : undefined}
  style:--h={thumb ? `${thumb.h}px` : undefined}
>
  {@render children()}
</svelte:element>

<style>
  /* THE HEIGHT, HELD: a 32px segment and the track's 2 round it, and 44 under a thumb or on a phone. */
  .segmented {
    min-block-size: 36px;
  }

  @media (width < 640px), (pointer: coarse) {
    .segmented {
      min-block-size: 48px;
    }
  }

  /* A PAGE'S OWN CONTROL ON A PHONE: the page's width, the segments sharing it, each at 15 with an ellipsis. */
  @media (width < 640px) {
    .segmented[data-full] {
      box-sizing: border-box;
      inline-size: 100%;
      flex-wrap: nowrap;
    }

    /* SHARED BY THEIR WORDS, NOT IN EQUAL PARTS: an equal share cut "Comfortable" while "Roomy" had room to
       spare, and eight of padding a side lets four tabs fit 390 whole. */
    .segmented[data-full] > :global(.segment) {
      flex: 1 1 auto;
      min-inline-size: 0;
      padding-inline: var(--sp-2);
      overflow: hidden;
      font-size: var(--fs-body);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* AND WHEN THEY DO NOT FIT, A GROUP OF CHOICES WRAPS, every choice whole: a strip cut at the edge hid "Roomy"
       with no sign there was more. */
    .segmented[data-full][data-wrap] {
      flex-wrap: wrap;
    }

    .segmented[data-full][data-wrap] > :global(.segment) {
      overflow: visible;
    }

    /* A NAV OF PLACES STILL SCROLLS: each segment its own width, 16 of room at the end, the last 24px fading out so a
       strip that runs on looks like one. */
    .segmented[data-full][data-scroll] {
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      padding-inline-end: var(--sp-4);
      mask-image: linear-gradient(to right, var(--ink) calc(100% - 24px), transparent);
    }

    .segmented[data-full][data-scroll]::-webkit-scrollbar {
      display: none;
    }

    .segmented[data-full][data-scroll] > :global(.segment) {
      flex: none;
      overflow: visible;
    }

    :global([dir='rtl']) .segmented[data-full][data-scroll] {
      mask-image: linear-gradient(to left, var(--ink) calc(100% - 24px), transparent);
    }
  }
</style>
