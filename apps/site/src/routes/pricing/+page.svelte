<script lang="ts">
  /**
   * Pricing.
   *
   * TWO PLANS, WHAT EACH INCLUDES, AND WHAT MORE COSTS, on the owner's ask of 26 September
   * (`loop/DIRECTION.md` §33): "include the credits/usages offered on the plans, show extra usage
   * pricings, add another extended plan". Every figure is read from `plans.ts`, which is the one file
   * to edit when a price or an allowance changes.
   *
   *   plans     the two cards, each with its allowance.
   *   usage     the full table, allowances first and then what else differs.
   *   extra     the price of each unit past the plan, off until the owner turns it on.
   *   faq       the six questions a buyer asks before paying.
   */
  import Icon from '$lib/Icon.svelte';
  import { SIGNUP, site } from '$lib/copy.ts';
  import { EXTRA, PACKS, PLANS, USAGE } from '$lib/plans.ts';

  const p = site.pricing;
  const cols = PLANS.map((x) => x.name);
</script>

<svelte:head>
  <title>{site.meta.pricing.title}</title>
  <meta name="description" content={site.meta.pricing.description} />
  <link rel="canonical" href="https://brain.dog/pricing" />
  <meta property="og:url" content="https://brain.dog/pricing" />
  <meta property="og:title" content={site.meta.pricing.title} />
  <meta property="og:description" content={site.meta.pricing.description} />
</svelte:head>

<section class="head" data-ground="page" aria-labelledby="pricing-h1">
  <div class="in">
    <div class="intro">
      <h1 class="display" id="pricing-h1">{p.title}</h1>
      <p class="sub">{p.sub}</p>
    </div>

    <div class="plans">
      {#each PLANS as plan (plan.id)}
        <article class="plan" data-featured={plan.id === 'cloud' ? '' : undefined} aria-labelledby="plan-{plan.id}">
          <div class="plan-top">
            <h2 class="plan-name" id="plan-{plan.id}">{plan.name}</h2>
            {#if plan.id === 'cloud'}<span class="flag">{p.popular}</span>{/if}
          </div>
          <p class="plan-price">
            <span class="plan-figure num">{plan.price}</span>
            <span class="plan-unit">{plan.unit}</span>
          </p>
          <p class="plan-for">{plan.for}</p>
          <a
            class="btn btn-lg"
            class:btn-primary={plan.id === 'cloud'}
            href={plan.href}
            rel={plan.external ? 'external' : undefined}>{plan.cta}<Icon name="arrow" size="s" /></a
          >

          <div class="inc">
            <h3 class="inc-title">{p.included}</h3>
            <ul class="inc-list">
              {#each USAGE as u (u.key)}
                <li><span>{u.name}</span><b class="num">{u.unit(plan.allowance[u.key])}</b></li>
              {/each}
            </ul>
          </div>

          <ul class="plan-points">
            {#each plan.points as point (point)}
              <li><span class="tick"><Icon name="check" size="s" /></span>{point}</li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>
  </div>
</section>

<section class="sec" id="usage" data-ground="page" aria-labelledby="usage-title">
  <div class="in">
    <div class="sec-head">
      <h2 class="h2" id="usage-title">{p.usageTitle}</h2>
      <p class="lede">{p.usageLead}</p>
    </div>

    <div class="table" role="table" aria-labelledby="usage-title">
      <div class="trow thead" role="row">
        <span class="cell term" role="columnheader"><span class="sr">What</span></span>
        {#each cols as c (c)}<span class="cell" role="columnheader">{c}</span>{/each}
      </div>
      {#each USAGE as u (u.key)}
        <div class="trow" role="row">
          <span class="cell term" role="rowheader"><b>{u.name}</b><small>{u.said}</small></span>
          {#each PLANS as plan (plan.id)}
            <span class="cell num" role="cell"><span class="of" aria-hidden="true">{plan.name}</span>{u.unit(plan.allowance[u.key])}</span>
          {/each}
        </div>
      {/each}
      {#each p.rows as row (row[0])}
        <div class="trow" role="row">
          <span class="cell term" role="rowheader"><b>{row[0]}</b></span>
          {#each row.slice(1) as cell, i}
            <span class="cell" role="cell"><span class="of" aria-hidden="true">{cols[i]}</span>{cell}</span>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</section>

<section class="sec" id="extra" data-ground="sunk" aria-labelledby="extra-title">
  <div class="in">
    <h2 class="h2" id="extra-title">{p.extraTitle}</h2>
    <div class="extra">
      <div class="need-col">
        <h3 class="need-title"><span class="k" aria-hidden="true">/</span>{p.packsTitle}</h3>
        <p class="need-lead">{p.packsLead}</p>
        <ul class="packs">
          {#each PACKS as pack (pack.credits)}
            <li class="pack">
              <span class="pack-n num">{p.packsPer(pack.credits)}</span>
              <span class="pack-price num">{pack.price}</span>
            </li>
          {/each}
        </ul>
      </div>
      <div class="need-col">
        <h3 class="need-title">{p.extraUsageTitle}</h3>
        <p class="need-lead">{p.extraLead}</p>
        <ul class="extra-list">
          {#each EXTRA as e (e.name)}
            <li><span class="e-name">{e.name}</span><span class="e-price num">{e.price}</span><span class="e-per">{e.per}</span></li>
          {/each}
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="sec" data-ground="page" aria-labelledby="faq-title">
  <div class="in">
    <h2 class="h2" id="faq-title">{p.faqTitle}</h2>
    <dl class="faq">
      {#each p.faq as f (f.q)}
        <div>
          <dt>{f.q}</dt>
          <dd>{f.a}</dd>
        </div>
      {/each}
    </dl>
    <div class="end">
      <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{site.closing.primary}<Icon name="arrow" size="s" /></a>
    </div>
  </div>
</section>

<style>
  .head {
    padding-block: clamp(56px, 7vw, 104px) clamp(72px, 8vw, 120px);
  }

  .intro {
    display: grid;
    justify-items: center;
    gap: var(--sp-5);
    text-align: center;
  }

  .display {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(2.375rem, 4.7vw, 4.25rem);
    font-weight: 600;
    line-height: var(--lh-3xl);
    letter-spacing: var(--tr-tight);
    text-wrap: balance;
  }

  .sub {
    max-inline-size: 58ch;
    margin: 0;
    color: var(--ink2);
    font-size: clamp(1rem, 0.95rem + 0.3vw, 1.125rem);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* ── The three cards ─────────────────────────────────────────────────── */

  .plans {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
    max-inline-size: 880px;
    margin: clamp(var(--sp-7), 6vw, 80px) auto 0;
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-6);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 20px;
  }

  .plan[data-featured] {
    background: var(--s3);
    border-color: var(--ink);
    box-shadow: var(--e3);
  }

  @media (prefers-color-scheme: dark) {
    .plan[data-featured] {
      background: var(--s1);
      border-color: var(--edge);
    }
  }

  .plan-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .plan-name {
    margin: 0;
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: 0;
  }

  .flag {
    padding: 3px 10px;
    background: var(--accent);
    border-radius: var(--r-pill);
    color: var(--accent-ink);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .plan-price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
  }

  .plan-figure {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(2.75rem, 2vw + 2rem, 3.5rem);
    font-weight: 600;
    letter-spacing: -0.045em;
    line-height: 1;
  }

  .plan-unit {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .plan-for {
    margin: 0;
    min-block-size: 3.2em;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .plan .btn {
    align-self: stretch;
  }

  .inc {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  .inc-title {
    margin: 0 0 var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .inc-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .inc-list li {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .inc-list b {
    color: var(--ink);
    font-weight: 600;
    text-align: end;
  }

  .plan-points {
    display: grid;
    gap: var(--sp-2);
    margin: auto 0 0;
    padding: var(--sp-4) 0 0;
    border-block-start: 1px solid var(--line);
    list-style: none;
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .plan-points li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    line-height: 1.45;
  }

  .tick {
    display: flex;
    align-items: center;
    block-size: 1.45em;
    color: var(--earn);
  }

  /* ── The table ───────────────────────────────────────────────────────── */

  .table {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 1fr));
    margin-block-start: var(--sp-7);
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
  }

  .trow {
    display: contents;
  }

  .cell {
    padding: var(--sp-4) var(--sp-5);
    border-block-start: 1px solid var(--line);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 1.5;
  }

  .thead .cell {
    border-block-start: 0;
    background: var(--s1);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .term {
    display: grid;
    gap: 2px;
  }

  .term b {
    font-weight: 600;
  }

  .term small {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .of {
    display: none;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── Extra usage ──────────────────────────────────────────────────────── */

  .extra {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: var(--sp-6);
    align-items: start;
    margin-block-start: var(--sp-7);
  }

  .need-col {
    display: grid;
    gap: var(--sp-3);
  }

  .need-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .need-lead {
    margin: 0 0 var(--sp-2);
    max-inline-size: 52ch;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
  }

  .k {
    display: grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    background: var(--accent);
    border-radius: 7px;
    color: var(--accent-ink);
    font-family: var(--font-display);
    font-size: 13px;
  }

  .packs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pack {
    display: grid;
    gap: var(--sp-3);
    padding: var(--sp-5);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 16px;
  }

  .pack-n {
    color: var(--ink2);
    font-size: var(--t-base);
    font-weight: 500;
  }

  .pack-price {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .extra-list {
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 16px;
  }

  .extra-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 9.5rem;
    gap: var(--sp-4);
    align-items: baseline;
    padding: var(--sp-4) var(--sp-5);
  }

  .extra-list li + li {
    border-block-start: 1px solid var(--line);
  }

  .e-name {
    color: var(--ink);
  }

  .e-price {
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .e-per {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ── Questions ────────────────────────────────────────────────────────── */

  .faq {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-7) var(--sp-8);
    margin: var(--sp-7) 0 0;
  }

  .faq div {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  dt {
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .end {
    display: flex;
    justify-content: center;
    margin-block-start: var(--sp-8);
  }

  @media (width < 1000px) {
    .plans {
      grid-template-columns: minmax(0, 1fr);
      max-inline-size: 560px;
      margin-inline: auto;
    }

    .extra {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-6);
    }
  }

  @media (width < 760px) {
    .table {
      grid-template-columns: minmax(0, 1fr);
    }

    .thead {
      display: none;
    }

    .term {
      background: var(--s1);
    }

    .cell:not(.term) {
      display: grid;
      grid-template-columns: 7rem minmax(0, 1fr);
      gap: var(--sp-3);
      padding-block: var(--sp-2);
      border-block-start: 0;
    }

    .of {
      display: block;
    }

    .faq {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-5);
    }

    .extra-list li {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .e-per {
      grid-column: 1 / -1;
      margin-block-start: -6px;
    }
  }

  @media (width < 640px) {
    .plan {
      padding: var(--sp-5);
    }

    .cell {
      padding-inline: var(--sp-4);
    }
  }
</style>
