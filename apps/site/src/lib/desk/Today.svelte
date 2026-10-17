<!--
  The desk's Today: Maya's brief with the two things that need her, cash ahead, her four projects, the agents at
  work and what has just come in.

  JUST IN TAKES A NEW ARRIVAL EVERY 4.2 SECONDS, and only while it can be watched: `active` is true while Today is the
  open place and the desk is on screen, and each beat also asks that the tab be visible and motion allowed. The HTML
  holds the first three arrivals, so with scripting off nothing is missing and nothing moves.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import { ARRIVALS, BRIEF, PROJECT_ORDER, PROJECTS, TODAY, type Arrival } from '../demo/maya.ts';
  import { AREA, area, spark } from './draw.ts';
  import { DESK, type Tab } from './words.ts';

  let { active, ongo }: { active: boolean; ongo: (tab: Tab) => void } = $props();

  const cash = area(TODAY.cash.series);

  let shown = $state<{ a: Arrival; n: number }[]>(ARRIVALS.slice(0, 3).map((a, n) => ({ a, n })));
  let next = 3;
  let fresh = $state(-1);

  $effect(() => {
    if (!active) return;
    const beat = setInterval(() => {
      let reduced = false;
      try {
        reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch {}
      if (reduced || document.hidden) return;
      const a = ARRIVALS[next % ARRIVALS.length]!;
      fresh = next;
      shown = [{ a, n: next }, ...shown].slice(0, 3);
      next += 1;
    }, 4200);
    return () => clearInterval(beat);
  });
</script>

<div class="grid">
  <div class="t s8">
    <p class="th"><Icon name="menu" />{BRIEF.date}<span class="r">{DESK.today.rewritten} {BRIEF.rewritten}</span></p>
    <p class="brief">
      {#each BRIEF.parts as part}{#if typeof part === 'string'}{part}{:else}<span class="fig" class:late={part.late}
            >{part.text}</span
          >{/if}{/each}
    </p>
    {#each TODAY.needs as need}
      <div class="needrow">
        <span class="dotr" aria-hidden="true"></span>
        <p>{need.what}<span>{need.sub}</span></p>
        <button type="button" class="dbtn desk-js" data-tone={need.tone} onclick={() => ongo('needs')}>{need.act}</button>
      </div>
    {/each}
  </div>

  <div class="t s4 hide-phone">
    <p class="th"><Icon name="cash" />{TODAY.cash.head}<span class="r">{TODAY.cash.aside}</span></p>
    <div class="big">{TODAY.cash.amount}</div>
    <div class="sub">{TODAY.cash.sub}</div>
    <svg class="area" viewBox="0 0 {AREA.w} {AREA.h}" preserveAspectRatio="none" aria-hidden="true">
      <path class="a" d={cash.fill} /><path class="l" d={cash.line} vector-effect="non-scaling-stroke" />
    </svg>
  </div>

  {#each PROJECT_ORDER as id}
    {@const p = PROJECTS[id]}
    {@const card = TODAY.cards[id]}
    <div class="t s3 pcard" class:hide-phone={TODAY.hidePhone.includes(id)} style="--ph:{p.hue}">
      <div class="row1"><span class="pface"><Icon name={p.icon} /></span><b>{p.name}</b><span class="lane">{p.lane}</span></div>
      {#if card.meter}
        <div><div class="big">{card.big}</div><div class="sub" class:late={card.late}>{card.sub}</div></div>
        <span class="meter" aria-hidden="true"><i style="width:{card.meter.percent}%"></i></span>
        <div class="sub">{card.meter.sub}</div>
      {:else}
        {@const line = spark(card.series ?? [])}
        <div class="val">
          <div><div class="big">{card.big}</div><div class="sub" class:late={card.late}>{card.sub}</div></div>
          {#if card.series && card.series.length >= 3}
            <svg class="spark" viewBox="0 0 84 30" aria-hidden="true"><path class="a" d={line.fill} /><path class="l" d={line.line} /></svg>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  <div class="t s6 hide-phone">
    <p class="th"><Icon name="zap" />{TODAY.heads.working}</p>
    <div class="list">
      {#each TODAY.working as w}
        <div class="li">
          <span class="agent"><AgentMark id={w.agent} /></span>
          <div class="grow">{w.what}<span>{w.sub}</span></div>
          {#if w.live}<span class="livedot" aria-hidden="true"></span>{:else}<span class="tag">{TODAY.heads.done}</span>{/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="t s6">
    <p class="th"><Icon name="download" />{TODAY.heads.arrivals}<span class="r">{TODAY.heads.arrivalsAside}</span></p>
    <div class="list">
      {#each shown as item (item.n)}
        <div class="li" class:arr={item.n === fresh}>
          <span class="agent"><Icon name={item.a.icon} /></span>
          <div class="grow">{item.a.what}<span>{item.a.to} · {item.a.how}</span></div>
          {#if item.a.amount}<span class="amt num">{item.a.amount}</span>{/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .brief {
    font-size: 18px;
    line-height: 1.5;
    margin: 0;
    text-wrap: pretty;
  }

  .needrow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 0 0;
    margin-top: 11px;
    border-top: 1px solid var(--rule2);
  }

  .needrow p {
    margin: 0;
    flex: 1;
    min-width: 0;
  }

  .needrow p span {
    display: block;
    color: var(--muted);
    font-size: 12.5px;
  }

  .pcard {
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .row1 {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .row1 b {
    font-weight: 600;
    font-size: 14px;
  }

  .lane {
    margin-left: auto;
    font-size: 11.5px;
    color: var(--muted);
  }

  .val {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 8px;
  }

  .val .big {
    font-size: 23px;
  }

  .spark {
    width: 84px;
    height: 30px;
    overflow: visible;
    flex: none;
  }

  .spark .l {
    fill: none;
    stroke: hsl(var(--ph) 65% 45%);
    stroke-width: 1.8;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .spark .a {
    fill: color-mix(in srgb, hsl(var(--ph) 65% 45%) 12%, transparent);
  }

  .meter {
    display: block;
    height: 6px;
    border-radius: 4px;
    background: var(--bar);
    overflow: hidden;
  }

  .meter i {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: hsl(var(--ph, 0) 60% 50%);
  }

  .area {
    width: 100%;
    height: 64px;
    display: block;
    margin-top: 10px;
  }

  .area .l {
    fill: none;
    stroke: var(--chart);
    stroke-width: 1.6;
  }

  .area .a {
    fill: color-mix(in srgb, var(--chart) 7%, transparent);
  }

  .livedot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--live);
    flex: none;
    box-shadow: 0 0 0 3px var(--live-ring);
  }

  .amt {
    font-weight: 600;
  }

  .arr {
    animation: land 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  @keyframes land {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (max-width: 760px) {
    .brief {
      font-size: 16.5px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .arr {
      animation: none;
    }
  }
</style>
