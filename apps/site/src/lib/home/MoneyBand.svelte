<!--
  "Your money, in one place": Money as the app draws it since the 30 October Money look. Net worth leads, its line over
  twelve weeks and what it is made of (cash, her gold, a fund, less the card), then the accounts as cards each with its
  glyph, the budgets each with its category's glyph and what is left of its own period, and what is coming up signed by
  the way it goes. One line under it names the add-ons that hang off it. Spending stays ink; red is only for a budget
  gone over, as in the app.

  The words are `copy/home.ts`; every name and figure is Maya's (`demo/maya.ts`, `MONEY_BAND`). Static: nothing here
  needs a script, so it reads the same with scripting off.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { MONEY_BAND, usd } from '$lib/demo/maya.ts';
  import { AREA, area } from '$lib/desk/draw.ts';

  const m = home.money;
  const pct = (spent: number, of: number): number => Math.min(100, Math.round((spent / of) * 100));
  const worth = area(MONEY_BAND.worth.series);
  const signed = (cents: number): string => (cents < 0 ? `−${usd(-cents)}` : usd(cents));
</script>

<section class="band band--money" aria-labelledby="money-title">
  <div class="wrap reveal">
    <div class="cols head">
      <h2 id="money-title" class="band-h2 c7">{m.title}</h2>
      <p class="band-say c5">{m.say}</p>
    </div>

    <div class="mwin">
      <section class="part worth">
        <div class="wtop">
          <div>
            <h3 class="phd"><span class="well"><Icon name="trend-up" /></span>{m.worth}</h3>
            <p class="wfig num">{usd(MONEY_BAND.worth.cents)}</p>
            <p class="wsay">{MONEY_BAND.worth.change}</p>
          </div>
          <svg class="wline" viewBox="0 0 {AREA.w} {AREA.h}" preserveAspectRatio="none" aria-hidden="true">
            <path class="a" d={worth.fill} /><path class="l" d={worth.line} vector-effect="non-scaling-stroke" />
          </svg>
        </div>
        <ul class="wparts">
          {#each MONEY_BAND.worth.parts as w (w.name)}
            <li><span class="chip"><Icon name={w.icon} /></span><span class="grow"><span>{w.name}</span><b class="num">{signed(w.cents)}</b></span></li>
          {/each}
        </ul>
      </section>

      <section class="part">
        <h3 class="phd"><span class="well"><Icon name="bank" /></span>{m.accounts}</h3>
        {#each MONEY_BAND.accounts as a (a.name)}
          <p class="acc">
            <span class="chip"><Icon name={a.icon} /></span>
            <span class="grow"><b>{a.name}</b><span>{a.book}</span></span>
            <b class="num" class:owed={a.cents < 0}>{signed(a.cents)}</b>
          </p>
        {/each}
      </section>

      <section class="part">
        <h3 class="phd"><span class="well"><Icon name="pie" /></span>{m.budgets}</h3>
        {#each MONEY_BAND.budgets as b (b.name)}
          {@const over = b.spent > b.of}
          <div class="bud">
            <span class="chip"><Icon name={b.icon} /></span>
            <div class="grow">
              <p><b>{b.name}</b><span class:over>{over ? m.over(usd(b.spent - b.of)) : m.left(usd(b.of - b.spent))}</span></p>
              <span class="bar" aria-hidden="true"><i class:over style="width:{pct(b.spent, b.of)}%"></i></span>
              <span class="per">{m.of(usd(b.spent), usd(b.of), b.period)}</span>
            </div>
          </div>
        {/each}
      </section>

      <section class="part">
        <h3 class="phd"><span class="well"><Icon name="calendar" /></span>{m.coming}</h3>
        {#each MONEY_BAND.coming as c (c.name)}
          <p class="acc">
            <span class="chip"><Icon name={c.icon} /></span>
            <span class="grow"><b>{c.name}</b><span>{c.when}</span></span>
            <b class="num">{signed(-c.cents)}</b>
          </p>
        {/each}
      </section>
    </div>

    <p class="addons">{m.addons}</p>
  </div>
</section>

<style>
  .band--money {
    background: var(--band-slash);
    color: var(--ink);
  }

  .head {
    align-items: end;
  }

  .head .band-say {
    margin: 0;
  }

  /* ONE WINDOW, three parts side by side with a rule between them: the app's Money home, not three cards. */
  .mwin {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: auto auto;
    margin-block-start: 32px;
    background: var(--band-slash-tile);
    border-radius: 16px;
    overflow: hidden;
  }

  .part {
    min-inline-size: 0;
    padding: 20px 24px 16px;
  }

  .part + .part + .part {
    border-inline-start: 1px solid var(--rule);
  }

  /* NET WORTH LEADS, the whole row: the figure and how it moved, its line beside it, and what it is made of. */
  .worth {
    grid-column: 1 / -1;
    border-block-end: 1px solid var(--rule);
  }

  .wtop {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 32px;
    align-items: end;
  }

  .wfig {
    font: 600 34px/40px var(--head);
    letter-spacing: -0.035em;
  }

  .wsay {
    color: var(--good);
    font-size: var(--t-site-13);
    font-weight: 600;
  }

  .wline {
    display: block;
    inline-size: 100%;
    block-size: 64px;
  }

  .wline .l {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
  }

  .wline .a {
    fill: color-mix(in srgb, var(--ink) 6%, transparent);
  }

  .wparts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
  }

  .wparts li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--t-site-14);
  }

  /* A THING'S OWN GLYPH IN ITS ROUND WELL, as the app's account and category chips. */
  .chip {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: 50%;
    background: var(--band-slash);
    color: var(--ink2);
  }

  .chip :global(.icon) {
    inline-size: 16px;
    block-size: 16px;
  }

  .phd {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 8px;
    font: 600 15px/1.2 var(--ui);
    letter-spacing: 0;
  }

  .well {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 8px;
    background: var(--band-slash);
    color: var(--ink2);
  }

  .well :global(.icon) {
    inline-size: 16px;
    block-size: 16px;
  }

  p {
    margin: 0;
  }

  .acc {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-block-start: 1px solid var(--rule);
    font-size: var(--t-site-14);
  }

  .phd + .acc {
    border-block-start: 0;
  }

  .grow {
    flex: 1;
    min-inline-size: 0;
  }

  .grow b {
    display: block;
    font-weight: 600;
  }

  .grow span {
    display: block;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  .num {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .bud {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 0;
    font-size: var(--t-site-14);
  }

  .per {
    display: block;
    margin-block-start: 6px;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  .bud p {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-block-end: 8px;
  }

  .bud p span {
    color: var(--muted);
  }

  .bud .over {
    color: var(--red);
    font-weight: 600;
  }

  .bar {
    display: block;
    block-size: 6px;
    border-radius: 3px;
    background: var(--band-slash);
    overflow: hidden;
  }

  .bar i {
    display: block;
    block-size: 100%;
    border-radius: 3px;
    background: var(--ink);
  }

  .bar i.over {
    background: var(--red-fill);
  }

  .addons {
    max-inline-size: 48em;
    margin-block-start: 20px;
    color: var(--ink2);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  @media (max-width: 1059px) {
    .head .band-say {
      margin-block-start: 16px;
    }

    .mwin {
      grid-template-columns: minmax(0, 1fr);
    }

    .part + .part + .part {
      border-inline-start: 0;
      border-block-start: 1px solid var(--rule);
    }

    .wparts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* ON A PHONE the budgets go: accounts and what is coming up say it, and the band stays under a screen. */
  @media (max-width: 760px) {
    .part:nth-child(4) {
      display: none;
    }

    .wtop {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }

    .part {
      padding: 16px;
    }
  }
</style>
