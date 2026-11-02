<!--
  The desk's Today, as the app's Today draws it since 30 October: the greeting alone (DIRECTION §51), then a board of
  widgets, each at its own size on one twelve-column grid as the app packs them: Needs you wide beside Cash ahead,
  then Working now, Coming up and a widget Claude made that is still a draft (dashed, with Keep and Throw away), then
  the projects across the row. "Edit Today" and "Add widget" sit at the board's foot, as in the app.

  Answering on the Needs you tile moves the ask out with an Undo, and the count in the sidebar follows, because both
  read one store.

  With scripting off every word is still here; the answer buttons are drawn for a page whose script runs.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import { onMount } from 'svelte';
  import { CONNECTED, FOUNDER, NEEDS, PROJECT_ORDER, PROJECTS, TODAY, slotVars, usd } from '../demo/maya.ts';
  import { AREA, area, spark } from './draw.ts';
  import { needs } from './needs.svelte.ts';
  import { DESK } from './words.ts';

  const cash = area(TODAY.cash.series);
  const byId = new Map(NEEDS.map((n) => [n.id, n]));
  const open = $derived(needs.open.map((id) => byId.get(id)!).filter(Boolean));
  const done = $derived(needs.done.map((id) => byId.get(id)!).filter(Boolean));

  /* THE DRAFT WIDGET: kept turns it into an ordinary tile, thrown away takes it off with an Undo, as the app's does. */
  let draft = $state<'draft' | 'kept' | 'gone'>('draft');
  const maker = CONNECTED.find((c) => c.agent === TODAY.draft.by)?.name ?? 'An agent';
  const most = Math.max(...TODAY.draft.weeks.map((w) => w.cents));
  const signed = (cents: number): string => (cents < 0 ? `−${usd(-cents)}` : `+${usd(cents)}`);

  /* THE GREETING ALONE (§51), by the visitor's own clock once the page runs, as the app's `greetingOf` says it. */
  let greeting = $state(DESK.greet(9, FOUNDER.short));
  onMount(() => void (greeting = DESK.greet(new Date().getHours(), FOUNDER.short)));
</script>

<h2 class="greet">{greeting}</h2>

<div class="board">
  <section class="t w7 needs-tile" aria-label={TODAY.heads.needs}>
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
          <button type="button" class="dbtn ink desk-js" onclick={() => needs.answer(n.id, true)}>{n.yes}</button>
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

  <section class="t w5" aria-label={TODAY.cash.head}>
    <p class="thd"><span class="well"><Icon name="money" /></span>{TODAY.cash.head}</p>
    <p class="cashfig"><span class="big">{TODAY.cash.figure}</span> <span class="sub">{TODAY.cash.say}</span></p>
    <svg class="area" viewBox="0 0 {AREA.w} {AREA.h}" preserveAspectRatio="none" aria-hidden="true">
      <path class="a" d={cash.fill} /><path class="l" d={cash.line} vector-effect="non-scaling-stroke" />
    </svg>
    <p class="sub foot">{TODAY.cash.foot}</p>
  </section>

  <section class="t w4 hide-phone" aria-label={TODAY.heads.working}>
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

  <section class="t w4 hide-phone" aria-label={DESK.board.coming}>
    <p class="thd"><span class="well"><Icon name="calendar" /></span>{DESK.board.coming}<span class="r num">{TODAY.coming.length}</span></p>
    <div class="list">
      {#each TODAY.coming as c (c.name)}
        <div class="li due">
          <span class="dchip"><span>{c.day}</span><b class="num">{c.date}</b></span>
          <div class="grow"><b>{c.name}</b></div>
          <b class="num amt" class:pos={c.cents > 0}>{signed(c.cents)}</b>
        </div>
      {/each}
    </div>
  </section>

  {#if draft !== 'gone'}
    <section class="t w4 draft" class:kept={draft === 'kept'} aria-label={TODAY.draft.title}>
      <p class="thd"><span class="well"><Icon name="bars" /></span>{TODAY.draft.title}</p>
      {#if draft === 'draft'}
        <p class="by"><span class="aface xs"><AgentMark id={TODAY.draft.by} size={12} /></span>{DESK.board.draftBy(maker)}</p>
      {/if}
      <div class="wk" aria-hidden="true">
        {#each TODAY.draft.weeks as w (w.label)}
          <span class="wcol"><i style="block-size:{Math.max(8, Math.round((w.cents / most) * 100))}%"></i><span>{w.label}</span></span>
        {/each}
      </div>
      <p class="sub">{TODAY.draft.weeks.map((w) => `${w.label} ${usd(w.cents)}`).join(' · ')}</p>
      {#if draft === 'draft'}
        <div class="acts desk-js">
          <button type="button" class="dbtn ink" onclick={() => (draft = 'kept')}>{DESK.board.keep}</button>
          <button type="button" class="dbtn" onclick={() => (draft = 'gone')}>{DESK.board.toss}</button>
        </div>
      {/if}
    </section>
  {:else}
    <div class="t w4 gone">
      <p class="sub">{DESK.board.tossed}</p>
      <button type="button" class="undo desk-js" onclick={() => (draft = 'draft')}>{DESK.board.undo}</button>
    </div>
  {/if}

  <section class="t w12 hide-phone projects" aria-label={TODAY.heads.projects}>
    <p class="thd"><span class="well"><Icon name="projects" /></span>{TODAY.heads.projects}<span class="r">{TODAY.heads.all} →</span></p>
    <div class="cards">
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
        </div>
      {/each}
    </div>
  </section>
</div>

<!-- THE BOARD'S FOOT, as the app draws it: add a widget, and the press that turns the board into its editor. Drawn,
     not pressed: the editor is the app's. -->
<p class="bfoot" aria-hidden="true">
  <span class="bbtn"><Icon name="plus" />{DESK.board.add}</span>
  <span class="bbtn"><Icon name="board" />{DESK.board.edit}</span>
</p>

<style>
  /* THE PAGE'S HEAD IS THE GREETING, in Lexend 28 as the app draws it, with nothing under it. */
  .greet {
    margin: 4px 2px 16px;
    font: 600 28px/1.15 var(--head);
    letter-spacing: -0.035em;
  }

  /* THE BOARD: one twelve-column grid, each widget at its own width as the app's packer lays them (`lib/board/pack.ts`). */
  .board {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }

  .w4 {
    grid-column: span 4;
  }

  .w5 {
    grid-column: span 5;
  }

  .w7 {
    grid-column: span 7;
  }

  .w12 {
    grid-column: span 12;
  }

  /* COMING UP, as the app's tile: a day chip, the name, and the amount signed by the way it goes, money in in green. */
  .due {
    gap: 10px;
  }

  .dchip {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 36px;
    padding: 3px 0;
    border-radius: 8px;
    background: var(--soft);
    line-height: 1.1;
  }

  .dchip span {
    color: var(--muted);
    font-size: var(--t-app-xs);
  }

  .dchip b {
    font-size: var(--t-site-14);
  }

  .amt {
    margin-inline-start: auto;
    white-space: nowrap;
  }

  .amt.pos {
    color: var(--good);
  }

  /* A DRAFT WIDGET: a dashed edge on the board's own ground until it is kept, who made it under its name, and Keep or
     Throw away under what it draws. Kept, it is a tile like the rest. */
  .draft {
    background: transparent;
    outline: 1.5px dashed var(--rule-strong, var(--muted));
    outline-offset: -1.5px;
  }

  .draft.kept {
    background: var(--tile);
    outline: 0;
  }

  .by {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -6px 0 10px;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  .by .xs {
    inline-size: 20px;
    block-size: 20px;
  }

  .wk {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    align-items: end;
    block-size: 72px;
    margin-block-end: 8px;
  }

  .wcol {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 4px;
    block-size: 100%;
    color: var(--muted);
    font-size: var(--t-app-xs);
    text-align: center;
  }

  .wcol i {
    display: block;
    border-radius: 4px 4px 2px 2px;
    background: var(--ink2);
  }

  .acts {
    display: flex;
    gap: 8px;
    margin-block-start: 12px;
  }

  .gone {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: transparent;
    outline: 1.5px dashed var(--rule);
    outline-offset: -1.5px;
  }

  .gone p {
    margin: 0;
  }

  /* THE BOARD'S FOOT: "Add widget" and "Edit Today", quiet buttons at its end. */
  .bfoot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 12px 0 0;
  }

  .bbtn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    block-size: 32px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--tile);
    color: var(--ink);
    font: 500 14px/1 var(--ui);
  }

  .bbtn :global(.icon) {
    inline-size: 16px;
    block-size: 16px;
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

  /* "at this pace" under the figure, so a narrow tile never leaves its last word alone on a line. */
  .cashfig .sub {
    display: block;
  }

  .foot {
    margin: 8px 0 0;
  }

  /* THE PROJECT CARDS, the app's card (proj section 4): no top stripe, the slot's well, figure and spark. */
  .cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  /* A PROJECT IN THE PROJECTS WIDGET: the app's card on the tile's second fill. */
  .pcard {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    padding: 14px;
    background: var(--soft);
    border-radius: 12px;
  }

  .ra {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
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

  /* THE NAME TAKES THE ROW, and "1 late" goes under it rather than squeezing a word in two. */
  .pname {
    min-inline-size: 0;
    flex: 1 1 7em;
  }

  /* A PROJECT'S NAME WRAPS AND IS NEVER CUT ("Northb…" on the phone, 30 October), as the app's cards keep a name whole. */
  .pname b {
    display: block;
    font: 600 17px/22px var(--ui);
    overflow-wrap: break-word;
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

  /* THE SPARK GIVES WAY to the figure, so it never runs past the card's edge. */
  .spark {
    flex: 0 1 84px;
    min-inline-size: 0;
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


  @media (max-width: 1060px) {
    .w4,
    .w5,
    .w7 {
      grid-column: span 6;
    }

    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .greet {
      font-size: var(--t-site-22);
    }

    .board > * {
      grid-column: 1 / -1;
    }

    .bfoot {
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .done {
      animation: none;
    }
  }
</style>
