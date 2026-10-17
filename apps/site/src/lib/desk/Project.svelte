<!--
  The desk's project place: Tidepool's page, with where it stands, two figures, revenue by month, its people and
  what it runs on. Everything is Maya's, from `../demo/maya.ts`; the bars are drawn by `draw.ts` from cents.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import { PEOPLE, PROJECT, PROJECTS } from '../demo/maya.ts';
  import { BARS, bars } from './draw.ts';

  const p = PROJECTS[PROJECT.id];
  /* The bars are said in thousands of dollars: 100,000 cents to one. */
  const K = 100_000;
  const drawn = bars(
    PROJECT.months.bars.map((b) => ({ label: b.month, value: b.cents / K })),
    PROJECT.months.max / K,
  );
</script>

<div class="phead" style="--ph:{p.hue}">
  <span class="pface big-face"><Icon name={p.icon} /></span>
  <div><h3>{PROJECT.title}</h3><p class="sub">{PROJECT.sub}</p></div>
  <span class="next">
    <span class="agent"><AgentMark id={PROJECT.next.agent} /></span>
    <span>{PROJECT.next.text} · <b>{PROJECT.next.who}</b>, {PROJECT.next.when}</span>
  </span>
</div>

<div class="grid" style="--ph:{p.hue}">
  <div class="t s8">
    <p class="th"><Icon name="menu" />{PROJECT.brief.head}</p>
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
    <p class="th"><Icon name="cash" />{PROJECT.months.head}<span class="r">{PROJECT.months.unit}</span></p>
    <svg class="bars" viewBox="0 0 {BARS.w} {BARS.h}" aria-hidden="true">
      {#each drawn as b}
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="5" class:now={b.now} />
        <text x={b.cx} y={b.ly} text-anchor="middle">{b.label}</text>
      {/each}
    </svg>
  </div>

  <div class="t s3 hide-phone">
    <p class="th"><Icon name="users" />{PROJECT.people.head}</p>
    <div class="list">
      {#each PROJECT.people.who as id}
        {@const who = PEOPLE[id]}
        <div class="li">
          <span class="face" style="--h:{who.hue}" aria-hidden="true">{who.initials}</span>
          <div class="grow">{who.name}<span>{who.role}</span></div>
        </div>
      {/each}
    </div>
  </div>

  <div class="t s3 hide-phone">
    <p class="th"><Icon name="refresh" />{PROJECT.runsOn.head}</p>
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

  .big-face {
    width: 38px;
    height: 38px;
    border-radius: 10px;
  }

  .next {
    margin-inline-start: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 11px;
    border-radius: 9px;
    background: var(--tile);
    font-size: var(--t-app-sm);
  }

  .stands {
    font-size: var(--t-site-18);
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
    font-size: var(--t-app-xs);
    font-weight: 500;
  }

  .bars {
    width: 100%;
    height: 120px;
    display: block;
  }

  .bars rect {
    fill: var(--bar);
  }

  .bars rect.now {
    --now: hsl(var(--ph) 65% 45%);
    fill: var(--now);
  }

  .bars text {
    fill: var(--muted);
    font: 500 10.5px var(--ui);
  }

  .face {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font: 600 10.5px/1 var(--ui);
    /* The person's hue (`--h`, set on the face) is the one thing that varies; the two steps are named once and read below. */
    --face-bg: hsl(var(--h) 45% 88%);
    --face-ink: hsl(var(--h) 45% 28%);
    background: var(--face-bg);
    color: var(--face-ink);
    flex: none;
  }

  :global(:root[data-theme='dark']) .face {
    --face-bg: hsl(var(--h) 25% 24%);
    --face-ink: hsl(var(--h) 55% 82%);
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .face {
      --face-bg: hsl(var(--h) 25% 24%);
      --face-ink: hsl(var(--h) 55% 82%);
    }
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--live);
    flex: none;
  }

  .dot.soon {
    background: var(--warn);
  }

  @media (max-width: 760px) {
    .stands {
      font-size: var(--t-site-16-5);
    }

    .next {
      margin-inline-start: 0;
    }
  }
</style>
