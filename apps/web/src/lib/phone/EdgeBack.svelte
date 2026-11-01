<!--
  Back with a swipe from the left edge, on an iPhone's Home Screen app.

  WHY IT HAS TO BE BUILT. Safari's swipe back belongs to Safari, and a site opened from the Home Screen has no Safari
  around it, so the gesture every iPhone app answers did nothing here. Android's own back gesture already walks the
  app's history, and a browser tab has the browser's, so this is drawn on an iPhone's Home Screen app only.

  FROM THE EDGE, SIDEWAYS, AND FAR ENOUGH. A touch that starts within `EDGE` of the left edge and travels `FAR` to the
  right before it travels as far down goes back one page, as the page's own back link would; one that turns into a
  scroll lets go. Only while there is a page of this app to go back to, and never while a sheet or the palette is open,
  which their own swipe and Cancel close. Passive throughout, so a scroll is never held up waiting on it.

  THE MARK THAT FOLLOWS THE THUMB is a round back arrow at the edge, growing with the pull, so a person can see the
  gesture is understood before letting go and can take it back by moving the thumb back. `aria-hidden`: the page's own
  back link is the way back for everybody else.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';

  import { haptic, isIOS, standalone } from './device.ts';

  /** How close to the left edge, in CSS pixels, a back swipe starts. */
  const EDGE = 24;
  /** How far right it travels before letting go goes back. */
  const FAR = 72;

  let on = $state(false);
  let x0 = 0;
  let y0 = 0;
  let pull = $state(0);
  let at = $state(0);
  let live = false;
  /* PAGES OF THIS APP BEHIND THIS ONE, counted from the moves this window made, so a swipe never leaves the app. */
  let behind = 0;

  afterNavigate((nav) => {
    if (nav.type === 'enter') return;
    if (nav.type === 'popstate') behind = Math.max(0, behind + (nav.delta ?? -1));
    else if (nav.from !== null) behind += 1;
  });

  const blocked = (): boolean => document.querySelector('dialog[open], [data-sheet-open], html[data-kb]') !== null;

  function start(e: TouchEvent): void {
    const t = e.touches[0];
    live = e.touches.length === 1 && t !== undefined && t.clientX <= EDGE && behind > 0 && !blocked();
    if (!live || !t) return;
    x0 = t.clientX;
    y0 = t.clientY;
    at = t.clientY;
    pull = 0;
  }

  function move(e: TouchEvent): void {
    if (!live) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - x0;
    const dy = Math.abs(t.clientY - y0);
    /* A SCROLL IS NOT A SWIPE: down before sideways lets it go. */
    if (dy > 24 && dy > dx) {
      live = false;
      pull = 0;
      return;
    }
    const was = pull >= 1;
    pull = Math.max(0, Math.min(1.2, dx / FAR));
    at = t.clientY;
    if (!was && pull >= 1) haptic('light');
  }

  function end(): void {
    if (live && pull >= 1) history.back();
    live = false;
    pull = 0;
  }

  onMount(() => {
    on = isIOS() && standalone();
    if (!on) return;
    const opts = { passive: true } as const;
    window.addEventListener('touchstart', start, opts);
    window.addEventListener('touchmove', move, opts);
    window.addEventListener('touchend', end, opts);
    window.addEventListener('touchcancel', end, opts);
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  });
</script>

{#if on && pull > 0}
  <span class="edge-back" aria-hidden="true" data-ready={pull >= 1 ? '' : undefined} style:--pull={Math.min(pull, 1)} style:--at={`${at}px`}>
    <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
  </span>
{/if}

<style>
  .edge-back {
    position: fixed;
    inset-block-start: calc(var(--at) - 20px);
    inset-inline-start: 0;
    z-index: var(--z-hint);
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-round);
    background: var(--tile);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.16);
    color: var(--ink-3);
    opacity: var(--pull);
    transform: translateX(calc(var(--pull) * 28px - 20px)) scale(calc(0.7 + var(--pull) * 0.3));
    pointer-events: none;
  }

  .edge-back[data-ready] {
    color: var(--ink);
  }

  svg {
    inline-size: 20px;
    block-size: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
