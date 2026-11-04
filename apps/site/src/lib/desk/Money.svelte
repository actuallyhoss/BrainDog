<!--
  The desk's Money: how long the cash lasts with the line in ink and where that comes from, what goes out this month
  bill by bill, and what Maya is owed. Every figure is Maya's, from `../demo/maya.ts`, and late is the one red.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { ASKS, EVIDENCE, MONEY, TODAY, usd } from '../demo/maya.ts';
  import { AREA, area } from './draw.ts';
  import { DESK } from './words.ts';

  const cash = area(TODAY.cash.series);
  const bills = ASKS[0]?.bars ?? [];
  const most = Math.max(1, ...bills.map((b) => b.cents));
</script>

<div class="grid">
  <section class="t s5" aria-label={DESK.money.cash}>
    <p class="thd"><span class="well"><Icon name="money" /></span>{DESK.money.cash}</p>
    <p class="cashfig"><span class="big">{TODAY.cash.figure}</span> <span class="sub">{TODAY.cash.say}</span></p>
    <svg class="area" viewBox="0 0 {AREA.w} {AREA.h}" preserveAspectRatio="none" aria-hidden="true">
      <path class="a" d={cash.fill} /><path class="l" d={cash.line} vector-effect="non-scaling-stroke" />
    </svg>
    <div class="rows">
      {#each EVIDENCE.cash.rows as [label, value]}<p><span>{label}</span><b class="num">{value}</b></p>{/each}
    </div>
  </section>

  <section class="t s7" aria-label={MONEY.due.head}>
    <p class="thd"><span class="well"><Icon name="calendar" /></span>{MONEY.due.head}<span class="r">{MONEY.due.foot}</span></p>
    {#each bills as b (b.label)}
      <div class="bill">
        <span class="name">{b.label}</span>
        <span class="bar" aria-hidden="true"><i style="width:{Math.max(4, Math.round((b.cents / most) * 100))}%"></i></span>
        <b class="num">{usd(b.cents)}</b>
        <span class="sub when">{b.when}</span>
      </div>
    {/each}
    <p class="thd owed">{MONEY.owedHead}</p>
    {#each MONEY.owed as o (o.who)}
      <div class="li">
        <span class="well l late"><Icon name="alert" /></span>
        <div class="grow"><b>{o.who}</b><span class="late-word">{o.sub}</span></div>
        <b class="num">{o.amount}</b>
      </div>
    {/each}
  </section>
</div>

<style>
  p {
    margin: 0;
  }

  .rows {
    margin-block-start: 12px;
  }

  .rows p {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-block-start: 0;
    font-size: var(--t-site-13);
  }

  .rows span {
    color: var(--muted);
  }

  .bill {
    display: grid;
    grid-template-columns: minmax(0, 9em) minmax(0, 1fr) auto 4.5em;
    gap: 12px;
    align-items: center;
    padding: 6px 0;
    font-size: var(--t-site-14);
  }

  .bar {
    display: block;
    block-size: 8px;
    border-radius: 4px;
    background: var(--soft);
    overflow: hidden;
  }

  .bar i {
    display: block;
    block-size: 100%;
    background: var(--ink2);
  }

  .when {
    text-align: end;
  }

  /* A HEADING'S ROOM OVER IT, AS THE TILE'S OWN: the window's `.thd` rule outweighed this one, so "Owed to you" sat on Figma's row. */
  :global(.win) .thd.owed {
    margin-block-start: 24px;
  }

  .li .grow span {
    color: var(--red);
    font-weight: 600;
  }

  @media (max-width: 760px) {
    .bill {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .bar,
    .when {
      display: none;
    }
  }
</style>
