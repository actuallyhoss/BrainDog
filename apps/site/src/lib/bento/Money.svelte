<!--
  Money in miniature: the three figures the demo's home screen leads with, and the balance walked
  forward to the first day it would go under.

  THE LINE IS A DRAWING OF THE MECHANISM and carries no figure, so it cannot disagree with the demo:
  start from what is liquid, apply every dated movement in order, and stop where it crosses zero.
  It draws itself from the start to the end because that is what the walk does.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { site } from '../copy.ts';

  const c = site.bento.money;
</script>

<div class="money" aria-hidden="true">
  <ul class="figs">
    {#each c.figures as f}
      <li class="fig">
        <span class="fig-label">{f.label}{#if f.late}<span class="late"><Icon name="alert" size="s" /></span>{/if}</span>
        <span class="fig-value num"><span class="code">{f.currency}</span> {f.amount}</span>
      </li>
    {/each}
  </ul>

  <div class="walk">
    <p class="walk-head"><span>{c.walked}</span><span class="under">{c.under}</span></p>
    <svg class="chart" viewBox="0 0 320 96">
      <line class="zero" x1="0" x2="320" y1="72" y2="72" />
      <path class="area" d="M0 18H44V32H96V24H150V46H206V38H250V86H320V96H0z" />
      <path class="line" d="M0 18H44V32H96V24H150V46H206V38H250V86H320" pathLength="1" />
      <circle class="dot" cx="250" cy="72" r="5.5" />
    </svg>
  </div>
</div>

<style>
  .money {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-3);
    inline-size: 100%;
  }

  .figs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fig {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
    padding-block: 10px;
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--e1);
  }

  .fig-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .late {
    color: var(--warn);
  }

  .fig-value {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  /* The currency quiet in front of the figure, as the app draws it. */
  .code {
    color: var(--dim);
    font-size: var(--t-xs);
    letter-spacing: 0.02em;
  }

  .walk {
    padding: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .walk-head {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .under {
    color: var(--warn);
    font-weight: 600;
  }

  .chart {
    display: block;
    inline-size: 100%;
    block-size: auto;
    aspect-ratio: 320 / 96;
    overflow: visible;
  }

  .zero {
    stroke: var(--edge);
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }

  .area {
    fill: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  .line {
    fill: none;
    stroke: var(--accent-text);
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }

  .dot {
    fill: var(--warn);
    stroke: var(--s1);
    stroke-width: 3;
    transform-box: fill-box;
    transform-origin: center;
  }

  @media (width < 480px) {
    .figs {
      grid-template-columns: minmax(0, 1fr);
    }

    .fig {
      flex-direction: row;
      align-items: baseline;
      justify-content: space-between;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .line {
      animation: draw 10s var(--ease-out) infinite both;
    }

    .area {
      animation: fill 10s linear infinite both;
    }

    .dot {
      animation: pop 10s var(--ease-spring) infinite both;
    }

    .under {
      animation: label 10s linear infinite both;
    }

    .chart {
      animation: reset 10s linear infinite both;
    }
  }

  @keyframes draw {
    0% {
      stroke-dashoffset: 1;
    }

    38%,
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes fill {
    0%,
    10% {
      opacity: 0;
    }

    40%,
    100% {
      opacity: 1;
    }
  }

  @keyframes pop {
    0%,
    38% {
      transform: scale(0);
    }

    44%,
    100% {
      transform: none;
    }
  }

  @keyframes label {
    0%,
    40% {
      opacity: 0;
    }

    46%,
    100% {
      opacity: 1;
    }
  }

  @keyframes reset {
    0%,
    92% {
      opacity: 1;
    }

    100% {
      opacity: 0;
    }
  }
</style>
