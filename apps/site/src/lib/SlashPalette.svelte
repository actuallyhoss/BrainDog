<!--
  Slash, drawn: the palette a record opens on `/`, with the three things it does as tabs.

  DRAWN IN HTML AND CSS, like the app across the hero, so every word is text and nothing is a picture
  of text. The prerendered page shows the first mode whole; with scripting the tabs switch it, and the
  palette moves to the next mode on its own every few seconds until somebody presses a tab, unless
  the reader has asked for reduced motion.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  type Mode = {
    id: string;
    label: string;
    prompt: string;
    lead: string;
    rows: readonly (readonly string[])[];
    source: string;
  };

  let {
    demo,
    size = 'm',
  }: {
    demo: { label: string; placeholder: string; accept: string; reject: string; modes: readonly Mode[] };
    size?: 'm' | 'l';
  } = $props();

  let at = $state(0);
  let held = $state(false);
  let root: HTMLElement | undefined = $state();
  const mode = $derived(demo.modes[at]!);

  const pick = (i: number) => {
    at = i;
    held = true;
  };

  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let seen = false;
    const io = new IntersectionObserver(([e]) => (seen = !!e?.isIntersecting), { threshold: 0.35 });
    if (root) io.observe(root);
    const tick = setInterval(() => {
      if (!held && seen && !document.hidden) at = (at + 1) % demo.modes.length;
    }, 6500);
    return () => {
      clearInterval(tick);
      io.disconnect();
    };
  });
</script>

<div class="palette" data-size={size} role="group" aria-label={demo.label} bind:this={root}>
  <div class="ask">
    <span class="key" aria-hidden="true">/</span>
    {#key at}
      <p class="prompt" data-mode={mode.id}>
        {#if mode.id === 'notice'}<span class="noticed">Slash noticed</span> · {mode.prompt}{:else}{mode.prompt}{/if}
      </p>
    {/key}
    <div class="modes" role="tablist" aria-label={demo.label}>
      {#each demo.modes as m, i (m.id)}
        <button type="button" role="tab" aria-selected={i === at} class:on={i === at} onclick={() => pick(i)}>{m.label}</button>
      {/each}
    </div>
  </div>

  {#key at}
    <div class="answer" role="tabpanel" aria-label={mode.label}>
      <p class="lead"><span class="face" aria-hidden="true">/</span>{mode.lead}</p>
      <ul class="rows">
        {#each mode.rows as row (row[0])}
          <li class="row" data-mode={mode.id}>
            <span class="what">{row[0]}</span>
            <span class="val num">{row[1]}</span>
            {#if row[2]}<span class="when">{row[2]}</span>{/if}
          </li>
        {/each}
      </ul>
      <div class="foot">
        <span class="source"><Icon name={mode.id === 'draft' ? 'decide' : 'check'} size="s" />{mode.source}</span>
        {#if mode.id === 'draft'}
          <span class="do">
            <span class="btnlike">{demo.reject}</span>
            <span class="btnlike primary">{demo.accept}</span>
          </span>
        {/if}
      </div>
    </div>
  {/key}
</div>

<style>
  .palette {
    overflow: hidden;
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: var(--e3);
    font-size: var(--t-base);
  }

  @media (prefers-color-scheme: dark) {
    .palette {
      background: var(--s1);
      box-shadow:
        var(--e3),
        inset 0 1px 0 color-mix(in srgb, var(--ink) 7%, transparent);
    }
  }

  .ask {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
    border-block-end: 1px solid var(--line);
  }

  .key {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    background: var(--accent);
    border-radius: 8px;
    color: var(--accent-ink);
    font-family: var(--font-display);
    font-size: var(--t-md);
    font-weight: 600;
    box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--ink) 18%, transparent);
  }

  .prompt {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .prompt[data-mode='notice'] {
    color: var(--ink2);
  }

  .noticed {
    color: var(--accent-text);
    font-weight: 600;
  }

  .modes {
    display: flex;
    flex: none;
    gap: 2px;
    padding: 3px;
    background: var(--sunk);
    border-radius: 9px;
  }

  .modes button {
    min-block-size: 28px;
    padding-inline: 10px;
    background: none;
    border: 0;
    border-radius: 7px;
    color: var(--dim);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .modes button.on {
    background: var(--s3);
    color: var(--ink);
    box-shadow: var(--e1);
  }

  .answer {
    padding: var(--sp-5) var(--sp-5) var(--sp-4);
  }

  .lead {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0 0 var(--sp-4);
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    border: 1.5px solid var(--accent);
    border-radius: 50%;
    color: var(--accent-text);
    font-family: var(--font-display);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: var(--sp-4);
    align-items: baseline;
    padding: 10px var(--sp-4);
  }

  .row[data-mode='draft'] {
    grid-template-columns: 7.5rem minmax(0, 1fr);
  }

  .row + .row {
    border-block-start: 1px solid var(--line);
  }

  .what {
    overflow: hidden;
    color: var(--ink);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .row[data-mode='draft'] .what {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .val {
    color: var(--ink);
    text-align: end;
  }

  .row[data-mode='draft'] .val {
    text-align: start;
  }

  .when {
    min-inline-size: 5.5rem;
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: end;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-block-start: var(--sp-4);
  }

  .source {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .do {
    display: flex;
    gap: var(--sp-2);
  }

  .btnlike {
    display: inline-flex;
    align-items: center;
    min-block-size: 30px;
    padding-inline: 12px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .btnlike.primary {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }

  .palette[data-size='l'] .answer {
    padding: var(--sp-6) var(--sp-6) var(--sp-5);
  }

  .palette[data-size='l'] .lead {
    font-size: var(--t-lg);
  }

  @media (prefers-reduced-motion: no-preference) {
    .prompt,
    .answer {
      animation: in 360ms var(--ease-out) both;
    }

    .row {
      animation: in 420ms var(--ease-out) both;
    }

    .row:nth-child(2) {
      animation-delay: 60ms;
    }

    .row:nth-child(3) {
      animation-delay: 120ms;
    }

    .row:nth-child(4) {
      animation-delay: 180ms;
    }
  }

  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (width < 640px) {
    .ask {
      flex-wrap: wrap;
      padding: var(--sp-3);
    }

    .prompt {
      flex-basis: calc(100% - 40px);
      white-space: normal;
    }

    .modes {
      flex: 1;
    }

    .modes button {
      flex: 1;
    }

    .answer {
      padding: var(--sp-4);
    }

    .row {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2px var(--sp-3);
      padding: 10px var(--sp-3);
    }

    .when {
      grid-column: 1;
      min-inline-size: 0;
      text-align: start;
    }

    .row[data-mode='draft'] {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
