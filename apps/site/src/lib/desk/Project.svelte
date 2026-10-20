<!--
  The desk's project place: Tidepool's page, with where it stands, two figures, revenue by month, its people and
  what it runs on. Everything is Maya's, from `../demo/maya.ts`; the bars are drawn by `draw.ts` from cents.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import { PEOPLE, PROJECT, PROJECTS, slotVars } from '../demo/maya.ts';
  import { BARS, bars } from './draw.ts';

  const p = PROJECTS[PROJECT.id];
  /* The bars are said in thousands of dollars: 100,000 cents to one. */
  const K = 100_000;
  const drawn = bars(
    PROJECT.months.bars.map((b) => ({ label: b.month, value: b.cents / K })),
    PROJECT.months.max / K,
  );
</script>

<div class="phead" style={slotVars(p.slot)}>
  <span class="well ph big-face"><Icon name={p.icon} /></span>
  <div><h3>{PROJECT.title}</h3><p class="sub">{PROJECT.sub}</p></div>
  <span class="next">
    <span class="aface on"><AgentMark id={PROJECT.next.agent} size={14} /></span>
    <span>{PROJECT.next.text} · <b>{PROJECT.next.who}</b>, {PROJECT.next.when}</span>
  </span>
</div>

<div class="grid" style={slotVars(p.slot)}>
  <div class="t s8">
    <p class="thd"><span class="well"><Icon name="file" /></span>{PROJECT.brief.head}</p>
    <p class="stands">
      {#each PROJECT.brief.parts as part}{#if typeof part === 'string'}{part}{:else}<span class="fig" class:late={part.late}
            >{part.text}</span
          >{/if}{/each}
    </p>
  </div>

  <div class="s4 kpis">
    {#each PROJECT.kpis as k}
      <div class="t"><div class="sub kl">{k.label}</div><div class="big">{k.big}</div><div class="up">{k.delta}</div></div>
    {/each}
  </div>

  <div class="t s6">
    <p class="thd"><span class="well"><Icon name="bars" /></span>{PROJECT.months.head}<span class="r">{PROJECT.months.unit}</span></p>
    <svg class="bars" viewBox="0 0 {BARS.w} {BARS.h}" aria-hidden="true">
      {#each drawn as b}
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="5" class:now={b.now} />
        <text x={b.cx} y={b.ly} text-anchor="middle">{b.label}</text>
      {/each}
    </svg>
  </div>

  <div class="t s3 hide-phone">
    <p class="thd"><span class="well"><Icon name="users" /></span>{PROJECT.people.head}</p>
    <div class="list">
      {#each PROJECT.people.who as id}
        {@const who = PEOPLE[id]}
        <div class="li">
          <span class="face" style={slotVars(who.slot)} aria-hidden="true">{who.initials}</span>
          <div class="grow">{who.name}<span>{who.role}</span></div>
        </div>
      {/each}
    </div>
  </div>

  <div class="t s3 hide-phone">
    <p class="thd"><span class="well"><Icon name="server" /></span>{PROJECT.runsOn.head}</p>
    <div class="list">
      {#each PROJECT.runsOn.services as s}
        <div class="li">
          <span class="dot" class:soon={!s.ok} aria-hidden="true"></span>
          <div class="grow">{s.name}{#if s.sub}<span>{s.sub}</span>{/if}</div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .phead {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 2px 2px 14px;
    flex-wrap: wrap;
  }

  .phead h3 {
    margin: 0;
    font: 600 23px/1.1 var(--head);
    letter-spacing: -0.03em;
  }

  .phead .sub {
    margin: 0;
  }

  .phead :global(.big-face) {
    inline-size: 48px;
    block-size: 48px;
    border-radius: 12px;
  }

  .phead :global(.big-face .icon) {
    inline-size: 24px;
    block-size: 24px;
  }

  .next {
    margin-inline-start: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--tile);
    font-size: var(--t-site-13);
  }

  .stands {
    font-size: var(--t-site-17);
    line-height: 1.5;
    margin: 0;
    text-wrap: pretty;
  }

  .kpis {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .kl {
    margin: 0 0 4px;
  }

  .up {
    color: var(--good);
    font-size: var(--t-site-13);
    font-weight: 500;
  }

  .bars {
    width: 100%;
    height: 120px;
    display: block;
  }

  /* A project's chart takes the project's slot (proj F6): past months its tint mix, this month its colour. */
  .bars rect {
    fill: color-mix(in oklab, var(--ph) 45%, var(--tile));
  }

  .bars rect.now {
    fill: var(--ph);
  }

  .bars text {
    fill: var(--muted);
    font: 500 12px var(--ui);
  }

  .face {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font: 600 12px/1 var(--ui);
    /* A person's face (SPEC 1.3): the slot's tint disc and its foreground letter. */
    background: var(--ph-tint);
    color: var(--ph);
    flex: none;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--live);
    flex: none;
  }

  .dot.soon {
    background: var(--warn);
  }

  @media (max-width: 760px) {
    .stands {
      font-size: var(--t-site-16);
    }

    .next {
      margin-inline-start: 0;
    }
  }
</style>
