<!--
  Today's Working now tile, as the app draws it: each agent at work right now, its maker's mark in a round face with the
  live dot, what it is on and since when, and when BrainDog last heard from it. Maya's agents, from `demo/maya.ts`.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import { PROJECTS, TODAY, slotVars } from '../demo/maya.ts';
  import { today as w } from '../copy/product.ts';

  const name = (agent: string): string => agent.charAt(0).toUpperCase() + agent.slice(1);
</script>

<section class="tile working" aria-labelledby="working-title">
  <h3 class="tile-head">
    <span class="well"><Icon name="terminal" /></span>
    <span class="tile-title" id="working-title">{w.working}</span>
    <span class="tile-count num">{TODAY.working.length}</span>
  </h3>
  <ul>
    {#each TODAY.working as a (a.agent)}
      {@const p = PROJECTS[a.project]}
      <li>
        <span class="face"><AgentMark id={a.agent} size={16} /><span class="dot live"></span></span>
        <span class="what">
          <span class="who">{name(a.agent)} <span class="proj" style={slotVars(p.slot)}><span class="pdot"></span>{p.name}</span></span>
          <span class="sub">{a.sub.charAt(0).toUpperCase() + a.sub.slice(1).replace(' · ', ', ')}</span>
        </span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .working {
    gap: var(--sp-3);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-block: 10px;
  }

  li + li {
    border-block-start: 1px solid var(--rule);
  }

  /* A WHO IS ROUND (the design system): the maker's mark in a round face, the live dot at its foot. */
  .face {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-round);
    background: var(--tile-2);
    color: var(--ink);
  }

  .face .dot {
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: 0;
    inline-size: 9px;
    block-size: 9px;
    box-shadow: 0 0 0 2px var(--tile);
  }

  .what {
    display: grid;
    min-inline-size: 0;
  }

  .who {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 22px;
  }

  .proj {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-inline-start: 4px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .pdot {
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--ph);
  }

  .sub {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
