<!--
  Three messages arrive, Slash learns their shape once, and every one is filed: `docs/07` §4, drawn.

  THE INSIDE OF ONE TILE (SYSTEM §6, 29 September), three steps across it with an arrow between each: what arrives,
  the shape Slash learned from it, and the list it fills. Each step has a heading row with an icon well; the messages,
  the learned fields and the filed rows sit in the tile's second fill, never in a tile of their own. The host draws the
  tile round it. Below 900 the steps stack and the arrows turn down.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from './icons.ts';

  type Flow = {
    steps: readonly string[];
    arrivals: readonly { from: string; text: string }[];
    pattern: { name: string; fields: readonly (readonly string[])[]; tested: string; writes: string };
    list: string;
    columns: readonly string[];
    rows: readonly (readonly string[])[];
  };

  let { flow }: { flow: Flow } = $props();

  /* The glyph on each step's heading: what arrives, what Slash learned, where it went. */
  const GLYPHS: readonly IconName[] = ['inbox', 'slash', 'receipt'];
</script>

{#snippet head(i: number)}
  <p class="head">
    <span class="well"><Icon name={GLYPHS[i] ?? 'file'} size="m" /></span>
    <span class="head-title">{flow.steps[i]}</span>
  </p>
{/snippet}

<div class="flow-figure" role="img" aria-label="{flow.steps.join(', then ')}: {flow.pattern.name}, into {flow.list}">
  <div class="step">
    {@render head(0)}
    <ul class="msgs">
      {#each flow.arrivals as a, i (a.text)}
        <li class="msg" style="--i: {i}">
          <span class="from"><Icon name="mail" size="s" />{a.from}</span>
          <span class="text">{a.text}</span>
        </li>
      {/each}
    </ul>
  </div>

  <span class="arrow" aria-hidden="true"><Icon name="arrow" size="m" /></span>

  <div class="step">
    {@render head(1)}
    <div class="well-box">
      <p class="p-name">{flow.pattern.name}</p>
      <dl class="fields">
        {#each flow.pattern.fields as [k, v] (k)}
          <div class="field"><dt>{k}</dt><dd>{v}</dd></div>
        {/each}
      </dl>
    </div>
    <p class="tested"><Icon name="check" size="m" />{flow.pattern.tested}</p>
    <p class="writes">{flow.pattern.writes}</p>
  </div>

  <span class="arrow" aria-hidden="true"><Icon name="arrow" size="m" /></span>

  <div class="step">
    {@render head(2)}
    <div class="well-box">
      <p class="p-name">{flow.list}</p>
      <div class="t-row t-head">
        {#each flow.columns as c (c)}<span>{c}</span>{/each}
      </div>
      {#each flow.rows as r (r[0])}
        <div class="t-row">
          <span class="t-what">{r[0]}</span><span class="num">{r[1]}</span><span class="t-dim">{r[2]}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .flow-figure {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr) 24px minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }

  .step {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
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

  .head-title {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .arrow {
    display: grid;
    place-items: center;
    block-size: var(--well);
    color: var(--dim);
  }

  .msgs {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A MESSAGE in the tile's second fill: who sent it, and its words. */
  .msg {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--s1);
  }

  .from {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .text {
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .well-box {
    display: grid;
    gap: var(--sp-2);
    padding: 12px;
    border-radius: var(--r-md);
    background: var(--s1);
  }

  .p-name {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .fields {
    display: grid;
    gap: 6px;
    margin: 0;
  }

  .field {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: var(--sp-2);
    align-items: baseline;
  }

  .field dt {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .field dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
  }

  .tested {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .tested :global(svg) {
    color: var(--earn);
  }

  .writes {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .t-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 44px;
    gap: var(--sp-2);
    align-items: baseline;
    padding-block: 6px;
    border-block-start: 1px solid var(--line);
    color: var(--ink);
    font-size: var(--t-base);
  }

  .t-head {
    border-block-start: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .t-what {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .t-dim {
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: end;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  /* The messages arrive one after another as the band comes in, and never under reduced motion. */
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      .msg {
        animation: arrive linear both;
        animation-timeline: view();
        animation-range: entry calc(10% + var(--i) * 8%) cover calc(24% + var(--i) * 8%);
      }
    }
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  @media (width < 900px) {
    .flow-figure {
      grid-template-columns: minmax(0, 1fr);
    }

    .arrow {
      block-size: 24px;
      transform: rotate(90deg);
    }
  }
</style>
