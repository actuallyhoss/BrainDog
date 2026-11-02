<!--
  A terminal with an agent at work: each line shows in turn, 70 ms apart, the first time it comes into view
  (`autoplay="visible"`, the default) or as soon as it is drawn (`"now"`). The whole session is there in under a second
  (polish, 2 November: at 230 apart it took three, a slow reveal of words the page wants read).

  EVERY LINE IS IN THE HTML AND SHOWING. Only once the script runs, and only when motion is allowed, do the lines go
  quiet to play in; with scripting off or reduced motion the whole session is there at once. No <pre>: the lines are
  the agent's words, and the connect page counts its own code blocks.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { TERM } from '../demo/maya.ts';
  import { DESK } from './words.ts';

  let { lines, autoplay = 'visible' }: { lines: typeof TERM; autoplay?: 'visible' | 'now' } = $props();

  /** How many lines show; every one until the script decides to play them in. */
  let shown = $state(Number.POSITIVE_INFINITY);
  let box: HTMLDivElement;

  onMount(() => {
    let reduced = false;
    try {
      reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {}
    if (reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const play = (): void => {
      shown = 0;
      lines.forEach((_, i) => timers.push(setTimeout(() => (shown = i + 1), 120 + i * 70)));
    };
    let io: IntersectionObserver | undefined;
    if (autoplay === 'now' || typeof IntersectionObserver !== 'function') play();
    else {
      // The lines stay drawn until the box comes into view; play() then empties it at its first pixel and plays.
      io = new IntersectionObserver(
        (es) => {
          if (!es.some((e) => e.isIntersecting)) return;
          io?.disconnect();
          play();
        },
        { threshold: 0 },
      );
      io.observe(box);
    }
    return () => {
      io?.disconnect();
      timers.forEach(clearTimeout);
    };
  });
</script>

<div class="term" role="group" aria-label={DESK.agents.terminal} bind:this={box}>
  {#each lines as line, i}
    <div class="line" data-tone={line.tone || undefined} class:shown={i < shown}>{line.text || ' '}</div>
  {/each}
</div>

<style>
  .term {
    background: var(--term);
    color: var(--term-ink);
    border-radius: 12px;
    padding: 16px 18px;
    font: 400 13px/1.7 var(--mono);
    min-height: 300px;
    overflow-wrap: anywhere;
  }

  .line {
    white-space: pre-wrap;
    opacity: 0;
  }

  .line.shown {
    opacity: 1;
    transition: opacity var(--d-enter) var(--ease-out);
  }

  .line[data-tone='dim'] {
    /* --term-dim is under 4.5:1 on the dark terminal; the night's second ink passes in both schemes. */
    color: var(--on-night-2);
  }

  .line[data-tone='bold'] {
    color: var(--term-red);
  }

  /* A LINE THAT WENT WELL IS IN THE TERMINAL'S BRIGHT INK, not green (plan F19): it was the only green on the page. */
  .line[data-tone='good'] {
    color: var(--term-bright);
  }

  .line[data-tone='white'] {
    color: var(--term-bright);
  }

  @media (max-width: 760px) {
    .term {
      font-size: var(--t-app-xs);
      padding: 14px;
      min-height: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .line {
      opacity: 1;
      transition: none;
    }
  }
</style>
