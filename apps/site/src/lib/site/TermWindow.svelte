<!--
  A terminal window, drawn the same on every page (3 November, Sam: "it does not look like a terminal"). Dark in both
  schemes, because a terminal is: a title bar with three dots and the shell's title, then the session in a system mono,
  each command after a coloured prompt in bright ink and its output dimmer, and a blinking block cursor on the last
  line. The cursor holds still under reduced motion.

  NO LINE EVER WRAPS. A long line scrolls inside the window on a phone, never the page.

  `play` lets the lines come in one by one, 70 ms apart, the first time the window is in view (the /agents briefing).
  Every line is in the HTML and showing; only once the script runs, and only when motion is allowed, do they go
  quiet to play in.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { TermLine } from './term.ts';

  let { title, lines, label, play = false }: { title: string; lines: readonly TermLine[]; label: string; play?: boolean } = $props();

  /** How many lines show; every one until the script decides to play them in. */
  let shown = $state(Number.POSITIVE_INFINITY);
  let box: HTMLDivElement;

  onMount(() => {
    if (!play) return;
    let reduced = false;
    try {
      reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {}
    if (reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = (): void => {
      shown = 0;
      for (let i = 0; i <= lines.length; i++) timers.push(setTimeout(() => (shown = i + 1), 120 + i * 70));
    };
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'function') run();
    else {
      io = new IntersectionObserver(
        (es) => {
          if (!es.some((e) => e.isIntersecting)) return;
          io?.disconnect();
          run();
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

<div class="tw" role="group" aria-label={label} bind:this={box}>
  <div class="bar" aria-hidden="true">
    <span class="dots"><i></i><i></i><i></i></span>
    <span class="title">{title}</span>
  </div>
  <div class="body">
    <div class="screen">
      {#each lines as line, i}
        <div class="ln" data-kind={line.kind} class:shown={i < shown}>
          {#if line.kind === 'cmd'}<span class="ps" aria-hidden="true">❯</span>{/if}{line.text || ' '}
        </div>
      {/each}
      <div class="ln" data-kind="cmd" class:shown={lines.length < shown}>
        <span class="ps" aria-hidden="true">❯</span><span class="cur" aria-hidden="true"></span>
      </div>
    </div>
  </div>
</div>

<style>
  /* THE WINDOW'S OWN COLOURS, the same in light and dark: a terminal is dark. The accent is BrainDog's red. */
  .tw {
    --tw-ground: #0c0e11;
    --tw-bar: #1b1e23;
    --tw-edge: rgb(255 255 255 / 0.09);
    --tw-cmd: #f5f6f8;
    --tw-out: #b9bec7;
    --tw-dim: #7d838d;
    --tw-accent: #ea645b;
    --tw-ok: #5fd08f;
    --tw-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;

    min-inline-size: 0;
    overflow: hidden;
    border: 1px solid var(--tw-edge);
    border-radius: 12px;
    background: var(--tw-ground);
    box-shadow: 0 1px 0 rgb(255 255 255 / 0.04) inset, 0 12px 32px -16px rgb(0 0 0 / 0.5);
    color-scheme: dark;
  }

  .bar {
    position: relative;
    display: flex;
    align-items: center;
    block-size: 32px;
    padding-inline: 12px;
    background: var(--tw-bar);
    border-block-end: 1px solid var(--tw-edge);
  }

  .dots {
    display: flex;
    gap: 7px;
  }

  .dots i {
    inline-size: 11px;
    block-size: 11px;
    border-radius: 50%;
    background: #ff5f57;
  }

  .dots i:nth-child(2) {
    background: #febc2e;
  }

  .dots i:nth-child(3) {
    background: #28c840;
  }

  /* The title sits in the middle of the bar, as a terminal's does, and gives way to the dots on a narrow window. */
  .title {
    position: absolute;
    inset-inline: 72px;
    overflow: hidden;
    color: var(--tw-dim);
    font: 500 12px/1 var(--tw-mono);
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE SESSION scrolls sideways inside the window, never the page. */
  .body {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    scrollbar-color: rgb(255 255 255 / 0.18) transparent;
  }

  .screen {
    inline-size: max-content;
    min-inline-size: 100%;
    padding: 14px 16px 16px;
    font: 400 13px/1.65 var(--tw-mono);
    color: var(--tw-out);
    font-variant-ligatures: none;
  }

  .ln {
    white-space: pre;
  }

  .ln[data-kind='cmd'] {
    color: var(--tw-cmd);
  }

  .ln[data-kind='head'] {
    color: var(--tw-accent);
    font-weight: 500;
  }

  .ln[data-kind='dim'] {
    color: var(--tw-dim);
  }

  .ln[data-kind='ok'] {
    color: var(--tw-ok);
  }

  /* A COMMAND'S OUTPUT sits two spaces in, under the command, as a shell's does after the prompt. */
  .ln:not([data-kind='cmd']) {
    padding-inline-start: 2ch;
  }

  .ps {
    margin-inline-end: 1ch;
    color: var(--tw-accent);
    font-weight: 600;
  }

  .cur {
    display: inline-block;
    inline-size: 0.6em;
    block-size: 1.15em;
    vertical-align: text-bottom;
    background: var(--tw-cmd);
    animation: blink 1.1s steps(1, end) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  /* PLAYED IN: hidden only once the script has emptied the count, so with scripting off every line shows. */
  .ln:not(.shown) {
    opacity: 0;
  }

  .ln.shown {
    transition: opacity 160ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .cur {
      animation: none;
    }

    .ln.shown {
      transition: none;
    }
  }
</style>
