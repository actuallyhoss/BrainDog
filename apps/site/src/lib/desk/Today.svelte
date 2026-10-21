<!--
  The desk's Today, as the app's Today draws it: the date, the sun and "Today", the one line under it, then
  three tiles (Needs you, Working now, Cash ahead) and the four project cards.

  THE LINE'S FIGURES PRESS. "2 need you" opens Needs you, "2 agents" opens Agents, and "14 months" opens where
  it comes from, attached under the line (the job the old Brief card did). Answering on the Needs you tile moves the
  ask out with an Undo, and the count on the tab and the line's first phrase follow, because all three read one store.

  With scripting off every word is still here; the answer buttons are drawn for a page whose script runs.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import { BRIEF, EVIDENCE, NEEDS, PROJECT_ORDER, PROJECTS, TODAY, slotVars } from '../demo/maya.ts';
  import { AREA, area, spark } from './draw.ts';
  import { needs } from './needs.svelte.ts';
  import { DESK, type Tab } from './words.ts';

  let { ongo }: { ongo: (tab: Tab) => void } = $props();

  const cash = area(TODAY.cash.series);
  const byId = new Map(NEEDS.map((n) => [n.id, n]));
  const open = $derived(needs.open.map((id) => byId.get(id)!).filter(Boolean));
  const done = $derived(needs.done.map((id) => byId.get(id)!).filter(Boolean));

  let behind = $state(false);
  const evidence = EVIDENCE.cash;
</script>

<p class="date">{BRIEF.date}</p>
<div class="hello">
  <h2 class="greet"><Icon name="today" />{DESK.tabs.today}</h2>
  <p class="line">
    <button type="button" class="lead needs" class:clear={open.length === 0} onclick={() => ongo('needs')}
      >{DESK.needYou(open.length)}</button
    >, <button type="button" class="lead" onclick={() => ongo('agents')}>{BRIEF.agents.text}</button>{DESK.areWorking}<button
      type="button"
      class="lead"
      aria-expanded={behind}
      aria-controls="desk-behind"
      onclick={() => (behind = !behind)}>{BRIEF.cash.text}</button
    >.
  </p>
</div>
{#if behind}
  <div class="behind" id="desk-behind">
    <p class="bh">{DESK.behind} · {evidence.head}</p>
    {#each evidence.rows as [label, value]}<p class="evr"><span>{label}</span><b class="num">{value}</b></p>{/each}
  </div>
{/if}

<div class="dtiles">
  <section class="t needs-tile" aria-label={TODAY.heads.needs}>
    <p class="thd">
      <span class="well"><Icon name="inbox" /></span>{TODAY.heads.needs}
      {#if open.length}<span class="count num">{open.length}</span>{/if}
    </p>
    {#each open as n (n.id)}
      <div class="need">
        <span class="well l" class:late={n.late}><Icon name={n.late ? 'alert' : 'calendar'} /></span>
        <div class="grow">
          <b>{n.what}</b>
          {#if n.late}{@const [first, ...rest] = n.sub.split(' · ')}<span
              ><strong class="late-word">{first}</strong>{rest.length ? ` · ${rest.join(' · ')}` : ''}</span
            >{:else}<span>{n.sub}</span>{/if}
        </div>
        <div class="end">
          <span class="fig">{n.amount}</span>
          <button type="button" class="dbtn red desk-js" onclick={() => needs.answer(n.id, true)}>{n.yes}</button>
        </div>
      </div>
    {/each}
    {#each done as n (n.id)}
      <div class="done">
        <Icon name="check" />
        <p>{n.done}</p>
        <button type="button" class="undo desk-js" onclick={() => needs.undo(n.id)}>{DESK.needs.undo}</button>
      </div>
    {/each}
    {#if open.length === 0 && done.length === 0}<p class="sub">{DESK.needs.empty}</p>{/if}
  </section>

  <section class="t" aria-label={TODAY.heads.working}>
    <p class="thd"><span class="well"><Icon name="agent" /></span>{TODAY.heads.working}<span class="r num">{TODAY.working.length}</span></p>
    <div class="list">
      {#each TODAY.working as w (w.agent)}
        <div class="li">
          <span class="aface on"><AgentMark id={w.agent} size={16} /></span>
          <div class="grow"><b>{w.what}</b><span>{w.sub}</span></div>
        </div>
      {/each}
    </div>
  </section>

  <section class="t hide-phone hide-mid" aria-label={TODAY.cash.head}>
    <p class="thd"><span class="well"><Icon name="money" /></span>{TODAY.cash.head}</p>
    <p class="cashfig"><span class="big">{TODAY.cash.figure}</span> <span class="sub">{TODAY.cash.say}</span></p>
    <svg class="area" viewBox="0 0 {AREA.w} {AREA.h}" preserveAspectRatio="none" aria-hidden="true">
      <path class="a" d={cash.fill} /><path class="l" d={cash.line} vector-effect="non-scaling-stroke" />
    </svg>
    <p class="sub foot">{TODAY.cash.foot}</p>
  </section>
</div>

<div class="cards hide-phone">
  {#each PROJECT_ORDER as id (id)}
    {@const p = PROJECTS[id]}
    {@const c = TODAY.cards[id]}
    <div class="pcard" style={slotVars(p.slot)}>
      <div class="ra">
        <span class="pwell"><Icon name={p.icon} /></span>
        <div class="pname"><b>{p.name}</b><span>{p.lane}</span></div>
        {#if c.late}<span class="lateflag"><i aria-hidden="true"></i>{c.late}</span>{/if}
      </div>
      <div class="rb">
        <p><span class="pbig">{c.big}</span> <span class="sub">{c.label}</span></p>
        {#if c.series && c.series.length >= 3}
          {@const line = spark(c.series, 84, 28)}
          <svg class="spark" viewBox="0 0 84 28" aria-hidden="true"><path class="a" d={line.fill} /><path class="l" d={line.line} /></svg>
        {/if}
      </div>
      {#if c.meter}
        <div class="rc">
          <span class="meter" aria-hidden="true"><i style="width:{c.meter.percent}%"></i></span>
          <span class="sub">{c.meter.sub}</span>
        </div>
      {/if}
      <p class="rd"><Icon name="arrow-right" /><span>{c.next}</span></p>
      <div class="re">
        {#each c.foot.agents as a (a)}<span class="aface sm" class:on={c.foot.working}><AgentMark id={a} size={14} /></span>{/each}
        <span class="sub">{c.foot.say}</span>
      </div>
    </div>
  {/each}
</div>

<style>
  .date {
    margin: 0;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  /* THE PAGE'S NAME, THEN ITS SENTENCE UNDER IT, as the app's head draws them: the sun at 24 and "Today" in Lexend 28. */
  .hello {
    display: grid;
    gap: 4px;
    margin-block: 4px 16px;
  }

  .greet {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font: 600 28px/1.15 var(--head);
    letter-spacing: -0.035em;
  }

  .greet :global(.icon) {
    inline-size: 24px;
    block-size: 24px;
    color: var(--ink2);
  }

  .line {
    margin: 0;
    font-size: var(--t-site-17);
    line-height: 1.45;
    color: var(--ink2);
    text-wrap: pretty;
  }

  /* THE LINE'S FIGURES: ink and 600, pressable; the first phrase is the needs-you red while something waits. */
  .lead {
    all: unset;
    cursor: pointer;
    color: var(--ink);
    font-weight: 600;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 30%, transparent);
    text-underline-offset: 4px;
  }

  .lead:hover {
    text-decoration-color: currentColor;
  }

  .lead.needs {
    color: var(--red);
  }

  .lead.needs.clear {
    color: var(--ink);
  }

  .behind {
    max-inline-size: 520px;
    margin: -4px 0 16px;
    padding: 12px 16px;
    background: var(--tile);
    border-radius: 12px;
  }

  .bh {
    margin: 0 0 4px;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  .evr {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    padding: 4px 0;
    font-size: var(--t-site-14);
  }

  .dtiles {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 4fr) minmax(0, 3fr);
    gap: 12px;
    align-items: start;
  }

  .count {
    min-inline-size: 20px;
    block-size: 20px;
    padding-inline: 6px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--red-fill);
    color: var(--on-red);
    font: 600 12px/20px var(--ui);
    text-align: center;
  }

  .need {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-block-start: 1px solid var(--rule);
  }

  .need:first-of-type {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .end {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .end .fig {
    font-size: var(--t-site-15);
  }

  .done {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0 0;
    border-block-start: 1px solid var(--rule);
    color: var(--ink2);
    font-size: var(--t-site-13);
    animation: land 200ms ease-out both;
  }

  .done :global(.icon) {
    inline-size: 16px;
    block-size: 16px;
    color: var(--good);
  }

  .done p {
    flex: 1;
    margin: 0;
  }

  @keyframes land {
    from {
      translate: 0 -6px;
    }
    to {
      translate: 0 0;
    }
  }

  .cashfig {
    margin: 0;
  }

  .foot {
    margin: 8px 0 0;
  }

  /* THE PROJECT CARDS, the app's card (proj section 4): no top stripe, the slot's well, figure and spark. */
  .cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-block-start: 12px;
  }

  .pcard {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    padding: 16px;
    background: var(--tile);
    border-radius: 16px;
  }

  .ra {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .pwell {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: 8px;
    background: var(--ph-tint);
    color: var(--ph);
  }

  .pwell :global(.icon) {
    inline-size: 20px;
    block-size: 20px;
  }

  .pname {
    min-inline-size: 0;
    flex: 1;
  }

  .pname b {
    display: block;
    overflow: hidden;
    font: 600 17px/22px var(--ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pname span {
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  /* "1 late" (SPEC 0.2): a red dot and a 13/600 red word, no fill. */
  .lateflag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--red);
    font-size: var(--t-site-13);
    font-weight: 600;
    white-space: nowrap;
  }

  .lateflag i {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--red);
  }

  .rb {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 8px;
    margin-block-start: 16px;
  }

  .rb p {
    margin: 0;
    white-space: nowrap;
  }

  .pbig {
    font: 600 28px/34px var(--head);
    letter-spacing: -0.035em;
    font-variant-numeric: tabular-nums;
  }

  .spark {
    flex: none;
    inline-size: 84px;
    block-size: 28px;
    overflow: visible;
  }

  .spark .l {
    fill: none;
    stroke: var(--ph);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .spark .a {
    fill: color-mix(in srgb, var(--ph) 12%, transparent);
  }

  .rc {
    display: grid;
    gap: 6px;
    margin-block-start: 12px;
  }

  .meter {
    display: block;
    block-size: 6px;
    border-radius: 4px;
    background: var(--soft);
    overflow: hidden;
  }

  .meter i {
    display: block;
    block-size: 100%;
    background: var(--ph);
  }

  .rd {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 0 0;
    color: var(--ink2);
    font-size: var(--t-site-14);
  }

  .rd :global(.icon) {
    inline-size: 16px;
    block-size: 16px;
    color: var(--ph);
  }

  .rd span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .re {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block-start: auto;
    padding-block-start: 12px;
    min-block-size: 24px;
  }

  .re :global(.aface.sm) {
    inline-size: 24px;
    block-size: 24px;
  }

  @media (max-width: 1060px) {
    .dtiles {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    /* The phone's top bar carries the date. */
    .date {
      display: none;
    }

    .greet {
      font-size: var(--t-site-22);
    }

    .hello {
      margin-block: 2px 12px;
    }

    .line {
      font-size: var(--t-site-16);
    }

    .dtiles {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (pointer: coarse) {
    .lead {
      padding-block: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .done {
      animation: none;
    }
  }
</style>
