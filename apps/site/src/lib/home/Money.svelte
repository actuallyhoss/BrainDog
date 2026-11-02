<!--
  "Your money, in one place" (the redo of 2 November): the app's Money home on Maya's two books, as four tiles of the
  board. Cash now leads, with how long it lasts and its line over the last twelve weeks (the Money home's "Over time"),
  then the accounts with the book each sits in, what is coming up, and the budgets with what is left of each. One line
  under them names the add-ons, and two links read on, for a business and for your own money. Spending stays ink; red
  is only for a budget gone over, as in the app.

  The words are `copy/home.ts`; every name and figure is Maya's (`demo/maya.ts`, `MONEY_BAND` and `CENTS`). Static:
  nothing here needs a script, so it reads the same with scripting off.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { home } from '../copy/home.ts';
  import { CENTS, MONEY_BAND, usd } from '../demo/maya.ts';
  import { AREA, area } from '../desk/draw.ts';

  const m = home.money;
  const pct = (spent: number, of: number): number => Math.min(100, Math.round((spent / of) * 100));
  const line = area(MONEY_BAND.cash);
  const signed = (cents: number): string => (cents < 0 ? `−${usd(-cents)}` : usd(cents));
</script>

<section class="section" id="money" aria-labelledby="money-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="money-title">{m.title}</h2>
      <p>{m.say}</p>
    </div>

    <div class="tiles">
      <section class="tile span-7 cash reveal" aria-labelledby="cash-now-title">
        <h3 class="tile-head">
          <span class="well"><Icon name="money" /></span>
          <span class="tile-title" id="cash-now-title">{m.cash}</span>
          <span class="tile-meta">{m.across}</span>
        </h3>
        <div class="now">
          <p class="figure big num">{usd(CENTS.cashAhead)}</p>
          <p class="reading">{m.lasts}</p>
        </div>
        <figure class="chart">
          <svg viewBox="0 0 {AREA.w} {AREA.h}" preserveAspectRatio="none" aria-hidden="true">
            <path class="wash" d={line.fill} /><path class="line" d={line.line} vector-effect="non-scaling-stroke" />
          </svg>
          <figcaption><span>{m.weeks}</span><span>{m.today}</span></figcaption>
        </figure>
      </section>

      <section class="tile span-5 reveal" aria-labelledby="accounts-title">
        <h3 class="tile-head">
          <span class="well"><Icon name="bank" /></span>
          <span class="tile-title" id="accounts-title">{m.accounts}</span>
        </h3>
        <ul class="rows">
          {#each MONEY_BAND.accounts as a (a.name)}
            <li>
              <span class="well l"><Icon name={a.icon} /></span>
              <span class="grow"><span class="name">{a.name}</span><span class="sub">{a.book}</span></span>
              <span class="amount num">{signed(a.cents)}</span>
            </li>
          {/each}
        </ul>
      </section>

      <section class="tile span-5 reveal" aria-labelledby="coming-title">
        <h3 class="tile-head">
          <span class="well"><Icon name="calendar" /></span>
          <span class="tile-title" id="coming-title">{m.coming}</span>
        </h3>
        <ul class="rows">
          {#each MONEY_BAND.coming as c (c.name)}
            <li>
              <span class="well l"><Icon name={c.icon} /></span>
              <span class="grow"><span class="name">{c.name}</span><span class="sub">{c.when}</span></span>
              <span class="amount num">{signed(-c.cents)}</span>
            </li>
          {/each}
        </ul>
      </section>

      <section class="tile span-7 reveal" aria-labelledby="budgets-title">
        <h3 class="tile-head">
          <span class="well"><Icon name="pie" /></span>
          <span class="tile-title" id="budgets-title">{m.budgets}</span>
        </h3>
        <ul class="rows">
          {#each MONEY_BAND.budgets as b (b.name)}
            {@const over = b.spent > b.of}
            <li class="budget">
              <span class="well l"><Icon name={b.icon} /></span>
              <span class="grow">
                <span class="line-1"><span class="name">{b.name}</span><span class="left num" class:late={over}>{over ? m.over(usd(b.spent - b.of)) : m.left(usd(b.of - b.spent))}</span></span>
                <span class="track" aria-hidden="true"><i class:over style:inline-size="{pct(b.spent, b.of)}%"></i></span>
                <span class="sub num">{m.of(usd(b.spent), usd(b.of), b.period)}</span>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    </div>

    <p class="addons">{m.addons}</p>
    <ul class="more">
      {#each m.more as link (link.href)}
        <li><a class="onward" href={link.href}>{link.label}<Icon name="arrow-right" size="s" /></a></li>
      {/each}
    </ul>
  </div>
</section>

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ── Cash now ────────────────────────────────────────────────────────── */

  .now {
    display: grid;
    gap: 4px;
  }

  .chart {
    display: grid;
    gap: 6px;
    margin: auto 0 0;
  }

  .chart svg {
    display: block;
    inline-size: 100%;
    block-size: 96px;
    overflow: visible;
  }

  /* THE APP'S LINE: 2px in the first chart ink with round joins, and the wash under it quieter than the line. */
  .line {
    fill: none;
    stroke: var(--chart-1);
    stroke-width: 2px;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .wash {
    fill: var(--chart-1);
    fill-opacity: 0.06;
  }

  figcaption {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  /* ── The rows ────────────────────────────────────────────────────────── */

  .rows li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-block: 10px;
  }

  .rows li + li {
    border-block-start: 1px solid var(--rule);
  }

  .grow {
    display: grid;
    flex: 1;
    min-inline-size: 0;
  }

  .name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
  }

  .sub {
    color: var(--ink-3);
    font-size: var(--t-site-small);
    line-height: 1.45;
  }

  .amount {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    white-space: nowrap;
  }

  /* ── Budgets ─────────────────────────────────────────────────────────── */

  .line-1 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .left {
    color: var(--ink-2);
    font-size: var(--t-site-small);
    white-space: nowrap;
  }

  .left.late {
    color: var(--red);
  }

  /* THE APP'S TRACK: the tile's second fill, the spent part in the first chart ink, and red only past the budget. */
  .track {
    display: block;
    block-size: 6px;
    margin-block: 6px 4px;
    border-radius: var(--r-round);
    background: var(--chart-track);
    overflow: hidden;
  }

  .track i {
    display: block;
    block-size: 100%;
    border-radius: inherit;
    background: var(--chart-1);
  }

  .track i.over {
    background: var(--chart-late);
  }

  .addons {
    max-inline-size: 60ch;
    margin: var(--sp-5) 0 0;
    color: var(--ink-2);
    font-size: var(--t-site-15);
    line-height: 1.55;
    text-wrap: pretty;
  }

  /* READ ON: two plain links in a row, wrapping under each other on a phone. */
  .more {
    display: flex;
    flex-wrap: wrap;
    gap: 4px var(--sp-6);
    margin-block-start: var(--sp-3);
  }

  .more .onward {
    font-size: var(--t-site-15);
  }
</style>
