<script lang="ts">
  /**
   * Pricing, drawn as Bento tiles on the ground (the design system).
   *
   * FREE LEADS (DIRECTION §35, the owner on 2 October): "i dont like how it brands the $12 as the go to. instead i want
   * the product to have the free tier to be what's highlighted, and then the subscriptions as an extra thing for
   * pros". So the page's headline is Free's, its first and largest tile is Free with the one filled button, and Cloud
   * and Cloud Plus share one quieter tile beside it, a line each. Every figure is read from `plans.ts`, which
   * `plans.test.ts` holds to the Worker's own `HOSTED_PLANS`, `FREE_PLAN` and `ALLOWANCE`; every sentence is read from
   * `copy/pricing.ts`; what a drawing works out (a scale, the automations Free runs a day) is worked out here from
   * those figures, so it moves when they do.
   *
   *   plans     the answer: Free, then the plans for pros.
   *   usage     every allowance as three bars on one scale, Free in ink, and the line that packs and extra usage are
   *             coming later.
   *   every     what every plan includes, and the one place they differ (people).
   *   faq       the questions a person asks before starting.
   *   close     one line and the button.
   *
   * NO CREDIT PACKS AND NO EXTRA USAGE ARE SOLD HERE, because neither is built (`plans.ts` says where each would be).
   */
  import Icon from '$lib/Icon.svelte';
  import { SIGNUP, site } from '$lib/copy.ts';
  import { PAID, PLANS, plan } from '$lib/plans.ts';
  import type { IconName } from '$lib/icons.ts';

  const p = site.pricing;
  const free = plan('free');

  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const word = (n: number): string => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? (WORDS[n] ?? String(n)) : String(n));
  const grouped = (n: number): string => n.toLocaleString('en-US');

  /* THE BARS: each meter on its own scale, the largest plan the whole track, every plan a bar under its name. */
  const meters = p.usage.map((u) => {
    const top = Math.max(1, ...PLANS.map((pl) => pl.allowance[u.key]));
    return { ...u, bars: PLANS.map((pl) => ({ id: pl.id, name: pl.name, n: pl.allowance[u.key], w: (pl.allowance[u.key] / top) * 100 })) };
  });

  /* WHAT FREE'S RUNS COVER: automations that run once a day, every day of a 31-day month. */
  const daily = Math.floor(free.allowance.runs / 31);

  /* ON EVERY PLAN: one value where the plans agree, and Free's beside the paid plans' where they do not. */
  const ROW_GLYPHS: IconName[] = ['people', 'server', 'refresh', 'inbox', 'download'];
  const valueOf = (row: readonly string[]): string => {
    const [, f = '', ...paid] = row;
    if (paid.every((v) => v === f)) return f;
    return paid.every((v) => v === paid[0]) ? p.differs(f, paid[0] ?? '') : row.slice(1).join(' · ');
  };
  const kept = (text: string): number => Number.parseInt(text.match(/\d+/)?.[0] ?? '0', 10);
</script>

<svelte:head>
  <title>{site.meta.pricing.title}</title>
  <meta name="description" content={site.meta.pricing.description} />
  <link rel="canonical" href="https://brain.dog/pricing" />
  <meta property="og:url" content="https://brain.dog/pricing" />
  <meta property="og:title" content={site.meta.pricing.title} />
  <meta property="og:description" content={site.meta.pricing.description} />
</svelte:head>

<!-- ── The answer: Free, then the plans for pros ── -->
<section class="band" aria-labelledby="pricing-h1">
  <div class="in">
    <div class="tiles">
      <article class="tile lead span-7" aria-labelledby="pricing-h1">
        <header class="tile-head">
          <span class="well ink"><Icon name="person" /></span>
          <span class="tile-title">{free.name}</span>
        </header>
        <h1 class="h2" id="pricing-h1">{p.title}</h1>
        <p class="lede">{p.sub}</p>
        <p class="price"><span class="figure">{free.price}</span><span class="meta">{free.unit}</span></p>
        <p class="summary">
          <Icon name="coins" size="m" />
          <span>{p.summary(grouped(free.allowance.credits), grouped(free.allowance.runs))}</span>
        </p>
        <ul class="points">
          {#each p.plans.free.points as point (point)}
            <li><Icon name="check" size="m" />{point}</li>
          {/each}
        </ul>
        <a class="btn btn-primary btn-lg cta" href={free.href} rel={free.external ? 'external' : undefined}
          >{p.plans.free.cta}<Icon name="arrow" size="s" /></a
        >
      </article>

      <article class="tile lead span-5 pros" aria-labelledby="pros-title">
        <header class="tile-head">
          <span class="well"><Icon name="zap" /></span>
          <h2 class="tile-title" id="pros-title">{p.prosTitle}</h2>
        </header>
        <p class="pros-lead">{p.prosLead}</p>
        <ul class="paid">
          {#each PAID as pl (pl.id)}
            <li>
              <span class="pd-top">
                <span class="pd-name">{pl.name}</span>
                <span class="pd-price num">{pl.price} <span class="meta">{pl.unit.replace(', per record', '')}</span></span>
              </span>
              <span class="pd-line">{p.prosLine(grouped(pl.allowance.credits), grouped(pl.allowance.runs))}</span>
              <span class="pd-points">{p.plans[pl.id].points.join(' · ')}</span>
              <a class="btn btn-sm pd-cta" href={pl.href} rel={pl.external ? 'external' : undefined}>{p.plans[pl.id].cta}</a>
            </li>
          {/each}
        </ul>
      </article>
    </div>
  </div>
</section>

<!-- ── Every allowance, plan against plan ── -->
<section class="band" id="usage" aria-labelledby="usage-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead reveal">
        <header class="tile-head">
          <span class="well"><Icon name="bars" /></span>
          <h2 class="tile-title" id="usage-title">{p.usageTitle}</h2>
        </header>
        <p class="lede">{p.usageLead}</p>
        <div class="compare" role="table" aria-labelledby="usage-title">
          <div class="sr" role="row">
            <span role="columnheader">{p.what}</span>
            {#each PLANS as pl (pl.id)}<span role="columnheader">{pl.name}</span>{/each}
          </div>
          {#each meters as m (m.key)}
            <div class="c-row" role="row">
              <span class="c-term" role="rowheader" style="--plans:{m.bars.length}"><b>{m.name}</b><span>{m.said}</span></span>
              {#each m.bars as b (b.id)}
                <span class="c-bar" class:lead={b.id === 'free'} role="cell">
                  <span class="c-plan" aria-hidden="true">{b.name}</span>
                  <span class="track"><span class="fill" style="--w:{b.w}%"></span></span>
                  <span class="c-n num"><span class="sr">{b.name}: </span>{m.amount(b.n)}</span>
                </span>
              {/each}
            </div>
          {/each}
        </div>
        {#if daily > 0}<p class="reading">{p.compareReading(p.automations(daily, word(daily)))}</p>{/if}
        <p class="meta">{p.later}</p>
      </article>
    </div>
  </div>
</section>

<!-- ── On every plan ── -->
<section class="band" aria-labelledby="every-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead reveal">
        <header class="tile-head"><span class="well"><Icon name="check" /></span><h2 class="tile-title" id="every-title">{p.bothTitle}</h2></header>
        <ul class="every">
          {#each p.rows as row, i (row[0])}
            <li>
              <span class="well"><Icon name={ROW_GLYPHS[i] ?? 'check'} /></span>
              <span class="b-name">{row[0]}</span>
              <span class="b-val">{valueOf(row)}</span>
              {#if row[0] === 'Backups' && kept(row[1]) > 0}
                <span class="copies" role="img" aria-label={p.backupsLabel(kept(row[1]))}>
                  {#each Array.from({ length: kept(row[1]) }, (_, n) => n) as n (n)}<i class:new={n === kept(row[1]) - 1}></i>{/each}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </article>
    </div>
  </div>
</section>

<!-- ── Questions ── -->
<section class="band" aria-labelledby="faq-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead reveal">
        <header class="tile-head"><span class="well"><Icon name="help" /></span><h2 class="tile-title" id="faq-title">{p.faqTitle}</h2></header>
        <dl class="faq">
          {#each p.faq as f (f.q)}
            <div>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          {/each}
        </dl>
      </article>
    </div>
  </div>
</section>

<!-- ── The close ── -->
<section class="band" aria-labelledby="close-title">
  <div class="in">
    <div class="tiles">
      <div class="tile lead close reveal">
        <div class="close-words">
          <h2 class="h2" id="close-title">{site.closing.title}</h2>
          <p class="lede">{site.closing.body}</p>
        </div>
        <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{site.closing.primary}<Icon name="arrow" size="s" /></a>
      </div>
    </div>
  </div>
</section>

<style>
  /* ── Free ────────────────────────────────────────────────────────────── */

  .price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
  }

  .price .figure {
    font-size: var(--t-lead);
    line-height: 40px;
  }

  .summary {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--ink);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  .summary :global(svg) {
    margin-block-start: 2px;
    color: var(--ink2);
  }

  .points {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .points li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  .points li :global(svg) {
    color: var(--ink);
  }

  .cta {
    align-self: flex-start;
    margin-block-start: auto;
  }

  /* ── For pros: quieter, a line a plan ────────────────────────────────── */

  .pros-lead {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 22px;
  }

  .paid {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .paid li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px var(--sp-3);
    align-items: center;
    padding-block: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  .pd-top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-3);
    grid-column: 1 / -1;
  }

  .pd-name {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .pd-price {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .pd-price .meta {
    font-weight: 400;
  }

  .pd-line,
  .pd-points {
    grid-column: 1;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  .pd-points {
    color: var(--dim);
  }

  .pd-cta {
    grid-column: 2;
    grid-row: 2 / span 2;
  }

  /* ── The bars ────────────────────────────────────────────────────────── */

  .compare {
    display: grid;
  }

  /* A METER: its name down the left, beside one bar a plan, the plans in the order the page offers them. */
  .c-row {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 6px var(--sp-5);
    align-items: center;
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--line);
  }

  .c-term {
    display: grid;
    grid-row: 1 / span var(--plans);
    gap: 2px;
  }

  .c-term b {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .c-term span {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .c-bar {
    grid-column: 2;
    display: grid;
    grid-template-columns: 6.5em minmax(0, 1fr) 11em;
    align-items: center;
    gap: var(--sp-3);
  }

  .c-plan {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .track {
    display: block;
    block-size: 10px;
    background: var(--s1);
    border-radius: var(--r-pill);
  }

  .fill {
    display: block;
    inline-size: var(--w);
    min-inline-size: 6px;
    block-size: 100%;
    background: var(--dim);
    border-radius: var(--r-pill);
  }

  .c-n {
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  /* FREE IS THE INK BAR, the plan the page leads with; the paid plans are the grey ones beside it. */
  .c-bar.lead .c-plan,
  .c-bar.lead .c-n {
    color: var(--ink);
    font-weight: 600;
  }

  .c-bar.lead .fill {
    background: var(--ink);
  }

  /* ── On every plan ───────────────────────────────────────────────────── */

  .every {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--sp-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .every li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding-block: 10px;
    border-block-start: 1px solid var(--line);
  }

  .b-name {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  .b-val {
    margin-inline-start: auto;
    color: var(--ink2);
    font-size: var(--t-site-small);
    text-align: end;
  }

  /* The thirty nightly copies, the newest in ink at the right. */
  .copies {
    display: flex;
    flex-basis: 100%;
    gap: 2px;
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  .copies i {
    flex: 1;
    max-inline-size: 8px;
    block-size: 12px;
    background: var(--line);
    border-radius: 2px;
  }

  .copies i.new {
    background: var(--ink);
  }

  /* ── Questions ───────────────────────────────────────────────────────── */

  .faq {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-5) var(--sp-6);
    margin: 0;
  }

  .faq dt {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 24px;
  }

  .faq dd {
    margin: var(--sp-1) 0 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 22px;
  }

  /* ── The close ───────────────────────────────────────────────────────── */

  .close {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }

  .close-words {
    display: grid;
    gap: var(--sp-3);
  }

  /* ── Narrower than a desk ────────────────────────────────────────────── */

  @media (width < 1100px) {
    .faq {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width < 900px) {
    .c-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .c-term {
      grid-row: auto;
      margin-block-end: var(--sp-1);
    }

    .c-bar {
      grid-column: 1;
    }

    .every {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 640px) {
    .faq {
      grid-template-columns: minmax(0, 1fr);
    }

    .c-bar {
      grid-template-columns: 5.5em minmax(0, 1fr) 8.5em;
      gap: var(--sp-2);
    }

    .cta {
      align-self: stretch;
    }

    .paid li {
      grid-template-columns: minmax(0, 1fr);
    }

    .pd-cta {
      grid-column: 1;
      grid-row: auto;
      justify-self: start;
    }
  }
</style>
