<!--
  Slash, drawn: the palette a record opens on `/`, with the three things it does as tabs.

  DRAWN IN HTML AND CSS, like the app in the hero, so every word is text and nothing is a picture of text. The
  prerendered page shows the first mode whole; with scripting the tabs switch it, and the palette moves to the next
  mode on its own every few seconds until somebody presses a tab, unless the reader has asked for reduced motion.

  THE NEW APP'S PALETTE ON A TILE (the design system): the ask field with its search glyph and its return key
  cap, the three modes as a segmented control with the chosen one in ink, then the answer: an icon well and the
  answer's sentence, the rows it read with a bar each where they are sums of money (the largest in ink and the rest
  grey, as every chart here), and where it came from. It draws its own surface, a tile at level two, because a palette
  floats; the host places it and never wraps it in a second tile.
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

  /* THE SUMS A MODE'S ROWS HOLD, when every row holds one: the chart is drawn from the answer's own figures. */
  const amount = (cell: string): number | null => {
    const m = /([\d,]+\.\d{2})/.exec(cell);
    return m ? Number.parseFloat((m[1] ?? '').replaceAll(',', '')) : null;
  };
  const sums = $derived(mode.rows.map((r) => amount(r[1] ?? '')));
  const charted = $derived(sums.every((v) => v !== null && v > 0));
  const most = $derived(Math.max(...sums.map((v) => v ?? 0)));

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
    <p class="field">
      <Icon name="search" size="m" />
      {#key at}
        <span class="prompt" data-mode={mode.id}>
          {#if mode.id === 'notice'}<span class="noticed">Slash noticed</span> · {mode.prompt}{:else}{mode.prompt}{/if}
        </span>
      {/key}
      <span class="cap" aria-hidden="true">↵</span>
    </p>
    <div class="modes" role="tablist" aria-label={demo.label}>
      {#each demo.modes as m, i (m.id)}
        <button type="button" role="tab" aria-selected={i === at} class:on={i === at} onclick={() => pick(i)}>{m.label}</button>
      {/each}
    </div>
  </div>

  {#key at}
    <div class="answer" role="tabpanel" aria-label={mode.label}>
      <p class="lead">
        <span class="well" aria-hidden="true"><Icon name={mode.id === 'draft' ? 'file' : mode.id === 'notice' ? 'bell' : 'slash'} size="m" /></span>
        <span>{mode.lead}</span>
      </p>
      <ul class="rows">
        {#each mode.rows as row, i (row[0])}
          <li class="row" data-mode={mode.id} data-charted={charted ? '' : undefined}>
            <span class="what">{row[0]}</span>
            {#if charted}
              <span class="track" aria-hidden="true"
                ><span class="bar" data-most={sums[i] === most ? '' : undefined} style="--share: {((sums[i] ?? 0) / most) * 100}%"></span></span
              >
            {/if}
            <span class="val num">{row[1]}</span>
            {#if row[2]}<span class="when">{row[2]}</span>{/if}
          </li>
        {/each}
      </ul>
      <div class="foot">
        <span class="source"><Icon name={mode.id === 'draft' ? 'decide' : 'check'} size="m" />{mode.source}</span>
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
  /* A PALETTE FLOATS, so its tile sits at level two, on the tile fill, radius 22 (the design system). */
  /* ONE COLUMN THAT MAY BE NARROWER THAN ITS CONTENT, or the modes' pill sets the palette's width and a 320px phone
     scrolls the whole page sideways to reach the last one. */
  .palette {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: var(--sp-4);
    padding: 20px;
    border-radius: var(--r-lg);
    background: var(--bg);
    box-shadow: var(--e2);
    font-size: var(--t-base);
  }

  .ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  /* THE ASK FIELD: 44 tall in the second fill, radius 12, the search glyph, the words and the return key cap. */
  .field {
    display: flex;
    flex: 1 1 260px;
    align-items: center;
    gap: 10px;
    min-inline-size: 0;
    min-block-size: var(--tap);
    margin: 0;
    padding-inline: 12px 8px;
    border-radius: var(--r-md);
    background: var(--s1);
    color: var(--ink2);
  }

  .prompt {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-base);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .noticed {
    color: var(--live);
    font-weight: 600;
  }

  .cap {
    display: inline-grid;
    flex: none;
    place-items: center;
    min-inline-size: 22px;
    block-size: 22px;
    border-radius: var(--r-sm);
    background: var(--bg);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  /* THE MODES, a segmented control in the second fill with the chosen one in ink. */
  .modes {
    display: inline-flex;
    max-inline-size: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-pill);
    background: var(--s1);
  }

  .modes button {
    flex: none;
    min-block-size: var(--ctl-h-sm);
    padding-inline: 14px;
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .modes button.on {
    background: var(--ink);
    color: var(--on-ink);
  }

  .answer {
    display: grid;
    gap: var(--sp-3);
  }

  .lead {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 22px;
  }

  .well {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--well);
    block-size: var(--well);
    border-radius: var(--r-well);
    background: var(--s1);
    color: var(--ink2);
  }

  .rows {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A ROW: what, its share of the answer as a bar where the rows are sums, the sum, and when. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 40px;
    border-block-start: 1px solid var(--line);
  }

  .row[data-charted] {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
  }

  .what {
    overflow: hidden;
    color: var(--ink);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .track {
    display: block;
    block-size: 8px;
    border-radius: 3px;
    background: var(--s1);
  }

  .bar {
    display: block;
    inline-size: var(--share);
    min-inline-size: 3px;
    block-size: 100%;
    border-radius: 3px;
    background: var(--dim);
  }

  .bar[data-most] {
    background: var(--ink);
  }

  .val {
    color: var(--ink);
    font-weight: 500;
    text-align: end;
  }

  .when {
    min-inline-size: 72px;
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: end;
  }

  .row[data-mode='draft'] .val {
    color: var(--ink2);
    font-weight: 400;
    text-align: start;
  }

  .row[data-mode='draft'] {
    grid-template-columns: 96px minmax(0, 1fr);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .source {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .do {
    display: inline-flex;
    gap: var(--sp-2);
  }

  /* Drawn, not pressed: a picture of the two verbs, as the app draws them. */
  .btnlike {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    padding-inline: 14px;
    border-radius: var(--r-pill);
    background: var(--s1);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .btnlike.primary {
    background: var(--ink);
    color: var(--on-ink);
  }

  .palette[data-size='l'] {
    padding: 24px;
  }

  .palette[data-size='l'] .lead {
    font-size: var(--t-group);
    line-height: 24px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .prompt,
    .answer {
      animation: palette-in var(--d-enter) var(--ease-out) both;
    }
  }

  @keyframes palette-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (width < 640px) {
    .palette {
      padding: 16px;
    }

    .row[data-charted] {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'what val'
        'track when';
      row-gap: 6px;
      padding-block: var(--sp-2);
    }

    .row[data-charted] .what {
      grid-area: what;
    }

    .row[data-charted] .track {
      grid-area: track;
    }

    .row[data-charted] .val {
      grid-area: val;
    }

    .row[data-charted] .when {
      grid-area: when;
    }

    .modes {
      inline-size: 100%;
    }

    .modes button {
      flex: 1;
      min-block-size: var(--tap);
    }
  }
</style>
