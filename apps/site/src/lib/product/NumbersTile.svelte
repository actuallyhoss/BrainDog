<!--
  Today's Numbers tile, as the app draws it on 1 November: one figure a project, each under its project's dot and name
  with which way it went beneath. Maya's figures, from `demo/maya.ts`. In the drawing's narrower tile it shows the
  first two, each column wide enough to say its label whole, as the app's wide tile does.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { NUMBERS, PROJECTS, slotVars } from '../demo/maya.ts';
  import { today as w } from '../copy/product.ts';
</script>

<section class="tile numbers" aria-labelledby="numbers-title">
  <h3 class="tile-head">
    <span class="well"><Icon name="gauge" /></span>
    <span class="tile-title" id="numbers-title">{w.numbers}</span>
  </h3>
  <ul>
    {#each NUMBERS.slice(0, 2) as n (n.project)}
      {@const p = PROJECTS[n.project]}
      <li style={slotVars(p.slot)}>
        <span class="of"><span class="pdot"></span><b>{p.name}</b> {n.label}</span>
        <span class="big"><span class="figure num">{n.big}</span>{#if n.unit}<span class="unit">{n.unit}</span>{/if}</span>
        <span class="change"><Icon name={n.trend === 'up' ? 'trend-up' : 'trend-down'} size="m" />{n.change}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    gap: 4px;
    min-inline-size: 0;
    padding-inline: var(--sp-4);
  }

  li:first-child {
    padding-inline-start: 0;
  }

  li + li {
    border-inline-start: 1px solid var(--rule);
  }

  .of {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .of b {
    color: var(--ink);
    font-weight: 600;
  }

  .pdot {
    flex: none;
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--ph);
  }

  .big {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .figure {
    font-size: var(--fs-figure);
  }

  .unit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .change {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--good);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  @container desk (width < 520px) {
    ul {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-3);
    }

    li,
    li:first-child {
      padding: 0;
    }

    li + li {
      padding-block-start: var(--sp-3);
      border-inline-start: 0;
      border-block-start: 1px solid var(--rule);
    }
  }
</style>
