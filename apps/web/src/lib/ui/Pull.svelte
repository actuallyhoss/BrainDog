<!--
  Pull down on a phone to read the screen again, and the line that says a screen was drawn from the read copy.

  WHY A PULL HAS TO BE BUILT AT ALL. `html, body` are `overflow: hidden` and the shell's `.body` panel is the one thing
  that scrolls, so the browser's own pull to refresh never starts: there is no page scroll for it to pull on. So this
  listens on the panel it sits in, and a pull from the top of it past `FAR` asks every screen to read again through
  `reread` (`lib/data/live.svelte.ts`), the same mark the record's own changes move.

  TOUCH ONLY, AND PASSIVE. A mouse or a trackpad has no pull, and a wheel at the top is not one. Nothing here cancels a
  touch, so scrolling feels exactly as it did; the pull is read from the scroll already being at the top.

  THE HAIRLINE WHILE IT READS is 2px at the top of the panel, growing with the pull and then running until the screen
  has settled again (`settled()` in `screen.svelte.ts`), or `LONGEST` at most, so a read that never answers cannot leave
  it running. It is `aria-hidden` for the layout's hairline's reason: the screen's own states say what it read.

  THE OFFLINE LINE is the one banner (`Banner.svelte`), in the warn tint, drawn while the poll says offline and something on screen came from the copy: "Offline, showing what
  you last saw at 14:02.", and that nothing changed here can be saved until he is back online.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import { live, reread } from '$lib/data/live.svelte.ts';
  import { when, words } from '$lib/data/offline.ts';
  import { settled } from '$lib/ui/screen.svelte.ts';
  import Banner from './Banner.svelte';
  import { haptic } from '$lib/phone/device.ts';

  /** How far, in CSS pixels, a pull from the top travels before letting go reads again. */
  const FAR = 72;
  /** The longest the hairline runs after a pull, whatever the screen is still waiting on. */
  const LONGEST = 8_000;

  let spot = $state<HTMLElement>();
  /** How far the pull has travelled, from 0 to 1. */
  let drag = $state(0);
  /** A pull let go past `FAR` and not yet settled. */
  let reading = $state(false);
  /** `reread` has not returned yet, so the screens have not started their reads and `settled()` says nothing yet. */
  let asking = $state(false);

  const offline = $derived(live.state === 'offline' && live.from !== null);
  const kept = $derived(live.from === null ? '' : when(live.from, Date.now()));

  /** The cap on this pull's hairline. It goes with the read, so a second pull is not cut short by the first one's. */
  let cap: ReturnType<typeof setTimeout> | null = null;

  function done(): void {
    reading = false;
    if (cap !== null) clearTimeout(cap);
    cap = null;
  }

  /* ONE PULL AT A TIME: a second pull while the first still reads would only ask every screen the same thing twice. */
  async function pull(): Promise<void> {
    if (reading) return;
    reading = true;
    asking = true;
    cap = setTimeout(done, LONGEST);
    try {
      await reread();
    } finally {
      asking = false;
    }
  }

  /* SETTLED AGAIN IS DONE. `settled()` is absent while any read is out, and a pull's reads are out from `reread`'s return. */
  $effect(() => {
    if (reading && !asking && settled() !== undefined) untrack(done);
  });

  $effect(() => () => {
    if (cap !== null) clearTimeout(cap);
  });

  $effect(() => {
    const panel = spot?.parentElement;
    if (!panel) return;
    let from: number | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches.item(0);
      from = e.touches.length === 1 && t !== null && panel.scrollTop <= 0 && !reading ? t.clientY : null;
    };
    const move = (e: TouchEvent) => {
      const t = e.touches.item(0);
      if (from === null || t === null) return;
      /* A SCROLL THAT LEFT THE TOP IS NOT A PULL, whichever way the finger goes next. */
      if (panel.scrollTop > 0) {
        from = null;
        drag = 0;
        return;
      }
      const was = drag;
      drag = Math.max(0, Math.min(1, (t.clientY - from) / FAR));
      /* THE THUMB FEELS THE POINT WHERE LETTING GO READS AGAIN, where the phone has a way to say it (`haptic`). */
      if (was < 1 && drag >= 1) haptic('light');
    };
    const end = () => {
      const far = from !== null && drag >= 1;
      from = null;
      drag = 0;
      if (far) void pull();
    };
    panel.addEventListener('touchstart', start, { passive: true });
    panel.addEventListener('touchmove', move, { passive: true });
    panel.addEventListener('touchend', end, { passive: true });
    panel.addEventListener('touchcancel', end, { passive: true });
    return () => {
      panel.removeEventListener('touchstart', start);
      panel.removeEventListener('touchmove', move);
      panel.removeEventListener('touchend', end);
      panel.removeEventListener('touchcancel', end);
    };
  });
</script>

<div class="pull" bind:this={spot}>
  <div
    class="pull-line"
    data-reading={reading ? '' : undefined}
    style:--pull-drag={reading ? 1 : drag}
    aria-hidden="true"
  ></div>
  {#if offline}
    <Banner tone="warn" icon="alert"><span class="pull-from">{words.from(kept)}</span>{' '}{words.cannotSave}</Banner>
  {/if}
</div>

<style>
  /* STICKY AT THE TOP OF THE PANEL, so the hairline is where the pull is whatever was scrolled, and takes no room. */
  .pull {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-raise);
  }

  .pull-line {
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
    block-size: 2px;
    background: var(--ink-3);
    transform: scaleX(var(--pull-drag, 0));
    /* FROM THE MIDDLE, so it grows the same way in a right-to-left language. */
    transform-origin: center;
    pointer-events: none;
  }

  /* WHILE IT READS, A RUNNING LINE AND NOT A FULL ONE, so a finished pull and a read still out look different. Under
     reduced motion `a11y.css` collapses the animation and the line stands still at full width, which still says it. */
  .pull-line[data-reading] {
    animation: pull-run var(--d-panel) ease-in-out infinite alternate;
  }

  @keyframes pull-run {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 1;
    }
  }

  .pull-from {
    font-weight: var(--fw-semi);
  }
</style>
