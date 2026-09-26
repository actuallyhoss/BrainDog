<!--
  A page, drawn: five of the block kinds a record's page is made of, over rows the seeded records
  really hold (`copy.ts` names where each figure comes from). HTML and CSS, so every figure is text.
-->
<script lang="ts">
  type Blocks = {
    cash: { title: string; value: string; note: string };
    goal: { title: string; value: string; of: string; pct: number };
    spend: { title: string; bars: readonly (readonly [string, number])[] };
    week: { title: string; days: readonly string[]; items: readonly { day: number; what: string; amount: string }[] };
    board: { title: string; columns: readonly { name: string; cards: readonly string[] }[] };
  };

  let { blocks }: { blocks: Blocks } = $props();

  const top = $derived(Math.max(...blocks.spend.bars.map(([, v]) => v)));
  /* The ring's circumference at r = 34: the dash is the share put by. */
  const C = 2 * Math.PI * 34;
</script>

<div class="page frame" role="img" aria-label="A page of blocks: {blocks.cash.title}, {blocks.goal.title}, {blocks.week.title}, {blocks.spend.title} and {blocks.board.title}">
  <div class="grid">
    <section class="block cash">
      <h3>{blocks.cash.title}</h3>
      <p class="big num">{blocks.cash.value}</p>
      <p class="note">{blocks.cash.note}</p>
      <svg class="spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 26 L15 24 L30 25 L45 18 L60 20 L75 12 L90 14 L105 8 L120 6" />
      </svg>
    </section>

    <section class="block goal">
      <h3>{blocks.goal.title}</h3>
      <div class="ring-row">
        <svg class="ring" viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r="34" class="track" />
          <circle cx="40" cy="40" r="34" class="fill" stroke-dasharray="{(C * blocks.goal.pct) / 100} {C}" />
          <text x="40" y="45" text-anchor="middle">{blocks.goal.pct}%</text>
        </svg>
        <div>
          <p class="mid num">{blocks.goal.value}</p>
          <p class="note">{blocks.goal.of}</p>
        </div>
      </div>
    </section>

    <section class="block week">
      <h3>{blocks.week.title}</h3>
      <ol class="days" aria-hidden="true">
        {#each blocks.week.days as d, i (d)}
          <li class:has={blocks.week.items.some((it) => it.day === i)}><span class="d">{d}</span><span class="dot"></span></li>
        {/each}
      </ol>
      <ul class="agenda">
        {#each blocks.week.items as it (it.what)}
          <li><span class="a-day">{blocks.week.days[it.day]}</span><span class="a-what">{it.what}</span><span class="num">{it.amount}</span></li>
        {/each}
      </ul>
    </section>

    <section class="block spend">
      <h3>{blocks.spend.title}</h3>
      <div class="bars">
        {#each blocks.spend.bars as [m, v], i (m)}
          <div class="bar-col">
            <div class="bar" class:last={i === blocks.spend.bars.length - 1} style="block-size: {Math.round((v / top) * 108)}px"></div>
            <span class="m">{m}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="block board">
      <h3>{blocks.board.title}</h3>
      <div class="cols">
        {#each blocks.board.columns as c (c.name)}
          <div class="col">
            <span class="col-name">{c.name}</span>
            {#each c.cards as card (card)}<span class="card">{card}</span>{/each}
          </div>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .page {
    padding: var(--sp-4);
    background: var(--sunk);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--sp-3);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-4);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: 12px;
  }

  @media (prefers-color-scheme: dark) {
    .block {
      background: var(--s2);
    }
  }

  .cash,
  .goal,
  .week {
    grid-column: span 4;
  }

  .spend {
    grid-column: span 5;
  }

  .board {
    grid-column: span 7;
  }

  h3 {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .big {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.03em;
  }

  .mid {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .spark {
    inline-size: 100%;
    block-size: 32px;
    margin-block-start: auto;
  }

  .spark path {
    fill: none;
    stroke: var(--earn-fill);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .ring-row {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
  }

  .ring {
    flex: none;
    inline-size: 76px;
    block-size: 76px;
    transform: rotate(-90deg);
  }

  .ring circle {
    fill: none;
    stroke-width: 8;
  }

  .track {
    stroke: var(--sunk);
  }

  .fill {
    stroke: var(--accent);
    stroke-linecap: round;
  }

  .ring text {
    fill: var(--ink);
    font-size: 15px;
    font-weight: 600;
    transform: rotate(90deg);
    transform-origin: 40px 40px;
  }

  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .days li {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 6px 0;
    background: var(--s1);
    border-radius: 6px;
  }

  .d {
    color: var(--dim);
    font-size: 11px;
  }

  .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--line);
  }

  .days li.has .dot {
    background: var(--accent);
  }

  .agenda {
    display: grid;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .agenda li {
    display: grid;
    grid-template-columns: 2.25rem minmax(0, 1fr) auto;
    gap: var(--sp-2);
    padding-block: 5px;
    font-size: 12.5px;
  }

  .agenda li + li {
    border-block-start: 1px solid var(--line);
  }

  .a-day {
    color: var(--dim);
  }

  .a-what {
    overflow: hidden;
    color: var(--ink);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .bars {
    display: flex;
    flex: 1;
    align-items: flex-end;
    gap: var(--sp-3);
    min-block-size: 132px;
  }

  .bar-col {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: flex-end;
    gap: 6px;
  }

  .bar {
    background: color-mix(in srgb, var(--ink) 16%, transparent);
    border-radius: 6px 6px 3px 3px;
  }

  .bar.last {
    background: var(--ink);
  }

  .m {
    color: var(--dim);
    font-size: 11px;
    text-align: center;
  }

  .cols {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-2);
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: var(--s1);
    border-radius: 8px;
  }

  .col-name {
    color: var(--dim);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .card {
    padding: 8px;
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    font-size: 12.5px;
    line-height: 1.35;
    box-shadow: var(--e1);
  }

  @media (prefers-color-scheme: dark) {
    .card {
      background: var(--s2);
    }
  }

  @media (width < 1000px) {
    .cash,
    .goal {
      grid-column: span 6;
    }

    .week,
    .spend,
    .board {
      grid-column: span 12;
    }
  }

  @media (width < 640px) {
    .page {
      padding: var(--sp-3);
    }

    .grid {
      gap: var(--sp-2);
    }

    .cash,
    .goal {
      grid-column: span 12;
    }

    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
