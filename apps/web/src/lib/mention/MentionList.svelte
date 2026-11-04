<!--
  The @ list: at the @, over everything.

  IN THE TOP LAYER (`popover`), because the panel it opens in clips what hangs past its edge and is a containing block for
  anything fixed. Up there it is placed by the window alone, so it is anchored to the @ and never cut off. The keyboard
  stays in the field; this never takes focus, and a press on a row does not move it.

  UNDER THE @, OR OVER IT WHEN IT WILL NOT FIT, chosen once as it opens, so a list that shrinks to fewer rows does not hop.
  It stops short of a phone's keyboard (`--kb`), and fits a 390 screen.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import type { Offer } from './find.ts';

  let {
    id,
    anchor,
    above = false,
    rows,
    cursor,
    full,
    most,
    nothing,
    lately,
    onhover,
    onpick,
  }: {
    id: string;
    /** The mirror holding the @ it hangs from. */
    anchor: HTMLElement | undefined;
    above?: boolean;
    rows: Offer[];
    cursor: number;
    full: boolean;
    most: number;
    /** Letters nothing answers, to say so; `null` when there are rows. */
    nothing: string | null;
    /** Nothing is typed yet: these are the rows touched last. */
    lately: boolean;
    onhover: (i: number) => void;
    onpick: (o: Offer) => void;
  } = $props();

  const words = {
    lately: 'Changed lately',
    none: (q: string) => (q === '' ? 'Nothing changed lately' : `Nothing called “${q}”`),
    full: (n: number) => `Up to ${n} rows in one question`,
    label: 'Rows to mention',
  } as const;

  const GUTTER = 8;
  const GAP = 6;
  /** The room a list asks for as it opens, however few rows it has so far: more may land a moment later. */
  const ENOUGH = 240;

  let list = $state<HTMLDivElement>();
  let side: 'below' | 'above' | null = null;

  /** The room the window leaves, less a keyboard, whichever way this browser says it. */
  function bounds(): { top: number; bottom: number; width: number } {
    const view = globalThis.visualViewport;
    const kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb')) || 0;
    const seen = view ? view.offsetTop + view.height : innerHeight;
    return { top: view?.offsetTop ?? 0, bottom: Math.min(seen, innerHeight - kb), width: document.documentElement.clientWidth };
  }

  function place() {
    const el = list;
    const at = anchor?.querySelector('[data-mention-at]')?.getBoundingClientRect();
    if (!el || !at) return;
    const { top, bottom, width } = bounds();
    const wide = Math.min(380, width - 2 * GUTTER);
    /* THE @ MAY HAVE SCROLLED OUT WITH A LONG SENTENCE: the list stays on the field's own lines. */
    const box = anchor?.getBoundingClientRect();
    const atTop = box ? Math.max(at.top, box.top) : at.top;
    const atBottom = box ? Math.min(at.bottom, box.bottom) : at.bottom;
    const below = bottom - GUTTER - (atBottom + GAP);
    const over = atTop - GAP - GUTTER - top;
    if (side === null) {
      const fits = Math.max(el.scrollHeight, ENOUGH);
      if (above) side = over >= fits || over > below ? 'above' : 'below';
      else side = below >= fits || below >= over ? 'below' : 'above';
    }
    const rtl = getComputedStyle(el).direction === 'rtl';
    const left = Math.max(GUTTER, Math.min(rtl ? at.right - wide : at.left - 4, width - wide - GUTTER));
    el.style.inlineSize = `${wide}px`;
    el.style.left = `${Math.round(left)}px`;
    el.style.maxBlockSize = `${Math.round(Math.max(side === 'below' ? below : over, 44))}px`;
    el.style.top = `${Math.round(side === 'below' ? atBottom + GAP : atTop - GAP)}px`;
    el.style.translate = side === 'below' ? '0' : '0 -100%';
  }

  /* OVER THE PANEL BEFORE THE FIRST FRAME, AND KEPT ON THE @ whatever moves under it. */
  function raise(el: HTMLDivElement) {
    return untrack(() => rise(el));
  }
  function rise(el: HTMLDivElement) {
    try {
      el.showPopover?.();
    } catch {
      /* Already up, or an older browser: it is still fixed, only inside what clips it. */
    }
    place();
    const again = () => place();
    const view = globalThis.visualViewport;
    addEventListener('resize', again);
    addEventListener('scroll', again, { capture: true, passive: true });
    view?.addEventListener('resize', again);
    view?.addEventListener('scroll', again);
    const watch = anchor ? new ResizeObserver(again) : null;
    if (anchor) watch?.observe(anchor);
    return () => {
      removeEventListener('resize', again);
      removeEventListener('scroll', again, { capture: true });
      view?.removeEventListener('resize', again);
      view?.removeEventListener('scroll', again);
      watch?.disconnect();
    };
  }

  /* NEW ROWS, NEW LETTERS: placed again, and the row the keys are on kept in sight. */
  $effect(() => {
    void rows;
    void cursor;
    void nothing;
    place();
    list?.querySelector('[data-cursor]')?.scrollIntoView({ block: 'nearest' });
  });

  /* A POINTER RESTING WHERE THE LIST OPENED IS NOT A CHOICE: only one that moved moves the cursor. */
  const moved = (i: number) => {
    if (i !== cursor) onhover(i);
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="ml" popover="manual" role="presentation" bind:this={list} {@attach raise} onmousedown={(e) => e.preventDefault()} onclick={(e) => e.stopPropagation()}>
  {#if full}
    <p class="ml-line">{words.full(most)}</p>
  {:else if rows.length > 0}
    {#if lately}<p class="ml-head">{words.lately}</p>{/if}
    <ul class="ml-rows" {id} role="listbox" aria-label={words.label}>
      {#each rows as o, i (o.ref)}
        <li id={`${id}-${i}`} role="option" aria-selected={i === cursor}>
          <button type="button" class="ml-row tap" tabindex="-1" data-cursor={i === cursor ? '' : undefined} onmousemove={() => moved(i)} onclick={() => onpick(o)}>
            <span class="ml-glyph"><Icon name={o.icon as IconName} size="s" /></span>
            <span class="ml-name" dir="auto">{o.label}</span>
            <span class="ml-in">{o.told ? `${o.told} · ${o.list}` : o.list}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if nothing !== null}
    <p class="ml-line">{words.none(nothing)}</p>
  {/if}
</div>

<style>
  /* THE MENU'S OWN SURFACE (`Menu.svelte`): the regular film, its radius, 4 inside, the popover's elevation. */
  .ml {
    position: fixed;
    inset: auto;
    box-sizing: border-box;
    margin: 0;
    padding: var(--sp-1);
    border: 0;
    border-radius: var(--r-pop, 12px);
    background: var(--glass-regular, var(--tile));
    -webkit-backdrop-filter: var(--glass-filter, none);
    backdrop-filter: var(--glass-filter, none);
    box-shadow: var(--glass-edge, none), var(--elev-popover, 0 8px 24px rgb(0 0 0 / 0.16));
    color: var(--ink);
    font-size: var(--fs-ctl);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  @supports not (backdrop-filter: blur(1px)) {
    .ml {
      background: var(--tile);
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .ml {
      background: var(--tile);
      backdrop-filter: none;
    }
  }

  .ml-head {
    margin: 0;
    padding: calc(6px * var(--dense, 1)) var(--sp-2) var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
  }

  .ml-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ml-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: var(--row-menu, calc(36px * var(--dense, 1)));
    padding-inline: var(--sp-2);
    border: 0;
    border-radius: var(--r-menu-row, 8px);
    background: none;
    color: var(--ink);
    font: inherit;
    line-height: calc(20px * var(--type, 1));
    text-align: start;
    cursor: pointer;
  }

  .ml-row[data-cursor] {
    background: var(--menu-row-fill, var(--row-wash));
  }

  .ml-glyph {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--ink-3);
  }

  .ml-name {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ml-in {
    flex: 0 1 auto;
    max-inline-size: 52%;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ml-line {
    margin: 0;
    padding: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  @media (pointer: coarse) {
    .ml-row {
      min-block-size: var(--tap, 44px);
    }
  }
</style>
